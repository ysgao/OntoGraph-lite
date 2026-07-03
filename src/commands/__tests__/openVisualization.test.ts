import { describe, it, expect, vi } from 'vitest';
import { createEmptyModel } from '../../model/OntologyModel';
import type { OWLClass } from '../../model/OntologyModel';
import { buildGraphData } from '../openVisualization';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    createWebviewPanel: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })),
  },
  ViewColumn: { Beside: 2 },
  Uri: { joinPath: vi.fn() },
}));

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

function makeClass(iri: string, superClassIris: string[] = [], children: string[] = []): OWLClass {
  return {
    iri,
    type: 'class',
    labels: { en: [iri.split('#').pop() ?? iri] },
    annotations: {},
    superClassIris,
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

const OPTS = { showInferred: false, showDisjoint: false };

describe('buildGraphData — direct supertype pre-pass', () => {
  it('T002: directSupertype nodes appear when focus has superclasses', () => {
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Child', ['http://ex.org#Parent']);
    const parent = makeClass('http://ex.org#Parent');
    model.classes.set(focus.iri, focus);
    model.classes.set(parent.iri, parent);

    const { nodes, edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    const parentNode = nodes.find(n => n.id === parent.iri);
    expect(parentNode, 'parent node must be present').toBeDefined();

    const superEdge = edges.find(e => e.type === 'directSupertype');
    expect(superEdge, 'directSupertype edge must be present').toBeDefined();
    expect(superEdge?.source).toBe(focus.iri);
    expect(superEdge?.target).toBe(parent.iri);
  });

  it('T003: directSupertype edge id prevents post-BFS duplicate subClassOf edge', () => {
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Child', ['http://ex.org#Parent']);
    const parent = makeClass('http://ex.org#Parent');
    model.classes.set(focus.iri, focus);
    model.classes.set(parent.iri, parent);

    const { edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    const edgesForPair = edges.filter(
      e => (e.source === focus.iri && e.target === parent.iri) ||
           (e.source === parent.iri && e.target === focus.iri),
    );
    expect(edgesForPair).toHaveLength(1);
    expect(edgesForPair[0].type).toBe('directSupertype');
  });

  it('T004: owl:Thing in superClassIris produces a stub node (not filtered)', () => {
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Root', [OWL_THING]);
    model.classes.set(focus.iri, focus);

    const { nodes, edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    const thingNode = nodes.find(n => n.id === OWL_THING);
    expect(thingNode, 'owl:Thing node must be present').toBeDefined();

    const superEdge = edges.find(e => e.type === 'directSupertype' && e.target === OWL_THING);
    expect(superEdge, 'directSupertype edge to owl:Thing must be present').toBeDefined();
  });

  it('T005: no supertype nodes when focus has empty superClassIris', () => {
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Root', []);
    model.classes.set(focus.iri, focus);

    const { edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    expect(edges.filter(e => e.type === 'directSupertype')).toHaveLength(0);
  });

  it('T006: supertype node shared when IRI also reached by subtype BFS', () => {
    // Parent is both a direct supertype of focus AND a direct subtype of grandparent.
    // When BFS descends from grandparent (if grandparent were also a child somehow),
    // the parent node must not be duplicated.
    // Simpler case: Parent is also added as a child of a sibling (diamond via assertedChildren).
    const model = createEmptyModel('test.ofn');
    const parent = makeClass('http://ex.org#Parent');
    const focus = makeClass('http://ex.org#Focus', [parent.iri]);
    // Also add a child of focus whose superClass is Parent (so BFS at depth=2 would reach Parent again)
    const child = makeClass('http://ex.org#Child', [focus.iri, parent.iri]);
    model.classes.set(parent.iri, parent);
    model.classes.set(focus.iri, focus);
    model.classes.set(child.iri, child);

    const { nodes } = buildGraphData(model, focus.iri, 2, OPTS, 'en');

    const parentNodes = nodes.filter(n => n.id === parent.iri);
    expect(parentNodes).toHaveLength(1);
  });

  it('T007: depth slider controls only subtypes — supertype nodes unchanged across depths', () => {
    const model = createEmptyModel('test.ofn');
    const grandparent = makeClass('http://ex.org#Grandparent');
    const parent = makeClass('http://ex.org#Parent', [grandparent.iri]);
    const focus = makeClass('http://ex.org#Focus', [parent.iri]);
    const child = makeClass('http://ex.org#Child', [focus.iri]);
    const grandchild = makeClass('http://ex.org#Grandchild', [child.iri]);
    for (const c of [grandparent, parent, focus, child, grandchild]) {
      model.classes.set(c.iri, c);
    }

    const { nodes: nodes1, edges: edges1 } = buildGraphData(model, focus.iri, 1, OPTS, 'en');
    const { nodes: nodes3, edges: edges3 } = buildGraphData(model, focus.iri, 3, OPTS, 'en');

    // At both depths, only the direct parent appears as a directSupertype node
    const supertypeEdges1 = edges1.filter(e => e.type === 'directSupertype');
    const supertypeEdges3 = edges3.filter(e => e.type === 'directSupertype');
    expect(supertypeEdges1).toHaveLength(1);
    expect(supertypeEdges3).toHaveLength(1);
    expect(supertypeEdges1[0].target).toBe(parent.iri);
    expect(supertypeEdges3[0].target).toBe(parent.iri);

    // Grandparent must NOT appear at any depth (no upward BFS traversal)
    expect(nodes1.find(n => n.id === grandparent.iri)).toBeUndefined();
    expect(nodes3.find(n => n.id === grandparent.iri)).toBeUndefined();

    // At depth=1: child appears; grandchild does not
    expect(nodes1.find(n => n.id === child.iri)).toBeDefined();
    expect(nodes1.find(n => n.id === grandchild.iri)).toBeUndefined();

    // At depth=3: both child and grandchild appear
    expect(nodes3.find(n => n.id === child.iri)).toBeDefined();
    expect(nodes3.find(n => n.id === grandchild.iri)).toBeDefined();
  });

  it('T008: no supertype pre-pass when focusIri is undefined (overview mode unchanged)', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A', ['http://ex.org#B']);
    const b = makeClass('http://ex.org#B');
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);

    const { edges } = buildGraphData(model, undefined, 1, OPTS, 'en');

    expect(edges.filter(e => e.type === 'directSupertype')).toHaveLength(0);
  });

  it('uses inferred hierarchy when model is classified (EquivalentClasses case)', () => {
    // Simulates an ontology where Child has no asserted superClassIris
    // but the reasoner inferred Parent as its direct superclass.
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Child', []); // no asserted superclass
    const parent = makeClass('http://ex.org#Parent');
    model.classes.set(focus.iri, focus);
    model.classes.set(parent.iri, parent);

    // Simulate post-classification state: parent → {child}
    model.isClassified = true;
    model.inferredSubClasses.set(parent.iri, new Set([focus.iri]));

    const { nodes, edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    const parentNode = nodes.find(n => n.id === parent.iri);
    expect(parentNode, 'parent node must appear via inferred hierarchy').toBeDefined();

    const superEdge = edges.find(e => e.type === 'directSupertype');
    expect(superEdge?.source).toBe(focus.iri);
    expect(superEdge?.target).toBe(parent.iri);
  });

  it('falls back to superClassIris when model is not classified', () => {
    const model = createEmptyModel('test.ofn');
    const focus = makeClass('http://ex.org#Child', ['http://ex.org#Parent']);
    const parent = makeClass('http://ex.org#Parent');
    model.classes.set(focus.iri, focus);
    model.classes.set(parent.iri, parent);
    // isClassified remains false

    const { edges } = buildGraphData(model, focus.iri, 1, OPTS, 'en');

    expect(edges.find(e => e.type === 'directSupertype' && e.target === parent.iri)).toBeDefined();
  });
});
