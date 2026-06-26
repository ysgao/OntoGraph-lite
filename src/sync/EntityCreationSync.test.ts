import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  window: {
    showWarningMessage: vi.fn(),
  },
}));

import { insertNewEntity } from './EntityCreationSync.js';
import type { OWLClass, OWLObjectProperty, OWLDataProperty, OWLAnnotationProperty, OWLIndividual, OntologyModel } from '../model/OntologyModel.js';

function makeModel(format = 'functional'): OntologyModel {
  return {
    metadata: { iri: 'http://example.org/ont#', imports: [], annotations: {} },
    classes: new Map(),
    objectProperties: new Map(),
    dataProperties: new Map(),
    annotationProperties: new Map(),
    individuals: new Map(),
    sourceUri: 'file:///test.ofn',
    rawContent: '',
    sourceFormat: format,
    standaloneGcis: [],
    inferredSubClasses: new Map(),
    isClassified: false,
    classificationNeedsUpdate: false,
  } as OntologyModel;
}

const SIMPLE_OFN = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org/ont#Animal>))
  SubClassOf(<http://example.org/ont#Animal> <http://www.w3.org/2002/07/owl#Thing>)
)`;

const EMPTY_OFN = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
)`;

// OFN with existing class clusters but no GCIs — typical SNOMED subset
const OFN_WITH_CLUSTERS = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org/ont#Animal>))
  Declaration(Class(<http://example.org/ont#Dog>))

  # Class: <http://example.org/ont#Animal> (Animal)
  SubClassOf(<http://example.org/ont#Animal> <http://www.w3.org/2002/07/owl#Thing>)

  # Class: <http://example.org/ont#Dog> (Dog)
  SubClassOf(<http://example.org/ont#Dog> <http://example.org/ont#Animal>)
)`;

// OFN with a GCI axiom at the end of the class section
const OFN_WITH_GCIS = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org/ont#Animal>))
  Declaration(Class(<http://example.org/ont#Dog>))

  # Class: <http://example.org/ont#Animal> (Animal)

  # Class: <http://example.org/ont#Dog> (Dog)
  SubClassOf(<http://example.org/ont#Dog> <http://example.org/ont#Animal>)

  SubClassOf(ObjectIntersectionOf(<http://example.org/ont#Animal> <http://example.org/ont#Dog>) <http://example.org/ont#Dog>)
)`;

// OFN with GCI axioms in CURIE notation (anatomy.owl / SNOMED-style files).
// The RHS is a CURIE (':Dog') not a full IRI ('<http://...>') — the old GCI_RE
// required '<[^>]+>' at the end so it missed these entirely, causing the new
// entity cluster to be inserted INSIDE the GCI section instead of before it.
const OFN_WITH_CURIE_GCIS = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
  Declaration(Class(:Animal))
  Declaration(Class(:Dog))

  # Class: <http://example.org/ont#Animal> (Animal)

  # Class: <http://example.org/ont#Dog> (Dog)
  SubClassOf(:Dog :Animal)

  SubClassOf(ObjectIntersectionOf(:Animal :Dog) :Dog)
)`;

// anatomy.owl / SNOMED style: declarations grouped by kind at column 0
// (Class → ObjectProperty → AnnotationProperty), clusters, then a GCI section.
const OFN_ANATOMY_STYLE = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
Declaration(Class(<http://example.org/ont#Animal>))
Declaration(Class(<http://example.org/ont#Dog>))
Declaration(ObjectProperty(<http://example.org/ont#hasPart>))
Declaration(AnnotationProperty(<http://www.w3.org/2004/02/skos/core#prefLabel>))

# Class: <http://example.org/ont#Animal> (Animal)

AnnotationAssertion(rdfs:label <http://example.org/ont#Animal> "Animal"@en)

# Class: <http://example.org/ont#Dog> (Dog)

AnnotationAssertion(rdfs:label <http://example.org/ont#Dog> "Dog"@en)
SubClassOf(<http://example.org/ont#Dog> <http://example.org/ont#Animal>)

SubClassOf(ObjectIntersectionOf(<http://example.org/ont#Animal> <http://example.org/ont#Dog>) <http://example.org/ont#Dog>)
)`;

function makeClass(iri: string, superClassIris: string[] = [], labels: Record<string, string[]> = {}): OWLClass {
  return {
    iri,
    type: 'class',
    labels,
    annotations: {},
    superClassIris,
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

function makeObjectProperty(iri: string, superPropertyIris: string[] = []): OWLObjectProperty {
  return {
    iri,
    type: 'objectProperty',
    labels: {},
    annotations: {},
    superPropertyIris,
    domainIris: [],
    rangeIris: [],
  };
}

function makeDataProperty(iri: string, superPropertyIris: string[] = []): OWLDataProperty {
  return {
    iri,
    type: 'dataProperty',
    labels: {},
    annotations: {},
    superPropertyIris,
    domainIris: [],
    rangeIris: [],
  };
}

function makeAnnotationProperty(iri: string, superPropertyIris: string[] = []): OWLAnnotationProperty {
  return {
    iri,
    type: 'annotationProperty',
    labels: {},
    annotations: {},
    superPropertyIris,
    domainIris: [],
    rangeIris: [],
  };
}

function makeIndividual(iri: string): OWLIndividual {
  return {
    iri,
    type: 'individual',
    labels: {},
    annotations: {},
    classIris: [],
    objectPropertyAssertions: [],
    dataPropertyAssertions: [],
  };
}

const NEW_CLASS_IRI = 'http://example.org/ont#HeartDisease';
const PARENT_IRI = 'http://example.org/ont#Animal';
const NEW_PROP_IRI = 'http://example.org/ont#hasPart';
const PARENT_PROP_IRI = 'http://example.org/ont#hasRelation';

// ────────────────────────────────────────────────────────────
// Class insertion
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — OWLClass', () => {
  it('inserts a Declaration for the new class after the last Declaration', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).toContain(`Declaration(Class(<${NEW_CLASS_IRI}>))`);
  });

  it('inserts a SubClassOf axiom when superClassIris is populated', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).toContain(`SubClassOf(<${NEW_CLASS_IRI}> <${PARENT_IRI}>)`);
  });

  it('does NOT insert a SubClassOf axiom when superClassIris is empty', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).not.toContain('SubClassOf(<http://example.org/ont#HeartDisease>');
  });

  it('handles empty Ontology body (no existing Declarations)', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(EMPTY_OFN, cls, makeModel());
    expect(result).toContain(`Declaration(Class(<${NEW_CLASS_IRI}>))`);
  });

  it('preserves all original content when inserting', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).toContain('Declaration(Class(<http://example.org/ont#Animal>))');
  });

  it('inserts Declaration before the closing ) of the Ontology', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(EMPTY_OFN, cls, makeModel());
    const declIdx = result.indexOf(`Declaration(Class(<${NEW_CLASS_IRI}>))`);
    const closeIdx = result.lastIndexOf(')');
    expect(declIdx).toBeGreaterThan(0);
    expect(declIdx).toBeLessThan(closeIdx);
  });

  it('inserts new cluster AFTER the last existing class cluster (no GCIs)', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(OFN_WITH_CLUSTERS, cls, makeModel());
    const dogClusterIdx = result.indexOf('# Class: <http://example.org/ont#Dog>');
    const newClusterIdx = result.indexOf(`# Class: <${NEW_CLASS_IRI}>`);
    expect(dogClusterIdx).toBeGreaterThan(0);
    expect(newClusterIdx).toBeGreaterThan(dogClusterIdx);
  });

  it('cluster annotation is NOT placed right after the Declaration (has existing clusters)', () => {
    const cls = makeClass(NEW_CLASS_IRI, [], { en: ['Heart Disease'] });
    const result = insertNewEntity(OFN_WITH_CLUSTERS, cls, makeModel());
    const declLine = `Declaration(Class(<${NEW_CLASS_IRI}>))`;
    const annotLine = `AnnotationAssertion(rdfs:label <${NEW_CLASS_IRI}>`;
    const declIdx = result.indexOf(declLine);
    const annotIdx = result.indexOf(annotLine);
    // Annotation must appear after the last existing cluster (Dog), not right after the new Declaration
    const dogSubClassIdx = result.lastIndexOf('SubClassOf(<http://example.org/ont#Dog>');
    expect(annotIdx).toBeGreaterThan(dogSubClassIdx);
    expect(declIdx).toBeLessThan(dogSubClassIdx);
  });

  it('inserts cluster BEFORE the first GCI axiom when GCIs are at the end', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(OFN_WITH_GCIS, cls, makeModel());
    const clusterIdx = result.indexOf(`# Class: <${NEW_CLASS_IRI}>`);
    const gciIdx = result.indexOf('SubClassOf(ObjectIntersectionOf(');
    expect(clusterIdx).toBeGreaterThan(0);
    expect(clusterIdx).toBeLessThan(gciIdx);
  });

  it('inserts cluster BEFORE GCI axioms in CURIE notation (anatomy.owl / SNOMED style)', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(OFN_WITH_CURIE_GCIS, cls, makeModel());
    const clusterIdx = result.indexOf(`# Class: <${NEW_CLASS_IRI}>`);
    const gciIdx = result.indexOf('SubClassOf(ObjectIntersectionOf(');
    expect(clusterIdx).toBeGreaterThan(0);
    expect(clusterIdx).toBeLessThan(gciIdx);
  });

  it('does NOT treat SubClassOf with complex RHS as a GCI stop point', () => {
    // SubClassOf(<IRI> ObjectSomeValuesFrom(...)) — complex RHS, named LHS — not a GCI
    // The cluster must still go at the end, after the Dog cluster, not before this axiom
    const OFN_COMPLEX_RHS = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
  Declaration(Class(<http://example.org/ont#Animal>))
  Declaration(Class(<http://example.org/ont#Dog>))

  # Class: <http://example.org/ont#Animal> (Animal)
  SubClassOf(<http://example.org/ont#Animal> <http://www.w3.org/2002/07/owl#Thing>)

  # Class: <http://example.org/ont#Dog> (Dog)
  SubClassOf(<http://example.org/ont#Dog> ObjectSomeValuesFrom(<http://example.org/ont#hasPart> <http://example.org/ont#Animal>))
)`;
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(OFN_COMPLEX_RHS, cls, makeModel());
    const dogClusterIdx = result.indexOf('# Class: <http://example.org/ont#Dog>');
    const newClusterIdx = result.indexOf(`# Class: <${NEW_CLASS_IRI}>`);
    expect(newClusterIdx).toBeGreaterThan(dogClusterIdx);
  });

  it('emits AnnotationAssertion(rdfs:label ...) when entity has labels', () => {
    const cls = makeClass(NEW_CLASS_IRI, [], { en: ['Heart Disease'] });
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).toContain(
      `AnnotationAssertion(rdfs:label <${NEW_CLASS_IRI}> "Heart Disease"@en)`,
    );
  });

  it('emits AnnotationAssertion in the cluster header comment with the label', () => {
    const cls = makeClass(NEW_CLASS_IRI, [], { en: ['Heart Disease'] });
    const result = insertNewEntity(SIMPLE_OFN, cls, makeModel());
    expect(result).toContain(`# Class: <${NEW_CLASS_IRI}> (Heart Disease)`);
  });

  it('groups a new Class declaration with the Class declarations, before the ObjectProperty block', () => {
    const cls = makeClass(NEW_CLASS_IRI, []);
    const result = insertNewEntity(OFN_ANATOMY_STYLE, cls, makeModel());
    const lines = result.split('\n');
    const newDeclIdx = lines.findIndex(l => l.includes(`Declaration(Class(<${NEW_CLASS_IRI}>))`));
    const firstObjPropIdx = lines.findIndex(l => /Declaration\(ObjectProperty\(/.test(l));
    expect(newDeclIdx).toBeGreaterThan(0);
    expect(firstObjPropIdx).toBeGreaterThan(0);
    expect(newDeclIdx).toBeLessThan(firstObjPropIdx);
    // Indentation matches the file's column-0 declaration style (no hard-coded 2 spaces).
    expect(lines[newDeclIdx]).toBe(`Declaration(Class(<${NEW_CLASS_IRI}>))`);
  });

  it('separates the new cluster from the GCI section with a single blank line', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI], { en: ['Heart Disease'] });
    const result = insertNewEntity(OFN_ANATOMY_STYLE, cls, makeModel());
    const lines = result.split('\n');
    const gciIdx = lines.findIndex(l => l.includes('SubClassOf(ObjectIntersectionOf('));
    const newSubClassIdx = lines.findIndex(l => l.includes(`SubClassOf(<${NEW_CLASS_IRI}>`));
    expect(gciIdx).toBeGreaterThan(0);
    expect(newSubClassIdx).toBeGreaterThan(0);
    expect(newSubClassIdx).toBeLessThan(gciIdx);
    // Exactly one blank line between the new cluster and the GCI section (no GCI fusion).
    expect(lines[gciIdx - 1].trim()).toBe('');
    expect(lines[gciIdx - 2].trim()).not.toBe('');
  });

  it('adopts the file column-0 cluster format (no imposed 2-space indent)', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI], { en: ['Heart Disease'] });
    const result = insertNewEntity(OFN_ANATOMY_STYLE, cls, makeModel());
    const lines = result.split('\n');
    const headerLine = lines.find(l => l.includes(`# Class: <${NEW_CLASS_IRI}>`));
    const annotLine = lines.find(l => l.includes(`AnnotationAssertion(rdfs:label <${NEW_CLASS_IRI}>`));
    const subClassLine = lines.find(l => l.includes(`SubClassOf(<${NEW_CLASS_IRI}>`));
    // The fixture's existing clusters are at column 0 — the new one must match.
    expect(headerLine?.startsWith('#')).toBe(true);
    expect(annotLine?.startsWith('AnnotationAssertion(')).toBe(true);
    expect(subClassLine?.startsWith('SubClassOf(')).toBe(true);
  });

  it('reports inserted line ranges via the outRanges out-parameter', () => {
    const cls = makeClass(NEW_CLASS_IRI, [PARENT_IRI], { en: ['Heart Disease'] });
    const ranges: Array<{ start: { line: number }; end: { line: number } }> = [];
    insertNewEntity(OFN_ANATOMY_STYLE, cls, makeModel(), ranges as never);
    // One range for the declaration, one spanning the cluster block.
    expect(ranges.length).toBe(2);
    expect(ranges[0].start.line).toBeGreaterThanOrEqual(0);
    expect(ranges[1].end.line).toBeGreaterThanOrEqual(ranges[1].start.line);
  });
});

