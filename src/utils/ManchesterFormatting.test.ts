import { describe, it, expect } from 'vitest';
import { formatManchesterForDisplay, collectLogicalLines, stripAndContinuations, findFormatBreaks, splitTopLevelConjuncts, sortManchesterConjuncts } from './ManchesterFormatting';

describe('formatManchesterForDisplay', () => {
  it('returns empty string unchanged', () => {
    expect(formatManchesterForDisplay('')).toBe('');
  });

  it('returns expression with no "and" unchanged', () => {
    expect(formatManchesterForDisplay('hasRole some Doctor')).toBe('hasRole some Doctor');
  });

  it('inserts newline+4-space indent before bare " and "', () => {
    expect(formatManchesterForDisplay('A and B')).toBe('A\n    and B');
  });

  it('handles multiple conjuncts', () => {
    expect(formatManchesterForDisplay('A and B and C')).toBe('A\n    and B\n    and C');
  });

  it('does NOT break at "and" inside IRI angle brackets', () => {
    const expr = '<http://example.org/land> and <http://example.org/standard>';
    expect(formatManchesterForDisplay(expr)).toBe('<http://example.org/land>\n    and <http://example.org/standard>');
  });

  it('does NOT break at "and" inside IRI — no breaks within the IRI itself', () => {
    const expr = '<http://example.org/bandana>';
    expect(formatManchesterForDisplay(expr)).toBe('<http://example.org/bandana>');
  });

  it('does NOT break at "and" inside double-quoted string literal', () => {
    const expr = 'hasName value "bread and butter"';
    expect(formatManchesterForDisplay(expr)).toBe('hasName value "bread and butter"');
  });

  it('does NOT break at "and" inside single-quoted label', () => {
    const expr = "'Milk and Honey' and Dog";
    expect(formatManchesterForDisplay(expr)).toBe("'Milk and Honey'\n    and Dog");
  });

  it('handles escaped quote inside double-quoted string', () => {
    const expr = 'hasName value "say \\"and\\" here" and Dog';
    expect(formatManchesterForDisplay(expr)).toBe('hasName value "say \\"and\\" here"\n    and Dog');
  });

  it('handles escaped quote inside single-quoted label', () => {
    const expr = "'can\\'t and won\\'t' and Dog";
    expect(formatManchesterForDisplay(expr)).toBe("'can\\'t and won\\'t'\n    and Dog");
  });

  it('does NOT break when " and " is at the end of the expression (no content after)', () => {
    expect(formatManchesterForDisplay('A and ')).toBe('A and ');
  });

  it('does NOT break when " and " is followed only by whitespace', () => {
    expect(formatManchesterForDisplay('A and  ')).toBe('A and  ');
  });

  it('DOES break when " and " is followed by a non-whitespace character', () => {
    expect(formatManchesterForDisplay("'Body structure' and 'All or part of' some 'Entire liver'"))
      .toBe("'Body structure'\n    and 'All or part of' some 'Entire liver'");
  });

  it('is idempotent — applying twice produces same result', () => {
    const expr = 'A and B and C';
    expect(formatManchesterForDisplay(formatManchesterForDisplay(expr)))
      .toBe(formatManchesterForDisplay(expr));
  });

  it('handles realistic SNOMED-style expression', () => {
    const expr = 'hasRole some TreatmentRole and hasLocation some Lung and hasCause some Infection';
    expect(formatManchesterForDisplay(expr))
      .toBe('hasRole some TreatmentRole\n    and hasLocation some Lung\n    and hasCause some Infection');
  });
});

