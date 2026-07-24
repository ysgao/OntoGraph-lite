import type { DiagramNode, DiagramEdge, LayoutDirection } from './diagramModel';
import { insertDummyNodes } from './dummyNodes';
import { assignLayerCoordinates } from './layerCoordinates';
import { reduceCrossings } from './layerOrdering';

export interface LayoutPosition {
  x: number;
  y: number;
  depth: number;
}

/** Plain `{x,y}` shape mirroring `diagramGeometry.ts`'s `Position` — redeclared locally rather
 *  than imported to avoid a cross-module dependency in the "core layout" direction
 *  (`diagramGeometry.ts` already depends on this module's output; the reverse would be a cycle). */
export interface Position { x: number; y: number; }

// Spacing along the DEPTH axis (rows in TB, columns in LR) — must clear the node's own extent
// along that axis plus enough gap for a bus stem (`diagramGeometry.ts`'s BUS_GAP). TB's depth
// axis is screen-vertical, so it's sized against NODE_HEIGHT (56); LR's is screen-horizontal,
// sized against NODE_WIDTH (160) — hence the two constants differ rather than one being reused.
const ROW_HEIGHT = 140;

// COLUMN_WIDTH is wider than the TB/ROW_HEIGHT analogy alone would suggest: it also has to leave
// `computeBusGroupPlacements`'s bus-lane separation enough headroom to give EVERY
// genuinely-conflicting pair of parents in one layer its own distinct height, not just as many as
// happen to fit before a shared ceiling. LR is this feature's default direction
// (`generateUmlDiagram.ts`), and a real, densely-fanned-out layer there can have well over a
// dozen sibling parents (confirmed against the real middle-ear-structure sample: 14 parent
// groups, 19 conflicting pairs) — at the old spacing (gap 100), only ~3 distinct lane heights fit
// before the `MIN_FINAL_STEM` ceiling, so 3 GENUINELY unrelated parent pairs (different targets,
// no shared child) still landed at the identical bus height, reading as one merged line. This
// wider gap gives ~14 lanes of headroom, verified as enough to resolve every genuine conflict in
// that same sample down to zero, leaving only LEGITIMATE height-sharing (non-overlapping spans,
// or a genuinely shared child). Widening `ROW_HEIGHT` by the same proportion was tried too, but
// reintroduced a real node/edge overlap elsewhere in that same sample — TB isn't this feature's
// default direction and has no equivalent verified need, so it's left unchanged rather than
// widened speculatively.
const COLUMN_WIDTH = 400;

// Spacing along the CROSS axis (columns of siblings in TB, rows of siblings in LR) — sized
// against the node's extent on THAT axis instead: TB's cross axis is screen-horizontal (against
// NODE_WIDTH), LR's is screen-vertical (against NODE_HEIGHT). Every real node reserves exactly
// one of these slots regardless of position in the tree (root, internal, or leaf) — this is what
// makes node-node overlap structurally impossible rather than merely checked-and-clamped.
const SLOT_WIDTH = 170;
const SLOT_HEIGHT = 90;

// A dummy node stands in for the "pass-through" segment of a multi-layer edge at one
// intermediate layer — it never needs a full node-sized reservation, just enough room for a
// routed line plus clearance, so it reserves a visibly thinner slot than a real node.
const DUMMY_SLOT_WIDTH = 40;
const DUMMY_SLOT_HEIGHT = 24;

const LEFT_MARGIN = 40;

interface InternalLayoutResult {
  realPositions: Map<string, LayoutPosition>;
  /** Per far-spanning edge (`DiagramEdge.id`), the ordered list of its intermediate dummy-node
   *  positions (one per layer it passes through), in final `direction`-aware coordinates. Empty
   *  or absent for an edge that spans at most one layer. Internal — never returned by
   *  `computeLayout()` itself; only `computeFarEdgeRoutes()` exposes it (see
   *  `contracts/layout-module-contract.md`). */
  dummyPositionsByEdge: Map<string, Position[]>;
}

