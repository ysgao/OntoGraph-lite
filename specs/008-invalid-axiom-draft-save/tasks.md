# Tasks: Allow Saving Invalid Axiom Expressions as Drafts

**Input**: Design documents from `/specs/008-invalid-axiom-draft-save/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All tests must be written **first** and confirmed to **fail** before implementation (Constitution §I)

---

## Phase 2: Foundational — Message Protocol

**Purpose**: Extend the webview↔extension message types that all user stories depend on. No story work can begin until T001–T003 are complete.

**⚠️ CRITICAL**: These three protocol changes are prerequisites for every subsequent phase.

- [X] T001 Extend `SaveEntityMessage` with optional `invalidExpressionIndices?: { superClassExpressions?: number[]; equivalentClassExpressions?: number[]; gciExpressions?: number[]; }` in `src/views/EntityEditorMessages.ts`
- [X] T002 Add `SaveDraftErrorMessage` interface `{ type: 'saveDraftError'; invalidExpressions: Array<{ sectionKey: string; index: number; text: string }> }` and add it to the `EntityEditorExtToWebview` union type in `src/views/EntityEditorMessages.ts`
- [X] T003 Add optional `draftExpressions?: Array<{ sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions'; text: string }>` field to `LoadEntityMessage` in `src/views/EntityEditorMessages.ts`

**Checkpoint**: Run `npm run compile` — no type errors. Foundation ready for user story implementation.

---

## Phase 3: User Story 1 — Save Without Breaking Document (Priority: P1) 🎯 MVP

**Goal**: Allow saving an invalid axiom expression as a transient draft without writing it to the OWL document; valid expressions on the same entity are synced normally.

**Independent Test**: Open an entity, type `SomeGibberish and` in a SubClassOf expression, wait for the linter squiggle, click Save — the OWL document must not contain the invalid text, but any other valid expressions must be saved. Verified via Scenario 1 in `quickstart.md`.

### Tests for User Story 1 (write first — must FAIL before T005)

- [X] T004 Write failing tests in `src/views/__tests__/EntityEditorDraft.test.ts`: (a) given a `save` message with `invalidExpressionIndices: { superClassExpressions: [1] }` and `superClassExpressions: ['owl:Thing', 'BAD SYNTAX']`, verify the model's `superClassExpressions` is set to `['owl:Thing']` only (invalid index filtered out); (b) verify the subsequent `loadEntity` `postMessage` includes `draftExpressions: [{ sectionKey: 'superClassExpressions', text: 'BAD SYNTAX' }]`; (c) given a subsequent save with no `invalidExpressionIndices`, verify `loadEntity` omits `draftExpressions` for that IRI

### Implementation for User Story 1

- [X] T005 [US1] Add `interface DraftExpression { text: string; sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions'; }` and module-level `const draftAxioms = new Map<string, DraftExpression[]>();` in `src/views/EntityEditorPanel.ts`, alongside the existing `savedEntityState` Map
- [X] T006 [US1] In the `'save'` case of `handleMessage` in `src/views/EntityEditorPanel.ts`: before applying expression arrays to the model, filter out entries at indices listed in `msg.invalidExpressionIndices` for `superClassExpressions`, `equivalentClassExpressions`, and `gciExpressions`; store the filtered-out texts as `DraftExpression[]` in `draftAxioms.set(msg.iri, [...])`, replacing any previous drafts for that IRI; if `invalidExpressionIndices` is absent or all arrays are empty, call `draftAxioms.delete(msg.iri)` to clear any stale drafts
- [X] T007 [P] [US1] In `handleSave()` in `webview-src/entity-editor/EntityEditorApp.ts`: import `forEachDiagnostic` from `'@codemirror/lint'`; for each expression section (`superClassExpressions`, `equivalentClassExpressions`, `gciExpressions`), iterate the section's CodeMirror editors from `editorMap` and collect zero-based indices where any diagnostic has `severity === 'error'`; include `invalidExpressionIndices` (omit sub-arrays that are empty) in the `save` message posted to the extension host

**Checkpoint**: User Story 1 is independently functional — invalid expressions are never written to the OWL document, valid ones still sync. Run T004 tests: all must pass.

---

## Phase 4: User Story 2 — Red Border on Invalid Draft (Priority: P2)

**Goal**: The axiom input field for each invalid draft is outlined with a persistent red border that clears only when the expression is corrected and saved successfully.

**Independent Test**: After saving an invalid expression, the expression container has the `.draft-invalid` CSS class (red border). Navigate away and back — the red border is restored. Correct the expression and save — the border is gone. Verified via Scenarios 1–3 in `quickstart.md`.

### Tests for User Story 2 (write first — must FAIL before T009)

- [X] T008 [P] Add failing tests to `src/views/__tests__/EntityEditorDraft.test.ts`: (a) after processing a save with invalid indices, verify `p.webview.postMessage` was called with `{ type: 'saveDraftError', invalidExpressions: [{ sectionKey: 'superClassExpressions', index: 1, text: 'BAD SYNTAX' }] }`; (b) verify `loadEntity` includes `draftExpressions: [{ sectionKey: 'superClassExpressions', text: 'BAD SYNTAX' }]` when `draftAxioms` has an entry for the entity IRI; (c) verify `loadEntity` omits `draftExpressions` when `draftAxioms` has no entry for the IRI

### Implementation for User Story 2

- [X] T009 [US2] In the `'save'` case of `handleMessage` in `src/views/EntityEditorPanel.ts`: after storing drafts in `draftAxioms`, if any invalid expressions exist, construct a `SaveDraftErrorMessage` payload listing each draft's `sectionKey`, original index within the full (pre-filter) expression array, and text; post it to the webview via `p.webview.postMessage`
- [X] T010 [US2] In `sendLoadEntity` in `src/views/EntityEditorPanel.ts`: after building the `LoadEntityMessage`, look up `draftAxioms.get(iri)`; if entries exist, set `msg.draftExpressions` to the array of `{ sectionKey, text }` objects before posting
- [X] T011 [US2] In `webview-src/entity-editor/EntityEditorApp.ts`: (a) add a CSS rule `.draft-invalid .expression-editor { outline: 2px solid #f44336; border-color: #f44336; border-radius: 3px; }` inside `injectStyles()`; (b) in the message handler for `saveDraftError`, for each entry in `invalidExpressions`, locate the expression container at `editorMap[sectionKey][index]` and add the `draft-invalid` class to its parent `.expression-entry`; (c) in the `loadEntity` handler, for each entry in `draftExpressions`, render the draft text in its section with the `draft-invalid` class pre-applied after rendering; (d) on `loadEntity` with no `draftExpressions`, remove the `draft-invalid` class from all expression containers

**Checkpoint**: User Stories 1 and 2 both work. Run T004 + T008 tests: all must pass.

---

## Phase 5: User Story 3 — Error Notification Banner (Priority: P3)

**Goal**: A dismissible error banner appears at the top of the entity editor panel immediately after saving an invalid expression, identifying which axiom sections have unsaved drafts.

**Independent Test**: Save an invalid SubClassOf expression — an error banner appears above the content area with text identifying the affected section (e.g., "SubClassOf expressions: 1 invalid draft not saved"). Correct and re-save — the banner is gone. Verified via Scenarios 1–2 in `quickstart.md`.

### Tests for User Story 3 (write first — must FAIL before T013)

- [X] T012 Write failing test in `src/views/__tests__/EntityEditorDraft.test.ts`: verify that after processing a save with invalid indices, `p.webview.postMessage` is called with a `saveDraftError` message whose `invalidExpressions` array is non-empty — confirming the data contract the banner relies on

### Implementation for User Story 3

- [X] T013 [US3] In `webview-src/entity-editor/EntityEditorApp.ts`: add `showDraftErrorBanner(invalidExpressions)` and `removeDraftErrorBanner()` helpers; in the `saveDraftError` message handler, call `showDraftErrorBanner` listing each affected section by human-readable name (`superClassExpressions` → `SubClassOf expressions`) and count of invalid drafts; in the `loadEntity` handler, call `removeDraftErrorBanner()` when the message has no `draftExpressions`; inject `#draft-error-banner` CSS into `injectStyles()` for red-tinted background and border

**Checkpoint**: User Stories 1, 2, and 3 all work. Run all tests to confirm no regressions.

---

## Phase 6: User Story 4 — Blocking Confirmation Dialog (Priority: P4)

**Goal**: Any model-reload operation (classification, consistency check, file change) is blocked by a modal dialog when draft axioms exist, offering entity-name navigation buttons, "Discard and proceed", or "Cancel".

**Independent Test**: With a draft invalid expression, trigger Classify Ontology — a modal VS Code dialog appears before classification runs, listing the affected entity by name. "Discard and proceed" clears the draft and runs classification. Clicking an entity-name button navigates the panel to that entity and aborts classification. "Cancel" aborts and preserves the draft. Verified via Scenarios 4–7 in `quickstart.md`.

### Tests for User Story 4 (write first — must FAIL before T015)

- [X] T014 Write failing tests in `src/views/__tests__/EntityEditorDraftDialog.test.ts` (mock `vscode.window.showWarningMessage`): (a) `hasDraftAxioms()` returns `false` when `draftAxioms` is empty, `true` when it has an entry; (b) `refreshEntityEditorIfOpen` calls `vscode.window.showWarningMessage` with `{ modal: true }` when `draftAxioms` is non-empty; (c) when `showWarningMessage` resolves to `undefined` (dismissed), `refreshEntityEditorIfOpen` returns without calling `sendLoadEntity`; (d) when `showWarningMessage` resolves to `'Discard and proceed'`, `draftAxioms` is cleared and `sendLoadEntity` is called; (e) when `draftAxioms` is empty, `refreshEntityEditorIfOpen` calls `sendLoadEntity` directly without showing a dialog

### Implementation for User Story 4

- [X] T015 [US4] Add `export function hasDraftAxioms(): boolean { return draftAxioms.size > 0; }` and `function discardAllDrafts(): void { draftAxioms.clear(); }` as module-level helpers in `src/views/EntityEditorPanel.ts`
- [X] T016 [US4] Add `async function promptForDraftDiscard(context: vscode.ExtensionContext, model: OntologyModel): Promise<'proceed' | 'cancel'>` in `src/views/EntityEditorPanel.ts`: build entity label strings from `draftAxioms.keys()`; call `vscode.window.showWarningMessage(message, { modal: true }, 'Discard and proceed', ...entityLabels)`; if result is `'Discard and proceed'` call `discardAllDrafts()` and return `'proceed'`; otherwise look up the IRI whose label matches the choice, call `showEntityInfo` for it, and return `'cancel'`; if `choice` is `undefined` return `'cancel'`
- [X] T017 [US4] Change `refreshEntityEditorIfOpen` signature to `export async function refreshEntityEditorIfOpen(model: OntologyModel, context?: vscode.ExtensionContext): Promise<void>` in `src/views/EntityEditorPanel.ts`; at the start, if `hasDraftAxioms()` and `context` is provided, call `await promptForDraftDiscard(context, model)` and return early if result is `'cancel'`
- [X] T018 [US4] Update the 3 call sites of `refreshEntityEditorIfOpen` in `src/extension.ts` to pass `context` as second argument and `await` the result: after `classifyOntology`, after `classifyOntologyStale`, and inside `handleDocument`

**Checkpoint**: All 4 user stories work. Run T014 + T004 + T008 tests together: all must pass.

---

## Phase 6b: User Story 4 Refinement — Per-Entity Navigation Buttons

**Goal**: The blocking dialog must present one named button per affected entity (not a single "Fix in editor"), so every entity with drafts is individually navigable from the dialog. Clarification from Q2 in `spec.md`.

**Independent Test**: With draft axioms on two entities A and B, trigger classification — the dialog must show buttons `[Entity A]`, `[Entity B]`, `[Discard and Proceed]`. Clicking `[Entity B]` navigates the panel to Entity B, not Entity A.

### Tests for Phase 6b (write first — must FAIL before T022)

- [X] T021 [US4] Update `src/views/__tests__/EntityEditorDraftDialog.test.ts`: add assertion that when `showWarningMessage` resolves to the label string of the **second** entity, `showEntityInfo` is called with the IRI of that second entity — verifying per-entity routing rather than always navigating to the first IRI

### Implementation for Phase 6b

- [X] T022 [US4] Update `promptForDraftDiscard` in `src/views/EntityEditorPanel.ts` to use per-entity buttons: (a) build parallel arrays of entity label strings and their IRIs from `draftAxioms.keys()`; (b) call `vscode.window.showWarningMessage(message, { modal: true }, 'Discard and proceed', ...entityLabels)` using spread; (c) if `choice === 'Discard and proceed'` call `discardAllDrafts()` and return `'proceed'`; (d) otherwise find the index of `choice` in `entityLabels`, call `showEntityInfo(context, model, entityIris[labelIndex])`, and return `'cancel'`; (e) if `choice` is `undefined` return `'cancel'`

**Checkpoint**: Run T021 + T014 tests: all must pass. "Fix in editor" string no longer appears in `promptForDraftDiscard`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T019 [P] Run `npm run compile` — confirm zero TypeScript errors introduced by this feature
- [X] T020 Run `npm test` — confirm all tests pass and coverage ≥ 80% for new code in `EntityEditorPanel.ts` and `EntityEditorMessages.ts`; fix any failures before marking complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2 — T001–T003)**: No dependencies — start immediately. BLOCKS all user stories.
- **US1 (Phase 3 — T004–T007)**: Depends on Foundational complete.
- **US2 (Phase 4 — T008–T011)**: Depends on US1 complete (needs `draftAxioms` Map and `saveDraftError` type).
- **US3 (Phase 5 — T012–T013)**: Depends on US2 complete (banner triggered by `saveDraftError` message).
- **US4 (Phase 6 — T014–T018)**: Depends on US1 complete (needs `draftAxioms`). Can run in parallel with US2/US3.
- **US4 Refinement (Phase 6b — T021–T022)**: Depends on Phase 6 complete (needs `promptForDraftDiscard`).
- **Polish (Phase 7 — T019–T020)**: Depends on all desired user stories complete, including Phase 6b.

