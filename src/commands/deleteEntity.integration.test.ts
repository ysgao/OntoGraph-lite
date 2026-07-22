import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Uri } from 'vscode';
import { computeUpdatedText } from '../views/EntityEditorPanel';
import {
  clearEntityAxiomBearingFields,
  findDeclarationAndHeaderLines,
  collapseDoubleBlankLines,
  reparentSubtype,
  ownSuperIris,
} from '../sync/EntityDeletionSync';
import { ParserRegistry } from '../parser/ParserRegistry';
import { buildModelSegmentIndex, applyIncrementalSegmentUpdate } from '../model/SegmentIndex';

/**
 * Integration test (029-delete-entity-subtypes): exercises the REAL
 * `computeUpdatedText` (EntityEditorPanel.ts → AnnotationSync/AxiomSync) plus
 * the real `EntityDeletionSync.ts` helpers against actual OWL Functional
 * Syntax text — nothing here is mocked except the `vscode` module surface
 * those sync layers need (matching the shape already used by
 * `AxiomSync.test.ts`/`AnnotationSync.test.ts`). This closes the gap left by
 * `deleteEntity.test.ts`, which mocks `computeUpdatedText` entirely to focus
 * on orchestration; this file instead verifies the actual file-text output.
 */

const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('vscode', () => ({
  Range: vi.fn((s1: number, c1: number, s2: number, c2: number) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l: number, c: number) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => {
    const editsMap = new Map<string, Array<{ range: unknown; newText: string }>>();
    const add = (uri: { toString?: () => string }, range: unknown, newText: string) => {
      const k = uri.toString?.() ?? String(uri);
      if (!editsMap.has(k)) editsMap.set(k, []);
      editsMap.get(k)!.push({ range, newText });
    };
    return {
      replace: (uri: { toString?: () => string }, range: unknown, newText: string) => add(uri, range, newText),
      insert: (uri: { toString?: () => string }, pos: unknown, newText: string) => add(uri, { start: pos, end: pos }, newText),
      delete: (uri: { toString?: () => string }, range: unknown) => add(uri, range, ''),
      entries: () => [...editsMap.entries()].map(([, v]) => [null, v]),
    };
  }),
  workspace: {
    fs: { readFile: mockReadFile, writeFile: mockWriteFile },
    textDocuments: [],
    applyEdit: vi.fn().mockResolvedValue(true),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
    activeTextEditor: undefined,
  },
  Uri: { parse: vi.fn((s: string) => ({ toString: () => s, fsPath: s, path: s })) },
  ThemeColor: vi.fn((id: string) => ({ id })),
  OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
}));

function makeUri(s: string) {
  return { fsPath: s, toString: () => s, path: s } as unknown as Uri;
}

const ONT = [
  'Prefix(:=<http://ex.org/>)',
  'Ontology(<http://ex.org/ont>',
  'Declaration(Class(:Parent))',
  'Declaration(Class(:Child))',
  'Declaration(Class(:Grandchild))',
  '',
  '# Class: <http://ex.org/Parent> (Parent)',
  'AnnotationAssertion(rdfs:label :Parent "Parent"@en)',
  '',
  '# Class: <http://ex.org/Child> (Child)',
  'AnnotationAssertion(rdfs:label :Child "Child"@en)',
  'SubClassOf(:Child :Parent)',
  '',
  '# Class: <http://ex.org/Grandchild> (Grandchild)',
  'AnnotationAssertion(rdfs:label :Grandchild "Grandchild"@en)',
  'SubClassOf(:Grandchild :Child)',
  ')',
].join('\n');

async function parseAndIndex() {
  const model = ParserRegistry.parse(ONT, 'auto', 'file:///test.ofn');
  buildModelSegmentIndex(model);
  return model;
}

