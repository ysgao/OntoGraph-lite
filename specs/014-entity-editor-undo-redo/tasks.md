# Tasks: Entity Editor Undo/Redo

**Input**: Design documents from `/specs/014-entity-editor-undo-redo/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Included — Test-First is NON-NEGOTIABLE per the OntoGraph Constitution (Principle I).  
**Format**: `[ID] [P?] [Story?] Description — file path`

## Phase 1: Setup — Message Type Extensions

**Purpose**: Add the three new message types and the `EntitySnapshot` shared type to the existing message bus. All subsequent phases depend on these types.

- [x] T001 Add `EntitySnapshot` type, `UndoRequestMessage`, `RedoRequestMessage`, `UndoRedoStateMessage`, and `restoreContext?: 'undo' | 'redo'` field on `LoadEntityMessage` to `src/views/EntityEditorMessages.ts`

**Checkpoint**: `npm run compile` reports zero new type errors.

---

## Phase 2: Foundational — EntityEditHistory Class

**Purpose**: Implement the core undo/redo stack. Every user story depends on this class. Test-First mandatory (Red → Green).

**⚠️ CRITICAL**: No user story work can begin until T002–T003 are complete and all tests pass.

- [x] T002 **[RED]** Write failing unit tests for `EntityEditHistory` in `src/views/EntityEditHistory.test.ts` covering: `push()` adds to undoStack, `canUndo`/`canRedo` flags, `undo()` moves snapshot from undoStack→redoStack and returns it, `redo()` moves from redoStack→undoStack and returns it, `push()` clears redoStack, initial state has `canUndo=false` and `canRedo=false` — run `npm test -- src/views/EntityEditHistory.test.ts` and confirm all tests FAIL before proceeding
- [x] T003 **[GREEN]** Implement `EntityEditHistory` class (with `push`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`) in `src/views/EntityEditHistory.ts` — run `npm test -- src/views/EntityEditHistory.test.ts` and confirm all tests PASS

**Checkpoint**: `EntityEditHistory` fully tested and passing. `npm run compile` clean.

---

## Phase 3: User Story 1 — Undo Last Save (Priority: P1) 🎯 MVP

**Goal**: User can save an entity, then click Undo to restore the pre-save state in the editor. Undo button is disabled before any save.

**Independent Test**: Open `animals.omn`, edit and save `Animal`'s label, click Undo → label reverts. Undo button then disabled.

### Tests for User Story 1 (RED — write and confirm FAIL before implementing T005–T010)

- [x] T004 **[RED]** Write failing tests in `src/views/EntityEditorPanel.test.ts` for: (a) `historyMap` initialised on entity load with `canUndo=false`, (b) after save message, `canUndo=true` and `UndoRedoStateMessage(canUndo:true, canRedo:false)` sent to webview, (c) after `undoRequest`, the prior snapshot is sent as `LoadEntityMessage(restoreContext:'undo')` and `UndoRedoStateMessage(canUndo:false)` is sent — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm FAIL

### Implementation for User Story 1

- [x] T005 Add `private readonly historyMap = new Map<string, EntityEditHistory>()` field and import `EntityEditHistory` in `src/views/EntityEditorPanel.ts`
- [x] T006 Extract a private `snapshotEntity(iri: string): EntitySnapshot` helper that reads the current entity state from the model (reuse logic from existing `sendLoadEntity`/load path) in `src/views/EntityEditorPanel.ts`
- [x] T007 In the entity-load path (where `LoadEntityMessage` is sent to the webview), create a fresh `EntityEditHistory`, store it in `historyMap`, and send `UndoRedoStateMessage(canUndo:false, canRedo:false)` in `src/views/EntityEditorPanel.ts`
- [x] T008 In the save handler, call `snapshotEntity()` before applying the save, push the snapshot to the entity's `EntityEditHistory`, then send `UndoRedoStateMessage(canUndo:true, canRedo:false)` to the webview after the save completes in `src/views/EntityEditorPanel.ts`
- [x] T009 Handle `undoRequest` message in `EntityEditorPanel.handleMessage()`: call `history.undo()`, send the returned snapshot as `LoadEntityMessage` with `restoreContext:'undo'`, send `UndoRedoStateMessage` reflecting new `canUndo`/`canRedo` in `src/views/EntityEditorPanel.ts`
- [x] T010 [P] Add Undo toolbar button (initially `disabled`) to the entity editor toolbar and wire click handler to `postMessage({ type: 'undoRequest' })`; handle `undoRedoState` message to set `undoBtn.disabled = !canUndo` in `webview-src/entity-editor/EntityEditorApp.ts`

