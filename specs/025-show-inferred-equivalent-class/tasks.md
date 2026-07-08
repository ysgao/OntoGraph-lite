---

description: "Task list for Show Inferred Equivalent Class in Entity Editor"
---

# Tasks: Show Inferred Equivalent Class in Entity Editor

**Input**: Design documents from `/specs/025-show-inferred-equivalent-class/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/inferred-equivalent-classes.md, quickstart.md (all present)

**Tests**: Included. This repository's constitution mandates Test-First Integration (`conductor/workflow.md`'s red/green cycle), so failing tests are written before each implementation task they cover, except where noted that no Java test infrastructure exists (per root `CLAUDE.md`: "There are no Java tests").

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact, matching the current repository layout

## Path Conventions

Existing single VS Code extension project (see plan.md's Project Structure) — no new directories. All paths are relative to the repository root.

---

## Phase 1: Setup

**Purpose**: Baseline confirmation and shared test fixture, before touching any pipeline code

- [X] T001 Confirm the current `main` builds and tests cleanly as a baseline: run `npm run compile && npm test` and `cd java-server && mvn clean package` from the repository root
- [X] T002 [P] Create fixture ontology `test-ontologies/inferred-equivalent-fixture.ofn` (OWL Functional Syntax) containing: (a) classes `A`/`B` related only via `SubClassOf(A B)` + `SubClassOf(B A)` so they become equivalent without an asserted `EquivalentClasses` axiom, (b) a class `C` inferred equivalent to a complex expression via a GCI cycle, (c) a class inferred equivalent to two distinct named classes, (d) a pair of classes `X`/`Y` with an **asserted** `EquivalentClasses(X Y)` axiom *plus* an independent `SubClassOf(X Y)` + `SubClassOf(Y X)` cycle, so the reasoner also entails their equivalence via a second, unrelated path — proving the exclusion filter (FR-003) correctly suppresses this pair since it is already intentional, and (e) a class `Z` related to `owl:Thing` only via `SubClassOf(owl:Thing Z)` so `Z` becomes inferred equivalent to `owl:Thing` — per quickstart.md's Setup section

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The reasoner-to-model data pipeline that every user story depends on. No user-visible behavior yet — the Entity Editor UI is untouched in this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Write failing Vitest tests in `src/reasoner/ReasonerBridge.test.ts` asserting that a mock classify JSON response containing an `equivalentClasses` array (per `contracts/inferred-equivalent-classes.md`) is returned as part of `ClassificationResult`
- [X] T004 Extend `ClassificationResult` in `src/reasoner/ReasonerBridge.ts` (currently `consistent`/`incoherentClasses`/`hierarchy`, lines 9-14) with a new `equivalentClasses: EquivalentClassEntry[]` field and an exported `EquivalentClassEntry { classIri: string; equivalentClassIri?: string; equivalentClassExpression?: string }` type, to make T003 pass (depends on T003)
- [X] T005 [P] Add an `equivalentClasses` field (`List<Map<String,String>>` or equivalent) to the nested `ClassificationResult` class in `java-server/src/main/java/org/ihtsdo/ontoeditor/OntologyService.java` (lines 35-46), including its constructor parameter
- [X] T006 Implement per-class inferred-equivalent-class computation inside `OntologyService.buildClassificationResult`, per research.md Decision 1: iterate every named class in `ontology.getClassesInSignature()` (not just the hierarchy BFS's visited set, so `owl:Thing`-equivalent classes aren't skipped), call `reasoner.getEquivalentClasses(cls)`, drop the class itself and any class already covered by an asserted `EquivalentClasses` axiom, and for complex expressions, only test candidates appearing on **both** sides of a `SubClassOf` relationship with the class (a genuine two-way GCI cycle) — benchmarked against `test-ontologies/anatomy.owl` (~75k classes) and revised after the naive one-directional-candidate approach caused an `OutOfMemoryError` at that scale (depends on T005)
- [X] T007 Include the `equivalentClasses` list built by T006 in the JSON-RPC classify response in `ReasonerServer.classify` (`java-server/.../ReasonerServer.java:95-128`, alongside the existing `consistent`/`incoherentClasses`/`hierarchy` fields) (depends on T006)
- [X] T008 [P] Write failing Vitest tests in new file `src/commands/classifyOntology.test.ts` covering: grouping `result.equivalentClasses` entries by `classIri` into `model.inferredEquivalentClasses`, splitting named (`equivalentClassIri`) vs. complex (`equivalentClassExpression`) targets per class, and correctly handling multiple entries for the same class
- [X] T009 [P] Add `inferredEquivalentClasses: Map<string, { iris: string[]; expressions: string[] }>` to the ontology model interface in `src/model/OntologyModel.ts` (adjacent to the existing `inferredSubClasses` field, lines 124-129)
- [X] T010 Populate `model.inferredEquivalentClasses` in `src/commands/classifyOntology.ts` from `result.equivalentClasses`, at the same point the command already builds `model.inferredSubClasses` from `result.hierarchy` (lines ~55-70), to make T008 pass (depends on T004, T008, T009)

**Checkpoint**: The reasoner now computes and the extension host now stores inferred-equivalent-class data end-to-end. No UI changes yet — user story work can begin.

---

## Phase 3: User Story 1 - Spot an unintended equivalence after classification (Priority: P1) 🎯 MVP

**Goal**: Opening a classified class that has an unintended inferred equivalence shows a **read-only**, red "Inferred Equivalent Class" section, positioned between GCI and DisjointWith, supporting a single named class, a complex expression, or multiple named classes, rendered with the same Manchester-syntax highlighting and clickable entity references as the EquivalentTo Axioms section.

**Independent Test**: Using the `inferred-equivalent-fixture.ofn` fixture from T002, run "Classify Ontology," open class `A` (and `B`, and `C`) in the Entity Editor, and confirm the section appears in the right position showing the expected content (named/complex/multi-class), styled red, and non-editable — for the named-class, complex-expression, and multi-class cases.

> **Note**: Read-only rendering (FR-009) and full visual/interactive parity with EquivalentTo (FR-005) are delivered here, in the MVP, rather than deferred to User Story 3 — an editable "error" field whose edits are silently discarded on save would be misleading, not just incomplete, so this must hold from the first shippable checkpoint.

### Tests for User Story 1

- [X] T011 [P] [US1] Write failing Vitest tests in `src/views/EntityEditorPanel.test.ts` asserting that, given a model with non-empty `model.inferredEquivalentClasses` entries for a class, the built `LoadEntityMessage` for that class includes populated `inferredEquivalentClassIris` and `inferredEquivalentClassExpressions` (with corresponding entries in `expressionEntityRefs['inferredEquivalentClassExpressions']` for complex expressions)
- [X] T012 [P] [US1] Write a failing test (new colocated test file, e.g. `webview-src/entity-editor/readOnlyExpressionEntry.test.ts`, following the pattern of `webview-src/entity-editor/createValueWidget.test.ts`) verifying a read-only expression-entry renderer displays Manchester-syntax-highlighted text with clickable entity decorations but omits the "+" add button and "×" delete button, and marks the underlying CodeMirror editor non-editable

### Implementation for User Story 1

- [X] T013 [US1] Add `inferredEquivalentClassIris?: string[]` and `inferredEquivalentClassExpressions?: string[]` fields to `LoadEntityMessage` in `src/views/EntityEditorMessages.ts` (adjacent to the existing `equivalentClassIris`/`equivalentClassExpressions`/`gciExpressions` fields)
- [X] T014 [US1] In `src/views/EntityEditorPanel.ts`'s class-payload builder (lines ~1058-1074), populate `payload.inferredEquivalentClassIris` from `model.inferredEquivalentClasses.get(cls.iri)?.iris` and `payload.inferredEquivalentClassExpressions` via `renderExpressionsWithRefs('inferredEquivalentClassExpressions', ...)`, mirroring the existing `equivalentClassExpressions`/`gciExpressions` pattern, to make T011 pass (depends on T010, T013)
- [X] T015 [P] [US1] Add a `readOnly` option to `createExpressionEntry`/`renderExpressionSection` (or introduce a dedicated read-only counterpart) in `webview-src/entity-editor/EntityEditorApp.ts` that suppresses the add/delete controls and configures the underlying CodeMirror editor as non-editable, while reusing the existing Manchester-syntax language and clickable-entity decorations, to make T012 pass (depends on T012; independent of T013/T014 — different concern, same file, no shared state)
- [X] T016 [US1] In `webview-src/entity-editor/EntityEditorApp.ts`'s `case 'class':` block, add a new render call for an "Inferred Equivalent Class" section positioned between the existing GCI call (lines 1518-1520) and the `renderIriListSection(content, 'DisjointWith', 'disjointClassIris')` call (line 1521), using the read-only variant from T015 to render `msg.inferredEquivalentClassIris` (quoted named-class labels, mirroring the existing `namedEquivLabels`/`namedEquivRefs` construction) together with `msg.inferredEquivalentClassExpressions` (depends on T014, T015)
- [X] T017 [US1] Add an `.inferred-equivalent-error` CSS rule inside `EntityEditorApp.ts`'s existing style block (adjacent to the `#draft-error-banner`/`.expression-delete-btn` error-color rules), applying `var(--vscode-errorForeground, #f48771)` to the new section's heading and content, and apply the class to the section created in T016 (depends on T016)

