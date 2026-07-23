import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(),
    createTextEditorDecorationType: vi.fn(() => ({})),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    visibleTextEditors: [],
    setStatusBarMessage: vi.fn(),
  },
  ViewColumn: { Beside: 2, One: 1 },
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => parts.join('/')),
    parse: vi.fn((s: string) => ({ fsPath: s, toString: () => s })),
  },
  workspace: {
    fs: {
      readFile: vi.fn().mockResolvedValue(new Uint8Array()),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    textDocuments: [],
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
  },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  OverviewRulerLane: { Left: 1 },
  ThemeColor: vi.fn(),
  Range: vi.fn((s1: number, c1: number, s2: number, c2: number) => ({ start: { line: s1, character: c1 }, end: { line: s2, character: c2 } })),
  Position: vi.fn((l: number, c: number) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => {
    const editsMap = new Map();
    const add = (uri: unknown, range: unknown, newText: string) => {
      const k = (uri as { toString?: () => string }).toString?.() ?? String(uri);
      if (!editsMap.has(k)) editsMap.set(k, []);
      editsMap.get(k).push({ range, newText });
    };
    return {
      replace: (uri: unknown, range: unknown, newText: string) => add(uri, range, newText),
      insert: (uri: unknown, pos: unknown, newText: string) => add(uri, { start: pos, end: pos }, newText),
      delete: (uri: unknown, range: unknown) => add(uri, range, ''),
      entries: () => [...editsMap.entries()].map(([, v]) => [null, v]),
    };
  }),
  TreeItem: vi.fn(),
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  EventEmitter: vi.fn(() => ({ event: vi.fn(), fire: vi.fn(), dispose: vi.fn() })),
  ThemeIcon: vi.fn(),
}));

vi.mock('../extension.js', () => ({
  parsedDocVersions: new Map(),
}));

import * as vscode from 'vscode';
import {
  computeUpdatedText,
  validateManchesterText,
  renderExpressionsWithRefs,
  splitNormalizedExpressions,
  buildEntityPayload,
  invalidateHistoryAfterLabelChange,
  checkLabelRenameConflict,
} from './EntityEditorPanel.js';
import { EntityEditHistory } from './EntityEditHistory.js';
import type { EntitySnapshot } from './EntityEditorMessages.js';
import { createEmptyModel } from '../model/OntologyModel.js';
import type { EntitySegment, OWLClass, OWLObjectProperty } from '../model/OntologyModel.js';
import { OntologyIndex } from '../model/OntologyIndex.js';
import { normalizeExpression } from '../model/AxiomDisplay.js';

const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 && i + 1 < text.length) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function segmentForLines(text: string, lines: number[]): EntitySegment {
  const starts = lineStarts(text);
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  const lastStart = starts[lastLine];
  const nextStart = starts[lastLine + 1] ?? text.length + 1;
  return {
    startLine: firstLine,
    endLine: lastLine,
    startChar: starts[firstLine],
    endChar: nextStart - 1,
    lineIndices: new Int32Array(lines),
    lineCharStarts: new Int32Array(lines.map(line => starts[line])),
  };
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let idx = text.indexOf(needle);
  while (idx >= 0) {
    count++;
    idx = text.indexOf(needle, idx + needle.length);
  }
  return count;
}

describe('renderExpressionsWithRefs', () => {
  it('produces an array-of-arrays indexed by expression position', () => {
    const model = createEmptyModel('test://test');
    const refs: Record<string, unknown> = {};
    renderExpressionsWithRefs(
      'superClassExpressions',
      ['Dog and Cat', 'hasAge min 18'],
      refs as Parameters<typeof renderExpressionsWithRefs>[2],
      model,
      'label',
      'en',
    );
    // After T003 fix: refs['superClassExpressions'] = [[], []] (two sub-arrays)
    // Currently (flat): refs['superClassExpressions'] = [] (no index 0)
    expect(refs['superClassExpressions']).toHaveLength(2);
    expect(Array.isArray((refs['superClassExpressions'] as unknown[][])[0])).toBe(true);
  });
});

