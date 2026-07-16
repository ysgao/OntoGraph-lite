import { describe, it, expect } from 'vitest';
import { autoQuoteBareLabelExpression, withParseHint } from '../../src/commands/bridge/autoQuoteLabel';

describe('autoQuoteBareLabelExpression', () => {
  it('wraps a bare multi-word label in single quotes', () => {
    expect(autoQuoteBareLabelExpression('middle ear structure')).toBe("'middle ear structure'");
  });

  it('trims surrounding whitespace before quoting', () => {
    expect(autoQuoteBareLabelExpression('  middle ear structure  ')).toBe("'middle ear structure'");
  });

  it('leaves a single bare word unchanged (already resolves fine unquoted)', () => {
    expect(autoQuoteBareLabelExpression('Koala')).toBe('Koala');
  });

  it('leaves a real Manchester expression unchanged (contains a keyword)', () => {
    expect(autoQuoteBareLabelExpression('Animal and hasHabitat some Ocean')).toBe('Animal and hasHabitat some Ocean');
  });

  it('leaves an already-quoted expression unchanged', () => {
    expect(autoQuoteBareLabelExpression("'middle ear structure'")).toBe("'middle ear structure'");
  });

  it('leaves an expression with parens unchanged', () => {
    const expr = 'ClinicalFinding and findingSite some (BodyStructure and partOf some Heart)';
    expect(autoQuoteBareLabelExpression(expr)).toBe(expr);
  });

  it('leaves a full-IRI expression unchanged', () => {
    const expr = '<http://example.org#A>';
    expect(autoQuoteBareLabelExpression(expr)).toBe(expr);
  });

  it('leaves a CURIE (single token, no spaces) unchanged', () => {
    expect(autoQuoteBareLabelExpression('pizza:Pizza')).toBe('pizza:Pizza');
  });

  it('leaves an empty string unchanged', () => {
    expect(autoQuoteBareLabelExpression('')).toBe('');
  });
});

describe('withParseHint', () => {
  const parseError = 'Encountered middle at line 1 column 1. Expected one of:\n\tClass name\n\tObject property name\n';

  it('appends a single-quote hint for a Manchester parse error on a bare multi-word expression', () => {
    const result = withParseHint(parseError, 'Animal and middle ear structure');
    expect(result).toContain(parseError);
    expect(result).toContain("Hint: wrap multi-word entity names in single quotes, e.g. 'Animal and middle ear structure'.");
  });

  it('leaves an ontology-level error (not a Manchester parse failure) unchanged', () => {
    const message = 'Ontology is inconsistent';
    expect(withParseHint(message, 'Animal and middle ear structure')).toBe(message);
  });

  it('leaves the message unchanged when the expression is already quoted/structured', () => {
    expect(withParseHint(parseError, "'middle ear structure'")).toBe(parseError);
  });
});
