import { describe, it, expect } from 'vitest';
import { resolveNamespace, extractDefaultPrefix, validateLocalName, constructIri, isValidAbsoluteIri } from './namespaceUtils.js';
import type { OntologyModel } from '../model/OntologyModel.js';

function makeModel(iri?: string, rawContent = ''): OntologyModel {
  return {
    metadata: { iri, imports: [], annotations: {} },
    classes: new Map(),
    objectProperties: new Map(),
    dataProperties: new Map(),
    annotationProperties: new Map(),
    individuals: new Map(),
    sourceUri: '',
    rawContent,
    sourceFormat: 'functional',
    standaloneGcis: [],
    inferredSubClasses: new Map(),
    isClassified: false,
    classificationNeedsUpdate: false,
  } as OntologyModel;
}

const SNOMED_RAW = `Prefix(:=<http://snomed.info/id/>)
Prefix(owl:=<http://www.w3.org/2002/07/owl#>)
Ontology(<http://snomed.info/id/sct/900000000000207008>
)`;

const HASH_RAW = `Prefix(:=<http://example.org/ont#>)
Ontology(<http://example.org/ont>
)`;

// ────────────────────────────────────────────────────────────
// extractDefaultPrefix
// ────────────────────────────────────────────────────────────

describe('extractDefaultPrefix', () => {
  it('returns the IRI from Prefix(:=<IRI>) with slash suffix', () => {
    expect(extractDefaultPrefix(SNOMED_RAW)).toBe('http://snomed.info/id/');
  });

  it('returns the IRI from Prefix(:=<IRI>) with hash suffix', () => {
    expect(extractDefaultPrefix(HASH_RAW)).toBe('http://example.org/ont#');
  });

  it('returns undefined when no default prefix is present', () => {
    const raw = 'Prefix(owl:=<http://www.w3.org/2002/07/owl#>)\nOntology(<http://example.org/ont>)';
    expect(extractDefaultPrefix(raw)).toBeUndefined();
  });

  it('returns undefined for empty content', () => {
    expect(extractDefaultPrefix('')).toBeUndefined();
  });

  it('tolerates extra whitespace around tokens', () => {
    const raw = 'Prefix( : = <http://snomed.info/id/> )';
    expect(extractDefaultPrefix(raw)).toBe('http://snomed.info/id/');
  });
});

// ────────────────────────────────────────────────────────────
// resolveNamespace
// ────────────────────────────────────────────────────────────

describe('resolveNamespace', () => {
  it('returns the setting value when non-empty (highest priority)', () => {
    const model = makeModel('http://model.org/ont#', SNOMED_RAW);
    expect(resolveNamespace(model, 'http://setting.org/ont#')).toBe('http://setting.org/ont#');
  });

  it('uses default prefix Prefix(:=<IRI>) when setting is empty', () => {
    const model = makeModel('http://snomed.info/id/sct/900000000000207008', SNOMED_RAW);
    expect(resolveNamespace(model, '')).toBe('http://snomed.info/id/');
  });

  it('uses default prefix Prefix(:=<IRI>) when setting is undefined', () => {
    const model = makeModel(undefined, SNOMED_RAW);
    expect(resolveNamespace(model, undefined)).toBe('http://snomed.info/id/');
  });

  it('falls back to model.metadata.iri when it ends with # (no raw prefix)', () => {
    const model = makeModel('http://model.org/ont#');
    expect(resolveNamespace(model, '')).toBe('http://model.org/ont#');
  });

  it('falls back to model.metadata.iri when it ends with /', () => {
    const model = makeModel('http://model.org/ont/');
    expect(resolveNamespace(model, '')).toBe('http://model.org/ont/');
  });

  it('skips model.metadata.iri when it does NOT end with # or / (versioned IRI)', () => {
    // SNOMED ontology IRI without the default prefix in raw content
    const model = makeModel('http://snomed.info/id/sct/900000000000207008');
    expect(resolveNamespace(model, '')).toBeUndefined();
  });

  it('returns undefined when setting, raw prefix, and model iri are all absent', () => {
    const model = makeModel(undefined);
    expect(resolveNamespace(model, '')).toBeUndefined();
  });

  it('setting takes priority over raw prefix', () => {
    const model = makeModel(undefined, SNOMED_RAW);
    expect(resolveNamespace(model, 'http://override.org/ont#')).toBe('http://override.org/ont#');
  });
});

