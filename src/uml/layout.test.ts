import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';
import type { DiagramNode, DiagramEdge } from './diagramModel';

function node(iri: string, depth: number, isRoot = false): DiagramNode {
  return { iri, label: iri, depth, isRoot, hasHiddenRelations: false };
}

function edge(parentIri: string, childIri: string, kind: DiagramEdge['kind'] = 'generalization'): DiagramEdge {
  return { id: `${parentIri}|${childIri}|${kind}|`, parentIri, childIri, kind };
}

describe('computeLayout', () => {
  it('lays out a root + 2 children + 1 grandchild as a tidy tree', () => {
    const nodes = [
      node('root', 0, true),
      node('childA', 1),
      node('childB', 1),
      node('grandchild', 2),
    ];
    const edges = [
      edge('root', 'childA'),
      edge('root', 'childB'),
      edge('childA', 'grandchild'),
    ];

    const layout = computeLayout(nodes, edges);

    // Depth maps to row (y), same row height convention for every node at that depth
    expect(layout.get('root')!.depth).toBe(0);
    expect(layout.get('childA')!.depth).toBe(1);
    expect(layout.get('childB')!.depth).toBe(1);
    expect(layout.get('grandchild')!.depth).toBe(2);

    expect(layout.get('childA')!.y).toBe(layout.get('childB')!.y);
    expect(layout.get('root')!.y).toBeLessThan(layout.get('childA')!.y);
    expect(layout.get('childA')!.y).toBeLessThan(layout.get('grandchild')!.y);

    // Leaf-slot allocation: childA and grandchild (the only two leaves, declared in order)
    // get distinct x slots; childB (no children) is also a leaf slot.
    expect(layout.get('childA')!.x).not.toBe(layout.get('childB')!.x);

    // Root's x is the average of its direct children's x (post-order tidy-tree rule)
    const expectedRootX = (layout.get('childA')!.x + layout.get('childB')!.x) / 2;
    expect(layout.get('root')!.x).toBeCloseTo(expectedRootX);

    // childA's x equals its only child's x (single-child average = that child's x)
    expect(layout.get('childA')!.x).toBeCloseTo(layout.get('grandchild')!.x);
  });

  it('lays out a single isolated node at the origin row', () => {
    const layout = computeLayout([node('solo', 0, true)], []);
    expect(layout.get('solo')).toEqual(expect.objectContaining({ depth: 0 }));
  });

  it('clusters same-kind children together rather than interleaving composition/generalization, so their x-spans do not overlap', () => {
    // Declared in INTERLEAVED order: comp, gen, comp, gen — a naive edge-order-preserving
    // layout would position them left-to-right in that same interleaved order, causing the
    // composition bus (spanning its own min..max x) to overlap the generalization bus.
    const nodes = [
      node('root', 0, true),
      node('c1', 1), node('g1', 1), node('c2', 1), node('g2', 1),
    ];
    const edges = [
      edge('root', 'c1', 'composition'),
      edge('root', 'g1', 'generalization'),
      edge('root', 'c2', 'composition'),
      edge('root', 'g2', 'generalization'),
    ];

    const layout = computeLayout(nodes, edges);
    const compXs = [layout.get('c1')!.x, layout.get('c2')!.x];
    const genXs = [layout.get('g1')!.x, layout.get('g2')!.x];

    // The two kinds' x-ranges must not overlap: every composition x is on one side,
    // every generalization x on the other.
    const compMax = Math.max(...compXs);
    const genMin = Math.min(...genXs);
    const compMin = Math.min(...compXs);
    const genMax = Math.max(...genXs);
    const compBeforeGen = compMax < genMin;
    const genBeforeComp = genMax < compMin;
    expect(compBeforeGen || genBeforeComp).toBe(true);
  });

  describe('shared-children sibling reordering', () => {
    it('regroups siblings that share a child adjacent to one another (node4/node5/node6 sharing subnode8)', () => {
      // Declared order is node4, node5, node6 — but node4 and node6 both break down into the
      // same subnode8, while node5 shares nothing with either. The shared child should pull
      // node4 and node6 adjacent (final order node4, node6, node5) rather than leaving node5
      // sitting between them, which would otherwise force subnode8's own average-based cross
      // position to straddle node5.
      const nodes = [
        node('root', 0, true),
        node('node4', 1), node('node5', 1), node('node6', 1),
        node('subnode8', 2), node('leaf5', 2),
      ];
      const edges = [
        edge('root', 'node4'), edge('root', 'node5'), edge('root', 'node6'),
        edge('node4', 'subnode8'),
        edge('node5', 'leaf5'),
        edge('node6', 'subnode8'),
      ];

      const layout = computeLayout(nodes, edges);
      const x4 = layout.get('node4')!.x;
      const x5 = layout.get('node5')!.x;
      const x6 = layout.get('node6')!.x;

      // node4 and node6 must be adjacent (nothing else placed strictly between them)...
      const lo = Math.min(x4, x6);
      const hi = Math.max(x4, x6);
      expect(x5 < lo || x5 > hi).toBe(true);
    });

    it('leaves sibling order untouched when no two siblings share a child', () => {
      const nodes = [
        node('root', 0, true),
        node('a', 1), node('b', 1), node('c', 1),
      ];
      const edges = [edge('root', 'a'), edge('root', 'b'), edge('root', 'c')];

      const layout = computeLayout(nodes, edges);
      expect(layout.get('a')!.x).toBeLessThan(layout.get('b')!.x);
      expect(layout.get('b')!.x).toBeLessThan(layout.get('c')!.x);
    });

    it('keeps a 3-way shared child fully connected as one cluster', () => {
      const nodes = [
        node('root', 0, true),
        node('p1', 1), node('p2', 1), node('p3', 1),
        node('shared', 2),
      ];
      const edges = [
        edge('root', 'p1'), edge('root', 'p2'), edge('root', 'p3'),
        edge('p1', 'shared'), edge('p2', 'shared'), edge('p3', 'shared'),
      ];

      const layout = computeLayout(nodes, edges);
      const xs = [layout.get('p1')!.x, layout.get('p2')!.x, layout.get('p3')!.x].sort((a, b) => a - b);
      // All three already adjacent by construction (only one group) — just confirm the shared
      // child ends up centered on their average (tidy-tree invariant still holds).
      const avg = (xs[0] + xs[1] + xs[2]) / 3;
      expect(layout.get('shared')!.x).toBeCloseTo(avg);
    });
  });

  describe('ancestor centering (partOfGraph.ts\'s depth < 0 one-hop ancestor pre-pass)', () => {
    it('a single ancestor is centered exactly on the root, not appended off to one side', () => {
      const nodes = [
        node('ancestor', -1),
        node('root', 0, true),
        node('childA', 1), node('childB', 1), node('childC', 1),
      ];
      const edges = [
        edge('ancestor', 'root'),
        edge('root', 'childA'), edge('root', 'childB'), edge('root', 'childC'),
      ];

      const layout = computeLayout(nodes, edges);
      expect(layout.get('ancestor')!.x).toBeCloseTo(layout.get('root')!.x);
    });

    it('multiple ancestors straddle the root symmetrically', () => {
      const nodes = [
        node('ancestorA', -1), node('ancestorB', -1),
        node('root', 0, true),
        node('child', 1),
      ];
      const edges = [
        edge('ancestorA', 'root'), edge('ancestorB', 'root'),
        edge('root', 'child'),
      ];

      const layout = computeLayout(nodes, edges);
      const rootX = layout.get('root')!.x;
      const aX = layout.get('ancestorA')!.x;
      const bX = layout.get('ancestorB')!.x;
      // Symmetric about root: their average equals root's own x.
      expect((aX + bX) / 2).toBeCloseTo(rootX);
      expect(aX).not.toBe(bX);
    });

    it('never produces a cross-axis coordinate below the left margin, even when centering pushes an ancestor left of it', () => {
      // root has no children of its own (a single leaf slot near the margin), so centering a
      // lone ancestor on it would otherwise land the ancestor near/at the same small x — fine —
      // but with several ancestors straddling a root that close to the margin, half of them
      // would go negative without the normalization pass.
      const nodes = [
        node('ancestorA', -1), node('ancestorB', -1), node('ancestorC', -1),
        node('root', 0, true),
      ];
      const edges = [edge('ancestorA', 'root'), edge('ancestorB', 'root'), edge('ancestorC', 'root')];

      const layout = computeLayout(nodes, edges);
      for (const n of nodes) {
        expect(layout.get(n.iri)!.x).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('direction: LR', () => {
    it('maps depth to x (columns) and siblings to y (rows), the mirror image of TB', () => {
      const nodes = [
        node('root', 0, true),
        node('childA', 1),
        node('childB', 1),
        node('grandchild', 2),
      ];
      const edges = [
        edge('root', 'childA'),
        edge('root', 'childB'),
        edge('childA', 'grandchild'),
      ];

      const layout = computeLayout(nodes, edges, 'LR');

      // Depth now maps to a column (x), not a row (y).
      expect(layout.get('childA')!.x).toBe(layout.get('childB')!.x);
      expect(layout.get('root')!.x).toBeLessThan(layout.get('childA')!.x);
      expect(layout.get('childA')!.x).toBeLessThan(layout.get('grandchild')!.x);

      // Siblings are distinguished by y (not x) now.
      expect(layout.get('childA')!.y).not.toBe(layout.get('childB')!.y);
      const expectedRootY = (layout.get('childA')!.y + layout.get('childB')!.y) / 2;
      expect(layout.get('root')!.y).toBeCloseTo(expectedRootY);
    });

    it('defaults to TB when direction is omitted (backward compatible)', () => {
      const nodes = [node('root', 0, true), node('child', 1)];
      const edges = [edge('root', 'child')];
      const withDefault = computeLayout(nodes, edges);
      const withExplicitTB = computeLayout(nodes, edges, 'TB');
      expect(withDefault).toEqual(withExplicitTB);
    });
  });
});
