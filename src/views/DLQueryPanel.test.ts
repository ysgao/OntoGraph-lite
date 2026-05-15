import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockPostMessage,
  mockReveal,
  mockOnDispose,
  mockOnMessage,
  mockCreateWebviewPanel,
  mockDlQuery,
} = vi.hoisted(() => {
  const mockPostMessage        = vi.fn();
  const mockReveal             = vi.fn();
  const mockOnDispose          = vi.fn();
  const mockOnMessage          = vi.fn();
  const mockDlQuery            = vi.fn();
  const mockCreateWebviewPanel = vi.fn(() => ({
    webview: {
      html: '',
      postMessage:         mockPostMessage,
      onDidReceiveMessage: mockOnMessage,
      asWebviewUri:        vi.fn((u: unknown) => u),
      cspSource:           'vscode-resource:',
    },
    reveal:       mockReveal,
    onDidDispose: mockOnDispose,
  }));
  return { mockPostMessage, mockReveal, mockOnDispose, mockOnMessage, mockCreateWebviewPanel, mockDlQuery };
});

vi.mock('vscode', () => ({
  window: { createWebviewPanel: mockCreateWebviewPanel },
  ViewColumn: { Beside: 2 },
  Uri: { joinPath: vi.fn((_base: unknown, ...parts: string[]) => parts.join('/')) },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
}));

vi.mock('../reasoner/ReasonerBridge.js', () => ({
  ReasonerBridge: vi.fn().mockImplementation(() => ({ dlQuery: mockDlQuery })),
}));

import { openDLQueryPanel, updateDLQueryModel } from './DLQueryPanel.js';
import type { DLQueryWebviewToExt } from './DLQueryMessages.js';
import type { OntologyModel } from '../model/OntologyModel.js';
import type { ReasonerBridge } from '../reasoner/ReasonerBridge.js';
import type { ExtensionContext } from 'vscode';

const fakeContext = { extensionUri: 'fake-uri', subscriptions: [] } as unknown as ExtensionContext;
const fakeBridge  = { dlQuery: mockDlQuery } as unknown as ReasonerBridge;
const fakeReveal  = vi.fn();
const fakeModel   = { classes: new Map(), individuals: new Map() } as unknown as OntologyModel;

function getMessageHandler(): (msg: DLQueryWebviewToExt) => void {
  const [[handler]] = mockOnMessage.mock.calls as [[(msg: DLQueryWebviewToExt) => void]];
  return handler;
}

