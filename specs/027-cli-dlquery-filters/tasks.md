---

description: "Task list for CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering"
---

# Tasks: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

**Input**: Design documents from `/specs/027-cli-dlquery-filters/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. This repo's `conductor/workflow.md` mandates a Red→Green TDD cycle per task and
Constitution Principle IV ("Test-First Integration") requires new logic be decomposed into small,
directly-testable functions with failing tests written first — this is explicitly called out in
`plan.md`'s Constitution Check.

**Organization**: Tasks are grouped by user story (from `spec.md`) to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to US1, US2, or US3 from `spec.md`
- Every task names its exact file path

## Path Conventions

Single project (this repo). Paths are repo-relative from `/Users/yoga/JavaApp/OntoGraph-lite/`, per
`plan.md`'s Project Structure: this feature extends the existing `cli/` package and the existing
`src/` extension host — no new package or bridge RPC method.

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before touching shared request/response shapes.

- [X] T001 Confirm the pre-feature baseline is green: `npm run compile`, `npm test` (root),
      `pnpm --filter ontograph-cli build`, `pnpm --filter ontograph-cli test`. No new
      dependencies, bundles, or scaffolding are needed for this feature — it extends existing
      files only, per `plan.md`'s Project Structure.

**Checkpoint**: Baseline confirmed green before any shared-shape changes begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the `dlQuery` request/response shape end-to-end (CLI → bridge → extension
host → CLI) with a temporary hardcoded `queryTypes` default, so every user story below has a
working, already-wired `queryTypes` parameter to build on. No classify-first logic and no CLI
flags yet — those are US1/US2/US3's own work.

**⚠️ CRITICAL**: No user story task in Phase 3+ may begin until this phase is complete.

- [X] T002 Extend `ApiDLQueryResult` in `src/api.ts` to the partial per-category record described
      in `data-model.md` (`directSuperClasses?`, `superClasses?`, `equivalentClasses?`,
      `directSubClasses?`, `subClasses?: ClassRef[]`, `instances?: IndividualRef[]`, all optional,
      keyed by `DLQueryType`); extend `OntoGraphApi.dlQuery`'s signature to
      `dlQuery(expression: string, queryTypes: DLQueryType[]): Promise<ApiDLQueryResult>`,
      importing `DLQueryType` from `./views/DLQueryMessages`
- [X] T003 Update `BridgeServer.dispatch()`'s `'dlQuery'` case in `src/bridge/BridgeServer.ts` to
      read `params.queryTypes as DLQueryType[]` and forward it as `api.dlQuery(expression,
      queryTypes)` — depends on T002
- [X] T004 Update `api.dlQuery()`'s implementation in `src/extension.ts` to accept `queryTypes`,
      pass it straight through to `reasonerBridge.dlQuery(..., queryTypes)` (replacing today's
      hardcoded `['superClasses', 'equivalentClasses', 'subClasses', 'instances']` array), and
      build the returned object with only the requested keys present (mapping via the existing
      `toRef` helper) — per `contracts/bridge-dlquery-protocol.md`'s response contract — depends
      on T002, T003. No classify-first check yet (Phase 3/US1's job).
- [X] T005 Update `runDlQuery()` in `cli/src/commands/bridge/dlQueryCommand.ts` to send
      `queryTypes: ['subClasses']` (the feature's eventual CLI default, per spec FR-006) as part
      of the bridge request `params` alongside `expression`, and update its handling of the
      response to the new partial-keys shape — depends on T004. (The `--types` flag itself is
      Phase 4/US2's job; this task only keeps the plumbing working end-to-end.)
- [X] T006 [P] Update the existing test in `cli/tests/bridge/dlQuery.test.ts` to assert
      `queryTypes: ['subClasses']` is sent in the request params and that the mocked response's
      partial-keys shape round-trips correctly — depends on T005

**Checkpoint**: `npm run compile`, `npm test`, and the CLI's test suite all pass with the new
request/response shape wired end-to-end (temporary hardcoded default) — user story implementation
can begin.

---

## Phase 3: User Story 1 - Get accurate DL query results without a manual classification step (Priority: P1) 🎯 MVP

**Goal**: `dl-query` classifies the ontology automatically when needed before running the query,
skips redundant reclassification when already fresh, and blocks the query entirely if
classification fails.

**Independent Test**: Run `ontograph dl-query "<expr>"` against a never-classified ontology and
confirm classification happens automatically; run it again and confirm no redundant
reclassification; run it against an inconsistent ontology and confirm a clear failure with no
query executed.

### Tests for User Story 1

- [X] T007 [P] [US1] Write failing unit tests for a new pure predicate
      `needsClassificationBeforeQuery(model: OntologyModel): boolean` — add to
      `src/model/OntologyModel.test.ts` (create if it does not yet exist): never-classified
      (`isClassified: false`) → `true`; classified and fresh
      (`isClassified: true, classificationNeedsUpdate: false`) → `false`; classified but stale
      (`classificationNeedsUpdate: true`) → `true`
- [X] T008 [P] [US1] Write failing tests asserting the classify-first orchestration sequence
      itself: when classification is needed, the same logic `api.classify()` uses runs BEFORE
      `reasonerBridge.dlQuery` is ever invoked, and a classify failure (inconsistent ontology)
      causes `dlQuery` to reject with the SAME error the underlying classify failure produced
      (FR-010 — no new/different error code) WITHOUT `reasonerBridge.dlQuery` being called; when
      classification is not needed, `reasonerBridge.dlQuery` is called directly with no
      redundant classify step. Extract this orchestration into a small function decoupled from
      `vscode`-bound state (e.g. taking `model`, a `classify` callback, and a `runQuery` callback
      as parameters) so it is directly unit-testable — mirroring this repo's established pattern
      of extracting VS-Code-API-free helpers for testability (`src/uml/`). Add as a new test file
      near the extracted helper (e.g. `src/reasoner/dlQueryOrchestration.test.ts`).

### Implementation for User Story 1

- [X] T009 [US1] Implement `needsClassificationBeforeQuery()` in `src/model/OntologyModel.ts` to
      make T007 pass — depends on T007
- [X] T010 [US1] Implement the extracted classify-first orchestration helper (e.g.
      `src/reasoner/dlQueryOrchestration.ts`, per T008's decoupled-function design) to make T008
      pass — depends on T008
- [X] T011 [US1] Wire the orchestration helper and `needsClassificationBeforeQuery()` into
      `api.dlQuery()` in `src/extension.ts`: check the active model's classification state first;
      if classification is needed, run it via the same path `api.classify()` uses, propagating
      failure as a rejected `dlQuery` call; otherwise proceed straight to
      `reasonerBridge.dlQuery(...)` (already wired in T004) — depends on T004, T009, T010

**Checkpoint**: User Story 1 fully functional and independently testable — run `quickstart.md`'s
Story 1 steps against a test ontology (e.g. `test-ontologies/animals.omn`).

---

## Phase 4: User Story 2 - Choose which categories of results come back (Priority: P1)

**Goal**: `--types` lets the user request one or more of the six result categories; an
unrecognized category name is rejected before any query (or classification) work begins; omitting
`--types` defaults to `subClasses` alone.

**Independent Test**: Run `ontograph dl-query "<expr>" --types directSubClasses,instances` and
confirm the result contains only those two categories; run without `--types` and confirm only
`subClasses` is returned; run with an unrecognized category name and confirm an immediate,
actionable rejection.

### Tests for User Story 2

- [X] T012 [P] [US2] Write failing unit tests for a new `parseQueryTypes(raw: string | undefined):
      DLQueryType[]` helper (co-located with `dlQueryCommand.ts`, e.g.
      `cli/src/commands/bridge/dlQueryTypes.ts` — importing `DLQueryType`/`DL_QUERY_TYPE_LABELS`
      from `@core/views/DLQueryMessages` per `research.md` Decision 2): `undefined` →
      `['subClasses']`; a valid comma-separated list → the parsed, deduplicated array (per spec
      edge case: duplicate names collapse to one); an unrecognized name → throws/returns an error
      indicator distinguishable from a successful parse. Add as
      `cli/tests/bridge/dlQueryTypes.test.ts`.
- [X] T013 [P] [US2] Write failing CLI-level tests in `cli/tests/bridge/dlQuery.test.ts`: omitting
      `--types` sends `queryTypes: ['subClasses']` (superseding T006's Foundational stand-in);
      a valid `--types` value sends the parsed array; an invalid `--types` value writes an
      `INVALID_ARGS` response and returns its exit code WITHOUT `bridgeClient.send` ever being
      called (per `contracts/cli-dl-query-command.md` — no classification or query work begins
      on an invalid request, spec SC-005)

### Implementation for User Story 2

- [X] T014 [US2] Implement `parseQueryTypes()` in `cli/src/commands/bridge/dlQueryTypes.ts` to
      make T012 pass — depends on T012
- [X] T015 [US2] Add a `--types <list>` option to the `dl-query` command in `cli/src/main.ts` and
      wire `runDlQuery()` (`cli/src/commands/bridge/dlQueryCommand.ts`) to call
      `parseQueryTypes()` before any bridge call, writing an `INVALID_ARGS` error immediately on
      an unrecognized name — depends on T014, T013

**Checkpoint**: User Stories 1 and 2 both independently functional — run `quickstart.md`'s Story 2
steps.

---

## Phase 5: User Story 3 - Narrow results by label (Priority: P2)

**Goal**: `--filter` narrows every returned category to entities whose label or IRI contains the
given substring, case-insensitively, applied entirely client-side in the CLI process.

**Independent Test**: Run `ontograph dl-query "<expr>" --filter "<substring>"` and confirm only
matching entities remain in each returned category; a filter matching nothing yields an empty
array, not an error.

### Tests for User Story 3

- [X] T016 [P] [US3] Write failing unit tests for the new shared predicate in
      `src/utils/dlQueryLabelFilter.test.ts`: case-insensitive match against an entity's label OR
      its IRI; an empty or undefined filter matches every entity (per `research.md` Decision 5 /
      spec edge case)
- [X] T017 [P] [US3] Write failing CLI-level tests in `cli/tests/bridge/dlQuery.test.ts`:
      `--filter` narrows entities within each returned category; a filter matching nothing yields
      an empty array for that category rather than an error; omitting `--filter` (or an empty
      string) returns all entities unchanged; combined with `--types`, filtering applies only
      within the requested categories

### Implementation for User Story 3

- [X] T018 [US3] Implement the shared label/IRI substring-match predicate in
      `src/utils/dlQueryLabelFilter.ts` to make T016 pass — depends on T016
- [X] T019 [US3] Refactor `webview-src/dl-query/DLQueryFilters.ts` to call the new shared
      predicate from T018 instead of its inline substring check — no behavior change; existing
      webview behavior/tests (if any) continue to pass unchanged — depends on T018
- [X] T020 [US3] Add a `--filter <substring>` option to the `dl-query` command in
      `cli/src/main.ts`; in `runDlQuery()` (`cli/src/commands/bridge/dlQueryCommand.ts`), apply
      the shared predicate (imported via `@core/utils/dlQueryLabelFilter`) to every category in
      the bridge response before writing output — depends on T018, T017

**Checkpoint**: All three user stories independently functional — run `quickstart.md`'s Story 3
steps; the full quickstart passes end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Review `contracts/cli-dl-query-command.md` and `contracts/bridge-dlquery-protocol.md`
      against the actual implementation from Phases 2–5; correct any drift (e.g. error-code
      specifics discovered during implementation)
- [X] T022 [P] Add a one-line pointer entry for `027-cli-dlquery-filters` to `CLAUDE.md`'s
      `## Recent Changes` section, matching the established thin-pointer convention (see the
      existing entries and their `→ specs/<id>/` links)
