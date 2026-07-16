import { send } from './bridgeClient';

interface ActiveFileError extends Error {
  errorCode: string;
}

function bridgeError(errorCode: string, message: string): ActiveFileError {
  const err = new Error(message) as ActiveFileError;
  err.errorCode = errorCode;
  return err;
}

/**
 * Resolves the file path of the ontology currently open in the running OntoGraph
 * extension, for CLI commands whose <file> argument is optional. Throws an Error
 * with an `errorCode` property (BRIDGE_UNAVAILABLE/BRIDGE_TIMEOUT/NO_ACTIVE_FILE)
 * on failure, matching the shape callers already expect from bridge commands.
 */
export async function resolveActiveFilePath(timeout: number): Promise<string> {
  const resp = await send<{ filePath: string | null }>(
    { id: String(Date.now()), method: 'getActiveFile', params: {} },
    timeout,
  );
  if (!resp.success) {
    throw bridgeError(resp.errorCode ?? 'BRIDGE_ERROR', resp.error ?? 'Bridge error');
  }
  if (!resp.data?.filePath) {
    throw bridgeError('NO_ACTIVE_FILE', 'No ontology file is currently open in the OntoGraph extension.');
  }
  return resp.data.filePath;
}
