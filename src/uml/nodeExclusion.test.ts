import { describe, it, expect } from 'vitest';
import { applyNodeExclusions } from './nodeExclusion';
import type { DiagramNode, DiagramEdge } from './diagramModel';

function node(iri: string, isRoot = false, depth = 0): DiagramNode {
  return { iri, label: iri, depth, isRoot, hasHiddenRelations: false };
}

function edge(parentIri: string, childIri: string, kind: 'composition' | 'generalization', propertyIri?: string): DiagramEdge {
  return { id: `${parentIri}|${childIri}|${kind}`, parentIri, childIri, kind, propertyIri };
}

describe('applyNodeExclusions — shared behavior across both modes', () => {
  it('is a no-op when excludeIris is empty', () => {
    const nodes = [node('root', true), node('a')];
    const edges = [edge('root', 'a', 'composition')];
    expect(applyNodeExclusions(nodes, edges, new Set(), 'subtree')).toEqual({ nodes, edges });
  });

  it('never excludes the root, even if explicitly requested', () => {
    const nodes = [node('root', true), node('a')];
    const edges = [edge('root', 'a', 'composition')];
    const result = applyNodeExclusions(nodes, edges, new Set(['root']), 'subtree');
    expect(result.nodes.map(n => n.iri)).toEqual(['root', 'a']);
  });

  it('excluding an IRI absent from the graph is a no-op', () => {
    const nodes = [node('root', true), node('a')];
    const edges = [edge('root', 'a', 'composition')];
    const result = applyNodeExclusions(nodes, edges, new Set(['urn:nonexistent']), 'subtree');
    expect(result.nodes.map(n => n.iri)).toEqual(['root', 'a']);
    expect(result.edges).toEqual(edges);
  });
});

