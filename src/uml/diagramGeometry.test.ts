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

describe('computeEdgeRoutes — bus-lane collision avoidance across DIFFERENT classes', () => {
  const W2 = 160, H2 = 56;

  it('does NOT separate two groups that share a child — a single class\'s own multiple parents converging on one bus height is the intended "shared bus" look, not a collision', () => {
    const pos = positions({
      parentNear: { x: 100, y: 0 },
      parentFar: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
    });
    const edges = [
      edge('parentNear', 'childX', 'generalization'),
      edge('parentFar', 'childX', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W2, H2);
    const nearBusY = routes.get('parentNear|childX|generalization')!.points[0].y;
    const farBusY = routes.get('parentFar|childX|composition')!.points[0].y;
    expect(nearBusY).toBe(farBusY);
    expect(nearBusY).toBe(98); // natural busY: pyBottom(56) + min(BUS_GAP(42), (140-56)/2=42)
  });

  it('separates a class\'s bridging bus (to a distant second parent) from an UNRELATED class\'s bus that would otherwise land at the identical natural height and cross it', () => {
    const pos = positions({
      parentNear: { x: 100, y: 0 },
      parentFar: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
      parentY: { x: 500, y: 0 },
      childY: { x: 500, y: 140 },
    });
    const edges = [
      edge('parentNear', 'childX', 'generalization'),
      edge('parentFar', 'childX', 'composition'),
      edge('parentY', 'childY', 'generalization'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W2, H2);

    const farBusY = routes.get('parentFar|childX|composition')!.points[0].y;
    const yBusY = routes.get('parentY|childY|generalization')!.points[0].y;
    // Without lane separation both would be 98 (identical natural busY) and cross paths —
    // parentFar's long bridging bus (100 -> 900) sweeps straight through parentY/childY's
    // territory (x=500) at that same height. Lane separation alone pushes parentY to a second
    // lane (110); the bus-vs-stem push then ALSO has to move parentFar further still, since its
    // span keeps crossing parentY's own stems (parent-stem, then child-stem) as it climbs — it
    // ends up capped at its own child's ceiling (childTopY(140) - BUS_LANE_CLEARANCE(6) = 134)
    // without fully escaping, which is this specific case's inherent limit (parentFar's own
    // child sits at the same row parentY's whole structure occupies) rather than a bug: the two
    // buses are still NOT at the same height, which is what actually matters visually.
    expect(farBusY).toBe(134);
    expect(yBusY).toBe(110);
    expect(farBusY).not.toBe(yBusY);

    // The two groups NOT in conflict (parentNear/childX, whose span [100,100] doesn't overlap
    // parentY/childY's [500,500]) are untouched — still at the natural height.
    const nearBusY = routes.get('parentNear|childX|generalization')!.points[0].y;
    expect(nearBusY).toBe(98);
  });
});

describe('computeEdgeRoutes — obstacle avoidance for a multi-row-spanning descent', () => {
  const W2 = 160, H2 = 56;

  it('routes a composition edge\'s descent AROUND an unrelated intermediate node instead of straight through its box (reported: "Ostium of eustachian tube" sitting between "Tympanic cavity" and its real children two rows down)', () => {
    const pos = positions({
      cavity: { x: 500, y: 0 },   // composition parent (the "whole"), row 0
      ostium: { x: 500, y: 140 }, // unrelated intermediate node, row 1, directly in the path
      part1: { x: 450, y: 280 },  // actual composition child, row 2
      part2: { x: 550, y: 280 },  // actual composition child, row 2
    });
    const edges = [
      edge('cavity', 'part1', 'composition'),
      edge('cavity', 'part2', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W2, H2);

    // ostium's box: x in [420, 580], y in [140, 196].
    const route1 = routes.get('cavity|part1|composition')!;
    expect(route1.points).toEqual([
      { x: 500, y: 98 }, { x: 450, y: 98 },
      { x: 450, y: 130 }, { x: 410, y: 130 }, { x: 410, y: 206 }, { x: 450, y: 206 },
    ]);

    const route2 = routes.get('cavity|part2|composition')!;
    expect(route2.points).toEqual([
      { x: 500, y: 98 }, { x: 550, y: 98 },
      { x: 550, y: 130 }, { x: 590, y: 130 }, { x: 590, y: 206 }, { x: 550, y: 206 },
    ]);

    // Neither route ever sits inside ostium's box while passing through its row.
    for (const route of [route1, route2]) {
      for (const p of route.points) {
        if (p.y > 140 && p.y < 196) { expect(p.x < 420 || p.x > 580).toBe(true); }
      }
    }
  });

  it('detours to whichever side is closer — part1 (left of the obstacle center) detours left, part2 (right of center) detours right', () => {
    const pos = positions({
      cavity: { x: 500, y: 0 }, ostium: { x: 500, y: 140 },
      part1: { x: 450, y: 280 }, part2: { x: 550, y: 280 },
    });
    const routes = computeEdgeRoutes(pos, [
      edge('cavity', 'part1', 'composition'), edge('cavity', 'part2', 'composition'),
    ], W2, H2);

    expect(routes.get('cavity|part1|composition')!.points.some(p => p.x === 410)).toBe(true);
    expect(routes.get('cavity|part2|composition')!.points.some(p => p.x === 590)).toBe(true);
  });

  it('does not detour when the child sits directly one row below its bus (the ordinary case) — no node can ever occupy that narrow gap', () => {
    const pos = positions({ root: { x: 500, y: 0 }, only: { x: 650, y: 140 } });
    const routes = computeEdgeRoutes(pos, [edge('root', 'only', 'composition')], W2, H2);
    // Same shape as before this feature existed: just the bus-arrival waypoint, no detour points.
    expect(routes.get('root|only|composition')!.points).toEqual([{ x: 500, y: 98 }, { x: 650, y: 98 }]);
  });

  it('reverses the detour order for a generalization edge, since its path travels child -> parent (bottom to top) rather than parent -> child', () => {
    const pos = positions({
      cavity: { x: 500, y: 0 }, ostium: { x: 500, y: 140 }, part1: { x: 450, y: 280 },
    });
    const routes = computeEdgeRoutes(pos, [edge('cavity', 'part1', 'generalization')], W2, H2);
    const route = routes.get('cavity|part1|generalization')!;
    // Path starts at the child's own top edge (implicit, not in `points`) and ends at the parent —
    // so the detour's "exit" (near the child) must come FIRST here, "enter" (near the bus) last.
    expect(route.points).toEqual([
      { x: 450, y: 206 }, { x: 410, y: 206 }, { x: 410, y: 130 }, { x: 450, y: 130 },
      { x: 450, y: 98 }, { x: 500, y: 98 },
    ]);
  });

  it('widens the detour iteratively when the first candidate side ALSO lands on a second, different obstacle — rather than stopping after checking only the original straight-line position', () => {
    const pos = positions({
      cavity: { x: 500, y: 0 },
      obstacle1: { x: 500, y: 140 }, // box: x in [420, 580]
      obstacle2: { x: 350, y: 140 }, // box: x in [270, 430] — overlaps where a naive fix would jog to
      part1: { x: 460, y: 280 },
    });
    const routes = computeEdgeRoutes(pos, [edge('cavity', 'part1', 'composition')], W2, H2);
    const route = routes.get('cavity|part1|composition')!;

    // A single-pass fix would stop at detourX=410 (just past obstacle1's left edge) without
    // noticing obstacle2 also occupies that spot; the correct result clears BOTH by detouring
    // right instead, once merging obstacle2 in makes the right side cheaper.
    expect(route.points).toEqual([
      { x: 500, y: 98 }, { x: 460, y: 98 },
      { x: 460, y: 130 }, { x: 590, y: 130 }, { x: 590, y: 206 }, { x: 460, y: 206 },
    ]);
  });

  it('detours around a DIFFERENT parent\'s own stem line even with no accompanying box in the way — reported: a composition edge crossed "Ostium of eustachian tube"\'s own separate outgoing stem', () => {
    const w4 = 16, h4 = 56; // narrow nodes so a PARENT_STEM_SPREAD-offset stem clears its own box
    const pos = positions({
      parentX: { x: 500, y: 20 },
      child1: { x: 488, y: 140 }, // parentX's composition child — its PARENT stem exits at x=488 (spread left)
      child2: { x: 512, y: 140 }, // parentX's generalization child — forces the composition/generalization spread
      parentY: { x: 700, y: 0 },  // unrelated parent, far away
      childY: { x: 488, y: 200 }, // parentY's composition child (multi-row span) — sits directly on parentX's own stem line
    });
    const edges = [
      edge('parentX', 'child1', 'composition'),
      edge('parentX', 'child2', 'generalization'),
      edge('parentY', 'childY', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, w4, h4);
    const route = routes.get('parentY|childY|composition')!;

    // parentY's OWN bus first gets pushed (146) by the bus-vs-stem check, since its span crosses
    // parentX's incoming parent-stem and then its own outgoing child-stem in turn — past both of
    // those, its descent still passes through child1's own BOX (child1 also happens to sit at
    // x=488), so the per-child detour still jogs around that.
    expect(route.points).toEqual([
      { x: 700, y: 146 }, { x: 488, y: 146 },
      { x: 488, y: 130 }, { x: 470, y: 130 }, { x: 470, y: 206 }, { x: 488, y: 206 },
    ]);
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

describe('computeEdgeSegments — bus-lane collision avoidance is visible in the rendered path data too', () => {
  function extractYs(d: string): number[] {
    return [...d.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  }

  it('renders two distinct bus heights for two unrelated classes whose buses would otherwise coincide, while leaving a shared-child pair at one height', () => {
    const pos = positions({
      parentNear: { x: 100, y: 0 },
      parentFar: { x: 900, y: 0 },
      childX: { x: 100, y: 140 },
      parentY: { x: 500, y: 0 },
      childY: { x: 500, y: 140 },
    });
    const edges = [
      edge('parentNear', 'childX', 'generalization'),
      edge('parentFar', 'childX', 'composition'),
      edge('parentY', 'childY', 'generalization'),
    ];
    const result = computeEdgeSegments(pos, edges, W, H);

    const markerYs = result.filter(s => s.marker).flatMap(s => extractYs(s.d));
    const busYs = new Set(markerYs.filter(y => y !== 56)); // 56 = every parent's shared pyBottom
    // parentNear/parentFar (98, shared child, unaffected) and parentY (110, lane-separated).
    // parentFar's own bus-vs-stem push (crossing parentY's stems as its wide span sweeps past
    // parentY's column) then pushes it further still, to 134 — see the routes-level test with
    // the identical fixture for why that specific value is this case's inherent ceiling.
    expect(busYs).toEqual(new Set([98, 110, 134]));
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

  it('regression: a multi-row descent detours around an UNRELATED group\'s horizontal bus line, not just its vertical stems — reported: "Tympanic ostium of eustachian tube"\'s composition edge sailed straight through "Structure of pharyngotympanic tube"\'s own horizontal bus band, undetected', () => {
    const pos = positions({
      parentC: { x: 1500, y: 0 },   // composition parent (e.g. "Tympanic cavity"), far right
      parentA: { x: 1000, y: 140 }, // unrelated parent (e.g. "Structure of pharyngotympanic tube")
      childB1: { x: 300, y: 280 },  // parentA's own children, spread wide — its bus spans [300,1700]
      childB2: { x: 1700, y: 280 },
      childD: { x: 700, y: 560 },   // parentC's child — multi-row descent passes straight through
    });
    const edges = [
      edge('parentA', 'childB1', 'generalization'),
      edge('parentA', 'childB2', 'generalization'),
      edge('parentC', 'childD', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W, H);
    const route = routes.get('parentC|childD|composition')!;

    // parentA's OWN bus, in turn, gets pushed by the SAME bus-vs-stem check (its span crosses
    // parentC's own child-facing stem, which reaches all the way down to childD's row) — moving
    // parentA's obstacle band deeper, which is why childD's detour clears it at a taller enterY
    // (256) than the original (pre-bus-push) fix alone would have needed.
    expect(route.points).toEqual([
      { x: 1500, y: 98 }, { x: 700, y: 98 },
      { x: 700, y: 256 }, { x: 210, y: 256 }, { x: 210, y: 346 }, { x: 700, y: 346 },
    ]);

    // The detour still clears parentA's ORIGINAL bus band (y in [230,246], x in [300,1700]) too.
    for (const p of route.points) {
      if (p.y > 230 && p.y < 246) { expect(p.x < 300 || p.x > 1700).toBe(true); }
    }
  });

  it('regression: widens the detour when the RETURN horizontal jog itself crosses a third, unrelated obstacle — not just when the vertical detour column does — reported: a return jog sailed straight through several sibling classes\' stems that sat between the two endpoints, never checked before', () => {
    const pos = positions({
      cavity: { x: 500, y: 0 },
      obstacleA: { x: 500, y: 140 },       // box: x in [420,580] — found by the initial vertical hit
      childD: { x: 460, y: 280 },
      // Unrelated group, positioned so its child's stem sits ONLY along the horizontal return
      // path (x in [437,453], well inside the [410,460] jog span) — NOT at childX(460) and NOT
      // at the chosen detourX(410), so only a horizontal-segment check can find it.
      obstacleDParent: { x: 445, y: 0 },
      obstacleDChild: { x: 445, y: 280 },
    });
    const edges = [
      edge('cavity', 'childD', 'composition'),
      edge('obstacleDParent', 'obstacleDChild', 'composition'),
    ];
    const routes = computeEdgeRoutes(pos, edges, W, H);
    const route = routes.get('cavity|childD|composition')!;

    expect(route.points).toEqual([
      { x: 500, y: 98 }, { x: 460, y: 98 },
      { x: 460, y: 88 }, { x: 410, y: 88 }, { x: 410, y: 290 }, { x: 460, y: 290 },
    ]);
  });
});

describe('far-child (dual-relationship) bus routing', () => {
  // Mirrors a real anatomy.owl shape: "Tympanic cavity" (parentB) has two composition children,
  // "Cochlear window" (nearChild, same row as parentB's sibling's own children) and "Tympanic
  // ostium of eustachian tube" (farChild, ALSO a generalization child of "Ostium of eustachian
  // tube" — parentA's own composition child one row up — so it lands two rows below parentB
  // instead of one). Reported: farChild's straight bus sweep from parentB toward its own x swept
  // directly through parentA's incoming stem to "Ostium", sitting in the row directly below
  // parentA (and directly below parentB's own sibling row too).
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
    return { pos, edges };
  }

  it('computeEdgeRoutes: routes the far child down the parent\'s own column, past the blocking sibling stem, before jogging sideways', () => {
    const { pos, edges } = buildFixture();
    const routes = computeEdgeRoutes(pos, edges, W, H);

    // The near child is completely unaffected — still a plain single-hop bus reach.
    expect(routes.get('parentB|nearChild|composition')!.points).toEqual([
      { x: 465, y: 414 }, { x: 635, y: 414 },
    ]);

    // The far child descends straight down at parentB's OWN x (465) past ostium's incoming stem
    // AND the ostium/ostiumSibling generalization bus (both sitting in the rows in between)
    // before jogging left into its own column.
    expect(routes.get('parentB|farChild|composition')!.points).toEqual([
      { x: 465, y: 336 }, { x: 465, y: 550 }, { x: 295, y: 550 },
    ]);
  });

  it('computeEdgeRoutes: flags the far child\'s route as far, and leaves the near child (and other ordinary edges) as not-far', () => {
    const { pos, edges } = buildFixture();
    const routes = computeEdgeRoutes(pos, edges, W, H);

    expect(routes.get('parentB|farChild|composition')!.far).toBe(true);
    expect(routes.get('parentB|nearChild|composition')!.far).toBe(false);
    expect(routes.get('parentA|ostium|composition')!.far).toBe(false);
  });

  it('computeEdgeSegments: the shared webview bus line only spans the near children — the far child gets its own independent segment, no shared bus / no marker', () => {
    const { pos, edges } = buildFixture();
    const segments = computeEdgeSegments(pos, edges, W, H);

    const parentBSegments = segments.filter(s => s.d.includes('465,336') || s.d.includes('465,414') || s.d.includes('465,550'));
    // Marker-carrying parent stem still exits at parentB's own x, straight down to its ordinary busY.
    expect(parentBSegments.some(s => s.marker === 'start' && s.d === 'M465,336 L465,414')).toBe(true);
    // No bus line needed for a single near child (busMinX === busMaxX, both 635... wait px=465,
    // nearChild=635, so there IS a one-child bus spanning 465-635 at busY=414).
    expect(parentBSegments.some(s => s.d === 'M465,414 L635,414')).toBe(true);
    // The far child's own independent path, entirely separate from the above.
    expect(parentBSegments.some(s => s.d === 'M465,336 L465,550 L295,550 L295,560')).toBe(true);
  });

  it('computeEdgeSegments: flags the far child\'s segment as far, and the near child/bus/stem segments as not-far', () => {
    const { pos, edges } = buildFixture();
    const segments = computeEdgeSegments(pos, edges, W, H);

    const farSegment = segments.find(s => s.d === 'M465,336 L465,550 L295,550 L295,560');
    expect(farSegment?.far).toBe(true);

    const nearSegments = segments.filter(s => s.d === 'M465,336 L465,414' || s.d === 'M465,414 L635,414');
    expect(nearSegments.length).toBeGreaterThan(0);
    expect(nearSegments.every(s => !s.far)).toBe(true);
  });
});
