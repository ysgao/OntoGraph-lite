import { describe, it, expect, beforeEach } from 'vitest';
import { OntologyIndex, getDirectSubtypes, getTransitiveSubtypes } from './OntologyIndex';
import { createEmptyModel } from './OntologyModel';
import type { OWLClass, OWLObjectProperty, OWLDataProperty, OWLAnnotationProperty, OntologyModel } from './OntologyModel';

const SKOS_PREF = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_ALT  = 'http://www.w3.org/2004/02/skos/core#altLabel';

function makeClass(iri: string, opts: {
  labels?: Record<string, string[]>;
  prefLabels?: string[];
  altLabels?: string[];
} = {}): OWLClass {
  const annotations: Record<string, string[]> = {};
  if (opts.prefLabels?.length) { annotations[SKOS_PREF] = opts.prefLabels; }
  if (opts.altLabels?.length)  { annotations[SKOS_ALT]  = opts.altLabels;  }
  return {
    iri,
    type: 'class',
    labels: opts.labels ?? {},
    annotations,
    superClassIris: [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

function buildIndex(setup: (m: OntologyModel) => void): OntologyIndex {
  const model = createEmptyModel('file:///test.ofn');
  setup(model);
  return new OntologyIndex(model);
}

function buildModel(setup: (m: OntologyModel) => void): OntologyModel {
  const model = createEmptyModel('file:///test.ofn');
  setup(model);
  return model;
}

function makeClassWithHierarchy(iri: string, opts: {
  superClassIris?: string[];
  equivalentClassExpressions?: string[];
  superClassExpressions?: string[];
} = {}): OWLClass {
  return {
    iri,
    type: 'class',
    labels: {},
    annotations: {},
    superClassIris: opts.superClassIris ?? [],
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: opts.superClassExpressions ?? [],
    equivalentClassExpressions: opts.equivalentClassExpressions ?? [],
    gciExpressions: [],
  };
}

function makeObjectProperty(iri: string, superPropertyIris: string[] = []): OWLObjectProperty {
  return {
    iri, type: 'objectProperty', labels: {}, annotations: {},
    superPropertyIris, domainIris: [], rangeIris: [],
  };
}

function makeDataProperty(iri: string, superPropertyIris: string[] = []): OWLDataProperty {
  return {
    iri, type: 'dataProperty', labels: {}, annotations: {},
    superPropertyIris, domainIris: [], rangeIris: [],
  };
}

function makeAnnotationProperty(iri: string, superPropertyIris: string[] = []): OWLAnnotationProperty {
  return {
    iri, type: 'annotationProperty', labels: {}, annotations: {},
    superPropertyIris, domainIris: [], rangeIris: [],
  };
}

// ── US1: Cross-field token matching (T001, T002) ─────────────────────────────

describe('US1 — cross-field multi-word matching', () => {
  it('returns entity when tokens span rdfs:label and skos:prefLabel', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structure'],
      }));
    });
    const results = idx.searchByLabel('body structure');
    expect(results.map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('returns entity when query words are in reverse order (word-order independence)', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structure'],
      }));
    });
    const results = idx.searchByLabel('structure body');
    expect(results.map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('does NOT return entity when one token is absent from all labels', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structure'],
      }));
    });
    expect(idx.searchByLabel('xyz body').map(e => e.iri)).not.toContain('http://ex.org/X');
  });

  it('still returns entity when both tokens appear in a single rdfs:label (existing behaviour preserved)', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body structure'] },
      }));
    });
    expect(idx.searchByLabel('body structure').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('returns entity when three tokens each appear in different label fields', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['alpha'] },
        prefLabels: ['beta'],
        altLabels: ['gamma'],
      }));
    });
    expect(idx.searchByLabel('alpha beta gamma').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('cross-field match has lower score than same-entity single-label match', () => {
    const idx = buildIndex(m => {
      // single-label entity — all tokens in one label
      m.classes.set('http://ex.org/Single', makeClass('http://ex.org/Single', {
        labels: { en: ['body structure'] },
      }));
      // cross-field entity — tokens split across labels
      m.classes.set('http://ex.org/Cross', makeClass('http://ex.org/Cross', {
        labels: { en: ['body'] },
        prefLabels: ['structure'],
      }));
    });
    const results = idx.searchByLabel('body structure');
    const iris = results.map(e => e.iri);
    expect(iris).toContain('http://ex.org/Single');
    expect(iris).toContain('http://ex.org/Cross');
    expect(iris.indexOf('http://ex.org/Single')).toBeLessThan(iris.indexOf('http://ex.org/Cross'));
  });

  it('returns [] for empty query', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', { labels: { en: ['body'] } }));
    });
    expect(idx.searchByLabel('')).toEqual([]);
  });

  it('returns [] for whitespace-only query', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', { labels: { en: ['body'] } }));
    });
    expect(idx.searchByLabel('   ')).toEqual([]);
  });

  // T002 — maxResults bounding
  it('result count is bounded by maxResults', () => {
    const idx = buildIndex(m => {
      for (let i = 0; i < 20; i++) {
        m.classes.set(`http://ex.org/${i}`, makeClass(`http://ex.org/${i}`, {
          labels: { en: ['common'] },
          prefLabels: ['word'],
        }));
      }
    });
    const results = idx.searchByLabel('common word', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

// ── US4: Entity-name exact match (T004, T005) ─────────────────────────────────

describe('US4 — entity-name exact match', () => {
  it('returns entity when query exactly equals numeric local name', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://snomed.info/id/123037004',
        makeClass('http://snomed.info/id/123037004', { prefLabels: ['Body structure'] }));
    });
    const results = idx.searchByLabel('123037004');
    expect(results[0]?.iri).toBe('http://snomed.info/id/123037004');
  });

  it('does NOT return entity when query is a prefix of the local name', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://snomed.info/id/123037004',
        makeClass('http://snomed.info/id/123037004', {}));
    });
    expect(idx.searchByLabel('12303').map(e => e.iri)).not.toContain('http://snomed.info/id/123037004');
  });

  it('does NOT return entity when query is a superset of the local name', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://snomed.info/id/123037004',
        makeClass('http://snomed.info/id/123037004', {}));
    });
    expect(idx.searchByLabel('1230370040').map(e => e.iri)).not.toContain('http://snomed.info/id/123037004');
  });

  it('exact match returns only the right entity when two have similar local names', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/1230', makeClass('http://ex.org/1230', {}));
      m.classes.set('http://ex.org/123037004', makeClass('http://ex.org/123037004', {}));
    });
    const res1230 = idx.searchByLabel('1230').map(e => e.iri);
    expect(res1230).toContain('http://ex.org/1230');
    expect(res1230).not.toContain('http://ex.org/123037004');
    const res123037004 = idx.searchByLabel('123037004').map(e => e.iri);
    expect(res123037004).toContain('http://ex.org/123037004');
    expect(res123037004).not.toContain('http://ex.org/1230');
  });

  it('entity-name exact match ranks above full-label exact match (score 200 > 100)', () => {
    const idx = buildIndex(m => {
      // Entity whose local name IS "123037004" (exact name match → score 200)
      m.classes.set('http://snomed.info/id/123037004',
        makeClass('http://snomed.info/id/123037004', {}));
      // Entity whose rdfs:label IS "123037004" (label exact match → score 100)
      m.classes.set('http://ex.org/other',
        makeClass('http://ex.org/other', { labels: { en: ['123037004'] } }));
    });
    const results = idx.searchByLabel('123037004');
    expect(results[0]?.iri).toBe('http://snomed.info/id/123037004');
    expect(results[1]?.iri).toBe('http://ex.org/other');
  });

  it('entity-name match is case-insensitive', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', {}));
    });
    expect(idx.searchByLabel('bodystructure').map(e => e.iri))
      .toContain('http://ex.org/BodyStructure');
    expect(idx.searchByLabel('BODYSTRUCTURE').map(e => e.iri))
      .toContain('http://ex.org/BodyStructure');
  });

  it('entity with empty local name (IRI ends with #) does not match any query', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org#', makeClass('http://ex.org#', {}));
    });
    expect(idx.searchByLabel('').map(e => e.iri)).not.toContain('http://ex.org#');
    expect(idx.searchByLabel('http').map(e => e.iri)).not.toContain('http://ex.org#');
  });

  // T005 — local name NOT in substring label search
  it('does NOT return entity via substring when IRI local name matches but entity has no labels', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', {}));
    });
    // "body" is a substring of "bodystructure" — must NOT match via label search
    expect(idx.searchByLabel('body').map(e => e.iri)).not.toContain('http://ex.org/BodyStructure');
  });

  it('does NOT return SNOMED entity via substring when only partial numeric ID searched', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://snomed.info/id/123037004',
        makeClass('http://snomed.info/id/123037004', {}));
    });
    expect(idx.searchByLabel('1230').map(e => e.iri)).not.toContain('http://snomed.info/id/123037004');
  });

  it('entity with label finds via label but NOT via local-name substring', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', { labels: { en: ['Anatomical site'] } }));
    });
    // label match
    expect(idx.searchByLabel('anatomical').map(e => e.iri)).toContain('http://ex.org/BodyStructure');
    // local name substring — must NOT match
    expect(idx.searchByLabel('body').map(e => e.iri)).not.toContain('http://ex.org/BodyStructure');
  });
});

