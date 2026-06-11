import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { writeResult, writeError, exitCode } from '../../output';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  location?: string;
}

export interface ValidateResult {
  filePath: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export async function runValidate(file: string, _timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'validate';
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

  try {
    ParserRegistry.parse(text, 'auto', absPath);
    writeResult<ValidateResult>({ filePath: absPath, valid: true, issues: [] }, command, Date.now() - start);
    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const issue: ValidationIssue = { severity: 'error', message: msg };
    writeResult<ValidateResult>({ filePath: absPath, valid: false, issues: [issue] }, command, Date.now() - start);
    return 0;
  }
}