**Checkpoint**: User Story 1 is fully functional and independently testable — a classified class with an unintended equivalence (named, complex, or multi-class) is visibly flagged in red, read-only, in the correct position, with clickable entity references matching the EquivalentTo section.

---

## Phase 4: User Story 2 - No visual clutter when there is nothing wrong (Priority: P2)

**Goal**: The Inferred Equivalent Class section never renders (no heading, no empty placeholder) for a class with nothing to flag, for any class when the ontology hasn't been classified, or when the classification is stale.

**Independent Test**: Open a class with no unintended inferred equivalence (or any class before ever running "Classify Ontology") and confirm no "Inferred Equivalent Class" heading appears anywhere in the Entity Editor.

### Tests for User Story 2

- [X] T018 [P] [US2] Write failing Vitest tests in `src/views/EntityEditorPanel.test.ts` asserting `inferredEquivalentClassIris`/`inferredEquivalentClassExpressions` are omitted (`undefined`, not empty arrays) from `LoadEntityMessage` when: (a) the class has no entries in `model.inferredEquivalentClasses`, (b) `model.isClassified` is `false`, or (c) `model.classificationNeedsUpdate` is `true`

### Implementation for User Story 2

- [X] T019 [US2] In `src/views/EntityEditorPanel.ts`, guard the population added in T014 so the two fields are set only when `model.isClassified && !model.classificationNeedsUpdate` and the per-class lookup is non-empty; otherwise leave both fields `undefined`, to make T018 pass (depends on T014, T018)
- [X] T020 [US2] In `webview-src/entity-editor/EntityEditorApp.ts`, make the render call added in T016 conditional: skip creating the "Inferred Equivalent Class" section entirely (no heading, no DOM node) whenever both `msg.inferredEquivalentClassIris` and `msg.inferredEquivalentClassExpressions` are empty or absent (depends on T016, T019)

