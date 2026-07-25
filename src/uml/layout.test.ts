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

    // Root's x is no longer the average of its children (that was the old tidy-tree rule,
    // replaced by per-layer cumulative-sum placement — LayeredGraphAlgorithm.md §4): each layer
    // is positioned independently, so root (alone in its own layer) simply falls within its
    // children's overall cross-axis span rather than sitting at their exact arithmetic mean.
    const childAX = layout.get('childA')!.x;
    const childBX = layout.get('childB')!.x;
    expect(layout.get('root')!.x).toBeGreaterThanOrEqual(Math.min(childAX, childBX));
    expect(layout.get('root')!.x).toBeLessThanOrEqual(Math.max(childAX, childBX));

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

    it('keeps a 3-way shared child fully connected as one cluster, without letting the 3 parents collapse onto the same x', () => {
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
      // Before the same-depth collision pass: each parent's ONLY child is the same 'shared' node,
      // so all three averaged to the IDENTICAL x — a real, fully-overlapping box collision the
      // old assertion (checking only that 'shared' sits near their average) never caught. Now
      // each must be at least one crossSpacing apart from its neighbor.
      expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(170 - 1e-6); // SLOT_WIDTH
      expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(170 - 1e-6);
      // 'shared' now sits centered under its three parents (mean of their x = the middle parent's
      // x, and the midpoint of the span) — the tidy parent-over-children placement, rather than the
      // old quirk that pinned it under the leftmost parent.
      expect(layout.get('shared')!.x).toBeCloseTo((xs[0] + xs[2]) / 2);
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

  describe('unreachable-node fallback (spec FR-007)', () => {
    it('still places a node with no parent->child edge reaching it, rather than dropping it', () => {
      // 'orphan' has the same depth as childA/childB but no edge points to it at all — it must
      // still receive a valid, non-overlapping cross-axis slot (the pre-existing fallback this
      // rewrite's T007 was required to preserve, not silently drop).
      const nodes = [
        node('root', 0, true),
        node('childA', 1), node('childB', 1), node('orphan', 1),
      ];
      const edges = [edge('root', 'childA'), edge('root', 'childB')];

      const layout = computeLayout(nodes, edges);

      expect(layout.get('orphan')).toBeDefined();
      const xs = [layout.get('childA')!.x, layout.get('childB')!.x, layout.get('orphan')!.x];
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(170 - 1e-6); // SLOT_WIDTH
      }
    });
  });

  describe('determinism (spec FR-009)', () => {
    it('produces deep-equal output across two consecutive calls with identical input', () => {
      const nodes = [
        node('root', 0, true),
        node('a', 1), node('b', 1),
        node('shared', 2),
      ];
      const edges = [edge('root', 'a'), edge('root', 'b'), edge('a', 'shared'), edge('b', 'shared')];

      const first = computeLayout(nodes, edges);
      const second = computeLayout(nodes, edges);

      expect(second).toEqual(first);
    });
  });

  describe('same-depth collision avoidance (internal-node overlap)', () => {
    // Only leaves get a guaranteed-unique, separated slot via the nextSlot counter — an internal
    // node's cross is a bare average of its children with no collision check. A shared child
    // (2+ parents) is positioned once, via whichever parent reaches it first; its OTHER parent
    // then averages toward that fixed position, which can sit far (in slot-index terms) from
    // that other parent's own children — pulling it into an unrelated sibling's territory.
    it('keeps two unrelated depth-1 siblings at least crossSpacing apart even when one is pulled toward a shared grandchild reached through a cousin branch', () => {
      // root -> A, B, C (declared order). A -> A1..A4 (four leaves). A2 -> Shared (A's
      // grandchild). B -> Shared too (Shared's SECOND parent, reached only after A's subtree
      // already fixed its position). C -> C1. `reorderBySharedChildren` cannot help here: it
      // only clusters DIRECT siblings of the SAME parent that share a CHILD — B and A are not
      // siblings of a common parent with a shared child (A's child is A2, not Shared itself).
      const nodes = [
        node('root', 0, true),
        node('A', 1), node('B', 1), node('C', 1),
        node('A1', 2), node('A2', 2), node('A3', 2), node('A4', 2), node('C1', 2),
        node('Shared', 3),
      ];
      const edges = [
        edge('root', 'A'), edge('root', 'B'), edge('root', 'C'),
        edge('A', 'A1'), edge('A', 'A2'), edge('A', 'A3'), edge('A', 'A4'),
        edge('C', 'C1'),
        edge('A2', 'Shared'),
        edge('B', 'Shared'),
      ];

      const layout = computeLayout(nodes, edges);

      const aX = layout.get('A')!.x;
      const bX = layout.get('B')!.x;
      // Before the fix: B's cross equals Shared's cross (295), landing inside A's own
      // [300, 460] leaf range (half node width 80 either side of A's 380) — a real overlap.
      expect(Math.abs(aX - bX)).toBeGreaterThanOrEqual(170); // SLOT_WIDTH
    });

    it('holds a general minimum-separation invariant across every same-depth pair, including the pre-existing shared-child sibling fixture', () => {
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
      const byDepth = new Map<number, number[]>();
      for (const n of nodes) {
        const list = byDepth.get(n.depth) ?? [];
        list.push(layout.get(n.iri)!.x);
        byDepth.set(n.depth, list);
      }
      for (const xs of byDepth.values()) {
        const sorted = [...xs].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(170 - 1e-6); // SLOT_WIDTH
        }
      }

      // The pre-existing adjacency invariant (node4/node6 adjacent, nothing between them) still
      // holds after the collision pass.
      const x4 = layout.get('node4')!.x;
      const x5 = layout.get('node5')!.x;
      const x6 = layout.get('node6')!.x;
      const lo = Math.min(x4, x6);
      const hi = Math.max(x4, x6);
      expect(x5 < lo || x5 > hi).toBe(true);
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
      // Root (alone in its own layer) falls within its children's overall cross-axis span rather
      // than at their exact arithmetic mean — see the matching TB case above for why.
      const childAY = layout.get('childA')!.y;
      const childBY = layout.get('childB')!.y;
      expect(layout.get('root')!.y).toBeGreaterThanOrEqual(Math.min(childAY, childBY));
      expect(layout.get('root')!.y).toBeLessThanOrEqual(Math.max(childAY, childBY));
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