### User Story Dependencies

- **US1 → US2 → US3**: Linear chain (each builds on the previous)
- **US1 → US4**: US4 depends only on US1; can overlap with US2/US3 development

### Within Each User Story

- Test task MUST be written and confirmed failing before any implementation task
- T005 before T006 (Map must exist before save handler uses it)
- T009 before T010 (`saveDraftError` message before `sendLoadEntity` merge)
- T015 before T016 (helpers before function that calls them)
- T015/T016 before T017 (functions must exist before refresh gate calls them)
- T017 before T018 (async signature must exist before callers are updated)

---

## Parallel Opportunities

### Foundational Phase

```
T001 → T002 → T003   (sequential: same file, logically ordered)
```

### US1

```
T004 (test, write first) → T005 → T006   (sequential: each builds on previous)
                                  ↓
                               T007 [P]   (different file: webview — start after T004 is written)
```

### US2 and US4 (after US1 complete)

```
US2: T008 (test) → T009 → T010 → T011
US4: T014 (test) → T015 → T016 → T017 → T018
These two tracks can run in parallel once US1 is complete.
```

---

## Parallel Example: US1

```
# After T004 test is written and failing:
Task T005: "Add DraftExpression interface and draftAxioms Map in src/views/EntityEditorPanel.ts"
Task T007: "Detect CodeMirror diagnostics in handleSave in webview-src/entity-editor/EntityEditorApp.ts"
# (T005 and T007 touch different files — can run in parallel)
# T006 depends on T005, so runs after T005 completes.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — T001–T007)

1. Complete Phase 2: Foundational (T001–T003) — 3 protocol tasks
2. Complete Phase 3: US1 (T004–T007) — 4 tasks (1 test + 3 impl)
3. **STOP and VALIDATE**: Invalid expressions are never written to the OWL document; valid ones still sync. Run `quickstart.md` Scenario 1 and Negative Test.
4. OWL document correctness guarantee is fully delivered at this point.

### Incremental Delivery

1. T001–T003: Protocol foundation
2. T004–T007 (US1): Core save guard → validate Scenario 1 → commit
3. T008–T011 (US2): Red border visual → validate Scenarios 1–3 → commit
4. T012–T013 (US3): Error banner → validate Scenarios 1–2 → commit
5. T014–T018 + T021–T022 (US4): Blocking dialog → validate Scenarios 4–7 → commit
6. T019–T020: Polish → final test run

---

## Notes

- [P] tasks touch different files and have no incomplete dependencies — safe to parallelize
- Each user story phase ends with a Checkpoint; validate before moving to the next story
- Constitution §I (Test-First) is non-negotiable: every test task must fail before the paired implementation task begins
- `promptForDraftDiscard` passes `context` through `refreshEntityEditorIfOpen` — verify the `context` parameter is available at all 3 call sites before implementing T017/T018
- The webview banner and red border (US2/US3) are tested primarily via `quickstart.md` manual scenarios; the extension-host side (message posting) is unit-tested in T008/T012
