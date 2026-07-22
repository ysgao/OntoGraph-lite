import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteEntity } from './deleteEntity';
import { OntologyIndex } from '../model/OntologyIndex';
import { createEmptyModel } from '../model/OntologyModel';
import type { OWLClass, OWLObjectProperty, OWLIndividual, OntologyModel, EntitySegment } from '../model/OntologyModel';

const {
  mockComputeUpdatedText,
  mockCloseEntityEditorIfShowing,
  mockQueueSyncWrite,
  mockWriteTextStreamed,
  mockShowQuickPick,
  mockShowWarningMessage,
  mockStat,
} = vi.hoisted(() => ({
  mockComputeUpdatedText: vi.fn(),
  mockCloseEntityEditorIfShowing: vi.fn(),
  mockQueueSyncWrite: vi.fn(async (_uri: string, fn: () => Promise<void>) => { await fn(); }),
  mockWriteTextStreamed: vi.fn(async () => {}),
  mockShowQuickPick: vi.fn(),
  mockShowWarningMessage: vi.fn(),
  mockStat: vi.fn(async () => ({ mtime: 1, size: 1, type: 1, ctime: 0 })),
}));

vi.mock('../views/EntityEditorPanel', () => ({
  computeUpdatedText: mockComputeUpdatedText,
  closeEntityEditorIfShowing: mockCloseEntityEditorIfShowing,
}));
vi.mock('../sync/reloadGuard', () => ({
  queueSyncWrite: mockQueueSyncWrite,
}));
vi.mock('../sync/streamWrite', () => ({
  writeTextStreamed: mockWriteTextStreamed,
}));
vi.mock('vscode', () => ({
  window: {
    showQuickPick: mockShowQuickPick,
    showWarningMessage: mockShowWarningMessage,
  },
  workspace: {
    fs: { stat: mockStat },
  },
  Uri: {
    parse: vi.fn((s: string) => ({ toString: () => s, fsPath: s, path: s })),
  },
}));

function noChange() {
  return { text: undefined, ranges: [], lineDelta: 0, annotEditSummaries: [], axiomEditSummaries: [] };
}

function makeClass(iri: string, opts: Partial<OWLClass> = {}): OWLClass {
  return {
    iri, type: 'class', labels: { en: [iri.split('/').pop() ?? iri] }, annotations: {},
    superClassIris: [], equivalentClassIris: [], disjointClassIris: [],
    superClassExpressions: [], equivalentClassExpressions: [], gciExpressions: [],
    ...opts,
  };
}

function makeObjectProperty(iri: string, opts: Partial<OWLObjectProperty> = {}): OWLObjectProperty {
  return {
    iri, type: 'objectProperty', labels: {}, annotations: {},
    superPropertyIris: [], domainIris: [], rangeIris: [],
    ...opts,
  };
}

function makeIndividual(iri: string, opts: Partial<OWLIndividual> = {}): OWLIndividual {
  return {
    iri, type: 'individual', labels: {}, annotations: {},
    classIris: [], objectPropertyAssertions: [], dataPropertyAssertions: [],
    ...opts,
  };
}

function segFor(lineIndices: number[]): EntitySegment {
  return {
    startLine: lineIndices[0], endLine: lineIndices[lineIndices.length - 1],
    startChar: 0, endChar: 0,
    lineIndices: new Int32Array(lineIndices),
    lineCharStarts: new Int32Array(lineIndices.map(() => 0)),
  };
}

function buildModel(setup: (m: OntologyModel) => void): { model: OntologyModel; index: OntologyIndex } {
  const model = createEmptyModel('file:///test.ofn');
  model.sourceFormat = 'functional';
  setup(model);
  return { model, index: new OntologyIndex(model) };
}

