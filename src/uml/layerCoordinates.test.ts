import { describe, it, expect } from 'vitest';
import { assignLayerCoordinates } from './layerCoordinates';

describe('assignLayerCoordinates', () => {
  it('places occupants left-to-right via a running cumulative sum, never overlapping regardless of width', () => {
    const layerOrder = new Map<number, string[]>([[0, ['a', 'b', 'c']]]);
    const widthById = new Map([['a', 100], ['b', 40], ['c', 170]]);

    const cross = assignLayerCoordinates(layerOrder, widthById, 10, 0);

    // Each occupant's box (center +/- width/2) must not overlap its neighbor's.
    const aRight = cross.get('a')! + 50;
    const bLeft = cross.get('b')! - 20;
    const bRight = cross.get('b')! + 20;
    const cLeft = cross.get('c')! - 85;
    expect(bLeft).toBeGreaterThanOrEqual(aRight);
    expect(cLeft).toBeGreaterThanOrEqual(bRight);
  });

  it('reserves exactly width + gap between consecutive occupant centers for uniform widths', () => {
    const layerOrder = new Map<number, string[]>([[0, ['a', 'b', 'c']]]);
    const widthById = new Map([['a', 170], ['b', 170], ['c', 170]]);

    const cross = assignLayerCoordinates(layerOrder, widthById, 0, 0);

    expect(cross.get('b')! - cross.get('a')!).toBeCloseTo(170);
    expect(cross.get('c')! - cross.get('b')!).toBeCloseTo(170);
  });

  it('never places an occupant left of the given left margin', () => {
    const layerOrder = new Map<number, string[]>([[0, ['a', 'b']]]);
    const widthById = new Map([['a', 160], ['b', 160]]);

    const cross = assignLayerCoordinates(layerOrder, widthById, 10, 40);

    expect(cross.get('a')! - 80).toBeGreaterThanOrEqual(40);
  });

  it('assigns each layer independently — different layers never influence each other\'s coordinates', () => {
    const layerOrder = new Map<number, string[]>([
      [0, ['a']],
      [1, ['b', 'c']],
    ]);
    const widthById = new Map([['a', 170], ['b', 170], ['c', 170]]);

    const cross = assignLayerCoordinates(layerOrder, widthById, 0, 0);

    // Layer 1 starts fresh from the margin, independent of layer 0's occupant count.
    expect(cross.get('b')).toBeCloseTo(cross.get('a')!);
  });

  it('holds the no-overlap guarantee for an arbitrary mix of many differently-sized occupants (structural, not a case-by-case check)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const widthById = new Map(ids.map((id, i) => [id, 20 + (i % 5) * 37]));
    const layerOrder = new Map<number, string[]>([[0, ids]]);

    const cross = assignLayerCoordinates(layerOrder, widthById, 5, 0);

    for (let i = 1; i < ids.length; i++) {
      const prevRight = cross.get(ids[i - 1])! + widthById.get(ids[i - 1])! / 2;
      const currLeft = cross.get(ids[i])! - widthById.get(ids[i])! / 2;
      expect(currLeft).toBeGreaterThanOrEqual(prevRight - 1e-9);
    }
  });
});