// ────────────────────────────────────────────────────────────
// ObjectProperty insertion
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — OWLObjectProperty', () => {
  it('inserts a Declaration for the new object property', () => {
    const prop = makeObjectProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`Declaration(ObjectProperty(<${NEW_PROP_IRI}>))`);
  });

  it('inserts SubObjectPropertyOf when superPropertyIris is populated', () => {
    const prop = makeObjectProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`SubObjectPropertyOf(<${NEW_PROP_IRI}> <${PARENT_PROP_IRI}>)`);
  });

  it('does NOT insert SubObjectPropertyOf when superPropertyIris is empty', () => {
    const prop = makeObjectProperty(NEW_PROP_IRI, []);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).not.toContain(`SubObjectPropertyOf(<${NEW_PROP_IRI}>`);
  });
});

// ────────────────────────────────────────────────────────────
// DataProperty insertion
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — OWLDataProperty', () => {
  it('inserts a Declaration for the new data property', () => {
    const prop = makeDataProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`Declaration(DataProperty(<${NEW_PROP_IRI}>))`);
  });

  it('inserts SubDataPropertyOf when superPropertyIris is populated', () => {
    const prop = makeDataProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`SubDataPropertyOf(<${NEW_PROP_IRI}> <${PARENT_PROP_IRI}>)`);
  });
});

