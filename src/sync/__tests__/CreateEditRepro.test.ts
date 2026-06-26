import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { syncAnnotationsToDocument } from '../AnnotationSync';
import { syncAxiomsToDocument } from '../AxiomSync';
import { insertNewEntity } from '../EntityCreationSync';
import { buildModelSegmentIndex, applyIncrementalSegmentUpdate, type EditSummary } from '../../model/SegmentIndex';
import { createEmptyModel, type EntitySegment, type OWLClass, type OntologyModel } from '../../model/OntologyModel';

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l, c) => ({ line: l, character: c })),
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
    fs: { readFile: vi.fn(), writeFile: vi.fn().mockResolvedValue(undefined) },
    textDocuments: [],
    applyEdit: vi.fn().mockResolvedValue(true),
  },
  window: { showErrorMessage: vi.fn(), showInformationMessage: vi.fn(), showWarningMessage: vi.fn() },
}));

function makeUri(fsPath: string): vscode.Uri {
  return { fsPath, scheme: 'file', toString: () => `file:///${fsPath}` } as unknown as vscode.Uri;
}

function cloneSegment(seg: EntitySegment | undefined): EntitySegment | undefined {
  if (!seg) return undefined;
  return {
    startLine: seg.startLine, endLine: seg.endLine,
    startChar: seg.startChar, endChar: seg.endChar,
    lineIndices: seg.lineIndices ? new Int32Array(seg.lineIndices) : undefined,
    lineCharStarts: seg.lineCharStarts ? new Int32Array(seg.lineCharStarts) : undefined,
  };
}

// Replicate updateFunctionalSyncHints from EntityEditorPanel.ts
function updateFunctionalSyncHints(
  entityIri: string,
  updatedText: string,
  segment: EntitySegment | undefined,
  gciSegment: EntitySegment | undefined,
  closingParenLine: number | undefined,
  gciInsertLine: number | undefined,
  editSummaries: EditSummary[],
) {
  if (editSummaries.length === 0) {
    return { segment, gciSegment, closingParenLine, gciInsertLine };
  }
  const tempModel = createEmptyModel('sync-hints.ofn');
  tempModel.rawContent = updatedText;
  tempModel.sourceFormat = 'functional';
  tempModel.closingParenLine = closingParenLine;
  tempModel.gciInsertLine = gciInsertLine;
  const clonedSegment = cloneSegment(segment);
  if (clonedSegment) tempModel.entitySegments = new Map([[entityIri, clonedSegment]]);
  const clonedGciSegment = cloneSegment(gciSegment);
  if (clonedGciSegment) tempModel.gciSegments = new Map([[entityIri, clonedGciSegment]]);
  applyIncrementalSegmentUpdate(tempModel, entityIri, editSummaries);
  return {
    segment: tempModel.entitySegments?.get(entityIri),
    gciSegment: tempModel.gciSegments?.get(entityIri),
    closingParenLine: tempModel.closingParenLine,
    gciInsertLine: tempModel.gciInsertLine,
  };
}

// Replicate computeUpdatedText + the post-compute state update from EntityEditorPanel.ts
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
    const annotEditSummaries = annot?.editSummaries ?? [];
    const axiomEditSummaries = axiom?.editSummaries ?? [];
    if (annotEditSummaries.length > 0) applyIncrementalSegmentUpdate(model, entity.iri, annotEditSummaries);
    if (axiomEditSummaries.length > 0) applyIncrementalSegmentUpdate(model, entity.iri, axiomEditSummaries);
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

// Build a synthetic anatomy-like file: declarations, class clusters, GCI section, property chains, close.
function buildSyntheticFile(): string {
  return [
    'Prefix(:=<http://snomed.info/id/>)',
    'Prefix(owl:=<http://www.w3.org/2002/07/owl#>)',
    'Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)',
    'Prefix(skos:=<http://www.w3.org/2004/02/skos/core#>)',
    'Ontology(<http://snomed.info/sct>',
    // Uniform column-0 indentation, mirroring the real anatomy.owl (Protégé/SNOMED style).
    'Declaration(Class(<http://snomed.info/id/281723000>))',
    'Declaration(Class(<http://snomed.info/id/9999005>))',
    'Declaration(Class(<http://snomed.info/id/123037004>))',
    'Declaration(Class(<http://snomed.info/id/733928003>))',
    'Declaration(Class(<http://snomed.info/id/362149005>))',
    '',
    '# Class: <http://snomed.info/id/9999005> (Duodenal ampulla structure)',
    'AnnotationAssertion(rdfs:label <http://snomed.info/id/9999005> "Duodenal ampulla structure"@en)',
    'EquivalentClasses(<http://snomed.info/id/9999005> ObjectIntersectionOf(<http://snomed.info/id/123037004> ObjectSomeValuesFrom(<http://snomed.info/id/733928003> <http://snomed.info/id/362149005>)))',
    '',
    'SubClassOf(ObjectIntersectionOf(<http://snomed.info/id/123037004> ObjectSomeValuesFrom(<http://snomed.info/id/733928003> <http://snomed.info/id/281723000>)) <http://snomed.info/id/9999005>)',
    'SubObjectPropertyOf(ObjectPropertyChain(<http://snomed.info/id/127484005> <http://snomed.info/id/733930001>) <http://snomed.info/id/127484005>)',
    ')',
    '',
  ].join('\n');
}