/**
 * Layered graph layout, following `LayeredGraphAlgorithm.md`'s ordering/coordinate-assignment
 * approach: layer (depth) assignment is untouched — `src/uml/depthNormalization.ts`'s
 * longest-path rule already gives every node a layer relative to root — but CROSS-axis placement
 * now works layer-by-layer rather than node-by-node:
 *
 * 1. Multi-layer edges (parent and child more than one layer apart) are expanded into a chain of
 *    dummy nodes, one per intermediate layer (`insertDummyNodes`) — this is what lets those edges
 *    reserve real cross-axis space at every layer they pass through, instead of being routed
 *    reactively around whatever real nodes happen to already be there.
 * 2. Each layer's occupants (real nodes AND dummies) are given an initial deterministic order,
 *    built by propagating from the topmost layer downward: each occupant's next-layer "hops" (its
 *    real children, kind-clustered, or a dummy's own single chain continuation) are appended in
 *    turn. Any node never reached this way (unreachable from root, spec FR-007) is appended at
 *    its own layer as a deterministic fallback.
 * 3. That initial order is then improved by `reduceCrossings` (`layerOrdering.ts`), an alternating
 *    median/barycenter sweep that reorders each layer using its neighbors' positions and keeps
 *    whichever full-diagram ordering has the fewest counted edge crossings (spec FR-004) —
 *    superseding the old local "shared child" clustering, which could only see a crossing caused
 *    by two siblings under the SAME parent, not one caused by non-adjacent parents' shared
 *    descendants further down the tree.
 * 4. Cross-axis coordinates are assigned per layer, in that final order, via a running cumulative
 *    sum (`assignLayerCoordinates`) — a position is a sum, not a value that gets checked and
 *    clamped afterward, so two occupants in the same layer can never overlap by construction.
 *
 * Direct ancestors of the root (`partOfGraph.ts`'s one-hop ancestor pre-pass, negative depth) are
 * a special case handled the same way as before: centered symmetrically on the root's own cross
 * position as a final override, since they're never reached via the propagation above (the edge
 * runs ancestor -> root, not the other way).
 */
