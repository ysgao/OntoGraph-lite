import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import type { OntologyModel } from '@core/model/OntologyModel';
import type { ApiDLQueryResult, ClassRef } from '@core/api';
import type { DLQueryType } from '@core/views/DLQueryMessages';
import { matchesLabelFilter } from '@core/utils/dlQueryLabelFilter';
import { parseQueryTypes, InvalidQueryTypeError } from '@cli/commands/bridge/dlQueryTypes';
import { writeResult, writeError, exitCode } from '../output';
import { createReasonerProcess, PlatformUnsupportedError, RuntimeUnavailableError } from '../reasonerRuntime';

export interface StandaloneDlQueryOptions {
  types?: string;
  filter?: string;
}

/** Resolves a label for `iri` by looking it up across every entity map the model has — this
 *  standalone command has no OntologyIndex (that's an extension-host concept), so it reads
 *  directly from the parsed model's own class/individual maps instead. */
function makeGetLabel(model: OntologyModel): (iri: string) => string | null {
  return (iri: string): string | null => {
    const entity = model.classes.get(iri) ?? model.individuals.get(iri)
      ?? model.objectProperties.get(iri) ?? model.dataProperties.get(iri) ?? model.annotationProperties.get(iri);
    if (!entity) { return null; }
    const labels = entity.labels['en'] ?? entity.labels[''] ?? Object.values(entity.labels)[0];
    return labels?.[0] ?? null;
  };
}

export async function runStandaloneDlQuery(
  file: string,
  expression: string,
  _timeout: number,
  options: StandaloneDlQueryOptions = {},
): Promise<number> {
  const start = Date.now();
  const command = 'dl-query';
  const absPath = path.resolve(file);

  let queryTypes: DLQueryType[];
  try {
    queryTypes = parseQueryTypes(options.types);
  } catch (err: unknown) {
    if (err instanceof InvalidQueryTypeError) {
      writeError('INVALID_ARGS', err.message, command, Date.now() - start);
      return exitCode('INVALID_ARGS');
    }
    throw err;
  }

  if (!fs.existsSync(absPath)) {
    writeError('FILE_NOT_FOUND', `File not found: ${absPath}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let text: string;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeError('FILE_NOT_FOUND', `Cannot read file: ${msg}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let model: OntologyModel;
  try {
    model = ParserRegistry.parse(text, 'auto', absPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeError('PARSE_ERROR', `Parse failed: ${msg}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  let reasonerProcess;
  try {
    reasonerProcess = createReasonerProcess();
  } catch (err: unknown) {
    if (err instanceof PlatformUnsupportedError) {
      writeError('PLATFORM_UNSUPPORTED', err.message, command, Date.now() - start);
      return exitCode('PLATFORM_UNSUPPORTED');
    }
    if (err instanceof RuntimeUnavailableError) {
      writeError('RUNTIME_UNAVAILABLE', err.message, command, Date.now() - start);
      return exitCode('RUNTIME_UNAVAILABLE');
    }
    throw err;
  }

  try {
    // Passes the original file path (null content) rather than the read-in text — dlQuery
    // already supports a filePath param, avoiding a redundant temp-file round trip for large
    // ontology files (same rationale as standaloneClassifyCommand's use of classifyFile).
    const result = await reasonerProcess.dlQuery(model.sourceFormat as string, null, absPath, expression, queryTypes, 'auto');
    const getLabel = makeGetLabel(model);
    const toRef = (iri: string): ClassRef => ({ iri, label: getLabel(iri) });

    const output: ApiDLQueryResult = { expression };
    for (const type of queryTypes) {
      const refs = result[type].map(toRef);
      output[type] = options.filter ? refs.filter(e => matchesLabelFilter(e, options.filter)) : refs;
    }

    writeResult(output, command, Date.now() - start);
    return 0;
  } catch (err: unknown) {
    const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
    const msg = err instanceof Error ? err.message : String(err);
    writeError(code, msg, command, Date.now() - start);
    return exitCode(code);
  } finally {
    // See standaloneClassifyCommand.ts — without disposing the spawned JVM, this process's
    // event loop never empties and the CLI invocation never actually exits.
    reasonerProcess.dispose();
  }
}
