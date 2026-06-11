# Research: OntoGraph CLI for AI Tools

**Branch**: `018-ontograph-cli` | **Date**: 2026-06-11

## Decision 1: CLI-to-Extension Bridge Mechanism

**Decision**: IPC via OS-native socket — Unix domain socket (`/tmp/ontograph-lite-{pid}.sock`) on macOS/Linux, named pipe (`\\.\pipe\ontograph-lite`) on Windows. Message framing: newline-delimited JSON (NDJSON) over `net.Socket`.

**Rationale**:
- No port allocation or port-conflict risk; socket path is deterministic.
- OS-level access control: only processes running as the same user can connect to the socket.
- Node.js `net` module handles both Unix sockets and Windows named pipes with the same `net.createConnection(path)` API — no OS-specific branching in the client.
- Lower overhead than TCP: kernel-level IPC, no network stack.
- Discovery: Extension writes `{socketPath, pid, workspacePath}` to `~/.ontograph-lite/bridge.json` on `activate()`; deletes on `deactivate()`. CLI reads this file to locate the socket.

**Alternatives considered**:
- Localhost HTTP: No port-conflict risk with named sockets; HTTP adds unnecessary framing overhead for a single-client tool.
- VS Code's `vscode.window.showInformationMessage` IPC: Not reachable from external processes.
- stdin/stdout pipe to extension process: Extension is not spawned by CLI; it is already running inside VS Code.

---

## Decision 2: Monorepo Setup (pnpm Workspaces)

**Decision**: Add `pnpm-workspace.yaml` at project root; define `cli/` as a workspace package alongside the existing extension root.

**Rationale**:
- Least-disruption: Extension stays at root (`package.json`, `src/`, `esbuild.mjs`). Only a workspace declaration and a new `cli/` directory are added.
- pnpm workspace protocol (`workspace:*`) allows `cli/` to reference `../src/` files via TypeScript path aliases without publishing an intermediate package.
- VSIX is built with `vsce package --no-dependencies` to prevent bundling workspace-level node_modules from `cli/`. The `.vscodeignore` excludes `cli/` from VSIX artifact.

**Alternatives considered**:
- Separate `packages/core/` shared package: Clean isolation but adds a third publishable unit and a build step. Deferred — implement if CLI needs to be consumed by additional tools beyond the current scope.
- Keep single npm project with CLI as `cli/` subfolder: Works but no package boundary; `npm install` in root picks up CLI deps and may affect extension bundling.
- Separate Git repository: Unnecessary overhead for a tightly coupled tool.

---

## Decision 3: Shared Core — Import Strategy

**Decision**: CLI directly imports from `../src/parser/`, `../src/model/`, and `../src/serializer/` via TypeScript path aliases in `cli/tsconfig.json`. No new shared package.

**Rationale**:
- All parser, model, and serializer code is pure TypeScript with no `vscode` imports — safe to use in CLI context.
- Avoids adding a build step or publishing an internal package.
- Path aliases (`@core/*` → `../src/*`) keep import paths clean and refactoring cheap.
- esbuild for CLI bundle (`cli/esbuild.mjs`) resolves the aliases and produces a single portable `dist/main.js`.

**Guard against accidental vscode imports**: CLI tsconfig excludes `vscode` type definitions; any attempt to import `vscode` will produce a type error at compile time.

**Alternatives considered**:
- Copy-paste parser/model into `cli/src/`: Creates drift; rejected.
- Publish `src/` as an internal package: Future option if a third consumer appears.

---

## Decision 4: CLI Argument Parsing Library

**Decision**: Use `commander` (npm package) as the CLI argument parsing library in `cli/package.json`.

**Rationale**:
- Lightweight (~50 KB), zero transitive dependencies, TypeScript types included.
- AI tools can invoke commands in a standard `ontograph <command> [args] [flags]` format.
- The restriction on new runtime dependencies in CLAUDE.md applies to the **extension** package. The CLI is a separate package with its own `package.json` and dependency tree; its deps are NOT bundled into the VSIX.

**Alternatives considered**:
- `yargs`: More powerful but heavier; not needed for this command set.
- Hand-rolled `process.argv` parser: Avoids a dependency but reimplements flag parsing, negation, help generation. Unjustified for a non-trivial command set.

---

## Decision 5: CLI Output Format

**Decision**: Every CLI invocation writes **exactly one JSON object** to stdout and exits. Success: `{success: true, ...payload}`. Error: `{success: false, error: "...", code: "..."}`. Human-readable diagnostics go to stderr only.

**Rationale**:
- AI tools (Claude Code, Codex) parse stdout directly; any non-JSON prose breaks parsing.
- A top-level `success` boolean allows fast error detection without HTTP status codes.
- Stderr is ignored by most AI tool pipelines; writing informational messages there does not pollute the JSON stream.

---

## Decision 6: Extension Bridge Server Location

**Decision**: Bridge server code lives in `src/bridge/BridgeServer.ts` (within the extension `src/` directory). It is started in `activate()` and stopped in `deactivate()`.

**Rationale**:
- Bridge server needs access to `activeModel`, `activeIndex`, and `ReasonerBridge` — all module-level globals in `src/extension.ts`.
- Placing bridge code in `src/bridge/` follows the existing command-per-file convention in `src/commands/`.
- The bridge server is NOT imported by the CLI; it is only reachable at runtime via the IPC socket.

---

## Decision 7: Bridge Lock File Location

**Decision**: Lock file written to OS-appropriate config directory: `~/.ontograph-lite/bridge.json` (macOS/Linux), `%APPDATA%\ontograph-lite\bridge.json` (Windows). Stores `socketPath` (not a port number).

**Rationale**:
- `os.homedir()` is available in Node.js without extra deps.
- Using a user-scoped directory avoids permission issues and supports per-user multi-session use.
- `socketPath` is the absolute path to the Unix socket or Windows named pipe.
- `pid` field allows CLI to detect stale locks (extension crashed without cleanup) by checking `process.kill(pid, 0)` — if PID is dead, lock file and socket are stale and should be ignored.

---

## Decision 8: Extension Typed API Export from activate()

**Decision**: `activate()` in `src/extension.ts` returns an `OntoGraphApi` object defined in `src/api.ts`. `BridgeServer` receives this object and routes IPC socket requests to its methods. Other VS Code extensions can consume the typed API directly via `vscode.extensions.getExtension('...').exports`.

**Rationale**:
- VS Code's extension activation API supports typed exports: `activate()` can return any object, and other extensions retrieve it via `vscode.extensions.getExtension(id).exports as OntoGraphApi`.
- Single interface definition (`OntoGraphApi`) serves two consumers: (1) other VS Code extensions calling methods synchronously in-process, (2) the CLI calling the same methods via the IPC socket bridge.
- Decouples the bridge transport from the business logic: `BridgeServer` is a thin adapter, not the owner of functionality.
- Makes the extension's public surface explicit and type-checked at compile time.

**OntoGraphApi shape** (defined in `src/api.ts`):
- `classify(): Promise<ClassificationResult>`
- `checkConsistency(): Promise<ConsistencyResult>`
- `dlQuery(expression: string): Promise<DLQueryResult>`
- `getActiveModel(): OntologyModel | null`
- `getActiveIndex(): OntologyIndex | null`

**Alternatives considered**:
- BridgeServer owns the logic directly: couples transport to business logic; forces CLI-only consumers; no typed surface for extension-to-extension use.
- Separate service class without activate() export: Equivalent but loses the standard VS Code discovery mechanism (`getExtension().exports`).
