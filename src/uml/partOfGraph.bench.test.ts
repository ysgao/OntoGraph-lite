/**
 * Large-ontology scale check — anatomy.owl (~28 MB, ~36k classes, SNOMED CT anatomy subset)
 * and bfo-core.ofn (~94 KB). Verifies spec SC-001 (<5s to view), SC-004 (<3s depth-change
 * re-render), and SC-005 (responsive + visible cap indicator under a large relationship count)
 * at the project's existing large-ontology benchmark scale (conductor/workflow.md quality gate).
 *
 * Skipped automatically when anatomy.owl is absent (it is not committed to the repo).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { ParserRegistry } from '../parser/ParserRegistry';
import { buildDiagramMessage } from '../commands/generateUmlDiagram';

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn(), createWebviewPanel: vi.fn() },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })) },
  ViewColumn: { Beside: 2 },
  Uri: { joinPath: vi.fn() },
}));

const ANATOMY_PATH = path.resolve(process.cwd(), 'test-ontologies/anatomy.owl');
const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);
const BFO_PATH = path.resolve(process.cwd(), 'test-ontologies/bfo-core.ofn');

// "Body structure" (123037004) — a broad, high-fan-out SNOMED anatomy concept, used to exercise
// the node cap (spec SC-005) at real ontology scale rather than only the small unit-test fixture.
const BODY_STRUCTURE_IRI = 'http://snomed.info/id/123037004';

describe.skipIf(!ANATOMY_EXISTS)('UML diagram generation — anatomy.owl scale (SC-001, SC-005)', () => {
  it('produces a capped, responsive diagram for a high-fan-out concept in under 5s (SC-001)', () => {
    const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');

    const start = Date.now();
    const msg = buildDiagramMessage(model, BODY_STRUCTURE_IRI, 2, []);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(msg.nodeCapReached).toBe(true);
    expect(msg.nodes.length).toBeGreaterThan(0);
    expect(msg.nodes.some(n => n.hasHiddenRelations)).toBe(true);
  });

  it('re-renders at a changed depth in under 3s (SC-004)', () => {
    const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');

    const start = Date.now();
    buildDiagramMessage(model, BODY_STRUCTURE_IRI, 3, []);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);
  });
});

describe('UML diagram generation — bfo-core.ofn scale', () => {
  it('completes well under budget on the bfo-core.ofn benchmark file', () => {
    const raw = fs.readFileSync(BFO_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///bfo-core.ofn');
    const [firstIri] = model.classes.keys();
    expect(firstIri).toBeDefined();

    const start = Date.now();
    const msg = buildDiagramMessage(model, firstIri, 3, []);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(msg.type).toBe('updateDiagram');
  });
});