// ── US2: Partial/substring tokens across fields (T008) ───────────────────────

describe('US2 — partial/substring tokens across fields', () => {
  it('partial token matches via substring in cross-field query', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structures'],
      }));
    });
    expect(idx.searchByLabel('bod struct').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('mid-word substrings match across fields', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structures'],
      }));
    });
    expect(idx.searchByLabel('ody ruct').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('single full token matching in one label still works', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        prefLabels: ['structures'],
      }));
    });
    expect(idx.searchByLabel('structures').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('full tokens across fields match', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structures'],
      }));
    });
    expect(idx.searchByLabel('body structures').map(e => e.iri)).toContain('http://ex.org/X');
  });

  it('absent token yields no result', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/X', makeClass('http://ex.org/X', {
        labels: { en: ['body'] },
        prefLabels: ['structure'],
      }));
    });
    expect(idx.searchByLabel('xyz').map(e => e.iri)).not.toContain('http://ex.org/X');
  });
});

// ── US3: Revised local-name edge cases (T010) ────────────────────────────────

describe('US3 — revised local-name behaviour', () => {
  it('exact local name (case-insensitive) finds entity', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', {}));
    });
    expect(idx.searchByLabel('BodyStructure').map(e => e.iri)).toContain('http://ex.org/BodyStructure');
    expect(idx.searchByLabel('bodystructure').map(e => e.iri)).toContain('http://ex.org/BodyStructure');
  });

  it('partial local name does NOT find entity', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', {}));
    });
    expect(idx.searchByLabel('Body').map(e => e.iri)).not.toContain('http://ex.org/BodyStructure');
  });

  it('entity found via label but NOT via local-name substring', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/BodyStructure',
        makeClass('http://ex.org/BodyStructure', { labels: { en: ['Anatomical site'] } }));
    });
    expect(idx.searchByLabel('anatomical site').map(e => e.iri))
      .toContain('http://ex.org/BodyStructure');
    expect(idx.searchByLabel('body').map(e => e.iri))
      .not.toContain('http://ex.org/BodyStructure');
  });

  it('entity with IRI ending / has no local name and does not match any query', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ex.org/', makeClass('http://ex.org/', {}));
    });
    expect(idx.searchByLabel('ex.org').map(e => e.iri)).not.toContain('http://ex.org/');
  });

  it('two entities with different namespaces but same local name — exact query returns at least one', () => {
    const idx = buildIndex(m => {
      m.classes.set('http://ns1.org/123', makeClass('http://ns1.org/123', {}));
      m.classes.set('http://ns2.org/123', makeClass('http://ns2.org/123', {}));
    });
    const results = idx.searchByLabel('123').map(e => e.iri);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // At least one of them is present
    const hasOne = results.includes('http://ns1.org/123') || results.includes('http://ns2.org/123');
    expect(hasOne).toBe(true);
  });
});

