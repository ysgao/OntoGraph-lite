import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { writeResult, writeError, exitCode } from '../output';
import { createReasonerProcess, PlatformUnsupportedError, RuntimeUnavailableError } from '../reasonerRuntime';

export interface StandaloneClassifyOptions {
  reasoner?: string;
}

const DEFAULT_REASONER = 'elk';

export async function runStandaloneClassify(
  file: string,
  _timeout: number,
  options: StandaloneClassifyOptions = {},
): Promise<number> {
  const start = Date.now();
  const command = 'classify';
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
    const reasoner = options.reasoner ?? DEFAULT_REASONER;
    // Uses classifyFile (the original file already on disk) rather than classify(format, text,
    // ...) — the latter would trigger ReasonerProcess's own >512KB temp-file substitution,
    // redundantly re-writing the same bytes we already have a path to. Matters at SNOMED scale:
    // avoids doubling I/O for a ~30MB ontology file (spec FR-011/SC-005).
    const result = await reasonerProcess.classifyFile(model.sourceFormat as string, absPath, reasoner);
    writeResult(result, command, Date.now() - start);
    return 0;
  } catch (err: unknown) {
    const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
    const msg = err instanceof Error ? err.message : String(err);
    writeError(code, msg, command, Date.now() - start);
    return exitCode(code);
  } finally {
    // Critical: a standalone CLI invocation is one-shot — without disposing the spawned JVM
    // child process, its open stdin/stdout pipes keep this Node process's event loop alive
    // indefinitely, so the CLI would never actually exit even after writing its result.
    reasonerProcess.dispose();
  }
}
