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

export function writeError(
  errorCode: string,
  error: string,
  command: string,
  durationMs: number,
): void {
  const response: CliResponse<never> = { success: false, command, durationMs, error, errorCode };
  process.stdout.write(JSON.stringify(response) + '\n');
}

const EXIT_CODES: Record<string, number> = {
  FILE_NOT_FOUND: 1,
  PARSE_ERROR: 2,
  UNSUPPORTED_FORMAT: 3,
  INVALID_ARGS: 4,
  BRIDGE_UNAVAILABLE: 10,
  BRIDGE_TIMEOUT: 11,
  BRIDGE_ERROR: 12,
};

export function exitCode(errorCode: string): number {
  return EXIT_CODES[errorCode] ?? 1;
}
