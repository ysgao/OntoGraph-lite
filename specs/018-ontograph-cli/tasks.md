# Tasks: OntoGraph CLI for AI Tools

**Input**: Design documents from `specs/018-ontograph-cli/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/cli-commands.md ✓, quickstart.md ✓

**Tests**: Included per plan.md TDD mandate and Constitution Principle IV (Test-First Integration).

**User Story Map**:
- **US1** (P1): Standalone Ontology Analysis — parse, search, validate, convert (no VS Code)
- **US2** (P2): Workspace-Aware Reasoning via Extension Bridge — classify, check-consistency, dl-query
- **US3** (P3): Independent Package Installation — publish config, VSIX exclusion verification
- **US4** (P4): Structured Help and Discoverability — --help, no-args usage

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no conflicting writes)
- **[Story]**: User story this task belongs to (US1–US4)
- Exact file paths in all descriptions

---

## Phase 1: Setup (Workspace & CLI Scaffold)

**Purpose**: Convert project to pnpm workspace; scaffold `cli/` package; wire VSIX exclusion. Required before any user story work.

- [X] T001 Add `pnpm-workspace.yaml` at repo root declaring packages `['.', 'cli']`
- [X] T002 Migrate extension from npm to pnpm: remove `package-lock.json`, run `pnpm install` from root, commit `pnpm-lock.yaml`
- [X] T003 Create `cli/` directory with `cli/package.json` (name: `ontograph-cli`, bin: `{ontograph: dist/main.js}`, engines: node>=18)
- [X] T004 [P] Create `cli/tsconfig.json` extending `../tsconfig.json`, adding `@core/*` → `../src/*` path alias, excluding `vscode` types
- [X] T005 [P] Create `cli/esbuild.mjs` bundler config producing `cli/dist/main.js` (Node CJS, bundle: true, platform: node)
- [X] T006 Update root `package.json` package script: add `--no-dependencies` flag to `vsce package` invocation
- [X] T007 Add `cli/` and `cli/node_modules/` to `.vscodeignore`
- [X] T042 Create `cli/vitest.config.ts` with `include: ['tests/**/*.test.ts']` and add `"test": "vitest run"` script to `cli/package.json` — required before any test task (T011+) can run

**Checkpoint**: `pnpm install` works from root; `cli/` directory present; VSIX build script updated; `pnpm --filter ontograph-cli test` runs without config error.

---

## Phase 2: Foundational (Shared CLI Infrastructure)

**Purpose**: Shared output utilities and commander entry point used by ALL commands. `OntoGraphApi` interface that bridges US2 to the extension. Must be complete before any command implementation.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [X] T008 Implement `cli/src/output.ts`: export `writeResult<T>(data: T, command: string, durationMs: number)` and `writeError(code: string, message: string, command: string, durationMs: number)` — both write one JSON line to stdout per `CliResponse<T>` shape in `data-model.md`
- [X] T009 Implement `cli/src/main.ts`: commander root program with global `--timeout` flag; register stub subcommands parse, search, validate, convert, classify, check-consistency, dl-query; set `process.exitCode` from command result
- [X] T010 Define `OntoGraphApi` interface in `src/api.ts`: methods `classify()`, `checkConsistency()`, `dlQuery(expression)`, `getActiveModel()`, `getActiveIndex()` with return types from `data-model.md`; update `src/extension.ts` `activate()` return type to `OntoGraphApi`

**Checkpoint**: `cli/src/output.ts` and `cli/src/main.ts` compile; `src/api.ts` compiles; `npm run compile` passes.

---

## Phase 3: User Story 1 — Standalone Ontology Analysis (Priority: P1) 🎯 MVP

**Goal**: AI tools can run parse, search, validate, and convert on any OWL file without VS Code.

**Independent Test**: `node cli/dist/main.js parse test-ontologies/animals.omn` outputs valid JSON with `success: true` and `data.classeCount > 0`; exit code 0.

### Tests for User Story 1 (write first — must FAIL before implementation)

