import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { syncAxiomsToDocument } from '../AxiomSync';
import type { OWLClass } from '../../model/OntologyModel';
import { temporaryClassIris } from '../../views/DLQueryState';

const { mockReplace, mockInsert, mockDelete, mockApplyEdit } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockApplyEdit: vi.fn().mockResolvedValue(true),
}));

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l, c) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => ({
    replace: mockReplace,
    insert: mockInsert,
    delete: mockDelete,
  })),
  workspace: {
    applyEdit: mockApplyEdit,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockApplyEdit.mockResolvedValue(true);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFunctionalDoc(content: string): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    getText: () => content,
    lineAt: (i: number) => ({
      range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i]?.length ?? 0 } },
      rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
      text: lines[i] ?? '',
    }),
    uri: { fsPath: 'test.ofn', toString: () => 'file:///test.ofn' },
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}

const A = 'http://example.org#A';
const B = 'http://example.org#B';
const C = 'http://example.org#C';
const D = 'http://example.org#D';
const F = 'http://example.org#F';

function makeClass(
  superClassIris: string[],
  equivalentClassIris: string[] = [],
): OWLClass {
  return {
    iri: A,
    type: 'class',
    labels: {},
    annotations: {},
    superClassIris,
    equivalentClassIris,
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

// ── Zero-indent style (bfo-core.ofn) ──────────────────────────────────────────

describe('syncAxiomsFunctional — zero-indent style', () => {
  it('inserts SubClassOf using detected zero indent when file has no indentation', async () => {
    // bfo-core.ofn style: axioms at column 0, no leading whitespace
    const content = [
      `Ontology(<http://example.org/ont>`,          // 0
      `Declaration(Class(<${A}>))`,                  // 1
      `AnnotationAssertion(rdfs:label <${A}> "A")`,  // 2
      `)`,                                           // 3
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([B]), 'functional');

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${B}>`);
    expect(insertedText).toContain('SubClassOf');
  });

  it('does not apply edit when zero-indent file already has the axiom', async () => {
    const content = [
      `Ontology(<http://example.org/ont>`,           // 0
      `Declaration(Class(<${A}>))`,                   // 1
      `AnnotationAssertion(rdfs:label <${A}> "A")`,  // 2
      `SubClassOf(<${A}> <${B}>)`,                   // 3
      `)`,                                            // 4
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([B]), 'functional');
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('adds new SubClassOf to zero-indent file with existing SubClassOf', async () => {
    const content = [
      `Ontology(<http://example.org/ont>`,           // 0
      `Declaration(Class(<${A}>))`,                   // 1
      `AnnotationAssertion(rdfs:label <${A}> "A")`,  // 2
      `SubClassOf(<${A}> <${B}>)`,                   // 3
      `)`,                                            // 4
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([B, C]), 'functional');

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();

    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${C}>`);
    expect(insertedText).toContain('SubClassOf');
  });
});

// ── Original integration test (preserved) ─────────────────────────────────────

describe('AxiomSync Clustered Functional Syntax', () => {
  it('should sync axioms into an existing entity cluster (replace B→C)', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${A}>))`,
      `  AnnotationAssertion(rdfs:label <${A}> "Class A")`,
      '',
      `  SubClassOf(<${A}> <${B}>)`,
      ')',
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([C]), 'functional');
    expect(mockApplyEdit).toHaveBeenCalled();
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────────

describe('syncAxiomsFunctional — idempotency', () => {
  it('does not apply any edit when axioms are unchanged', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${A}>))`,
      `  SubClassOf(<${A}> <${B}>)`,
      ')',
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([B]), 'functional');
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply any edit when EquivalentClasses + SubClassOf are both unchanged', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${A}>))`,
      `  EquivalentClasses(<${A}> <${F}>)`,
      `  SubClassOf(<${A}> <${B}>)`,
      ')',
    ].join('\n');

    await syncAxiomsToDocument(
      makeFunctionalDoc(content),
      makeClass([B], [F]),
      'functional',
    );
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply any edit when entity has no axioms and model has none', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${A}>))`,
      ')',
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([]), 'functional');
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

// ── Minimal diff ───────────────────────────────────────────────────────────────

describe('syncAxiomsFunctional — minimal diff', () => {
  it('inserts first SubClassOf for entity with no existing axioms', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',   // 0
      `  Declaration(Class(<${A}>))`,         // 1
      `  AnnotationAssertion(rdfs:label <${A}> "A"@en)`,  // 2
      ')',                                    // 3
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([B]), 'functional');

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${B}>`);
    expect(insertedText).toContain('SubClassOf');
  });

  it('adds new SubClassOf after existing SubClassOf without touching EquivalentClasses', async () => {
    // File: EquivalentClasses (line 2), SubClassOf B (line 3)
    // Model adds SubClassOf C
    const content = [
      'Ontology(<http://example.org/ont>',    // 0
      `  Declaration(Class(<${A}>))`,          // 1
      `  EquivalentClasses(<${A}> <${F}>)`,   // 2
      `  SubClassOf(<${A}> <${B}>)`,          // 3
      ')',                                     // 4
    ].join('\n');

    await syncAxiomsToDocument(
      makeFunctionalDoc(content),
      makeClass([B, C], [F]),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    // Insert must be at line 4 (after SubClassOf B at line 3)
    const insertPos: { line: number } = mockInsert.mock.calls[0][1];
    expect(insertPos.line).toBe(4);

    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${C}>`);
    expect(insertedText).toContain('SubClassOf');
    expect(insertedText).not.toContain(`<${F}>`);
  });

  it('adds EquivalentClasses before existing SubClassOf', async () => {
    // File: SubClassOf B (line 2). Model adds EquivalentClasses F.
    const content = [
      'Ontology(<http://example.org/ont>',   // 0
      `  Declaration(Class(<${A}>))`,         // 1
      `  SubClassOf(<${A}> <${B}>)`,         // 2
      ')',                                    // 3
    ].join('\n');

    await syncAxiomsToDocument(
      makeFunctionalDoc(content),
      makeClass([B], [F]),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    // EquivalentClasses must be inserted BEFORE SubClassOf B (at line 2)
    const insertPos: { line: number } = mockInsert.mock.calls[0][1];
    expect(insertPos.line).toBe(2);

    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain('EquivalentClasses');
    expect(insertedText).toContain(`<${F}>`);
  });

  it('removes a SubClassOf without touching EquivalentClasses', async () => {
    // File: EquivalentClasses F (line 2), SubClassOf B (line 3).
    // Model removes SubClassOf B.
    const content = [
      'Ontology(<http://example.org/ont>',    // 0
      `  Declaration(Class(<${A}>))`,          // 1
      `  EquivalentClasses(<${A}> <${F}>)`,   // 2
      `  SubClassOf(<${A}> <${B}>)`,          // 3
      ')',                                     // 4
    ].join('\n');

    await syncAxiomsToDocument(
      makeFunctionalDoc(content),
      makeClass([], [F]),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces SubClassOf B with SubClassOf C at the same position', async () => {
    // File: SubClassOf B (line 2). Model changes B → C.
    const content = [
      'Ontology(<http://example.org/ont>',   // 0
      `  Declaration(Class(<${A}>))`,         // 1
      `  SubClassOf(<${A}> <${B}>)`,         // 2
      ')',                                    // 3
    ].join('\n');

    await syncAxiomsToDocument(makeFunctionalDoc(content), makeClass([C]), 'functional');

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();

    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${C}>`);
    expect(insertedText).not.toContain(`<${B}>`);
  });
});

// ── Manchester axiom sync (T012) ───────────────────────────────────────────────

function makeManchesterDoc(content: string): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    getText: () => content,
    lineAt: (i: number) => ({
      range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i]?.length ?? 0 } },
      rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
      text: lines[i] ?? '',
    }),
    uri: { fsPath: 'test.omn', toString: () => 'file:///test.omn' },
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}

describe('syncAxiomsManchester — idempotency (T012)', () => {
  it('does not apply edit when SubClassOf is unchanged (full-IRI form)', async () => {
    // The sync generates full-IRI form; idempotency fires when file already uses full IRIs.
    const content = [
      `Class: <${A}>`,
      `    SubClassOf: <${B}>`,
      '',
    ].join('\n');

    await syncAxiomsToDocument(makeManchesterDoc(content), makeClass([B]), 'manchester');
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when SubClassOf and EquivalentTo are both unchanged', async () => {
    // Generator emits SubClassOf before EquivalentTo; use that order in the file.
    const content = [
      `Class: <${A}>`,
      `    SubClassOf: <${B}>`,
      `    EquivalentTo: <${F}>`,
      '',
    ].join('\n');

    await syncAxiomsToDocument(
      makeManchesterDoc(content),
      makeClass([B], [F]),
      'manchester',
    );
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when class has no axioms and model has none', async () => {
    const content = [
      `Class: <${A}>`,
      `    Annotations: rdfs:label "A"@en`,
      '',
    ].join('\n');

    await syncAxiomsToDocument(makeManchesterDoc(content), makeClass([]), 'manchester');
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('applies edit when SubClassOf changes', async () => {
    // File has SubClassOf B; model changes to SubClassOf C.
    const content = [
      `Class: <${A}>`,
      `    SubClassOf: <${B}>`,
      '',
    ].join('\n');

    await syncAxiomsToDocument(makeManchesterDoc(content), makeClass([C]), 'manchester');
    expect(mockApplyEdit).toHaveBeenCalledOnce();
  });
});

// ── Turtle combined sync — idempotency (T014) ─────────────────────────────────

function makeTurtleDoc(content: string): vscode.TextDocument {
  const lines = content.split('\n');
  return {
    getText: () => content,
    lineAt: (i: number) => ({
      range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i]?.length ?? 0 } },
      rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
      text: lines[i] ?? '',
    }),
    uri: { fsPath: 'test.ttl', toString: () => 'file:///test.ttl' },
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}

function makeClassWithLabel(
  superClassIris: string[],
  label: string,
  lang = 'en',
): OWLClass {
  return {
    iri: A,
    type: 'class',
    labels: { [lang]: [label] },
    annotations: {},
    superClassIris,
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

describe('syncAxiomsTurtle — idempotency (T014)', () => {
  it('does not apply edit when structural and annotation content is unchanged', async () => {
    const content = [
      `<${A}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <${B}> ;`,
      `    rdfs:label "A"@en .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClassWithLabel([B], 'A'),
      'turtle',
    );
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('applies edit when SubClassOf target changes', async () => {
    const content = [
      `<${A}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <${B}> ;`,
      `    rdfs:label "A"@en .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClassWithLabel([C], 'A'),
      'turtle',
    );
    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockReplace).toHaveBeenCalledOnce();
  });

  it('does not apply edit when class has no label and no axioms beyond rdf:type', async () => {
    const content = [
      `<${A}> rdf:type owl:Class .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClass([]),
      'turtle',
    );
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

// ── Turtle — annotation file-order preservation ────────────────────────────────
// These tests must FAIL before the fix: syncAxiomsTurtle rebuilds the block
// with annotation segs in model iteration order, so when the file stores
// annotations in a different order the idempotency check fails.

const DEF = 'http://www.w3.org/2004/02/skos/core#definition';
const ALT = 'http://www.w3.org/2004/02/skos/core#altLabel';

function makeClassWithLabelAndAnnot(
  superClassIris: string[],
  label: string,
  annotations: Record<string, string[]>,
): ReturnType<typeof makeClass> {
  return {
    ...makeClass(superClassIris),
    labels: { en: [label] },
    annotations,
  };
}

describe('syncAxiomsTurtle — annotation file-order preservation', () => {
  it('is idempotent when file annotation order differs from model order', async () => {
    // File: [definition, rdfs:label] — opposite of model order (labels first).
    // Model has same content. Sync must recognise key sets are equal → no edit.
    const content = [
      `<${A}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <${B}> ;`,
      `    <${DEF}> "An animal" ;`,
      `    rdfs:label "A"@en .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClassWithLabelAndAnnot([B], 'A', { [DEF]: ['An animal'] }),
      'turtle',
    );
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('appends new annotation without reordering existing file-order annotations', async () => {
    // File: [definition, rdfs:label]. Model adds altLabel.
    // After sync: definition then rdfs:label (original file order), altLabel appended.
    const content = [
      `<${A}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <${B}> ;`,
      `    <${DEF}> "An animal" ;`,
      `    rdfs:label "A"@en .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClassWithLabelAndAnnot([B], 'A', { [DEF]: ['An animal'], [ALT]: ['creature'] }),
      'turtle',
    );
    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockReplace).toHaveBeenCalledOnce();

    const replacedText: string = mockReplace.mock.calls[0][2];
    const defIdx = replacedText.indexOf(`<${DEF}>`);
    const labelIdx = replacedText.indexOf('rdfs:label');
    const altIdx = replacedText.indexOf(`<${ALT}>`);
    expect(defIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeGreaterThan(defIdx);
    expect(altIdx).toBeGreaterThan(labelIdx);
  });
});

// ── T008 (US1): syncAxiomsTurtle writes rdfs:comment abbreviated ──────────────
// These tests must FAIL before the write-path fix: abbreviateIri only handles rdfs:label.

const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

describe('syncAxiomsTurtle — rdfs:comment abbreviated (T008)', () => {
  it('writes rdfs:comment abbreviated token when adding a new rdfs:comment annotation', async () => {
    // File has only rdfs:label. Model adds rdfs:comment.
    // Expected: rebuilt block contains "rdfs:comment", not "<http://...#comment>".
    const content = [
      `<${A}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <${B}> ;`,
      `    rdfs:label "A"@en .`,
    ].join('\n');

    await syncAxiomsToDocument(
      makeTurtleDoc(content),
      makeClassWithLabelAndAnnot([B], 'A', { [RDFS_COMMENT]: ['An animal class'] }),
      'turtle',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    const replacedText: string = mockReplace.mock.calls[0][2];
    expect(replacedText).toContain('rdfs:comment');
    expect(replacedText).not.toContain('<http://www.w3.org/2000/01/rdf-schema#comment>');
  });
});

// ── T032: DL Query sync inhibition guard ──────────────────────────────────────

const GUARD_CONTENT_AX = [
  `Ontology(<http://example.org/ont>`,
  `Declaration(Class(<${A}>))`,
  `AnnotationAssertion(rdfs:label <${A}> "A")`,
  `)`,
].join('\n');

describe('syncAxiomsToDocument — DL query sync inhibition guard', () => {
  afterEach(() => { temporaryClassIris.clear(); });

  it('T032a: returns null without calling applyEdit when entity IRI is in temporaryClassIris', async () => {
    const doc = makeFunctionalDoc(GUARD_CONTENT_AX);
    const entity = makeClass([B]);

    temporaryClassIris.add(A);
    const result = await syncAxiomsToDocument(doc, entity, 'functional');

    expect(result).toBeNull();
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('T032b: proceeds normally when entity IRI is NOT in temporaryClassIris', async () => {
    const doc = makeFunctionalDoc(GUARD_CONTENT_AX);
    const entity = makeClass([B]);

    const result = await syncAxiomsToDocument(doc, entity, 'functional');

    expect(mockApplyEdit).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});
