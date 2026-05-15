# Tasks: Fix Spurious OWL File Changes on Sync

**Input**: Design documents from `specs/001-fix-sync-data-loss/`
**Branch**: `001-fix-sync-data-loss`

**TDD Requirement**: The OntoGraph Constitution mandates Test-First (Principle I, NON-NEGOTIABLE). Every implementation task MUST be preceded by a failing test task. Do not begin any implementation task until its paired test task's tests are confirmed to fail.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no inter-task dependencies)
- **[US1]**: No-change editing produces no diff
- **[US2]**: Adding annotation produces exact minimal diff
- **[US3]**: Adding logical axiom produces exact minimal diff

---

## Phase 1: Foundational

**Purpose**: No new files or dependencies needed. All changes are modifications to existing sync functions. This phase is a checkpoint — confirm the existing (shallow) test suite passes before beginning.

- [x] T001 Run `npm test` to confirm baseline passes and note current test output for `src/sync/__tests__/AnnotationSync.test.ts` and `src/sync/__tests__/AxiomSync.test.ts`

**Checkpoint**: All existing tests pass — feature work may begin

---

## Phase 2: Fix AnnotationSync — All Formats (US1 + US2)

**Goal**: `AnnotationSync.ts` sync functions are idempotent (US1) and produce a single-line diff when one annotation is added or removed (US2).

**Independent Test**: Open a class in an OWL file that already has at least two annotations. Trigger a save with no changes → `git diff` is empty. Add one annotation → `git diff` shows exactly one added `AnnotationAssertion` line.

### TDD — Functional Syntax (Red phase before Green)

- [x] T002 [US1] [US2] Write failing tests for `syncFunctional` idempotency in `src/sync/__tests__/AnnotationSync.test.ts`:
  - Test: file and model have the same annotations in any order → `applyEdit` is NOT called
  - Test: file has `[definition, rdfs:label]`, model has same → no edit
  - Confirm tests fail before proceeding to T003

- [x] T003 [US1] [US2] Write failing tests for `syncFunctional` order-preservation and minimal diff in `src/sync/__tests__/AnnotationSync.test.ts`:
  - Test: file has `[definition, rdfs:label]`, model adds `altLabel` → exactly one `insert` edit, zero `delete` edits, existing lines untouched
  - Test: file has `[rdfs:label, definition]`, model removes `definition` → exactly one `delete` edit, no other edits
  - Confirm tests fail before proceeding to T004

- [x] T004 86170f7 [US1] [US2] Implement diff-based `syncFunctional` in `src/sync/AnnotationSync.ts`:
  - Build `fileItems: Array<{key: string, lineIdx: number, line: string}>` from all `AnnotationAssertion` lines for the entity; key = `propIri + "|" + text + "|" + (lang ?? "")`
  - Build `modelItems: Map<key, line>` from `entityAnnotationPairs(entity)`
  - `toRemove` = fileItems whose key is absent from modelItems
  - `toAdd` = modelItems entries whose key is absent from the file key set
  - If both empty → return `{ edit: new vscode.WorkspaceEdit(), addedRanges: [] }` with empty edit (or return null)
  - Apply deletions (reverse line order), then insert `toAdd` lines after `fileItems[fileItems.length - 1].lineIdx` (or after cluster header/anchor if no existing annotations)
  - Run tests; confirm T002 and T003 pass

### TDD — Manchester Syntax (Red phase before Green)

- [x] T005 86170f7 [P] [US1] [US2] Write failing tests for `syncManchester` idempotency and order-preservation in `src/sync/__tests__/AnnotationSync.test.ts`:
  - Test: Manchester file and model have same annotations in any order → `applyEdit` NOT called
  - Test: add one annotation → block update appends the new item, existing items appear first in original order
  - Confirm tests fail before T006

- [x] T006 86170f7 [P] [US1] [US2] Implement idempotency and order-preservation in `syncManchester` in `src/sync/AnnotationSync.ts`:
  - After generating `newAnnotBlock`, parse the existing `Annotations:` block in the file into the same normalised item set
  - If the two sets are equal AND the existing block is non-empty → return `null`
  - For order-preservation: collect existing annotation items from the file block; emit unchanged items in document order first, then append new items
  - Run tests; confirm T005 passes

### TDD — Turtle Syntax (Red phase before Green)

- [x] T007 86170f7 [P] [US1] [US2] Write failing tests for `syncTurtle` annotation idempotency and minimal diff in `src/sync/__tests__/AnnotationSync.test.ts`:
  - Test: Turtle file and model have same annotation segments → `applyEdit` NOT called
  - Test: add one annotation segment → single segment added at end, existing segments unmoved
  - Confirm tests fail before T008

