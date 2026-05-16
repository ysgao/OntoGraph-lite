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

import { validateManchesterText, renderExpressionsWithRefs } from './EntityEditorPanel.js';
import { createEmptyModel } from '../model/OntologyModel.js';

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
