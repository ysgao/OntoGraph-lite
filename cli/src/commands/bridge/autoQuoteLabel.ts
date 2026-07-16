import { MANCHESTER_KW } from '@core/model/AxiomDisplay';

const STRUCTURAL_CHARS = /['"<>(){}]/;

/**
 * Wraps a bare multi-word DL query expression in single quotes so it resolves as one label
 * lookup instead of being tokenized into separate (invalid) class-expression words — e.g. a user
 * typing `middle ear structure` instead of the Manchester-correct `'middle ear structure'`.
 * Only fires when the whole expression is unambiguously "just a label": no quotes/angle
 * brackets/parens/braces already present, and no Manchester keyword among its words (which would
 * mean it's an actual multi-operand expression, not a bare label).
 */
export function autoQuoteBareLabelExpression(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed || STRUCTURAL_CHARS.test(trimmed)) { return expression; }

  const words = trimmed.split(/\s+/);
  if (words.length < 2) { return expression; }
  if (words.some(w => MANCHESTER_KW.has(w))) { return expression; }

  return `'${trimmed}'`;
}

const MANCHESTER_PARSE_ERROR_SIGNATURE = 'Expected one of:';

/**
 * Appends a hint to single-quote multi-word entity names when the reasoner's error message looks
 * like an OWLAPI Manchester syntax parse failure — i.e. the expression mixed a bare unquoted
 * multi-word label with real Manchester keywords, so `autoQuoteBareLabelExpression` correctly left
 * it alone (it's not "just a label"), but the bare words still broke the parser. A no-op for
 * anything else — ontology-level errors (unsatisfiable expressions, unknown entities) shouldn't
 * get a misleading quoting hint.
 */
export function withParseHint(message: string, expression: string): string {
  if (!message.includes(MANCHESTER_PARSE_ERROR_SIGNATURE)) { return message; }
  if (STRUCTURAL_CHARS.test(expression)) { return message; }
  return `${message}\nHint: wrap multi-word entity names in single quotes, e.g. '${expression.trim()}'.`;
}
