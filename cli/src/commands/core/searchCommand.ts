import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { OntologyIndex } from '@core/model/OntologyIndex';
import { getLabel } from '@core/model/OntologyModel';
import type { OWLEntityUnion } from '@core/model/OntologyModel';
import { writeResult, writeError, exitCode } from '../../output';

export interface EntityMatch {
  iri: string;
  type: string;
  label: string | null;
  score: number;
  matchedFields: string[];
}

export interface SearchResult {
  filePath: string;
  query: string;
  totalMatches: number;
  results: EntityMatch[];
}

export async function runSearch(
  file: string,
  query: string,
  limit: number,
  typeFilter: string | undefined,
  _timeout: number,
): Promise<number> {
  const start = Date.now();
  const command = 'search';
  const absPath = path.resolve(file);

  if (!fs.existsSync(absPath)) {
    writeError('FILE_NOT_FOUND', `File not found: ${absPath}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let text: string;
  try { text = fs.readFileSync(absPath, 'utf8'); }
  catch (err: unknown) {
    writeError('FILE_NOT_FOUND', `Cannot read file: ${err instanceof Error ? err.message : String(err)}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let model;
  try { model = ParserRegistry.parse(text, 'auto', absPath); }
  catch (err: unknown) {
    writeError('PARSE_ERROR', `Parse failed: ${err instanceof Error ? err.message : String(err)}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  const index = new OntologyIndex(model);
  const hits: OWLEntityUnion[] = index.searchByLabel(query, limit * 4);

  const filtered = typeFilter
    ? hits.filter(e => e.type === typeFilter)
    : hits;

  const results: EntityMatch[] = filtered.slice(0, limit).map(e => ({
    iri: e.iri,
    type: e.type,
    label: getLabel(e) || null,
    score: 1,
    matchedFields: ['label'],
  }));

  writeResult<SearchResult>({
    filePath: absPath,
    query,
    totalMatches: filtered.length,
    results,
  }, command, Date.now() - start);
  return 0;
}
