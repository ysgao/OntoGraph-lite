import { describe, it, expect } from 'vitest';
import {
  isProtectedEntity,
  clearEntityAxiomBearingFields,
  reparentSubtype,
  ownSuperIris,
  findDeclarationAndHeaderLines,
  collapseDoubleBlankLines,
  OWL_THING,
  OWL_NOTHING,
} from '../EntityDeletionSync';
import { createEmptyModel } from '../../model/OntologyModel';
import type { OWLClass, OWLObjectProperty, OntologyModel, EntitySegment } from '../../model/OntologyModel';

function makeClass(iri: string, opts: Partial<OWLClass> = {}): OWLClass {
  return {
    iri, type: 'class', labels: { en: ['Label'] }, annotations: {},
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

describe('isProtectedEntity', () => {
  it('protects owl:Thing and owl:Nothing', () => {
    expect(isProtectedEntity(OWL_THING)).toBe(true);
    expect(isProtectedEntity(OWL_NOTHING)).toBe(true);
  });
  it('does not protect an ordinary class IRI', () => {
    expect(isProtectedEntity('http://ex.org/Animal')).toBe(false);
  });
});

describe('clearEntityAxiomBearingFields', () => {
  it('empties every axiom/annotation field on a class', () => {
    const cls = makeClass('http://ex.org/A', {
      superClassIris: ['http://ex.org/Parent'],
      equivalentClassIris: ['http://ex.org/Eq'],
      disjointClassIris: ['http://ex.org/Dis'],
      superClassExpressions: ['expr'],
      equivalentClassExpressions: ['expr2'],
      gciExpressions: ['expr3'],
    });
    clearEntityAxiomBearingFields(cls);
    expect(cls.superClassIris).toEqual([]);
    expect(cls.equivalentClassIris).toEqual([]);
    expect(cls.disjointClassIris).toEqual([]);
    expect(cls.superClassExpressions).toEqual([]);
    expect(cls.equivalentClassExpressions).toEqual([]);
    expect(cls.gciExpressions).toEqual([]);
    expect(cls.labels).toEqual({});
    expect(cls.annotations).toEqual({});
  });

  it('empties object property fields including booleans and chains', () => {
    const prop = makeObjectProperty('http://ex.org/p', {
      superPropertyIris: ['http://ex.org/sup'],
      isTransitive: true,
      inverseOfIri: 'http://ex.org/inv',
      equivalentPropertyIris: ['http://ex.org/eq'],
      propertyChains: [['http://ex.org/a', 'http://ex.org/b']],
    });
    clearEntityAxiomBearingFields(prop);
    expect(prop.superPropertyIris).toEqual([]);
    expect(prop.isTransitive).toBeUndefined();
    expect(prop.inverseOfIri).toBeUndefined();
    expect(prop.equivalentPropertyIris).toEqual([]);
    expect(prop.propertyChains).toEqual([]);
  });
});

describe('reparentSubtype', () => {
  it('replaces the target IRI with the target’s own super-IRIs, deduplicated', () => {
    const subtype = makeClass('http://ex.org/Sub', { superClassIris: ['http://ex.org/Target'] });
    const applied = reparentSubtype(subtype, 'http://ex.org/Target', ['http://ex.org/GrandParent']);
    expect(applied).toBe(true);
    expect(subtype.superClassIris).toEqual(['http://ex.org/GrandParent']);
  });

  it('deduplicates when the subtype already has one of the new super-IRIs directly', () => {
    const subtype = makeClass('http://ex.org/Sub', {
      superClassIris: ['http://ex.org/Target', 'http://ex.org/AlreadyThere'],
    });
    reparentSubtype(subtype, 'http://ex.org/Target', ['http://ex.org/AlreadyThere', 'http://ex.org/New']);
    expect(new Set(subtype.superClassIris)).toEqual(new Set(['http://ex.org/AlreadyThere', 'http://ex.org/New']));
  });

  it('falls back to root level (empty array) when the target had no super-IRIs', () => {
    const subtype = makeClass('http://ex.org/Sub', { superClassIris: ['http://ex.org/Target'] });
    reparentSubtype(subtype, 'http://ex.org/Target', []);
    expect(subtype.superClassIris).toEqual([]);
  });

  it('returns false and does not mutate when the target is not in the plain array (e.g. expression-only relationship)', () => {
    const subtype = makeClass('http://ex.org/Sub', {
      superClassIris: [],
      equivalentClassExpressions: ['http://ex.org/Target and http://ex.org/p some http://ex.org/Filler'],
    });
    const applied = reparentSubtype(subtype, 'http://ex.org/Target', ['http://ex.org/GrandParent']);
    expect(applied).toBe(false);
    expect(subtype.superClassIris).toEqual([]);
  });

  it('reparents an object property via superPropertyIris', () => {
    const subtype = makeObjectProperty('http://ex.org/Sub', { superPropertyIris: ['http://ex.org/Target'] });
    reparentSubtype(subtype, 'http://ex.org/Target', ['http://ex.org/GrandParent']);
    expect(subtype.superPropertyIris).toEqual(['http://ex.org/GrandParent']);
  });
});

describe('ownSuperIris', () => {
  it('returns superClassIris for a class', () => {
    expect(ownSuperIris(makeClass('http://ex.org/A', { superClassIris: ['http://ex.org/P'] })))
      .toEqual(['http://ex.org/P']);
  });
  it('returns superPropertyIris for a property', () => {
    expect(ownSuperIris(makeObjectProperty('http://ex.org/p', { superPropertyIris: ['http://ex.org/sup'] })))
      .toEqual(['http://ex.org/sup']);
  });
});

describe('findDeclarationAndHeaderLines', () => {
  function modelWithSegment(iri: string, lineIndices: number[]): OntologyModel {
    const model = createEmptyModel('file:///test.ofn');
    model.sourceFormat = 'functional';
    const seg: EntitySegment = {
      startLine: lineIndices[0], endLine: lineIndices[lineIndices.length - 1],
      startChar: 0, endChar: 0,
      lineIndices: new Int32Array(lineIndices),
      lineCharStarts: new Int32Array(lineIndices.map(() => 0)),
    };
    model.entitySegments = new Map([[iri, seg]]);
    return model;
  }

  it('finds the remaining Declaration line plus a matching header comment', () => {
    const iri = 'http://ex.org/A';
    const lines = [
      'Prefix(:=<http://ex.org/>)',
      'Ontology(',
      'Declaration(Class(<http://ex.org/A>))',
      '',
      '# Class: <http://ex.org/A> (A)',
      ')',
    ];
    const model = modelWithSegment(iri, [2]); // only the Declaration line remains
    const entity = makeClass(iri);
    const found = findDeclarationAndHeaderLines(model, iri, entity, lines);
    expect(new Set(found)).toEqual(new Set([2, 4]));
  });

  it('is best-effort when no header comment is present', () => {
    const iri = 'http://ex.org/A';
    const lines = ['Declaration(Class(<http://ex.org/A>))'];
    const model = modelWithSegment(iri, [0]);
    const entity = makeClass(iri);
    const found = findDeclarationAndHeaderLines(model, iri, entity, lines);
    expect(found).toEqual([0]);
  });
});

describe('collapseDoubleBlankLines', () => {
  it('collapses a run of 2+ blank lines to exactly 1', () => {
    const lines = ['a', '', '', '', 'b'];
    expect(collapseDoubleBlankLines(lines)).toEqual(['a', '', 'b']);
  });

  it('leaves single blank lines untouched', () => {
    const lines = ['a', '', 'b', '', 'c'];
    expect(collapseDoubleBlankLines(lines)).toEqual(['a', '', 'b', '', 'c']);
  });

  it('handles no blank lines at all', () => {
    expect(collapseDoubleBlankLines(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
