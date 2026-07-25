import { describe, it, expect } from 'vitest';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import { escapeXml, pickConnectionPoints, renderDrawio } from './drawioRenderer';
import type { DiagramNode, DiagramEdge, ExcludedRelation } from './diagramModel';

function node(iri: string, label: string, x: number, y: number, opts: Partial<DiagramNode> = {}): DiagramNode {
  return { iri, label, depth: 0, isRoot: false, hasHiddenRelations: false, x, y, ...opts };
}

describe('escapeXml', () => {
  it('escapes & before < and >, then <, then >, then "', () => {
    expect(escapeXml('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e');
  });

  it('does not double-escape an already-bare ampersand followed by other special chars', () => {
    expect(escapeXml('Tom & Jerry <3 "friends"')).toBe('Tom &amp; Jerry &lt;3 &quot;friends&quot;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeXml('Middle ear structure')).toBe('Middle ear structure');
  });
});

describe('pickConnectionPoints', () => {
  it('straight vertical: target below source (normal parent-above-child)', () => {
    const pts = pickConnectionPoints({ x: 100, y: 0 }, { x: 100, y: 140 });
    expect(pts).toEqual({ exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 });
  });

  it('straight vertical: target above source (inverted — e.g. an ancestor edge)', () => {
    const pts = pickConnectionPoints({ x: 100, y: 140 }, { x: 100, y: 0 });
    expect(pts).toEqual({ exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 });
  });

  it('quadrant: target down-right, vertical-dominant', () => {
    const pts = pickConnectionPoints({ x: 0, y: 0 }, { x: 50, y: 140 });
    expect(pts).toEqual({ exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 });
  });

  it('quadrant: target right, horizontal-dominant (off-axis bridge)', () => {
    const pts = pickConnectionPoints({ x: 0, y: 0 }, { x: 300, y: 20 });
    expect(pts).toEqual({ exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 });
  });

  it('quadrant: target left, horizontal-dominant', () => {
    const pts = pickConnectionPoints({ x: 300, y: 0 }, { x: 0, y: 20 });
    expect(pts).toEqual({ exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 });
  });

  it('quadrant: target up-left, vertical-dominant', () => {
    const pts = pickConnectionPoints({ x: 300, y: 140 }, { x: 250, y: 0 });
    expect(pts).toEqual({ exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 });
  });
});

describe('renderDrawio', () => {
  it('produces well-formed XML for a simple root+child tree', () => {
    const nodes = [
      node('urn:root', 'Root', 100, 0, { isRoot: true }),
      node('urn:child', 'Child', 100, 140),
    ];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'composition', propertyIri: 'urn:partOf' },
    ];
    const xml = renderDrawio(nodes, edges, []);

    expect(XMLValidator.validate(xml)).toBe(true);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const cells = parsed.mxfile.diagram.mxGraphModel.root.mxCell;
    expect(Array.isArray(cells) ? cells.length : 1).toBeGreaterThan(0);
  });

  it('direction: LR positions node geometry by left edge / vertical center instead of horizontal center / top edge', () => {
    const nodes = [node('urn:root', 'Root', 100, 50, { isRoot: true })];
    const xml = renderDrawio(nodes, [], [], 'LR');
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const geometry = parsed.mxfile.diagram.mxGraphModel.root.mxCell[2].mxGeometry;
    expect(Number(geometry['@_x'])).toBe(100);
    expect(Number(geometry['@_y'])).toBe(22); // 50 - NODE_HEIGHT(56)/2
  });

  it('renders composition edges with a diamond at the parent/whole end', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true }), node('urn:child', 'Child', 0, 140)];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'composition', propertyIri: 'urn:partOf' },
    ];
    const xml = renderDrawio(nodes, edges, []);
    expect(xml).toContain('startArrow=diamondThin');
    expect(xml).toContain('startFill=1');
  });

  it('renders generalization edges with a hollow triangle at the parent/supertype end', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true }), node('urn:child', 'Child', 0, 140)];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'generalization' },
    ];
    const xml = renderDrawio(nodes, edges, []);
    expect(xml).toContain('endArrow=block');
    expect(xml).toContain('endFill=0');
  });

  it('escapes special characters in labels', () => {
    const nodes = [node('urn:root', 'A & B "quoted" <tag>', 0, 0, { isRoot: true })];
    const xml = renderDrawio(nodes, [], []);
    expect(xml).toContain('A &amp; B &quot;quoted&quot; &lt;tag&gt;');
    expect(xml).not.toMatch(/value="[^"]*\n/);
  });

  it('never renders excluded relations at all — that notes section is a webview-only affordance, not part of an exported diagram (FR-010)', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const excluded: ExcludedRelation[] = [
      {
        fromIri: 'urn:root', propertyIri: 'urn:vasculatureOf', targetIri: 'urn:artery',
        fromLabel: 'Root', propertyLabel: 'vasculatureOf', targetLabel: 'Artery',
      },
    ];
    const xml = renderDrawio(nodes, [], excluded);
    expect(xml).not.toMatch(/excluded/i);
    expect(xml).not.toContain('Root — vasculatureOf → Artery');

    // The root node's own cell value must be its plain label — no excluded-relation text appended.
    const rootCellMatch = /<mxCell id="n0" value="([^"]*)"/.exec(xml);
    expect(rootCellMatch?.[1]).toBe('Root');
  });

  it('adds no note cells at all when there are no excluded relations', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true })];
    const xml = renderDrawio(nodes, [], []);
    expect(xml).not.toMatch(/excluded/i);
  });

  it('dashes a "far child" (dual-relationship) edge but not an ordinary near-child edge', () => {
    // Mirrors diagramGeometry.test.ts's far-child fixture: parentB's composition child farChild
    // is ALSO ostium's generalization child, landing 2 rows below parentB instead of 1.
    // Depths drive far-edge detection (a multi-layer edge gets a dummy chain, and that's what
    // marks it "far"/dashed): parents at 0, direct children at 1, farChild at 2 — so
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
    const xml = renderDrawio(nodes, edges, []);

    expect(xml).toContain('dashed=1;dashPattern=6 4;');

    // Composition edges route source=parent, target=child: parentB(n1)->farChild(n5) is the far
    // one (farChild is ALSO ostium's generalization child, landing 2 rows below parentB); the
    // parentB(n1)->nearChild(n4) edge sits at the group's ordinary, shallowest row.
    const farCellMatch = /<mxCell id="e\d+" style="([^"]*)"[^>]*source="n1" target="n5"/.exec(xml);
    expect(farCellMatch?.[1]).toContain('dashed=1;dashPattern=6 4;');

    const nearCellMatch = /<mxCell id="e\d+" style="([^"]*)"[^>]*source="n1" target="n4"/.exec(xml);
    expect(nearCellMatch?.[1]).not.toContain('dashed=1;dashPattern=6 4;');
  });

  it('gives every mxCell an explicit exitX/exitY/entryX/entryY — never a floating connector', () => {
    const nodes = [node('urn:root', 'Root', 0, 0, { isRoot: true }), node('urn:child', 'Child', 0, 140)];
    const edges: DiagramEdge[] = [
      { id: 'e1', parentIri: 'urn:root', childIri: 'urn:child', kind: 'composition', propertyIri: 'urn:partOf' },
    ];
    const xml = renderDrawio(nodes, edges, []);
    expect(xml).toContain('exitX=');
    expect(xml).toContain('entryX=');
  });
});