- [X] T011 [P] [US1] Write failing test `cli/tests/core/parse.test.ts`: assert `parseCommand` returns `ParseResult` with correct `format`, `classeCount`, `ontologyIri` for `test-ontologies/animals.omn`; assert FILE_NOT_FOUND error for missing path
- [X] T012 [P] [US1] Write failing test `cli/tests/core/search.test.ts`: assert `searchCommand` returns `SearchResult` with matching `EntityMatch[]` for query "Animal" in `animals.omn`; assert empty results for unmatched query
- [X] T013 [P] [US1] Write failing test `cli/tests/core/validate.test.ts`: assert `validateCommand` returns `ValidateResult` with `valid: true` for `animals.omn`; assert `valid: false` with issues for a deliberately malformed fixture
- [X] T014 [P] [US1] Write failing test `cli/tests/core/convert.test.ts`: assert `convertCommand` converts `animals.omn` (Manchester) to `animals.ofn` (Functional); assert output file exists and parses back to same entity count

### Implementation for User Story 1

- [X] T015 [P] [US1] Implement `cli/src/commands/core/parseCommand.ts`: call `ParserRegistry.parse(filePath)`, build `ParseResult`, call `writeResult`; handle FILE_NOT_FOUND (exit 1) and PARSE_ERROR (exit 2)
- [X] T016 [P] [US1] Implement `cli/src/commands/core/searchCommand.ts`: call `ParserRegistry.parse`, build `OntologyIndex`, call `index.searchEntities(query)`, build `SearchResult`, call `writeResult`
- [X] T017 [P] [US1] Implement `cli/src/commands/core/validateCommand.ts`: call `ParserRegistry.parse`, collect parser errors/warnings into `ValidationIssue[]`, call `writeResult`
- [X] T018 [P] [US1] Implement `cli/src/commands/core/convertCommand.ts`: call `ParserRegistry.parse`, call `FunctionalSerializer` or appropriate serializer for target format, write output file, call `writeResult`
- [X] T019 [US1] Build `cli/dist/main.js` via `node cli/esbuild.mjs`; smoke-test all four core commands against `test-ontologies/animals.omn` and confirm JSON stdout + correct exit codes

**Checkpoint**: All T011–T014 tests pass. `ontograph parse`, `search`, `validate`, `convert` work end-to-end. US1 independently deliverable.

---

## Phase 4: User Story 2 — Workspace-Aware Reasoning via Extension Bridge (Priority: P2)

**Goal**: AI tools can classify ontology, check consistency, and run DL queries by calling CLI while VS Code + OntoGraph is active.

**Independent Test**: With VS Code open and an ontology loaded, `node cli/dist/main.js classify` outputs JSON with `success: true` and `data.classeCount > 0`; without VS Code running, same command outputs `success: false, errorCode: BRIDGE_UNAVAILABLE` within 2 seconds.

### Tests for User Story 2 (write first — must FAIL before implementation)

- [X] T020 [US2] Write failing test `cli/tests/bridge/bridgeClient.test.ts`: spin up a mock `net.Server` that reads NDJSON and writes a response; assert `bridgeClient.send({method:'classify', params:{}})` returns typed response; assert `BRIDGE_UNAVAILABLE` when no server running; assert `BRIDGE_TIMEOUT` when server hangs past timeout
- [X] T021 [P] [US2] Write failing test `cli/tests/bridge/classify.test.ts`: mock bridgeClient, assert `classifyCommand` calls `bridgeClient.send({method:'classify',...})` and calls `writeResult` with `ClassificationResult`
- [X] T022 [P] [US2] Write failing test `cli/tests/bridge/consistency.test.ts`: mock bridgeClient, assert `consistencyCommand` calls `{method:'checkConsistency'}` and `writeResult`
- [X] T023 [P] [US2] Write failing test `cli/tests/bridge/dlQuery.test.ts`: mock bridgeClient, assert `dlQueryCommand` passes `expression` param and calls `writeResult` with `DLQueryResult`

### Implementation for User Story 2

- [X] T041 [US2] Write failing test `cli/tests/bridge/bridgeServer.test.ts`: spin up a mock `OntoGraphApi` object; instantiate `BridgeServer`, call `start(mockApi)`, connect via `net.createConnection(socketPath)`, send NDJSON `{id, method:'classify', params:{}}`, assert response contains `{id, success:true, data:{...ClassificationResult}}`; assert `stop()` deletes lock file — **must complete before T026**

### Implementation for User Story 2

