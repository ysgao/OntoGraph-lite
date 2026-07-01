import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── VS Code mock ──────────────────────────────────────────────────────────────

const { mockPostMessage, mockShowWarningMessage, mockShowErrorMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn().mockResolvedValue(true),
  mockShowWarningMessage: vi.fn(),
  mockShowErrorMessage: vi.fn(),
}));

let capturedMessageHandler: ((msg: unknown) => void) | undefined;
let capturedDisposeHandler: (() => void) | undefined;

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(() => ({
      webview: {
        onDidReceiveMessage: vi.fn((cb: (msg: unknown) => void) => {
          capturedMessageHandler = cb;
          return { dispose: vi.fn() };
        }),
        postMessage: mockPostMessage,
        html: '',
        asWebviewUri: vi.fn(() => 'mock-uri'),
        cspSource: 'mock-csp',
      },
      onDidDispose: vi.fn((cb: () => void) => {
        capturedDisposeHandler = cb;
        return { dispose: vi.fn() };
      }),
      reveal: vi.fn(),
    })),
    createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
    showWarningMessage: mockShowWarningMessage,
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: vi.fn(),
    visibleTextEditors: [],
    setStatusBarMessage: vi.fn(),
  },
  ViewColumn: { Beside: 2, One: 1, Active: 1 },
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => parts.join('/')),
    parse: vi.fn((s: string) => ({ fsPath: s, toString: () => s })),
  },
  workspace: {
    fs: {
      readFile: vi.fn().mockResolvedValue(new Uint8Array()),
      writeFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ mtime: 0, size: 0 }),
    },
    textDocuments: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        if (key === 'display.preferredLabelLanguage') { return 'en'; }
        if (key === 'display.axiomEntityStyle') { return 'label'; }
        return undefined;
      }),
    })),
  },
  commands: { executeCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  OverviewRulerLane: { Left: 1 },
  ThemeColor: vi.fn(),
  Range: vi.fn((s1: number, c1: number, s2: number, c2: number) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l: number, c: number) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => {
    const editsMap = new Map();
    const add = (uri: unknown, range: unknown, newText: string) => {
      const k = (uri as { toString?: () => string }).toString?.() ?? String(uri);
      if (!editsMap.has(k)) { editsMap.set(k, []); }
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

vi.mock('../../extension.js', () => ({
  parsedDocVersions: new Map(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { showEntityInfo, guardedShowEntityInfo, getLastIri } from '../EntityEditorPanel.js';
import type { OWLClass } from '../../model/OntologyModel.js';
import { createEmptyModel } from '../../model/OntologyModel.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_IRI_A = 'http://example.org/ClassA';
const CLASS_IRI_B = 'http://example.org/ClassB';

function buildModel(): ReturnType<typeof createEmptyModel> {
  const model = createEmptyModel('file:///test.ofn');
  const clsA: OWLClass = {
    iri: CLASS_IRI_A,
    type: 'class',
    labels: { en: ['Class A'] },
    annotations: {},
    superClassIris: [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
  const clsB: OWLClass = {
    iri: CLASS_IRI_B,
    type: 'class',
    labels: { en: ['Class B'] },
    annotations: {},
    superClassIris: [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
  model.classes.set(CLASS_IRI_A, clsA);
  model.classes.set(CLASS_IRI_B, clsB);
  return model;
}

const mockContext = {
  extensionUri: { fsPath: '/test', toString: () => '/test' },
  subscriptions: [] as { dispose: () => void }[],
} as unknown as import('vscode').ExtensionContext;

function disposePanel(): void {
  capturedDisposeHandler?.();
  capturedMessageHandler = undefined;
  capturedDisposeHandler = undefined;
}

function openPanelWithA(model: ReturnType<typeof createEmptyModel>): void {
  disposePanel();
  showEntityInfo(mockContext, model, CLASS_IRI_A);
}

// ── T003: guardedShowEntityInfo guard scenarios ───────────────────────────────

describe('T003 – guardedShowEntityInfo', () => {
  let model: ReturnType<typeof createEmptyModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    disposePanel();
    model = buildModel();
  });

  it('navigates directly when no panel is open (first entity ever)', async () => {
    // No panel open — guard should call showEntityInfo without any dialog
    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_A);
    expect(result).toBe('navigated');
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(getLastIri()).toBe(CLASS_IRI_A);
  });

  it('navigates directly when navigating to the same IRI', async () => {
    openPanelWithA(model);
    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_A);
    expect(result).toBe('navigated');
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });

  it('navigates without dialog when editor is clean (isDirty=false)', async () => {
    openPanelWithA(model);
    // Simulate webview responding to queryDirty with isDirty=false
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: false });
      }
      return Promise.resolve(true);
    });

    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(result).toBe('navigated');
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(getLastIri()).toBe(CLASS_IRI_B);
  });

  it('shows dialog and navigates on Discard', async () => {
    openPanelWithA(model);
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: true });
      }
      return Promise.resolve(true);
    });
    mockShowWarningMessage.mockResolvedValue('Discard');

    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(result).toBe('navigated');
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Class A'),
      { modal: true },
      'Save',
      'Discard',
      'Continue Editing',
    );
    expect(getLastIri()).toBe(CLASS_IRI_B);
  });

  it('calls cancelRevealCallback and returns cancelled on Cancel (undefined choice)', async () => {
    openPanelWithA(model);
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: true });
      }
      return Promise.resolve(true);
    });
    mockShowWarningMessage.mockResolvedValue(undefined); // user dismissed

    const cancelCb = vi.fn();
    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B, cancelCb);
    expect(result).toBe('cancelled');
    expect(cancelCb).toHaveBeenCalledOnce();
    // Current entity should not change
    expect(getLastIri()).toBe(CLASS_IRI_A);
  });

  it('sends requestSave to webview when user picks Save', async () => {
    openPanelWithA(model);
    const postMessages: unknown[] = [];
    mockPostMessage.mockImplementation((msg: unknown) => {
      postMessages.push(msg);
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: true });
      }
      return Promise.resolve(true);
    });
    mockShowWarningMessage.mockResolvedValue('Save');

    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(result).toBe('navigated');
    expect(postMessages.some((m) => (m as { type: string }).type === 'requestSave')).toBe(true);
  });

  it('does not navigate on Cancel when no cancelRevealCallback provided', async () => {
    openPanelWithA(model);
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: true });
      }
      return Promise.resolve(true);
    });
    mockShowWarningMessage.mockResolvedValue(undefined);

    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(result).toBe('cancelled');
    expect(getLastIri()).toBe(CLASS_IRI_A); // unchanged
  });
});

