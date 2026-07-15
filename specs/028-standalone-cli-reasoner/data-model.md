# Data Model: Standalone CLI Reasoner (Bundled Runtime)

No persistent storage is involved. The entities below are the in-process shapes and packaging
artifacts this feature introduces or reuses.

## ReasonerProcess (NEW — `src/reasoner/ReasonerProcess.ts`)

The extracted, VS-Code-API-free JSON-RPC-over-stdio client. Constructor options (all explicit —
no `vscode` config lookups, no `extensionPath`):

| Field | Type | Notes |
|---|---|---|
| `javaPath` | `string` | Path to the `java` executable to spawn — a system path (extension's use) or the bundled runtime's own binary (standalone CLI's use) |
| `jarPath` | `string` | Path to `onto-reasoner-server.jar` — the extension's existing on-disk copy, or the standalone package's bundled copy |
| `jvmArgs` | `string[]` | Default `['-Xmx4g']`, matching today's `ReasonerBridge` default |
| `timeoutMs` | `number` | Default matching today's 600s (`timeoutSeconds` config default × 1000) |

Public methods mirror `ReasonerBridge`'s request methods exactly (same signatures, same return
types — `ClassificationResult`, `ConsistencyResult`, `DLQueryResult`, etc.), minus any status-bar
side effects: `start()`, `classify()`, `classifyFile()`, `checkConsistency()`, `dlQuery()`,
`convertFormat()`, `validateExpression()`, `dispose()`.

## ReasonerBridge (THINNED — `src/reasoner/ReasonerBridge.ts`)

Unchanged public API and behavior (spec FR-005 — the VS Code extension must not regress).
Internally, it now: (1) resolves `javaPath`/`jvmArgs`/`timeoutMs` from
`vscode.workspace.getConfiguration('ontograph.reasoner')` and `jarPath` from `extensionPath`
exactly as before; (2) constructs a `ReasonerProcess` with those options; (3) delegates every
request method to it; (4) still owns and updates the status bar item / output channel around each
call.

## Standalone Command Set (NEW — `cli-standalone/src/commands/`)

| Command | Input | Behavior |
|---|---|---|
| `classify <file>` | local ontology file path | Parse via `ParserRegistry`, then `ReasonerProcess.classify(model.sourceFormat, content, engine)` — same `ClassificationResult` shape the minimal CLI's `classify` already returns |
| `check-consistency <file>` | local ontology file path | Parse, then `ReasonerProcess.checkConsistency(...)` — same `ConsistencyResult` shape |
| `dl-query <file> <expression> [--types] [--filter]` | local file + DL expression + feature-027 options | Parse, then `ReasonerProcess.dlQuery(...)` with `queryTypes` from `parseQueryTypes()`; label filter applied client-side via `matchesLabelFilter()`, identical to the minimal CLI's `dl-query` (feature 027) |

All three reuse the existing `writeResult`/`writeError`/`exitCode` envelope (`cli/src/output.ts`,
imported as-is — no changes to that module).

## Shared Core Command Registration (NEW — `cli/src/registerCoreCommands.ts`)

```ts
export function registerCoreCommands(program: Command): void
```

Registers `parse`/`search`/`validate`/`convert`/`stats`/`entity-info` exactly as
`cli/src/main.ts` does today (same options, same `run*` calls). Both `cli/src/main.ts` and
`cli-standalone/src/main.ts` call this one function — this is the mechanism that makes spec
FR-012 (command parity) hold structurally rather than by convention.

## Bundled Runtime Artifact (packaging, not a runtime data type)

| Item | Source | Where it lives in the published package |
|---|---|---|
| Java runtime | Eclipse Temurin 21, macOS arm64 build, fetched at build time (`scripts/fetch-runtime.mjs`) | `cli-standalone/dist/runtime/jre/` |
| Reasoner JAR | `java-server/target/onto-reasoner-server.jar` (built via `mvn clean package`, unchanged) | `cli-standalone/dist/runtime/onto-reasoner-server.jar` |

Neither artifact is committed to git (both are build outputs / fetched archives, consistent with
this repo's existing `.gitignore` treatment of `java-server/target/`); both are populated
immediately before `npm publish` and included via `cli-standalone/package.json`'s `files` field.

## Error Codes (new, standalone-specific — additive to `cli/src/output.ts`'s existing set)

| Condition | `errorCode` | Notes |
|---|---|---|
| Bundled runtime missing/corrupted for the current platform | `RUNTIME_UNAVAILABLE` | New — no equivalent exists in the minimal CLI, since it never ships a runtime |
| Current platform has no bundled runtime at all | `PLATFORM_UNSUPPORTED` | New — surfaced at first command invocation; ideally also caught by the platform-specific package mechanism at install time (see `contracts/`) |

All other error conditions (`FILE_NOT_FOUND`, `PARSE_ERROR`, `INVALID_ARGS`, etc.) reuse the
existing codes/exit codes unchanged.