- [X] T024 [US2] Implement `cli/src/bridge/lockFile.ts`: export `readLockFile()` returning `BridgeLockFile | null` from OS-appropriate path; export `isAlive(pid)` using `process.kill(pid, 0)` for stale lock detection
- [X] T025 [US2] Implement `cli/src/bridge/bridgeClient.ts`: `send<T>(request: BridgeRequest): Promise<BridgeResponse<T>>`; reads lock file via `lockFile.ts`, checks PID liveness, connects via `net.createConnection(socketPath)`, writes NDJSON request, reads NDJSON response, handles timeout and connection errors with typed error codes
- [X] T026 [US2] Implement `src/bridge/BridgeServer.ts`: `net.createServer()` on OS socket path; accept NDJSON `BridgeRequest`, dispatch to `OntoGraphApi` methods, write NDJSON `BridgeResponse`; export `start(api: OntoGraphApi): Promise<void>` and `stop(): Promise<void>`; writes lock file on start, deletes on stop
- [X] T027 [US2] Wire `BridgeServer` into `src/extension.ts`: call `BridgeServer.start(api)` after constructing `OntoGraphApi` impl in `activate()`; call `BridgeServer.stop()` in `deactivate()`
- [X] T028 [P] [US2] Implement `cli/src/commands/bridge/classifyCommand.ts`: call `bridgeClient.send({method:'classify', params:{}})`, handle bridge error codes, call `writeResult` or `writeError`
- [X] T029 [P] [US2] Implement `cli/src/commands/bridge/consistencyCommand.ts`: same pattern with `{method:'checkConsistency'}`
- [X] T030 [P] [US2] Implement `cli/src/commands/bridge/dlQueryCommand.ts`: call `bridgeClient.send({method:'dlQuery', params:{expression}})`, call `writeResult`

**Checkpoint**: All T020–T023 tests pass. Bridge commands return `BRIDGE_UNAVAILABLE` within 2s without VS Code; return classification/consistency/DL results when extension running.

---

## Phase 5: User Story 3 — Independent Package Installation (Priority: P3)

**Goal**: `ontograph-cli` can be installed and used without VS Code or the VSIX package.

**Independent Test**: `npm pack` in `cli/`, install the `.tgz` in a temporary directory with no other dependencies, run `ontograph parse <file>` and confirm it works.

- [X] T031 [US3] Add publish config to `cli/package.json`: `files: ["dist/"]`, `publishConfig`, `peerDependencies: {}`, ensure no `vscode` in dep tree; add `cli/README.md` with install + usage instructions
- [X] T032 [US3] Integration test `cli/tests/integration/standalone-install.test.ts`: `npm pack` the cli package into a temp dir, run `node <tgz-bin> parse test-ontologies/animals.omn`, assert JSON output and exit 0
- [X] T033 [US3] Verify VSIX build: run `pnpm run package` from root, confirm `cli/` absent from VSIX artifact via `vsce ls`; assert VSIX size ≤ baseline (record baseline in `specs/018-ontograph-cli/vsix-baseline.txt`)

**Checkpoint**: CLI installs standalone. VSIX size unchanged. US3 independently testable.

---

## Phase 6: User Story 4 — Structured Help and Discoverability (Priority: P4)

**Goal**: Running `ontograph` with no args or `--help` gives AI tools and developers the full command listing.

**Independent Test**: `ontograph --help` stdout contains all 7 command names; `ontograph` (no args) exits with non-zero and prints usage.

- [X] T034 [P] [US4] Test `cli/tests/core/help.test.ts`: assert `ontograph --help` stdout includes parse, search, validate, convert, classify, check-consistency, dl-query; assert `ontograph <command> --help` includes required args and flag names
- [X] T035 [P] [US4] Test `cli/tests/core/noargs.test.ts`: assert `ontograph` with no subcommand exits non-zero and writes usage info (not a JSON error — help text is the exception to JSON-only stdout per FR-002)
- [X] T036 [US4] Ensure commander config in `cli/src/main.ts` shows correct help: all commands have `.description()`, required args documented, `--timeout` in global options; call `program.exitOverride()` so missing subcommand exits non-zero (commander default is exit 0); run T034/T035 until green

**Checkpoint**: Help output covers all commands. AI tools can self-describe available operations.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration across all stories, documentation, cleanup.

> **SC-004 DEFERRED**: SNOMED CT-scale performance benchmark (classify/dl-query <30s at ~350k classes) is deferred — no SNOMED snapshot in `test-ontologies/`. Track as a follow-on task once a SNOMED subset is available.