describe('splitNormalizedExpressions', () => {
  it('routes a single bare IRI to namedClassIris', () => {
    const result = splitNormalizedExpressions(['http://example.org/Animal']);
    expect(result.namedClassIris).toEqual(['http://example.org/Animal']);
    expect(result.complexExpressions).toEqual([]);
  });

  it('routes an https IRI to namedClassIris', () => {
    const result = splitNormalizedExpressions(['https://example.org/Animal']);
    expect(result.namedClassIris).toEqual(['https://example.org/Animal']);
    expect(result.complexExpressions).toEqual([]);
  });

  it('routes a complex expression (with spaces) to complexExpressions', () => {
    const expr = 'http://example.org/Animal and http://example.org/hasPart some http://example.org/Bone';
    const result = splitNormalizedExpressions([expr]);
    expect(result.namedClassIris).toEqual([]);
    expect(result.complexExpressions).toEqual([expr]);
  });

  it('splits a mixed array correctly', () => {
    const iriA = 'http://example.org/Animal';
    const complex = 'http://example.org/A and http://example.org/B';
    const iriC = 'http://example.org/Creature';
    const result = splitNormalizedExpressions([iriA, complex, iriC]);
    expect(result.namedClassIris).toEqual([iriA, iriC]);
    expect(result.complexExpressions).toEqual([complex]);
  });

  it('returns empty arrays when input is empty', () => {
    const result = splitNormalizedExpressions([]);
    expect(result.namedClassIris).toEqual([]);
    expect(result.complexExpressions).toEqual([]);
  });

  it('handles owl built-in IRI as a named class', () => {
    const result = splitNormalizedExpressions(['http://www.w3.org/2002/07/owl#Thing']);
    expect(result.namedClassIris).toEqual(['http://www.w3.org/2002/07/owl#Thing']);
    expect(result.complexExpressions).toEqual([]);
  });

  it('routes equivalentClassExpressions bare IRI to namedClassIris', () => {
    const iri = 'http://example.org/B';
    const result = splitNormalizedExpressions([iri]);
    expect(result.namedClassIris).toEqual([iri]);
    expect(result.complexExpressions).toEqual([]);
  });
});

describe('computeUpdatedText', () => {
  it('does not duplicate class axioms after adding an annotation with segment hints', async () => {
    const a = 'http://example.org#A';
    const b = 'http://example.org#B';
    const f = 'http://example.org#F';
    const content = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${a}>))`,
      `  EquivalentClasses(<${a}> <${f}>)`,
      `  SubClassOf(<${a}> <${b}>)`,
      ')',
    ].join('\n');
    const entity: OWLClass = {
      iri: a,
      type: 'class',
      labels: {},
      annotations: { [RDFS_COMMENT]: ['A useful note'] },
      superClassIris: [b],
      equivalentClassIris: [f],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };

    const result = await computeUpdatedText(
      vscode.Uri.parse('file:///test.ofn'),
      entity,
      'functional',
      content,
      segmentForLines(content, [1, 2, 3]),
      undefined,
      4,
      4,
    );

    expect(result.text).toContain('AnnotationAssertion(rdfs:comment');
    expect(countOccurrences(result.text ?? '', `EquivalentClasses(<${a}> <${f}>)`)).toBe(1);
    expect(countOccurrences(result.text ?? '', `SubClassOf(<${a}> <${b}>)`)).toBe(1);
  });

  it('returns to the original text after adding and then deleting an annotation', async () => {
    const a = 'http://example.org#A';
    const b = 'http://example.org#B';
    const f = 'http://example.org#F';
    const original = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${a}>))`,
      `  EquivalentClasses(<${a}> <${f}>)`,
      `  SubClassOf(<${a}> <${b}>)`,
      ')',
    ].join('\n');
    const withAnnotation: OWLClass = {
      iri: a,
      type: 'class',
      labels: {},
      annotations: { [RDFS_COMMENT]: ['A useful note'] },
      superClassIris: [b],
      equivalentClassIris: [f],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };
    const withoutAnnotation: OWLClass = { ...withAnnotation, annotations: {} };

    const addResult = await computeUpdatedText(
      vscode.Uri.parse('file:///test.ofn'),
      withAnnotation,
      'functional',
      original,
      segmentForLines(original, [1, 2, 3]),
      undefined,
      4,
      4,
    );
    expect(addResult.text).toBeDefined();

    const addedText = addResult.text ?? '';
    const deleteResult = await computeUpdatedText(
      vscode.Uri.parse('file:///test.ofn'),
      withoutAnnotation,
      'functional',
      addedText,
      segmentForLines(addedText, [1, 2, 3, 4]),
      undefined,
      5,
      5,
    );

    expect(deleteResult.text).toBe(original);
    expect(countOccurrences(deleteResult.text ?? '', `EquivalentClasses(<${a}> <${f}>)`)).toBe(1);
    expect(countOccurrences(deleteResult.text ?? '', `SubClassOf(<${a}> <${b}>)`)).toBe(1);
  });
});

