import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ParserRegistry } from '../parser/ParserRegistry';
import type { OntologyModel, OWLClass } from '../model/OntologyModel';
import type { ExtensionContext } from 'vscode';
import { buildDiagramMessage, exportUmlDiagramDrawio, exportUmlDiagram, generateUmlDiagram } from './generateUmlDiagram';

const {
  mockShowSaveDialog, mockWriteFile, mockShowInformationMessage, mockShowErrorMessage, mockExecuteCommand,
  mockFspWriteFile, mockFspUnlink, mockExecFile,
  mockPostMessage, mockReveal, mockOnDispose, mockOnMessage, mockCreateWebviewPanel, mockConfigGet,
} = vi.hoisted(() => {
  const mockPostMessage = vi.fn();
  const mockReveal = vi.fn();
  const mockOnDispose = vi.fn();
  const mockOnMessage = vi.fn();
  const mockConfigGet = vi.fn((_key: string): unknown => undefined);
  const mockCreateWebviewPanel = vi.fn(() => ({
    webview: {
      html: '',
      postMessage: mockPostMessage,
      onDidReceiveMessage: mockOnMessage,
      asWebviewUri: vi.fn((u: unknown) => u),
      cspSource: 'vscode-resource:',
    },
    reveal: mockReveal,
    onDidDispose: mockOnDispose,
  }));
  return {
    mockShowSaveDialog: vi.fn(),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockShowInformationMessage: vi.fn().mockResolvedValue(undefined),
    mockShowErrorMessage: vi.fn().mockResolvedValue(undefined),
    mockExecuteCommand: vi.fn(),
    mockFspWriteFile: vi.fn().mockResolvedValue(undefined),
    mockFspUnlink: vi.fn().mockResolvedValue(undefined),
    mockExecFile: vi.fn((_bin, _args, cb) => cb(null, '', '')),
    mockPostMessage, mockReveal, mockOnDispose, mockOnMessage, mockCreateWebviewPanel, mockConfigGet,
  };
});

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    showSaveDialog: mockShowSaveDialog,
    createWebviewPanel: mockCreateWebviewPanel,
    withProgress: (_opts: unknown, task: () => Promise<unknown>) => task(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: mockConfigGet })),
    fs: { writeFile: mockWriteFile },
  },
  commands: { executeCommand: mockExecuteCommand },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
  Uri: {
    joinPath: vi.fn(),
    parse: (s: string) => ({ fsPath: s.replace('file://', '') }),
    file: (p: string) => ({ fsPath: p }),
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: { ...actual.promises, writeFile: mockFspWriteFile, unlink: mockFspUnlink },
  };
});

vi.mock('child_process', () => ({ execFile: mockExecFile }));

const FIXTURE_PATH = path.join(__dirname, '..', '..', 'test-ontologies', 'uml-fixture.ofn');
const NS = 'http://example.org/uml-fixture#';

function loadFixture(): OntologyModel {
  const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return ParserRegistry.parse(content, 'owl-functional', 'file:///uml-fixture.ofn');
}