// ── 029-delete-entity-subtypes: getDirectSubtypes / getTransitiveSubtypes ────

describe('getDirectSubtypes — classes', () => {
  it('finds a subclass via plain SubClassOf', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClassWithHierarchy('http://ex.org/B', { superClassIris: ['http://ex.org/A'] }));
    });
    expect(getDirectSubtypes('http://ex.org/A', model)).toEqual(['http://ex.org/B']);
  });

  it('finds a subclass via a named conjunct in an EquivalentClasses expression', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClassWithHierarchy('http://ex.org/B', {
        equivalentClassExpressions: ['http://ex.org/A and http://ex.org/hasQuality some http://ex.org/Red'],
      }));
    });
    expect(getDirectSubtypes('http://ex.org/A', model)).toEqual(['http://ex.org/B']);
  });

  it('finds a subclass via a named conjunct in a complex SubClassOf superclass expression', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClassWithHierarchy('http://ex.org/B', {
        superClassExpressions: ['http://ex.org/A and http://ex.org/hasQuality some http://ex.org/Red'],
      }));
    });
    expect(getDirectSubtypes('http://ex.org/A', model)).toEqual(['http://ex.org/B']);
  });

  it('returns every direct subclass under multiple inheritance, from both parents', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/C', makeClassWithHierarchy('http://ex.org/C', {
        superClassIris: ['http://ex.org/A', 'http://ex.org/B'],
      }));
    });
    expect(getDirectSubtypes('http://ex.org/A', model)).toEqual(['http://ex.org/C']);
  });

  it('returns [] for a leaf class with no subtypes', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/Leaf', makeClassWithHierarchy('http://ex.org/Leaf'));
    });
    expect(getDirectSubtypes('http://ex.org/Leaf', model)).toEqual([]);
  });

  it('returns [] for an IRI not present in the model', () => {
    const model = buildModel(() => {});
    expect(getDirectSubtypes('http://ex.org/Missing', model)).toEqual([]);
  });
});

