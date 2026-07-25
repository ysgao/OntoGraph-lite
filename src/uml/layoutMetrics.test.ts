import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { computeLayout, computeFarEdgeRoutes } from './layout';
import { computeEdgeRoutes, boxRect } from './diagramGeometry';
import type { LayoutDirection } from './diagramModel';
import { detectNodeOverlaps, detectEdgeNodeOverlaps, countPathCrossings, type NodeBox } from './layoutMetrics';
import { deepMultiParentFixture, crossingFixture } from './testFixtures';
import type { DiagramNode, DiagramEdge } from './diagramModel';
import { ParserRegistry } from '../parser/ParserRegistry';
import { extractUmlDiagram } from './partOfGraph';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;

function node(iri: string, depth: number, isRoot = false): DiagramNode {
  return { iri, label: iri, depth, isRoot, hasHiddenRelations: false };
}

function edge(parentIri: string, childIri: string, kind: DiagramEdge['kind'] = 'generalization'): DiagramEdge {
  return { id: `${parentIri}|${childIri}|${kind}|`, parentIri, childIri, kind };
}

function boxesFor(nodes: DiagramNode[], layout: Map<string, { x: number; y: number }>): Map<string, NodeBox> {
  const boxes = new Map<string, NodeBox>();
  for (const n of nodes) {
    const pos = layout.get(n.iri);
    if (!pos) { continue; }
    boxes.set(n.iri, {
      left: pos.x - NODE_WIDTH / 2,
      right: pos.x + NODE_WIDTH / 2,
      top: pos.y,
      bottom: pos.y + NODE_HEIGHT,
    });
  }
  return boxes;
}

function assertNoOverlaps(nodes: DiagramNode[], edges: DiagramEdge[]): void {
  const layout = computeLayout(nodes, edges);
  const positions = new Map([...layout].map(([iri, p]) => [iri, { x: p.x, y: p.y }]));
  const boxes = boxesFor(nodes, layout);

  const nodeOverlaps = detectNodeOverlaps(boxes);
  expect(nodeOverlaps, `expected zero node-node overlaps, got: ${JSON.stringify(nodeOverlaps)}`).toEqual([]);

  const farEdgeRoutes = computeFarEdgeRoutes(nodes, edges);
  const routes = computeEdgeRoutes(positions, edges, NODE_WIDTH, NODE_HEIGHT, 'TB', farEdgeRoutes);
  const edgePaths = new Map<string, Array<{ x: number; y: number }>>();
  for (const [id, r] of routes) {
    const source = positions.get(r.sourceIri)!;
    const target = positions.get(r.targetIri)!;
    edgePaths.set(id, [source, ...r.points, target]);
  }
  const edgeById = new Map(edges.map(e => [e.id, e]));
  const edgeOverlaps = detectEdgeNodeOverlaps(edgePaths, boxes, (edgeId) => {
    const e = edgeById.get(edgeId)!;
    return new Set([e.parentIri, e.childIri]);
  });
  expect(edgeOverlaps, `expected zero edge-node overlaps, got: ${JSON.stringify(edgeOverlaps)}`).toEqual([]);
}

