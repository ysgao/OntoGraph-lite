export interface CliResponse<T> {
  success: boolean;
  command: string;
  durationMs: number;
  data?: T;
  error?: string;
  errorCode?: string;
}

export function writeResult<T>(data: T, command: string, durationMs: number): void {
  const response: CliResponse<T> = { success: true, command, durationMs, data };
  process.stdout.write(JSON.stringify(response) + '\n');
}

/** `data` carries structured error detail (e.g. ambiguous-match candidates or
 *  not-found suggestions) callers can act on programmatically, beyond the
 *  human-readable `error` string. */
export function writeError<T = never>(
  errorCode: string,
  error: string,
  command: string,
  durationMs: number,
  data?: T,
): void {
  const response: CliResponse<T> = { success: false, command, durationMs, error, errorCode, data };
  process.stdout.write(JSON.stringify(response) + '\n');
}

/** Exported (not just module-private) so cli-standalone/src/output.ts can extend this same base
 *  map with its own additional codes (RUNTIME_UNAVAILABLE, PLATFORM_UNSUPPORTED) without
 *  duplicating it — see specs/028-standalone-cli-reasoner. */
export const EXIT_CODES: Record<string, number> = {
  FILE_NOT_FOUND: 1,
  PARSE_ERROR: 2,
  UNSUPPORTED_FORMAT: 3,
  INVALID_ARGS: 4,
  NOT_FOUND: 5,
  AMBIGUOUS_MATCH: 6,
  BRIDGE_UNAVAILABLE: 10,
  BRIDGE_TIMEOUT: 11,
  BRIDGE_ERROR: 12,
};

export function exitCode(errorCode: string): number {
  return EXIT_CODES[errorCode] ?? 1;
}
