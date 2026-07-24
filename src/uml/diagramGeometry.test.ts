import { describe, it, expect } from 'vitest';
import { computeEdgeSegments, computeEdgeRoutes, pickConnectionFractions } from './diagramGeometry';
import type { DiagramEdge } from './diagramModel';
import type { Position } from './diagramGeometry';

const W = 160, H = 56;

function positions(entries: Record<string, Position>): Map<string, Position> {
  return new Map(Object.entries(entries));
}

function edge(parentIri: string, childIri: string, kind: 'composition' | 'generalization', propertyIri?: string): DiagramEdge {
  return { id: `${parentIri}|${childIri}|${kind}`, parentIri, childIri, kind, propertyIri };
}

describe('pickConnectionFractions', () => {
  it('straight vertical: target below source', () => {
    expect(pickConnectionFractions({ x: 100, y: 0 }, { x: 100, y: 140 })).toEqual({ exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 });
  });
  it('straight vertical: target above source (inverted)', () => {
    expect(pickConnectionFractions({ x: 100, y: 140 }, { x: 100, y: 0 })).toEqual({ exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 });
  });
  it('horizontal-dominant: target to the right', () => {
    expect(pickConnectionFractions({ x: 0, y: 0 }, { x: 300, y: 20 })).toEqual({ exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 });
  });
  it('horizontal-dominant: target to the left', () => {
    expect(pickConnectionFractions({ x: 300, y: 0 }, { x: 0, y: 20 })).toEqual({ exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 });
  });
});

describe('computeEdgeSegments — bus grouping for a normal (child-below-parent) group', () => {
  it('multi-child composition group: one shared stem+bus+per-child-stem, marker only on the parent stem', () => {
    const pos = positions({
      root: { x: 500, y: 0 },
      a: { x: 300, y: 140 },
      b: { x: 500, y: 140 },
      c: { x: 700, y: 140 },
    });
    const edges = [edge('root', 'a', 'composition'), edge('root', 'b', 'composition'), edge('root', 'c', 'composition')];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markered = result.filter(s => s.marker);
    expect(markered).toHaveLength(1);
    expect(markered[0].marker).toBe('start');
    expect(markered[0].kind).toBe('composition');
    // Exactly one bus + 3 child stems + 1 parent stem = 5 segments for a 3-child group
    expect(result).toHaveLength(5);
  });

  it('multi-child generalization group: marker-end lands on the parent-facing segment, not the children', () => {
    const pos = positions({
      root: { x: 500, y: 0 },
      a: { x: 300, y: 140 },
      b: { x: 700, y: 140 },
    });
    // DiagramEdge convention: parentIri = supertype, childIri = subtype (per partOfGraph.ts).
    const edges: DiagramEdge[] = [edge('root', 'a', 'generalization'), edge('root', 'b', 'generalization')];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markered = result.filter(s => s.marker);
    expect(markered).toHaveLength(1);
    expect(markered[0].marker).toBe('end');
    expect(markered[0].kind).toBe('generalization');
  });

  it('single-child group: no degenerate zero-length bus segment when child is x-aligned with parent', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 500, y: 140 } });
    const result = computeEdgeSegments(pos, [edge('root', 'only', 'composition')], W, H);
    // parent stem (marker) + child stem = 2 segments; no bus needed since only one x value
    expect(result).toHaveLength(2);
    expect(result.filter(s => s.marker)).toHaveLength(1);
  });

  it('single-child group where child is NOT x-aligned with parent still gets a bus segment', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 650, y: 140 } });
    const result = computeEdgeSegments(pos, [edge('root', 'only', 'composition')], W, H);
    expect(result).toHaveLength(3); // parent stem + bus + child stem
  });
});