describe('validateManchesterText', () => {
  it('returns no errors for a valid single-line expression', () => {
    const result = validateManchesterText('owl:Thing');
    expect(result).toEqual([]);
  });

  it('returns no errors for a multi-conjunct single-line expression', () => {
    const result = validateManchesterText('hasRole some Doctor and hasLocation some Hospital');
    expect(result).toEqual([]);
  });

  it('returns no errors for a formatted multi-line expression (continuation "and" line)', () => {
    const result = validateManchesterText('hasRole some Doctor\n    and hasLocation some Hospital');
    expect(result).toEqual([]);
  });

  it('returns no errors for three-conjunct formatted expression', () => {
    const result = validateManchesterText(
      'hasRole some TreatmentRole\n    and hasLocation some Lung\n    and hasCause some Infection',
    );
    expect(result).toEqual([]);
  });

  it('returns no errors for multiple separate expressions (two logical lines)', () => {
    const result = validateManchesterText('owl:Thing\nowl:Nothing');
    expect(result).toEqual([]);
  });

  it('returns no errors for multiple formatted multi-line expressions', () => {
    const result = validateManchesterText(
      'hasRole some Doctor\n    and hasLocation some Hospital\nhasAge min 18',
    );
    expect(result).toEqual([]);
  });

  it('skips blank lines without error', () => {
    const result = validateManchesterText('\n\nowl:Thing\n\n');
    expect(result).toEqual([]);
  });

  it('skips comment lines without error', () => {
    const result = validateManchesterText('# this is a comment\nowl:Thing');
    expect(result).toEqual([]);
  });
});

