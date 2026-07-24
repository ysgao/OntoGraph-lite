import type { DiagramEdge, LayoutDirection } from './diagramModel';

export interface Position { x: number; y: number; }

/** Swaps x/y — used to convert an 'LR' (left-to-right flow) position into the 'TB' (top-to-bottom
 *  flow) coordinate convention every routing function below is written against, and back again.
 *  Self-inverse: applying it twice is a no-op. See the direction-dispatch wrappers at the bottom
 *  of this file for why this is sufficient (no other axis-specific logic needs to change). */
function transposePosition(p: Position): Position {
  return { x: p.y, y: p.x };
}

/** Swaps every coordinate pair (`"x,y"`) in an SVG path `d` string produced by this module — all
 *  such strings here only ever use `M`/`L` commands with plain numeric coordinates, never curves,
 *  so a regex swap is exact (no path-grammar parsing needed). */
function transposePathD(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_match, a, b) => `${b},${a}`);
}

export interface BoxRect { left: number; top: number; centerX: number; centerY: number; }

/**
 * Converts a node's layout position (`src/uml/layout.ts`) into an absolute box rectangle,
 * respecting the layout convention each direction uses for what x/y represents: 'TB' stores the
 * box's horizontal CENTER in `x` and its top edge in `y` (siblings are centered under their
 * shared row; the row's own top is already the same for all of them); 'LR' stores the left edge
 * in `x` and the vertical CENTER in `y` (the mirror image — columns share a left edge, siblings
 * within a column are centered). Shared by every renderer (`htmlRenderer.ts`, `drawioRenderer.ts`)
 * so box placement can't drift between them.
 */
export function boxRect(pos: Position, direction: LayoutDirection, width: number, height: number): BoxRect {
  if (direction === 'LR') {
    const top = pos.y - height / 2;
    return { left: pos.x, top, centerX: pos.x + width / 2, centerY: pos.y };
  }
  const left = pos.x - width / 2;
  return { left, top: pos.y, centerX: pos.x, centerY: pos.y + height / 2 };
}

export interface ConnectionFractions { exitX: number; exitY: number; entryX: number; entryY: number; }

/**
 * Picks the connection-point pair (as 0..1 fractions of node width/height, matching drawio's
 * `exitX/exitY/entryX/entryY` convention) between two node CENTERS, based on which axis has the
 * larger absolute delta — never assuming "parent is always above child" (spec §8.1: "get the
 * direction right by checking which node is up-left or down-right of the other, not by
 * guessing"), since an ancestor edge can have its "parent" positioned below its "child" given how
 * depth is assigned in `partOfGraph.ts`. Shared by `drawioRenderer.ts` and this module so both
 * renderers agree on edge direction for the same data.
 */
export function pickConnectionFractions(source: Position, target: Position): ConnectionFractions {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0
      ? { exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 } // target below source
      : { exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 }; // target above source
  }
  return dx >= 0
    ? { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 } // target right of source
    : { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 }; // target left of source
}

export interface RenderedSegment {
  /** SVG path `d` attribute. */
  d: string;
  kind: 'composition' | 'generalization';
  /** Set only on the ONE segment per group/edge that should carry the diamond/triangle marker —
   *  'start' for composition (diamond at the parent/whole end, which is the path's first point),
   *  'end' for generalization (triangle at the parent/supertype end, the path's last point). */
  marker?: 'start' | 'end';
  /** True for a "far child" segment (a dual-relationship node not at its bus group's shallowest
   *  row, pushed deep by `renumberDepthsLongestPath` — see `depthNormalization.ts`) — surfaced so
   *  renderers can visually distinguish a long, multi-row span from an ordinary one-row edge,
   *  rather than it reading as a layout glitch. Never set on a near-child/bus/parent-stem segment
   *  or an off-axis bridge. */
  far?: boolean;
}

/**
 * Computes SVG path segments for a UML diagram's edges, mirroring the shared-bus routing in the
 * original hand-built prototypes (`uml-diagram-cli-plan/gen_html_diagram.py`,
 * `gen_html_diagram_liver.py`): when N siblings share the same (parent, kind), draw ONE shared
 * elbow — a single stem from the parent to a horizontal bus, then individual stems from the bus
 * down to each child — rather than N independent lines; the marker lives ONLY on the
 * parent-facing stem, never on a child stem or the bus itself (this is exactly the bug class the
 * original build hit: putting the marker on a child-facing stem produces a marker that visually
 * points at the wrong node).
 *
 * An edge whose child is NOT positioned below the parent (e.g. an inverted ancestor edge, or two
 * nodes in the same row) is excluded from bus grouping entirely and routed independently via
 * `pickConnectionFractions`, exactly as the original build's off-axis bridge edges were handled —
 * corner-to-corner, never folded into a bus meant for a simple vertical case.
 */
/** How far apart (px) to spread multiple groups' parent-exit points when one parent has more
 *  than one kind-group (e.g. both composition and generalization children at once) — without
 *  this, both groups' parent-stems share the exact same coordinates whenever their children land
 *  on the same row (the common case, since siblings of a BFS hop share depth), so the diamond and
 *  triangle markers land exactly on top of each other. */
const PARENT_STEM_SPREAD = 24;

/** How far below the parent's bottom edge to place the shared bus line, at most — NOT a
 *  proportional midpoint of the parent-child gap. A bus group's child can be MORE than one row
 *  below its parent (splice mode collapsing several levels, or a dual-relationship node whose
 *  other parent is deeper — `src/uml/nodeExclusion.ts`'s `renumberDepths`), and a proportional
 *  midpoint would then land the bus's horizontal sweep in the MIDDLE of an intermediate row,
 *  crossing straight through whatever nodes populate it. Anchoring the bus just below the parent
 *  instead keeps it inside the fixed gap between the parent's row and the very next row — a band
 *  no node ever starts within, however many rows the edge as a whole spans.
 *
 *  Set to exactly half of `ROW_HEIGHT - NODE_HEIGHT` (`layout.ts`'s 140 - 56 = 84) — the same
 *  value the ORIGINAL proportional-midpoint formula produced for a normal one-row gap, so the
 *  common case looks identical to before. A smaller value (first tried: 20) left the
 *  parent-to-bus stem barely longer than the diamond/triangle marker itself, making the marker
 *  look like it sat directly on the horizontal bus line with no visible connecting line. */
const BUS_GAP = 42;

function busYFor(pyBottom: number, childTopY: number): number {
  return pyBottom + Math.min(BUS_GAP, (childTopY - pyBottom) / 2);
}