// ────────────────────────────────────────────────────────────
// AnnotationProperty insertion
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — OWLAnnotationProperty', () => {
  it('inserts a Declaration for the new annotation property', () => {
    const prop = makeAnnotationProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`Declaration(AnnotationProperty(<${NEW_PROP_IRI}>))`);
  });

  it('inserts SubAnnotationPropertyOf when superPropertyIris is populated', () => {
    const prop = makeAnnotationProperty(NEW_PROP_IRI, [PARENT_PROP_IRI]);
    const result = insertNewEntity(SIMPLE_OFN, prop, makeModel());
    expect(result).toContain(`SubAnnotationPropertyOf(<${NEW_PROP_IRI}> <${PARENT_PROP_IRI}>)`);
  });
});

// ────────────────────────────────────────────────────────────
// Individual insertion (no parent axiom)
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — OWLIndividual', () => {
  it('inserts a Declaration for the new individual', () => {
    const ind = makeIndividual(NEW_CLASS_IRI);
    const result = insertNewEntity(SIMPLE_OFN, ind, makeModel());
    expect(result).toContain(`Declaration(NamedIndividual(<${NEW_CLASS_IRI}>))`);
  });

  it('does NOT insert any SubXxxOf axiom for individuals', () => {
    const ind = makeIndividual(NEW_CLASS_IRI);
    const result = insertNewEntity(SIMPLE_OFN, ind, makeModel());
    expect(result).not.toContain('SubClassOf(<http://example.org/ont#HeartDisease>');
    expect(result).not.toContain('SubObjectPropertyOf');
    expect(result).not.toContain('SubDataPropertyOf');
    expect(result).not.toContain('SubAnnotationPropertyOf');
  });
});

// ────────────────────────────────────────────────────────────
// Non-.ofn format: return unchanged, fire warning
// ────────────────────────────────────────────────────────────

describe('insertNewEntity — non-functional format', () => {
  it('returns document text unchanged for non-functional format', async () => {
    const { window } = await import('vscode');
    const cls = makeClass(NEW_CLASS_IRI, []);
    const turtle = '@prefix : <http://example.org/ont#> .';
    const result = insertNewEntity(turtle, cls, makeModel('turtle'));
    expect(result).toBe(turtle);
  });

  it('shows a warning message for non-functional format', async () => {
    const { window } = await import('vscode');
    const warnSpy = vi.spyOn(window, 'showWarningMessage');
    const cls = makeClass(NEW_CLASS_IRI, []);
    insertNewEntity('@prefix : <http://example.org/ont#> .', cls, makeModel('turtle'));
    expect(warnSpy).toHaveBeenCalledWith(
      'Entity creation is only supported for OWL Functional Syntax in this release.',
    );
  });
});