// ── T004: queryDirty round-trip ───────────────────────────────────────────────

describe('T004 – queryDirty round-trip via guardedShowEntityInfo', () => {
  let model: ReturnType<typeof createEmptyModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    disposePanel();
    model = buildModel();
    openPanelWithA(model);
  });

  it('no dialog when webview reports isDirty=false', async () => {
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: false });
      }
      return Promise.resolve(true);
    });
    await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });

  it('shows dialog when webview reports isDirty=true', async () => {
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: true });
      }
      return Promise.resolve(true);
    });
    mockShowWarningMessage.mockResolvedValue('Discard');
    await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(mockShowWarningMessage).toHaveBeenCalled();
  });
});

// ── T005: editor baseline state after load ────────────────────────────────────

describe('T005 – editor starts clean after loadEntity', () => {
  let model: ReturnType<typeof createEmptyModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    disposePanel();
    model = buildModel();
    openPanelWithA(model);
  });

  it('no dialog when navigating immediately after loadEntity (clean baseline)', async () => {
    // Simulate the webview receiving a loadEntity and setting lastSavedStateString
    // by injecting the response for queryDirty as clean
    mockPostMessage.mockImplementation((msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === 'queryDirty') {
        // After loadEntity, the webview should report clean
        capturedMessageHandler?.({ type: 'dirtyState', isDirty: false });
      }
      return Promise.resolve(true);
    });

    const result = await guardedShowEntityInfo(mockContext, model, CLASS_IRI_B);
    expect(result).toBe('navigated');
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });
});