- [X] T023 Run `npm run compile`, full `npm test` (root), `pnpm --filter ontograph-cli build`, and
      `pnpm --filter ontograph-cli test` to confirm no regressions across both packages
- [ ] T024 Run `quickstart.md` end to end against a running Extension Development Host (e.g. with
      `test-ontologies/animals.omn` loaded) to confirm the full CLI flow — classify-first,
      category selection, and label filtering — works against a live extension, not just mocked
      bridge tests. **Not done**: requires a VS Code GUI session this terminal-only environment
      can't drive. Partially compensated by the addendum below, which verifies the same three
      behaviors against real data and a real reasoner process — the one thing it can't cover is
      the CLI-socket-to-live-extension-host round trip itself (`BridgeServer`/`bridgeClient` are
      otherwise fully covered by mocked unit tests).

---

## Post-delivery addendum: real end-to-end verification against anatomy.owl

All of T001–T023's tests use mocked `bridgeClient.send`/synthetic fixtures — appropriate for
TDD, but they don't prove the classify-first orchestration, category selection, or label filter
actually behave correctly against a real, SNOMED-scale ontology and a real reasoner process. Per
user request, added `src/reasoner/dlQueryOrchestration.anatomy.test.ts` (skipped automatically
when `anatomy.owl` — not committed to the repo — is absent, same convention as this repo's other
anatomy.owl-scale tests): parses the real ~30MB file, spawns the real Java reasoner JAR via a
real (non-mocked) `ReasonerBridge`, and drives the actual production functions
(`needsClassificationBeforeQuery`, `runDlQueryWithClassifyFirst`, `matchesLabelFilter`) against
it — not `reasonerBridge.classify`/`dlQuery`'s content-string variant `api.classify()`/
`api.dlQuery()` use in `src/extension.ts`, but the `classifyFile`/filePath variants, to avoid an
unnecessary ~30MB read+re-serialize round trip the new logic under test doesn't touch anyway.