describe('getDirectSubtypes — properties', () => {
  it('finds a sub-object-property via superPropertyIris', () => {
    const model = buildModel(m => {
      m.objectProperties.set('http://ex.org/partOf', makeObjectProperty('http://ex.org/partOf'));
      m.objectProperties.set('http://ex.org/properPartOf', makeObjectProperty('http://ex.org/properPartOf', ['http://ex.org/partOf']));
    });
    expect(getDirectSubtypes('http://ex.org/partOf', model)).toEqual(['http://ex.org/properPartOf']);
  });

  it('finds a sub-data-property via superPropertyIris', () => {
    const model = buildModel(m => {
      m.dataProperties.set('http://ex.org/hasValue', makeDataProperty('http://ex.org/hasValue'));
      m.dataProperties.set('http://ex.org/hasWeight', makeDataProperty('http://ex.org/hasWeight', ['http://ex.org/hasValue']));
    });
    expect(getDirectSubtypes('http://ex.org/hasValue', model)).toEqual(['http://ex.org/hasWeight']);
  });

  it('finds a sub-annotation-property via superPropertyIris', () => {
    const model = buildModel(m => {
      m.annotationProperties.set('http://ex.org/note', makeAnnotationProperty('http://ex.org/note'));
      m.annotationProperties.set('http://ex.org/editorialNote', makeAnnotationProperty('http://ex.org/editorialNote', ['http://ex.org/note']));
    });
    expect(getDirectSubtypes('http://ex.org/note', model)).toEqual(['http://ex.org/editorialNote']);
  });

  it('returns [] for an individual (no subtype concept)', () => {
    const model = buildModel(m => {
      m.individuals.set('http://ex.org/Fido', {
        iri: 'http://ex.org/Fido', type: 'individual', labels: {}, annotations: {},
        classIris: [], objectPropertyAssertions: [], dataPropertyAssertions: [],
      });
    });
    expect(getDirectSubtypes('http://ex.org/Fido', model)).toEqual([]);
  });
});

describe('getTransitiveSubtypes', () => {
  it('returns the full multi-level descendant closure', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/B', makeClassWithHierarchy('http://ex.org/B', { superClassIris: ['http://ex.org/A'] }));
      m.classes.set('http://ex.org/C', makeClassWithHierarchy('http://ex.org/C', { superClassIris: ['http://ex.org/B'] }));
      m.classes.set('http://ex.org/D', makeClassWithHierarchy('http://ex.org/D', { superClassIris: ['http://ex.org/B'] }));
    });
    const closure = getTransitiveSubtypes('http://ex.org/A', model);
    expect(new Set(closure)).toEqual(new Set(['http://ex.org/B', 'http://ex.org/C', 'http://ex.org/D']));
  });

  it('does not revisit a descendant reachable through multiple paths', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/A', makeClassWithHierarchy('http://ex.org/A'));
      m.classes.set('http://ex.org/B1', makeClassWithHierarchy('http://ex.org/B1', { superClassIris: ['http://ex.org/A'] }));
      m.classes.set('http://ex.org/B2', makeClassWithHierarchy('http://ex.org/B2', { superClassIris: ['http://ex.org/A'] }));
      m.classes.set('http://ex.org/C', makeClassWithHierarchy('http://ex.org/C', {
        superClassIris: ['http://ex.org/B1', 'http://ex.org/B2'],
      }));
    });
    const closure = getTransitiveSubtypes('http://ex.org/A', model);
    expect(closure.filter(iri => iri === 'http://ex.org/C').length).toBe(1);
  });

  it('returns [] for a leaf', () => {
    const model = buildModel(m => {
      m.classes.set('http://ex.org/Leaf', makeClassWithHierarchy('http://ex.org/Leaf'));
    });
    expect(getTransitiveSubtypes('http://ex.org/Leaf', model)).toEqual([]);
  });
});