function computeInternal(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection,
): InternalLayoutResult {
  const flowSpacing = direction === 'LR' ? COLUMN_WIDTH : ROW_HEIGHT;
  const crossSpacing = direction === 'LR' ? SLOT_HEIGHT : SLOT_WIDTH;
  const dummyCrossSpacing = direction === 'LR' ? DUMMY_SLOT_HEIGHT : DUMMY_SLOT_WIDTH;

  const depthByIri = new Map(nodes.map(n => [n.iri, n.depth]));

  // A parent frequently has BOTH composition and generalization children at once (e.g. an
  // anatomical whole with a part-of breakdown AND laterality-qualified subtypes) — clustering
  // same-kind children together (rather than the raw edge-declaration order, which can
  // interleave the two kinds) keeps each kind's cross-axis span from overlapping the other's when
  // `diagramGeometry.ts` draws their two separate bus groups.
  const kindOrder: Record<DiagramEdge['kind'], number> = { composition: 0, generalization: 1 };
  const edgesByParent = new Map<string, DiagramEdge[]>();
  for (const e of edges) {
    let list = edgesByParent.get(e.parentIri);
    if (!list) { list = []; edgesByParent.set(e.parentIri, list); }
    list.push(e);
  }

  const rawChildrenByParentByKind = new Map<string, Map<DiagramEdge['kind'], string[]>>();
  for (const [parentIri, parentEdges] of edgesByParent) {
    const byKind = new Map<DiagramEdge['kind'], string[]>();
    for (const kind of Object.keys(kindOrder) as DiagramEdge['kind'][]) {
      const children: string[] = [];
      for (const e of parentEdges) {
        if (e.kind !== kind) { continue; }
        // A shared child (multiple qualifying parents, FR-005) must not get more than one
        // ordering-slot allocation from THIS parent — de-dup per parent's own child list only.
        if (!children.includes(e.childIri)) { children.push(e.childIri); }
      }
      byKind.set(kind, children);
    }
    rawChildrenByParentByKind.set(parentIri, byKind);
  }

  // --- Dummy-node insertion (LayeredGraphAlgorithm.md §2) ---
  const { dummies, chainsByEdgeId } = insertDummyNodes(nodes, edges);
  const dummyById = new Map(dummies.map(d => [d.id, d]));

  // For each real parent, its ordered list of NEXT-LAYER hops: a real child (kind-clustered —
  // composition before generalization, so `diagramGeometry.ts`'s two separate bus groups never
  // interleave) when the edge is adjacent, or the FIRST dummy in that edge's chain when the edge
  // spans more than one layer (the child itself only appears as the LAST dummy's own next hop, or
  // directly if the edge needed no dummies at all). Relative order AMONG a parent's own children
  // beyond kind-clustering is left as declaration order here — the crossing-minimization sweep
  // below reorders every layer globally, which subsumes and supersedes the old local
  // same-parent-only "shared child" clustering (spec FR-004).
  const nextHopByOccupant = new Map<string, string[]>();
  for (const [parentIri, byKind] of rawChildrenByParentByKind) {
    const nextHops: string[] = [];
    for (const kind of Object.keys(kindOrder) as DiagramEdge['kind'][]) {
      for (const childIri of byKind.get(kind) ?? []) {
        const e = (edgesByParent.get(parentIri) ?? []).find(x => x.kind === kind && x.childIri === childIri);
        if (!e) { continue; }
        const chain = chainsByEdgeId.get(e.id);
        const firstHop = chain ? chain[1] : childIri;
        if (!nextHops.includes(firstHop)) { nextHops.push(firstHop); }
      }
    }
    nextHopByOccupant.set(parentIri, nextHops);
  }
  // A dummy's own next hop is exactly the next id in its owning edge's chain (one-to-one).
  for (const chain of chainsByEdgeId.values()) {
    for (let i = 1; i < chain.length - 1; i++) {
      nextHopByOccupant.set(chain[i], [chain[i + 1]]);
    }
  }

  // --- Per-layer ordering, propagated top-down (LayeredGraphAlgorithm.md §3's "initial order") ---
  const allLayers = new Set<number>();
  for (const n of nodes) { allLayers.add(n.depth); }
  for (const d of dummies) { allLayers.add(d.layer); }
  const sortedLayers = [...allLayers].sort((a, b) => a - b);

  const layerOrder = new Map<number, string[]>();
  const placed = new Set<string>();

  if (sortedLayers.length > 0) {
    const topLayer = sortedLayers[0];
    const topOccupants = nodes.filter(n => n.depth === topLayer).map(n => n.iri);
    layerOrder.set(topLayer, topOccupants);
    for (const id of topOccupants) { placed.add(id); }
  }

  for (let li = 1; li < sortedLayers.length; li++) {
    const layer = sortedLayers[li];
    const prevOrder = layerOrder.get(sortedLayers[li - 1]) ?? [];
    const order: string[] = [];
    for (const occupant of prevOrder) {
      for (const hop of nextHopByOccupant.get(occupant) ?? []) {
        const hopLayer = dummyById.has(hop) ? dummyById.get(hop)!.layer : depthByIri.get(hop);
        if (hopLayer !== layer || placed.has(hop)) { continue; }
        order.push(hop);
        placed.add(hop);
      }
    }
    // Unreachable-node fallback (spec FR-007, Edge Case): a real node at this layer never reached
    // via any parent->child hop above still gets a deterministic slot rather than being dropped.
    for (const n of nodes) {
      if (n.depth === layer && !placed.has(n.iri)) {
        order.push(n.iri);
        placed.add(n.iri);
      }
    }
    layerOrder.set(layer, order);
  }

  // --- Crossing-minimization sweep (LayeredGraphAlgorithm.md §3, spec FR-004) ---
  const optimizedOrder = reduceCrossings({ sortedLayers, initialOrder: layerOrder, nextHopByOccupant });

  // --- Cumulative-sum coordinate assignment (LayeredGraphAlgorithm.md §4) ---
  const widthById = new Map<string, number>();
  for (const n of nodes) { widthById.set(n.iri, crossSpacing); }
  for (const d of dummies) { widthById.set(d.id, dummyCrossSpacing); }

  const cross = assignLayerCoordinates(optimizedOrder, widthById, 0, LEFT_MARGIN);

  // Direct ancestors of the root (`partOfGraph.ts`'s one-hop ancestor pre-pass, depth < 0) are
  // never reached by the propagation above (the edge runs ancestor -> root, not the other way) —
  // center them as a group on root's own cross position instead, symmetric about it, spaced the
  // same as ordinary siblings, exactly as before this rewrite.
  const root = nodes.find(n => n.depth === 0);
  if (root) {
    const rootCross = cross.get(root.iri);
    if (rootCross !== undefined) {
      const ancestors = nodes.filter(n => n.depth < 0);
      ancestors.forEach((n, i) => {
        cross.set(n.iri, rootCross + (i - (ancestors.length - 1) / 2) * crossSpacing);
      });
    }
  }

  // Centering ancestors on root can push their cross value below the left margin — shift every
  // node's (and dummy's) cross value forward just enough to clear the margin. Adding a constant
  // to every value preserves all pairwise separations, so this can never introduce an overlap.
  const crossValues = [...cross.values()];
  if (crossValues.length > 0) {
    const minCross = Math.min(...crossValues);
    if (minCross < LEFT_MARGIN) {
      const shift = LEFT_MARGIN - minCross;
      for (const [id, v] of cross) { cross.set(id, v + shift); }
    }
  }

  // A direct ancestor of the root is given a negative depth so it never shares a row/column with
  // the root's own descendants — but the flow coordinate must still be non-negative (rendered as
  // an absolute-positioned pixel offset), so shift every row/column forward by however far below
  // zero the minimum depth's would otherwise be.
  const minDepth = Math.min(0, ...nodes.map(n => n.depth));
  const flowOffset = -minDepth * flowSpacing;

  const realPositions = new Map<string, LayoutPosition>();
  for (const n of nodes) {
    const flow = n.depth * flowSpacing + flowOffset;
    const crossVal = cross.get(n.iri) ?? LEFT_MARGIN;
    const pos = direction === 'LR' ? { x: flow, y: crossVal } : { x: crossVal, y: flow };
    realPositions.set(n.iri, { ...pos, depth: n.depth });
  }

  const dummyPositionsByEdge = new Map<string, Position[]>();
  for (const [edgeId, chain] of chainsByEdgeId) {
    const dummyIds = chain.slice(1, -1);
    const points = dummyIds.map((id) => {
      const layer = dummyById.get(id)!.layer;
      const flow = layer * flowSpacing + flowOffset;
      const crossVal = cross.get(id) ?? LEFT_MARGIN;
      return direction === 'LR' ? { x: flow, y: crossVal } : { x: crossVal, y: flow };
    });
    dummyPositionsByEdge.set(edgeId, points);
  }

  return { realPositions, dummyPositionsByEdge };
}

