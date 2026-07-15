# Phase 0 Research: Standalone CLI Reasoner (Bundled Runtime)

No Technical Context items were left as `NEEDS CLARIFICATION` — the spec's own clarification
(platform scope, two-package split, command parity) resolved the open scope questions. The
decisions below resolve the *design* questions needed to implement the resolved spec against this
codebase's actual structure.

## Decision 1: Extract `ReasonerBridge`'s JSON-RPC core into a VS-Code-free `ReasonerProcess`

**Decision**: Pull the spawn/readline/pending-request-map/temp-file logic out of
`src/reasoner/ReasonerBridge.ts` into a new `src/reasoner/ReasonerProcess.ts` that takes explicit
constructor options (`javaPath`, `jarPath`, `jvmArgs`, `timeoutMs`) instead of reading
`vscode.workspace.getConfiguration(...)` or an `extensionPath` to derive them. `ReasonerBridge`
becomes a thin wrapper: it computes those options from VS Code config exactly as it does today,
owns the status bar/output channel UI, and delegates every actual request
(`classify`/`classifyFile`/`checkConsistency`/`dlQuery`/`convertFormat`/`validateExpression`) to an
internal `ReasonerProcess` instance.

**Rationale**: This is the only real coupling preventing reuse — confirmed by direct inspection of
`ReasonerBridge.ts`: every `vscode` touchpoint (constructor's `createStatusBarItem`/
`createOutputChannel`, `start()`'s `getConfiguration`/`showErrorMessage`, `request()`'s
`getConfiguration` for the timeout, and status-bar text updates scattered through the request
methods) is UI decoration, not core logic. `ReasonerBridge`'s public API and behavior stay
byte-for-byte identical (satisfies spec FR-005 for the extension side), while
`cli-standalone/` gets a reusable, directly-instantiable client with zero `vscode` import.

**Alternatives considered**:
- *Have the standalone package spawn its own ad-hoc `child_process.spawn` + manual JSON-RPC
  framing, independent of `ReasonerBridge`*: rejected — duplicates non-trivial logic (readline
  framing, the pending-request/timeout map, the >512KB temp-file substitution for large ontology
  content) that would then need to be kept in sync by hand between two implementations, directly
  the kind of drift spec FR-012 is meant to prevent (FR-012 is about CLI commands specifically, but
  the same drift risk applies one layer down to the reasoner client itself).
- *Leave `ReasonerBridge` as-is and have the standalone package import it directly, providing a
  fake/mock `vscode` module*: rejected — fragile (any new `vscode` API `ReasonerBridge` starts
  using later would silently break the standalone package), and conceptually backwards (the
  extension-only concerns should wrap the reusable core, not the other way around).

## Decision 2: Shared, single-source command registration for the file-based commands

**Decision**: Extract `cli/src/main.ts`'s six file-based command registrations
(`parse`/`search`/`validate`/`convert`/`stats`/`entity-info`) into a new exported function,
`registerCoreCommands(program: Command)`, in a new `cli/src/registerCoreCommands.ts`. Both
`cli/src/main.ts` (unchanged behavior) and the new `cli-standalone/src/main.ts` call this same
function, then each registers its own reasoning commands on top (VS-Code-attached for `cli/`,
bundled-runtime/file-based for `cli-standalone/`).

**Rationale**: Directly satisfies spec FR-012 ("a command added ... must become available in both
packages without a separate, package-specific implementation effort") *structurally*, not just by
convention/discipline — a new file-based command added to `registerCoreCommands()` automatically
appears in both packages' `--help` and behavior the next time each is built, with zero additional
work. `cli-standalone/`'s `tsconfig.json`/build already need the same `@core/*` → `../src/*` alias
`cli/` uses, so importing a sibling file from `../cli/src/registerCoreCommands` (or hoisting it
one level further, see Alternatives) is a small, natural extension of an already-established
cross-package import pattern in this monorepo.

**Alternatives considered**:
- *Duplicate the six `.command(...)` registrations in `cli-standalone/src/main.ts`, only sharing
  the underlying `run*` implementations*: rejected — this is exactly the "two hand-maintained
  forks that can silently drift" scenario FR-012 explicitly rules out; the commander wiring
  (options, descriptions, argument shapes) is exactly the part most likely to drift if duplicated.
- *Move `registerCoreCommands` (and the six command implementations) into a third, new shared
  package (e.g. `cli-core/`) that both `cli/` and `cli-standalone/` depend on*: a cleaner
  separation in the abstract, but a larger structural change (new package, new build/test
  wiring, updated publish process for the existing `cli/` package) for no behavioral gain over
  keeping the shared function inside `cli/` and having `cli-standalone/` import it directly —
  rejected as unnecessary churn; can be revisited later if a third consumer ever appears.

## Decision 3: The bundled runtime ships inside the published npm package tarball, not fetched at install time

**Decision**: `cli-standalone`'s build process downloads/vendors an Eclipse Temurin 21 JRE (macOS
arm64) into the package's own `dist/runtime/` directory as part of `npm run build`
(`scripts/fetch-runtime.mjs`, caching the downloaded archive outside git), and the published
package's `files` field includes that directory — so the JRE's bytes are already inside the
tarball a user downloads via `npm install`.