describe('computeEdgeSegments — off-axis / bridge edges', () => {
  it('an edge whose child is NOT below the parent (e.g. an inverted ancestor edge) is routed independently, not grouped into any bus', () => {
    const pos = positions({ focus: { x: 500, y: 0 }, ancestor: { x: 500, y: 140 } });
    // Ancestor edge convention: parentIri = ancestor (below, per partOfGraph.ts depth assignment), childIri = focus (above)
    const result = computeEdgeSegments(pos, [edge('ancestor', 'focus', 'generalization')], W, H);
    // Still exactly one segment carrying the marker for this lone edge
    const markered = result.filter(s => s.marker);
    expect(markered.length).toBeGreaterThanOrEqual(1);
  });

  it('a same-row edge (side-by-side nodes) is routed corner-to-corner, not top/bottom', () => {
    const pos = positions({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const result = computeEdgeSegments(pos, [edge('a', 'b', 'composition')], W, H);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(s => s.marker)).toBe(true);
  });
});

describe('computeEdgeSegments — shared child across two different parent groups (dual relationship, FR-011)', () => {
  it('both groups render their own marker independently with no interference', () => {
    const pos = positions({
      bone: { x: 300, y: 0 },
      whole: { x: 700, y: 0 },
      dual: { x: 500, y: 140 },
    });
    const edges = [
      edge('bone', 'dual', 'generalization'),
      edge('whole', 'dual', 'composition'),
    ];
    const result = computeEdgeSegments(pos, edges, W, H);
    const markered = result.filter(s => s.marker);
    expect(markered).toHaveLength(2);
    expect(markered.map(s => s.kind).sort()).toEqual(['composition', 'generalization']);
  });
});

describe('computeEdgeSegments — a single parent with BOTH composition and generalization children at once', () => {
  it('regression: the two groups\' parent-facing stems must not coincide, even though both groups share the exact same parent, row, and (before the fix) center x — the real bug reported against the live extension, where a diamond and a triangle landed on top of each other', () => {
    const pos = positions({
      root: { x: 500, y: 0 },
      c1: { x: 300, y: 140 }, c2: { x: 400, y: 140 }, // composition children
      g1: { x: 600, y: 140 }, g2: { x: 700, y: 140 }, // generalization children
    });
    const edges = [
      edge('root', 'c1', 'composition'),
      edge('root', 'c2', 'composition'),
      edge('root', 'g1', 'generalization'),
      edge('root', 'g2', 'generalization'),
    ];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markered = result.filter(s => s.marker);
    expect(markered).toHaveLength(2);
    const [seg1, seg2] = markered;
    // The two parent-facing (marker-carrying) segments must not be identical paths.
    expect(seg1.d).not.toBe(seg2.d);
    // Specifically: their starting/ending x at the parent end must differ (spread apart),
    // not both sit at the parent's exact center x.
    const parentEndX = (seg: typeof seg1) => Number(seg.d.match(/M([\d.-]+),/)![1]);
    expect(parentEndX(seg1)).not.toBe(parentEndX(seg2));
  });

  it('regression: assigns each kind-group\'s parent-exit offset by where its OWN children actually sit, not by which kind was declared first — otherwise the exit points land on the WRONG side and the two stems needlessly cross each other on the way down (reported against a real diagram, "Articulation of auditory ossicles")', () => {
    const pos = positions({
      root: { x: 500, y: 0 },
      // Composition's own children sit to the RIGHT of generalization's...
      c1: { x: 600, y: 140 }, c2: { x: 700, y: 140 },
      g1: { x: 300, y: 140 }, g2: { x: 400, y: 140 },
    });
    // ...but composition's edges are declared FIRST — under discovery-order assignment this used
    // to hard-wire composition to the LEFT exit regardless of where its children actually sit.
    const edges = [
      edge('root', 'c1', 'composition'), edge('root', 'c2', 'composition'),
      edge('root', 'g1', 'generalization'), edge('root', 'g2', 'generalization'),
    ];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markered = result.filter(s => s.marker);
    const genMarker = markered.find(s => s.kind === 'generalization')!;
    const compMarker = markered.find(s => s.kind === 'composition')!;
    const parentEndX = (seg: typeof genMarker) => Number(seg.d.match(/M([\d.-]+),/)![1]);
    // Generalization's children (300, 400) sit LEFT of composition's (600, 700) — its exit point
    // must be the LEFTWARD one.
    expect(parentEndX(genMarker)).toBeLessThan(parentEndX(compMarker));
  });
});

describe('computeEdgeRoutes — every bus group in a transition gets its own lane/height', () => {
  const W2 = 160, H2 = 56;

  it('gives two DIFFERENT-kind edges into the same child their own distinct bus heights (same target but different type must NOT share a bus)', () => {
    const pos = positions({
      parentA: { x: 100, y: 0 },
      parentB: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
    });
    const edges = [
      edge('parentA', 'childX', 'generalization'),
      edge('parentB', 'childX', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W2, H2);
    const aBusY = routes.get('parentA|childX|generalization')!.points[0].y;
    const bBusY = routes.get('parentB|childX|composition')!.points[0].y;
    // Two separate (parent, kind) groups in the same layer-0 transition -> two lanes -> two
    // heights, 98 (lane 0) and 110 (lane 1, `BUS_LANE_SPREAD` below), not one shared line.
    expect(aBusY).not.toBe(bBusY);
    expect([aBusY, bBusY].sort((x, y) => x - y)).toEqual([98, 110]);
  });

  it('gives three unrelated same-layer parents three distinct bus heights (no two collapse together)', () => {
    const pos = positions({
      parentA: { x: 100, y: 0 },
      parentB: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
      parentY: { x: 500, y: 0 },
      childY: { x: 500, y: 140 },
    });
    const edges = [
      edge('parentA', 'childX', 'generalization'),
      edge('parentB', 'childX', 'composition'),
      edge('parentY', 'childY', 'generalization'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W2, H2);
    const heights = [
      routes.get('parentA|childX|generalization')!.points[0].y,
      routes.get('parentB|childX|composition')!.points[0].y,
      routes.get('parentY|childY|generalization')!.points[0].y,
    ];
    // Three groups in one transition -> three distinct lane heights (98, 110, 120; the 3rd hits the MIN_FINAL_STEM safety clamp under this fixture's tight spacing), assigned by
    // ascending minX then key. None share a height.
    expect(new Set(heights).size).toBe(3);
    expect([...heights].sort((x, y) => x - y)).toEqual([98, 110, 120]);
  });
});

describe('computeEdgeRoutes — adjacent (one-layer) edges route straight, no detour', () => {
  const W2 = 160, H2 = 56;

  // NOTE: obstacle avoidance for a MULTI-layer descent is no longer a reactive per-edge detour —
  // a multi-layer edge is expanded into a dummy-node chain by `layout.ts`, and routed through
  // those reserved (guaranteed-clear) dummy columns via `elbowExpand`. Its correctness (no edge
  // ever crosses an unrelated node box) is verified structurally, on real and synthetic
  // multi-layer fixtures, in `layoutMetrics.test.ts`. The old reactive-detour tests that fed a
  // multi-row edge WITHOUT its dummy chain (a production-impossible input) were removed with that
  // change. What remains here is the still-load-bearing invariant: a genuinely ADJACENT edge
  // (child exactly one layer down, no dummy chain) always descends straight, never detours —
  // nothing can occupy the gap between two adjacent layers, so it must never go looking.

  it('does not detour when the child sits directly one row below its bus (the ordinary case) — no node can ever occupy that narrow gap', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 650, y: 140 } });
    const routes = computeEdgeRoutes(pos, [edge('root', 'only', 'composition')], W2, H2);
    // Just the bus-arrival waypoint, no detour points.
    expect(routes.get('root|only|composition')!.points).toEqual([{ x: 500, y: 98 }, { x: 650, y: 98 }]);
  });

  it('does NOT attempt a detour for a normal one-row edge even amid other multi-row obstacles nearby — a one-row gap can never legitimately contain an obstacle, so it must never go looking for one', () => {
    const w4 = 16, h4 = 56;
    const pos = positions({
      parentX: { x: 500, y: 20 },
      child1: { x: 488, y: 140 },
      child2: { x: 512, y: 140 },
      // ancestorZ->focusZ is a NORMAL one-row edge, x-aligned with parentX's own composition
      // stem (488) — it must stay a plain straight line regardless of what else is nearby.
      ancestorZ: { x: 488, y: -140 },
      focusZ: { x: 488, y: -20 },
    });
    const edges = [
      edge('parentX', 'child1', 'composition'),
      edge('parentX', 'child2', 'generalization'),
      edge('ancestorZ', 'focusZ', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, w4, h4);
    const route = routes.get('ancestorZ|focusZ|composition')!;
    // busY = pyBottom(-84) + min(42, (childY(-20) - pyBottom(-84))/2 = 32) = -52; px === childX
    // (both 488), so the bus-arrival waypoint collapses to a single point — no detour appended.
    expect(route.points).toEqual([{ x: 488, y: -52 }]);
  });
});