Verified against real data: classification runs exactly once on a never-classified model; a
second `dlQuery` call against the same, now-classified model does **not** reclassify (FR-002/
SC-004, genuinely — not just via a mocked callback count); "Body structure" (`123037004`) returns
1 direct subclass but >1000 transitive subclasses (querying both categories in one call); a real
leaf class (`10013000`) has a real direct superclass; and the label filter correctly narrows the
1000+-entity transitive set using real SNOMED labels. Full run: ~15s, no regressions (818/820
total tests passing — the 2 failures are the pre-existing, unrelated `sync-anatomy-bench.test.ts`
timing flake).

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only; independent of User Story 1 (both
  extend `dlQueryCommand.ts`/`runDlQuery()` but touch non-overlapping concerns — classify-first vs.
  category parsing — so either can be implemented first; this document lists US1 before US2 to
  match their declared order in `spec.md`)
- **User Story 3 (Phase 5)**: Depends on Foundational only; independent of User Story 1 and User
  Story 2 (label filtering is a pure post-processing step over whatever categories were returned)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories
- **US2 (P1)**: No dependencies on other stories
- **US3 (P2)**: No dependencies on other stories (filtering is orthogonal to classify-first and to
  category selection — it operates on whatever categories/entities are already present in the
  response)

### Within Each User Story