describe('validateManchesterText – entity existence checking (with model + index)', () => {
  function buildModel() {
    const model = createEmptyModel('http://example.org/test');
    const bodyStructure: OWLClass = {
      iri: 'http://example.org/test#BodyStructure',
      type: 'class',
      labels: { en: ['Body structure'] },
      annotations: {},
      superClassIris: [],
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };
    const partOf: OWLObjectProperty = {
      iri: 'http://example.org/test#partOf',
      type: 'objectProperty',
      labels: { en: ['All or part of'] },
      annotations: {},
      superPropertyIris: [],
      domainIris: [],
      rangeIris: [],
    };
    model.classes.set(bodyStructure.iri, bodyStructure);
    model.objectProperties.set(partOf.iri, partOf);
    const index = new OntologyIndex(model);
    return { model, index };
  }

  it('returns no errors for a valid label-mode expression with known entities', () => {
    const { model, index } = buildModel();
    const result = validateManchesterText("'All or part of' some 'Body structure'", model, index);
    expect(result).toEqual([]);
  });

  it('returns an error when a bare word does not match any entity', () => {
    const { model, index } = buildModel();
    const result = validateManchesterText("'Body structure' and 'All or part of' some dkdfj", model, index);
    expect(result).toHaveLength(1);
    expect(result[0].message).toMatch(/unknown entity/i);
  });

  it('returns an error when a single-quoted label is not in the model', () => {
    const { model, index } = buildModel();
    const result = validateManchesterText("'All or part of' some 'NonExistentEntity'", model, index);
    expect(result).toHaveLength(1);
    expect(result[0].message).toMatch(/unknown entity/i);
  });

  it('returns no errors for owl:Thing (builtin prefix)', () => {
    const { model, index } = buildModel();
    const result = validateManchesterText('owl:Thing', model, index);
    expect(result).toEqual([]);
  });

  it('returns an incomplete error (not unknown-entity) when expression ends with a keyword', () => {
    const { model, index } = buildModel();
    const result = validateManchesterText("'All or part of' some", model, index);
    expect(result).toHaveLength(1);
    expect(result[0].message).toMatch(/incomplete/i);
  });
});

describe('buildEntityPayload', () => {
  function makeClassModel() {
    const model = createEmptyModel('http://example.org/test');
    const cls: OWLClass = {
      iri: 'http://example.org/test#Animal',
      type: 'class',
      labels: { en: ['Animal'] },
      annotations: {},
      superClassIris: [],
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };
    model.classes.set(cls.iri, cls);
    return { model, cls };
  }

  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  });

  it('returns undefined for an unknown IRI', () => {
    const { model } = makeClassModel();
    expect(buildEntityPayload(model, 'http://example.org/missing')).toBeUndefined();
  });

  it('returns a snapshot with the entity IRI and type', () => {
    const { model, cls } = makeClassModel();
    const snap = buildEntityPayload(model, cls.iri);
    expect(snap).toBeDefined();
    expect(snap?.iri).toBe(cls.iri);
    expect(snap?.entityType).toBe('class');
  });

  it('snapshot labels match the entity labels', () => {
    const { model, cls } = makeClassModel();
    const snap = buildEntityPayload(model, cls.iri);
    expect(snap?.labels).toEqual({ en: ['Animal'] });
  });

  it('snapshot includes class axiom fields', () => {
    const { model, cls } = makeClassModel();
    cls.superClassIris = ['http://example.org/test#Thing'];
    const snap = buildEntityPayload(model, cls.iri);
    expect(snap?.superClassIris).toEqual(['http://example.org/test#Thing']);
  });
});

describe('buildEntityPayload — inferredEquivalentClassIris/Expressions (T011)', () => {
  function makeClassModel() {
    const model = createEmptyModel('http://example.org/test');
    const cls: OWLClass = {
      iri: 'http://example.org/test#A',
      type: 'class',
      labels: { en: ['A'] },
      annotations: {},
      superClassIris: [],
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };
    model.classes.set(cls.iri, cls);
    model.isClassified = true;
    model.classificationNeedsUpdate = false;
    return { model, cls };
  }

  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  });

  it('populates inferredEquivalentClassIris from model.inferredEquivalentClasses', () => {
    const { model, cls } = makeClassModel();
    model.inferredEquivalentClasses.set(cls.iri, { iris: ['http://example.org/test#B'], expressions: [] });

    const snap = buildEntityPayload(model, cls.iri);

    expect(snap?.inferredEquivalentClassIris).toEqual(['http://example.org/test#B']);
  });

  it('populates inferredEquivalentClassExpressions with matching expressionEntityRefs entries', () => {
    const { model, cls } = makeClassModel();
    model.inferredEquivalentClasses.set(cls.iri, {
      iris: [],
      expressions: ['ObjectIntersectionOf(<http://example.org/test#D> <http://example.org/test#E>)'],
    });

    const snap = buildEntityPayload(model, cls.iri);

    expect(snap?.inferredEquivalentClassExpressions).toHaveLength(1);
    expect(snap?.expressionEntityRefs?.['inferredEquivalentClassExpressions']).toBeDefined();
    expect(snap?.expressionEntityRefs?.['inferredEquivalentClassExpressions']).toHaveLength(1);
  });
});