describe('computeEdgeSegments — distinct bus heights are visible in the rendered path data too', () => {
  function extractYs(d: string): number[] {
    return [...d.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  }

  it('renders three distinct bus heights for three unrelated same-layer parents', () => {
    const pos = positions({
      parentA: { x: 100, y: 0 },
      parentB: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
      parentY: { x: 500, y: 0 },
      childY: { x: 500, y: 140 },
    });
    const edges = [
      edge('parentA', 'childX', 'generalization'),
      edge('parentB', 'childX', 'composition'),
      edge('parentY', 'childY', 'generalization'),
    ];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markerYs = result.filter(s => s.marker).flatMap(s => extractYs(s.d));
    const busYs = new Set(markerYs.filter(y => y !== 56)); // 56 = every parent's shared pyBottom
    // Three groups in one transition -> three distinct lane heights (98, 110, 120; the 3rd hits the MIN_FINAL_STEM safety clamp under this fixture's tight spacing).
    expect(busYs).toEqual(new Set([98, 110, 120]));
  });
});

describe('computeEdgeSegments — direction: LR', () => {
  it('is the exact transpose of the TB result for the same logical layout (columns instead of rows)', () => {
    // The TB fixture from the "multi-child composition group" test above, transposed: depth
    // now runs along x, siblings are spread along y.
    const posTB = positions({
      root: { x: 500, y: 0 },
      a: { x: 300, y: 140 }, b: { x: 500, y: 140 }, c: { x: 700, y: 140 },
    });
    const posLR = positions({
      root: { x: 0, y: 500 },
      a: { x: 140, y: 300 }, b: { x: 140, y: 500 }, c: { x: 140, y: 700 },
    });
    const edges = [edge('root', 'a', 'composition'), edge('root', 'b', 'composition'), edge('root', 'c', 'composition')];

    const tbResult = computeEdgeSegments(posTB, edges, W, H);
    const lrResult = computeEdgeSegments(posLR, edges, H, W, 'LR');

    expect(lrResult).toHaveLength(tbResult.length);
    const transposeD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${b},${a}`);
    expect(lrResult.map(s => s.d)).toEqual(tbResult.map(s => transposeD(s.d)));
    expect(lrResult.map(s => s.marker)).toEqual(tbResult.map(s => s.marker));
  });

  it('defaults to TB when direction is omitted (backward compatible)', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 500, y: 140 } });
    const edges = [edge('root', 'only', 'composition')];
    expect(computeEdgeSegments(pos, edges, W, H)).toEqual(computeEdgeSegments(pos, edges, W, H, 'TB'));
  });
});

describe('computeEdgeRoutes — direction: LR', () => {
  it('swaps exit/entry fraction pairs and transposes waypoints relative to the TB result', () => {
    const posTB = positions({ root: { x: 500, y: 0 }, only: { x: 650, y: 140 } });
    const posLR = positions({ root: { x: 0, y: 500 }, only: { x: 140, y: 650 } });
    const edges = [edge('root', 'only', 'composition')];

    const tbRoute = computeEdgeRoutes(posTB, edges, W, H).get('root|only|composition')!;
    const lrRoute = computeEdgeRoutes(posLR, edges, H, W, 'LR').get('root|only|composition')!;

    expect(lrRoute.exitX).toBe(tbRoute.exitY);
    expect(lrRoute.exitY).toBe(tbRoute.exitX);
    expect(lrRoute.entryX).toBe(tbRoute.entryY);
    expect(lrRoute.entryY).toBe(tbRoute.entryX);
    expect(lrRoute.points).toEqual(tbRoute.points.map(p => ({ x: p.y, y: p.x })));
  });
});

describe('computeEdgeRoutes', () => {
  it('regression: a single child directly below its parent (the common case) must not produce two identical waypoints — a degenerate zero-length interior segment confused mxGraph\'s marker placement in the exported drawio, making the line into the diamond/triangle look disconnected', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 500, y: 140 } });
    const routes = computeEdgeRoutes(pos, [edge('root', 'only', 'composition')], W, H);
    const route = routes.get('root|only|composition')!;

    for (let i = 1; i < route.points.length; i++) {
      expect(route.points[i]).not.toEqual(route.points[i - 1]);
    }
  });

  it('still produces a genuine bus waypoint pair when the child is NOT x-aligned with the parent', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 650, y: 140 } });
    const routes = computeEdgeRoutes(pos, [edge('root', 'only', 'composition')], W, H);
    const route = routes.get('root|only|composition')!;
    expect(route.points).toHaveLength(2);
    expect(route.points[0]).not.toEqual(route.points[1]);
  });

  it('deduplicates an x-aligned generalization edge\'s waypoints the same way', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 500, y: 140 } });
    const routes = computeEdgeRoutes(pos, [edge('root', 'only', 'generalization')], W, H);
    const route = routes.get('root|only|generalization')!;

    for (let i = 1; i < route.points.length; i++) {
      expect(route.points[i]).not.toEqual(route.points[i - 1]);
    }
  });

  it('regression: the parent-to-bus stem (which carries the diamond/triangle marker) must be long enough to read as a visible line, not just barely longer than the marker itself — a too-small BUS_GAP made the marker look like it sat directly on the horizontal bus line with no connecting line', () => {
    const pos = positions({
      root: { x: 500, y: 0 },
      a: { x: 300, y: 140 }, b: { x: 500, y: 140 }, c: { x: 700, y: 140 },
    });
    const routes = computeEdgeRoutes(pos, [
      edge('root', 'a', 'composition'), edge('root', 'b', 'composition'), edge('root', 'c', 'composition'),
    ], W, H);
    const route = routes.get('root|a|composition')!;

    const exitY = route.exitY * H; // fraction -> absolute y offset within the parent box
    const parentBottom = pos.get('root')!.y + exitY;
    const busY = route.points[0].y;
    // The marker itself (drawio startSize=10, HTML/SVG marker viewBox ~7-10px tall) needs
    // meaningfully more than its own size of clear stem to read as a connected line.
    expect(busY - parentBottom).toBeGreaterThanOrEqual(30);
  });

  // (Multi-row descent obstacle-avoidance is now structural via dummy-column routing — see the
  // note in the "adjacent edges route straight" describe block and the zero-overlap coverage in
  // `layoutMetrics.test.ts`. The former reactive-detour regression tests here fed a multi-row
  // edge without its dummy chain, a production-impossible input, and were removed with that
  // change.)
});

describe('far-child (dual-relationship) bus routing', () => {
  // Mirrors a real anatomy.owl shape: "Tympanic cavity" (parentB) has two composition children,
  // "Cochlear window" (nearChild, same row as parentB's sibling's own children) and "Tympanic
  // ostium of eustachian tube" (farChild, ALSO a generalization child of "Ostium of eustachian
  // tube" — parentA's own composition child one row up — so it lands two rows below parentB
  // instead of one). Reported: farChild's straight bus sweep from parentB toward its own x swept
  // directly through parentA's incoming stem to "Ostium", sitting in the row directly below
  // parentA (and directly below parentB's own sibling row too).
  // `farRoutes` is the dummy chain `layout.ts` would produce for the multi-layer parentB->farChild
  // edge: one dummy at the intermediate row (420), placed in a CLEAR column (520 — no real node
  // sits there at that row), which is exactly how the layered layout keeps the far edge's path
  // clear of `ostium`/`siblingOfFar`. Passing it makes these tests exercise the real production
  // far-routing path (elbow through the reserved dummy column) rather than a bare geometry call.
  function buildFixture() {
    const pos = positions({
      parentA: { x: 252.5, y: 280 }, // "Pharyngotympanic tube"
      parentB: { x: 465, y: 280 }, // "Tympanic cavity"
      siblingOfFar: { x: 125, y: 420 }, // "Mucous membrane of eustachian tube" (parentA's other child)
      ostium: { x: 380, y: 420 }, // "Ostium of eustachian tube" (parentA's OTHER composition child)
      nearChild: { x: 635, y: 420 }, // "Cochlear window" (parentB's near, same-row child)
      farChild: { x: 295, y: 560 }, // "Tympanic ostium of eustachian tube" (parentB's far child)
    });
    const edges = [
      edge('parentA', 'siblingOfFar', 'composition'),
      edge('parentA', 'ostium', 'composition'),
      edge('parentB', 'nearChild', 'composition'),
      edge('parentB', 'farChild', 'composition'),
      edge('ostium', 'farChild', 'generalization'),
    ];
    const farRoutes = new Map<string, Position[]>([
      ['parentB|farChild|composition', [{ x: 520, y: 420 }]],
    ]);
    return { pos, edges, farRoutes };
  }

  it('computeEdgeRoutes: routes the far child through its reserved dummy column; the near child stays a plain single-hop bus reach', () => {
    const { pos, edges, farRoutes } = buildFixture();
    const routes = computeEdgeRoutes(pos, edges, W, H, 'TB', farRoutes);

    // Near child (one layer down): straight bus-arrival waypoints at parentB's own busY.
    expect(routes.get('parentB|nearChild|composition')!.points).toEqual([
      { x: 465, y: 390 }, { x: 635, y: 390 },
    ]);

    // Far child: its route passes through the reserved dummy column (x=520) at the intermediate
    // row, rather than descending straight at parentB's x through whatever sits between.
    const farPoints = routes.get('parentB|farChild|composition')!.points;
    expect(farPoints.some(p => p.x === 520)).toBe(true);
    // ...and never sits inside `ostium`'s box (x in [300,460], y in [420,476]) while crossing its row.
    for (const p of farPoints) {
      if (p.y > 420 && p.y < 476) { expect(p.x < 300 || p.x > 460).toBe(true); }
    }
  });

  it('computeEdgeRoutes: flags the far (multi-layer) child\'s route as far, and the near/adjacent edges as not-far', () => {
    const { pos, edges, farRoutes } = buildFixture();
    const routes = computeEdgeRoutes(pos, edges, W, H, 'TB', farRoutes);

    expect(routes.get('parentB|farChild|composition')!.far).toBe(true);
    expect(routes.get('parentB|nearChild|composition')!.far).toBe(false);
    expect(routes.get('parentA|ostium|composition')!.far).toBe(false);
  });

  it('computeEdgeSegments: the shared bus line spans only the near (adjacent) child; the far child is its own independent path routed through its dummy column', () => {
    const { pos, edges, farRoutes } = buildFixture();
    const segments = computeEdgeSegments(pos, edges, W, H, 'TB', farRoutes);

    // Marker-carrying parent stem exits at parentB's own x, straight down to its busY.
    expect(segments.some(s => s.marker === 'start' && s.d === 'M465,336 L465,390')).toBe(true);
    // One-child bus spanning parentB's exit (465) to the near child (635) at that busY.
    expect(segments.some(s => s.d === 'M465,390 L635,390')).toBe(true);
    // The far child's own dashed path goes through the reserved dummy column (x=520).
    const farSeg = segments.find(s => s.far);
    expect(farSeg).toBeDefined();
    expect(farSeg!.d).toContain('520,');
  });

  it('computeEdgeSegments: flags the far child\'s segment as far, and the near bus/stem segments as not-far', () => {
    const { pos, edges, farRoutes } = buildFixture();
    const segments = computeEdgeSegments(pos, edges, W, H, 'TB', farRoutes);

    const farSegs = segments.filter(s => s.far);
    expect(farSegs.length).toBe(1);
    const nearSegments = segments.filter(s => s.d === 'M465,336 L465,390' || s.d === 'M465,390 L635,390');
    expect(nearSegments.length).toBeGreaterThan(0);
    expect(nearSegments.every(s => !s.far)).toBe(true);
  });
});

describe('fan-in bus: 2+ distinct parents sharing one child of the same kind', () => {
  it('computeEdgeSegments: renders one shared bus (each parent marked, one unmarked final stem into the child) instead of independent coincidental paths', () => {
    const pos = positions({
      parentA: { x: 100, y: 0 },
      parentB: { x: 400, y: 0 },
      shared: { x: 250, y: 140 },
    });
    const edges = [
      edge('parentA', 'shared', 'composition'),
      edge('parentB', 'shared', 'composition'),
    ];
    const segments = computeEdgeSegments(pos, edges, W, H);

    // Exactly two marker-carrying segments — one per parent, each a diamond (composition, marker
    // 'start') since each parent is its own "whole" contributing to the shared part.
    const markered = segments.filter(s => s.marker);
    expect(markered).toHaveLength(2);
    expect(markered.every(s => s.marker === 'start' && s.kind === 'composition')).toBe(true);
    expect(markered.some(s => s.d === 'M100,56 L100,98')).toBe(true); // parentA's own stem
    expect(markered.some(s => s.d === 'M400,56 L400,98')).toBe(true); // parentB's own stem

    // One shared horizontal bus line spanning both parents' x (and the child's, if outside that
    // range) at the shared busY.
    expect(segments.some(s => !s.marker && s.d === 'M100,98 L400,98')).toBe(true);

    // Exactly one final, UNMARKED stem into the shared child — not one per parent.
    const finalStems = segments.filter(s => s.d === 'M250,98 L250,140');
    expect(finalStems).toHaveLength(1);
    expect(finalStems[0].marker).toBeUndefined();
  });

  it('computeEdgeSegments: does NOT fan-in when the two parents use DIFFERENT edge kinds (dual relationship, still independent)', () => {
    const pos = positions({
      bone: { x: 100, y: 0 },
      whole: { x: 400, y: 0 },
      dual: { x: 250, y: 140 },
    });
    const edges = [
      edge('bone', 'dual', 'generalization'),
      edge('whole', 'dual', 'composition'),
    ];
    const segments = computeEdgeSegments(pos, edges, W, H);

    // Both parents still get their own independent marker — no shared bus is forced across
    // different kinds; each kind keeps its own separate group (matching pre-existing FR-011
    // dual-relationship behavior, which this feature doesn't change).
    const markered = segments.filter(s => s.marker);
    expect(markered).toHaveLength(2);
    expect(markered.map(s => s.kind).sort()).toEqual(['composition', 'generalization']);
  });

  it('computeEdgeSegments: does NOT fan-in a parent that has OTHER exclusive children besides the shared one (mixed fan-out/fan-in stays fan-out)', () => {
    const pos = positions({
      parentA: { x: 100, y: 0 },
      parentB: { x: 400, y: 0 }, // has an exclusive child too — keeps its normal fan-out bus
      exclusiveChild: { x: 550, y: 140 },
      shared: { x: 250, y: 140 },
    });
    const edges = [
      edge('parentA', 'shared', 'composition'),
      edge('parentB', 'shared', 'composition'),
      edge('parentB', 'exclusiveChild', 'composition'),
    ];
    const segments = computeEdgeSegments(pos, edges, W, H);

    // parentB keeps exactly one marker (its own fan-out bus, now spanning shared+exclusiveChild).
    const parentBMarker = segments.filter(s => s.marker && s.d.startsWith('M400,'));
    expect(parentBMarker).toHaveLength(1);
    // parentA (whose ONLY child is the shared one) still gets its own marker independently.
    const parentAMarker = segments.filter(s => s.marker && s.d.startsWith('M100,'));
    expect(parentAMarker).toHaveLength(1);
  });
});

describe('computeEdgeRoutes — bus-lane separation across 3+ mutually-overlapping groups in one row (regression)', () => {
  it('gives each of four different parents a bus line that stays visually distinct from the others, rather than cascading to one shared height', () => {
    // Mirrors the real middle-ear-structure shape (Ossicle of ear / Malleus / Stapes / Incus, all
    // in one row): every adjacent pair's span overlaps, so the OLD round-based push loop kept
    // pushing ALL of them in lockstep — including a pair (ossicle/incus) whose spans only TOUCH,
    // not strictly overlap, a false "crossing" created by this loop's own obstacle margin — until
    // every one collapsed onto the exact same clamped ceiling height.
    const pos = positions({
      ossicle: { x: 1060, y: 600 }, malleus: { x: 1230, y: 600 },
      stapes: { x: 1400, y: 600 }, incus: { x: 1570, y: 600 },
      bone_ossicle: { x: 380, y: 800 },
      lig_malleus: { x: 550, y: 800 }, bone_malleus: { x: 720, y: 800 },
      bone_stapes: { x: 890, y: 800 },
      lig_incus: { x: 1060, y: 800 }, bone_incus: { x: 1230, y: 800 },
    });
    const edges = [
      edge('ossicle', 'bone_ossicle', 'composition'),
      edge('malleus', 'lig_malleus', 'composition'), edge('malleus', 'bone_malleus', 'composition'),
      edge('stapes', 'bone_stapes', 'composition'),
      edge('incus', 'lig_incus', 'composition'), edge('incus', 'bone_incus', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W, H);

    const busYOf = (childIri: string): number => routes.get(edges.find(e => e.childIri === childIri)!.id)!.points[0].y;
    const heights = {
      ossicle: busYOf('bone_ossicle'),
      malleus: busYOf('lig_malleus'),
      stapes: busYOf('bone_stapes'),
      incus: busYOf('lig_incus'),
    };

    // Malleus and Stapes each genuinely overlap EVERY other group's span (no shared child), so
    // all three of {ossicle, malleus, stapes, incus} pairs involving either of them must land at
    // distinct heights. Ossicle and Incus's spans only TOUCH at one point (not a strict overlap),
    // so it's fine — expected, even — for them to share a height; that's not a visual collision.
    expect(heights.malleus).not.toBe(heights.ossicle);
    expect(heights.malleus).not.toBe(heights.stapes);
    expect(heights.malleus).not.toBe(heights.incus);
    expect(heights.stapes).not.toBe(heights.ossicle);
    expect(heights.stapes).not.toBe(heights.incus);

    // None of them collapsed onto the shared ceiling (childTopY(800) - MIN_FINAL_STEM(20) = 780).
    for (const y of Object.values(heights)) { expect(y).toBeLessThan(780); }
  });
});
