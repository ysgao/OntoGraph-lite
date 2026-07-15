import { writeResult, writeError, EXIT_CODES as BASE_EXIT_CODES } from '@cli/output';

export { writeResult, writeError };
export type { CliResponse } from '@cli/output';

/** Extends the minimal CLI's own exit-code map (unmodified base codes) with two new codes that
 *  only apply to the standalone package, which is the one CLI that ships its own runtime and can
 *  therefore fail in ways the minimal CLI never does. */
const EXIT_CODES: Record<string, number> = {
  ...BASE_EXIT_CODES,
  RUNTIME_UNAVAILABLE: 13,
  PLATFORM_UNSUPPORTED: 14,
};

export function exitCode(errorCode: string): number {
  return EXIT_CODES[errorCode] ?? 1;
}
