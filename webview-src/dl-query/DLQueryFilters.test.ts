import { describe, it, expect } from 'vitest';
import { filterGroups } from './DLQueryFilters.js';
import type { ResultGroup } from '../../src/views/DLQueryMessages.js';

const OWL_THING   = 'http://www.w3.org/2002/07/owl#Thing';
const OWL_NOTHING = 'http://www.w3.org/2002/07/owl#Nothing';

function makeGroup(queryType: ResultGroup['queryType'], iris: string[]): ResultGroup {
  return {
    queryType,
    label: queryType,
    entities: iris.map(iri => ({ iri, label: iri.split('#')[1] ?? iri, entityType: 'class' as const })),
  };
}

// ── T018: name filter ────────────────────────────────────────────────────────

describe('filterGroups — name filter (T018)', () => {
  it('returns only entities whose label contains the substring (case-insensitive)', () => {
    const groups = [makeGroup('directSuperClasses', ['http://x.org#Animal', 'http://x.org#Dog'])];
    const result = filterGroups(groups, 'dog', true, true);
    expect(result).toHaveLength(1);
    expect(result[0]!.entities).toHaveLength(1);
    expect(result[0]!.entities[0]!.iri).toBe('http://x.org#Dog');
  });

  it('matches against IRI as well as label', () => {
    const groups = [makeGroup('subClasses', ['http://example.org/SpecialThing'])];
    const result = filterGroups(groups, 'special', true, true);
    expect(result[0]!.entities).toHaveLength(1);
  });

  it('clearing the filter (empty string) restores all entities', () => {
    const groups = [makeGroup('directSubClasses', ['http://x.org#Cat', 'http://x.org#Dog'])];
    const filtered = filterGroups(groups, 'cat', true, true);
    expect(filtered[0]!.entities).toHaveLength(1);
    const restored = filterGroups(groups, '', true, true);
    expect(restored[0]!.entities).toHaveLength(2);
  });

  it('returns empty array (no groups) when filter matches nothing', () => {
    const groups = [makeGroup('directSuperClasses', ['http://x.org#Animal'])];
    const result = filterGroups(groups, 'xyz-no-match', true, true);
    expect(result).toHaveLength(0);
  });

  it('filter is case-insensitive', () => {
    const groups = [makeGroup('superClasses', ['http://x.org#Animal'])];
    expect(filterGroups(groups, 'ANIMAL', true, true)).toHaveLength(1);
    expect(filterGroups(groups, 'animal', true, true)).toHaveLength(1);
    expect(filterGroups(groups, 'Animal', true, true)).toHaveLength(1);
  });
});

// ── T020: owl:Thing / owl:Nothing toggle ─────────────────────────────────────

describe('filterGroups — owl:Thing / owl:Nothing (T020)', () => {
  it('removes owl:Thing from superclass groups when showOwlThing is false', () => {
    const groups = [
      makeGroup('directSuperClasses', [OWL_THING, 'http://x.org#Animal']),
      makeGroup('superClasses',       [OWL_THING]),
      makeGroup('equivalentClasses',  [OWL_THING]),
    ];
    const result = filterGroups(groups, '', false, true);
    for (const g of result) {
      expect(g.entities.map(e => e.iri)).not.toContain(OWL_THING);
    }
  });

  it('keeps owl:Thing in superclass groups when showOwlThing is true', () => {
    const groups = [makeGroup('directSuperClasses', [OWL_THING, 'http://x.org#Animal'])];
    const result = filterGroups(groups, '', true, true);
    expect(result[0]!.entities.map(e => e.iri)).toContain(OWL_THING);
  });

  it('removes owl:Nothing from subclass groups when showOwlNothing is false', () => {
    const groups = [
      makeGroup('directSubClasses', [OWL_NOTHING, 'http://x.org#Dog']),
      makeGroup('subClasses',       [OWL_NOTHING]),
    ];
    const result = filterGroups(groups, '', true, false);
    for (const g of result) {
      expect(g.entities.map(e => e.iri)).not.toContain(OWL_NOTHING);
    }
  });

  it('keeps owl:Nothing in subclass groups when showOwlNothing is true', () => {
    const groups = [makeGroup('subClasses', [OWL_NOTHING, 'http://x.org#Dog'])];
    const result = filterGroups(groups, '', true, true);
    expect(result[0]!.entities.map(e => e.iri)).toContain(OWL_NOTHING);
  });

  it('does not remove owl:Nothing from superclass groups', () => {
    const groups = [makeGroup('directSuperClasses', [OWL_NOTHING])];
    const result = filterGroups(groups, '', true, false);
    expect(result[0]!.entities.map(e => e.iri)).toContain(OWL_NOTHING);
  });

  it('does not remove owl:Thing from subclass groups', () => {
    const groups = [makeGroup('directSubClasses', [OWL_THING])];
    const result = filterGroups(groups, '', false, true);
    expect(result[0]!.entities.map(e => e.iri)).toContain(OWL_THING);
  });

  it('rechecking owl:Thing restores it in superclass results', () => {
    const groups = [makeGroup('directSuperClasses', [OWL_THING, 'http://x.org#Animal'])];
    const hidden = filterGroups(groups, '', false, true);
    expect(hidden[0]!.entities.map(e => e.iri)).not.toContain(OWL_THING);
    const restored = filterGroups(groups, '', true, true);
    expect(restored[0]!.entities.map(e => e.iri)).toContain(OWL_THING);
  });
});
