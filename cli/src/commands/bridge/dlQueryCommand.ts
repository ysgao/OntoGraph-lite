import { send } from '../../bridge/bridgeClient';
import { writeResult, writeError, exitCode } from '../../output';
import type { ApiDLQueryResult } from '@core/api';
import { matchesLabelFilter } from '@core/utils/dlQueryLabelFilter';
import { parseQueryTypes, InvalidQueryTypeError } from './dlQueryTypes';
import { autoQuoteBareLabelExpression, withParseHint } from './autoQuoteLabel';

export interface DlQueryOptions {
  types?: string;
  filter?: string;
}

/** Applies the case-insensitive label/IRI substring filter to every category present in `data`,
 *  client-side (never sent to the bridge — research.md Decision 4). A no-op when `filter` is
 *  omitted or empty. */
function applyLabelFilter(data: ApiDLQueryResult, filter: string | undefined): ApiDLQueryResult {
  if (!filter) { return data; }
  const filtered: ApiDLQueryResult = { expression: data.expression };
  for (const key of Object.keys(data) as (keyof ApiDLQueryResult)[]) {
    if (key === 'expression') { continue; }
    const entities = data[key];
    if (entities) {
      filtered[key] = entities.filter(e => matchesLabelFilter(e, filter));
    }
  }
  return filtered;
}

export async function runDlQuery(expression: string, timeout: number, options: DlQueryOptions = {}): Promise<number> {
  const start = Date.now();
  const command = 'dl-query';

  let queryTypes;
  try {
    queryTypes = parseQueryTypes(options.types);
  } catch (err: unknown) {
    if (err instanceof InvalidQueryTypeError) {
      writeError('INVALID_ARGS', err.message, command, Date.now() - start);
      return exitCode('INVALID_ARGS');
    }
    throw err;
  }

  const resolvedExpression = autoQuoteBareLabelExpression(expression);

  try {
    const resp = await send<ApiDLQueryResult>(
      { id: String(Date.now()), method: 'dlQuery', params: { expression: resolvedExpression, queryTypes } },
      timeout,
    );
    if (resp.success) {
      writeResult(applyLabelFilter(resp.data, options.filter), command, Date.now() - start);
      return 0;
    }
    const errorCode = resp.errorCode ?? 'BRIDGE_ERROR';
    writeError(errorCode, withParseHint(resp.error ?? 'Bridge error', resolvedExpression), command, Date.now() - start);
    return exitCode(errorCode);
  } catch (err: unknown) {
    const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
    const msg = err instanceof Error ? err.message : String(err);
    writeError(code, withParseHint(msg, resolvedExpression), command, Date.now() - start);
    return exitCode(code);
  }
}
