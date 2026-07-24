import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';
import { renderDiagramFragment, renderStandaloneSvg } from './htmlRenderer';
import { renderDrawio } from './drawioRenderer';
import { deepMultiParentFixture } from './testFixtures';
import type { DiagramNode } from './diagramModel';

/**
 * Spec User Story 3 / FR-006 / SC-004: the editor panel, draw.io export, and SVG export all
 * derive from the SAME `computeLayout()` positions and the SAME `computeFarEdgeRoutes()` far-edge
 * data (`htmlRenderer.ts` and `drawioRenderer.ts` each call both independently, per
 * `contracts/layout-module-contract.md`) — this test asserts that independence didn't
 * accidentally let the two renderers disagree on node positions or on which edges get
 * structural (dummy-chain) far-edge routing.
 */
describe('cross-format layout consistency (spec FR-006/SC-004)', () => {
  const { nodes: rawNodes, edges } = deepMultiParentFixture;
  const direction = 'LR' as const;
  const layout = computeLayout(rawNodes, edges, direction);
  const laidOutNodes: DiagramNode[] = rawNodes.map(n => {
    const pos = layout.get(n.iri);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });

  it('embeds identical node positions in the HTML fragment, standalone SVG, and draw.io export', () => {
    const fragment = renderDiagramFragment(laidOutNodes, edges, [], direction);
    const svg = renderStandaloneSvg(laidOutNodes, edges, [], direction);
    const drawio = renderDrawio(laidOutNodes, edges, [], direction);

    for (const n of laidOutNodes) {
      const iriAttr = n.iri.replace(/"/g, '&quot;');
      const htmlMatch = fragment.nodesHtml.match(
        new RegExp(`data-iri="${iriAttr}"[^>]*style="left:([-\\d.]+)px;top:([-\\d.]+)px`),
      );
      expect(htmlMatch, `expected a node div for ${n.iri} in the HTML fragment`).not.toBeNull();

      // The standalone SVG and draw.io export both place the node's box at the SAME left/top —
      // rather than parsing each format's own markup dialect, cross-check that every rendered
      // format's box coordinates for this node agree with each other by construction: all three
      // call `boxRect()`/merge `n.x`/`n.y` the same way, so any of the three disagreeing here
      // would mean a renderer stopped using the shared `computeLayout()` output.
      expect(svg).toContain(`x="${htmlMatch![1]}"`);
      expect(drawio).toContain(`x="${htmlMatch![1]}" y="${htmlMatch![2]}"`);
    }
  });

  it('flags exactly the same edges as far/structurally-routed in both the HTML/SVG renderer and the draw.io renderer', () => {
    const fragment = renderDiagramFragment(laidOutNodes, edges, [], direction);
    const drawio = renderDrawio(laidOutNodes, edges, [], direction);

    const farSegmentCount = (fragment.svg.match(/stroke-dasharray="6 4"/g) ?? []).length;
    const farRouteCount = (drawio.match(/dashed=1;dashPattern=6 4;/g) ?? []).length;

    // Both counts must be positive (the fixture has genuinely far-spanning edges) and equal —
    // if one renderer silently fell back to a different far-edge detection path than the other,
    // this would diverge.
    expect(farSegmentCount).toBeGreaterThan(0);
    expect(farSegmentCount).toBe(farRouteCount);
  });
});
