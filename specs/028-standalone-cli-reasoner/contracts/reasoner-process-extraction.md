# Contract: `ReasonerProcess` extraction and `ReasonerBridge` compatibility

## `ReasonerProcess` public API (`src/reasoner/ReasonerProcess.ts`, new)

```ts
interface ReasonerProcessOptions {
  javaPath: string;
  jarPath: string;
  jvmArgs?: string[];   // default ['-Xmx4g']
  timeoutMs?: number;   // default 600_000
}

class ReasonerProcess {
  constructor(options: ReasonerProcessOptions);
  start(): Promise<void>;
  classify(format: string, content: string, engine?: string): Promise<ClassificationResult>;
  classifyFile(format: string, filePath: string, engine?: string): Promise<ClassificationResult>;
  checkConsistency(format: string, content: string): Promise<ConsistencyResult>;
  dlQuery(format: string, content: string | null, filePath: string | null, classExpression: string, queryTypes: string[], engine?: string): Promise<DLQueryResult>;
  convertFormat(content: string, fromFormat: string, toFormat: string): Promise<string>;
  validateExpression(expression: string): Promise<{ valid: boolean; error?: string }>;
  isReady(): boolean;
  dispose(): void;
}
```

Every method signature and return type is copied verbatim from today's `ReasonerBridge` — this is
an extraction, not a redesign. The only behavioral difference: none of these methods read
`vscode.workspace.getConfiguration(...)` or update a status bar/output channel; all configuration
arrives via the constructor.

## `ReasonerBridge` compatibility contract (`src/reasoner/ReasonerBridge.ts`, thinned)

- **Public API**: unchanged — same class name, same constructor signature
  (`constructor(private extensionPath: string)`), same public methods with the same signatures.
- **Behavior**: unchanged — status bar text transitions (`idle` → `starting…` → `ready`/`failed`,
  `Classifying…` → `Consistent`/`Inconsistent (...)`/`Reasoning failed`), output channel logging
  of stderr lines, and error messages shown via `vscode.window.showErrorMessage` all continue
  exactly as today.
- **Internal**: `start()`, `classify()`, etc. now resolve `javaPath`/`jvmArgs`/`timeoutMs` from
  `vscode.workspace.getConfiguration('ontograph.reasoner')` and `jarPath` from
  `path.join(this.extensionPath, 'java-server', 'target', 'onto-reasoner-server.jar')` — identical
  values to today — construct a `ReasonerProcess`, and delegate to it.
- **Verification**: this is a pure refactor. `src/reasoner/ReasonerBridge.test.ts`'s existing
  tests (request-shape assertions, error propagation) must continue to pass completely unchanged,
  proving the public contract held.

## `cli-standalone`'s use of `ReasonerProcess`

```ts
const runtimeDir = path.join(__dirname, 'runtime'); // bundled at build time
const process = new ReasonerProcess({
  // Verified against the real, fetched Temurin macOS arm64 JRE tarball (not assumed): its
  // top-level directory extracts to an app-bundle-style layout, Contents/Home/, NOT a flat
  // bin/ directly under the extracted directory.
  javaPath: path.join(runtimeDir, 'jre', 'Contents', 'Home', 'bin', 'java'),
  jarPath: path.join(runtimeDir, 'onto-reasoner-server.jar'),
});
```

**Critical, discovered during implementation**: every standalone command MUST call
`reasonerProcess.dispose()` in a `finally` block after its single request completes (success or
failure). Without this, the spawned JVM's open stdin/stdout pipes keep the wrapping Node
process's event loop alive indefinitely — the command's JSON result is still written correctly,
but the CLI process itself never exits, hanging forever (or until killed) instead of behaving like
a normal one-shot CLI invocation. This is unlike `ReasonerBridge` in the VS Code extension, which
deliberately keeps its `ReasonerProcess` alive across many requests for the lifetime of the editor
session and disposes it only on extension deactivation — the standalone CLI's lifecycle is the
opposite (one request per process), so it must dispose immediately rather than reuse.

If `javaPath` does not exist or fails to spawn, the standalone command reports `RUNTIME_UNAVAILABLE`
(see `standalone-cli-commands.md`) rather than letting `ReasonerProcess.start()`'s underlying
`child_process` error surface as an unhandled/opaque failure.

## Packaging contract (`cli-standalone/`)

- `scripts/fetch-runtime.mjs` downloads the Eclipse Temurin 21 (macOS arm64) JRE archive into a
  gitignored local cache, verifies it (checksum), and extracts it to `dist/runtime/jre/` as part of
  `npm run build`, before `esbuild.mjs` bundles `src/main.ts`.
- `npm run build` also copies `java-server/target/onto-reasoner-server.jar` (built separately via
  `mvn clean package`, unchanged) to `dist/runtime/onto-reasoner-server.jar`.
- `package.json`'s `files` field includes `dist/` (JS bundle + `runtime/` subdirectory) so both
  ship inside the published tarball — no fetch step at `npm install` time.
- If `mvn clean package` or `fetch-runtime.mjs` hasn't been run, `npm run build` fails loudly at
  build time (a missing runtime must never silently ship an empty/broken package).