describe('buildEntityPayload — omits inferredEquivalentClass* when nothing qualifies (T018)', () => {
  function makeClassModel() {
    const model = createEmptyModel('http://example.org/test');
    const cls: OWLClass = {
      iri: 'http://example.org/test#A',
      type: 'class',
      labels: { en: ['A'] },
      annotations: {},
      superClassIris: [],
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: [],
    };
    model.classes.set(cls.iri, cls);
    model.isClassified = true;
    model.classificationNeedsUpdate = false;
    return { model, cls };
  }

  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  });

  it('omits both fields when the class has no entries in model.inferredEquivalentClasses', () => {
    const { model, cls } = makeClassModel();
    // No model.inferredEquivalentClasses.set(...) call — class has nothing to flag.

    const snap = buildEntityPayload(model, cls.iri);

    expect(snap?.inferredEquivalentClassIris).toBeUndefined();
    expect(snap?.inferredEquivalentClassExpressions).toBeUndefined();
  });

  it('omits both fields when the ontology has not been classified', () => {
    const { model, cls } = makeClassModel();
    model.inferredEquivalentClasses.set(cls.iri, { iris: ['http://example.org/test#B'], expressions: [] });
    model.isClassified = false;

    const snap = buildEntityPayload(model, cls.iri);

    expect(snap?.inferredEquivalentClassIris).toBeUndefined();
    expect(snap?.inferredEquivalentClassExpressions).toBeUndefined();
  });

  it('omits both fields when classification is stale (classificationNeedsUpdate)', () => {
    const { model, cls } = makeClassModel();
    model.inferredEquivalentClasses.set(cls.iri, { iris: ['http://example.org/test#B'], expressions: [] });
    model.classificationNeedsUpdate = true;

    const snap = buildEntityPayload(model, cls.iri);

    expect(snap?.inferredEquivalentClassIris).toBeUndefined();
    expect(snap?.inferredEquivalentClassExpressions).toBeUndefined();
  });
});

function makeSnap(label: string, iri = 'http://example.org/A'): EntitySnapshot {
  return {
    entityType: 'class',
    iri,
    label,
    labels: { en: [label] },
    annotations: {},
    displayStyle: 'label',
    iriLabels: {},
    expressionEntityRefs: {},
  };
}

describe('entityHistoryMap isolation (T016)', () => {
  it('entity A and entity B histories are independent', () => {
    const histA = new EntityEditHistory(makeSnap('A0', 'http://example.org/A'));
    const histB = new EntityEditHistory(makeSnap('B0', 'http://example.org/B'));
    histA.recordSave(makeSnap('A1', 'http://example.org/A'));
    expect(histA.canUndo).toBe(true);
    expect(histB.canUndo).toBe(false);
  });

  it('saving on entity B does not affect entity A undo stack', () => {
    const histA = new EntityEditHistory(makeSnap('A0', 'http://example.org/A'));
    const histB = new EntityEditHistory(makeSnap('B0', 'http://example.org/B'));
    histA.recordSave(makeSnap('A1', 'http://example.org/A'));
    histB.recordSave(makeSnap('B1', 'http://example.org/B'));
    histB.recordSave(makeSnap('B2', 'http://example.org/B'));
    expect(histA.undo()?.snapshot.label).toBe('A0');
    expect(histA.canUndo).toBe(false);
  });

  it('reloading entity A clears its prior history (canUndo=false, canRedo=false)', () => {
    const hist = new EntityEditHistory(makeSnap('A0'));
    hist.recordSave(makeSnap('A1'));
    hist.undo();
    expect(hist.canRedo).toBe(true);
    hist.clear(makeSnap('A0_fresh'));
    expect(hist.canUndo).toBe(false);
    expect(hist.canRedo).toBe(false);
  });

  it('after reload, new saves create fresh history independent of prior checkpoints', () => {
    const hist = new EntityEditHistory(makeSnap('A0'));
    hist.recordSave(makeSnap('A1'));
    hist.recordSave(makeSnap('A2'));
    hist.clear(makeSnap('A0_fresh'));
    hist.recordSave(makeSnap('A1_new'));
    expect(hist.undo()?.snapshot.label).toBe('A0_fresh');
    expect(hist.canUndo).toBe(false);
  });
});

