import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { writeResult, writeError, exitCode } from '../../output';

export interface ParseResult {
  filePath: string;
  format: string;
  ontologyIri: string | null;
  classCount: number;
  objectPropertyCount: number;
  dataPropertyCount: number;
  annotationPropertyCount: number;
  individualCount: number;
  axiomCount: number;
}

export async function runParse(file: string, _timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'parse';
  const absPath = path.resolve(file);

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

  let model;
  try {
    model = ParserRegistry.parse(text, 'auto', absPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeError('PARSE_ERROR', `Parse failed: ${msg}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  const axiomCount =
    [...model.classes.values()].reduce((n, c) => n + c.superClassIris.length + c.equivalentClassIris.length, 0) +
    [...model.objectProperties.values()].reduce((n, p) => n + p.superPropertyIris.length, 0);

  const result: ParseResult = {
    filePath: absPath,
    format: model.sourceFormat as string,
    ontologyIri: model.metadata.iri ?? null,
    classCount: model.classes.size,
    objectPropertyCount: model.objectProperties.size,
    dataPropertyCount: model.dataProperties.size,
    annotationPropertyCount: model.annotationProperties.size,
    individualCount: model.individuals.size,
    axiomCount,
  };

  writeResult(result, command, Date.now() - start);
  return 0;
}