// ────────────────────────────────────────────────────────────
// validateLocalName
// ────────────────────────────────────────────────────────────

describe('validateLocalName', () => {
  it('returns true for a simple alphanumeric name', () => {
    expect(validateLocalName('HeartDisease')).toBe(true);
  });

  it('returns true for a name with underscore', () => {
    expect(validateLocalName('has_Part')).toBe(true);
  });

  it('returns true for a name starting with underscore', () => {
    expect(validateLocalName('_MyClass')).toBe(true);
  });

  it('returns true for a name with digits (not first char)', () => {
    expect(validateLocalName('Class123')).toBe(true);
  });

  it('returns true for a name with hyphen and dot', () => {
    expect(validateLocalName('has-direct.part')).toBe(true);
  });

  it('returns failure for an empty name', () => {
    const result = validateLocalName('');
    expect(result).not.toBe(true);
    expect(typeof result).toBe('object');
  });

  it('returns true for a name starting with a digit', () => {
    expect(validateLocalName('123abc')).toBe(true);
  });

  it('returns true for a purely numeric name', () => {
    expect(validateLocalName('12345')).toBe(true);
  });

  it('returns failure for a name with spaces', () => {
    const result = validateLocalName('Heart Disease');
    expect(result).not.toBe(true);
    expect(typeof result).toBe('object');
  });

  it('returns failure for a name with special characters', () => {
    const result = validateLocalName('my@class');
    expect(result).not.toBe(true);
    expect(typeof result).toBe('object');
  });

  it('failure result has a reason string', () => {
    const result = validateLocalName('');
    expect(result).toHaveProperty('reason');
    expect(typeof (result as { reason: string }).reason).toBe('string');
  });
});

// ────────────────────────────────────────────────────────────
// constructIri
// ────────────────────────────────────────────────────────────

describe('constructIri', () => {
  it('concatenates namespace ending with # and localName', () => {
    expect(constructIri('http://example.org/ont#', 'Foo')).toBe('http://example.org/ont#Foo');
  });

  it('concatenates namespace ending with / and localName', () => {
    expect(constructIri('http://example.org/ont/', 'Bar')).toBe('http://example.org/ont/Bar');
  });

  it('throws when namespace does not end with # or /', () => {
    expect(() => constructIri('http://example.org/ont', 'Foo')).toThrow();
  });

  it('throws for empty namespace', () => {
    expect(() => constructIri('', 'Foo')).toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// isValidAbsoluteIri
// ────────────────────────────────────────────────────────────

describe('isValidAbsoluteIri', () => {
  it('returns true for a valid http IRI', () => {
    expect(isValidAbsoluteIri('http://example.org/ont#Foo')).toBe(true);
  });

  it('returns true for a valid https IRI', () => {
    expect(isValidAbsoluteIri('https://example.org/ont#Foo')).toBe(true);
  });

  it('returns true for a urn IRI', () => {
    expect(isValidAbsoluteIri('urn:example:foo')).toBe(true);
  });

  it('returns false for a relative IRI', () => {
    expect(isValidAbsoluteIri('relative/path')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidAbsoluteIri('')).toBe(false);
  });

  it('returns false for a string with spaces', () => {
    expect(isValidAbsoluteIri('http://example.org/ont# Foo')).toBe(false);
  });

  it('returns false for a bare word without scheme', () => {
    expect(isValidAbsoluteIri('NoScheme')).toBe(false);
  });
});