describe('applyNodeExclusions — subtree mode', () => {
  it('removes an excluded node and all of its descendants', () => {
    const nodes = [node('root', true), node('mid'), node('leaf1'), node('leaf2')];
    const edges = [
      edge('root', 'mid', 'composition'),
      edge('mid', 'leaf1', 'composition'),
      edge('mid', 'leaf2', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['mid']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['root']);
    expect(result.edges).toEqual([]);
  });

  it('keeps siblings of an excluded node', () => {
    const nodes = [node('root', true), node('a'), node('b')];
    const edges = [edge('root', 'a', 'composition'), edge('root', 'b', 'generalization')];
    const result = applyNodeExclusions(nodes, edges, new Set(['a']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['b', 'root']);
    expect(result.edges).toEqual([edge('root', 'b', 'generalization')]);
  });

  it('keeps a dual-relationship node reachable via a second, non-excluded parent (FR-011)', () => {
    const nodes = [node('root', true), node('p1'), node('p2'), node('shared')];
    const edges = [
      edge('root', 'p1', 'composition'),
      edge('root', 'p2', 'composition'),
      edge('p1', 'shared', 'composition'),
      edge('p2', 'shared', 'composition'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['p1']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['p2', 'root', 'shared']);
    expect(result.edges).toContainEqual(edge('p2', 'shared', 'composition'));
  });

  it('drops a dual-relationship node once BOTH of its parents are excluded', () => {
    const nodes = [node('root', true), node('p1'), node('p2'), node('shared')];
    const edges = [
      edge('root', 'p1', 'composition'),
      edge('root', 'p2', 'composition'),
      edge('p1', 'shared', 'composition'),
      edge('p2', 'shared', 'composition'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['p1', 'p2']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['root']);
  });

  it('removes a direct ancestor of the root with just its single edge (ancestors have no further descendants)', () => {
    const nodes = [node('ancestor'), node('root', true), node('child')];
    const edges = [edge('ancestor', 'root', 'generalization'), edge('root', 'child', 'composition')];
    const result = applyNodeExclusions(nodes, edges, new Set(['ancestor']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['child', 'root']);
    expect(result.edges).toEqual([edge('root', 'child', 'composition')]);
  });

  it('handles excluding multiple unrelated nodes in one call', () => {
    const nodes = [node('root', true), node('a'), node('b'), node('c')];
    const edges = [
      edge('root', 'a', 'composition'),
      edge('root', 'b', 'composition'),
      edge('root', 'c', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['a', 'b']), 'subtree');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['c', 'root']);
  });
});

describe('applyNodeExclusions — splice mode', () => {
  it('reconnects a removed node\'s children to its own parent, preserving the child\'s own edge kind', () => {
    const nodes = [node('root', true), node('mid'), node('leaf')];
    const edges = [edge('root', 'mid', 'composition'), edge('mid', 'leaf', 'generalization')];
    const result = applyNodeExclusions(nodes, edges, new Set(['mid']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['leaf', 'root']);
    expect(result.edges).toEqual([
      expect.objectContaining({ parentIri: 'root', childIri: 'leaf', kind: 'generalization' }),
    ]);
  });

  it('splices through a chain of consecutively-excluded ancestors', () => {
    const nodes = [node('root', true), node('mid1'), node('mid2'), node('leaf')];
    const edges = [
      edge('root', 'mid1', 'composition'),
      edge('mid1', 'mid2', 'composition'),
      edge('mid2', 'leaf', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['mid1', 'mid2']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['leaf', 'root']);
    expect(result.edges).toEqual([
      expect.objectContaining({ parentIri: 'root', childIri: 'leaf', kind: 'generalization' }),
    ]);
  });

  it('drops the connection entirely when splicing an ancestor that has nothing further above it', () => {
    const nodes = [node('ancestor'), node('root', true), node('child')];
    const edges = [edge('ancestor', 'root', 'generalization'), edge('root', 'child', 'composition')];
    const result = applyNodeExclusions(nodes, edges, new Set(['ancestor']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['child', 'root']);
    expect(result.edges).toEqual([edge('root', 'child', 'composition')]);
  });

  it('preserves a dual-relationship child\'s other, non-excluded parent edge alongside the spliced-in one', () => {
    const nodes = [node('root', true), node('excludedParent'), node('otherParent'), node('shared')];
    const edges = [
      edge('root', 'excludedParent', 'composition'),
      edge('root', 'otherParent', 'composition'),
      edge('excludedParent', 'shared', 'composition'),
      edge('otherParent', 'shared', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['excludedParent']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['otherParent', 'root', 'shared']);
    expect(result.edges).toContainEqual(expect.objectContaining({ parentIri: 'root', childIri: 'shared', kind: 'composition' }));
    expect(result.edges).toContainEqual(edge('otherParent', 'shared', 'generalization'));
    expect(result.edges).toHaveLength(3);
  });

  it('does not infinite-loop when the underlying graph has a part-of cycle among excluded nodes', () => {
    const nodes = [node('root', true), node('a'), node('b'), node('leaf')];
    const edges = [
      edge('root', 'a', 'composition'),
      edge('a', 'b', 'composition'),
      edge('b', 'a', 'composition'), // cycle between a and b
      edge('b', 'leaf', 'generalization'),
    ];
    expect(() => applyNodeExclusions(nodes, edges, new Set(['a', 'b']), 'splice')).not.toThrow();
    const result = applyNodeExclusions(nodes, edges, new Set(['a', 'b']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['leaf', 'root']);
  });

  it('drops an edge entirely when its child is excluded, regardless of parent', () => {
    const nodes = [node('root', true), node('a'), node('b')];
    const edges = [edge('root', 'a', 'composition'), edge('a', 'b', 'composition')];
    const result = applyNodeExclusions(nodes, edges, new Set(['b']), 'splice');
    expect(result.nodes.map(n => n.iri).sort()).toEqual(['a', 'root']);
    expect(result.edges).toEqual([edge('root', 'a', 'composition')]);
  });
});

describe('applyNodeExclusions — depth renumbering (prevents multi-row-gap edges from reappearing)', () => {
  it('renumbers a spliced child\'s depth to its NEW distance from root, not its original (pre-splice) depth', () => {
    // Originally root(0) -> mid1(1) -> mid2(2) -> leaf(3): leaf's stale depth of 3 would leave a
    // 2-row gap once mid1/mid2 are spliced out and leaf reconnects directly to root.
    const nodes = [node('root', true, 0), node('mid1', false, 1), node('mid2', false, 2), node('leaf', false, 3)];
    const edges = [
      edge('root', 'mid1', 'composition'),
      edge('mid1', 'mid2', 'composition'),
      edge('mid2', 'leaf', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['mid1', 'mid2']), 'splice');
    const leaf = result.nodes.find(n => n.iri === 'leaf')!;
    expect(leaf.depth).toBe(1);
  });

  it('renumbers a subtree-mode dual-relationship node to its surviving (possibly longer) path length', () => {
    // "shared" is originally reachable at depth 2 via shortParent AND at depth 3 via
    // longParent -> longMid. Excluding shortParent must leave shared at depth 3 (its real
    // remaining distance), not stranded at its stale depth-2 value.
    const nodes = [
      node('root', true, 0),
      node('shortParent', false, 1), node('longParent', false, 1), node('longMid', false, 2),
      node('shared', false, 2),
    ];
    const edges = [
      edge('root', 'shortParent', 'composition'),
      edge('root', 'longParent', 'composition'),
      edge('longParent', 'longMid', 'composition'),
      edge('shortParent', 'shared', 'composition'),
      edge('longMid', 'shared', 'generalization'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['shortParent']), 'subtree');
    const shared = result.nodes.find(n => n.iri === 'shared')!;
    expect(shared.depth).toBe(3);
  });

  it('keeps the root at depth 0 and an un-excluded direct ancestor at depth -1 after exclusion elsewhere', () => {
    const nodes = [node('ancestor', false, -1), node('root', true, 0), node('a', false, 1), node('b', false, 1)];
    const edges = [
      edge('ancestor', 'root', 'generalization'),
      edge('root', 'a', 'composition'),
      edge('root', 'b', 'composition'),
    ];
    const result = applyNodeExclusions(nodes, edges, new Set(['a']), 'subtree');
    expect(result.nodes.find(n => n.iri === 'root')!.depth).toBe(0);
    expect(result.nodes.find(n => n.iri === 'ancestor')!.depth).toBe(-1);
  });
});