describe('deleteEntity — US1: leaf entity / individual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeUpdatedText.mockResolvedValue(noChange());
    mockShowWarningMessage.mockResolvedValue('Delete');
  });

  it('deletes a leaf class with no subtypes: single confirmation, no QuickPick, removed from model', async () => {
    const iri = 'http://ex.org/Leaf';
    const rawContent = [
      'Declaration(Class(<http://ex.org/Leaf>))',
      '',
      '# Class: <http://ex.org/Leaf> (Leaf)',
      ')',
    ].join('\n');
    const { model, index } = buildModel(m => {
      m.classes.set(iri, makeClass(iri));
      m.rawContent = rawContent;
      m.entitySegments = new Map([[iri, segFor([0])]]);
    });

    const onDeleted = vi.fn();
    await deleteEntity(iri, model, index, onDeleted);

    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockShowWarningMessage).toHaveBeenCalledOnce();
    expect(model.classes.has(iri)).toBe(false);
    expect(model.rawContent).not.toContain('Declaration(Class(<http://ex.org/Leaf>))');
    expect(model.rawContent).not.toContain('# Class: <http://ex.org/Leaf>');
    expect(mockWriteTextStreamed).toHaveBeenCalledOnce();
    expect(onDeleted).toHaveBeenCalledWith(model);
  });

  it('deletes an individual directly with no mode choice offered', async () => {
    const iri = 'http://ex.org/Fido';
    const { model, index } = buildModel(m => {
      m.individuals.set(iri, makeIndividual(iri));
      m.rawContent = 'Declaration(NamedIndividual(<http://ex.org/Fido>))';
      m.entitySegments = new Map([[iri, segFor([0])]]);
    });

    await deleteEntity(iri, model, index, vi.fn());

    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(model.individuals.has(iri)).toBe(false);
  });

  it('rejects deleting the protected ontology root without any file change', async () => {
    const { model, index } = buildModel(() => {});
    const onDeleted = vi.fn();
    await deleteEntity('http://www.w3.org/2002/07/owl#Thing', model, index, onDeleted);

    expect(mockShowWarningMessage).not.toHaveBeenCalledWith(expect.stringContaining('Delete'), expect.anything(), 'Delete');
    expect(mockWriteTextStreamed).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('fails gracefully when the IRI no longer resolves in the model', async () => {
    const { model, index } = buildModel(() => {});
    const onDeleted = vi.fn();
    await deleteEntity('http://ex.org/Gone', model, index, onDeleted);

    expect(mockWriteTextStreamed).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('aborts with no file change when the user cancels the final confirmation', async () => {
    mockShowWarningMessage.mockResolvedValue(undefined);
    const iri = 'http://ex.org/Leaf';
    const { model, index } = buildModel(m => {
      m.classes.set(iri, makeClass(iri));
      m.rawContent = 'Declaration(Class(<http://ex.org/Leaf>))';
      m.entitySegments = new Map([[iri, segFor([0])]]);
    });

    await deleteEntity(iri, model, index, vi.fn());

    expect(model.classes.has(iri)).toBe(true);
    expect(mockWriteTextStreamed).not.toHaveBeenCalled();
  });
});

describe('deleteEntity — US2: entity-only mode reparents direct subtypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeUpdatedText.mockResolvedValue(noChange());
    mockShowWarningMessage.mockResolvedValue('Delete');
    mockShowQuickPick.mockImplementation(async (items: Array<{ cascade: boolean }>) => items[0]);
  });

  it('reparents a single direct subclass to the deleted class’s own superclass', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClass('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClass('http://ex.org/B', { superClassIris: ['http://ex.org/A'] }));
      m.classes.set('http://ex.org/C', makeClass('http://ex.org/C', { superClassIris: ['http://ex.org/B'] }));
      m.rawContent = [
        'Declaration(Class(<http://ex.org/B>))',
        '# Class: <http://ex.org/B> (B)',
      ].join('\n');
      m.entitySegments = new Map([['http://ex.org/B', segFor([0])]]);
    });

    await deleteEntity('http://ex.org/B', model, index, vi.fn());

    expect(mockShowQuickPick).toHaveBeenCalledOnce();
    expect(model.classes.has('http://ex.org/B')).toBe(false);
    expect(model.classes.get('http://ex.org/C')?.superClassIris).toEqual(['http://ex.org/A']);
  });

  it('deduplicates when reparenting under multiple inheritance', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A1', makeClass('http://ex.org/A1'));
      m.classes.set('http://ex.org/A2', makeClass('http://ex.org/A2'));
      m.classes.set('http://ex.org/B', makeClass('http://ex.org/B', { superClassIris: ['http://ex.org/A1', 'http://ex.org/A2'] }));
      m.classes.set('http://ex.org/C', makeClass('http://ex.org/C', { superClassIris: ['http://ex.org/B', 'http://ex.org/A1'] }));
      m.rawContent = 'Declaration(Class(<http://ex.org/B>))';
      m.entitySegments = new Map([['http://ex.org/B', segFor([0])]]);
    });

    await deleteEntity('http://ex.org/B', model, index, vi.fn());

    const supers = model.classes.get('http://ex.org/C')?.superClassIris ?? [];
    expect(new Set(supers)).toEqual(new Set(['http://ex.org/A1', 'http://ex.org/A2']));
    expect(supers.length).toBe(2);
  });

  it('falls back to root level (no superclass) when the deleted class had none', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/Root', makeClass('http://ex.org/Root'));
      m.classes.set('http://ex.org/Child', makeClass('http://ex.org/Child', { superClassIris: ['http://ex.org/Root'] }));
      m.rawContent = 'Declaration(Class(<http://ex.org/Root>))';
      m.entitySegments = new Map([['http://ex.org/Root', segFor([0])]]);
    });

    await deleteEntity('http://ex.org/Root', model, index, vi.fn());

    expect(model.classes.get('http://ex.org/Child')?.superClassIris).toEqual([]);
  });

  it('reparents a sub-object-property via superPropertyIris', async () => {
    const { model, index } = buildModel(m => {
      m.objectProperties.set('http://ex.org/partOf', makeObjectProperty('http://ex.org/partOf'));
      m.objectProperties.set('http://ex.org/properPartOf', makeObjectProperty('http://ex.org/properPartOf', { superPropertyIris: ['http://ex.org/partOf'] }));
      m.objectProperties.set('http://ex.org/tinyPartOf', makeObjectProperty('http://ex.org/tinyPartOf', { superPropertyIris: ['http://ex.org/properPartOf'] }));
      m.rawContent = 'Declaration(ObjectProperty(<http://ex.org/properPartOf>))';
      m.entitySegments = new Map([['http://ex.org/properPartOf', segFor([0])]]);
    });

    await deleteEntity('http://ex.org/properPartOf', model, index, vi.fn());

    expect(model.objectProperties.get('http://ex.org/tinyPartOf')?.superPropertyIris).toEqual(['http://ex.org/partOf']);
  });

  it('leaf class (no subtypes) never triggers the QuickPick even when other classes exist', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/Unrelated', makeClass('http://ex.org/Unrelated'));
      m.classes.set('http://ex.org/Leaf', makeClass('http://ex.org/Leaf'));
      m.rawContent = 'Declaration(Class(<http://ex.org/Leaf>))';
      m.entitySegments = new Map([['http://ex.org/Leaf', segFor([0])]]);
    });

    await deleteEntity('http://ex.org/Leaf', model, index, vi.fn());
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });
});

