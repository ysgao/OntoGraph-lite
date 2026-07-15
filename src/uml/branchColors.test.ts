import { describe, it, expect } from 'vitest';
import { computeBranchColors } from './branchColors';
import type { DiagramNode, DiagramEdge } from './diagramModel';

function node(iri: string, isRoot = false): DiagramNode {
  return { iri, label: iri, depth: 0, isRoot, hasHiddenRelations: false };
}

describe('computeBranchColors', () => {
  it('assigns a distinct color to each of the root\'s direct descendant branches', () => {
    const nodes = [node('root', true), node('a'), node('b'), node('c')];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
      { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'composition' },
      { id: 'e3', parentIri: 'root', childIri: 'c', kind: 'generalization' },
    ];
    const colors = computeBranchColors(nodes, edges);

    expect(colors.get('a')).not.toEqual(colors.get('b'));
    expect(colors.get('b')).not.toEqual(colors.get('c'));
    expect(colors.get('a')).not.toEqual(colors.get('c'));
  });

  it('propagates a branch\'s color to all of its descendants, not just direct children', () => {
    const nodes = [node('root', true), node('a'), node('grandchild')];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
      { id: 'e2', parentIri: 'a', childIri: 'grandchild', kind: 'composition' },
    ];
    const colors = computeBranchColors(nodes, edges);

    expect(colors.get('grandchild')).toEqual(colors.get('a'));
  });

  it('gives an ancestor of the root (reached via the root-is-child direction) a distinct neutral treatment from any descendant branch', () => {
    const nodes = [node('root', true), node('ancestor'), node('descendant')];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'ancestor', childIri: 'root', kind: 'generalization' },
      { id: 'e2', parentIri: 'root', childIri: 'descendant', kind: 'composition' },
    ];
    const colors = computeBranchColors(nodes, edges);

    expect(colors.get('ancestor')).not.toEqual(colors.get('descendant'));
  });

  it('is deterministic across repeated calls with the same input (spec SC-003)', () => {
    const nodes = [node('root', true), node('a'), node('b')];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
      { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'generalization' },
    ];
    const first = computeBranchColors(nodes, edges);
    const second = computeBranchColors(nodes, edges);
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it('handles a diagram with no discoverable branches (isolated root) without throwing', () => {
    const nodes = [node('root', true)];
    expect(() => computeBranchColors(nodes, [])).not.toThrow();
  });

  describe('shared (dual-relationship) node color blending', () => {
    it('blends a node\'s color from its two direct parents rather than picking just one', () => {
      const nodes = [node('root', true), node('a'), node('b'), node('shared')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'generalization' },
        { id: 'e3', parentIri: 'a', childIri: 'shared', kind: 'composition' },
        { id: 'e4', parentIri: 'b', childIri: 'shared', kind: 'composition' },
      ];
      const colors = computeBranchColors(nodes, edges);
      const colorA = colors.get('a')!;
      const colorB = colors.get('b')!;
      const colorShared = colors.get('shared')!;

      expect(colorShared).not.toEqual(colorA);
      expect(colorShared).not.toEqual(colorB);
      // The blend is literally the RGB average of both parents' fill colors.
      const avg = (hex1: string, hex2: string) => {
        const n1 = parseInt(hex1.slice(1), 16);
        const n2 = parseInt(hex2.slice(1), 16);
        const channel = (shift: number) =>
          Math.round((((n1 >> shift) & 255) + ((n2 >> shift) & 255)) / 2);
        return '#' + [16, 8, 0].map(s => channel(s).toString(16).padStart(2, '0')).join('').toUpperCase();
      };
      expect(colorShared.fill).toBe(avg(colorA.fill, colorB.fill));
    });

    it('does not blend when both parents share the identical branch color', () => {
      const nodes = [node('root', true), node('a'), node('a2'), node('shared')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'a', childIri: 'a2', kind: 'composition' },
        { id: 'e3', parentIri: 'a', childIri: 'shared', kind: 'composition' },
        { id: 'e4', parentIri: 'a2', childIri: 'shared', kind: 'composition' },
      ];
      const colors = computeBranchColors(nodes, edges);
      expect(colors.get('shared')).toEqual(colors.get('a'));
    });

    it('propagates a blended color further down so grandchildren of a shared node also read as shared', () => {
      const nodes = [node('root', true), node('a'), node('b'), node('shared'), node('grandchild')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'generalization' },
        { id: 'e3', parentIri: 'a', childIri: 'shared', kind: 'composition' },
        { id: 'e4', parentIri: 'b', childIri: 'shared', kind: 'composition' },
        { id: 'e5', parentIri: 'shared', childIri: 'grandchild', kind: 'composition' },
      ];
      const colors = computeBranchColors(nodes, edges);
      expect(colors.get('grandchild')).toEqual(colors.get('shared'));
    });

    it('terminates and resolves colors even when a part-of cycle is present', () => {
      const nodes = [node('root', true), node('a'), node('cycle1'), node('cycle2')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'a', childIri: 'cycle1', kind: 'composition' },
        { id: 'e3', parentIri: 'cycle1', childIri: 'cycle2', kind: 'composition' },
        { id: 'e4', parentIri: 'cycle2', childIri: 'cycle1', kind: 'composition' },
      ];
      expect(() => computeBranchColors(nodes, edges)).not.toThrow();
      const colors = computeBranchColors(nodes, edges);
      expect(colors.get('cycle1')).toEqual(colors.get('a'));
      expect(colors.get('cycle2')).toEqual(colors.get('a'));
    });
  });

  describe('warm/cool contrast between sharing branch roots', () => {
    // Duplicated from branchColors.ts's PALETTE (by design — these tests pin the observable
    // cool/warm split, not the internal palette structure) so a test can tell which temperature
    // scheme a resolved color came from without exporting palette internals.
    const COOL_FILLS = ['#DCEAE6', '#DDE6EA', '#E7E1EB', '#E1E8DC'];
    const WARM_FILLS = ['#F1E3CB', '#F1DFD9', '#F1DAC9', '#EDE6C8'];
    const schemeOf = (fill: string): 'cool' | 'warm' | 'unknown' =>
      COOL_FILLS.includes(fill) ? 'cool' : WARM_FILLS.includes(fill) ? 'warm' : 'unknown';

    it('gives two branch roots that share a descendant opposite temperature schemes', () => {
      const nodes = [node('root', true), node('a'), node('b'), node('shared')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'generalization' },
        { id: 'e3', parentIri: 'a', childIri: 'shared', kind: 'composition' },
        { id: 'e4', parentIri: 'b', childIri: 'shared', kind: 'composition' },
      ];
      const colors = computeBranchColors(nodes, edges);
      const schemeA = schemeOf(colors.get('a')!.fill);
      const schemeB = schemeOf(colors.get('b')!.fill);

      expect(schemeA).not.toBe('unknown');
      expect(schemeB).not.toBe('unknown');
      expect(schemeA).not.toBe(schemeB);
    });

    it('gives non-sharing branch roots no scheme guarantee, just distinct colors', () => {
      const nodes = [node('root', true), node('a'), node('b'), node('c')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'composition' },
        { id: 'e3', parentIri: 'root', childIri: 'c', kind: 'generalization' },
      ];
      const colors = computeBranchColors(nodes, edges);
      expect(colors.get('a')).not.toEqual(colors.get('b'));
      expect(colors.get('b')).not.toEqual(colors.get('c'));
    });

    it('pulls a branch that shares only with a non-adjacent sibling to the opposite scheme', () => {
      // a and c share a descendant; b shares with neither. Order is a, b, c.
      const nodes = [node('root', true), node('a'), node('b'), node('c'), node('shared')];
      const edges: DiagramEdge[] = [
        { id: 'e1', parentIri: 'root', childIri: 'a', kind: 'composition' },
        { id: 'e2', parentIri: 'root', childIri: 'b', kind: 'composition' },
        { id: 'e3', parentIri: 'root', childIri: 'c', kind: 'generalization' },
        { id: 'e4', parentIri: 'a', childIri: 'shared', kind: 'composition' },
        { id: 'e5', parentIri: 'c', childIri: 'shared', kind: 'composition' },
      ];
      const colors = computeBranchColors(nodes, edges);
      const schemeA = schemeOf(colors.get('a')!.fill);
      const schemeC = schemeOf(colors.get('c')!.fill);
      expect(schemeA).not.toBe(schemeC);
    });
  });
});
