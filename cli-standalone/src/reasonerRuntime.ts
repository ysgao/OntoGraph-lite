import * as fs from 'fs';
import * as path from 'path';
import { ReasonerProcess } from '@core/reasoner/ReasonerProcess';

// Resolved relative to the built package (cli-standalone/dist/main.js) — see esbuild.mjs, which
// copies the bundled JRE and the reasoner JAR into dist/runtime/ as part of `npm run build`.
// Temurin's macOS JRE tarball nests the actual JRE root under Contents/Home/ (an app-bundle-style
// layout), NOT a flat bin/ directly under the extracted directory — verified against the real
// fetched archive, not assumed.
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const JAVA_PATH = path.join(RUNTIME_DIR, 'jre', 'Contents', 'Home', 'bin', 'java');
const JAR_PATH = path.join(RUNTIME_DIR, 'onto-reasoner-server.jar');

/** This standalone build only ships a runtime for one platform/architecture (macOS arm64, per
 *  spec FR-010) — thrown before ever attempting to construct a ReasonerProcess on any other
 *  platform. */
export class PlatformUnsupportedError extends Error {}

/** Thrown when the bundled runtime (JRE and/or reasoner JAR) is missing or incomplete for the
 *  current (supported) platform — e.g. a corrupted or partial install. */
export class RuntimeUnavailableError extends Error {}

/** Verifies the bundled runtime is present and the current platform is supported, throwing a
 *  specific, actionable error otherwise — called before constructing any ReasonerProcess so a
 *  missing/corrupted runtime is reported clearly (spec FR-009) instead of hanging or crashing
 *  opaquely inside a spawn() call. */
export function checkRuntimeAvailable(): void {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new PlatformUnsupportedError(
      `This standalone build only supports macOS on Apple Silicon (darwin/arm64). ` +
      `Detected platform: ${process.platform}/${process.arch}.`,
    );
  }
  if (!fs.existsSync(JAVA_PATH) || !fs.existsSync(JAR_PATH)) {
    throw new RuntimeUnavailableError(
      `Bundled runtime not found at ${RUNTIME_DIR}. The package may be corrupted or incompletely installed.`,
    );
  }
}

/** Constructs a ReasonerProcess pointed at this package's own bundled runtime — never a system
 *  `java` on PATH (spec FR-004). Throws PlatformUnsupportedError/RuntimeUnavailableError (via
 *  checkRuntimeAvailable) before ever spawning anything. */
export function createReasonerProcess(): ReasonerProcess {
  checkRuntimeAvailable();
  return new ReasonerProcess({ javaPath: JAVA_PATH, jarPath: JAR_PATH });
}