**Checkpoint**: User Stories 1 and 2 together mean the section appears exactly when — and only when — there is something to flag.

---

## Phase 5: User Story 3 - Consistent, familiar reading experience (Priority: P3)

**Goal**: Guarantee, with an explicit regression test, that the Inferred Equivalent Class section (already rendered read-only with full EquivalentTo-style parity as of User Story 1) can never be picked up by the webview's save/dirty-check logic — closing the loop on FR-009's "never synced back to the source file" guarantee with a permanent test, not just current behavior.

**Independent Test**: With the section visible (per US1) and hidden-when-empty (per US2), attempt to interact with the section's content, then save; confirm the "unsaved changes" indicator never activates and no `inferredEquivalentClass*` data appears in any outbound message from the webview.

### Tests for User Story 3

- [X] T021 [P] [US3] Write a failing test asserting the section key used by the Inferred Equivalent Class section (e.g. `inferredEquivalentClassExpressions`) is never read by `getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts` (lines ~1581-1599), so it can never appear in the save/dirty-check payload

### Implementation for User Story 3

- [X] T022 [US3] Audit the render call from T016/T020 and `getCurrentState()` to confirm the Inferred Equivalent Class section's key is never registered for save/dirty-tracking; if any code path could pick it up, add an explicit exclusion, to make T021 pass (depends on T016, T020, T021)