/** How far apart (px) to separate colliding bus LANES vertically — see `computeBusGroupPlacements`.
 *  Distinct from `PARENT_STEM_SPREAD`, which spreads exit points horizontally for groups under
 *  the SAME parent; this instead separates the horizontal bus line itself for groups under
 *  DIFFERENT parents whose spans would otherwise cross. */
const BUS_LANE_SPREAD = 12;

/** How much clearance (px) a lane-shifted bus line must keep above the child row it's about to
 *  enter — without this, enough colliding lanes at one busY bucket could push the bus line down
 *  far enough to visually merge with the child boxes it's routing towards. */
const BUS_LANE_CLEARANCE = 6;

/** Safety bound on `computeBusGroupPlacements`'s "does my bus cross an unrelated group's stem"
 *  push-down pass — bounded for the same reason `MAX_DETOUR_WIDEN_ROUNDS` is: one push can newly
 *  clear one crossing while exposing (or creating) another elsewhere, so a few rounds may be
 *  needed to settle, but this is still a hard backstop against pathological input. */
const MAX_BUS_PUSH_ROUNDS = 20;

interface BusGroupSpec {
  parentIri: string;
  kind: 'composition' | 'generalization';
  childIris: string[];
}

interface BusGroupPlacement {
  /** Parent's exit x, after `PARENT_STEM_SPREAD` (same-parent, multi-kind spread). */
  px: number;
  /** Bus line height, after lane separation (different-parent, colliding-span spread). */
  busY: number;
}

/**
 * Computes each bus group's exit point and bus height, shared by both `computeEdgeSegmentsCore`
 * (webview HTML/SVG) and `computeEdgeRoutesCore` (draw.io/SVG export) so neither can drift from
 * the other. Two independent spreading passes run here, solving two DIFFERENT problems:
 *
 * 1. `PARENT_STEM_SPREAD` (horizontal, at the parent end): a single parent with BOTH composition
 *    AND generalization children at once would otherwise have both groups' stems exit at the
 *    exact same x, landing the diamond and triangle markers on top of each other.
 *
 * 2. Bus-LANE separation (vertical, along the bus line itself): `busYFor()` is a pure function of
 *    row position, so EVERY bus group between the same two rows lands at the identical height —
 *    fine when a single class's own multiple parents converge cleanly on it (a shared child is
 *    the ordinary, intended "shared bus" look, spec-confirmed as not a problem on its own), but
 *    NOT fine when two UNRELATED classes' bus groups (different parents, different children, no
 *    child in common) happen to span overlapping x-ranges at that same height — their horizontal
 *    bus lines then cross or visually merge with each other. Detected as a graph-coloring problem:
 *    two groups only "conflict" if they share NO common child AND their horizontal spans strictly
 *    overlap (touching at a single shared endpoint doesn't count — that's just two lines meeting
 *    at a point, not a crossing). Conflicting groups are assigned to different "lanes" (greedy,
 *    lowest available lane not used by a conflicting neighbor), and each lane after the first gets
 *    pushed `BUS_LANE_SPREAD` further from the parent — clamped so it never encroaches on the
 *    child row itself. Groups with no conflicts (the overwhelming common case) get lane 0, i.e.
 *    their ORIGINAL, unshifted `busYFor()` height — fully backward compatible.
 */
