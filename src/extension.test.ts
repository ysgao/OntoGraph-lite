import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLargeFileListener } from './commands/largeFileNotification';
import type { OntologyModel } from './model/OntologyModel';

/**
 * Tests for the large-file notification listener (T006/T007).
 * Targets largeFileNotification.ts directly to avoid mocking the full extension API surface.
 */

const {
  mockShowInformationMessage,
  mockStat,
  mockLoadOntologyFile,
} = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockStat: vi.fn(),
  mockLoadOntologyFile: vi.fn(),
}));

vi.mock('./commands/loadOntologyFile', () => ({
  loadOntologyFile: mockLoadOntologyFile,
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: mockShowInformationMessage,
  },
  workspace: {
    fs: { stat: mockStat },
  },
}));

const LARGE = 11 * 1024 * 1024; // 11 MB — above 10 MB threshold

function makeEditor(fsPath: string, content: string) {
  return {
    document: {
      uri: { fsPath, toString: () => `file://${fsPath}` },
      getText: () => content,
    },
  };
}

const fakeOnLoaded = vi.fn() as (model: OntologyModel) => void;

describe('createLargeFileListener — T006: detection', () => {
  let listener: ReturnType<typeof createLargeFileListener>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ size: LARGE });
    mockShowInformationMessage.mockResolvedValue(undefined);
    // Fresh listener each test to reset notifiedUris state
    vi.resetModules();
  });

  it('shows notification for .owl file with empty getText() and stat > 10 MB', async () => {
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/snomed.owl', '') as never);
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "This file is too large for VS Code's text editor. Load it in OntoGraph?",
      'Load',
    );
  });

  it('does not notify when getText() is non-empty (normal file loaded OK)', async () => {
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/pizza.owl', 'Ontology(...)') as never);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('does not notify for non-ontology extension', async () => {
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/big-data.csv', '') as never);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('does not notify when stat size is at or below 10 MB', async () => {
    mockStat.mockResolvedValueOnce({ size: 10 * 1024 * 1024 });
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/small.owl', '') as never);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('does not notify when editor is undefined', async () => {
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(undefined);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('does not repeat notification for the same URI (notifiedUris guard)', async () => {
    listener = createLargeFileListener(fakeOnLoaded);
    const editor = makeEditor('/data/snomed.owl', '');
    await listener(editor as never);
    await listener(editor as never);
    expect(mockShowInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('handles all six supported ontology extensions', async () => {
    for (const ext of ['owl', 'ofn', 'omn', 'ttl', 'owx', 'n3']) {
      vi.clearAllMocks();
      mockStat.mockResolvedValue({ size: LARGE });
      mockShowInformationMessage.mockResolvedValue(undefined);
      listener = createLargeFileListener(fakeOnLoaded);
      await listener(makeEditor(`/data/ont.${ext}`, '') as never);
      expect(mockShowInformationMessage).toHaveBeenCalledTimes(1);
    }
  });

  it('does not notify when stat throws (file inaccessible)', async () => {
    mockStat.mockRejectedValueOnce(new Error('access denied'));
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/protected.owl', '') as never);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

describe('createLargeFileListener — T007: Load action', () => {
  let listener: ReturnType<typeof createLargeFileListener>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ size: LARGE });
  });

  it('calls loadOntologyFile with prefillUri = document.uri when user clicks "Load"', async () => {
    mockShowInformationMessage.mockResolvedValueOnce('Load');
    listener = createLargeFileListener(fakeOnLoaded);
    const editor = makeEditor('/data/snomed.owl', '');
    await listener(editor as never);

    expect(mockLoadOntologyFile).toHaveBeenCalledOnce();
    const [, prefillUri] = mockLoadOntologyFile.mock.calls[0];
    expect(prefillUri).toBe(editor.document.uri);
  });

  it('passes the correct onLoaded callback to loadOntologyFile', async () => {
    mockShowInformationMessage.mockResolvedValueOnce('Load');
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/snomed.owl', '') as never);

    const [callbackArg] = mockLoadOntologyFile.mock.calls[0];
    expect(callbackArg).toBe(fakeOnLoaded);
  });

  it('does NOT call loadOntologyFile when user dismisses notification', async () => {
    mockShowInformationMessage.mockResolvedValueOnce(undefined);
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/snomed.owl', '') as never);
    expect(mockLoadOntologyFile).not.toHaveBeenCalled();
  });

  it('file picker is not shown (loadOntologyFile receives prefillUri, not undefined)', async () => {
    mockShowInformationMessage.mockResolvedValueOnce('Load');
    listener = createLargeFileListener(fakeOnLoaded);
    await listener(makeEditor('/data/snomed.owl', '') as never);

    const [, prefillUri] = mockLoadOntologyFile.mock.calls[0];
    expect(prefillUri).not.toBeUndefined();
  });
});