**Checkpoint**: All three user stories are complete. The section behaves and reads exactly like EquivalentTo Axioms, except red, read-only, and positioned between GCI and DisjointWith, with a standing regression test guarding its read-only guarantee.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and repo quality-gate compliance across all stories (per root `CLAUDE.md`'s task-completion quality gates)

- [X] T023 [P] Run all seven manual verification scenarios from `specs/025-show-inferred-equivalent-class/quickstart.md` against the fixture ontology from T002 in the Extension Development Host
- [ ] T024 [P] Run `npm test -- --coverage` (or the project's existing coverage invocation) and confirm coverage remains above the repo's 80% quality gate for all newly touched files
- [X] T025 Run the large-ontology benchmark (`test-ontologies/bfo-core.ofn`) through "Classify Ontology" and confirm classification time is not materially regressed by the new per-class equivalence computation (plan.md Performance Goals)
- [X] T026 [P] Add a one-line entry to `CLAUDE.md`'s "Recent Changes" section summarizing this feature, following the existing entry format (e.g. the `024-show-direct-supertypes` entry)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (needs the fixture ontology from T002 for later verification, though pipeline code itself has no hard dependency on T002) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion (needs `model.inferredEquivalentClasses` populated)
- **User Story 2 (Phase 4)**: Depends on Foundational completion; refines the payload/render logic User Story 1 introduces (T014, T016) — build after US1 for a coherent diff, though its tests (T018) could be written in parallel with US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion and on the render call existing (T016, T020); adds a permanent regression guard rather than new rendering behavior
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories — deliverable as a standalone MVP once Foundational is done, and already fully compliant with FR-005/FR-009 (read-only, EquivalentTo-style rendering) at this checkpoint
- **User Story 2 (P2)**: Builds on the specific fields/render call US1 introduces (T014, T016); not independently meaningful without US1 existing first
- **User Story 3 (P3)**: Builds on the render call US1/US2 introduce (T016, T020); not independently meaningful without US1 existing first

### Within Each Phase

- Tests are written and confirmed failing before the implementation task(s) that satisfy them
- Java-side changes (no test infrastructure) proceed in a strict sequential chain: field → computation → JSON-RPC wiring
- TypeScript-side changes follow test-first ordering per repo TDD convention

### Parallel Opportunities

- T002 (fixture ontology) can be built in parallel with T003-T010 (Foundational pipeline code)
- Within Foundational: T003 (ReasonerBridge test), T005 (Java field), T008 (classifyOntology test), and T009 (OntologyModel field) can all start in parallel — each is a different file with no dependency on another incomplete Foundational task
- Within User Story 1: T011 (panel payload test) and T012 (read-only renderer test) can run in parallel; T015 (read-only renderer implementation) can proceed in parallel with T013/T014 (payload plumbing), since they touch different concerns before converging at T016
- Within User Story 2: T018 (test) can be written in parallel with User Story 1's implementation tasks, since it only depends on Foundational, not on T014/T016 being finished

---

## Parallel Example: Foundational Phase

```bash
# Launch independent Foundational starting points together:
Task: "Write failing Vitest tests in src/reasoner/ReasonerBridge.test.ts for the new equivalentClasses field"
Task: "Add equivalentClasses field to OntologyService.ClassificationResult in java-server/.../OntologyService.java"
Task: "Write failing Vitest tests in src/commands/classifyOntology.test.ts for inferredEquivalentClasses grouping"
Task: "Add inferredEquivalentClasses field to the ontology model interface in src/model/OntologyModel.ts"
```

## Parallel Example: User Story 1

```bash
# Launch both User Story 1 test tasks together:
Task: "Write failing EntityEditorPanel payload test in src/views/EntityEditorPanel.test.ts"
Task: "Write failing read-only expression-entry renderer test in webview-src/entity-editor/readOnlyExpressionEntry.test.ts"

# Once tests are in place, payload plumbing and the read-only renderer can proceed in parallel:
Task: "Add LoadEntityMessage fields in src/views/EntityEditorMessages.ts, then populate them in EntityEditorPanel.ts"
Task: "Add readOnly option to createExpressionEntry/renderExpressionSection in EntityEditorApp.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: manually confirm the fixture ontology's classes show the red, read-only section correctly (quickstart.md Scenarios 1-2, 4); note the section will still show even for classes with nothing to flag until User Story 2 lands — acceptable for an MVP demo, not for release. Unlike an earlier draft of this plan, FR-009 (read-only) is *not* deferred, so this MVP has no misleading-edit risk.
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → data pipeline ready, nothing visible yet
2. Add User Story 1 → section appears correctly, red, read-only, and EquivalentTo-consistent for classes with unintended equivalences (MVP)
3. Add User Story 2 → section correctly disappears everywhere else (release-ready for the core error-flagging behavior)
4. Add User Story 3 → permanent regression test guarding the read-only/no-dirty-tracking guarantee already delivered in US1
5. Polish → manual quickstart validation, coverage check, large-ontology benchmark, changelog note

---

## Notes

- [P] tasks touch different files and have no unmet same-phase dependency
- [Story] labels map each Phase 3+ task to its user story for traceability
- No Java unit tests exist in this repository (per root `CLAUDE.md`); Java-side tasks (T005-T007) are verified via the manual quickstart scenarios (T023) and the large-ontology benchmark (T025) rather than an automated test task
- Every task that touches `EntityEditorPanel.ts`/`OntologyModel.ts`/`ReasonerBridge.ts`/`classifyOntology.ts` must keep existing fields (`inferredSubClasses`, `equivalentClassIris`, etc.) untouched — this feature is strictly additive
- Avoid: rendering the new section as editable, including its section key in `getCurrentState()`, or introducing any new write-back path to the OWL source file (FR-009 is non-negotiable and enforced starting at User Story 1, not deferred to User Story 3)
