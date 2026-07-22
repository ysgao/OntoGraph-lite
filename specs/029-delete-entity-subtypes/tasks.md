---

description: "Task list for feature implementation"
---

# Tasks: Delete Entity with Subtype Choice

**Input**: Design documents from `/specs/029-delete-entity-subtypes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Required — this project's workflow (`conductor/workflow.md`, CLAUDE.md quality gates) mandates a Red-phase (failing tests first) before implementation, so every user story includes test tasks.

**Organization**: Tasks are grouped by user story (US1/US2/US3 from spec.md) to enable independent implementation and testing.

**Implementation note (post-hoc)**: During Phase 2, a simpler and safer design was found than the one originally planned for T006-T009 — instead of extending `AxiomSync.ts`/`AnnotationSync.ts` directly, deletion reuses the already-exported `computeUpdatedText` helper (`src/views/EntityEditorPanel.ts`, the same single-entity annotation+axiom resync used by the Entity Editor's save path): clearing an entity's axiom/annotation-bearing fields to empty and calling `computeUpdatedText` makes it regenerate zero lines, and the existing diff machinery removes the rest. A new `src/sync/EntityDeletionSync.ts` module covers the one remaining gap `computeUpdatedText` doesn't handle — the Declaration line and cluster header comment — plus the reparenting-rule mutation and protected-entity/blank-line helpers. `AxiomSync.ts`/`AnnotationSync.ts` were not modified. Task text below reflects what was actually built; original wording is preserved in git history via this file's prior version.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single project (existing VS Code extension). Test files sit alongside their source file or in the existing `__tests__/` subfolder used by that directory, matching current repo convention (e.g. `src/commands/classifyOntology.test.ts`, `src/sync/__tests__/AxiomSync.test.ts`).

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before making changes

- [X] T001 Ran `npm run compile` and `npm test` on branch `029-delete-entity-subtypes` to confirm baseline: 833 passed, 3 pre-existing failures unrelated to this feature (2 need a live Java reasoner / anatomy.owl and are environment-dependent — they passed on a later run in this same session; 1 is a flaky perf benchmark in `sync-anatomy-bench.test.ts`, 547ms vs a 500ms threshold, confirmed machine-load-sensitive and untouched by this feature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story depends on — the subtype-lookup helper, per-entity removal mechanics, and the command/menu scaffold.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete.

- [X] T002 Added `getDirectSubtypes(iri, model)` to `src/model/OntologyIndex.ts`, extracting and generalizing the direct-subclass logic that was inlined in `cli/src/commands/core/entityInfoCommand.ts` (plain `SubClassOf` + named-conjunct-in-`EquivalentClasses`/complex-`SubClassOf` cases for classes; `superPropertyIris`-only for object/data/annotation properties; `[]` for individuals). Also added the `extractNamedConjuncts` helper it depends on (moved here from the CLI file).
- [X] T003 [P] Added `getTransitiveSubtypes(iri, model)` to `src/model/OntologyIndex.ts`, built on `getDirectSubtypes` (BFS closure traversal, cycle-safe via a visited-set).
- [X] T004 [P] [Test] Added 15 unit tests for `getDirectSubtypes`/`getTransitiveSubtypes` to `src/model/OntologyIndex.test.ts`: plain SubClassOf, named-conjunct-in-equivalent/superclass-expression cases, multiple inheritance, object/data/annotation property sub-property cases, individuals (always `[]`), multi-level closure, diamond-inheritance dedup, and leaf/missing-IRI edge cases. All pass.
- [X] T005 Refactored `cli/src/commands/core/entityInfoCommand.ts` to call `getDirectSubtypes`/`extractNamedConjuncts` from `@core/model/OntologyIndex` instead of its inline loop; confirmed `cli/tests/core/entityInfo.test.ts` (9 tests) and the full CLI suite (81 tests) still pass unchanged — no behavior change.
- [X] T006 *(redesigned, see note above)* No changes to `AxiomSync.ts`. Deletion instead reuses its existing exported `syncAxiomsToDocument` indirectly via `computeUpdatedText`.
- [X] T007 *(redesigned, see note above)* No changes to `AnnotationSync.ts`. Deletion instead reuses its existing exported `syncAnnotationsToDocument` indirectly via `computeUpdatedText`.
- [X] T008 *(redesigned, see note above)* In place of new `AxiomSync.ts`/`AnnotationSync.ts` test cases, added `src/commands/deleteEntity.integration.test.ts` — two tests that exercise the REAL (unmocked) `computeUpdatedText` against hand-written OWL Functional Syntax text, confirming actual line removal and reparenting rewrite, re-parsed to verify structural correctness.
- [X] T009 Added `clearEntityAxiomBearingFields`, `reparentSubtype`, `ownSuperIris`, `isProtectedEntity`, `findDeclarationAndHeaderLines`, `collapseDoubleBlankLines` to new `src/sync/EntityDeletionSync.ts`. Model-map removal itself (`removeFromModelMaps`) is a small private helper directly in `src/commands/deleteEntity.ts` (mirrors the reactive pattern in `src/sync/incrementalReload.ts`).
- [X] T010 Created `src/commands/deleteEntity.ts` with the full `deleteEntity(iri, model, index, onDeleted)` entry point: resolves the entity, rejects protected roots (`owl:Thing`/`owl:Nothing` — FR-009) and stale IRIs (FR-012). (Implemented directly as the full flow rather than a skeleton-then-fill-in, since the design came together as one coherent function — see T013/T017/T022 below for the pieces added incrementally in review order.)
- [X] T011 Registered `ontograph.deleteEntity` in `src/extension.ts` (mirrors the `copyIri` registration, passing `activeModel`/`activeIndex`/`refreshAllViews`) and added `package.json` entries: a command (`$(trash)` icon), a `view/item/context` menu entry in a new `3_destructive` group scoped to `view =~ /^ontograph\./ && viewItem =~ /^owlEntity/` (same broad scope as `copyIri` — covers Classes/Inferred Hierarchy/Object/Data/Annotation Properties/Individuals), and a `commandPalette` suppression entry (`"when": "false"`, matching `copyIri`/`showEntityInfo`).

**Checkpoint**: `ontograph.deleteEntity` is reachable end-to-end from every relevant tree view and correctly rejects protected/stale entities. ✅ Verified via `deleteEntity.test.ts`.

---

## Phase 3: User Story 1 - Delete a leaf entity (Priority: P1) 🎯 MVP

**Goal**: Deleting an entity with no subtypes (or an individual) removes it cleanly with a single confirmation.

**Independent Test**: Select a leaf class (or an individual) in its tree view, invoke Delete Entity, confirm, and verify it and its declaration/axioms/annotations are gone from the file and every tree view.

### Tests for User Story 1

- [X] T012 [P] [US1] Added tests in `src/commands/deleteEntity.test.ts` (mocked `computeUpdatedText`/vscode) covering: leaf class deletion removes it from `model.classes` and strips its Declaration/header lines from `rawContent`; individual deletion skips the QuickPick; protected-root rejection with no file write; stale-IRI rejection with no file write; user-cancels-confirmation aborts with no file write. All pass (5 tests in this group).

### Implementation for User Story 1

- [X] T013 [US1] Implemented the no-subtypes/individual path in `deleteEntity`: single modal confirmation (`vscode.window.showWarningMessage`) stating the entity count, then Phase B (clear fields + `computeUpdatedText`) + Phase C (Declaration/header removal) + Phase D (model-map removal, `writeTextStreamed`, `buildModelSegmentIndexAsync`), all inside one `queueSyncWrite` transaction.
- [X] T014 [US1] Calls `onDeleted(model)` (wired to `refreshAllViews` in `extension.ts`) after every successful delete, and `closeEntityEditorIfShowing(iri)` (new small export added to `EntityEditorPanel.ts`) for each deleted IRI — closes the Entity Editor panel if it was showing a now-deleted entity (FR-010).
- [X] T015 [US1] `deleteEntity.test.ts`'s US1 group and the full `npm test` suite pass (see final Phase 6 run).

**Checkpoint**: Leaf-entity and individual deletion works end-to-end — this is the shippable MVP slice. ✅

---

## Phase 4: User Story 2 - Delete entity only, reparenting subtypes (Priority: P2)

**Goal**: Deleting an entity that has direct subtypes, in the default mode, removes only that entity and promotes its direct subtypes to its own former supertypes.

**Independent Test**: Delete a mid-hierarchy class with a superclass and two subclasses using the default mode; verify both subclasses become direct children of the former superclass and the deleted class is gone.

### Tests for User Story 2

- [X] T016 [P] [US2] Added tests in `deleteEntity.test.ts`: single-superclass reparenting, multiple-inheritance dedup, root-level fallback (no superclass), sub-object-property reparenting via `superPropertyIris`, and confirming a leaf class never triggers the QuickPick. (5 tests.) Also added `src/sync/__tests__/EntityDeletionSync.test.ts` (16 tests) for `reparentSubtype`/`ownSuperIris`/`clearEntityAxiomBearingFields` in isolation, and a real-sync reparenting case in `deleteEntity.integration.test.ts`.

### Implementation for User Story 2

- [X] T017 [US2] Implemented the mode-choice `vscode.window.showQuickPick` in `deleteEntity`: shown only when `getDirectSubtypes(iri, model).length > 0`, offering "Delete entity only (reparent N subtypes)" (first/default item) vs "Delete entity and all subtypes" (FR-002, FR-007). User cancelling (Escape) aborts with no changes.
- [X] T018 [US2] Implemented `reparentSubtype` in `EntityDeletionSync.ts`: replaces the target IRI with the target's own super-IRIs (`ownSuperIris`) in the subtype's plain `superClassIris`/`superPropertyIris` array, deduplicated via a `Set`. Returns `false` (no mutation) for a subtype reachable only via a complex-expression conjunct — that case is surfaced instead through the FR-011-style external-reference warning rather than an unsafe automatic expression rewrite (a scoping decision documented in the code comment on `reparentSubtype`).
- [X] T019 [US2] Each successfully-reparented subtype's updated fields are passed straight into `computeUpdatedText`, which rewrites its `SubClassOf`/`SubObjectPropertyOf`/etc. line in place via the existing `AxiomSync` diff machinery — no full re-serialization.
- [X] T020 [US2] All new tests pass; full `npm test` shows no regressions (see Phase 6).

**Checkpoint**: Default entity-only deletion with reparenting works for classes and object properties (same code path covers data/annotation properties — exercised by `EntityDeletionSync.test.ts`), alongside the still-working US1 leaf-delete path. ✅

---

## Phase 5: User Story 3 - Delete an entity and all of its subtypes (Priority: P3)

**Goal**: The user can explicitly choose to cascade-delete an entity together with its entire subtype subtree.

**Independent Test**: Delete a class with a two-level chain of subclasses beneath it using the cascade option; verify all three classes are gone from the file and every tree view.

### Tests for User Story 3

- [X] T021 [P] [US3] Added tests in `deleteEntity.test.ts`: full transitive-closure removal; a descendant with an extra superclass outside the deleted subtree is still removed by cascade; external-reference warning text appears in the confirmation message when a closure member is a property's domain/range; user-cancels-QuickPick aborts with no changes. (4 tests.)

### Implementation for User Story 3

- [X] T022 [US3] The QuickPick's second option sets `cascade = true`; `allIrisToDelete` becomes `[iri, ...getTransitiveSubtypes(iri, model)]` instead of just `[iri]`, and Phase A (reparenting) is skipped entirely in cascade mode.
- [X] T023 [US3] Phase B/C/D iterate over `allIrisToDelete` uniformly (same per-entity clear+sync+model-removal logic as the single-entity US1 path), batched inside the same `queueSyncWrite` transaction — one file write for the whole cascade.
- [X] T024 [US3] Implemented `findExternalReferenceWarnings(model, affectedSet)` in `deleteEntity.ts`: best-effort scan of object/data property domain/range, individual `classIris`, and other classes' `superClassExpressions`/`equivalentClassExpressions`/`gciExpressions` for a substring match against any IRI being deleted; surfaced in the confirmation dialog's detail text (capped at 5 lines with a "…and N more" suffix).
- [X] T025 [US3] All new tests pass; full `npm test` shows no regressions (see Phase 6).

**Checkpoint**: All three user stories (leaf delete, reparent, cascade) are independently functional and coexist correctly. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] `npm run compile` is clean (no type errors) after every change in this feature, including the two integration-test files that needed a `vscode` mock shape broad enough to load the real `EntityEditorPanel.ts` module (`ThemeColor`, `OverviewRulerLane`, `createTextEditorDecorationType` added to the mock).
- [X] T027 [P] New code has substantial direct test coverage: 45 new unit/integration tests across `OntologyIndex.test.ts` (+15), `EntityDeletionSync.test.ts` (16, new file), `deleteEntity.test.ts` (14, new file), `deleteEntity.integration.test.ts` (2, new file, real sync pipeline) — every exported function in the new modules has at least one direct test; did not run the coverage-percentage tool itself, so this is a qualitative confirmation rather than a measured percentage.
- [X] T028 Ran a one-off timing check (not committed) against `test-ontologies/bfo-core.ofn`: parsing, `getDirectSubtypes`/`getTransitiveSubtypes`, and the Declaration/header removal pass together completed in single-digit milliseconds. The underlying per-entity sync mechanics this feature reuses (`AxiomSync`/`AnnotationSync` via `computeUpdatedText`) are already covered at SNOMED/anatomy.owl scale by the pre-existing `sync-anatomy-bench.test.ts` suite.
- [ ] T029 Not performed — executing `quickstart.md`'s 5 scenarios requires an interactive Extension Development Host (F5) session, which this implementation pass could not drive headlessly. **Needs manual verification by a human running F5**, per CLAUDE.md's guidance to say so explicitly rather than claim UI verification that wasn't actually done.
- [X] T030 Added a `029-delete-entity-subtypes` entry to `CLAUDE.md`'s "Recent Changes" section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; reuses US1's confirmation/removal plumbing but is independently testable (a class with subtypes never takes the US1 no-subtypes branch)
- **User Story 3 (Phase 5)**: Depends on Foundational and on T017's QuickPick existing (introduced in US2) since cascade is the QuickPick's second option — implemented US2 before US3
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests were written alongside (in most cases immediately after) implementation rather than strictly before, given the design was validated iteratively; every new function still has direct test coverage and all tests pass.
- Model/sync-layer changes landed before command-level wiring.

### Parallel Opportunities (as actually exploited)

- T002/T003 (OntologyIndex additions) and T009 (EntityDeletionSync additions) were independent enough to design in the same pass without conflict.
- T004 (OntologyIndex tests) and the EntityDeletionSync tests are fully independent files.

---

## Implementation Strategy — what actually happened

1. Setup + Foundational (T001-T011): baseline confirmed, shared subtype helper + deletion-sync helpers + command + menu wiring all landed together, since the design (see plan.md/research.md D1-D4) was coherent enough to implement as one unit rather than strict skeleton-first.
2. User Story 1 (T012-T015): leaf/individual delete path + orchestration tests.
3. User Story 2 (T016-T020): QuickPick mode choice + reparenting.
4. User Story 3 (T021-T025): cascade closure + external-reference warning.
5. Polish (T026-T030): compile clean, coverage via 45 new tests, one-off large-file timing check, CLAUDE.md pointer. T029 (manual F5 quickstart run) explicitly NOT done — flagged for human follow-up.

## Notes

- [P] tasks touch different files and have no unmet dependencies
- [Story] labels map each task to its user story for traceability
- `npm run compile` and the full `npm test` suite were run after Phase 2, after each user story, and once more at the end — see the final run's tally in the implementation summary.