describe('findFormatBreaks', () => {
  it('returns empty array for expression with no "and"', () => {
    expect(findFormatBreaks('hasRole some Doctor')).toEqual([]);
  });

  it('returns one break for a single conjunct', () => {
    expect(findFormatBreaks('A and B')).toEqual([1]);
  });

  it('returns two breaks for two conjuncts', () => {
    expect(findFormatBreaks('A and B and C')).toEqual([1, 7]);
  });

  it('returns no break when " and " has no content after (trailing)', () => {
    expect(findFormatBreaks('A and ')).toEqual([]);
  });

  it('does NOT return a break for "and" inside IRI brackets', () => {
    expect(findFormatBreaks('<http://example.org/land> and <http://example.org/Y>')).toEqual([25]);
  });

  it('does NOT return a break for "and" inside single-quoted label', () => {
    expect(findFormatBreaks("'Milk and Honey' and Dog")).toEqual([16]);
  });

  it('returns correct positions for a realistic SNOMED expression', () => {
    const expr = "'Body structure' and 'All or part of' some 'Entire liver'";
    expect(findFormatBreaks(expr)).toEqual([16]);
  });
});

describe('collectLogicalLines', () => {
  it('returns empty array for empty string', () => {
    expect(collectLogicalLines('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(collectLogicalLines('   \n  \n')).toEqual([]);
  });

  it('returns one-element array for single expression with no and', () => {
    expect(collectLogicalLines('hasRole some Doctor')).toEqual(['hasRole some Doctor']);
  });

  it('returns two-element array for two separate single-line expressions', () => {
    expect(collectLogicalLines('hasRole some Doctor\nhasAge min 18')).toEqual([
      'hasRole some Doctor',
      'hasAge min 18',
    ]);
  });

  it('joins continuation "and " line with predecessor', () => {
    expect(collectLogicalLines('hasRole some Doctor\n    and hasLocation some Hospital')).toEqual([
      'hasRole some Doctor and hasLocation some Hospital',
    ]);
  });

  it('joins multiple continuation lines', () => {
    expect(collectLogicalLines('A\n    and B\n    and C')).toEqual(['A and B and C']);
  });

  it('skips blank lines', () => {
    expect(collectLogicalLines('A\n\nB')).toEqual(['A', 'B']);
  });

  it('skips comment lines starting with #', () => {
    expect(collectLogicalLines('# comment\nA and B')).toEqual(['A and B']);
  });

  it('handles continuation line with no preceding expression (malformed) as standalone entry', () => {
    expect(collectLogicalLines('    and B')).toEqual(['and B']);
  });

  it('handles two formatted expressions', () => {
    const raw = 'A\n    and B\nC\n    and D';
    expect(collectLogicalLines(raw)).toEqual(['A and B', 'C and D']);
  });

  it('trims leading/trailing whitespace from lines', () => {
    expect(collectLogicalLines('  A  \n  and B  ')).toEqual(['A and B']);
  });
});

describe('stripAndContinuations', () => {
  it('returns empty string for empty input', () => {
    expect(stripAndContinuations('')).toBe('');
  });

  it('returns the single expression unchanged (no and)', () => {
    expect(stripAndContinuations('hasRole some Doctor')).toBe('hasRole some Doctor');
  });

  it('joins continuation lines into a single line', () => {
    expect(stripAndContinuations('A\n    and B\n    and C')).toBe('A and B and C');
  });

  it('equals collectLogicalLines(raw).join(" ") for single-expression input', () => {
    const raw = 'hasRole some Doctor\n    and hasLocation some Hospital\n    and hasCause some Infection';
    expect(stripAndContinuations(raw))
      .toBe(collectLogicalLines(raw).join(' '));
  });

  it('equals collectLogicalLines(raw).join(" ") for blank input', () => {
    expect(stripAndContinuations('   ')).toBe(collectLogicalLines('   ').join(' '));
  });
});

describe('round-trip invariant', () => {
  it('collectLogicalLines(formatManchesterForDisplay(e)) returns [e] for single expression', () => {
    const exprs = [
      'hasRole some Doctor',
      'hasRole some Doctor and hasLocation some Hospital',
      'A and B and C and D and E',
      '<http://example.org/X> and <http://example.org/Y>',
    ];
    for (const e of exprs) {
      expect(collectLogicalLines(formatManchesterForDisplay(e))).toEqual([e]);
    }
  });

  it('collectLogicalLines(formatted multi-expression) returns original array', () => {
    const exprs = [
      'hasRole some Doctor and hasLocation some Hospital',
      'hasAge min 18',
      'A and B and C',
    ];
    const joined = exprs.map(e => formatManchesterForDisplay(e)).join('\n');
    expect(collectLogicalLines(joined)).toEqual(exprs);
  });
});

// T001 — splitTopLevelConjuncts
describe('splitTopLevelConjuncts', () => {
  it('empty string returns empty array', () => {
    expect(splitTopLevelConjuncts('')).toEqual([]);
  });

  it('single conjunct with no and returns one-element array', () => {
    expect(splitTopLevelConjuncts('Material anatomical entity')).toEqual(['Material anatomical entity']);
  });

  it('two conjuncts split on top-level and', () => {
    expect(splitTopLevelConjuncts('A and B')).toEqual(['A', 'B']);
  });

  it('three conjuncts split correctly', () => {
    expect(splitTopLevelConjuncts('A and B and C')).toEqual(['A', 'B', 'C']);
  });

  it('and inside IRI angle brackets is not a split point', () => {
    expect(splitTopLevelConjuncts('<http://ex.org/land> and B')).toEqual(['<http://ex.org/land>', 'B']);
  });

  it('and inside double-quoted string is not a split point', () => {
    expect(splitTopLevelConjuncts('hasName value "bread and butter" and B')).toEqual([
      'hasName value "bread and butter"',
      'B',
    ]);
  });

  it('and inside single-quoted label is not a split point', () => {
    expect(splitTopLevelConjuncts("'Milk and Honey' and B")).toEqual(["'Milk and Honey'", 'B']);
  });

  it('and inside parentheses is not a split point', () => {
    expect(splitTopLevelConjuncts('constitutional part of (A and B) and regional part of C')).toEqual([
      'constitutional part of (A and B)',
      'regional part of C',
    ]);
  });

  it('nested parentheses are handled correctly', () => {
    expect(splitTopLevelConjuncts('A and (B and (C and D)) and E')).toEqual([
      'A',
      '(B and (C and D))',
      'E',
    ]);
  });
});

// T003 — sortManchesterConjuncts
describe('sortManchesterConjuncts', () => {
  it('empty string is returned unchanged', () => {
    expect(sortManchesterConjuncts('')).toBe('');
  });

  it('expression with no and clauses is returned unchanged', () => {
    expect(sortManchesterConjuncts('Material anatomical entity')).toBe('Material anatomical entity');
  });

  it('already-sorted input is returned unchanged', () => {
    const expr = 'Material anatomical entity and constitutional part of some Limb and laterality some Left';
    expect(sortManchesterConjuncts(expr)).toBe(expr);
  });

  it('reverse-sorted attributes are reordered into canonical order', () => {
    const input = 'Material anatomical entity and laterality some side and regional part of some entire skin and constitutional part of some entire upper limb';
    const expected = 'Material anatomical entity and constitutional part of some entire upper limb and regional part of some entire skin and laterality some side';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('laterality appearing before other attributes is moved to last position', () => {
    const input = 'Material anatomical entity and laterality some side and constitutional part of some Limb';
    const expected = 'Material anatomical entity and constitutional part of some Limb and laterality some side';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('unknown role filler is placed after all known attributes but before laterality', () => {
    const input = 'Entity and laterality some side and unknownRole some X and constitutional part of some Y';
    const expected = 'Entity and constitutional part of some Y and unknownRole some X and laterality some side';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('multiple unknown role fillers preserve their relative order', () => {
    const input = 'Entity and unknownB some X and unknownA some Y and constitutional part of some Z';
    const expected = 'Entity and constitutional part of some Z and unknownB some X and unknownA some Y';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('and inside IRI filler is treated as opaque — not split mid-IRI', () => {
    const expr = 'Entity and constitutional part of <http://ex.org/land>';
    expect(sortManchesterConjuncts(expr)).toBe(expr);
  });

  it('and inside double-quoted filler is treated as opaque', () => {
    const expr = 'Entity and constitutional part of some "bread and butter"';
    expect(sortManchesterConjuncts(expr)).toBe(expr);
  });

  it('and inside nested parentheses is treated as opaque — parenthesised conjunct moves as a unit', () => {
    const input = 'Entity and laterality some side and constitutional part of (A and B)';
    const expected = 'Entity and constitutional part of (A and B) and laterality some side';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('expression with top-level or is returned unchanged', () => {
    const expr = 'A or B';
    expect(sortManchesterConjuncts(expr)).toBe(expr);
  });

  it("single-quoted role name 'Constitutional part of' is matched correctly", () => {
    const input = "Entity and laterality some side and 'Constitutional part of' some Limb";
    const expected = "Entity and 'Constitutional part of' some Limb and laterality some side";
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it("'All or part of' in single quotes does NOT trigger the or-guard", () => {
    const input = "Entity and laterality some side and 'All or part of' some X";
    const expected = "Entity and 'All or part of' some X and laterality some side";
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });

  it('expression with top-level not is returned unchanged', () => {
    const expr = 'not Material anatomical entity';
    expect(sortManchesterConjuncts(expr)).toBe(expr);
  });

  it('named-class head (index 0) is never moved regardless of its role name', () => {
    const input = 'Material anatomical entity and laterality some side';
    const result = sortManchesterConjuncts(input);
    expect(result.startsWith('Material anatomical entity')).toBe(true);
  });

  it('full canonical example from spec', () => {
    const input = 'Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side';
    const expected = 'Material anatomical entity and constitutional part of some entire upper limb and regional part of some entire skin and laterality some side';
    expect(sortManchesterConjuncts(input)).toBe(expected);
  });
});

// T008 + T009 — sort + display composition and idempotency
describe('sortManchesterConjuncts + formatManchesterForDisplay composition', () => {
  it('sorted expression has laterality on the final indented and-line when displayed', () => {
    const expr = 'Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side';
    const formatted = formatManchesterForDisplay(sortManchesterConjuncts(expr));
    const lines = formatted.split('\n');
    expect(lines[lines.length - 1].trim()).toBe('and laterality some side');
  });

  it('constitutional part of appears before regional part of in display output', () => {
    const expr = 'Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side';
    const formatted = formatManchesterForDisplay(sortManchesterConjuncts(expr));
    expect(formatted.indexOf('constitutional part of')).toBeLessThan(formatted.indexOf('regional part of'));
  });

  it('sort is idempotent through a display-format round-trip', () => {
    const expr = 'Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side';
    const sorted = sortManchesterConjuncts(expr);
    const collected = collectLogicalLines(formatManchesterForDisplay(sorted)).join(' ');
    expect(sortManchesterConjuncts(collected)).toBe(sorted);
  });
});

// T011 — canonical order reconfigurability (indirect)
describe('canonical attribute ordering', () => {
  it('constitutional part of sorts before regional part of', () => {
    const input = 'Entity and regional part of some A and constitutional part of some B';
    const result = sortManchesterConjuncts(input);
    expect(result.indexOf('constitutional part of')).toBeLessThan(result.indexOf('regional part of'));
  });

  it('regional part of sorts before lateral half of', () => {
    const input = 'Entity and lateral half of some A and regional part of some B';
    const result = sortManchesterConjuncts(input);
    expect(result.indexOf('regional part of')).toBeLessThan(result.indexOf('lateral half of'));
  });

  it('lateral half of sorts before systemic part of', () => {
    const input = 'Entity and systemic part of some A and lateral half of some B';
    const result = sortManchesterConjuncts(input);
    expect(result.indexOf('lateral half of')).toBeLessThan(result.indexOf('systemic part of'));
  });

  it('systemic part of sorts before laterality', () => {
    const input = 'Entity and laterality some A and systemic part of some B';
    const result = sortManchesterConjuncts(input);
    expect(result.indexOf('systemic part of')).toBeLessThan(result.indexOf('laterality some'));
  });

  it("'All or part of' (single-quoted) sorts first among known attributes", () => {
    const input = "Entity and laterality some X and 'Constitutional part of' some Y and 'All or part of' some Z";
    const result = sortManchesterConjuncts(input);
    expect(result.indexOf('All or part of')).toBeLessThan(result.indexOf('Constitutional part of'));
  });
});
