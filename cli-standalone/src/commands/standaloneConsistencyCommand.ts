import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { writeResult, writeError, exitCode } from '../output';
import { createReasonerProcess, PlatformUnsupportedError, RuntimeUnavailableError } from '../reasonerRuntime';

export async function runStandaloneConsistency(file: string, _timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'check-consistency';
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
    const result = await reasonerProcess.checkConsistency(model.sourceFormat as string, text);
    writeResult(result, command, Date.now() - start);
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