describe('layout overlap metrics (spec FR-001/FR-002/SC-001)', () => {
  it('(a) has zero overlaps for an existing shallow (2-level) fixture', () => {
    const nodes = [node('root', 0, true), node('a', 1), node('b', 1), node('c', 1)];
    const edges = [edge('root', 'a'), edge('root', 'b'), edge('root', 'c')];
    assertNoOverlaps(nodes, edges);
  });

  it('(b) has zero overlaps for the deep (5-layer) multi-parent fixture', () => {
    assertNoOverlaps(deepMultiParentFixture.nodes, deepMultiParentFixture.edges);
  });

  const ANATOMY_PATH = path.resolve(process.cwd(), 'test-ontologies/anatomy.owl');
  const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);
  const MIDDLE_EAR_IRI = 'http://snomed.info/id/25342003';
  const SNOMED_PART_OF = [
    'http://snomed.info/id/733931002',
    'http://snomed.info/id/733930001',
    'http://snomed.info/id/733932009',
    'http://snomed.info/id/774081006',
  ];

  it.skipIf(!ANATOMY_EXISTS)('(c) has zero overlaps for the real middle-ear-structure regression sample', () => {
    const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');
    const result = extractUmlDiagram(model, MIDDLE_EAR_IRI, 4, { compositionProperties: SNOMED_PART_OF });
    assertNoOverlaps(result.nodes, result.edges);
  });

  // Direction-aware overlap check. Boxes MUST be built via `boxRect`, not the TB shortcut
  // (`x` = centre) — in LR `x` is the box's LEFT edge and `y` the vertical centre, so a naive
  // centre±half box mis-places every node and reports phantom edge-node overlaps that aren't there.
  const assertNoOverlapsDir = (nodes: DiagramNode[], edges: DiagramEdge[], direction: LayoutDirection): void => {
    const layout = computeLayout(nodes, edges, direction);
    const positions = new Map([...layout].map(([iri, p]) => [iri, { x: p.x, y: p.y }]));
    const boxes = new Map<string, NodeBox>();
    for (const n of nodes) {
      const b = boxRect(positions.get(n.iri)!, direction, NODE_WIDTH, NODE_HEIGHT);
      boxes.set(n.iri, { left: b.left, right: b.left + NODE_WIDTH, top: b.top, bottom: b.top + NODE_HEIGHT });
    }
    expect(detectNodeOverlaps(boxes)).toEqual([]);

    const farEdgeRoutes = computeFarEdgeRoutes(nodes, edges, direction);
    const routes = computeEdgeRoutes(positions, edges, NODE_WIDTH, NODE_HEIGHT, direction, farEdgeRoutes);
    const edgePaths = new Map<string, Array<{ x: number; y: number }>>();
    for (const [id, r] of routes) {
      const sb = boxRect(positions.get(r.sourceIri)!, direction, NODE_WIDTH, NODE_HEIGHT);
      const tb = boxRect(positions.get(r.targetIri)!, direction, NODE_WIDTH, NODE_HEIGHT);
      edgePaths.set(id, [{ x: sb.centerX, y: sb.centerY }, ...r.points, { x: tb.centerX, y: tb.centerY }]);
    }
    const edgeById = new Map(edges.map(e => [e.id, e]));
    const edgeOverlaps = detectEdgeNodeOverlaps(edgePaths, boxes, (edgeId) => {
      const e = edgeById.get(edgeId)!;
      return new Set([e.parentIri, e.childIri]);
    });
    expect(edgeOverlaps, `expected zero edge-node overlaps in ${direction}, got: ${JSON.stringify(edgeOverlaps)}`).toEqual([]);
  };

  it.skipIf(!ANATOMY_EXISTS)('(c-LR) has zero node AND edge-node overlaps in the LR direction too (not just TB)', () => {
    const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');
    const result = extractUmlDiagram(model, MIDDLE_EAR_IRI, 4, { compositionProperties: SNOMED_PART_OF });
    assertNoOverlapsDir(result.nodes, result.edges, 'LR');
    assertNoOverlapsDir(result.nodes, result.edges, 'TB');
  });

  it('actually engages structural (dummy-chain) routing for the deep fixture\'s multi-layer edges, not just the reactive fallback', () => {
    const farEdgeRoutes = computeFarEdgeRoutes(deepMultiParentFixture.nodes, deepMultiParentFixture.edges);
    const rootToX = deepMultiParentFixture.edges.find(e => e.parentIri === 'root' && e.childIri === 'X')!;
    const a2ToX = deepMultiParentFixture.edges.find(e => e.parentIri === 'A2' && e.childIri === 'X')!;

    expect(farEdgeRoutes.get(rootToX.id)).toHaveLength(3); // layers 1, 2, 3
    expect(farEdgeRoutes.get(a2ToX.id)).toHaveLength(1); // layer 3
  });
});

describe('crossing minimization (spec FR-004/SC-002)', () => {
  it('reduces the crossing count on the crossingFixture below its naive-declaration-order baseline (1 crossing)', () => {
    const { nodes, edges } = crossingFixture;
    const layout = computeLayout(nodes, edges);
    const positions = new Map([...layout].map(([iri, p]) => [iri, { x: p.x, y: p.y }]));
    const farEdgeRoutes = computeFarEdgeRoutes(nodes, edges);
    const routes = computeEdgeRoutes(positions, edges, NODE_WIDTH, NODE_HEIGHT, 'TB', farEdgeRoutes);

    const edgePaths = new Map<string, Array<{ x: number; y: number }>>();
    for (const [id, r] of routes) {
      const source = positions.get(r.sourceIri)!;
      const target = positions.get(r.targetIri)!;
      edgePaths.set(id, [source, ...r.points, target]);
    }

    const crossings = countPathCrossings(edgePaths);
    expect(crossings).toBeLessThan(1);
  });

  it('does not regress an already crossing-free shallow fixture (spec FR-008/SC-005)', () => {
    const nodes = [node('root', 0, true), node('a', 1), node('b', 1), node('c', 1)];
    const edges = [edge('root', 'a'), edge('root', 'b'), edge('root', 'c')];
    const layout = computeLayout(nodes, edges);
    const positions = new Map([...layout].map(([iri, p]) => [iri, { x: p.x, y: p.y }]));
    const farEdgeRoutes = computeFarEdgeRoutes(nodes, edges);
    const routes = computeEdgeRoutes(positions, edges, NODE_WIDTH, NODE_HEIGHT, 'TB', farEdgeRoutes);

    const edgePaths = new Map<string, Array<{ x: number; y: number }>>();
    for (const [id, r] of routes) {
      const source = positions.get(r.sourceIri)!;
      const target = positions.get(r.targetIri)!;
      edgePaths.set(id, [source, ...r.points, target]);
    }

    expect(countPathCrossings(edgePaths)).toBe(0);
  });
});
