import { describe, it, expect } from 'vitest';
import { parseQueryTypes, InvalidQueryTypeError } from '../../src/commands/bridge/dlQueryTypes';

describe('parseQueryTypes', () => {
  it('defaults to subClasses alone when omitted', () => {
    expect(parseQueryTypes(undefined)).toEqual(['subClasses']);
  });

  it('defaults to subClasses alone when given an empty string', () => {
    expect(parseQueryTypes('')).toEqual(['subClasses']);
  });

  it('parses a valid comma-separated list', () => {
    expect(parseQueryTypes('directSubClasses,instances')).toEqual(['directSubClasses', 'instances']);
  });

  it('accepts all six valid category names', () => {
    const all = 'directSuperClasses,superClasses,equivalentClasses,directSubClasses,subClasses,instances';
    expect(parseQueryTypes(all)).toEqual([
      'directSuperClasses', 'superClasses', 'equivalentClasses',
      'directSubClasses', 'subClasses', 'instances',
    ]);
  });

  it('deduplicates repeated category names', () => {
    expect(parseQueryTypes('subClasses,subClasses')).toEqual(['subClasses']);
  });

  it('throws InvalidQueryTypeError for an unrecognized category name', () => {
    expect(() => parseQueryTypes('bogusCategory')).toThrow(InvalidQueryTypeError);
  });

  it('the thrown error message lists the valid category names', () => {
    try {
      parseQueryTypes('bogusCategory');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidQueryTypeError);
      expect((err as Error).message).toContain('subClasses');
      expect((err as Error).message).toContain('bogusCategory');
    }
  });
});
