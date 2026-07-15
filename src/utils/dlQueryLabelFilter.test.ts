import { describe, it, expect } from 'vitest';
import { matchesLabelFilter } from './dlQueryLabelFilter';

describe('matchesLabelFilter', () => {
  it('matches when the label contains the filter text, case-insensitively', () => {
    expect(matchesLabelFilter({ iri: 'ex:Liver', label: 'Liver' }, 'liv')).toBe(true);
    expect(matchesLabelFilter({ iri: 'ex:Liver', label: 'Liver' }, 'LIV')).toBe(true);
  });

  it('matches when the IRI contains the filter text, case-insensitively', () => {
    expect(matchesLabelFilter({ iri: 'http://example.org#Liver', label: 'Something else' }, 'liver')).toBe(true);
  });

  it('does not match when neither label nor IRI contains the filter text', () => {
    expect(matchesLabelFilter({ iri: 'ex:Kidney', label: 'Kidney' }, 'liver')).toBe(false);
  });

  it('treats a null label as non-matching for the label side, falling back to the IRI', () => {
    expect(matchesLabelFilter({ iri: 'ex:Liver', label: null }, 'liver')).toBe(true);
    expect(matchesLabelFilter({ iri: 'ex:Kidney', label: null }, 'liver')).toBe(false);
  });

  it('matches every entity when the filter is undefined or empty', () => {
    expect(matchesLabelFilter({ iri: 'ex:Kidney', label: 'Kidney' }, undefined)).toBe(true);
    expect(matchesLabelFilter({ iri: 'ex:Kidney', label: 'Kidney' }, '')).toBe(true);
  });
});
