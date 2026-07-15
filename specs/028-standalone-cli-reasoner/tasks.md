---

description: "Task list for Standalone CLI Reasoner (Bundled Runtime)"
---

# Tasks: Standalone CLI Reasoner (Bundled Runtime)

**Input**: Design documents from `/specs/028-standalone-cli-reasoner/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. This repo's `conductor/workflow.md` mandates a Red→Green TDD cycle per task and
Constitution Principle IV ("Test-First Integration") requires new logic be decomposed into small,
directly-testable functions with failing tests written first — this is explicitly called out in
`plan.md`'s Constitution Check. The two build-orchestration tasks (T020 `fetch-runtime.mjs`, T021
`esbuild.mjs`) are the exception: they primarily drive external I/O (network download, archive
extraction, bundling) that isn't meaningfully unit-testable in isolation — they're instead verified
via T023's packaging test and the quickstart's manual build validation, matching how this repo has
treated pure build/config tasks in prior features (e.g. feature 026's `esbuild.mjs` bundle task).

**Organization**: Tasks are grouped by user story (from `spec.md`) to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to US1, US2, US3, or US4 from `spec.md`
- Every task names its exact file path

## Path Conventions

Single monorepo (this repo). Paths are repo-relative from `/Users/yoga/JavaApp/OntoGraph-lite/`,
per `plan.md`'s Project Structure: this feature adds a new sibling package `cli-standalone/` and
extracts `src/reasoner/ReasonerProcess.ts` out of the existing `src/reasoner/ReasonerBridge.ts`;
`cli/` gains one new shared file (`registerCoreCommands.ts`) but its published behavior is
unchanged.

---

## Phase 1: Setup

**Purpose**: Scaffold the new sibling package before any shared extraction or new logic lands.

- [X] T001 Confirm the pre-feature baseline is green: `mvn clean package` in `java-server/`
      (produces `onto-reasoner-server.jar`, reused unmodified by this feature), root
      `npm run compile`/`npm test`, and `pnpm --filter ontograph-cli build`/`test`. This baseline
      is what US3's "minimal package unaffected" regression checks (T012, T028) compare against.
- [X] T002 [P] Add `cli-standalone` to the `packages` list in `pnpm-workspace.yaml` (alongside the
      existing `.` and `cli` entries) so `pnpm --filter ontograph-cli-standalone` commands work
      like they already do for `cli/`.
- [X] T003 [P] Scaffold `cli-standalone/`: `package.json` (name `@ysgao/ontograph-cli-standalone`,
      `bin: { ontograph: "dist/main.js" }`, `engines.node >=18`, dependencies mirroring `cli/`'s
      `commander`/`esbuild`/`typescript`/`vitest`/`@types/node`), `tsconfig.json` (mirroring
      `cli/tsconfig.json`'s `@core/* → ../src/*` path alias), an empty `src/main.ts`, an empty
      `esbuild.mjs`, and a `tests/` directory — no real logic yet, per `plan.md`'s Project
      Structure.
- [X] T004 [P] Add a `.gitignore` entry for `cli-standalone`'s vendored-runtime download cache
      (e.g. `cli-standalone/.runtime-cache/`) — `dist/` is already covered by the repo's existing
      global `dist/` pattern, so `cli-standalone/dist/runtime/` needs no separate entry.

**Checkpoint**: `cli-standalone/` exists as an empty, buildable shell; baseline confirmed green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract the two pieces of shared infrastructure every user story depends on — the
VS-Code-free reasoner client (`ReasonerProcess`) and the shared command registration
(`registerCoreCommands`) — verifying both are pure, behavior-preserving extractions before any
new standalone-specific logic is built on top.

**⚠️ CRITICAL**: No user story task in Phase 3+ may begin until this phase is complete.

- [X] T005 [P] Write failing tests for the new `ReasonerProcess` class in
      `src/reasoner/ReasonerProcess.test.ts`: constructor accepts explicit
      `{javaPath, jarPath, jvmArgs?, timeoutMs?}` (no `vscode` import anywhere in the test file);
      `classify`/`classifyFile`/`checkConsistency`/`dlQuery`/`convertFormat`/`validateExpression`
      send the correct JSON-RPC request shape and resolve/reject correctly; the >512KB
      content-to-temp-file substitution behavior is preserved. Mock `child_process`/`fs`/
      `readline` the same way `src/reasoner/ReasonerBridge.test.ts` already does, but do NOT mock
      `vscode` at all — proving the class has no dependency on it.
- [X] T006 Implement `src/reasoner/ReasonerProcess.ts` (extracting the
      spawn/readline-framing/pending-request-map/temp-file logic out of today's
      `ReasonerBridge.ts`, per `research.md` Decision 1 and
      `contracts/reasoner-process-extraction.md`) to make T005 pass — depends on T005
- [X] T007 Update `src/reasoner/ReasonerBridge.ts` to become a thin wrapper: resolve
      `javaPath`/`jvmArgs`/`timeoutMs` from `vscode.workspace.getConfiguration('ontograph.reasoner')`
      and `jarPath` from `extensionPath` exactly as today, construct an internal `ReasonerProcess`,
      and delegate every request method to it while keeping the status bar/output channel updates
      exactly as they are today — depends on T006
- [X] T008 Run `src/reasoner/ReasonerBridge.test.ts`'s existing (unmodified) test suite and confirm
      every test still passes with no changes to the test file itself — this is the regression
      proof that the extraction preserved `ReasonerBridge`'s public API/behavior byte-for-byte
      (spec FR-005, `contracts/reasoner-process-extraction.md`'s compatibility contract) — depends
      on T007
- [X] T009 [P] Write failing tests for a new `registerCoreCommands(program)` export in
      `cli/tests/registerCoreCommands.test.ts`: given a fresh `Command` instance, calling
      `registerCoreCommands(program)` registers exactly `parse`, `search`, `validate`, `convert`,
      `stats`, and `entity-info` with their existing options (e.g. assert
      `program.commands.map(c => c.name())` contains all six)
- [X] T010 Implement `cli/src/registerCoreCommands.ts` by extracting the six
      file-based command registrations out of `cli/src/main.ts` verbatim (same options,
      descriptions, and `run*` calls) to make T009 pass — depends on T009
- [X] T011 Refactor `cli/src/main.ts` to call `registerCoreCommands(program)` instead of inlining
      the six registrations, then register its own existing bridge commands
      (`classify`/`check-consistency`/`dl-query`, unchanged) as before — depends on T010
- [X] T012 Run the full existing `cli/` test suite (`pnpm --filter ontograph-cli test`) and confirm
      an identical pass count to the T001 baseline — the regression proof that refactoring
      `main.ts` changed nothing observable (spec US3/FR-005) — depends on T011

**Checkpoint**: `ReasonerProcess` extracted and proven behavior-preserving; `registerCoreCommands`
extracted and proven behavior-preserving. User story implementation can begin.

---

## Phase 3: User Story 1 - Run reasoning commands without VS Code (Priority: P1) 🎯 MVP

**Goal**: The standalone package's `classify`/`check-consistency`/`dl-query` commands reason
directly against a local ontology file using a bundled runtime, with no VS Code involved at all.

**Independent Test**: With no VS Code running, run each of the three standalone reasoning commands
against a local ontology file and get valid results.

### Tests for User Story 1

- [X] T013 [P] [US1] Write failing tests for `standaloneClassifyCommand.ts` in
      `cli-standalone/tests/standaloneClassify.test.ts`: mocking `ReasonerProcess` (not spawning a
      real JVM) — file-not-found and parse-error paths behave like `cli/`'s own `parse` command;
      a successful call returns the same `ClassificationResult` shape the minimal CLI's `classify`
      returns; omitting `--reasoner` calls `ReasonerProcess.classify(...)` with `'elk'` (not
      `'auto'`); an explicit `--reasoner hermit`/`--reasoner auto` passes that value through
      unchanged
- [X] T014 [P] [US1] Write failing tests for `standaloneConsistencyCommand.ts` in
      `cli-standalone/tests/standaloneConsistency.test.ts`, mirroring T013's structure for
      `ConsistencyResult`
- [X] T015 [P] [US1] Write failing tests for `standaloneDlQueryCommand.ts` in
      `cli-standalone/tests/standaloneDlQuery.test.ts`: reuses `parseQueryTypes`/
      `InvalidQueryTypeError` (`cli/src/commands/bridge/dlQueryTypes.ts`) and `matchesLabelFilter`
      (`src/utils/dlQueryLabelFilter.ts`) exactly as feature 027's `dlQueryCommand.test.ts` does —
      `--types`/`--filter` behave identically, just against a mocked `ReasonerProcess.dlQuery(...)`
      instead of a mocked bridge-socket `send(...)`

### Implementation for User Story 1

- [X] T016 [US1] Implement `cli-standalone/src/commands/standaloneClassifyCommand.ts` (resolve
      path → read file → `ParserRegistry.parse(text, 'auto', absPath)` →
      `ReasonerProcess.classify(model.sourceFormat, text, reasoner)` →
      `writeResult`/`writeError`/`exitCode`, per `research.md` Decision 4) to make T013 pass; the
      command's own `--reasoner` option (see T019) defaults to `'elk'` when omitted — NOT the
      underlying `ReasonerProcess.classify()` parameter's own `'auto'` default — a deliberate,
      explicit CLI-level choice (per `contracts/standalone-cli-commands.md`) — depends on T013, T007
- [X] T017 [US1] Implement `cli-standalone/src/commands/standaloneConsistencyCommand.ts` (same
      shape as T016, calling `ReasonerProcess.checkConsistency`) to make T014 pass — depends on
      T014, T007
- [X] T018 [US1] Implement `cli-standalone/src/commands/standaloneDlQueryCommand.ts` (same
      parse-then-reason shape, plus `parseQueryTypes`/`matchesLabelFilter` per `research.md`
      Decision 5) to make T015 pass — depends on T015, T007
- [X] T019 [US1] Wire `classify <file> [--reasoner <hermit|elk|auto>]`, `check-consistency <file>`,
      and `dl-query <file> <expression> [--types <list>] [--filter <substring>]` into
      `cli-standalone/src/main.ts`, alongside its call to `registerCoreCommands(program)` — the
      `--reasoner` option (classify only, per `contracts/standalone-cli-commands.md`) defaults to
      `'elk'` when omitted — depends on T016, T017, T018, T011
- [X] T020 [US1] Implement `cli-standalone/scripts/fetch-runtime.mjs`: downloads the Eclipse
      Temurin 21 (macOS arm64) JRE archive into the gitignored local cache (T004), verifies it
      (checksum), and extracts it to `dist/runtime/jre/`, per `research.md` Decision 3 and
      `contracts/reasoner-process-extraction.md`'s packaging contract
- [X] T021 [US1] Implement `cli-standalone/esbuild.mjs`: bundles `src/main.ts` (same `@core` alias
      convention as `cli/esbuild.mjs`) and copies `java-server/target/onto-reasoner-server.jar`
      plus the fetched JRE (T020) into `dist/runtime/` as part of the build — depends on T020
- [X] T022 [US1] Point the standalone commands' `ReasonerProcess` construction at
      `dist/runtime/jre/bin/java` and `dist/runtime/onto-reasoner-server.jar`, resolved relative to
      the built package (e.g. via `__dirname`) — depends on T021, T019

**Checkpoint**: User Story 1 fully functional and independently testable — run `quickstart.md`'s
Story 1 steps.

---

## Phase 4: User Story 2 - Zero-dependency install (Priority: P1)

**Goal**: Installing the standalone package on its supported platform is the only setup step —
no separate Java install, no network fetch at install time (the runtime already ships inside the
published package).

**Independent Test**: On a clean machine/container with no Java installed anywhere, install the
standalone package and immediately run a classify command successfully.

### Tests for User Story 2

- [X] T023 [P] [US2] Write failing tests in `cli-standalone/tests/build.test.ts` asserting
      `cli-standalone/package.json`'s `files` field includes the `dist/` directory (which contains
      `runtime/` once built), and that `npm run build` fails loudly (non-zero exit, clear message)
      if `java-server/target/onto-reasoner-server.jar` or the fetched JRE aren't present yet —
      per `contracts/reasoner-process-extraction.md`'s "must never silently ship an
      empty/broken package" packaging contract
- [X] T024 [P] [US2] Write failing tests asserting the new `RUNTIME_UNAVAILABLE` (13) and
      `PLATFORM_UNSUPPORTED` (14) error paths: constructing a standalone command with a
      deliberately nonexistent `javaPath` reports `RUNTIME_UNAVAILABLE` (not a raw crash/hang), and
      an explicit "no bundled runtime for this platform" check reports `PLATFORM_UNSUPPORTED`.
      Also add a negative test for FR-004: with a real, working `java` executable present
      elsewhere on `process.env.PATH` (simulate by pointing `PATH` at a directory containing a
      fake/executable `java` stub that would produce different, detectable output if invoked),
      confirm the standalone command's constructed `ReasonerProcess` still only ever uses the
      bundled `javaPath` — never a bare `'java'` or any `PATH`-resolved value — proving the "MUST
      NOT search for or depend on a system `java`" guarantee, not just assert it by omission

### Implementation for User Story 2

- [X] T025 [US2] Add `RUNTIME_UNAVAILABLE: 13` and `PLATFORM_UNSUPPORTED: 14` to the standalone
      package's exit-code mapping (mirroring `cli/src/output.ts`'s `EXIT_CODES`, per
      `data-model.md`'s new error codes table) to make T024 pass — depends on T024
- [X] T026 [US2] Wire the standalone commands (T016-T018) to catch `ReasonerProcess` spawn
      failures and report `RUNTIME_UNAVAILABLE`, and to check the bundled runtime's presence for
      the current platform up front, reporting `PLATFORM_UNSUPPORTED` when absent — depends on
      T025, T022
- [X] T027 [US2] Finalize `cli-standalone/package.json`'s `files`/`bin`/`publishConfig` fields per
      `contracts/standalone-cli-commands.md` and the packaging contract, to make T023 pass —
      depends on T023, T021

**Checkpoint**: User Stories 1 and 2 both independently functional — run `quickstart.md`'s Story 2
steps (ideally on a clean/offline machine).

---

## Phase 5: User Story 3 - The minimal CLI package is completely unaffected (Priority: P2)

**Goal**: `cli/`'s existing behavior — including its VS-Code-attached
`classify`/`check-consistency`/`dl-query` — shows zero change after this feature ships.

**Independent Test**: With the minimal CLI package installed and VS Code running with OntoGraph
active, confirm every existing command behaves identically to before this feature shipped.

### Verification for User Story 3

- [X] T028 [P] [US3] Re-run feature 027's own `quickstart.md` (Stories 1–3, the minimal CLI's
      classify-first/`--types`/`--filter` behavior) as an explicit regression gate for this
      feature — confirms the `ReasonerBridge`/`main.ts` refactors (T007, T011) didn't change
      anything a real invocation would observe, beyond what T008/T012's automated suites already
      cover
- [X] T029 [US3] Confirm `cli/package.json` has zero diff from the T001 baseline (`git diff
      cli/package.json` against the pre-feature commit is empty) — the minimal package's
      published manifest itself must be untouched, per spec FR-005

**Checkpoint**: User Stories 1, 2, and 3 all independently functional.

---

## Phase 6: User Story 4 - Future commands stay available in both packages (Priority: P2)

**Goal**: `registerCoreCommands` is structurally the single source for the shared command set —
proven by a guard test and a manual smoke test, not just asserted by convention.

**Independent Test**: Add a new command after this feature ships and confirm it becomes usable
from both packages without a second, package-specific implementation effort.

### Tests for User Story 4

- [X] T030 [P] [US4] Write a static "no duplicate registration" guard test (mirroring
      `src/uml/noExternalDependency.test.ts`'s source-scan pattern) in
      `cli-standalone/tests/noDuplicateCommands.test.ts`: asserts `cli-standalone/src/main.ts`'s
      source contains no literal `.command('parse ...')`-style registration of any of the six
      shared command names — only a call to `registerCoreCommands`

### Verification for User Story 4

- [X] T031 [US4] Manual smoke test per `quickstart.md` Story 4: add a trivial new command to
      `cli/src/registerCoreCommands.ts`, rebuild both `cli/` and `cli-standalone/`, confirm the new
      command's `--help` text appears in both packages' output with no additional
      `cli-standalone/`-specific code, then revert the trivial addition — depends on T030, T021

**Checkpoint**: All four user stories independently functional — `quickstart.md` passes end to
end.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T032 [P] Review `contracts/standalone-cli-commands.md` and
      `contracts/reasoner-process-extraction.md` against the actual implementation from Phases
      2–6; correct any drift discovered along the way
- [X] T033 [P] Add a one-line pointer entry for `028-standalone-cli-reasoner` to `CLAUDE.md`'s
      `## Recent Changes` section, matching the established thin-pointer convention
- [X] T034 [P] Write `cli-standalone/README.md` documenting installation and usage, mirroring
      `cli/README.md`'s conventions and noting the macOS-arm64-only scope for this release
- [X] T035 Run full regression: root `npm run compile`/`npm test`, `pnpm --filter ontograph-cli
      build`/`test`, and `pnpm --filter ontograph-cli-standalone build`/`test` — confirm no
      regressions across all three
- [ ] T036 Run `quickstart.md` end to end on a real macOS Apple Silicon machine, ideally a clean
      VM/container with no Java installed, to confirm true zero-dependency install and reasoning
      (spec SC-001, SC-003)
- [X] T037 [P] Add an automated, skippable-if-absent SNOMED-scale benchmark test (e.g.
      `cli-standalone/tests/standaloneClassify.anatomy.test.ts`), mirroring feature 027's own
      `src/reasoner/dlQueryOrchestration.anatomy.test.ts` precedent: run the built standalone
      `classify` (or `dl-query`) command against the real `test-ontologies/anatomy.owl` (skipped
      automatically when that file or the built `dist/runtime/` aren't present) and assert
      completion time is the same order of magnitude as feature 027's own anatomy.owl benchmark —
      closing the gap where spec FR-011/SC-005 (SNOMED-scale performance parity) previously relied
      only on the manual T036 check — depends on T022, T026

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational and User Story 1 (it packages/hardens what
  US1 built — T025/T026 wire error handling into the same commands T016-T018 implement, and T027
  finalizes the same `package.json`/`esbuild.mjs` T003/T021 started)
- **User Story 3 (Phase 5)**: Depends on Foundational only (it's a regression check on T007/T011,
  independent of US1/US2's new standalone-specific code)
- **User Story 4 (Phase 6)**: Depends on Foundational only (it verifies T010/T011's own mechanism);
  independent of US1/US2/US3
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (`ReasonerProcess`, `registerCoreCommands`)
- **US2 (P1)**: Depends on Foundational and US1 (hardens/packages US1's commands and build)
- **US3 (P2)**: Depends on Foundational only — no dependency on US1/US2/US4
- **US4 (P2)**: Depends on Foundational only — no dependency on US1/US2/US3

### Within Each User Story

- Tests written and confirmed failing before their corresponding implementation task (T013-T015
  before T016-T018; T023-T024 before T025-T027; T030 is itself the verification, no separate
  implementation task follows it), per this repo's mandatory Red→Green workflow
  (`conductor/workflow.md`)
- `ReasonerProcess`/`registerCoreCommands` extraction (Foundational) before anything that imports
  them

### Parallel Opportunities

- T002, T003, T004 (Setup) — different files, run in parallel
- T005, T009 (Foundational tests) — different files/subsystems (`ReasonerProcess` vs.
  `registerCoreCommands`), run in parallel; each task's own implementation (T006, T010) must wait
  for its own test
- T013, T014, T015 (US1 tests) — different files, run in parallel
- T023, T024 (US2 tests) — different files, run in parallel
- Once Foundational completes, US3 (Phase 5) and US4 (Phase 6) have no dependency on US1/US2 and
  can proceed in parallel with them if staffed
- T032, T033, T034 (Polish) — different files, run in parallel; T035/T036 should run after all
  other Polish and user-story tasks land

---

## Parallel Example: Foundational

```bash
# Launch both Foundational extraction test-writing tasks together:
Task: "Write failing tests for ReasonerProcess in src/reasoner/ReasonerProcess.test.ts"
Task: "Write failing tests for registerCoreCommands in cli/tests/registerCoreCommands.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md`'s Story 1 steps against a local build (a locally
   fetched runtime is enough to validate US1 even before US2's packaging polish lands)
5. Demo: `ontograph classify <file>` reasons successfully with no VS Code running

### Incremental Delivery

1. Setup + Foundational → `ReasonerProcess`/`registerCoreCommands` extracted, both proven
   behavior-preserving
2. User Story 1 → validate independently → standalone reasoning MVP demoable (locally built)
3. User Story 2 → validate independently → true zero-dependency install demoable
4. User Story 3 → validate independently → minimal package regression-free
5. User Story 4 → validate independently → command-parity mechanism proven structurally
6. Polish → contract review, `CLAUDE.md` pointer, README, full regression, real-machine quickstart

### Parallel Team Strategy

With multiple developers, once Foundational (Phase 2) is done: Developer A takes US1 (Phase 3)
followed by US2 (Phase 4, which depends on US1); Developer B takes US3 (Phase 5) and Developer C
takes US4 (Phase 6) in parallel with A/B, since neither depends on US1/US2.

---

## Notes

- [P] tasks touch different files with no unmet dependencies
- [Story] labels trace every Phase 3+ task back to spec.md's US1/US2/US3/US4
- Tests are written and confirmed failing before their corresponding implementation task, per this
  repo's mandatory Red→Green workflow (`conductor/workflow.md`), except T020/T021 (see the Tests
  note at the top of this document)
- Commit after each task or logical group
- Avoid: vague tasks, same-file conflicts within a `[P]` group, and cross-story dependencies beyond
  the ones explicitly called out above
