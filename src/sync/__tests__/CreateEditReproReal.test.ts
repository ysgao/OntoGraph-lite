import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { syncAnnotationsToDocument } from '../AnnotationSync';
import { syncAxiomsToDocument } from '../AxiomSync';
import { insertNewEntity } from '../EntityCreationSync';
import { buildModelSegmentIndex, applyIncrementalSegmentUpdate, type EditSummary } from '../../model/SegmentIndex';
import { createEmptyModel, type EntitySegment, type OWLClass, type OntologyModel } from '../../model/OntologyModel';
import { FunctionalParser } from '../../parser/FunctionalParser';

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({ start: { line: s1, character: c1 }, end: { line: s2, character: c2 } })),
  Position: vi.fn((l, c) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => {
    const editsMap = new Map<string, Array<{ range: unknown; newText: string }>>();
    const add = (uri: { toString?: () => string }, range: unknown, newText: string) => {
      const k = uri.toString?.() ?? String(uri);
      if (!editsMap.has(k)) editsMap.set(k, []);
      editsMap.get(k)!.push({ range, newText });
    };
    return {
      replace: (u: { toString?: () => string }, r: unknown, t: string) => add(u, r, t),
      insert: (u: { toString?: () => string }, p: unknown, t: string) => add(u, { start: p, end: p }, t),
      delete: (u: { toString?: () => string }, r: unknown) => add(u, r, ''),
      entries: () => [...editsMap.entries()].map(([, v]) => [null, v]),
    };
  }),
  workspace: { fs: { readFile: vi.fn(), writeFile: vi.fn().mockResolvedValue(undefined) }, textDocuments: [], applyEdit: vi.fn().mockResolvedValue(true) },
  window: { showErrorMessage: vi.fn(), showInformationMessage: vi.fn(), showWarningMessage: vi.fn() },
}));

const REAL_FILE = '/Users/yoga/JavaApp/OntoGraph-lite/test-ontologies/anatomy.owl';

function makeUri(fsPath: string): vscode.Uri {
  return { fsPath, scheme: 'file', toString: () => `file:///${fsPath}` } as unknown as vscode.Uri;
}

function cloneSegment(seg: EntitySegment | undefined): EntitySegment | undefined {
  if (!seg) return undefined;
  return {
    startLine: seg.startLine, endLine: seg.endLine, startChar: seg.startChar, endChar: seg.endChar,
    lineIndices: seg.lineIndices ? new Int32Array(seg.lineIndices) : undefined,
    lineCharStarts: seg.lineCharStarts ? new Int32Array(seg.lineCharStarts) : undefined,
  };
}

function updateFunctionalSyncHints(
  entityIri: string, updatedText: string, segment: EntitySegment | undefined, gciSegment: EntitySegment | undefined,
  closingParenLine: number | undefined, gciInsertLine: number | undefined, editSummaries: EditSummary[],
) {
  if (editSummaries.length === 0) return { segment, gciSegment, closingParenLine, gciInsertLine };
  const tempModel = createEmptyModel('sync-hints.ofn');
  tempModel.rawContent = updatedText;
  tempModel.sourceFormat = 'functional';
  tempModel.closingParenLine = closingParenLine;
  tempModel.gciInsertLine = gciInsertLine;
  const cs = cloneSegment(segment);
  if (cs) tempModel.entitySegments = new Map([[entityIri, cs]]);
  const cg = cloneSegment(gciSegment);
  if (cg) tempModel.gciSegments = new Map([[entityIri, cg]]);
  applyIncrementalSegmentUpdate(tempModel, entityIri, editSummaries);
  return {
    segment: tempModel.entitySegments?.get(entityIri), gciSegment: tempModel.gciSegments?.get(entityIri),
    closingParenLine: tempModel.closingParenLine, gciInsertLine: tempModel.gciInsertLine,
  };
}