describe('invalidateHistoryAfterLabelChange (US1 — spec 030-sync-labels-in-axioms)', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  });

  function buildAB() {
    const model = createEmptyModel('http://example.org/test');
    const a: OWLClass = {
      iri: 'http://example.org/test#A', type: 'class',
      labels: { en: ['Animal'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    };
    const hasPart: OWLObjectProperty = {
      iri: 'http://example.org/test#hasPart', type: 'objectProperty',
      labels: { en: ['has part'] }, annotations: {},
      superPropertyIris: [], domainIris: [], rangeIris: [],
    };
    const b: OWLClass = {
      iri: 'http://example.org/test#B', type: 'class',
      labels: { en: ['B'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [`${hasPart.iri} some ${a.iri}`],
      equivalentClassExpressions: [], gciExpressions: [],
    };
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);
    model.objectProperties.set(hasPart.iri, hasPart);
    return { model, a, b };
  }

  it('shows the current label for a referencing entity after a rename, even from a stale cache (T006)', () => {
    const { model, a, b } = buildAB();
    const historyMap = new Map<string, EntityEditHistory>();
    // Simulate B having been viewed (and its display cached) before A's rename.
    const beforeRename = buildEntityPayload(model, b.iri)!;
    expect(beforeRename.superClassExpressions?.[0]).toContain('Animal');
    historyMap.set(b.iri, new EntityEditHistory(beforeRename));

    const previousLabels = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previousLabels, a.labels, historyMap);

    // B's stale cache entry must be gone so the next load re-renders fresh.
    expect(historyMap.has(b.iri)).toBe(false);
    const afterRename = historyMap.get(b.iri)?.currentSnapshot ?? buildEntityPayload(model, b.iri);
    expect(afterRename?.superClassExpressions?.[0]).toContain('Creature');
    expect(afterRename?.superClassExpressions?.[0]).not.toContain('Animal');
  });

  it('leaves an unrelated entity\'s cached history untouched (selective invalidation)', () => {
    const { model, a, b } = buildAB();
    const c: OWLClass = {
      iri: 'http://example.org/test#C', type: 'class',
      labels: { en: ['C'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    };
    model.classes.set(c.iri, c);
    const historyMap = new Map<string, EntityEditHistory>();
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));
    const cSnapshot = buildEntityPayload(model, c.iri)!;
    historyMap.set(c.iri, new EntityEditHistory(cSnapshot));

    const previousLabels = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previousLabels, a.labels, historyMap);

    expect(historyMap.has(b.iri)).toBe(false);
    expect(historyMap.get(c.iri)?.currentSnapshot).toBe(cSnapshot);
  });

  it('is a no-op when the label did not actually change', () => {
    const { model, a, b } = buildAB();
    const historyMap = new Map<string, EntityEditHistory>();
    const bSnapshot = buildEntityPayload(model, b.iri)!;
    historyMap.set(b.iri, new EntityEditHistory(bSnapshot));

    invalidateHistoryAfterLabelChange(model, a.iri, a.labels, a.labels, historyMap);

    expect(historyMap.has(b.iri)).toBe(true);
    expect(historyMap.get(b.iri)?.currentSnapshot).toBe(bSnapshot);
  });

  it('propagates through a repeated rename chain (Animal -> Beast -> Creature), never leaving an intermediate stale value (T007)', () => {
    const { model, a, b } = buildAB();
    const historyMap = new Map<string, EntityEditHistory>();
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));

    let previous = a.labels;
    a.labels = { en: ['Beast'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previous, a.labels, historyMap);
    // B's cache was invalidated; simulate a re-view (re-cache) before the next rename.
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));

    previous = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previous, a.labels, historyMap);

    expect(historyMap.has(b.iri)).toBe(false);
    const finalPayload = historyMap.get(b.iri)?.currentSnapshot ?? buildEntityPayload(model, b.iri);
    expect(finalPayload?.superClassExpressions?.[0]).toContain('Creature');
    expect(finalPayload?.superClassExpressions?.[0]).not.toContain('Beast');
    expect(finalPayload?.superClassExpressions?.[0]).not.toContain('Animal');
  });

  it('does not corrupt or lose B\'s axiom referencing A when B is re-saved after A\'s rename (T008)', () => {
    const { model, a, b } = buildAB();
    a.labels = { en: ['Creature'] };
    const index = new OntologyIndex(model);
    // B is reloaded fresh (post-invalidation) and its currently-displayed text is
    // what would be re-normalized back to IRIs on the next save.
    const freshPayload = buildEntityPayload(model, b.iri)!;
    const displayedExpr = freshPayload.superClassExpressions![0];
    expect(displayedExpr).toContain('Creature');

    const renormalized = normalizeExpression(displayedExpr, model, index);
    expect(renormalized).toContain(a.iri);
  });

  it('propagates a reverted (undone) label rename the same way as a forward rename (T008b)', () => {
    const { model, a, b } = buildAB();
    const historyMap = new Map<string, EntityEditHistory>();
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));

    // Forward rename: Animal -> Creature.
    let previous = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previous, a.labels, historyMap);
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));

    // Undo: label reverts to Animal. An undo/redo round-trip re-enters the same
    // `save` handler via an auto-save, so the same invalidation call fires here too.
    previous = a.labels;
    a.labels = { en: ['Animal'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previous, a.labels, historyMap);

    expect(historyMap.has(b.iri)).toBe(false);
    const afterUndo = historyMap.get(b.iri)?.currentSnapshot ?? buildEntityPayload(model, b.iri);
    expect(afterUndo?.superClassExpressions?.[0]).toContain('Animal');
    expect(afterUndo?.superClassExpressions?.[0]).not.toContain('Creature');
  });

  // US2 (spec 030-sync-labels-in-axioms): navigation across several entities,
  // with a rename happening in between, must never require a manual refresh,
  // and must never leave a stale canUndo/canRedo state on the entity whose
  // cache was invalidated. `showEntityInfo`'s `needsHistoryInit` branch
  // (`!entityHistoryMap.has(iri)`) is what drives this — these tests confirm
  // the exact condition and values that branch relies on.

  it('after navigating away and renaming A, revisiting B needs a fresh history init (no manual refresh required) (T012)', () => {
    const { model, a, b } = buildAB();
    const c: OWLClass = {
      iri: 'http://example.org/test#C', type: 'class',
      labels: { en: ['C'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    };
    model.classes.set(c.iri, c);
    const historyMap = new Map<string, EntityEditHistory>();

    // View B — cached.
    historyMap.set(b.iri, new EntityEditHistory(buildEntityPayload(model, b.iri)!));
    // Navigate away to view C — cached too, unrelated to A.
    historyMap.set(c.iri, new EntityEditHistory(buildEntityPayload(model, c.iri)!));

    // Rename A (referenced by B, not by C) — no manual refresh action taken anywhere.
    const previousLabels = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previousLabels, a.labels, historyMap);

    // Navigating back to B: showEntityInfo computes needsHistoryInit = !entityHistoryMap.has(iri).
    const needsHistoryInitForB = !historyMap.has(b.iri);
    expect(needsHistoryInitForB).toBe(true);
    const bPayloadOnRevisit = buildEntityPayload(model, b.iri)!;
    expect(bPayloadOnRevisit.superClassExpressions?.[0]).toContain('Creature');

    // C was untouched by the rename — no history-init needed, no disruption.
    expect(historyMap.has(c.iri)).toBe(true);
  });

  it('reports canUndo=false/canRedo=false (not stale) for an entity whose history was just invalidated (T013)', () => {
    const { model, a, b } = buildAB();
    const historyMap = new Map<string, EntityEditHistory>();
    const bHistory = new EntityEditHistory(buildEntityPayload(model, b.iri)!);
    // Give B some undo history before the rename, to prove it doesn't leak through.
    bHistory.recordSave(buildEntityPayload(model, b.iri)!);
    historyMap.set(b.iri, bHistory);
    expect(bHistory.canUndo).toBe(true);

    const previousLabels = a.labels;
    a.labels = { en: ['Creature'] };
    invalidateHistoryAfterLabelChange(model, a.iri, previousLabels, a.labels, historyMap);

    // showEntityInfo's needsHistoryInit branch: map entry gone -> fresh EntityEditHistory,
    // posts canUndo=false/canRedo=false explicitly (never the old bHistory's canUndo=true).
    expect(historyMap.has(b.iri)).toBe(false);
    const freshHistory = new EntityEditHistory(buildEntityPayload(model, b.iri)!);
    expect(freshHistory.canUndo).toBe(false);
    expect(freshHistory.canRedo).toBe(false);
  });
});

