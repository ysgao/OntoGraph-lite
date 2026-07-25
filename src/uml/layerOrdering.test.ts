import { describe, it, expect } from 'vitest';
import { reduceCrossings } from './layerOrdering';

describe('reduceCrossings', () => {
  it('reduces a genuine crossing that local sibling-clustering alone cannot fix', () => {
    // P1 and P3 both point to shared child S; P2 (sitting BETWEEN them in declaration order) has
    // its own exclusive child D2. Declaration order [P1, P2, P3] with children order [S, D2]
    // (S placed first via P1, D2 placed via P2) has P3 -> S crossing over P2 -> D2's straight
    // descent — a genuine crossing that reordering ONLY within a single parent's own child list
    // (the old `reorderBySharedChildren` heuristic) cannot see, since P1/P3's shared child S is a
    // property of the PARENT layer's own siblings, not of any one parent's local child list.
    const sortedLayers = [1, 2];
    const initialOrder = new Map([
      [1, ['P1', 'P2', 'P3']],
      [2, ['S', 'D2']],
    ]);
    const nextHopByOccupant = new Map([
      ['P1', ['S']],
      ['P2', ['D2']],
      ['P3', ['S']],
    ]);

    const result = reduceCrossings({ sortedLayers, initialOrder, nextHopByOccupant });

    const layer1 = result.get(1)!;
    const layer2 = result.get(2)!;
    const idx = (id: string, order: string[]): number => order.indexOf(id);

    // P3 must no longer sit on the far side of P2 from S — i.e. P1 and P3 (both S's parents)
    // must be adjacent to each other in the resulting parent order.
    expect(Math.abs(idx('P1', layer1) - idx('P3', layer1))).toBe(1);

    // The resulting layout must have strictly fewer crossings than the initial [P1,P2,P3]/[S,D2]
    // ordering (which has exactly one: P3->S crosses P2->D2).
    function countCrossingsFor(l1: string[], l2: string[]): number {
      const l2Index = new Map(l2.map((id, i) => [id, i]));
      const hops: Array<[number, number]> = [];
      l1.forEach((id, i) => {
        for (const hop of nextHopByOccupant.get(id) ?? []) {
          const j = l2Index.get(hop);
          if (j !== undefined) { hops.push([i, j]); }
        }
      });
      let crossings = 0;
      for (let a = 0; a < hops.length; a++) {
        for (let b = a + 1; b < hops.length; b++) {
          const [a1, b1] = hops[a];
          const [a2, b2] = hops[b];
          if (a1 === a2 || b1 === b2) { continue; }
          if ((a1 - a2) * (b1 - b2) < 0) { crossings++; }
        }
      }
      return crossings;
    }

    const initialCrossings = countCrossingsFor(['P1', 'P2', 'P3'], ['S', 'D2']);
    const finalCrossings = countCrossingsFor(layer1, layer2);
    expect(initialCrossings).toBe(1);
    expect(finalCrossings).toBeLessThan(initialCrossings);
  });

  it('leaves an already crossing-free ordering unchanged in occupant membership per layer', () => {
    const sortedLayers = [0, 1];
    const initialOrder = new Map([
      [0, ['root']],
      [1, ['a', 'b', 'c']],
    ]);
    const nextHopByOccupant = new Map([['root', ['a', 'b', 'c']]]);

    const result = reduceCrossings({ sortedLayers, initialOrder, nextHopByOccupant });

    expect(new Set(result.get(1))).toEqual(new Set(['a', 'b', 'c']));
    expect(result.get(0)).toEqual(['root']);
  });

  it('is a no-op for a single-layer diagram (no adjacent pair to reorder)', () => {
    const sortedLayers = [0];
    const initialOrder = new Map([[0, ['solo']]]);
    const result = reduceCrossings({ sortedLayers, initialOrder, nextHopByOccupant: new Map() });
    expect(result.get(0)).toEqual(['solo']);
  });

  it('is deterministic across two consecutive calls with identical input (spec FR-009)', () => {
    const sortedLayers = [1, 2];
    const initialOrder = new Map([
      [1, ['P1', 'P2', 'P3']],
      [2, ['S', 'D2']],
    ]);
    const nextHopByOccupant = new Map([
      ['P1', ['S']],
      ['P2', ['D2']],
      ['P3', ['S']],
    ]);

    const first = reduceCrossings({ sortedLayers, initialOrder, nextHopByOccupant });
    const second = reduceCrossings({ sortedLayers, initialOrder, nextHopByOccupant });
    expect([...second].map(([l, o]) => [l, [...o]])).toEqual([...first].map(([l, o]) => [l, [...o]]));
  });
});