async function saveEntity(model: OntologyModel, entity: OWLClass): Promise<void> {
  const uri = makeUri('anatomy.owl');
  const fmt = model.sourceFormat;
  const baseContent = model.rawContent;
  const seg = model.entitySegments?.get(entity.iri);
  const gciSeg = model.gciSegments?.get(entity.iri);
  const cpLine = model.closingParenLine;
  const giLine = model.gciInsertLine;
  const annot = await syncAnnotationsToDocument(uri, entity, fmt, baseContent, seg, true);
  const axiomHints = fmt === 'functional' && annot?.updatedText
    ? updateFunctionalSyncHints(entity.iri, annot.updatedText, seg, gciSeg, cpLine, giLine, annot.editSummaries)
    : { segment: seg, gciSegment: gciSeg, closingParenLine: cpLine, gciInsertLine: giLine };
  const axiom = await syncAxiomsToDocument(
    uri, entity, fmt, annot?.updatedText ?? baseContent,
    axiomHints.segment, axiomHints.gciSegment, axiomHints.closingParenLine, axiomHints.gciInsertLine, true,
  );
  const updatedText = axiom?.updatedText ?? annot?.updatedText;
  if (updatedText !== undefined) {
    model.rawContent = updatedText;
    if ((annot?.editSummaries.length ?? 0) > 0) applyIncrementalSegmentUpdate(model, entity.iri, annot!.editSummaries);
    if ((axiom?.editSummaries.length ?? 0) > 0) applyIncrementalSegmentUpdate(model, entity.iri, axiom!.editSummaries);
  }
}

function makeNewClass(iri: string, parentIri: string | undefined, labels: Record<string, string[]>): OWLClass {
  return {
    iri, type: 'class', labels, annotations: {},
    superClassIris: parentIri ? [parentIri] : [],
    equivalentClassIris: [], disjointClassIris: [],
    superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
  };
}

function createEntityInModel(model: OntologyModel, iri: string, parentIri: string | undefined): OWLClass {
  const entity = makeNewClass(iri, parentIri, {});
  model.rawContent = insertNewEntity(model.rawContent, entity, model);
  model.classes.set(iri, entity);
  model.entitySegments = undefined;
  buildModelSegmentIndex(model);
  return entity;
}

function assertIntact(model: OntologyModel, where: string): void {
  const text = model.rawContent;
  const tail = text.slice(-400);
  const hasClose = /\n\)\s*$/.test(text.trimEnd() + '\n') || text.trimEnd().endsWith(')');
  const hasChain = text.includes('SubObjectPropertyOf(ObjectPropertyChain(');
  expect(hasChain, `${where}: property chains must survive. tail=\n${tail}`).toBe(true);
  expect(hasClose, `${where}: closing ) must survive. tail=\n${tail}`).toBe(true);
}

const E1 = 'http://snomed.info/id/1401540003';
const E2 = 'http://snomed.info/id/1401541004';
const PARENT = 'http://snomed.info/id/281723000';

describe('Real anatomy.owl create+edit nested entities', () => {
  it('preserves GCI section and closing paren', async () => {
    const text = fs.readFileSync(REAL_FILE, 'utf8');
    const model = new FunctionalParser(text, 'file:///anatomy.owl').parse();
    model.sourceUri = 'file:///anatomy.owl';
    model.sourceFormat = 'functional';
    model.rawContent = text;
    buildModelSegmentIndex(model);
    assertIntact(model, 'initial');

    createEntityInModel(model, E1, PARENT);
    assertIntact(model, 'after create E1');

    const e1 = model.classes.get(E1) as OWLClass;
    e1.labels = { en: ['Skin structure of chest wall'] };
    await saveEntity(model, e1);
    assertIntact(model, 'after save E1 label');

    createEntityInModel(model, E2, E1);
    assertIntact(model, 'after create E2');

    const e2 = model.classes.get(E2) as OWLClass;
    e2.labels = { en: ['Entire skin of chest wall'] };
    await saveEntity(model, e2);
    assertIntact(model, 'after save E2 label');

    e2.superClassIris = ['http://snomed.info/id/123037004'];
    await saveEntity(model, e2);
    assertIntact(model, 'after edit E2 SubClassOf');
  }, 60000);
});