**Rationale**: Matches the user's own framing verbatim ("bundle a full JRE *with the npm
package*") and gives the strongest zero-dependency guarantee: works even with no network access
at `npm install` time (beyond fetching the package itself), and requires no separate download step
a user could forget or have blocked by a firewall. Java 21 matches `java-server/pom.xml`'s
`maven.compiler.release` (confirmed by inspection), and this machine's own installed JRE (used
throughout this session) is already Eclipse Temurin — a redistribution-friendly build explicitly
intended for exactly this kind of bundling.

**Alternatives considered**:
- *Download the JRE via a `postinstall` script at `npm install` time* (smaller published
  package): rejected for this feature — weaker zero-dependency guarantee (requires network access
  and a working postinstall step at install time; corporate/CI environments sometimes block
  `postinstall` network access entirely), and the user's own phrasing pointed at bundling inside
  the package itself.
- *A custom `jlink`-trimmed runtime instead of the full JRE tarball* (smaller, ~50-70MB vs.
  ~100MB+): deferred, not rejected — spec Assumptions explicitly call this an "implementation-level
  optimization, not a scope constraint," so the simpler full-JRE-tarball approach ships first;
  `jlink` trimming is a candidate follow-up once the simpler path is proven working.

## Decision 4: New standalone reasoning commands mirror the existing file-based commands' read/parse pattern, then hand off to `ReasonerProcess`

**Decision**: Each new standalone command (`standaloneClassifyCommand.ts`, etc.) follows the exact
shape `cli/src/commands/core/parseCommand.ts` already establishes — resolve the path, read the
file, `ParserRegistry.parse(text, 'auto', absPath)` — then, instead of just summarizing the parsed
model, passes `model.sourceFormat` and the file's content/path to a `ReasonerProcess` instance
constructed with the bundled runtime's `javaPath`/`jarPath`, and writes the result through the same
`writeResult`/`writeError`/`exitCode` conventions every other CLI command already uses.

**Rationale**: `model.sourceFormat` (populated by `ParserRegistry`) is already exactly the format
string the reasoner's JSON-RPC `classify`/`dlQuery` methods expect (confirmed:
`classifyOntology.ts`, the interactive VS Code command, passes `model.sourceFormat` straight
through to `bridge.classify(...)` today with no translation) — no new format-mapping logic is
needed. Reusing `ParserRegistry` directly (rather than re-parsing inside the reasoner call) keeps
the standalone commands' file-handling identical to every other CLI command's error behavior
(`FILE_NOT_FOUND`/`PARSE_ERROR`), satisfying spec FR-007's "same file formats" and the "same
structural error handling" edge case.

**Alternatives considered**:
- *Pass the raw file path straight to the reasoner without parsing it in the CLI first* (mirroring
  `ReasonerBridge.classifyFile`'s filePath variant, skipping a `ParserRegistry.parse` call
  entirely): rejected as the sole approach — the CLI still needs `ParserRegistry` to detect the
  format up front (to know what `format` string to send) and to produce a `PARSE_ERROR` before
  ever invoking the reasoner on a structurally invalid file, matching every other CLI command's
  behavior. The reasoner call itself can still use the efficient filePath-based JSON-RPC params
  (avoiding a large-content round trip), same as `classifyFile`/`dlQuery`'s existing filePath path.

## Decision 5: The standalone DL query command reuses feature 027's category/filter logic as-is

**Decision**: `standaloneDlQueryCommand.ts` imports `parseQueryTypes`/`InvalidQueryTypeError` from
`cli/src/commands/bridge/dlQueryTypes.ts` and the shared `matchesLabelFilter` from
`src/utils/dlQueryLabelFilter.ts` (both already VS-Code-API-free), applying them exactly as
`cli/src/commands/bridge/dlQueryCommand.ts` does today, just against a `ReasonerProcess.dlQuery(...)`
call instead of a bridge-socket round trip.

**Rationale**: Directly satisfies spec FR-008; both helpers already have zero VS Code dependency
(proven in feature 027 — `dlQueryTypes.ts` only imports `@core/views/DLQueryMessages`,
`dlQueryLabelFilter.ts` has no imports at all), so reusing them from a new package is the same
kind of cross-package import `cli-standalone/` already needs for `@core/*` generally.

**Alternatives considered**: Reimplementing the same parsing/filtering logic independently in
`cli-standalone/` — rejected as unnecessary duplication of already-shared, already-tested logic.

## Decision 6: No dedicated multi-format test coverage for the standalone commands themselves

**Decision**: `standaloneClassifyCommand.ts`/`standaloneConsistencyCommand.ts`/
`standaloneDlQueryCommand.ts`'s own tests (T013-T015) exercise a single ontology format fixture,
not all four formats spec FR-007 lists (OWL Functional Syntax, Manchester, OWL/XML, Turtle/
N-Triples).

**Rationale**: Format support is entirely `ParserRegistry`'s responsibility (`@core/parser/
ParserRegistry`) — the exact same dependency every other CLI command (`parse`, `search`,
`validate`, `convert`, `stats`, `entity-info`) already calls, and which already has its own
extensive, format-specific test coverage in the root `src/parser/` test suite. The standalone
reasoning commands add nothing format-specific on top of what `ParserRegistry.parse(text, 'auto',
absPath)` already resolves (per Decision 4) — re-testing all four formats again at the CLI command
layer would only be re-proving `ParserRegistry` itself, not this feature's own new logic. This is
an explicit, deliberate choice (per user direction), not an oversight — flagged and resolved during
`/speckit-analyze` review.

**Alternatives considered**: Adding fixtures for all four formats to T013 — rejected as redundant
test coverage; the parser's own test suite is the correct and sufficient place for format-specific
assertions.
