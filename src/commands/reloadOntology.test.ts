import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reloadOntology } from './reloadOntology';
import type { OntologyModel } from '../model/OntologyModel';

const { mockOpenTextDocument, mockShowErrorMessage, mockParseAsync } = vi.hoisted(() => ({
  mockOpenTextDocument: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockParseAsync: vi.fn(),
}));

vi.mock('../parser/ParserRegistry', () => ({
  ParserRegistry: {
    parseAsync: mockParseAsync,
  },
}));

vi.mock('vscode', () => ({
  workspace: {
    openTextDocument: mockOpenTextDocument,
  },
  window: {
    showErrorMessage: mockShowErrorMessage,
  },
  Uri: {
    parse: vi.fn((s: string) => ({ toString: () => s, fsPath: s })),
  },
}));

const fakeModel = {
  sourceUri: 'file:///test/animals.omn',
} as unknown as OntologyModel;

const fakeDoc = {
  getText: () => 'Ontology(<http://example.org/animals>)',
  languageId: 'manchester',
};

const fakeParsedModel = {
  sourceUri: 'file:///test/animals.omn',
} as unknown as OntologyModel;

describe('reloadOntology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenTextDocument.mockResolvedValue(fakeDoc);
    mockParseAsync.mockResolvedValue(fakeParsedModel);
  });

  it('calls openTextDocument with a URI derived from activeModel.sourceUri', async () => {
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(mockOpenTextDocument).toHaveBeenCalledOnce();
  });

  it('calls ParserRegistry.parseAsync with document text, languageId, and sourceUri', async () => {
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(mockParseAsync).toHaveBeenCalledWith(
      'Ontology(<http://example.org/animals>)',
      'manchester',
      fakeModel.sourceUri,
    );
  });

  it('calls onReloaded with the parsed model on success', async () => {
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(onReloaded).toHaveBeenCalledOnce();
    expect(onReloaded).toHaveBeenCalledWith(fakeParsedModel);
  });

  it('does NOT call onReloaded when parseAsync throws', async () => {
    mockParseAsync.mockRejectedValue(new Error('syntax error at line 3'));
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(onReloaded).not.toHaveBeenCalled();
  });

  it('shows showErrorMessage when parseAsync throws', async () => {
    mockParseAsync.mockRejectedValue(new Error('syntax error at line 3'));
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(mockShowErrorMessage).toHaveBeenCalledOnce();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('syntax error at line 3'),
    );
  });

  it('does NOT call onReloaded when openTextDocument throws (file missing)', async () => {
    mockOpenTextDocument.mockRejectedValue(new Error('file not found'));
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(onReloaded).not.toHaveBeenCalled();
  });

  it('shows showErrorMessage when openTextDocument throws', async () => {
    mockOpenTextDocument.mockRejectedValue(new Error('file not found'));
    const onReloaded = vi.fn();
    await reloadOntology(fakeModel, onReloaded);
    expect(mockShowErrorMessage).toHaveBeenCalledOnce();
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('file not found'),
    );
  });
});