describe('checkLabelRenameConflict (US3 — spec 030-sync-labels-in-axioms)', () => {
  function buildAC() {
    const model = createEmptyModel('http://example.org/test');
    const a: OWLClass = {
      iri: 'http://example.org/test#A', type: 'class',
      labels: { en: ['Animal'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    };
    const c: OWLClass = {
      iri: 'http://example.org/test#C', type: 'class',
      labels: { en: ['Wing'] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    };
    model.classes.set(a.iri, a);
    model.classes.set(c.iri, c);
    const index = new OntologyIndex(model);
    return { model, a, c, index };
  }

  it('rejects a rename that would duplicate another entity\'s existing label (T016)', () => {
    const { a, c, index } = buildAC();
    const result = checkLabelRenameConflict(index, a.iri, { en: ['Wing'] });
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.conflictingIri).toBe(c.iri);
      expect(result.conflictingLabel).toBe('Wing');
    }
  });

  it('rejects case-insensitively (T018a)', () => {
    const { a, index } = buildAC();
    const result = checkLabelRenameConflict(index, a.iri, { en: ['WING'] });
    expect(result.conflict).toBe(true);
  });

  it('does not treat renaming an entity to its own current label as a conflict (T018b)', () => {
    const { a, index } = buildAC();
    const result = checkLabelRenameConflict(index, a.iri, { en: ['Animal'] });
    expect(result.conflict).toBe(false);
  });

  it('accepts a rename to a genuinely unused label', () => {
    const { a, index } = buildAC();
    const result = checkLabelRenameConflict(index, a.iri, { en: ['Creature'] });
    expect(result.conflict).toBe(false);
  });

  it('checks every label string across every language in a multi-value/multi-language payload', () => {
    const { a, index } = buildAC();
    // 'Wing' (conflicting) appears as a second value under a different language.
    const result = checkLabelRenameConflict(index, a.iri, { en: ['Creature'], fr: ['Wing'] });
    expect(result.conflict).toBe(true);
    expect(result.conflict && result.conflictingLabel).toBe('Wing');
  });
});