- [x] T008 86170f7 [P] [US1] [US2] Implement diff-based annotation handling in `syncTurtle` in `src/sync/AnnotationSync.ts`:
  - Apply same key-based diff used in `syncFunctional` to Turtle predicate segments
  - `toRemove` = existing annotation segments whose key is absent from model
  - `toAdd` = model annotation keys absent from file
  - If both empty → return `null`
  - Rebuild block with structural segs unchanged, then file-ordered unchanged annotations, then `toAdd` at end
  - Run tests; confirm T007 passes

**Checkpoint**: All AnnotationSync tests pass. `git diff` for test ontologies is empty on no-op; shows one line on annotation addition.

---

## Phase 3: Fix AxiomSync — All Formats (US1 + US3)

**Goal**: `AxiomSync.ts` sync functions are idempotent (US1) and produce a single-line diff when one axiom is added or removed (US3).

**Independent Test**: Open a class with an existing SubClassOf axiom. Add one more SubClassOf axiom → `git diff` shows exactly one added axiom line and zero changed or deleted lines.

### TDD — Functional Syntax (Red phase before Green)

- [x] T009 86170f7 [P] [US1] [US3] Write failing tests for `syncAxiomsFunctional` idempotency in `src/sync/__tests__/AxiomSync.test.ts`:
  - Test: file and model have the same axiom set → `applyEdit` NOT called
  - Test: class with SubClassOf + EquivalentClasses unchanged → no edit
  - Confirm tests fail before T011

- [x] T010 86170f7 [P] [US1] [US3] Write failing tests for `syncAxiomsFunctional` minimal diff in `src/sync/__tests__/AxiomSync.test.ts`:
  - Test: class has 3 `SubClassOf` lines, model adds 1 more → diff has exactly one `insert` edit, zero `delete` edits, existing lines untouched
  - Test: `EquivalentClasses` addition inserts before any `SubClassOf` lines (constitution ordering)
  - Test: axiom removal → exactly one `delete` edit
  - Confirm tests fail before T011

- [x] T011 86170f7 [P] [US1] [US3] Implement diff-based `syncAxiomsFunctional` in `src/sync/AxiomSync.ts`:
  - Build `fileAxioms: Array<{normalised: string, lineIdx: number, keyword: string}>` from all regular axiom lines for the entity; normalised = trim whitespace
  - Build `modelAxioms: Array<{normalised: string, keyword: string}>` from `generateFunctionalAxiomLines`
  - `toRemove` = fileAxioms whose normalised content is absent from modelAxioms
  - `toAdd` = modelAxioms entries whose normalised content is absent from fileAxioms
  - If both empty (and GCI diff also empty) → return `null`
  - Delete `toRemove` lines (reverse order)
  - Insert `toAdd` lines: EquivalentClasses after last EquivalentClasses line (or before first SubClassOf if none); SubClassOf after last SubClassOf line; others after last axiom line of matching keyword
  - Apply same no-op check to GCI lines (the existing `gciToDelete`/`gciLines` diff)
  - Run tests; confirm T009 and T010 pass

### TDD — Manchester Syntax (Red phase before Green)

- [x] T012 86170f7 [P] [US1] [US3] Write failing tests for `syncAxiomsManchester` idempotency in `src/sync/__tests__/AxiomSync.test.ts`:
  - Test: Manchester file and model have same axiom sections → `applyEdit` NOT called
  - Test: add one `SubClassOf:` item → only that item appears in the diff
  - Confirm tests fail before T013

- [x] T013 86170f7 [P] [US1] [US3] Implement idempotency checks in `syncAxiomsManchester` in `src/sync/AxiomSync.ts`:
  - After generating `newSections`, compare to the concatenation of existing managed sections extracted from the file
  - If the strings are equal → return `null`
  - Run tests; confirm T012 passes

### TDD — Turtle Combined Sync (Red phase before Green)

- [x] T014 86170f7 [P] [US1] [US3] Write failing tests for `syncAxiomsTurtle` idempotency in `src/sync/__tests__/AxiomSync.test.ts`:
  - Test: Turtle file content unchanged (no annotation or axiom change) → `applyEdit` NOT called
  - Test: add one structural predicate segment → one segment added, others unchanged
  - Confirm tests fail before T015