describe('DLQueryPanel', () => {
  beforeEach(() => {
    // Fire dispose BEFORE clearing mocks so the singleton resets its panel variable
    if (mockOnDispose.mock.calls.length > 0) {
      const disposeCallback = (mockOnDispose.mock.calls[0] as [() => void])[0];
      if (typeof disposeCallback === 'function') { disposeCallback(); }
    }
    vi.clearAllMocks();
    mockCreateWebviewPanel.mockReturnValue({
      webview: {
        html: '',
        postMessage:         mockPostMessage,
        onDidReceiveMessage: mockOnMessage,
        asWebviewUri:        vi.fn((u: unknown) => u),
        cspSource:           'vscode-resource:',
      },
      reveal:       mockReveal,
      onDidDispose: mockOnDispose,
    });
  });

  it('creates a webview panel with viewType ontograph.dlQuery', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();
    const [viewType] = mockCreateWebviewPanel.mock.calls[0] as unknown as [string, ...unknown[]];
    expect(viewType).toBe('ontograph.dlQuery');
  });

  it('reveals existing panel instead of creating a new one on second call', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();
    expect(mockReveal).toHaveBeenCalledOnce();
  });

  it('posts ontologyStatus hasOntology:true on ready when model is loaded', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'ready' });
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ontologyStatus', hasOntology: true }),
    );
  });

  it('posts ontologyStatus hasOntology:false on ready when model is undefined', () => {
    openDLQueryPanel(fakeContext, fakeBridge, undefined, fakeReveal);
    getMessageHandler()({ type: 'ready' });
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ontologyStatus', hasOntology: false }),
    );
  });

  it('posts dlQueryLoading immediately on execute message', () => {
    mockDlQuery.mockResolvedValueOnce({
      directSuperClasses: [], superClasses: [], equivalentClasses: [],
      directSubClasses: [], subClasses: [], instances: [],
    });
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'execute', classExpression: 'Dog', queryTypes: ['directSuperClasses'] });
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'dlQueryLoading' });
  });

  it('calls bridge.dlQuery with classExpression and queryTypes on execute', async () => {
    mockDlQuery.mockResolvedValueOnce({
      directSuperClasses: ['http://example.org/Animal'],
      superClasses: [], equivalentClasses: [], directSubClasses: [], subClasses: [], instances: [],
    });
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'execute', classExpression: 'Dog', queryTypes: ['directSuperClasses'] });

    await vi.waitUntil(() => mockPostMessage.mock.calls.some(
      ([m]) => (m as { type: string }).type === 'dlQueryResult',
    ));

    expect(mockDlQuery).toHaveBeenCalledWith(
      expect.any(String), expect.anything(), null, 'Dog', ['directSuperClasses'], 'auto',
    );
  });

  it('posts dlQueryResult with grouped entities after execute succeeds', async () => {
    mockDlQuery.mockResolvedValueOnce({
      directSuperClasses: ['http://example.org/Animal'],
      superClasses: [], equivalentClasses: [], directSubClasses: [], subClasses: [], instances: [],
    });
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'execute', classExpression: 'Dog', queryTypes: ['directSuperClasses'] });

    await vi.waitUntil(() => mockPostMessage.mock.calls.some(
      ([m]) => (m as { type: string }).type === 'dlQueryResult',
    ));

    const [resultMsg] = mockPostMessage.mock.calls.find(
      ([m]) => (m as { type: string }).type === 'dlQueryResult',
    )! as [{ type: string; groups: { queryType: string; entities: { iri: string }[] }[] }];
    expect(resultMsg.groups[0]!.queryType).toBe('directSuperClasses');
    expect(resultMsg.groups[0]!.entities[0]!.iri).toBe('http://example.org/Animal');
  });

  it('posts dlQueryError when bridge.dlQuery rejects', async () => {
    mockDlQuery.mockRejectedValueOnce(new Error('Parse error: unexpected token'));
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'execute', classExpression: 'BadExpr', queryTypes: ['subClasses'] });

    await vi.waitUntil(() => mockPostMessage.mock.calls.some(
      ([m]) => (m as { type: string }).type === 'dlQueryError',
    ));

    const [errMsg] = mockPostMessage.mock.calls.find(
      ([m]) => (m as { type: string }).type === 'dlQueryError',
    )! as [{ type: string; message: string }];
    expect(errMsg.message).toContain('Parse error');
  });

  it('calls revealFn with iri and entityType on navigate for a class', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'navigate', iri: 'http://example.org/Dog', entityType: 'class' });
    expect(fakeReveal).toHaveBeenCalledWith('http://example.org/Dog', 'class');
  });

  it('calls revealFn with individual entityType on navigate for an instance', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    getMessageHandler()({ type: 'navigate', iri: 'http://example.org/fido', entityType: 'individual' });
    expect(fakeReveal).toHaveBeenCalledWith('http://example.org/fido', 'individual');
  });

  it('updateDLQueryModel posts ontologyStatus with hasOntology:false when model cleared', () => {
    openDLQueryPanel(fakeContext, fakeBridge, fakeModel, fakeReveal);
    vi.clearAllMocks();
    updateDLQueryModel(undefined);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ontologyStatus', hasOntology: false }),
    );
  });

  it('updateDLQueryModel posts ontologyStatus with hasOntology:true when model set', () => {
    openDLQueryPanel(fakeContext, fakeBridge, undefined, fakeReveal);
    vi.clearAllMocks();
    updateDLQueryModel(fakeModel);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ontologyStatus', hasOntology: true }),
    );
  });
});
