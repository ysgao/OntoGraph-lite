import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmptyModel } from '../model/OntologyModel.js';
import type { ReasonerBridge, ClassificationResult } from '../reasoner/ReasonerBridge.js';
import type { InferredHierarchyProvider } from '../views/InferredHierarchyProvider.js';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    withProgress: vi.fn((_opts: unknown, task: () => Promise<void>) => task()),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })),
    textDocuments: [],
  },
  commands: { executeCommand: vi.fn() },
  Uri: { parse: vi.fn((s: string) => ({ scheme: 'file', fsPath: s, toString: () => s })) },
  ProgressLocation: { Notification: 1 },
}));

import { classifyOntology } from './classifyOntology.js';

function makeResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    consistent: true,
    incoherentClasses: [],
    hierarchy: [],
    equivalentClasses: [],
    ...overrides,
  };
}

function makeBridge(result: ClassificationResult): ReasonerBridge {
  return {
    classifyFile: vi.fn().mockResolvedValue(result),
    classify: vi.fn().mockResolvedValue(result),
  } as unknown as ReasonerBridge;
}

function makeInferredProvider(): InferredHierarchyProvider {
  return { setModel: vi.fn() } as unknown as InferredHierarchyProvider;
}

describe('classifyOntology — inferredEquivalentClasses', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('groups equivalentClasses entries by classIri, splitting named vs. complex targets', async () => {
    const model = createEmptyModel('file:///test.ofn');
    const result = makeResult({
      equivalentClasses: [
        { classIri: 'http://example.org/A', equivalentClassIri: 'http://example.org/B' },
        { classIri: 'http://example.org/C', equivalentClassExpression: 'ObjectIntersectionOf(<http://example.org/D> <http://example.org/E>)' },
      ],
    });
    const bridge = makeBridge(result);

    await classifyOntology(model, bridge, makeInferredProvider());

    expect(model.inferredEquivalentClasses.get('http://example.org/A')).toEqual({
      iris: ['http://example.org/B'],
      expressions: [],
    });
    expect(model.inferredEquivalentClasses.get('http://example.org/C')).toEqual({
      iris: [],
      expressions: ['ObjectIntersectionOf(<http://example.org/D> <http://example.org/E>)'],
    });
  });

  it('handles multiple entries for the same class, mixing named and complex targets', async () => {
    const model = createEmptyModel('file:///test.ofn');
    const result = makeResult({
      equivalentClasses: [
        { classIri: 'http://example.org/C', equivalentClassIri: 'http://example.org/F' },
        { classIri: 'http://example.org/C', equivalentClassIri: 'http://example.org/G' },
        { classIri: 'http://example.org/C', equivalentClassExpression: 'ObjectIntersectionOf(<http://example.org/D> <http://example.org/E>)' },
      ],
    });
    const bridge = makeBridge(result);

    await classifyOntology(model, bridge, makeInferredProvider());

    expect(model.inferredEquivalentClasses.get('http://example.org/C')).toEqual({
      iris: ['http://example.org/F', 'http://example.org/G'],
      expressions: ['ObjectIntersectionOf(<http://example.org/D> <http://example.org/E>)'],
    });
  });

  it('clears previous inferredEquivalentClasses before repopulating on reclassification', async () => {
    const model = createEmptyModel('file:///test.ofn');
    model.inferredEquivalentClasses.set('http://example.org/Stale', { iris: ['http://example.org/Old'], expressions: [] });
    const bridge = makeBridge(makeResult({ equivalentClasses: [] }));

    await classifyOntology(model, bridge, makeInferredProvider());

    expect(model.inferredEquivalentClasses.has('http://example.org/Stale')).toBe(false);
    expect(model.inferredEquivalentClasses.size).toBe(0);
  });
});
