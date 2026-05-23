import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(),
    createTextEditorDecorationType: vi.fn(() => ({})),
    showWarningMessage: vi.fn(),
    visibleTextEditors: [],
    setStatusBarMessage: vi.fn(),
  },
  ViewColumn: { Beside: 2, One: 1 },
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => parts.join('/')),
    parse: vi.fn((s: string) => ({ toString: () => s })),
  },
  workspace: {
    applyEdit: vi.fn().mockResolvedValue(true),
    textDocuments: [],
    openTextDocument: vi.fn(),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
  },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  OverviewRulerLane: { Left: 1 },
  ThemeColor: vi.fn(),
  Range: vi.fn((s1: number, c1: number, s2: number, c2: number) => ({ start: { line: s1, character: c1 }, end: { line: s2, character: c2 } })),
  Position: vi.fn((l: number, c: number) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => ({ replace: vi.fn() })),
  TreeItem: vi.fn(),
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  EventEmitter: vi.fn(() => ({ event: vi.fn(), fire: vi.fn(), dispose: vi.fn() })),
  ThemeIcon: vi.fn(),
}));

vi.mock('../extension.js', () => ({
  parsedDocVersions: new Map(),
}));

import { validateManchesterText, renderExpressionsWithRefs, splitNormalizedExpressions } from './EntityEditorPanel.js';
import { createEmptyModel } from '../model/OntologyModel.js';
import type { OWLClass, OWLObjectProperty } from '../model/OntologyModel.js';
import { OntologyIndex } from '../model/OntologyIndex.js';

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