**Checkpoint**: T004 tests now PASS. Manually verify Scenario 1 from `quickstart.md`. `npm run compile` clean.

---

## Phase 4: User Story 2 — Redo After Undo (Priority: P2)

**Goal**: After undoing, user can click Redo to re-apply the undone save. Redo disabled when no undo has been performed.

**Independent Test**: Save twice, undo twice, redo once → editor shows second saved state. Redo then disabled.

### Tests for User Story 2 (RED — write and confirm FAIL before implementing T012–T014)

- [x] T011 **[RED]** Write failing tests in `src/views/EntityEditorPanel.test.ts` for: (a) after undo then `redoRequest`, the redo snapshot is sent as `LoadEntityMessage(restoreContext:'redo')` and `UndoRedoStateMessage(canRedo:false)` sent, (b) after undo then new save, `UndoRedoStateMessage(canRedo:false)` is sent and redo stack is empty — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm FAIL

### Implementation for User Story 2

- [x] T012 Handle `redoRequest` message in `EntityEditorPanel.handleMessage()`: call `history.redo()`, send returned snapshot as `LoadEntityMessage` with `restoreContext:'redo'`, send `UndoRedoStateMessage` reflecting new `canUndo`/`canRedo` in `src/views/EntityEditorPanel.ts`
- [x] T013 In the save handler, after `history.push()`, verify `EntityEditHistory.push()` already clears redoStack (from T003) — add assertion test if not covered; confirm `UndoRedoStateMessage(canRedo:false)` is sent after every save in `src/views/EntityEditorPanel.ts`
- [x] T014 [P] Add Redo toolbar button (initially `disabled`) to entity editor toolbar and wire click to `postMessage({ type: 'redoRequest' })`; handle `undoRedoState` to set `redoBtn.disabled = !canRedo` in `webview-src/entity-editor/EntityEditorApp.ts`

**Checkpoint**: T011 tests now PASS. Manually verify Scenarios 2 and 3 from `quickstart.md`. `npm run compile` clean.

---

## Phase 5: User Story 3 — Multi-Step Undo/Redo Traversal (Priority: P3)

**Goal**: User can step through the full N-save checkpoint history. Maximum 50 checkpoints per entity; history is per-entity (isolated); cleared on entity reload.

**Independent Test**: Save 5 distinct states, undo 3×, redo 2× — each step shows the expected values. Undo past the 51st save drops the oldest correctly.

### Tests for User Story 3 (RED — write and confirm FAIL before implementing T016–T018)

- [x] T015 **[RED]** Write failing tests in `src/views/EntityEditHistory.test.ts` for: (a) pushing 51 snapshots retains only 50 (oldest dropped), (b) full undo/redo traversal through N steps returns correct snapshot at each position — run `npm test -- src/views/EntityEditHistory.test.ts` and confirm FAIL
- [x] T016 **[RED]** [P] Write failing tests in `src/views/EntityEditorPanel.test.ts` for: (a) loading entity A, saving, loading entity B — entity A's `historyMap` entry is independent, (b) reloading entity A clears its prior history and `UndoRedoStateMessage(canUndo:false, canRedo:false)` is sent — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm FAIL

### Implementation for User Story 3

- [x] T017 Enforce `maxSize=50` in `EntityEditHistory.push()`: if `undoStack.length >= maxSize`, call `undoStack.shift()` before pushing — run `npm test -- src/views/EntityEditHistory.test.ts` and confirm T015 PASS in `src/views/EntityEditHistory.ts`
- [x] T018 On entity reload (entity load with an IRI that already exists in `historyMap`), call `history.clear()` (or replace the entry with a fresh `EntityEditHistory`) and send `UndoRedoStateMessage(canUndo:false, canRedo:false)` in `src/views/EntityEditorPanel.ts`
- [x] T019 [P] Wire keyboard shortcuts: `keydown` listener in webview — `Ctrl+Z` / `Meta+Z` → `postMessage({ type: 'undoRequest' })` (skip if undo disabled), `Ctrl+Shift+Z` / `Meta+Shift+Z` → `postMessage({ type: 'redoRequest' })` in `webview-src/entity-editor/EntityEditorApp.ts`