- [X] T037 [P] Integration tests `cli/tests/integration/core.test.ts`: run all four core commands against `test-ontologies/animals.omn`, `test-ontologies/bfo-core.ofn`, `test-ontologies/pizza.owl`; assert valid JSON and correct entity counts per file; assert `durationMs < 5000` per operation (SC-001)
- [X] T038 [P] Integration tests `cli/tests/integration/error-paths.test.ts`: assert FILE_NOT_FOUND, PARSE_ERROR, UNSUPPORTED_FORMAT, INVALID_ARGS produce correct errorCode in JSON + correct exit code
- [X] T039 Update `CLAUDE.md` section "Build Commands" with CLI commands: `pnpm --filter ontograph-cli build`, `pnpm --filter ontograph-cli test`, `pnpm run package`
- [X] T040 Update `AGENTS.md` with same CLI build commands; add architecture note about `cli/` package and `src/api.ts` + `src/bridge/BridgeServer.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No deps — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — no other story deps
- **Phase 4 (US2)**: Depends on Phase 2 — no dep on US1 (bridge client is independent of core commands)
- **Phase 5 (US3)**: Depends on Phase 3 (needs working parse command for install test) + Phase 1 (VSIX packaging)
- **Phase 6 (US4)**: Depends on Phase 2 (needs main.ts commands registered)
- **Phase 7 (Polish)**: Depends on Phase 3 + Phase 4

### User Story Dependencies

- **US1 (P1)**: Unblocked after Phase 2
- **US2 (P2)**: Unblocked after Phase 2 — parallel with US1
- **US3 (P3)**: Requires US1 complete (parse command needed for install test)
- **US4 (P4)**: Unblocked after Phase 2 — parallel with US1

### Within Each Phase

- TDD order: write test → confirm it fails → implement → confirm it passes
- `cli/vitest.config.ts` (T042) before any test task (T011+)
- Models/interfaces before services (T010 before T026/T027)
- `lockFile.ts` before `bridgeClient.ts` (T024 before T025)
- BridgeServer contract test (T041) before BridgeServer implementation (T026) — Constitution Principle IV
- `BridgeServer.ts` before wiring into `extension.ts` (T026 before T027)

---

## Parallel Opportunities

### Phase 1 (Setup)
```
T003, T004, T005 — parallel (separate new files)
T006, T007 — parallel (separate files)
```

### Phase 3 (US1)
```
T011, T012, T013, T014 — all test files, fully parallel
T015, T016, T017, T018 — all command files, fully parallel (after T008–T010 complete)
```

### Phase 4 (US2)
```
T021, T022, T023 — parallel mock tests
T028, T029, T030 — parallel bridge command implementations (after T025 complete)
```

### Phases 3 + 4 together (once Phase 2 done)
```
Phase 3 (US1) and Phase 4 (US2) can proceed in parallel — different file sets, no shared writes
```

---

## Implementation Strategy

### MVP (User Story 1 only — Phases 1–3)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational)
3. Complete Phase 3 (US1 — parse, search, validate, convert)
4. **STOP and VALIDATE**: `ontograph parse test-ontologies/pizza.owl` returns valid JSON
5. Usable by AI tools for core ontology analysis immediately

### Incremental Delivery

1. Phases 1–3 → MVP: core commands work standalone
2. Add Phase 4 (US2) → bridge commands work; VS Code + CLI integration complete
3. Add Phase 5 (US3) → npm publish ready; standalone install verified
4. Add Phase 6 (US4) → help/discoverability polished
5. Phase 7 → full integration test coverage

### Parallel Team Strategy

Once Phase 2 complete:
- Dev A: Phase 3 (US1 core commands)
- Dev B: Phase 4 (US2 bridge) — starts with `src/api.ts` and `BridgeServer.ts`
- Dev C: Phase 6 (US4 help) — only needs `main.ts` complete

---

## Notes

- `[P]` = different output files, safe to work in parallel
- TDD is mandatory per plan.md — each test task MUST be run and confirmed failing before its paired implementation task
- Constitution Principle IV: T020 (bridge contract test) MUST precede T025/T026 (bridge implementation)
- `src/api.ts` (T010) is the single source of truth for all bridged operation signatures — do not duplicate types in `BridgeServer.ts` or CLI commands
- Core commands import from `../src/` via `@core/*` aliases — never import from `vscode`
- All stdout is JSON; `--help` output is the only exception (goes to stdout as plain text via commander default)