/**
 * Computes each real node's diagram-space position. Signature and return type are unchanged from
 * before this feature (`contracts/layout-module-contract.md`) — dummy nodes and per-edge routing
 * are entirely internal; use `computeFarEdgeRoutes` for the latter.
 *
 * `direction` picks which screen axis is "flow" (depth) and which is "cross" (siblings): 'TB'
 * (default) maps flow to `y` and cross to `x`; 'LR' maps flow to `x` and cross to `y`.
 */
export function computeLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'TB',
): Map<string, LayoutPosition> {
  return computeInternal(nodes, edges, direction).realPositions;
}

/**
 * Per far-spanning edge (parent and child more than one layer apart), the ordered list of
 * intermediate dummy-node positions that edge's rendered path must pass through to stay clear of
 * every other node's own reserved slot (spec FR-002). Empty for an edge spanning at most one
 * layer — `diagramGeometry.ts` keeps its existing direct bus/elbow routing for those unchanged.
 * Shares `computeLayout()`'s exact internal layering/ordering/coordinate state, so a far edge's
 * dummy positions are always consistent with the real node positions `computeLayout()` returned
 * for the same input.
 */
export function computeFarEdgeRoutes(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'TB',
): Map<string, Position[]> {
  return computeInternal(nodes, edges, direction).dummyPositionsByEdge;
}