describe('deleteEntity integration — real computeUpdatedText + EntityDeletionSync against actual OWL text', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('fully removes a leaf-equivalent entity’s declaration, header, annotation, and axiom lines', async () => {
    const model = await parseAndIndex();
    const uri = makeUri('file:///test.ofn');
    const iri = 'http://ex.org/Grandchild';
    const entity = model.classes.get(iri)!;
    expect(entity).toBeDefined();

    clearEntityAxiomBearingFields(entity);

    const seg = model.entitySegments?.get(iri);
    const { text, annotEditSummaries, axiomEditSummaries } = await computeUpdatedText(
      uri, entity, 'functional', model.rawContent, seg, undefined,
      model.closingParenLine, model.gciInsertLine,
    );
    expect(text).toBeDefined();
    model.rawContent = text!;
    if (annotEditSummaries.length) applyIncrementalSegmentUpdate(model, iri, annotEditSummaries);
    if (axiomEditSummaries.length) applyIncrementalSegmentUpdate(model, iri, axiomEditSummaries);

    expect(model.rawContent).not.toContain('AnnotationAssertion(rdfs:label :Grandchild');
    expect(model.rawContent).not.toContain('SubClassOf(:Grandchild :Child)');

    // Declaration + header comment removal (never touched by computeUpdatedText).
    const lines = model.rawContent.split('\n');
    const removeLines = findDeclarationAndHeaderLines(model, iri, entity, lines);
    expect(removeLines.length).toBeGreaterThan(0);
    const kept = lines.filter((_, idx) => !removeLines.includes(idx));
    const finalText = collapseDoubleBlankLines(kept).join('\n');

    expect(finalText).not.toContain('Grandchild');
    // Siblings/parents untouched.
    expect(finalText).toContain('Declaration(Class(:Parent))');
    expect(finalText).toContain('Declaration(Class(:Child))');
    expect(finalText).toContain('SubClassOf(:Child :Parent)');
    // No accidental double-blank runs left behind.
    expect(finalText).not.toMatch(/\n\n\n/);

    // Re-parsing the final text confirms it is still structurally valid and Grandchild is gone.
    const reparsed = ParserRegistry.parse(finalText, 'auto', 'file:///test.ofn');
    expect(reparsed.classes.has(iri)).toBe(false);
    expect(reparsed.classes.has('http://ex.org/Child')).toBe(true);
    expect(reparsed.classes.has('http://ex.org/Parent')).toBe(true);
  });

  it('reparents Grandchild to Child’s own superclass (Parent) after deleting Child, via real sync', async () => {
    const model = await parseAndIndex();
    const uri = makeUri('file:///test.ofn');
    const childIri = 'http://ex.org/Child';
    const grandchildIri = 'http://ex.org/Grandchild';
    const childEntity = model.classes.get(childIri)!;
    const grandchildEntity = model.classes.get(grandchildIri)!;

    // Reparent Grandchild (Child's direct subtype) to Child's own supers (Parent).
    const applied = reparentSubtype(grandchildEntity, childIri, ownSuperIris(childEntity));
    expect(applied).toBe(true);
    expect(grandchildEntity.superClassIris).toEqual(['http://ex.org/Parent']);

    const seg = model.entitySegments?.get(grandchildIri);
    const { text, annotEditSummaries, axiomEditSummaries } = await computeUpdatedText(
      uri, grandchildEntity, 'functional', model.rawContent, seg, undefined,
      model.closingParenLine, model.gciInsertLine,
    );
    expect(text).toBeDefined();
    model.rawContent = text!;
    if (annotEditSummaries.length) applyIncrementalSegmentUpdate(model, grandchildIri, annotEditSummaries);
    if (axiomEditSummaries.length) applyIncrementalSegmentUpdate(model, grandchildIri, axiomEditSummaries);

    expect(model.rawContent).not.toContain('SubClassOf(:Grandchild :Child)');
    expect(model.rawContent).toContain('SubClassOf(:Grandchild :Parent)');

    const reparsed = ParserRegistry.parse(model.rawContent, 'auto', 'file:///test.ofn');
    expect(reparsed.classes.get(grandchildIri)?.superClassIris ?? []).toEqual(['http://ex.org/Parent']);
  });
});