describe('buildDiagramMessage', () => {
  it('produces an updateDiagram message whose every edge has a defined composition/generalization kind', () => {
    const model = loadFixture();
    const msg = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`]);

    expect(msg.type).toBe('updateDiagram');
    expect(msg.focusIri).toBe(`${NS}Root`);
    expect(msg.depth).toBe(2);
    for (const edge of msg.edges) {
      expect(['composition', 'generalization']).toContain(edge.kind);
    }
    expect(msg.edges.length).toBeGreaterThan(0);
  });

  it('never invokes any vscode command (in particular, never triggers classification) while building a diagram message, whether or not the model is already classified (spec 032 FR-002)', () => {
    const unclassified = loadFixture();
    buildDiagramMessage(unclassified, `${NS}GenSuper`, 1, []);
    expect(mockExecuteCommand).not.toHaveBeenCalled();

    const classified = loadFixture();
    classified.isClassified = true;
    classified.inferredSubClasses.set(`${NS}GenSuper`, new Set([`${NS}GenSub`]));
    buildDiagramMessage(classified, `${NS}GenSuper`, 1, []);
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('includes excludedRelations in the message so the webview can render them (FR-010)', () => {
    const model = loadFixture();
    const msg = buildDiagramMessage(model, `${NS}Whole`, 1, [`${NS}partOf`]);

    expect(msg.excludedRelations).toContainEqual(expect.objectContaining({
      fromIri: `${NS}Whole`, propertyIri: `${NS}vasculatureOf`, targetIri: `${NS}VascOfWhole`,
    }));
  });

  it('merges layout positions (x/y) onto every node before sending', () => {
    const model = loadFixture();
    const msg = buildDiagramMessage(model, `${NS}GenSuper`, 1, []);

    for (const n of msg.nodes) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    }
  });

  it('reflects the node cap via nodeCapReached', () => {
    const model = loadFixture();
    const msg = buildDiagramMessage(model, `${NS}GenSuper`, 1, [], { maxNodes: 2 });
    expect(msg.nodeCapReached).toBe(true);
  });

  it('includes a ready-to-inject HTML/SVG fragment the webview can display without its own rendering logic', () => {
    const model = loadFixture();
    const msg = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`]);

    expect(msg.svg).toContain('<svg');
    expect(msg.nodesHtml).toContain('data-iri="' + `${NS}Root` + '"');
    expect(msg.canvasWidth).toBeGreaterThan(0);
    expect(msg.canvasHeight).toBeGreaterThan(0);
  });

  it('applies node exclusions (subtree mode) before rendering, dropping a marked node and its descendants', () => {
    const model = loadFixture();
    const withoutExclusion = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`]);
    expect(withoutExclusion.nodes.map(n => n.iri)).toContain(`${NS}Bone`);

    const excluded = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`], {
      excludeIris: new Set([`${NS}Bone`]), exclusionMode: 'subtree',
    });
    expect(excluded.nodes.map(n => n.iri)).not.toContain(`${NS}Bone`);
    // DualNode is also reachable via Whole (FR-011 dual relationship) — excluding only Bone must not drop it.
    expect(excluded.nodes.map(n => n.iri)).toContain(`${NS}DualNode`);
  });

  it('applies node exclusions (splice mode) reconnecting a removed node\'s children to its parent', () => {
    const model = loadFixture();
    const excluded = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`], {
      excludeIris: new Set([`${NS}Whole`]), exclusionMode: 'splice',
    });
    expect(excluded.nodes.map(n => n.iri)).not.toContain(`${NS}Whole`);
    // Part was Whole's composition child — splice mode keeps it, reconnected to Root.
    expect(excluded.nodes.map(n => n.iri)).toContain(`${NS}Part`);
    expect(excluded.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}Root`, childIri: `${NS}Part`, kind: 'composition',
    }));
  });

  it('leaves the diagram unchanged when excludeIris is omitted (default behavior preserved)', () => {
    const model = loadFixture();
    const withDefaults = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`]);
    const withEmptySet = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`], { excludeIris: new Set() });
    expect(withEmptySet.nodes.map(n => n.iri).sort()).toEqual(withDefaults.nodes.map(n => n.iri).sort());
  });

  it('defaults direction to LR when omitted, and echoes the requested direction otherwise', () => {
    const model = loadFixture();
    const withDefault = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`]);
    expect(withDefault.direction).toBe('LR');

    const withTB = buildDiagramMessage(model, `${NS}Root`, 2, [`${NS}partOf`], { direction: 'TB' });
    expect(withTB.direction).toBe('TB');
    // Same node set either way — direction only affects layout coordinates, not extraction.
    expect(withTB.nodes.map(n => n.iri).sort()).toEqual(withDefault.nodes.map(n => n.iri).sort());
  });
});

describe('exportUmlDiagramDrawio', () => {
  it('writes well-formed drawio XML to the user-chosen save location', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ fsPath: '/tmp/out.drawio' });
    mockWriteFile.mockClear();
    const model = loadFixture();

    await exportUmlDiagramDrawio(model, `${NS}Root`);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, buffer] = mockWriteFile.mock.calls[0];
    const xml = buffer.toString('utf-8');
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('mxCell');
  });

  it('does nothing if the user cancels the save dialog', async () => {
    mockShowSaveDialog.mockResolvedValueOnce(undefined);
    mockWriteFile.mockClear();
    const model = loadFixture();

    await exportUmlDiagramDrawio(model, `${NS}Root`);

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('warns and does nothing when no entity is focused', async () => {
    const model = loadFixture();
    mockWriteFile.mockClear();
    await exportUmlDiagramDrawio(model, undefined);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe('exportUmlDiagram (svg format)', () => {
  it('writes a well-formed standalone SVG document', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ fsPath: '/tmp/out.svg' });
    mockWriteFile.mockClear();
    const model = loadFixture();

    await exportUmlDiagram(model, `${NS}Root`, 'svg');

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, buffer] = mockWriteFile.mock.calls[0];
    const xml = buffer.toString('utf-8');
    expect(xml).toContain('<svg');
    expect(xml).toContain('</svg>');
  });
});

describe('exportUmlDiagram (png format)', () => {
  it('writes a temp .drawio file, shells out to the draw.io CLI, and cleans up on success', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ fsPath: '/tmp/out.png' });
    mockFspWriteFile.mockClear();
    mockFspUnlink.mockClear();
    mockExecFile.mockClear();
    mockExecFile.mockImplementationOnce((_bin, _args, cb) => cb(null, '', ''));
    const model = loadFixture();

    await exportUmlDiagram(model, `${NS}Root`, 'png');

    expect(mockFspWriteFile).toHaveBeenCalledTimes(1);
    const [tempPath, xml] = mockFspWriteFile.mock.calls[0];
    expect(String(tempPath)).toMatch(/\.drawio$/);
    expect(xml).toContain('<mxfile');
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockFspUnlink).toHaveBeenCalledWith(tempPath);
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('offers a draw.io fallback and does not crash when the CLI is unavailable', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ fsPath: '/tmp/out.png' });
    mockShowErrorMessage.mockResolvedValueOnce(undefined);
    mockExecFile.mockClear();
    mockExecFile.mockImplementationOnce((_bin, _args, cb) => cb(new Error('ENOENT'), '', 'command not found'));
    const model = loadFixture();

    await expect(exportUmlDiagram(model, `${NS}Root`, 'png')).resolves.not.toThrow();
    expect(mockShowErrorMessage).toHaveBeenCalled();
  });
});

function getMessageHandler(): (msg: unknown) => void {
  const lastCall = mockOnMessage.mock.calls[mockOnMessage.mock.calls.length - 1] as [(msg: unknown) => void];
  return lastCall[0];
}

describe('generateUmlDiagram — node exclusion regeneration', () => {
  const fakeContext = { extensionUri: 'fake-uri', subscriptions: [] } as unknown as ExtensionContext;

  beforeEach(() => {
    // Fire dispose BEFORE clearing mocks so the module-level panel singleton resets, same
    // pattern as DLQueryPanel.test.ts — otherwise a panel created by an earlier test lingers
    // and generateUmlDiagram() takes the "reuse existing panel" branch instead of creating one.
    if (mockOnDispose.mock.calls.length > 0) {
      const disposeCallback = (mockOnDispose.mock.calls[0] as [() => void])[0];
      if (typeof disposeCallback === 'function') { disposeCallback(); }
    }
    vi.clearAllMocks();
    mockCreateWebviewPanel.mockReturnValue({
      webview: {
        html: '',
        postMessage: mockPostMessage,
        onDidReceiveMessage: mockOnMessage,
        asWebviewUri: vi.fn((u: unknown) => u),
        cspSource: 'vscode-resource:',
      },
      reveal: mockReveal,
      onDidDispose: mockOnDispose,
    });
    mockConfigGet.mockImplementation((key: string) => {
      if (key === 'umlDiagram.compositionProperties') { return [`${NS}partOf`]; }
      if (key === 'umlDiagram.defaultDepth') { return 2; }
      return undefined;
    });
  });

  it('requestRegenerate removes the marked node from the next updateDiagram message', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();

    mockPostMessage.mockClear();
    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    expect(msg.nodes.map(n => n.iri)).not.toContain(`${NS}Bone`);
  });

  it('exclusions persist across a subsequent depth change for the same focus entity', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();

    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });
    mockPostMessage.mockClear();
    handler({ type: 'requestDepthChange', iri: `${NS}Root`, depth: 1 });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    expect(msg.nodes.map(n => n.iri)).not.toContain(`${NS}Bone`);
  });

  it('resetExclusions restores the previously-marked node', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();

    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });
    mockPostMessage.mockClear();
    handler({ type: 'resetExclusions', iri: `${NS}Root`, depth: 2 });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    expect(msg.nodes.map(n => n.iri)).toContain(`${NS}Bone`);
  });

  it('accumulates exclusions across multiple Regenerate clicks rather than replacing them', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();

    // First Regenerate: exclude Bone only.
    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });
    // Second Regenerate: the webview only ever sends newly-marked nodes (Bone is already gone
    // from the diagram, so it can't be re-marked) — here the user marks Whole instead.
    mockPostMessage.mockClear();
    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Whole`], mode: 'subtree' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    const iris = msg.nodes.map(n => n.iri);
    // Both exclusions must still be in effect — Bone must NOT have reappeared just because the
    // second Regenerate didn't mention it.
    expect(iris).not.toContain(`${NS}Bone`);
    expect(iris).not.toContain(`${NS}Whole`);
  });

  it('closing the panel resets exclusions — reopening for the same entity starts fresh', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();
    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });

    const disposeCallback = (mockOnDispose.mock.calls[0] as [() => void])[0];
    disposeCallback();

    mockPostMessage.mockClear();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const newHandler = getMessageHandler();
    newHandler({ type: 'ready' });

    expect(mockPostMessage).toHaveBeenCalled();
    const [msg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ nodes: Array<{ iri: string }> }];
    expect(msg.nodes.map(n => n.iri)).toContain(`${NS}Bone`);
  });

  it('requestDirectionChange re-lays out the same diagram at the new direction', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();

    mockPostMessage.mockClear();
    handler({ type: 'requestDirectionChange', iri: `${NS}Root`, depth: 2, direction: 'LR' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ direction: string }];
    expect(msg.direction).toBe('LR');
  });

  it('resets exclusions when a different entity becomes the focus (refocus)', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();
    handler({ type: 'requestRegenerate', iri: `${NS}Root`, depth: 2, excludeIris: [`${NS}Bone`], mode: 'subtree' });

    // Refocus on a different entity — the panel is reused (not recreated), same as production
    // behavior for an already-open panel.
    generateUmlDiagram(fakeContext, model, `${NS}Whole`);

    // Re-focus back onto Root: if the exclusion had NOT been reset by the intervening refocus,
    // Bone would still be missing here.
    mockPostMessage.mockClear();
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const [msgBack] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    expect(msgBack.nodes.map(n => n.iri)).toContain(`${NS}Bone`);
  });

  it('auto-excludes lateralized nodes (Laterality some Left/Right) from the initial diagram', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    const iris = msg.nodes.map(n => n.iri);
    expect(iris).toContain(`${NS}LateralParent`);
    expect(iris).not.toContain(`${NS}LateralLeft`);
    expect(iris).not.toContain(`${NS}LateralRight`);
    // "Laterality some Side" is the generic reference concept, not a side-specific variant — it
    // must stay visible.
    expect(iris).toContain(`${NS}LateralSide`);
  });

  function addInferredOnlyChild(model: OntologyModel, parentIri: string, childIri: string, label = 'Inferred only child'): void {
    model.classes.set(childIri, {
      iri: childIri, type: 'class', labels: { en: [label] }, annotations: {},
      superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
      superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    });
    model.isClassified = true;
    model.inferredSubClasses.set(parentIri, new Set([childIri]));
  }

  it('is absent by default ("stated" view mode) — the Inferred view is a SEPARATE diagram, not merged in', () => {
    const model = loadFixture();
    const inferredOnlyIri = `${NS}InferredOnlyChild`;
    addInferredOnlyChild(model, `${NS}GenSuper`, inferredOnlyIri);

    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });

    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }>; viewMode: string }];
    expect(msg.nodes.map(n => n.iri)).not.toContain(inferredOnlyIri);
    expect(msg.viewMode).toBe('stated');
  });

  it('requestSetViewMode(mode: "inferred") switches to the Inferred view and echoes viewMode on the message', () => {
    const model = loadFixture();
    const inferredOnlyIri = `${NS}InferredOnlyChild`;
    addInferredOnlyChild(model, `${NS}GenSuper`, inferredOnlyIri);

    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });

    mockPostMessage.mockClear();
    handler({ type: 'requestSetViewMode', iri: `${NS}GenSuper`, depth: 2, direction: 'TB', mode: 'inferred' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }>; viewMode: string }];
    expect(msg.nodes.map(n => n.iri)).toContain(inferredOnlyIri);
    expect(msg.viewMode).toBe('inferred');
  });

  it('the Inferred view mode persists across a subsequent depth change, same as the lateralized toggle does', () => {
    const model = loadFixture();
    const inferredOnlyIri = `${NS}InferredOnlyChild`;
    addInferredOnlyChild(model, `${NS}GenSuper`, inferredOnlyIri);

    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestSetViewMode', iri: `${NS}GenSuper`, depth: 2, direction: 'TB', mode: 'inferred' });

    mockPostMessage.mockClear();
    handler({ type: 'requestDepthChange', iri: `${NS}GenSuper`, depth: 1, direction: 'TB' });

    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    expect(msg.nodes.map(n => n.iri)).toContain(inferredOnlyIri);
  });

  it('resets the view mode back to "stated" when a different entity becomes the focus', () => {
    const model = loadFixture();
    const inferredOnlyIri = `${NS}InferredOnlyChild`;
    addInferredOnlyChild(model, `${NS}GenSuper`, inferredOnlyIri);

    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestSetViewMode', iri: `${NS}GenSuper`, depth: 2, direction: 'TB', mode: 'inferred' });

    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    mockPostMessage.mockClear();
    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);

    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }>; viewMode: string }];
    expect(msg.nodes.map(n => n.iri)).not.toContain(inferredOnlyIri);
    expect(msg.viewMode).toBe('stated');
  });

  it('auto-excludes a reasoner-inferred-only LATERALIZED subtype from the Inferred view by default, and reveals it via the existing lateralized toggle', () => {
    const model = loadFixture();
    const inferredLateralIri = `${NS}InferredLateralLeft`;
    addInferredOnlyChild(model, `${NS}LateralParent`, inferredLateralIri, 'Inferred lateral left');
    model.classes.get(inferredLateralIri)!.superClassExpressions = ['http://snomed.info/id/272741003 some http://snomed.info/id/7771000'];

    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestSetViewMode', iri: `${NS}LateralParent`, depth: 2, direction: 'TB', mode: 'inferred' });

    const [inferredMsg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ nodes: Array<{ iri: string }> }];
    expect(inferredMsg.nodes.map(n => n.iri)).not.toContain(inferredLateralIri);

    handler({ type: 'requestToggleLateralized', iri: `${NS}LateralParent`, depth: 2, direction: 'TB', include: true });
    const [revealedMsg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ nodes: Array<{ iri: string }> }];
    expect(revealedMsg.nodes.map(n => n.iri)).toContain(inferredLateralIri);
  });

  it('auto-excludes an "Entire X" class from the Inferred view by default, and reveals it via the existing lateralized toggle', () => {
    const model = loadFixture();
    const entireIri = `${NS}InferredEntireKidney`;
    addInferredOnlyChild(model, `${NS}GenSuper`, entireIri, 'Entire kidney');

    generateUmlDiagram(fakeContext, model, `${NS}GenSuper`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestSetViewMode', iri: `${NS}GenSuper`, depth: 2, direction: 'TB', mode: 'inferred' });

    const [inferredMsg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ nodes: Array<{ iri: string }> }];
    expect(inferredMsg.nodes.map(n => n.iri)).not.toContain(entireIri);

    handler({ type: 'requestToggleLateralized', iri: `${NS}GenSuper`, depth: 2, direction: 'TB', include: true });
    const [revealedMsg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ nodes: Array<{ iri: string }> }];
    expect(revealedMsg.nodes.map(n => n.iri)).toContain(entireIri);
  });

  it('never produces a composition edge in the Inferred view, even when the model has configured composition properties', () => {
    const model = loadFixture();
    const inferredOnlyIri = `${NS}InferredOnlyChild`;
    addInferredOnlyChild(model, `${NS}Root`, inferredOnlyIri);
    // beforeEach already configures `umlDiagram.compositionProperties` to [`${NS}partOf`] — the
    // Inferred view must ignore it entirely, unlike the Stated view.

    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestSetViewMode', iri: `${NS}Root`, depth: 2, direction: 'TB', mode: 'inferred' });

    const [msg] = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1] as [{ edges: Array<{ kind: string }> }];
    expect(msg.edges.every(e => e.kind === 'generalization')).toBe(true);
  });

  it('resetExclusions does NOT reveal lateralized nodes — that is the dedicated "Show full subhierarchy" toggle\'s job, not a general reset', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });

    mockPostMessage.mockClear();
    handler({ type: 'resetExclusions', iri: `${NS}LateralParent`, depth: 2 });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    const iris = msg.nodes.map(n => n.iri);
    expect(iris).not.toContain(`${NS}LateralLeft`);
    expect(iris).not.toContain(`${NS}LateralRight`);
  });

  it('requestToggleLateralized(include: true) reveals lateralized nodes and echoes includeLateralized on the message', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });

    mockPostMessage.mockClear();
    handler({ type: 'requestToggleLateralized', iri: `${NS}LateralParent`, depth: 2, direction: 'TB', include: true });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }>; includeLateralized: boolean }];
    const iris = msg.nodes.map(n => n.iri);
    expect(iris).toContain(`${NS}LateralLeft`);
    expect(iris).toContain(`${NS}LateralRight`);
    expect(msg.includeLateralized).toBe(true);
  });

  it('the "Show full subhierarchy" toggle persists across a subsequent depth change, same as manual exclusions do', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestToggleLateralized', iri: `${NS}LateralParent`, depth: 2, direction: 'TB', include: true });

    mockPostMessage.mockClear();
    handler({ type: 'requestDepthChange', iri: `${NS}LateralParent`, depth: 1, direction: 'TB' });

    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    const iris = msg.nodes.map(n => n.iri);
    expect(iris).toContain(`${NS}LateralLeft`);
    expect(iris).toContain(`${NS}LateralRight`);
  });

  it('resets the "Show full subhierarchy" toggle back off when a different entity becomes the focus', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);
    const handler = getMessageHandler();
    handler({ type: 'ready' });
    handler({ type: 'requestToggleLateralized', iri: `${NS}LateralParent`, depth: 2, direction: 'TB', include: true });

    // Refocus away, then back — a NEW focus session resets the toggle to its default (hidden),
    // regardless of what the previous session had it set to.
    generateUmlDiagram(fakeContext, model, `${NS}Root`);
    mockPostMessage.mockClear();
    generateUmlDiagram(fakeContext, model, `${NS}LateralParent`);

    const [msg] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }>; includeLateralized: boolean }];
    const iris = msg.nodes.map(n => n.iri);
    expect(iris).not.toContain(`${NS}LateralLeft`);
    expect(iris).not.toContain(`${NS}LateralRight`);
    expect(msg.includeLateralized).toBe(false);
  });

  it('hides a lateralized node that only becomes reachable after the depth is increased — the filter is recomputed fresh at every level, not seeded once at generation time', () => {
    const model = loadFixture();
    generateUmlDiagram(fakeContext, model, `${NS}LateralDeepParent`);
    const handler = getMessageHandler();

    handler({ type: 'requestDiagram', iri: `${NS}LateralDeepParent`, depth: 1, direction: 'TB' });
    const [shallow] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    // At depth 1, LateralDeepLeft isn't even reachable yet — LateralDeepMid is the only child.
    expect(shallow.nodes.map(n => n.iri)).toContain(`${NS}LateralDeepMid`);
    expect(shallow.nodes.map(n => n.iri)).not.toContain(`${NS}LateralDeepLeft`);

    mockPostMessage.mockClear();
    handler({ type: 'requestDepthChange', iri: `${NS}LateralDeepParent`, depth: 2, direction: 'TB' });
    const [deeper] = mockPostMessage.mock.calls[0] as [{ nodes: Array<{ iri: string }> }];
    // At depth 2, LateralDeepLeft becomes reachable — but it is STILL hidden, since it is
    // lateralized, regardless of the level at which it first appears.
    expect(deeper.nodes.map(n => n.iri)).toContain(`${NS}LateralDeepMid`);
    expect(deeper.nodes.map(n => n.iri)).not.toContain(`${NS}LateralDeepLeft`);
  });
});
