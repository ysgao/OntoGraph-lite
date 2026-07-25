import { describe, it, expect } from 'vitest';
import { assignBusLanes, laneCountOf, type LaneSpan } from './busLanes';

function span(key: string, minX: number, maxX: number, children: string[] = []): LaneSpan {
  return { key, minX, maxX, childIris: new Set(children) };
}

describe('assignBusLanes', () => {
  it('puts disjoint spans all on lane 0 (one lane for the whole band)', () => {
    const lanes = assignBusLanes([span('a', 0, 100), span('b', 200, 300), span('c', 400, 500)]);
    expect([...lanes.values()]).toEqual([0, 0, 0]);
    expect(laneCountOf(lanes)).toBe(1);
  });

  it('splits two overlapping spans onto two lanes', () => {
    const lanes = assignBusLanes([span('a', 0, 300), span('b', 200, 500)]);
    expect(lanes.get('a')).not.toBe(lanes.get('b'));
    expect(laneCountOf(lanes)).toBe(2);
  });

  it('needs as many lanes as the maximum number of mutually-overlapping spans (max clique)', () => {
    // a,b,c all pairwise overlap around x=250 -> 3 lanes; d is disjoint -> reuses lane 0.
    const lanes = assignBusLanes([span('a', 0, 300), span('b', 100, 400), span('c', 200, 500), span('d', 600, 700)]);
    expect(laneCountOf(lanes)).toBe(3);
    expect(lanes.get('d')).toBe(0);
  });

  it('treats spans that only TOUCH at an endpoint as non-conflicting (share a lane)', () => {
    const lanes = assignBusLanes([span('a', 0, 200), span('b', 200, 400)]);
    expect(lanes.get('a')).toBe(lanes.get('b'));
  });

  it('treats a degenerate point-span as non-conflicting even when it sits inside a wide span', () => {
    const lanes = assignBusLanes([span('wide', 0, 900), span('point', 500, 500)]);
    expect(lanes.get('point')).toBe(lanes.get('wide'));
    expect(laneCountOf(lanes)).toBe(1);
  });

  it('lets two buses that SHARE a child overlap on the same lane (fan-in is a legitimate shared bus)', () => {
    const lanes = assignBusLanes([span('a', 0, 500, ['x']), span('b', 100, 600, ['x'])]);
    expect(lanes.get('a')).toBe(lanes.get('b'));
  });

  it('is deterministic — lane order follows ascending minX then key', () => {
    const s = [span('z', 200, 500), span('a', 0, 300)];
    expect(assignBusLanes(s).get('a')).toBe(0); // leftmost span gets lane 0 regardless of input order
  });
});
