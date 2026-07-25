import { describe, it, expect } from 'vitest';
import { XMLValidator } from 'fast-xml-parser';
import { renderDiagramFragment, renderStandaloneSvg } from './htmlRenderer';
import type { DiagramNode, DiagramEdge, ExcludedRelation } from './diagramModel';

function node(iri: string, label: string, x: number, y: number, opts: Partial<DiagramNode> = {}): DiagramNode {
  return { iri, label, depth: 0, isRoot: false, hasHiddenRelations: false, x, y, ...opts };
}

function excludedRelation(fromLabel: string, propertyLabel: string, targetLabel: string): ExcludedRelation {
  return {
    fromIri: `urn:${fromLabel}`, propertyIri: `urn:${propertyLabel}`, targetIri: `urn:${targetLabel}`,
    fromLabel, propertyLabel, targetLabel,
  };
}

describe('renderDiagramFragment', () => {
  it('renders one .dnode div per node, each tagged with data-iri for click delegation', () => {
    const nodes = [node('urn:root', 'Root', 100, 0, { isRoot: true }), node('urn:child', 'Child', 100, 140)];
    const frag = renderDiagramFragment(nodes, [], []);

    expect((frag.nodesHtml.match(/class="dnode/g) ?? []).length).toBe(2);
    expect(frag.nodesHtml).toContain('data-iri="urn:root"');
    expect(frag.nodesHtml).toContain('data-iri="urn:child"');
  });

  it('includes marker defs and at least one path per edge', () => {
    const nodes = [node('urn:root', 'Root', 100, 0, { isRoot: true }), node('urn:child', 'Child', 100, 140)];
    const edges: DiagramEdge[] = [{ id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'composition' }];
    const frag = renderDiagramFragment(nodes, edges, []);

    expect(frag.svg).toContain('id="diamond"');
    expect(frag.svg).toContain('id="triangle"');
    expect(frag.svg).toContain('<path');
  });

  it('canvas dimensions bound every node position with margin', () => {
    const nodes = [node('urn:a', 'A', 50, 0), node('urn:b', 'B', 900, 300, { isRoot: true })];
    const frag = renderDiagramFragment(nodes, [], []);

    expect(frag.canvasWidth).toBeGreaterThan(900);
    expect(frag.canvasHeight).toBeGreaterThan(300);
  });

  it('surfaces excluded relations as a notes section below the diagram, never attached to the owning class box (FR-010)', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const excluded = [excludedRelation('Root', 'vasculatureOf', 'Artery')];
    const frag = renderDiagramFragment(nodes, [], excluded);

    expect(frag.nodesHtml).toMatch(/excluded/i);
    expect(frag.nodesHtml).toContain('Root — vasculatureOf → Artery');
    // Never rendered as part of a node's own box — no per-node badge class/element anymore.
    expect(frag.nodesHtml).not.toContain('dnode-excluded');
    expect(frag.nodesHtml).not.toContain('dbadge');
  });

  it('does not add a notes section at all when there are no excluded relations', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const frag = renderDiagramFragment(nodes, [], []);
    expect(frag.nodesHtml).not.toMatch(/excluded/i);
  });

  it('expands canvasHeight to fit the notes section below the diagram', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const withoutNotes = renderDiagramFragment(nodes, [], []);
    const withNotes = renderDiagramFragment(nodes, [], [excludedRelation('Root', 'vasculatureOf', 'Artery')]);
    expect(withNotes.canvasHeight).toBeGreaterThan(withoutNotes.canvasHeight);
  });

  it('escapes HTML-significant characters in labels', () => {
    const nodes = [node('urn:root', 'A & B <script>', 0, 0, { isRoot: true })];
    const frag = renderDiagramFragment(nodes, [], []);

    expect(frag.nodesHtml).toContain('A &amp; B &lt;script&gt;');
    expect(frag.nodesHtml).not.toContain('<script>');
  });

  it('still marks a node with hasHiddenRelations, independent of any excluded-relation notes', () => {
    const nodes = [
      node('urn:a', 'A', 0, 0, { hasHiddenRelations: true }),
      node('urn:b', 'B', 200, 0),
    ];
    const excluded = [excludedRelation('B', 'p', 'X')];
    const frag = renderDiagramFragment(nodes, [], excluded);

    expect(frag.nodesHtml).toContain('dnode-hidden');
  });

  it('dashes a "far child" (dual-relationship) edge but not an ordinary near-child edge', () => {
    // Mirrors diagramGeometry.test.ts's far-child fixture: parentB's composition child farChild
    // is ALSO ostium's generalization child, landing 2 rows below parentB instead of 1.
    // Depths drive far-edge detection (a multi-layer edge gets a dummy chain, and that's what
    // marks it "far"/dashed): parents at 0, their direct children at 1, and farChild at 2 — so
    // parentB->farChild spans two layers (far) while parentB->nearChild spans one (near).
    const nodes = [
      node('urn:parentA', 'Pharyngotympanic tube', 252.5, 280, { depth: 0 }),
      node('urn:parentB', 'Tympanic cavity', 465, 280, { isRoot: true, depth: 0 }),
      node('urn:siblingOfFar', 'Mucous membrane', 125, 420, { depth: 1 }),
      node('urn:ostium', 'Ostium', 380, 420, { depth: 1 }),
      node('urn:nearChild', 'Cochlear window', 635, 420, { depth: 1 }),
      node('urn:farChild', 'Tympanic ostium', 295, 560, { depth: 2 }),
    ];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'urn:parentA', childIri: 'urn:siblingOfFar', kind: 'composition' },
      { id: 'e2', parentIri: 'urn:parentA', childIri: 'urn:ostium', kind: 'composition' },
      { id: 'e3', parentIri: 'urn:parentB', childIri: 'urn:nearChild', kind: 'composition' },
      { id: 'e4', parentIri: 'urn:parentB', childIri: 'urn:farChild', kind: 'composition' },
      { id: 'e5', parentIri: 'urn:ostium', childIri: 'urn:farChild', kind: 'generalization' },
    ];
    const frag = renderDiagramFragment(nodes, edges, []);

    expect(frag.svg).toContain('stroke-dasharray="6 4"');
    // The near-child bus segment (straight line from parentB down to nearChild's row) must NOT
    // carry the dash — only the far child's own independent path should.
    const nearSegment = /<path d="M465,390 L635,390"[^>]*\/>/.exec(frag.svg);
    expect(nearSegment?.[0]).not.toContain('stroke-dasharray');
  });
});