describe('deleteEntity — US3: cascade delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComputeUpdatedText.mockResolvedValue(noChange());
    mockShowWarningMessage.mockResolvedValue('Delete');
    mockShowQuickPick.mockImplementation(async (items: Array<{ cascade: boolean }>) => items[1]);
  });

  it('removes the full transitive closure from the model', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClass('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClass('http://ex.org/B', { superClassIris: ['http://ex.org/A'] }));
      m.classes.set('http://ex.org/C', makeClass('http://ex.org/C', { superClassIris: ['http://ex.org/B'] }));
      m.rawContent = 'Declaration(Class(<http://ex.org/A>))';
      m.entitySegments = new Map([
        ['http://ex.org/A', segFor([0])],
        ['http://ex.org/B', segFor([1])],
        ['http://ex.org/C', segFor([2])],
      ]);
    });

    await deleteEntity('http://ex.org/A', model, index, vi.fn());

    expect(model.classes.has('http://ex.org/A')).toBe(false);
    expect(model.classes.has('http://ex.org/B')).toBe(false);
    expect(model.classes.has('http://ex.org/C')).toBe(false);
  });

  it('still removes a descendant that also has a superclass outside the deleted subtree', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClass('http://ex.org/A'));
      m.classes.set('http://ex.org/Other', makeClass('http://ex.org/Other'));
      m.classes.set('http://ex.org/B', makeClass('http://ex.org/B', {
        superClassIris: ['http://ex.org/A', 'http://ex.org/Other'],
      }));
    });

    await deleteEntity('http://ex.org/A', model, index, vi.fn());

    expect(model.classes.has('http://ex.org/B')).toBe(false);
    expect(model.classes.has('http://ex.org/Other')).toBe(true);
  });

  it('surfaces an external-reference warning when a closure member is a property domain/range', async () => {
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClass('http://ex.org/A'));
      m.objectProperties.set('http://ex.org/hasA', makeObjectProperty('http://ex.org/hasA', {
        domainIris: ['http://ex.org/A'],
      }));
    });

    await deleteEntity('http://ex.org/A', model, index, vi.fn());

    const confirmMessage = mockShowWarningMessage.mock.calls[0][0] as string;
    expect(confirmMessage).toContain('domain/range');
  });

  it('aborts with no changes when the user cancels the QuickPick', async () => {
    mockShowQuickPick.mockResolvedValue(undefined);
    const { model, index } = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClass('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClass('http://ex.org/B', { superClassIris: ['http://ex.org/A'] }));
    });

    await deleteEntity('http://ex.org/A', model, index, vi.fn());

    expect(model.classes.has('http://ex.org/A')).toBe(true);
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockWriteTextStreamed).not.toHaveBeenCalled();
  });
});