**Checkpoint**: T015 and T016 tests now PASS. Manually verify Scenarios 4, 5, 6, 7 from `quickstart.md`. `npm run compile` clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Type safety, coverage gate, and final validation.

- [x] T020 Run `npm run compile` — fix any remaining type errors across all modified files (`src/views/EntityEditorMessages.ts`, `src/views/EntityEditHistory.ts`, `src/views/EntityEditorPanel.ts`, `webview-src/entity-editor/EntityEditorApp.ts`)
- [x] T021 Run `npm test` — verify coverage ≥ 80% on `src/views/EntityEditHistory.ts` and the new code paths in `src/views/EntityEditorPanel.ts`; add targeted tests if coverage is below threshold
- [x] T022 [P] Run `npm run compile:webview` — fix any type errors in the webview bundle (`webview-src/entity-editor/EntityEditorApp.ts`)
- [x] T023 Run all 7 scenarios in `specs/014-entity-editor-undo-redo/quickstart.md` against the built extension and confirm each passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (T001): No dependencies — start immediately
- **Phase 2** (T002–T003): Depends on T001 — BLOCKS all user story phases
- **Phase 3** (T004–T010): Depends on Phase 2 completion
- **Phase 4** (T011–T014): Depends on Phase 3 completion (undo must work before redo is layered on)
- **Phase 5** (T015–T019): Depends on Phase 4 completion
- **Phase 6** (T020–T023): Depends on Phase 5 completion

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 — no dependency on US2/US3
- **US2 (P2)**: Requires US1 extension-side changes (shares `EntityEditorPanel.ts`); `redoRequest` handler builds on the same history object
- **US3 (P3)**: Requires US1+US2 complete; adds depth enforcement and isolation behaviour

### Within Each User Story

1. Write RED tests → confirm FAIL
2. Implement (extension side sequential, webview side [P] with extension)
3. Confirm tests PASS (GREEN)
4. Run `npm run compile` — clean
5. Manual checkpoint verification

### Parallel Opportunities

- **T010** (webview Undo button) can run in parallel with **T005–T009** (extension changes) — different files
- **T014** (webview Redo button) can run in parallel with **T012–T013** (extension changes) — different files
- **T015** and **T016** (RED test writing) can run in parallel — different test files
- **T019** (keyboard shortcuts) can run in parallel with **T017–T018** (extension changes) — different files
- **T020** and **T022** (compile checks) can run in parallel — different tsconfig targets

---

## Parallel Example: User Story 1

```
After T004 RED tests confirmed FAIL:

  Thread A (extension host):
    T005 → T006 → T007 → T008 → T009

  Thread B (webview — different file, no dependency):
    T010

Both threads complete → run npm test → confirm T004 tests PASS
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001
2. Complete Phase 2: T002 → T003 (RED → GREEN on EntityEditHistory)
3. Complete Phase 3: T004 RED → T005–T010 GREEN
4. **STOP and VALIDATE**: Run Scenario 1 + Scenario 5 from quickstart.md
5. Undo is live and shippable as an increment

### Incremental Delivery

1. Phase 1 + 2 → Core history class tested and ready
2. Phase 3 → Undo MVP (US1 shippable)
3. Phase 4 → Add Redo (US1+US2 complete)
4. Phase 5 → Multi-step depth + isolation + keyboard shortcuts (full feature)
5. Phase 6 → Polish gate

---

## Notes

- `[P]` = different files, no blocking dependencies on incomplete same-phase tasks
- `[US#]` maps task to user story for traceability
- RED tasks MUST fail before any GREEN (implementation) task begins — constitution Principle I
- No new runtime dependencies introduced — history stack is plain TypeScript
- `EntityEditHistory.ts` is pure TypeScript with no VS Code API imports — unit-testable without mocking
- `EntityEditorPanel.ts` tests use the existing `vscode` hand-rolled stub per constitution Testing Standards