describe('renderDiagramFragment — direction: LR', () => {
  it('positions a node by its left edge (not centered) and centers it vertically instead', () => {
    const nodes = [node('urn:root', 'Root', 100, 50, { isRoot: true })];
    const frag = renderDiagramFragment(nodes, [], [], 'LR');

    expect(frag.nodesHtml).toContain('left:100px');
    expect(frag.nodesHtml).toContain('top:22px'); // 50 - NODE_HEIGHT(56)/2 = 22
  });

  it('canvas width/height still bound every node position with margin', () => {
    const nodes = [node('urn:a', 'A', 0, 50), node('urn:b', 'B', 900, 300, { isRoot: true })];
    const frag = renderDiagramFragment(nodes, [], [], 'LR');

    expect(frag.canvasWidth).toBeGreaterThan(900);
    expect(frag.canvasHeight).toBeGreaterThan(300);
  });
});

describe('renderStandaloneSvg', () => {
  it('produces a single well-formed <svg> document with a rect+text per node', () => {
    const nodes = [node('urn:root', 'Root', 100, 0, { isRoot: true }), node('urn:child', 'Child', 100, 140)];
    const edges: DiagramEdge[] = [{ id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'composition' }];
    const xml = renderStandaloneSvg(nodes, edges, []);

    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml.trim().startsWith('<svg') || xml.trim().startsWith('<?xml')).toBe(true);
    expect((xml.match(/<rect/g) ?? []).length).toBe(2);
    expect(xml).toContain('Root');
    expect(xml).toContain('Child');
  });

  it('escapes labels safely inside <text> elements', () => {
    const nodes = [node('urn:root', 'A & B <tag>', 0, 0, { isRoot: true })];
    const xml = renderStandaloneSvg(nodes, [], []);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('A &amp; B &lt;tag&gt;');
  });

  it('never renders excluded relations at all — that notes section is a webview-only affordance, not part of an exported SVG', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const excluded = [excludedRelation('Root', 'vasculatureOf', 'Artery')];
    const withExcluded = renderStandaloneSvg(nodes, [], excluded);
    const withoutExcluded = renderStandaloneSvg(nodes, [], []);

    expect(XMLValidator.validate(withExcluded)).toBe(true);
    expect(withExcluded).not.toContain('Root — vasculatureOf → Artery');
    expect(withExcluded).not.toMatch(/excluded/i);
    // Identical output whether or not there are excluded relations — the SVG is diagram-only.
    expect(withExcluded).toBe(withoutExcluded);
  });
});
