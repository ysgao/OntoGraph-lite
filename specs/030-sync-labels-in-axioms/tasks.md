---

description: "Task list for 030-sync-labels-in-axioms"
---

# Tasks: Sync Axiom Display After Entity Label Rename

**Input**: Design documents from `specs/030-sync-labels-in-axioms/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/label-rename-message-contract.md, quickstart.md

**Tests**: Included — this repo's TDD workflow (`conductor/workflow.md`) mandates a Red phase (failing tests) before a Green phase (implementation) for every task.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching `spec.md` priorities P1/P2/P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are relative to the repository root (`/Users/yoga/JavaApp/OntoGraph-lite`)

---

## Phase 1: Setup

**Purpose**: Confirm a clean starting point before making changes (existing project — no new scaffolding needed).

- [x] T001 Run `npm test` and `npm run compile` at the repo root; confirm both are green before starting any change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing that both US1 and US2 build on — the reverse-reference scan and the selective `entityHistoryMap` invalidation it feeds. (US3's duplicate-label check is independent of this and lives entirely in Phase 5.)

**⚠️ CRITICAL**: US1 and US2 implementation cannot start until this phase is complete.

- [x] T002 [P] Add a `findEntitiesReferencingIri(model: OntologyModel, iri: string): OWLEntityUnion[]` helper to `src/model/OntologyIndex.ts`, scanning every entity map (classes, objectProperties, dataProperties, annotationProperties, individuals) for `iri` appearing in any axiom-bearing field (`superClassExpressions`, `equivalentClassExpressions`, `gciExpressions`, `disjointClassIris`, `domainIris`, `rangeIris`, `superPropertyIris`, `equivalentPropertyIris`, `disjointPropertyIris`, `propertyChains`, `classIris`, `objectPropertyAssertions`, `dataPropertyAssertions`, `inverseOfIri`) — mirroring the scan style already used by `updateIriReferencesInModel` in `src/views/EntityEditorPanel.ts`.
- [x] T003 [P] Add an `invalidateEntries(iris: Iterable<string>): void` method (or equivalent) to the history-map management code in `src/views/EntityEditHistory.ts` that deletes each given IRI's entry from `entityHistoryMap` if present, leaving other entries untouched.

**Checkpoint**: Foundation ready — US1 and US2 implementation can now proceed.

---

## Phase 3: User Story 1 - Renamed entity's label stays correct everywhere it's referenced (Priority: P1) 🎯 MVP

**Goal**: After any entity's label is renamed and saved, every other entity's axiom referencing it — whether freshly loaded or previously cached — shows the current label and round-trips to the same underlying entity on save, with no loss, blanking, or misattribution.

**Independent Test**: Rename A's label, save. Open B (which references A), confirm the new label appears. Make an unrelated edit to B and save. Reload and confirm B's axiom still correctly references A's IRI.

### Tests for User Story 1 ⚠️

> Write these tests FIRST; confirm they FAIL before implementing T009-T010.

- [x] T004 [P] [US1] Failing test in `src/model/OntologyIndex.test.ts` for `findEntitiesReferencingIri`: covers a match via a `SubClassOf` expression, a match via a GCI axiom, a match via a property domain/range IRI, and a non-match (unrelated entity not returned).
- [x] T005 [P] [US1] Failing test in `src/views/EntityEditHistory.test.ts` for the new invalidation method: given cached history entries for B, C, D where only B and D reference A, invalidating for A's IRI removes B and D's entries and leaves C's untouched.
- [x] T006 [P] [US1] Failing integration test in `src/views/EntityEditorPanel.test.ts`: save a label rename on A, then call `sendLoadEntity`/load for B (which references A); assert the returned payload's axiom text shows A's new label, not the label cached before the rename.
- [x] T007 [US1] Failing regression test in `src/views/EntityEditorPanel.test.ts`: perform a rename chain A→B→C (three sequential label saves on the same entity); assert every dependent entity's next load shows "C", never an intermediate stale value.
- [x] T008 [US1] Failing regression test in `src/views/EntityEditorPanel.test.ts`: after renaming A, save an unrelated annotation edit on B; assert the persisted/serialized axiom on B still references A's IRI (not lost, blank, or pointing to a different entity) — assert against the computed updated text / model state, not just the in-memory display.
- [x] T008a [US1] Failing regression test in `src/model/OntologyIndex.test.ts`: `findEntitiesReferencingIri` (T002) tolerates a referenced entity that no longer exists in the model (deleted after being cached) without throwing — covers the spec.md Edge Case "entity referenced in an axiom is deleted after its display was cached."
- [x] T008b [US1] Failing regression test in `src/views/EntityEditorPanel.test.ts`: undo (`undoRequest`) a label rename on A (referenced by B) after B's display already picked up A's new label; assert the revert triggers the same invalidation path (T009) so B's next load shows A's reverted (original) label, not the stale new one — covers the spec.md Edge Case "a rename is undone."

### Implementation for User Story 1

- [x] T009 [US1] In the `save` handler in `src/views/EntityEditorPanel.ts`, after a label change is applied and persisted for an entity, call `findEntitiesReferencingIri` (T002) with that entity's IRI, then call the invalidation method (T003) to remove the matching entities' entries from `entityHistoryMap`. Ensure this same call fires on the undo/redo persistence path (T008b), not only on a forward `save`.
- [x] T010 [US1] Verify (and adjust if needed) that `sendLoadEntity` in `src/views/EntityEditorPanel.ts` correctly falls back to a fresh `buildEntityPayload` render whenever an entity's `entityHistoryMap` entry is absent, so an invalidated entry always results in a fresh, current-label render on next load. *(Verified: existing fallback at line ~1141 already does this correctly — no code change was needed.)*
- [x] T011 [US1] Run T004-T008b, confirm all pass, then run full `npm test` to confirm no regressions in existing `EntityEditHistory.test.ts` / `AnnotationSync.test.ts` / `EntityEditorPanel.test.ts` suites.

**Checkpoint**: User Story 1 is fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Author is not required to manually refresh panels to keep axioms consistent (Priority: P2)

**Goal**: The synchronization from US1 happens automatically across navigation, undo/redo, and history — the author never needs to manually reload the file or force a refresh, and the Undo/Redo button state never lies about an entity whose history was just invalidated.

**Independent Test**: View B, view another entity, rename A (referenced by B), navigate back to B via history/undo-redo without closing the file or forcing a refresh; confirm B shows the current label and Undo/Redo buttons reflect B's actual (fresh, empty) history state.

### Tests for User Story 2 ⚠️

- [x] T012 [P] [US2] Failing integration test in `src/views/EntityEditorPanel.test.ts`: build navigation history B → (other entity) → B, rename A (referenced by B) in between, then navigate back to B through the existing navigation/undo mechanism; assert the current label appears with no manual refresh call made.
- [x] T013 [P] [US2] Failing test in `src/views/EntityEditorPanel.test.ts` (or `EntityEditHistory.test.ts`): assert that immediately after an entity's `entityHistoryMap` entry is invalidated (per T009) and it is reloaded, the resulting `UndoRedoStateMessage` reports `canUndo: false` (fresh history), not a stale `true` carried over from the deleted entry.

### Implementation for User Story 2

- [x] T014 [US2] In `src/views/EntityEditorPanel.ts`, ensure a fresh `UndoRedoStateMessage` is computed and sent whenever an entity is loaded after its history entry was invalidated, so the webview's Undo/Redo buttons always reflect that entity's actual current history state. *(Verified: `showEntityInfo`'s existing `needsHistoryInit` branch already posts `canUndo:false, canRedo:false` explicitly when the map entry is absent — no code change was needed.)*
- [x] T015 [US2] Run T012-T013, confirm all pass, and confirm no regression to the existing `014-entity-editor-undo-redo` test coverage.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Renaming to a label already used by another entity is prevented (Priority: P3)

**Goal**: A label rename that would create a duplicate label (case-insensitively, per the existing `exactMatchByLabel` domain) is rejected outright, with a clear error naming the conflicting entity; the entity keeps its previous label; any other valid changes in the same save still apply.

**Independent Test**: Attempt to rename A's label to match C's existing label; confirm the rename is rejected, A's label is unchanged, and a clear error naming C is returned.

### Tests for User Story 3 ⚠️

- [x] T016 [P] [US3] Failing test in `src/views/EntityEditorPanel.test.ts`: attempt to rename A's label to C's existing label via the `save` handler; assert a `LabelRenameResultMessage` with `success: false` and an error naming C is sent, and that A's label is unchanged in the model afterward.
- [x] T017 [P] [US3] Failing test in `src/views/EntityEditorPanel.test.ts`: same rejected-rename save request also includes an unrelated valid annotation change on the same entity; assert the annotation change is still applied and persisted despite the label portion being rejected.
- [x] T018 [P] [US3] Failing test in `src/views/EntityEditorPanel.test.ts`: (a) renaming to an existing label that differs only in case is still rejected as a duplicate; (b) renaming an entity to its own current (unchanged) label is NOT treated as a conflict.

### Implementation for User Story 3

- [x] T019 [US3] Add a `LabelRenameResultMessage` interface (`{ type: 'labelRenameResult'; success: boolean; newLabel?: string; error?: string }`) to `src/views/EntityEditorMessages.ts` and include it in the `EntityEditorExtToWebview` union, per `contracts/label-rename-message-contract.md`.
- [x] T020 [US3] In the `save` handler in `src/views/EntityEditorPanel.ts`, before applying `msg.labels`, look up the new label via `OntologyIndex.exactMatchByLabel` (through `getIndex(model)`), excluding matches on the entity's own IRI; on a conflict, skip the label assignment, post a `LabelRenameResultMessage` with `success: false` and an error naming the conflicting entity, and continue processing the rest of the save (annotations/axioms) unaffected. *(Follow-up per user feedback: also fires a native `vscode.window.showWarningMessage` with the same reason, so the "why" is reliably visible even outside the panel.)*
- [x] T021 [US3] Handle the new `labelRenameResult` message in `webview-src/entity-editor/EntityEditorApp.ts`, mirroring the existing `iriRenameResult` handling, to surface the rejection to the user and revert the label field in the UI.
- [x] T022 [US3] Run T016-T018, confirm all pass, then run full `npm test` to confirm no regressions.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Repo-convention housekeeping and final verification across all stories.

- [x] T023 [P] Update `CHANGELOG.md` and add a `030-sync-labels-in-axioms` entry to `CLAUDE.md`'s "Recent Changes" section, following the existing entry style (e.g. `029-delete-entity-subtypes`).
- [ ] T024 Execute the `specs/030-sync-labels-in-axioms/quickstart.md` manual verification steps end-to-end in the Extension Development Host (F5) against `test-ontologies/animals.omn` (full stop/relaunch per the known F5-restart-serves-stale-dist gotcha). *(NOT performed — launching the Extension Development Host via F5 requires an interactive VS Code session, which isn't available in this automated environment. All behavior is instead covered by the automated test suite in T004-T022; the user should run this manual pass before release.)*
- [x] T025 Run `npm test` with coverage and `npm run compile`; confirm coverage stays above the repo's 80% quality gate and no type errors remain. *(`@vitest/coverage-v8` isn't installed in this repo, so no numeric coverage report could be generated — no new dependency was added to avoid unrequested scope creep. Verified instead via: full `npm test` — 912/913 passing, the one failure being a pre-existing timing-sensitive perf flake unrelated to this change (confirmed by re-running in isolation); `npm run compile` and `npm run compile:webview` both clean; every new function has direct unit tests covering its branches.)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS Phase 3 (US1) and Phase 4 (US2) implementation tasks (T009-T010, T014). Does NOT block Phase 5 (US3), which is independent of the reverse-scan/invalidation mechanism.
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T002, T003).
- **User Story 2 (Phase 4)**: Depends on Phase 2 (T002, T003) and on US1's T009 (invalidation must be wired in before US2's "no stale Undo/Redo state" fix is meaningful to test).
- **User Story 3 (Phase 5)**: Depends only on Phase 1. Can be implemented in parallel with Phases 3-4 by a different contributor, since it touches a distinct part of the same `save` handler (the pre-assignment uniqueness check) and a separate message type.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (T004-T008b, T012-T013, T016-T018) MUST be written and FAIL before their corresponding implementation tasks.
- Foundational helpers (T002-T003) before US1/US2 wiring (T009-T010, T014).
- Story complete (checkpoint) before moving to the next priority, if working sequentially.

### Parallel Opportunities

- T002 and T003 (Phase 2) touch different files — run in parallel.
- T004, T005, T006 (US1 tests) touch different files/independent scenarios — run in parallel; T007, T008, and T008b all touch `EntityEditorPanel.test.ts` and should follow sequentially after T006 to avoid file conflicts. T008a touches `OntologyIndex.test.ts` and can run in parallel with any of them.
- T012 and T013 (US2 tests) can run in parallel.
- T016, T017, T018 (US3 tests) can run in parallel (independent test cases, though same file — coordinate merge).
- Phase 5 (US3) can proceed in parallel with Phases 2-4 (US1/US2) by a different contributor, since it depends only on Phase 1.

---

## Parallel Example: User Story 1

```bash
# Launch US1's independent test-writing tasks together:
Task: "Failing test for findEntitiesReferencingIri in src/model/OntologyIndex.test.ts"
Task: "Failing test for entityHistoryMap invalidation in src/views/EntityEditHistory.test.ts"
Task: "Failing integration test for stale-cache re-render in src/views/EntityEditorPanel.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (T002-T003).
3. Complete Phase 3: User Story 1 (T004-T011).
4. **STOP and VALIDATE**: run the US1 independent test from `spec.md`/`quickstart.md` Scenario 1.
5. This alone resolves the core data-integrity bug described in the original request.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add User Story 1 → validate independently → this is the MVP fix.
3. Add User Story 2 → validate independently (navigation/undo-redo polish).
4. Add User Story 3 → validate independently (duplicate-label guard rail).
5. Polish (Phase 6).

### Parallel Team Strategy

With two contributors:

1. Both complete Setup together.
2. Developer A: Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2).
3. Developer B: Phase 5 (US3), independently, starting right after Phase 1 (no dependency on Developer A's work).
4. Both converge on Phase 6 (Polish) once all stories are complete.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps each task to its user story for traceability.
- Tests MUST be written and confirmed failing before their implementation task, per this repo's Red/Green TDD workflow (`conductor/workflow.md`).
- Per the plan's Constitution Check and `research.md`, no new dependencies, no new files/bundles, and no changes to the on-disk OWL Functional Syntax write format are introduced by any task above.
- Commit after each task or logical group, following the repo's task lifecycle (`[~]` in progress → Red → Green → commit → `git notes` summary → `[x] <sha>`, per `conductor/workflow.md`).