- [x] T015 86170f7 [P] [US1] [US3] Implement idempotency check in `syncAxiomsTurtle` in `src/sync/AxiomSync.ts`:
  - After building `rebuiltLines`, compare `rebuiltLines.join('\n')` to `lines.slice(blockStart, blockEnd).join('\n')`
  - If equal → return `null`
  - Run tests; confirm T014 passes

**Checkpoint**: All AxiomSync tests pass. `git diff` shows exactly one added line when one axiom is added.

---

## Phase 4: Polish & Verification

**Purpose**: Full suite confirmation, type safety, and manual round-trip verification.

- [x] T016 86170f7 Run `npm test` — all tests pass; coverage ≥ 80% for `src/sync/AnnotationSync.ts` and `src/sync/AxiomSync.ts`

- [x] T017 86170f7 [P] Run `npm run compile` — zero TypeScript errors

- [ ] T018 Manual round-trip verification per `specs/001-fix-sync-data-loss/plan.md §Phase 5`:
  - Open `test-ontologies/animals.omn` → add annotation to a class → confirm `git diff` shows exactly one added line
  - Add SubClassOf axiom → confirm `git diff` shows exactly one added axiom line
  - Open and close entity editor without editing → confirm `git diff` remains empty
  - Repeat with a `.ttl` test file

- [ ] T019 Conductor — Manual Verification 'Fix Spurious OWL File Changes on Sync' per `specs/001-fix-sync-data-loss/plan.md §Phase 5 Task 5.4` (protocol in `conductor/workflow.md`)

- [x] T020 86170f7 [P] Principle IV benchmark — add `src/sync/__tests__/sync-anatomy-bench.test.ts` asserting both sync functions complete a no-op scan of `test-ontologies/anatomy.owl` (302k lines) in < 500ms each

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — start immediately
- **Phase 2**: Depends on Phase 1 checkpoint
- **Phase 3**: Can start in parallel with Phase 2 (different files: AxiomSync vs. AnnotationSync)
- **Phase 4**: Depends on Phase 2 AND Phase 3 completion

### Within Phase 2 — AnnotationSync

```
T002 (write functional tests) → T003 (write functional tests) → T004 (implement functional)
T005 (write Manchester tests) [can start after T002] → T006 (implement Manchester)
T007 (write Turtle tests) [can start after T005] → T008 (implement Turtle)
```

Note: T005, T007 touch the same file (AnnotationSync.test.ts) — write sequentially. T004, T006, T008 each touch AnnotationSync.ts — implement sequentially within their pairs.

### Within Phase 3 — AxiomSync

```
T009+T010 (write functional tests) → T011 (implement functional)
T012 (write Manchester tests) → T013 (implement Manchester)
T014 (write Turtle tests) → T015 (implement Turtle)
```

### Parallel Opportunities

- Phase 2 (AnnotationSync) and Phase 3 (AxiomSync) can run in parallel — they modify different source files
- Within each phase: test-writing and implementation tasks for different formats can overlap once the source file is not being actively modified

---

## Parallel Example: Phase 2 and Phase 3 Concurrently

```
Developer A (AnnotationSync):
  T002 → T003 → T004  (functional annotation fix)
  T005 → T006         (Manchester annotation fix)
  T007 → T008         (Turtle annotation fix)

Developer B (AxiomSync) — starts at same time:
  T009 + T010 → T011  (functional axiom fix)
  T012 → T013         (Manchester axiom fix)
  T014 → T015         (Turtle axiom fix)

Both must complete before Phase 4.
```

---

## Implementation Strategy

### MVP (User Story 1 + 2 minimum)

1. Complete Phase 1 (T001) — baseline passes
2. Complete Phase 2 T002–T004 (functional annotation fix) — US1 and US2 for `.ofn` files
3. **STOP and VALIDATE**: `git diff` is empty on no-op save; shows one line on annotation add for `.ofn`
4. Continue with T005–T008 (Manchester + Turtle annotation)
5. Continue with Phase 3 (AxiomSync)

### Incremental Delivery

- T002–T004: Fixes `.ofn` annotation idempotency and minimal diff (most common format)
- T005–T006: Extends fix to `.omn`
- T007–T008: Extends fix to `.ttl`
- T009–T011: Fixes `.ofn` axiom idempotency and minimal diff
- T012–T015: Extends axiom fix to `.omn` and `.ttl`

---

## Notes

- All test tasks must be confirmed to FAIL before their paired implementation task begins (constitution Principle I)
- Commit after each Red-Green pair (test + implementation) with message format `fix(sync): <description>`
- Attach `git notes add -m "<summary>" <sha>` to each commit per workflow
- Do not mark any task complete until `npm test` passes for all tests in the relevant file