function parseModel(text: string): OntologyModel {
  const model = createEmptyModel('anatomy.owl');
  model.sourceUri = 'file:///anatomy.owl';
  model.sourceFormat = 'functional';
  model.rawContent = text;
  // Register the existing classes so buildModelSegmentIndex's knownTokens has them.
  for (const id of ['281723000', '9999005', '123037004', '733928003', '362149005', '733930001', '127484005']) {
    const iri = `http://snomed.info/id/${id}`;
    model.classes.set(iri, makeNewClass(iri, undefined, {}));
  }
  buildModelSegmentIndex(model);
  return model;
}

function createEntityInModel(model: OntologyModel, iri: string, parentIri: string | undefined): OWLClass {
  const entity = makeNewClass(iri, parentIri, {});
  model.rawContent = insertNewEntity(model.rawContent, entity, model);
  model.classes.set(iri, entity);
  model.entitySegments = undefined;
  buildModelSegmentIndex(model);
  return entity;
}

function assertFileIntact(model: OntologyModel, where: string): void {
  const text = model.rawContent;
  const lines = text.split('\n');
  const hasClose = lines.some(l => l.trim() === ')');
  const hasGci = text.includes('SubClassOf(ObjectIntersectionOf(');
  const hasChain = text.includes('SubObjectPropertyOf(ObjectPropertyChain(');
  expect(hasClose, `${where}: closing ) must survive`).toBe(true);
  expect(hasGci, `${where}: GCI section must survive`).toBe(true);
  expect(hasChain, `${where}: property chains must survive`).toBe(true);
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let pos = text.indexOf(needle);
  while (pos >= 0) {
    count++;
    pos = text.indexOf(needle, pos + needle.length);
  }
  return count;
}

function assertNewClassClusterOrder(model: OntologyModel, iri: string, label: string): void {
  const lines = model.rawContent.split('\n');
  const headerIdx = lines.findIndex(l => l.includes(`# Class: <${iri}>`));
  const annotationIdxs = lines
    .map((l, i) => l.includes(`AnnotationAssertion(`) && l.includes(`<${iri}>`) ? i : -1)
    .filter(i => i >= 0);
  const axiomIdxs = lines
    .map((l, i) => l.includes(`SubClassOf(<${iri}>`) ? i : -1)
    .filter(i => i >= 0);

  expect(headerIdx, `${iri}: cluster header must exist`).toBeGreaterThan(0);
  expect(annotationIdxs.length, `${iri}: annotations must exist`).toBeGreaterThan(0);
  expect(axiomIdxs.length, `${iri}: subclass axiom must exist once`).toBe(1);
  expect(Math.min(...annotationIdxs), `${iri}: annotations must follow header`).toBeGreaterThan(headerIdx);
  expect(Math.max(...annotationIdxs), `${iri}: annotations must precede logical axioms`).toBeLessThan(axiomIdxs[0]);
  // New cluster must match the fixture's column-0 cluster format — the writer must
  // not impose its own (e.g. 2-space) indentation and thereby change the file format.
  expect(lines[headerIdx], `${iri}: cluster header must match file (column 0) format`).toMatch(/^# Class: /);
  for (const idx of annotationIdxs) {
    expect(lines[idx], `${iri}: annotation line must match file (column 0) format`).toMatch(/^AnnotationAssertion\(/);
  }
  expect(model.rawContent).toContain(`AnnotationAssertion(rdfs:label <${iri}> "${label}"@en)`);
}

const E1 = 'http://snomed.info/id/1401540003';
const E2 = 'http://snomed.info/id/1401541004';
const PARENT = 'http://snomed.info/id/281723000';

describe('Create + Edit second entity does not corrupt file', () => {
  it('preserves GCI section and closing paren through create+save of two nested entities', async () => {
    const model = parseModel(buildSyntheticFile());
    assertFileIntact(model, 'initial');

    // 1. Create entity 1 (subclass of existing 281723000)
    createEntityInModel(model, E1, PARENT);
    assertFileIntact(model, 'after create E1');

    // 2. Save entity 1 label
    const e1 = model.classes.get(E1) as OWLClass;
    e1.labels = { en: ['Skin structure of chest wall'] };
    await saveEntity(model, e1);
    assertFileIntact(model, 'after save E1 label');
    assertNewClassClusterOrder(model, E1, 'Skin structure of chest wall');

    // 3. Create entity 2 (subclass of entity 1)
    createEntityInModel(model, E2, E1);
    assertFileIntact(model, 'after create E2');

    // 4. Save entity 2 label
    const e2 = model.classes.get(E2) as OWLClass;
    e2.labels = { en: ['Entire skin of chest wall'] };
    await saveEntity(model, e2);
    assertFileIntact(model, 'after save E2 label');
    assertNewClassClusterOrder(model, E2, 'Entire skin of chest wall');

    // 5. Edit entity 2 SubClassOf axiom (change parent)
    e2.superClassIris = ['http://snomed.info/id/123037004'];
    await saveEntity(model, e2);
    assertFileIntact(model, 'after edit E2 SubClassOf');
    assertNewClassClusterOrder(model, E2, 'Entire skin of chest wall');
    expect(countOccurrences(model.rawContent, `SubClassOf(<${E2}>`)).toBe(1);

    // Final: verify both clusters present and well-formed
    expect(model.rawContent).toContain('# Class: <http://snomed.info/id/1401540003>');
    expect(model.rawContent).toContain('# Class: <http://snomed.info/id/1401541004>');
  });
});
