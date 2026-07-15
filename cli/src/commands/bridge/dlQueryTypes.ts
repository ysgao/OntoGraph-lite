import { DL_QUERY_TYPE_LABELS, type DLQueryType } from '@core/views/DLQueryMessages';

const VALID_TYPES = new Set<string>(Object.keys(DL_QUERY_TYPE_LABELS));

/** No implicit default at the API layer — the CLI's own default, applied when `--types` is
 *  omitted (or empty), per spec FR-006. Deliberately different from the VS Code DL Query panel's
 *  own `DEFAULT_QUERY_TYPES` (`src/views/DLQueryMessages.ts`). */
const CLI_DEFAULT_QUERY_TYPES: DLQueryType[] = ['subClasses'];

export class InvalidQueryTypeError extends Error {
  constructor(readonly invalidName: string) {
    super(`Unrecognized --types value "${invalidName}". Valid values: ${[...VALID_TYPES].join(', ')}`);
  }
}

/** Parses/validates the `--types` CLI option into the six-value `DLQueryType` vocabulary
 *  (reused verbatim from `src/views/DLQueryMessages.ts` — no separate CLI vocabulary). Duplicate
 *  names collapse to one; an unrecognized name throws `InvalidQueryTypeError` before any bridge
 *  call is attempted. */
export function parseQueryTypes(raw: string | undefined): DLQueryType[] {
  if (raw === undefined || raw.trim() === '') { return CLI_DEFAULT_QUERY_TYPES; }

  const result: DLQueryType[] = [];
  const seen = new Set<string>();
  for (const name of raw.split(',').map(s => s.trim()).filter(s => s.length > 0)) {
    if (!VALID_TYPES.has(name)) { throw new InvalidQueryTypeError(name); }
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name as DLQueryType);
    }
  }
  return result;
}
