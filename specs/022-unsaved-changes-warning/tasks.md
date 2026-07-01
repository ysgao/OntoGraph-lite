# Tasks: Unsaved Entity Editor Changes Warning (022)

**Input**: Design documents from `specs/022-unsaved-changes-warning/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/webview-ipc.md ✅, quickstart.md ✅

**Tests**: Included — the plan specifies TDD (red before green) per the project constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the three new IPC message types that all other tasks depend on.

- [x] T001 Add `QueryDirtyMessage`, `RequestSaveMessage` to `ExtensionToWebviewMessage` union in `src/views/EntityEditorMessages.ts`
- [x] T002 Add `DirtyStateMessage` (`{ type: 'dirtyState'; isDirty: boolean }`) to `WebviewToExtensionMessage` union in `src/views/EntityEditorMessages.ts`

**Checkpoint**: Message types compile — run `npm run compile` to verify before proceeding.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required by all user stories — the guard function and the webview's baseline-state fix.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Write failing unit tests for `guardedShowEntityInfo()` covering all 7 scenarios from plan.md Section E (no panel, same IRI, clean editor, dirty+Discard, dirty+Cancel, dirty+Save success, dirty+Save failure) in `src/views/__tests__/entityEditorDirtyGuard.test.ts` — confirm tests fail before continuing
- [x] T004 Write failing unit tests for the webview `queryDirty` handler (returns `isDirty=false` when state matches baseline, returns `isDirty=true` when state differs) in `src/views/__tests__/entityEditorDirtyGuard.test.ts`
- [x] T005 Write failing unit tests verifying `renderEntity()` sets `lastSavedStateString` so the editor starts clean after load in `src/views/__tests__/entityEditorDirtyGuard.test.ts`
- [x] T006 Add module-level state `pendingNavigationIri: string | null` and `dirtyQueryResolve: ((isDirty: boolean) => void) | null` to `src/views/EntityEditorPanel.ts`
- [x] T007 Implement `queryDirty(panel: vscode.WebviewPanel): Promise<boolean>` in `src/views/EntityEditorPanel.ts` — sends `{ type: 'queryDirty' }` to webview, stores resolver in `dirtyQueryResolve`, returns promise
- [x] T008 Handle `'dirtyState'` message in the `handleMessage()` switch in `src/views/EntityEditorPanel.ts` — calls and clears `dirtyQueryResolve` with `msg.isDirty`
- [x] T009 Confirm or create accessor helpers `getPanel(): vscode.WebviewPanel | undefined`, `getLastIri(): string | undefined`, and `getEntityLabel(model: OntologyModel, iri: string): string | undefined` in `src/views/EntityEditorPanel.ts`; then implement and **export** `guardedShowEntityInfo()` per plan.md § Implementation Design → C, covering early exits for no-panel / same-IRI / clean-editor, modal dialog, and Save/Discard/Cancel dispatch
- [x] T010 Augment the `'save'` case in `handleMessage()` in `src/views/EntityEditorPanel.ts` — after the existing save-success path, check `pendingNavigationIri`; if set, call `showEntityInfo(pendingNavigationIri)` and clear the field; on write failure, clear `pendingNavigationIri` and show an error notification without navigating
- [x] T011 Handle `'queryDirty'` in the webview message listener in `webview-src/entity-editor/EntityEditorApp.ts` — compute `isDirty = JSON.stringify(getCurrentState()) !== lastSavedStateString` and call `vscode.postMessage({ type: 'dirtyState', isDirty })`
- [x] T012 Handle `'requestSave'` in the webview message listener in `webview-src/entity-editor/EntityEditorApp.ts` — call `handleSave()`
- [x] T013 Fix `renderEntity()` in `webview-src/entity-editor/EntityEditorApp.ts` — add `lastSavedStateString = JSON.stringify(getCurrentState())` at the end of the function so the editor starts clean after any entity load
- [x] T014 Run `npm run compile && npm run compile:webview` — fix any type errors before proceeding

**Checkpoint**: `npm test` passes (tests from T003–T005 now green). Foundation ready.

---

## Phase 3: User Story 1 — Warned Before Switching Entity (Priority: P1) 🎯 MVP

**Goal**: When the user selects a different entity in any sidebar tree panel while the editor has unsaved changes, a Save/Discard/Cancel dialog appears before the entity focus changes.

**Independent Test**: Open `test-ontologies/animals.omn`, edit `Animal`'s label, click `Dog` in the tree — dialog must appear. Follow all quickstart.md scenarios for Story 1.

### Implementation for User Story 1

- [x] T015 [US1] Replace `showEntityInfo(context, activeModel, iri)` in `onEntitySelected()` (~line 72) with `await guardedShowEntityInfo(context, activeModel, iri, () => revealInTreeView(capturedCurrentIri))` in `src/extension.ts` — capture `lastIri` as `capturedCurrentIri` before the guard call so Cancel can restore tree selection
- [x] T016 [US1] Replace `showEntityInfo(context, activeModel, iri)` in the `ontograph.focusEntity` command handler (~line 406) with `await guardedShowEntityInfo(context, activeModel, iri)` in `src/extension.ts`
- [x] T017 [US1] Replace `showEntityInfo(context, activeModel, iri)` in the `ontograph.entityEditor` command handler (~line 525) with `await guardedShowEntityInfo(context, activeModel, iri)` in `src/extension.ts`
- [x] T018 [US1] Run `npm run build && npm run compile` — resolve all type/build errors
- [ ] T019 [US1] Manual E2E: verify quickstart.md golden-path scenarios (Save, Discard, Cancel, No-warning-when-clean, No-warning-when-no-edits) against `test-ontologies/animals.omn`

**Checkpoint**: User Story 1 independently testable — dialog appears on tree click; all three choices work correctly.

---

## Phase 4: User Story 2 — Warning on Back/Forward Navigation (Priority: P2)

**Goal**: The same Save/Discard/Cancel guard fires when the user presses the Back (←) or Forward (→) entity navigation buttons while the editor has unsaved changes.

**Independent Test**: Edit `Cat`'s label, press the Back button — dialog must appear. Choosing Save or Discard completes navigation; Cancel stays on `Cat`.

### Implementation for User Story 2

- [x] T021 [US2] Replace `showEntityInfo(context, activeModel, iri)` in the `ontograph.navigateBack` command handler (~line 425) with `await guardedShowEntityInfo(context, activeModel, iri)` in `src/extension.ts`
- [x] T022 [US2] Replace `showEntityInfo(context, activeModel, iri)` in the `ontograph.navigateForward` command handler (~line 436) with `await guardedShowEntityInfo(context, activeModel, iri)` in `src/extension.ts`
- [x] T023 [US2] Run `npm run build && npm run compile` — resolve any remaining type errors
- [ ] T024 [US2] Manual E2E: verify quickstart.md Back/Forward navigation test scenario against `test-ontologies/animals.omn` — navigate Animal → Dog → Cat, edit Cat, press Back, verify dialog; test Save and Cancel outcomes

**Checkpoint**: User Story 2 independently testable — dialog appears on Back/Forward; navigation history is not corrupted on Cancel.

---

## Phase 5: User Story 3 — No Warning When No Changes Exist (Priority: P1)

**Goal**: When the Entity Editor has no unsaved changes, all navigation paths (tree click, Back, Forward, focus) proceed silently without any dialog.

**Independent Test**: Save all edits then click another entity — no dialog. Click an entity without editing — no dialog.

### Implementation for User Story 3

- [x] T025 [US3] Verify the `isDirty = false` early-exit path in `guardedShowEntityInfo()` — ensure it does NOT call `queryDirty()` when the panel is absent or the IRI is the same in `src/views/EntityEditorPanel.ts`
- [x] T026 [US3] Verify `renderEntity()` fix (T013) sets `lastSavedStateString` correctly — after load, `JSON.stringify(getCurrentState()) === lastSavedStateString` must be `true` in `webview-src/entity-editor/EntityEditorApp.ts`
- [ ] T027 [US3] Manual E2E: verify quickstart.md negative tests (no-warning-when-clean, no-warning-when-no-edits) and edge case (revert-to-original) against `test-ontologies/animals.omn`

**Checkpoint**: User Story 3 independently testable — zero false-positive dialogs on clean-state navigation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, edge-case hardening, and type safety audit.

- [x] T028 Implement FR-010 reload advisory: in the ontology reload path in `src/extension.ts` (and/or `src/views/EntityEditorPanel.ts`), check if the editor is dirty before discarding; if dirty, call `vscode.window.showInformationMessage('Ontology reloaded — your unsaved edits have been discarded.')` after the reload completes
- [x] T029 [P] Run full test suite `npm test` — all existing tests must still pass; new tests from T003–T005 must pass
- [x] T030 Verify edge case: cancel path calls `revealInTreeView` only when a `cancelRevealCallback` is provided — test with `focusEntity` (no callback) and `onEntitySelected` (with callback) to confirm no exceptions
- [x] T031 Verify save-failure path: if `queueSyncWrite` throws, `pendingNavigationIri` is cleared and an error notification is shown in `src/views/EntityEditorPanel.ts`
- [x] T032 [P] Verify `dirtyQueryResolve` is always cleared to `null` after resolution — no stale resolvers left from a late `dirtyState` reply; inspect `handleMessage` `'dirtyState'` case in `src/views/EntityEditorPanel.ts`
- [x] T033 Run `npm run build` (production build) — confirm all seven bundles compile without warnings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (message types must exist for type-checking)
- **Phase 3 (US1)**: Depends on Phase 2 — uses `guardedShowEntityInfo()`
- **Phase 4 (US2)**: Depends on Phase 2 — uses `guardedShowEntityInfo()`; can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 — validates the clean-state path; can run in parallel with Phases 3 & 4
- **Phase 6 (Polish)**: Depends on Phases 3, 4, and 5

### User Story Dependencies

- **US1 (P1, tree navigation)**: Can start after Phase 2 — no dependency on US2 or US3
- **US2 (P2, Back/Forward)**: Can start after Phase 2 — no dependency on US1 or US3
- **US3 (P1, no false positives)**: Can start after Phase 2 — validates the negative path already built in Phase 2

### Within Each Phase

- Tests (T003–T005) MUST be written and **fail** before implementation tasks T006–T013
- T006–T008 (state + `queryDirty` + `dirtyState` handler) must complete before T009 (`guardedShowEntityInfo`)
- T009–T010 must complete before T015–T018 (callsite replacements)
- T011–T013 (webview changes) can run in parallel with T006–T010 (extension changes)

---

## Parallel Opportunities

### Phase 2 Parallelism

```
T003, T004, T005 — test writing is sequential (all write to the same file; do NOT run in parallel to avoid merge conflicts)
T006, T007, T008 — extension-side state/message changes (sequential within EntityEditorPanel.ts)
T011, T012, T013 — webview changes in EntityEditorApp.ts (can run in parallel with T006–T008)
T014 — compile check (runs after T006–T013)
```

### Phase 3–5 Parallelism

Once Phase 2 is complete, all three user story phases can proceed in parallel:

```
Phase 3 (US1): T015, T016, T017, T018, T019 — all modify extension.ts callsites (sequential per file)
Phase 4 (US2): T021, T022 — can start immediately alongside Phase 3
Phase 5 (US3): T025, T026, T027 — validation tasks, mostly read-only
```

---

## Implementation Strategy

### MVP (User Stories 1 + 3 — both P1)

1. Complete Phase 1 (T001–T002)
2. Complete Phase 2 (T003–T014) — foundational guard logic
3. Complete Phase 3 (T015–T019) — tree-click navigation guarded
4. Complete Phase 5 (T025–T027) — confirm no false-positive dialogs (US3 is P1, same as US1)
5. **STOP and VALIDATE**: Run quickstart.md golden-path + negative scenarios
6. Ship US1+US3 — zero silent data loss on sidebar tree clicks, zero false positives

### Incremental Delivery

1. Phase 1 + 2 → Guard infrastructure ready
2. Phase 3 (US1) → Sidebar tree clicks guarded → Demo/validate
3. Phase 4 (US2) → Back/Forward guarded → Demo/validate
4. Phase 5 (US3) → Negative-path verified → Full feature complete
5. Phase 6 (Polish) → Production-ready

---

## Notes

- `[P]` tasks = different files or independent test blocks; no data conflicts
- Each user story is independently deliverable after Phase 2 completion
- TDD: all test tasks (T003–T005) must be written and **confirmed failing** before implementation tasks (T006–T013) begin
- Run `npm run compile && npm run compile:webview` after each phase to catch type errors early
- The `renderEntity()` baseline fix (T013) also resolves a pre-existing bug where the Save button was always enabled after entity load
