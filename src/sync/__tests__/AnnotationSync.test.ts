import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { syncAnnotationsToDocument } from '../AnnotationSync';
import type { OWLClass } from '../../model/OntologyModel';
import { temporaryClassIris } from '../../views/DLQueryState';

// vi.hoisted ensures these are available to the vi.mock factory (which is hoisted
// before module-level variable declarations are evaluated).
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

const CAT = 'http://example.org#Cat';
const DEF = 'http://www.w3.org/2004/02/skos/core#definition';
const ALT = 'http://www.w3.org/2004/02/skos/core#altLabel';

function makeClass(labels: OWLClass['labels'], annotations: OWLClass['annotations']): OWLClass {
  return {
    iri: CAT,
    type: 'class',
    labels,
    annotations,
    superClassIris: [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

// ── Original integration test (preserved) ─────────────────────────────────────

describe('AnnotationSync Clustered Functional Syntax', () => {
  it('should sync annotations into an existing entity cluster', async () => {
    const content = `Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org#A>))

  # Class: <http://example.org#A> (Class A)
  AnnotationAssertion(rdfs:label <http://example.org#A> "Class A")

  SubClassOf(<http://example.org#A> <http://example.org#B>)
)`;
    const doc = {
      getText: () => content,
      lineAt: (i: number) => ({
        range: { start: { line: i, character: 0 }, end: { line: i, character: content.split('\n')[i].length } },
        rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
        text: content.split('\n')[i],
      }),
      uri: { fsPath: 'test.ofn' },
      lineCount: content.split('\n').length,
    } as unknown as vscode.TextDocument;

    const entity: OWLClass = {
      iri: 'http://example.org#A',
      type: 'class',
      labels: { en: ['Updated Label'] },
      annotations: {},
      superClassIris: ['http://example.org#B'],
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };

    await syncAnnotationsToDocument(doc, entity, 'functional');
    expect(mockApplyEdit).toHaveBeenCalled();
  });
});

// ── T002: syncFunctional idempotency ──────────────────────────────────────────
// These tests must FAIL before implementing the diff-based sync (Red phase).

describe('syncFunctional — idempotency (T002)', () => {
  it('does not apply any edit when model annotation matches file (same single label)', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  # Class: <${CAT}>`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(makeFunctionalDoc(content), makeClass({ en: ['Cat'] }, {}), 'functional');

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply any edit when annotations are identical but in non-model order (definition before label)', async () => {
    // File stores <definition> BEFORE rdfs:label — the opposite of model enumeration order.
    // A correct idempotent sync must NOT reorder them.
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  # Class: <${CAT}>`,
      `  AnnotationAssertion(<${DEF}> <${CAT}> "A domestic feline")`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'] }),
      'functional',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply any edit when entity has no annotations and file has none', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  SubClassOf(<${CAT}> <http://example.org#Animal>)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(makeFunctionalDoc(content), makeClass({}, {}), 'functional');

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply any edit for multiple annotations in non-model order', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  AnnotationAssertion(<${ALT}> <${CAT}> "kitty")`,
      `  AnnotationAssertion(<${DEF}> <${CAT}> "A domestic feline")`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'], [ALT]: ['kitty'] }),
      'functional',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

// ── T003: syncFunctional order-preservation and minimal diff ──────────────────
// These tests must FAIL before implementing the diff-based sync (Red phase).

describe('syncFunctional — order-preservation and minimal diff (T003)', () => {
  it('inserts new annotation after last existing without reordering', async () => {
    // File: [definition (line 3), rdfs:label (line 4)] — non-model order.
    // Model adds altLabel.
    // Expected: exactly one insert at line 5, zero deletes, zero replaces.
    const content = [
      'Ontology(<http://example.org/ont>',                             // 0
      `  Declaration(Class(<${CAT}>))`,                                // 1
      `  # Class: <${CAT}>`,                                           // 2
      `  AnnotationAssertion(<${DEF}> <${CAT}> "A domestic feline")`,  // 3
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,           // 4
      `  SubClassOf(<${CAT}> <http://example.org#Animal>)`,            // 5
      ')',                                                              // 6
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'], [ALT]: ['kitty'] }),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    // Insertion must be at line 5 (after rdfs:label at line 4)
    const insertPos: { line: number } = mockInsert.mock.calls[0][1];
    expect(insertPos.line).toBe(5);

    // Inserted text must contain the new altLabel annotation
    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain(`<${ALT}>`);
    expect(insertedText).toContain('"kitty"');
  });

  it('deletes removed annotation without touching any other line', async () => {
    // File: [rdfs:label (line 3), definition (line 4)].
    // Model removes definition.
    // Expected: exactly one delete, zero inserts, zero replaces.
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  # Class: <${CAT}>`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,    // 3
      `  AnnotationAssertion(<${DEF}> <${CAT}> "A cat")`,       // 4
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('inserts first annotation to entity that had none', async () => {
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  SubClassOf(<${CAT}> <http://example.org#Animal>)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('simultaneously inserts added and deletes removed, preserving unchanged', async () => {
    // File: [rdfs:label, definition]. Model replaces definition with altLabel.
    // Expected: one insert (altLabel) + one delete (definition), zero replaces.
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,     // 2
      `  AnnotationAssertion(<${DEF}> <${CAT}> "A cat")`,        // 3
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [ALT]: ['kitty'] }),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ── T005: syncManchester idempotency ──────────────────────────────────────────
// These tests expose the trailing-newline mismatch in the Manchester idempotency
// check (existingBlock includes trailing empty lines; newAnnotBlock does not).

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

describe('syncManchester — idempotency (T005)', () => {
  it('does not apply edit when file already has the exact generated annotation block', async () => {
    // The generator produces: "    Annotations:\n        rdfs:label \"Cat\"@en"
    // followed by a SubClassOf section (no trailing empty line before it).
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      '        rdfs:label "Cat"@en',
      `    SubClassOf: <http://example.org#Animal>`,
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'manchester',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when file has annotation block followed by trailing empty line only', async () => {
    // No subsequent section — existingBlock ends with trailing newline from empty line.
    // This is the common case for the last entity in a file.
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      '        rdfs:label "Cat"@en',
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'manchester',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when multiple annotations match in file order', async () => {
    // Generator order: labels first, then other annotations.
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      `        rdfs:label "Cat"@en,`,
      `        <${DEF}> "A domestic feline"`,
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'] }),
      'manchester',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does apply edit when Manchester annotation is changed', async () => {
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      '        rdfs:label "OldCat"@en',
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'manchester',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
  });
});

// ── T006: syncManchester file-order preservation ──────────────────────────────
// These tests must FAIL before the fix: the current full-text comparison
// generates a model-order block which differs from a file that stores
// annotations in a different order, causing a spurious rewrite.

describe('syncManchester — file-order preservation (T006)', () => {
  it('is idempotent when file annotation order differs from model order', async () => {
    // File: [definition, rdfs:label] — opposite of model iteration order.
    // Model iterates labels first, then annotations by IRI key.
    // A correct sync must recognise the key sets are equal and return null.
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      `        <${DEF}> "A domestic feline",`,
      `        rdfs:label "Cat"@en`,
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'] }),
      'manchester',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('appends new annotation without reordering existing file-order annotations', async () => {
    // File: [definition, rdfs:label] — reverse model order.
    // Model adds altLabel. Existing two annotations must stay in file order.
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      `        <${DEF}> "A domestic feline",`,
      `        rdfs:label "Cat"@en`,
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'], [ALT]: ['kitty'] }),
      'manchester',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    // Must replace (not raw insert+delete) since the block is rebuilt
    expect(mockReplace).toHaveBeenCalledOnce();

    // The replaced text must contain definition before rdfs:label (file order)
    // and altLabel appended at the end.
    const replacedText: string = mockReplace.mock.calls[0][2];
    const defIdx = replacedText.indexOf(`<${DEF}>`);
    const labelIdx = replacedText.indexOf('rdfs:label');
    const altIdx = replacedText.indexOf(`<${ALT}>`);
    expect(defIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeGreaterThan(defIdx);
    expect(altIdx).toBeGreaterThan(labelIdx);
  });
});

// ── T008: syncTurtle file-order preservation ──────────────────────────────────
// Same class of bug: model-order annotation segs in rebuilt block differ from
// a file that stores annotations in a different order.

describe('syncTurtle — file-order preservation (T008)', () => {
  it('is idempotent when file annotation order differs from model order', async () => {
    // File: [definition, rdfs:label] — opposite of model iteration order.
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class ;`,
      `    <${DEF}> "A domestic feline" ;`,
      `    rdfs:label "Cat"@en .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'] }),
      'turtle',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('appends new annotation without reordering existing file-order annotations', async () => {
    // File: [definition, rdfs:label]. Model adds altLabel.
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class ;`,
      `    <${DEF}> "A domestic feline" ;`,
      `    rdfs:label "Cat"@en .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({ en: ['Cat'] }, { [DEF]: ['A domestic feline'], [ALT]: ['kitty'] }),
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

// ── T002 (US1): rdfs:comment abbreviated IRI — Red phase ─────────────────────
// These tests must FAIL before the fix: abbreviateIri only handles rdfs:label.

const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

describe('syncFunctional — rdfs:comment abbreviated (T004)', () => {
  it('writes rdfs:comment abbreviated token when adding a new rdfs:comment annotation', async () => {
    // File has only rdfs:label. Model adds rdfs:comment.
    // Expected: written line contains "rdfs:comment", not "<http://...#comment>".
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  # Class: <${CAT}>`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [RDFS_COMMENT]: ['A domestic feline'] }),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).toContain('rdfs:comment');
    expect(insertedText).not.toContain('<http://www.w3.org/2000/01/rdf-schema#comment>');
  });
});

describe('syncManchester — rdfs:comment abbreviated (T006)', () => {
  it('writes rdfs:comment abbreviated token when adding a new rdfs:comment annotation', async () => {
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      '        rdfs:label "Cat"@en',
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, { [RDFS_COMMENT]: ['A domestic feline'] }),
      'manchester',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    const replacedText: string = mockReplace.mock.calls[0][2];
    expect(replacedText).toContain('rdfs:comment');
    expect(replacedText).not.toContain('<http://www.w3.org/2000/01/rdf-schema#comment>');
  });
});

// ── T010/T012 (US2): round-trip fidelity when file already has rdfs:comment ──
// These tests must FAIL before the read-path fix: parsers don't recognise
// the 'rdfs:comment' abbreviated token unless the rdfs: prefix is in the map.

describe('syncFunctional — idempotent with rdfs:comment in file (T010)', () => {
  it('is a no-op when file already contains AnnotationAssertion(rdfs:comment ...) with no prefix map', async () => {
    // No Prefix(rdfs:=<...>) declaration in this file — relies on RDFS_TOKEN_TO_IRI map.
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  # Class: <${CAT}>`,
      `  AnnotationAssertion(rdfs:label <${CAT}> "Cat"@en)`,
      `  AnnotationAssertion(rdfs:comment <${CAT}> "A domestic feline")`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({ en: ['Cat'] }, { [RDFS_COMMENT]: ['A domestic feline'] }),
      'functional',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

describe('syncManchester — idempotent with rdfs:comment in file (T012)', () => {
  it('is a no-op when file already contains rdfs:comment abbreviated token with no prefix map', async () => {
    // No Prefix: rdfs: <...> declaration — relies on RDFS_TOKEN_TO_IRI map.
    const content = [
      `Class: <${CAT}>`,
      '    Annotations:',
      '        rdfs:label "Cat"@en,',
      '        rdfs:comment "A domestic feline"',
      '',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeManchesterDoc(content),
      makeClass({ en: ['Cat'] }, { [RDFS_COMMENT]: ['A domestic feline'] }),
      'manchester',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

// ── T007: syncTurtle annotation idempotency ───────────────────────────────────

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

// Minimal prefix header used by all Turtle tests — matches what real .ttl files have.
const TTL_PREFIX = [
  '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
  '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
  '',
].join('\n');

describe('syncTurtle — annotation idempotency (T007)', () => {
  it('does not apply edit when annotation is unchanged', async () => {
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class ;`,
      `    rdfs:label "Cat"@en .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'turtle',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when annotation and structural segs are both unchanged', async () => {
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class ;`,
      `    rdfs:subClassOf <http://example.org#Animal> ;`,
      `    rdfs:label "Cat"@en .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'turtle',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does not apply edit when entity has no annotations and file has none', async () => {
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({}, {}),
      'turtle',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('does apply edit when annotation label changes', async () => {
    const content = TTL_PREFIX + [
      `<${CAT}> rdf:type owl:Class ;`,
      `    rdfs:label "OldCat"@en .`,
    ].join('\n');

    await syncAnnotationsToDocument(
      makeTurtleDoc(content),
      makeClass({ en: ['Cat'] }, {}),
      'turtle',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
  });
});

// ── Multi-line annotation value (real newlines, no \n escape) ─────────────────

describe('syncFunctional — multi-line annotation values', () => {
  it('is idempotent when a multi-line annotation already matches the model', async () => {
    const multiLineValue = 'First line.\nSecond line.';
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      `  AnnotationAssertion(<${DEF}> <${CAT}> "First line.`,
      `Second line.")`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({}, { [DEF]: [multiLineValue] }),
      'functional',
    );

    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('inserts a multi-line annotation value with real newlines (no \\n escape)', async () => {
    const multiLineValue = 'First line.\nSecond line.';
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${CAT}>))`,
      ')',
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({}, { [DEF]: [multiLineValue] }),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    const insertedText: string = mockInsert.mock.calls[0][2];
    expect(insertedText).not.toContain('\\n');
    expect(insertedText).toContain('First line.\nSecond line.');
  });

  it('deletes a multi-line annotation that spans two physical lines', async () => {
    // The annotation "First line.\nSecond line." occupies lines 2 and 3 (0-indexed).
    const content = [
      'Ontology(<http://example.org/ont>',   // 0
      `  Declaration(Class(<${CAT}>))`,       // 1
      `  AnnotationAssertion(<${DEF}> <${CAT}> "First line.`,  // 2
      `Second line.")`,                        // 3
      ')',                                     // 4
    ].join('\n');

    await syncAnnotationsToDocument(
      makeFunctionalDoc(content),
      makeClass({}, {}),
      'functional',
    );

    expect(mockApplyEdit).toHaveBeenCalledOnce();
    // The delete call must cover lines 2 through 3 (start of line 2 to end of line 3).
    const deletedRange = mockDelete.mock.calls[0][1];
    expect(deletedRange.start.line).toBe(2);
    expect(deletedRange.end.line).toBe(4); // rangeIncludingLineBreak.end for line 3 → line 4, char 0
  });
});

// ── T032: DL Query sync inhibition guard ──────────────────────────────────────

const GUARD_IRI = 'http://example.org#A';
const GUARD_CONTENT = `Ontology(<http://example.org/ont>
  Declaration(Class(<${GUARD_IRI}>))

  # Class: <${GUARD_IRI}> (Original)
  AnnotationAssertion(rdfs:label <${GUARD_IRI}> "Original")
)`;

function makeGuardEntity(label: string): OWLClass {
  return {
    iri: GUARD_IRI,
    type: 'class',
    labels: { '': [label] },
    annotations: {},
    superClassIris: [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

describe('syncAnnotationsToDocument — DL query sync inhibition guard', () => {
  afterEach(() => { temporaryClassIris.clear(); });

  it('T032a: returns null without calling applyEdit when entity IRI is in temporaryClassIris', async () => {
    const doc = makeFunctionalDoc(GUARD_CONTENT);
    const entity = makeGuardEntity('Updated');

    temporaryClassIris.add(GUARD_IRI);
    const result = await syncAnnotationsToDocument(doc, entity, 'functional');

    expect(result).toBeNull();
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('T032b: proceeds normally when entity IRI is NOT in temporaryClassIris', async () => {
    const doc = makeFunctionalDoc(GUARD_CONTENT);
    const entity = makeGuardEntity('Updated');

    const result = await syncAnnotationsToDocument(doc, entity, 'functional');

    expect(mockApplyEdit).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});