function computeBusGroupPlacements(
  groups: BusGroupSpec[],
  positions: Map<string, Position>,
  nodeHeight: number,
): Map<string, BusGroupPlacement> {
  const keyOf = (g: BusGroupSpec): string => `${g.parentIri}|${g.kind}`;

  const avgChildX = (g: BusGroupSpec): number => {
    const xs = g.childIris.map(c => positions.get(c)!.x);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  const groupsByParentIri = new Map<string, BusGroupSpec[]>();
  for (const g of groups) {
    let list = groupsByParentIri.get(g.parentIri);
    if (!list) { list = []; groupsByParentIri.set(g.parentIri, list); }
    list.push(g);
  }
  const stemOffsetByKey = new Map<string, number>();
  for (const groupsForParent of groupsByParentIri.values()) {
    const n = groupsForParent.length;
    // Order by each group's OWN children's average x — not the arbitrary order edges happened
    // to be discovered in — so the group whose children sit further left gets the LEFTWARD exit
    // offset and vice versa. Assigning offsets by discovery order instead (e.g. always
    // composition-first) can put a group's exit point on the opposite side from where its own
    // children/bus actually are, forcing its stem to needlessly cross the other group's stem on
    // the way down (reported against a real diagram — see the FR-011 dual-kind-group case below).
    const sorted = [...groupsForParent].sort((a, b) => avgChildX(a) - avgChildX(b));
    sorted.forEach((g, idx) => {
      stemOffsetByKey.set(keyOf(g), n > 1 ? (idx - (n - 1) / 2) * PARENT_STEM_SPREAD : 0);
    });
  }

  interface Natural {
    key: string;
    px: number;
    naturalBusY: number;
    childTopY: number;
    minX: number;
    maxX: number;
    childIris: Set<string>;
  }
  const naturals: Natural[] = groups.map(g => {
    const key = keyOf(g);
    const parentPos = positions.get(g.parentIri)!;
    const px = parentPos.x + (stemOffsetByKey.get(key) ?? 0);
    const pyBottom = parentPos.y + nodeHeight;
    const childPositions = g.childIris.map(c => positions.get(c)!);
    const childTopY = Math.min(...childPositions.map(c => c.y));
    const xs = childPositions.map(c => c.x);
    return {
      key, px, naturalBusY: busYFor(pyBottom, childTopY), childTopY,
      minX: Math.min(px, ...xs), maxX: Math.max(px, ...xs),
      childIris: new Set(g.childIris),
    };
  });

  // Groups landing at a DIFFERENT natural height can't visually collide with each other — bucket
  // by exact natural busY so lane assignment only ever compares groups that would otherwise share
  // a height.
  const byNaturalBusY = new Map<number, Natural[]>();
  for (const n of naturals) {
    let bucket = byNaturalBusY.get(n.naturalBusY);
    if (!bucket) { bucket = []; byNaturalBusY.set(n.naturalBusY, bucket); }
    bucket.push(n);
  }

  const busYByKey = new Map<string, number>();
  for (const bucket of byNaturalBusY.values()) {
    const n = bucket.length;
    const conflicts: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bucket[i], b = bucket[j];
        const sharesChild = [...a.childIris].some(c => b.childIris.has(c));
        const spansOverlap = a.minX < b.maxX && b.minX < a.maxX;
        if (!sharesChild && spansOverlap) { conflicts[i][j] = conflicts[j][i] = true; }
      }
    }

    const order = bucket.map((_, i) => i).sort((x, y) => bucket[x].minX - bucket[y].minX);
    const laneByIndex = new Map<number, number>();
    for (const i of order) {
      const usedLanes = new Set<number>();
      for (let j = 0; j < n; j++) {
        if (conflicts[i][j] && laneByIndex.has(j)) { usedLanes.add(laneByIndex.get(j)!); }
      }
      let lane = 0;
      while (usedLanes.has(lane)) { lane++; }
      laneByIndex.set(i, lane);
    }

    bucket.forEach((item, i) => {
      const lane = laneByIndex.get(i)!;
      const shifted = item.naturalBusY + lane * BUS_LANE_SPREAD;
      busYByKey.set(item.key, Math.min(shifted, item.childTopY - BUS_LANE_CLEARANCE));
    });
  }

  // The lane pass above only ever compares groups sharing the exact same NATURAL busY (same
  // row-transition) — but the horizontal bus line itself can be far wider than that: a bus
  // reaching a distant child sweeps across x at ITS OWN height regardless of what other groups'
  // rows are, and an unrelated group's vertical STEM spans a Y-RANGE (not a single point), so it
  // can still contain this bus's height even when the two groups' natural busY VALUES differ
  // entirely (reported: a wide composition bus crossed several unrelated classes' own
  // parent-facing marker stems, none of which shared its natural bus height at all). Push a
  // group's busY further from its parent, in the same increments the lane pass uses, whenever its
  // span crosses ANOTHER group's stem — re-checking every group each round, since one push can
  // newly clear (or newly create) a crossing elsewhere. A shared child is exempt, same as
  // everywhere else: two DIFFERENT parents converging cleanly on one child is the intended look.
  // Only a group with a REAL bus (more than one x) ever gets pushed here — a degenerate,
  // single-child group has no horizontal line to cross anything with, so it's always the
  // stationary "obstacle" side, never the "mover" side, which is what keeps this loop from ever
  // having two groups chase each other's height back and forth (see `BUS_LANE_CLEARANCE`'s use
  // below for the OTHER half of why this stays stable).
  const childIrisByKey = new Map(groups.map(g => [keyOf(g), new Set(g.childIris)]));
  for (let round = 0; round < MAX_BUS_PUSH_ROUNDS; round++) {
    const stems: Array<{ left: number; right: number; top: number; bottom: number; key: string; childIri?: string }> = [];
    for (const n of naturals) {
      const busY = busYByKey.get(n.key)!;
      const parentPos = positions.get(groups.find(g => keyOf(g) === n.key)!.parentIri)!;
      const pyBottom = parentPos.y + nodeHeight;
      stems.push({ left: n.px - STEM_OBSTACLE_MARGIN, right: n.px + STEM_OBSTACLE_MARGIN, top: Math.min(busY, pyBottom), bottom: Math.max(busY, pyBottom), key: n.key });
      for (const childIri of childIrisByKey.get(n.key) ?? []) {
        const c = positions.get(childIri)!;
        stems.push({ left: c.x - STEM_OBSTACLE_MARGIN, right: c.x + STEM_OBSTACLE_MARGIN, top: Math.min(busY, c.y), bottom: Math.max(busY, c.y), key: n.key, childIri });
      }
    }
    let anyPushed = false;
    for (const n of naturals) {
      if (n.minX === n.maxX) { continue; } // no horizontal bus line to cross anything with
      const busY = busYByKey.get(n.key)!;

      // A PARENT stem's own bottom bound is, by construction, that OTHER group's own busY
      // exactly (`Math.max(busY, pyBottom)` — pyBottom is fixed, so the stem's own upper reach
      // IS its busY). Without a clearance margin here, "push until just past this stem" walks my
      // busY to exactly equal that group's height — recreating the same-height collision the
      // lane pass exists to prevent, since a strict `>` check treats landing exactly on the
      // boundary as "already clear." The margin forces a genuine gap instead of a knife-edge one,
      // and — critically — that group is a stationary target here (a group with no crossing of
      // its own, e.g. a degenerate single-child span, never gets pushed by this loop at all), so
      // there's nothing to chase: only the wide/crossing side ever moves.
      const stemCrossing = stems.some(s => s.key !== n.key
        // Exempt the OTHER group's stem — parent-facing OR any specific child-facing one — the
        // moment the two GROUPS share ANY child, not just when this particular stem happens to be
        // tagged with a childIri that's shared: a group's own parent-stem carries no childIri at
        // all, so checking only the tagged stem missed the common "two groups sharing a child
        // also share a bus" case entirely (a false-positive push between them, since converging on
        // a shared child cleanly is the intended look, not a crossing).
        && ![...(childIrisByKey.get(s.key) ?? [])].some(c => n.childIris.has(c))
        && s.left < n.maxX && s.right > n.minX
        && (s.top - BUS_LANE_CLEARANCE) < busY && (s.bottom + BUS_LANE_CLEARANCE) > busY);

      if (!stemCrossing) { continue; }

      const pushed = Math.min(busY + BUS_LANE_SPREAD, n.childTopY - BUS_LANE_CLEARANCE);
      if (pushed > busY) {
        busYByKey.set(n.key, pushed);
        anyPushed = true;
      }
    }
    if (!anyPushed) { break; }
  }

  const placements = new Map<string, BusGroupPlacement>();
  for (const n of naturals) {
    placements.set(n.key, { px: n.px, busY: busYByKey.get(n.key)! });
  }
  return placements;
}

/** Drops consecutive duplicate points from a waypoint chain. A bus-routed edge whose child sits
 *  at the exact same x as the parent (the common single-child case, or any child directly below
 *  a `PARENT_STEM_SPREAD`-adjusted exit point) would otherwise emit two IDENTICAL waypoints —
 *  the reported "the line to the diamond/triangle looks broken" bug: a degenerate zero-length
 *  segment in the middle of the polyline confuses mxGraph's marker placement on the adjoining
 *  segment. */
