import { describe, it, expect } from 'vitest';
import { insertDummyNodes } from './dummyNodes';

describe('insertDummyNodes', () => {
  it('inserts one dummy per intermediate layer for an edge spanning more than one layer', () => {
    const nodes = [
      { iri: 'root', depth: 0 },
      { iri: 'mid', depth: 1 },
      { iri: 'far', depth: 4 },
    ];
    const edges = [{ id: 'root|far', parentIri: 'root', childIri: 'far' }];

    const result = insertDummyNodes(nodes, edges);

    expect(result.dummies).toHaveLength(3); // layers 1, 2, 3
    expect(result.dummies.map(d => d.layer).sort()).toEqual([1, 2, 3]);
    for (const d of result.dummies) {
      expect(d.ownerEdgeId).toBe('root|far');
    }

    const chain = result.chainsByEdgeId.get('root|far')!;
    expect(chain[0]).toBe('root');
    expect(chain[chain.length - 1]).toBe('far');
    expect(chain).toHaveLength(5); // root, d1, d2, d3, far
  });

  it('does not insert dummies for an adjacent-layer edge', () => {
    const nodes = [{ iri: 'root', depth: 0 }, { iri: 'child', depth: 1 }];
    const edges = [{ id: 'root|child', parentIri: 'root', childIri: 'child' }];

    const result = insertDummyNodes(nodes, edges);

    expect(result.dummies).toHaveLength(0);
    expect(result.chainsByEdgeId.has('root|child')).toBe(false);
  });

  it('contributes no dummies for a back-edge/cycle (child layer <= parent layer)', () => {
    const nodes = [{ iri: 'a', depth: 2 }, { iri: 'b', depth: 1 }];
    // A back-edge from a deeper node to a shallower one (or same-depth) — per
    // depthNormalization.ts's own cycle guard, this can occur and must not throw or produce
    // dummies (spec Edge Case: "layout must still complete... rather than looping indefinitely").
    const edges = [{ id: 'a|b', parentIri: 'a', childIri: 'b' }];

    const result = insertDummyNodes(nodes, edges);

    expect(result.dummies).toHaveLength(0);
    expect(result.chainsByEdgeId.has('a|b')).toBe(false);
  });

  it('handles multiple edges independently, each with its own dummy chain', () => {
    const nodes = [
      { iri: 'root', depth: 0 },
      { iri: 'a', depth: 1 },
      { iri: 'b', depth: 1 },
      { iri: 'farA', depth: 3 },
      { iri: 'farB', depth: 4 },
    ];
    const edges = [
      { id: 'a|farA', parentIri: 'a', childIri: 'farA' }, // gap 2 -> 1 dummy (layer 2)
      { id: 'b|farB', parentIri: 'b', childIri: 'farB' }, // gap 3 -> 2 dummies (layers 2, 3)
    ];

    const result = insertDummyNodes(nodes, edges);

    expect(result.chainsByEdgeId.get('a|farA')).toHaveLength(3); // a, d, farA
    expect(result.chainsByEdgeId.get('b|farB')).toHaveLength(4); // b, d, d, farB
    expect(result.dummies).toHaveLength(3);
    // Dummy ids must be unique across different owner edges even when they land on the same layer.
    const ids = result.dummies.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic — two consecutive calls with the same input produce deep-equal output', () => {
    const nodes = [{ iri: 'root', depth: 0 }, { iri: 'far', depth: 3 }];
    const edges = [{ id: 'root|far', parentIri: 'root', childIri: 'far' }];

    const first = insertDummyNodes(nodes, edges);
    const second = insertDummyNodes(nodes, edges);

    expect(second).toEqual(first);
  });
});
