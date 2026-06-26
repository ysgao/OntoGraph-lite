import { describe, it, expect } from 'vitest';
import { renameIri } from './IriRenameSync.js';

const OLD_IRI = 'http://example.org/ont#Animal';
const NEW_IRI = 'http://example.org/ont#Organism';
const UNRELATED_IRI = 'http://example.org/ont#Plant';

// ────────────────────────────────────────────────────────────
// Basic replacement
// ────────────────────────────────────────────────────────────

describe('renameIri', () => {
  it('replaces <oldIri> with <newIri> in a Declaration line', () => {
    const text = `  Declaration(Class(<${OLD_IRI}>))`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toContain(`Declaration(Class(<${NEW_IRI}>))`);
    expect(result).not.toContain(`<${OLD_IRI}>`);
  });

  it('replaces <oldIri> with <newIri> in a SubClassOf axiom', () => {
    const text = `  SubClassOf(<${OLD_IRI}> <http://www.w3.org/2002/07/owl#Thing>)`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toContain(`SubClassOf(<${NEW_IRI}>`);
    expect(result).not.toContain(`<${OLD_IRI}>`);
  });

  it('replaces <oldIri> in both subject and object of EquivalentClasses', () => {
    const text = `  EquivalentClasses(<${OLD_IRI}> <${OLD_IRI}>)`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toBe(`  EquivalentClasses(<${NEW_IRI}> <${NEW_IRI}>)`);
  });

  it('replaces <oldIri> in AnnotationAssertion lines', () => {
    const text = `  AnnotationAssertion(rdfs:label <${OLD_IRI}> "Animal")`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toContain(`<${NEW_IRI}>`);
    expect(result).not.toContain(`<${OLD_IRI}>`);
  });

  it('replaces all occurrences when the IRI appears multiple times', () => {
    const text = [
      `  Declaration(Class(<${OLD_IRI}>))`,
      `  SubClassOf(<${OLD_IRI}> <http://www.w3.org/2002/07/owl#Thing>)`,
      `  AnnotationAssertion(rdfs:label <${OLD_IRI}> "Animal")`,
    ].join('\n');
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).not.toContain(`<${OLD_IRI}>`);
    const count = (result.match(new RegExp(`<${NEW_IRI}>`, 'g')) ?? []).length;
    expect(count).toBe(3);
  });

  it('leaves unrelated IRIs untouched', () => {
    const text = `  SubClassOf(<${OLD_IRI}> <${UNRELATED_IRI}>)`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toContain(`<${UNRELATED_IRI}>`);
  });

  it('returns unchanged text when oldIri is not present (no-op)', () => {
    const text = `  Declaration(Class(<${UNRELATED_IRI}>))`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toBe(text);
  });

  it('does not replace partial IRI matches without bracket delimiters', () => {
    // "http://example.org/ont#Animal" should not match "http://example.org/ont#AnimalSpecies"
    const partialIri = `${OLD_IRI}Species`;
    const text = `  Declaration(Class(<${partialIri}>))`;
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    // The partial IRI <AnimalSpecies> should remain unchanged because only
    // the exact bracketed form <Animal> is replaced
    expect(result).toBe(text);
  });

  it('handles an empty document without error', () => {
    expect(() => renameIri('', OLD_IRI, NEW_IRI)).not.toThrow();
    expect(renameIri('', OLD_IRI, NEW_IRI)).toBe('');
  });

  it('handles a multiline document correctly', () => {
    const text = [
      'Ontology(<http://example.org/ont>',
      `  Declaration(Class(<${OLD_IRI}>))`,
      `  SubClassOf(<${OLD_IRI}> <http://www.w3.org/2002/07/owl#Thing>)`,
      ')',
    ].join('\n');
    const result = renameIri(text, OLD_IRI, NEW_IRI);
    expect(result).toContain(`Declaration(Class(<${NEW_IRI}>))`);
    expect(result).toContain(`SubClassOf(<${NEW_IRI}>`);
    expect(result).not.toContain(`<${OLD_IRI}>`);
    // Ontology IRI is not replaced (not bracketed by the same pattern)
    expect(result).toContain('Ontology(<http://example.org/ont>');
  });
});