function dedupeConsecutive(points: Position[]): Position[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

/**
 * Expands a raw waypoint chain (anchor -> dummy positions -> anchor, `src/uml/layout.ts`'s
 * `computeFarEdgeRoutes`) into a fully elbowed polyline: between any two consecutive points that
 * differ on BOTH axes, jogs through the midpoint y between them (`LayeredGraphAlgorithm.md` §5)
 * rather than a diagonal — that midpoint band is always empty since a dummy (or real node)
 * occupies only its own reserved slot at its own row, never the gap between rows. Used for a
 * multi-layer ("far") edge in place of the reactive `computeSafeJogY`/`computeStemDetour` search:
 * the dummy positions already reserve real, guaranteed-clear space at every intermediate layer, so
 * no obstacle search is needed at all.
 */
function elbowExpand(waypoints: Position[]): Position[] {
  if (waypoints.length === 0) { return []; }
  const out: Position[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const next = waypoints[i];
    if (prev.x !== next.x && prev.y !== next.y) {
      const midY = (prev.y + next.y) / 2;
      out.push({ x: prev.x, y: midY }, { x: next.x, y: midY });
    }
    out.push(next);
  }
  return dedupeConsecutive(out);
}

/** Clearance (px) kept between a detoured stem and the obstacle box it routes around. */
const OBSTACLE_CLEARANCE = 10;

/** Clearance (px) kept on either side of ANOTHER group's stem line (`StemObstacle`) — these are
 *  effectively zero-width, so a small fixed margin stands in for a "box" around them. */
const STEM_OBSTACLE_MARGIN = 8;

/** A different bus group's OWN line — a vertical stem (parent-facing or child-facing) OR the
 *  horizontal bus itself — computed from its NAIVE (un-detoured) straight-line position, see
 *  `collectStemObstacles`. Represented as a thin rectangle (narrow along whichever axis the line
 *  runs, full extent along the other) so the SAME rectangle-overlap check in `computeStemDetour`
 *  handles both a vertical stem crossing another vertical descent AND a vertical descent crossing
 *  a completely unrelated group's HORIZONTAL bus band (the gap this fixes: only the two vertical
 *  legs were tracked before, never the connecting horizontal bus line itself, so a long
 *  multi-row descent could sail straight through an unrelated bus's horizontal sweep undetected).
 *  `childIri` is set only for a child-facing stem (undefined for a parent stem or the shared
 *  horizontal bus) — used to exempt two DIFFERENT groups converging on the SAME shared child (a
 *  dual-relationship node, FR-011) from being treated as obstacles to each other, mirroring the
 *  same "a shared child's own multiple parents converging is fine" exemption already applied to
 *  bus-height lane separation (`computeBusGroupPlacements`) — that convergence is the intended
 *  look, not a crossing to route around. */
interface StemObstacle { left: number; right: number; top: number; bottom: number; groupKey: string; childIri?: string; }

/** Half-thickness (px) given to the horizontal bus line itself when treated as an obstacle for
 *  OTHER groups' vertical descents — mirrors `STEM_OBSTACLE_MARGIN`'s role for vertical stems. */
const BUS_OBSTACLE_MARGIN = 8;

/**
 * Collects every bus group's own lines — both stems AND the horizontal bus connecting them — in
 * their NAIVE (straight, un-detoured) form, for use as additional obstacles when computing a
 * DIFFERENT group's detour. Naive rather than final positions to avoid a circular dependency
 * (group A's detour would need group B's final detour, which might need group A's) — using the
 * straight-line approximation is enough to break a crossing in practice: if two lines would have
 * crossed at their naive positions, at least one of them detours around the other's naive line,
 * and the box-avoidance detour already computed separately keeps it clear of any node boxes
 * regardless.
 */
function collectStemObstacles(
  groups: Array<{ key: string; parentIri: string; childIris: string[] }>,
  placements: Map<string, BusGroupPlacement>,
  positions: Map<string, Position>,
  nodeHeight: number,
): StemObstacle[] {
  const obstacles: StemObstacle[] = [];
  for (const g of groups) {
    const { px, busY } = placements.get(g.key)!;
    const pyBottom = positions.get(g.parentIri)!.y + nodeHeight;
    obstacles.push({
      left: px - STEM_OBSTACLE_MARGIN, right: px + STEM_OBSTACLE_MARGIN,
      top: Math.min(busY, pyBottom), bottom: Math.max(busY, pyBottom), groupKey: g.key,
    });

    const childXs = g.childIris.map(c => positions.get(c)!.x);
    const busMinX = Math.min(px, ...childXs);
    const busMaxX = Math.max(px, ...childXs);
    if (busMinX !== busMaxX) {
      obstacles.push({
        left: busMinX, right: busMaxX,
        top: busY - BUS_OBSTACLE_MARGIN, bottom: busY + BUS_OBSTACLE_MARGIN, groupKey: g.key,
      });
    }

    for (const childIri of g.childIris) {
      const c = positions.get(childIri)!;
      obstacles.push({
        left: c.x - STEM_OBSTACLE_MARGIN, right: c.x + STEM_OBSTACLE_MARGIN,
        top: Math.min(busY, c.y), bottom: Math.max(busY, c.y), groupKey: g.key, childIri,
      });
    }
  }
  return obstacles;
}

/** Safety bound on `computeStemDetour`'s widening loop — generous enough to escape a genuinely
 *  dense cluster of sibling obstacles (each round can surface at most one previously-undiscovered
 *  obstacle, so a tightly packed row of several classes can legitimately need more than a
 *  handful of rounds), while still being a hard backstop against pathological input. */
const MAX_DETOUR_WIDEN_ROUNDS = 20;

interface DetourObstacle { left: number; right: number; top: number; bottom: number; }

/**
 * A bus group's per-child vertical descent (from the bus height down to the child's own top
 * edge) normally travels straight down at the child's fixed x — safe for the ordinary one-row
 * case, since no OTHER node's box can occupy the narrow gap between two adjacent rows. But a
 * child can be MORE than one row below its bus (the same multi-row-span cases `BUS_GAP`'s own
 * doc comment already calls out: splice-mode level-collapsing, or a dual-relationship node whose
 * other parent is deeper) — and when it is, the straight vertical line can pass directly through
 * an UNRELATED node that happens to sit in an intermediate row at that same x, visually crossing
 * that node's own box (reported: a composition edge from "Tympanic cavity" down past "Ostium of
 * eustachian tube" to "Tympanic/Pharyngeal ostium of eustachian tube", which are Ostium's own
 * generalization children one row further down). Routing around the node's BOX alone isn't
 * always enough, though — a follow-up report showed the detour could still cross that
 * intervening node's OWN separate stem (its incoming/outgoing edge), since a stem can run outside
 * the node's own box (e.g. one more row further up/down). `stemObstacles` (from
 * `collectStemObstacles`) extends the same detection to those thin vertical lines too.
 *
 * A single-pass "detour to the nearer edge of whatever's at childX" isn't quite enough either: the
 * chosen detour x can itself land on a DIFFERENT, previously-undetected obstacle (a node box or
 * another stem that wasn't at childX, only at the detour position). So this widens iteratively —
 * after picking a candidate side, it re-checks whether THAT position also hits something new, and
 * if so folds it into the excluded zone and recomputes, up to `MAX_DETOUR_WIDEN_ROUNDS` — rather
 * than stopping after the first obstacle found only at the original straight-line position.
 *
 * Returns the intermediate waypoints (in `fromY` → `toY` order) needed to jog the descent clear of
 * everything in the way, or an empty array when nothing is — the overwhelming common case, so
 * ordinary single-row edges are entirely unaffected.
 */
function computeStemDetour(
  childX: number,
  fromY: number,
  toY: number,
  excludeIris: Set<string>,
  positions: Map<string, Position>,
  nodeWidth: number,
  nodeHeight: number,
  stemObstacles: StemObstacle[],
  ownGroupKey: string,
  ownChildIri: string,
): Position[] {
  const top = Math.min(fromY, toY);
  const bottom = Math.max(fromY, toY);

  // A NORMAL one-row gap always measures at most BUS_GAP from bus to child (busYFor caps at
  // exactly that distance for a one-row case; lane separation only ever shrinks it further, never
  // grows it) — and nothing can ever legitimately occupy that narrow band, by construction. Only
  // a genuine multi-row span (which measures MORE than BUS_GAP) can have another node/stem in its
  // way, so only THOSE ever attempt a detour. Without this guard, an ordinary one-row edge (e.g. a
  // class's own single ancestor edge) could still go looking for obstacles and find a coincidental
  // false-positive collision with some UNRELATED multi-row edge's own (not-yet-detoured) stem
  // passing nearby — producing a needless detour on an edge that never needed one (reported: an
  // extra bend appearing on a class's own ancestor edge, caused by a completely different
  // composition edge's undetoured stem happening to sit close by).
  if (bottom - top <= BUS_GAP) { return []; }

  // Every obstacle whose vertical span overlaps this stem's (top, bottom) range AT ALL — not yet
  // filtered by x, since a candidate detour position needs to be checked against ALL of these,
  // not just whichever one(s) happened to sit at the original childX.
  const candidates: DetourObstacle[] = [];
  for (const [iri, pos] of positions) {
    if (excludeIris.has(iri)) { continue; }
    const boxTop = pos.y;
    const boxBottom = pos.y + nodeHeight;
    if (boxTop < bottom && boxBottom > top) {
      candidates.push({ left: pos.x - nodeWidth / 2, right: pos.x + nodeWidth / 2, top: boxTop, bottom: boxBottom });
    }
  }
  for (const stem of stemObstacles) {
    if (stem.groupKey === ownGroupKey) { continue; }
    if (stem.childIri === ownChildIri) { continue; } // shared-child convergence — not a crossing
    if (stem.top < bottom && stem.bottom > top) {
      candidates.push({ left: stem.left, right: stem.right, top: stem.top, bottom: stem.bottom });
    }
  }

  const hitting = (x: number): DetourObstacle[] => candidates.filter(o => x >= o.left && x <= o.right);

  const initialHits = hitting(childX);
  if (initialHits.length === 0) { return []; }

  const initialBounds = {
    left: Math.min(...initialHits.map(o => o.left)),
    right: Math.max(...initialHits.map(o => o.right)),
    top: Math.min(...initialHits.map(o => o.top)),
    bottom: Math.max(...initialHits.map(o => o.bottom)),
  };

  // Widens FULLY committing to one side (never reconsidering direction mid-loop), so both sides
  // can be compared on their own merits afterward — see `computeStemDetour`'s own doc comment for
  // why committing early to whichever side looks cheaper against the FIRST obstacle isn't enough:
  // that side might turn out to hide an entire cluster of further obstacles the other side never
  // has, and a per-round "whichever is currently cheaper" re-evaluation still never explores the
  // side it didn't start on. Two DIFFERENT things can be in the way each round: (1) the vertical
  // detourX column hits something new, or (2) the horizontal jog segments THEMSELVES —
  // entering/exiting the detour, at enterY/exitY, spanning from childX to detourX — cross some
  // THIRD obstacle that never sat at childX or at detourX, only somewhere in between (reported: a
  // return jog sailed through several unrelated sibling classes' stems that a vertical-only check
  // never looked for, since they weren't at either endpoint x).
  function widenOneSide(side: 'left' | 'right'): { detourX: number; top: number; bottom: number } {
    let { left, right, top: mTop, bottom: mBottom } = initialBounds;
    let detourX = side === 'left' ? left - OBSTACLE_CLEARANCE : right + OBSTACLE_CLEARANCE;

    const isNew = (o: DetourObstacle): boolean => !(o.left >= left && o.right <= right && o.top >= mTop && o.bottom <= mBottom);

    for (let round = 0; round < MAX_DETOUR_WIDEN_ROUNDS; round++) {
      detourX = side === 'left' ? left - OBSTACLE_CLEARANCE : right + OBSTACLE_CLEARANCE;

      const enterY = fromY <= toY ? mTop - OBSTACLE_CLEARANCE : mBottom + OBSTACLE_CLEARANCE;
      const exitY = fromY <= toY ? mBottom + OBSTACLE_CLEARANCE : mTop - OBSTACLE_CLEARANCE;
      const spanLeft = Math.min(childX, detourX);
      const spanRight = Math.max(childX, detourX);

      const verticalHits = hitting(detourX).filter(isNew);
      const horizontalHits = candidates.filter(o => o.left < spanRight && o.right > spanLeft
        && ((o.top < enterY && o.bottom > enterY) || (o.top < exitY && o.bottom > exitY)))
        .filter(isNew);

      const newlyHit = [...verticalHits, ...horizontalHits];
      if (newlyHit.length === 0) { break; }

      left = Math.min(left, ...newlyHit.map(o => o.left));
      right = Math.max(right, ...newlyHit.map(o => o.right));
      mTop = Math.min(mTop, ...newlyHit.map(o => o.top));
      mBottom = Math.max(mBottom, ...newlyHit.map(o => o.bottom));
    }

    return { detourX, top: mTop, bottom: mBottom };
  }

  const leftResult = widenOneSide('left');
  const rightResult = widenOneSide('right');
  const chosen = (childX - leftResult.detourX) <= (rightResult.detourX - childX) ? leftResult : rightResult;

  // enterY/exitY are named relative to travel FROM fromY TO toY — for the common descending case
  // (fromY smaller) enterY sits just above the obstacle and exitY just below it; the reverse
  // (ascending, used by the generalization direction) is handled by the caller reversing the
  // returned array rather than by this function knowing about edge direction.
  const enterY = fromY <= toY ? chosen.top - OBSTACLE_CLEARANCE : chosen.bottom + OBSTACLE_CLEARANCE;
  const exitY = fromY <= toY ? chosen.bottom + OBSTACLE_CLEARANCE : chosen.top - OBSTACLE_CLEARANCE;

  return [
    { x: childX, y: enterY },
    { x: chosen.detourX, y: enterY },
    { x: chosen.detourX, y: exitY },
    { x: childX, y: exitY },
  ];
}

/**
 * For a "far" child — one that does NOT sit at its bus group's own shallowest row (a
 * dual-relationship node, FR-011, whose OTHER parent is one or more rows deeper) — computes how
 * far down the parent's own exit column (at `px`) the descent must travel before it's safe to jog
 * sideways toward `childX` at all, rather than jogging immediately at the group's ordinary
 * `busYFor()` height. A same-row sibling's own incoming stem can occupy the ENTIRE gap between
 * the parent's row and the next one (reported against real anatomy.owl: "Tympanic cavity"'s
 * composition edge to its dual-relationship child swept its early leftward jog straight through
 * "Ostium of eustachian tube"'s own incoming stem, sitting in the row directly below) — pushing
 * the bus height down (as `computeBusGroupPlacements`'s existing lane-separation pass already
 * tries) cannot fix this on its own when that blocking span covers the whole row-to-row gap, so
 * the far child instead descends past it BEFORE turning, exactly as it would if it weren't
 * sharing a parent with any same-row siblings at all.
 *
 * Deliberately a NEW, separate function rather than a generalization of `computeStemDetour`
 * itself: `computeStemDetour` already widens sideways from a fixed column and is shared by every
 * ordinary (same-row) child — this only ever runs for the rarer far-child case, so it can afford
 * to be simpler (push straight down, no left/right exploration) without risking the far more
 * common path.
 */
function computeSafeJogY(
  px: number,
  childX: number,
  pyBottom: number,
  childY: number,
  excludeIris: Set<string>,
  positions: Map<string, Position>,
  nodeWidth: number,
  nodeHeight: number,
  stemObstacles: StemObstacle[],
  ownGroupKey: string,
): number {
  if (px === childX) { return busYFor(pyBottom, childY); } // no horizontal jog — nothing to push down for

  const spanLeft = Math.min(px, childX);
  const spanRight = Math.max(px, childX);

  const obstacles: DetourObstacle[] = [];
  for (const [iri, pos] of positions) {
    if (excludeIris.has(iri)) { continue; }
    obstacles.push({ left: pos.x - nodeWidth / 2, right: pos.x + nodeWidth / 2, top: pos.y, bottom: pos.y + nodeHeight });
  }
  for (const stem of stemObstacles) {
    if (stem.groupKey === ownGroupKey) { continue; }
    obstacles.push({ left: stem.left, right: stem.right, top: stem.top, bottom: stem.bottom });
  }

  let jogY = busYFor(pyBottom, childY);
  for (let round = 0; round < MAX_DETOUR_WIDEN_ROUNDS; round++) {
    let maxBottom = -Infinity;
    for (const o of obstacles) {
      // The horizontal jog itself, at the current candidate height...
      const crossesJog = o.left < spanRight && o.right > spanLeft && o.top < jogY && o.bottom > jogY;
      // ...or the vertical descent at px leading up to it, from the parent's own bottom edge.
      const crossesColumn = px > o.left && px < o.right && o.top < jogY && o.bottom > pyBottom;
      if (crossesJog || crossesColumn) { maxBottom = Math.max(maxBottom, o.bottom); }
    }
    if (maxBottom === -Infinity) { break; }
    const pushed = Math.min(maxBottom + OBSTACLE_CLEARANCE, childY - OBSTACLE_CLEARANCE);
    if (pushed <= jogY) { break; }
    jogY = pushed;
  }
  return jogY;
}

/**
 * Direction-aware entry point: for 'LR' it transposes positions and node dimensions into the
 * 'TB' convention `computeEdgeSegmentsCore` is written against, runs the exact same routing
 * logic, then transposes the resulting path coordinates back — see the `transposePosition`/
 * `transposePathD` helpers above for why a plain axis swap is sufficient (the two directions
 * store the same flow/cross quantities, just assigned to opposite screen axes).
 */
export function computeEdgeSegments(
  positions: Map<string, Position>,
  edges: DiagramEdge[],
  nodeWidth: number,
  nodeHeight: number,
  direction: LayoutDirection = 'TB',
  farEdgeRoutes?: Map<string, Position[]>,
): RenderedSegment[] {
  if (direction === 'LR') {
    const transposed = new Map([...positions].map(([iri, p]) => [iri, transposePosition(p)]));
    const transposedRoutes = farEdgeRoutes
      && new Map([...farEdgeRoutes].map(([id, pts]) => [id, pts.map(transposePosition)]));
    return computeEdgeSegmentsCore(transposed, edges, nodeHeight, nodeWidth, transposedRoutes)
      .map(seg => ({ ...seg, d: transposePathD(seg.d) }));
  }
  return computeEdgeSegmentsCore(positions, edges, nodeWidth, nodeHeight, farEdgeRoutes);
}

function computeEdgeSegmentsCore(
  positions: Map<string, Position>,
  edges: DiagramEdge[],
  nodeWidth: number,
  nodeHeight: number,
  farEdgeRoutes?: Map<string, Position[]>,
): RenderedSegment[] {
  const segments: RenderedSegment[] = [];

  interface Group {
    parentIri: string;
    kind: 'composition' | 'generalization';
    childIris: string[];
    edgeIdByChild: Map<string, string>;
  }
  const busGroups = new Map<string, Group>();
  const offAxis: DiagramEdge[] = [];

  for (const e of edges) {
    const p = positions.get(e.parentIri);
    const c = positions.get(e.childIri);
    if (!p || !c) { continue; } // defensive: never render a dangling edge

    if (c.y >= p.y + nodeHeight) {
      const key = `${e.parentIri}|${e.kind}`;
      let g = busGroups.get(key);
      if (!g) { g = { parentIri: e.parentIri, kind: e.kind, childIris: [], edgeIdByChild: new Map() }; busGroups.set(key, g); }
      g.childIris.push(e.childIri);
      g.edgeIdByChild.set(e.childIri, e.id);
    } else {
      offAxis.push(e);
    }
  }

  const groupList = [...busGroups.entries()].map(([key, g]) => ({ key, ...g }));
  const placements = computeBusGroupPlacements(groupList, positions, nodeHeight);
  const stemObstacles = collectStemObstacles(groupList, placements, positions, nodeHeight);

  for (const [groupKey, g] of busGroups) {
    const { px, busY } = placements.get(groupKey)!;
    const pyBottom = positions.get(g.parentIri)!.y + nodeHeight;

    // A "far" child — one that does NOT sit at the group's own shallowest row (a
    // dual-relationship node, FR-011, whose OTHER parent is deeper) — is excluded from the shared
    // bus and routed independently via `computeSafeJogY`: folding it into the same bus as its
    // same-row siblings drags the bus's own span out toward the far child's x, and the straight
    // sweep at the ordinary busY height can cross a same-row sibling's own incoming stem sitting
    // directly below the parent (reported against real anatomy.owl). A near child's rendering
    // (bus line, marker) is completely unaffected — only the group's own x-span narrows to just
    // its near children.
    const minChildY = Math.min(...g.childIris.map(c => positions.get(c)!.y));
    const nearChildIris = g.childIris.filter(c => positions.get(c)!.y === minChildY);
    const farChildIris = g.childIris.filter(c => positions.get(c)!.y !== minChildY);

    const xs = nearChildIris.map(c => positions.get(c)!.x);
    const busMinX = Math.min(px, ...xs);
    const busMaxX = Math.max(px, ...xs);

    segments.push(
      g.kind === 'composition'
        ? { d: `M${px},${pyBottom} L${px},${busY}`, kind: 'composition', marker: 'start' }
        : { d: `M${px},${busY} L${px},${pyBottom}`, kind: 'generalization', marker: 'end' },
    );

    if (busMinX !== busMaxX) {
      segments.push({ d: `M${busMinX},${busY} L${busMaxX},${busY}`, kind: g.kind });
    }

    for (const childIri of nearChildIris) {
      const c = positions.get(childIri)!;
      const detour = computeStemDetour(
        c.x, busY, c.y, new Set([g.parentIri, childIri]), positions, nodeWidth, nodeHeight, stemObstacles, groupKey, childIri,
      );
      const points = [{ x: c.x, y: busY }, ...detour, { x: c.x, y: c.y }];
      segments.push({ d: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '), kind: g.kind });
    }

    for (const childIri of farChildIris) {
      const c = positions.get(childIri)!;
      const edgeId = g.edgeIdByChild.get(childIri);
      const dummyPoints = edgeId ? farEdgeRoutes?.get(edgeId) : undefined;

      let points: Position[];
      if (dummyPoints && dummyPoints.length > 0) {
        // Structural routing (spec FR-002): the edge's dummy-node chain already reserves real,
        // guaranteed-clear space at every intermediate layer — no obstacle search needed.
        points = elbowExpand([{ x: px, y: pyBottom }, ...dummyPoints, { x: c.x, y: c.y }]);
      } else {
        // Defensive fallback (should not normally trigger for a genuinely multi-layer edge, since
        // `layout.ts`'s `computeFarEdgeRoutes` always produces a dummy chain for one): the
        // original reactive detour search.
        const excludeIris = new Set([g.parentIri, childIri]);
        const safeJogY = computeSafeJogY(
          px, c.x, pyBottom, c.y, excludeIris, positions, nodeWidth, nodeHeight, stemObstacles, groupKey,
        );
        const detour = computeStemDetour(
          c.x, safeJogY, c.y, excludeIris, positions, nodeWidth, nodeHeight, stemObstacles, groupKey, childIri,
        );
        points = [{ x: px, y: pyBottom }, { x: px, y: safeJogY }, { x: c.x, y: safeJogY }, ...detour, { x: c.x, y: c.y }];
      }
      segments.push({ d: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '), kind: g.kind, far: true });
    }
  }

  for (const e of offAxis) {
    const p = positions.get(e.parentIri);
    const c = positions.get(e.childIri);
    if (!p || !c) { continue; }
    segments.push(renderBridge(p, c, e.kind, nodeWidth, nodeHeight));
  }

  return segments;
}

export interface EdgeRoute {
  sourceIri: string;
  targetIri: string;
  exitX: number;
  exitY: number;
  entryX: number;
  entryY: number;
  /** Intermediate elbow points (absolute diagram-space pixels, NOT fractions) between the
   *  source exit and target entry. Drawing straight segments through
   *  source-exit -> points[0] -> points[1] -> ... -> target-entry reproduces the exact
   *  shared-bus routing `computeEdgeSegments` draws for the HTML/SVG renderer. This exists
   *  for the drawio exporter: leaving edge routing to mxGraph's own automatic
   *  `orthogonalEdgeStyle` connector (which has no notion of sibling boxes) let an edge's
   *  line cut straight through an unrelated node box whenever that box sat between the
   *  edge's fixed exit/entry perimeter points — the reported "edges overlap the class
   *  boxes" bug. Supplying the same explicit via-points as the HTML renderer sidesteps
   *  mxGraph's router entirely. */
  points: Position[];
  /** Mirrors `RenderedSegment.far` — true when this edge's child is a "far child" (a
   *  dual-relationship node not at its bus group's shallowest row), false for an ordinary
   *  near-child or off-axis/bridge edge. */
  far: boolean;
}

/**
 * Per-edge counterpart to `computeEdgeSegments`: instead of visual path segments (which may be
 * shared across several edges in a bus group and aren't keyed by edge id), returns one explicit
 * route per `DiagramEdge.id` — the exact elbow points that edge's line must pass through to
 * avoid crossing sibling boxes. Mirrors the same bus-grouping/off-axis-bridge logic as
 * `computeEdgeSegments`; kept as a separate function (rather than derived from its segment
 * output) since a segment's endpoints alone don't retain which original edge(s) they belong to.
 *
 * Direction-aware, mirroring `computeEdgeSegments`'s transpose-in/transpose-out wrapper: for
 * 'LR', positions and dimensions are swapped into the 'TB' convention before calling
 * `computeEdgeRoutesCore`, and the resulting fractions/points are swapped back. Swapping
 * `exitX/exitY` (and `entryX/entryY`) as pairs is exactly the fraction-space equivalent of
 * swapping a point's `x`/`y` — a canonical bottom-center (`0.5, 1`) becomes right-center
 * (`1, 0.5`), which is the correct LR exit side for the same logical edge.
 */
export function computeEdgeRoutes(
  positions: Map<string, Position>,
  edges: DiagramEdge[],
  nodeWidth: number,
  nodeHeight: number,
  direction: LayoutDirection = 'TB',
  farEdgeRoutes?: Map<string, Position[]>,
): Map<string, EdgeRoute> {
  if (direction === 'LR') {
    const transposed = new Map([...positions].map(([iri, p]) => [iri, transposePosition(p)]));
    const transposedRoutes = farEdgeRoutes
      && new Map([...farEdgeRoutes].map(([id, pts]) => [id, pts.map(transposePosition)]));
    const coreRoutes = computeEdgeRoutesCore(transposed, edges, nodeHeight, nodeWidth, transposedRoutes);
    const routes = new Map<string, EdgeRoute>();
    for (const [id, r] of coreRoutes) {
      routes.set(id, {
        ...r,
        exitX: r.exitY, exitY: r.exitX,
        entryX: r.entryY, entryY: r.entryX,
        points: r.points.map(transposePosition),
      });
    }
    return routes;
  }
  return computeEdgeRoutesCore(positions, edges, nodeWidth, nodeHeight, farEdgeRoutes);
}

function computeEdgeRoutesCore(
  positions: Map<string, Position>,
  edges: DiagramEdge[],
  nodeWidth: number,
  nodeHeight: number,
  farEdgeRoutes?: Map<string, Position[]>,
): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>();

  interface Group { parentIri: string; kind: 'composition' | 'generalization'; groupEdges: DiagramEdge[]; }
  const busGroups = new Map<string, Group>();
  const offAxis: DiagramEdge[] = [];

  for (const e of edges) {
    const p = positions.get(e.parentIri);
    const c = positions.get(e.childIri);
    if (!p || !c) { continue; } // defensive: never route a dangling edge

    if (c.y >= p.y + nodeHeight) {
      const key = `${e.parentIri}|${e.kind}`;
      let g = busGroups.get(key);
      if (!g) { g = { parentIri: e.parentIri, kind: e.kind, groupEdges: [] }; busGroups.set(key, g); }
      g.groupEdges.push(e);
    } else {
      offAxis.push(e);
    }
  }

  const groupSpecs: Array<BusGroupSpec & { key: string }> = [...busGroups.entries()].map(([key, g]) => ({
    key, parentIri: g.parentIri, kind: g.kind, childIris: g.groupEdges.map(e => e.childIri),
  }));
  const placements = computeBusGroupPlacements(groupSpecs, positions, nodeHeight);
  const stemObstacles = collectStemObstacles(groupSpecs, placements, positions, nodeHeight);

  for (const [groupKey, g] of busGroups) {
    const parentPos = positions.get(g.parentIri)!;
    const { px, busY } = placements.get(groupKey)!;
    const pyBottom = parentPos.y + nodeHeight;
    const exitX = 0.5 + (px - parentPos.x) / nodeWidth;

    // See the matching comment in `computeEdgeSegmentsCore` — a "far" child (dual-relationship,
    // FR-011, not at the group's own shallowest row) is routed independently: descend at the
    // parent's own exit column past whatever's in the way before jogging toward it, rather than
    // jogging immediately at the group's ordinary busY height alongside its same-row siblings.
    const minChildY = Math.min(...g.groupEdges.map(e => positions.get(e.childIri)!.y));

    for (const e of g.groupEdges) {
      const c = positions.get(e.childIri)!;
      const isFar = c.y !== minChildY;
      const dummyPoints = isFar ? farEdgeRoutes?.get(e.id) : undefined;

      let forwardPoints: Position[]; // parent-exit-anchor -> ... -> (just before target entry)
      if (dummyPoints && dummyPoints.length > 0) {
        // Structural routing (spec FR-002): route through the edge's dummy-node chain, which
        // already reserves real, guaranteed-clear space at every intermediate layer.
        const expanded = elbowExpand([{ x: px, y: pyBottom }, ...dummyPoints, { x: c.x, y: c.y }]);
        forwardPoints = expanded.slice(0, -1);
      } else {
        const excludeIris = new Set([g.parentIri, e.childIri]);
        const jogY = isFar
          ? computeSafeJogY(px, c.x, pyBottom, c.y, excludeIris, positions, nodeWidth, nodeHeight, stemObstacles, groupKey)
          : busY;
        const detour = computeStemDetour(
          c.x, jogY, c.y, excludeIris, positions, nodeWidth, nodeHeight, stemObstacles, groupKey, e.childIri,
        );
        const farPrefix = isFar ? [{ x: px, y: pyBottom }] : [];
        forwardPoints = dedupeConsecutive([...farPrefix, { x: px, y: jogY }, { x: c.x, y: jogY }, ...detour]);
      }

      if (g.kind === 'composition') {
        routes.set(e.id, {
          sourceIri: e.parentIri, targetIri: e.childIri,
          exitX, exitY: 1, entryX: 0.5, entryY: 0,
          points: forwardPoints,
          far: isFar,
        });
      } else {
        routes.set(e.id, {
          sourceIri: e.childIri, targetIri: e.parentIri,
          exitX: 0.5, exitY: 0, entryX: exitX, entryY: 1,
          points: [...forwardPoints].reverse(),
          far: isFar,
        });
      }
    }
  }

  for (const e of offAxis) {
    const p = positions.get(e.parentIri);
    const c = positions.get(e.childIri);
    if (!p || !c) { continue; }

    const sourceIri = e.kind === 'composition' ? e.parentIri : e.childIri;
    const targetIri = e.kind === 'composition' ? e.childIri : e.parentIri;
    const [sourcePos, targetPos] = e.kind === 'composition' ? [p, c] : [c, p];
    const frac = pickConnectionFractions(sourcePos, targetPos);
    const sx = sourcePos.x - nodeWidth / 2 + frac.exitX * nodeWidth;
    const sy = sourcePos.y + frac.exitY * nodeHeight;
    const tx = targetPos.x - nodeWidth / 2 + frac.entryX * nodeWidth;
    const ty = targetPos.y + frac.entryY * nodeHeight;
    const dx = tx - sx;
    const dy = ty - sy;
    const points = dedupeConsecutive(Math.abs(dy) >= Math.abs(dx)
      ? [{ x: sx, y: (sy + ty) / 2 }, { x: tx, y: (sy + ty) / 2 }]
      : [{ x: (sx + tx) / 2, y: sy }, { x: (sx + tx) / 2, y: ty }]);

    routes.set(e.id, { sourceIri, targetIri, exitX: frac.exitX, exitY: frac.exitY, entryX: frac.entryX, entryY: frac.entryY, points, far: false });
  }

  return routes;
}

/** One independent corner-to-corner path for an off-axis/bridge edge (spec §8.2). */
function renderBridge(
  parent: Position,
  child: Position,
  kind: 'composition' | 'generalization',
  w: number,
  h: number,
): RenderedSegment {
  // Composition: path drawn parent(whole) -> child(part), marker-start at parent.
  // Generalization: path drawn child(subtype) -> parent(supertype), marker-end at parent.
  const [sourcePos, targetPos] = kind === 'composition' ? [parent, child] : [child, parent];

  const frac = pickConnectionFractions(sourcePos, targetPos);
  const sx = sourcePos.x - w / 2 + frac.exitX * w;
  const sy = sourcePos.y + frac.exitY * h;
  const tx = targetPos.x - w / 2 + frac.entryX * w;
  const ty = targetPos.y + frac.entryY * h;

  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.abs(dy) >= Math.abs(dx)
    ? `M${sx},${sy} L${sx},${(sy + ty) / 2} L${tx},${(sy + ty) / 2} L${tx},${ty}`
    : `M${sx},${sy} L${(sx + tx) / 2},${sy} L${(sx + tx) / 2},${ty} L${tx},${ty}`;

  return { d, kind, marker: kind === 'composition' ? 'start' : 'end' };
}
