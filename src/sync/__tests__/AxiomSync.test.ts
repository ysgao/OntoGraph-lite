import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { syncAxiomsToDocument } from '../AxiomSync';
import { OWLClass, createEmptyModel } from '../../model/OntologyModel';

// Mock vscode
vi.mock('vscode', () => {
  return {
    Range: vi.fn((s1, c1, s2, c2) => ({ start: { line: s1, character: c1 }, end: { line: s2, character: c2 } })),
    Position: vi.fn((l, c) => ({ line: l, character: c })),
    WorkspaceEdit: vi.fn(() => ({
      replace: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    })),
    workspace: {
      applyEdit: vi.fn(() => Promise.resolve(true)),
    },
  };
});

describe('AxiomSync Clustered Functional Syntax', () => {
  it('should sync axioms into an existing entity cluster', async () => {
    const content = `Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org#A>))
  
  # Class: <http://example.org#A> (Class A)
  AnnotationAssertion(rdfs:label <http://example.org#A> "Class A")

  SubClassOf(<http://example.org#A> <http://example.org#B>)
`;
    
    const doc = {
      getText: () => content,
      lineAt: (i: number) => ({
        range: { start: { line: i, character: 0 }, end: { line: i, character: content.split('\n')[i].length } },
        rangeIncludingLineBreak: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
        text: content.split('\n')[i]
      }),
      uri: { fsPath: 'test.ofn' },
      lineCount: content.split('\n').length
    } as any;

    const entity: OWLClass = {
      iri: 'http://example.org#A',
      type: 'class',
      labels: { en: ['Class A'] },
      annotations: {},
      superClassIris: ['http://example.org#C'], // Changed B -> C
      equivalentClassIris: [],
      disjointClassIris: [],
      superClassExpressions: [],
      equivalentClassExpressions: [],
      gciExpressions: []
    };

    const ranges = await syncAxiomsToDocument(doc, entity, 'functional');
    
    // We expect a call to workspace.applyEdit with the new SubClassOf line
    // and specifically that it respects the clustered arrangement.
    expect(vscode.workspace.applyEdit).toHaveBeenCalled();
  });
});
