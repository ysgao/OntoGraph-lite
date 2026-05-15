/**
 * Principle IV benchmark — anatomy.owl (28 MB, ~302 k lines, OWL Functional Syntax).
 *
 * Verifies that entity-scoped sync functions remain sub-second on a SNOMED CT–scale
 * file.  The suite is skipped automatically when anatomy.owl is absent from the
 * repo (it is not committed; developers must obtain it separately).
 *
 * Both sync calls use a no-op fixture (model == file) so applyEdit is never reached
 * and the timing captures only the scan-and-compare path.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as vscode from 'vscode';
import { syncAnnotationsToDocument } from '../AnnotationSync';
import { syncAxiomsToDocument } from '../AxiomSync';
import type { OWLClass } from '../../model/OntologyModel';

const { mockApplyEdit } = vi.hoisted(() => ({
  mockApplyEdit: vi.fn().mockResolvedValue(true),
}));

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l, c) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => ({
    replace: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  })),
  workspace: { applyEdit: mockApplyEdit },
  window: { showInformationMessage: vi.fn() },
}));

const ANATOMY_PATH = path.resolve(process.cwd(), 'test-ontologies/anatomy.owl');
const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);

// Fixture: Class <http://snomed.info/id/1003601008> "All entire sutures of skull"
// anatomy.owl lines 36119-36123:
//   AnnotationAssertion(rdfs:label <...1003601008> "All entire sutures of skull"@en)
//   AnnotationAssertion(<skos:prefLabel> <...1003601008> "All entire sutures of skull"@en)
//   SubClassOf(<...1003601008> <...244509003>)
const BENCH_IRI  = 'http://snomed.info/id/1003601008';
const SUPER_IRI  = 'http://snomed.info/id/244509003';
const SKOS_PREF  = 'http://www.w3.org/2004/02/skos/core#prefLabel';

const benchEntity: OWLClass = {
  iri: BENCH_IRI,
  type: 'class',
  labels: { en: ['All entire sutures of skull'] },
  annotations: { [SKOS_PREF]: ['All entire sutures of skull@en'] },
  superClassIris: [SUPER_IRI],
  equivalentClassIris: [],
  disjointClassIris: [],
  superClassExpressions: [],
  equivalentClassExpressions: [],
  gciExpressions: [],
};

function makeAnatDoc(text: string): vscode.TextDocument {
  const lines = text.split('\n');
  return {
    getText: () => text,
    lineAt: (i: number) => ({
      range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i]?.length ?? 0 } },
      rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
      text: lines[i] ?? '',
    }),
    uri: { fsPath: 'anatomy.owf', toString: () => 'file:///anatomy.owf' },
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}

describe.skipIf(!ANATOMY_EXISTS)('Principle IV — anatomy.owl sync performance', () => {
  let doc: vscode.TextDocument;

  beforeAll(() => {
    const text = fs.readFileSync(ANATOMY_PATH, 'utf8');
    doc = makeAnatDoc(text);
  });

  it('syncAnnotationsToDocument: no-op on 302k-line file completes in < 500 ms', async () => {
    const t0 = performance.now();
    const result = await syncAnnotationsToDocument(doc, benchEntity, 'functional');
    const elapsed = performance.now() - t0;

    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(500);
  });

  it('syncAxiomsToDocument: no-op on 302k-line file completes in < 500 ms', async () => {
    const t0 = performance.now();
    const result = await syncAxiomsToDocument(doc, benchEntity, 'functional');
    const elapsed = performance.now() - t0;

    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(500);
  });
});