- Tests written and confirmed failing before their corresponding implementation task (T007/T008
  before T009–T011; T012/T013 before T014–T015; T016/T017 before T018–T020), per this repo's
  mandatory Red→Green workflow (`conductor/workflow.md`)
- Pure/testable helper implemented before it is wired into the CLI command or `extension.ts`

### Parallel Opportunities

- T007, T008 (US1 tests) — different files, run in parallel
- T012, T013 (US2 tests) — different files, run in parallel
- T016, T017 (US3 tests) — different files, run in parallel
- Once Foundational (Phase 2) is complete, Phases 3, 4, and 5 (US1, US2, US3) have no
  cross-dependencies and can proceed in parallel if staffed
- T021, T022 (Polish) — different files, run in parallel; T023/T024 should run after T021/T022 and
  after all three user stories land, so the full suite and quickstart reflect the finished feature

---

## Parallel Example: Foundational → User Stories

```bash
# After Phase 2 (Foundational) completes, launch all three user stories' test tasks together:
Task: "Write failing unit tests for needsClassificationBeforeQuery() in src/model/OntologyModel.test.ts"
Task: "Write failing unit tests for parseQueryTypes() in cli/tests/bridge/dlQueryTypes.test.ts"
Task: "Write failing unit tests for the shared label/IRI predicate in src/utils/dlQueryLabelFilter.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md`'s Story 1 steps against a test ontology
5. Demo: `ontograph dl-query "<expr>"` auto-classifies a never-classified ontology and skips
   redundant reclassification on repeat calls

### Incremental Delivery

1. Setup + Foundational → foundation ready (request/response shape extended end to end)
2. User Story 1 → validate independently → classify-safety MVP demoable
3. User Story 2 → validate independently → category selection demoable
4. User Story 3 → validate independently → label filtering demoable
5. Polish → contract review, `CLAUDE.md` pointer, full regression run, live quickstart validation

### Parallel Team Strategy

With multiple developers, once Foundational (Phase 2) is done: Developer A takes US1 (Phase 3),
Developer B takes US2 (Phase 4), Developer C takes US3 (Phase 5) — all three are independent of
each other and only depend on Foundational.

---

## Notes

- [P] tasks touch different files with no unmet dependencies
- [Story] labels trace every Phase 3+ task back to spec.md's US1/US2/US3
- Tests are written and confirmed failing before their corresponding implementation task, per this
  repo's mandatory Red→Green workflow (`conductor/workflow.md`)
- Commit after each task or logical group
- Avoid: vague tasks, same-file conflicts within a `[P]` group, and cross-story dependencies beyond
  the ones explicitly called out above
