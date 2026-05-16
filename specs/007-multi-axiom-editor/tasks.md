# Tasks: Multi-Axiom Expression Editor

**Input**: Design documents from `/specs/007-multi-axiom-editor/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**TDD required**: All implementation tasks that touch extension-host code (EntityEditorPanel.ts) MUST be preceded by failing tests (Constitution Principle I). Webview tasks (EntityEditorApp.ts) cannot be unit-tested in isolation (CodeMirror requires a browser); they are validated by type checks and manual testing per quickstart.md.

**Organization**: Foundational message-type change first (blocks all user stories), then US1 → US2 → US3 in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: User story this task belongs to (US1, US2, US3)
- Exact file paths are given in every task description

---

## Phase 2: Foundational — Message Type Change (TDD)

**Purpose**: Change `expressionEntityRefs` in `LoadEntityMessage` from a flat `ExpressionEntityRef[]` to a per-expression `ExpressionEntityRef[][]`. This is the structural prerequisite that all three user stories depend on — the webview cannot use per-editor refs until the extension host produces them.

**⚠️ CRITICAL**: Phases 3, 4, and 5 all depend on this phase completing cleanly.

- [x] T001 Write a failing test in `src/views/EntityEditorPanel.test.ts` asserting that `renderExpressionsWithRefs` (or the `loadEntity` message handler) produces `expressionEntityRefs['superClassExpressions']` as an array-of-arrays: for two expressions `['Dog and Cat', 'hasAge min 18']`, `result[0]` must contain only refs whose offsets are relative to `'Dog and Cat'` (i.e. `from` < 11), and `result[1]` must contain only refs relative to `'hasAge min 18'` (i.e. `from` < 13) — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm this test FAILS (current implementation produces a flat array with cross-expression offsets)

- [x] T002 Update the `expressionEntityRefs` type in `src/views/EntityEditorMessages.ts`: change `Record<string, { from: number; to: number; iri: string; entityType: EntityType; label: string; }[]>` to `Record<string, { from: number; to: number; iri: string; entityType: EntityType; label: string; }[][]>` (array of arrays, index-aligned with the expressions array) — run `npm run compile` and confirm the type error surfaces in `EntityEditorPanel.ts`

- [x] T003 Update `renderExpressionsWithRefs` in `src/views/EntityEditorPanel.ts` to produce one sub-array per expression instead of a flat cross-expression array: remove the `let offset = 0` accumulator and `offset += rendered.text.length + 1` step; instead push `rendered.refs` (unshifted, relative to `expressions[i]`) as a separate sub-array into `perExprRefs` and assign `refsBySection[sectionKey] = perExprRefs` — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm T001 now PASSES and all existing tests still pass; run `npm run compile` and confirm zero extension-host type errors

**Checkpoint**: Foundation ready — extension host emits per-expression refs; all user story phases may now begin

---

## Phase 3: US1 — Visual Separation of Multiple Axiom Expressions (Priority: P1) 🎯 MVP

**Goal**: Replace the single shared CodeMirror editor per expression section with one CodeMirror editor per axiom expression, so that each expression is naturally visually bounded in its own block with CSS separation between entries.

**Independent Test**: Open the Entity Editor for a class with two or more SubClassOf expressions. Confirm each expression is displayed in its own editor block with a visible separator between blocks. Both editors auto-format conjunctive expressions (feature 006 behaviour is preserved). Confirm the class loads without errors and all entity underlines are correctly positioned on entity names.

- [x] T004 [US1] Change `editorMap` type from `Record<string, EditorView>` to `Record<string, EditorView[]>` in `webview-src/entity-editor/EntityEditorApp.ts`; add a `destroySection(key: string): void` helper that calls `.destroy()` on each editor in `editorMap[key]`, then deletes the key — replace all existing `editorMap[key].destroy(); delete editorMap[key]` inline calls with `destroySection(key)`; also replace the entity-cleanup `for (const key of Object.keys(editorMap)) { editorMap[key].destroy(); delete editorMap[key]; }` loop with `Object.keys(editorMap).forEach(k => destroySection(k))`; run `npm run compile:webview` — expect type errors on `editorMap` usages (these will be resolved in subsequent tasks)

- [x] T005 [US1] Replace `shiftRefsForFormattedExpressions` with a per-expression helper `shiftRefsForFormat(expr: string, refs: ExpressionEntityRef[]): ExpressionEntityRef[]` in `webview-src/entity-editor/EntityEditorApp.ts`: the new function calls `findFormatBreaks(expr)` and for each ref returns `{ ...ref, from: ref.from + shift, to: ref.to + shift }` where `shift = breaks.filter(b => b < ref.from).length * 4`; if `breaks.length === 0` return `refs` unchanged — delete the old `shiftRefsForFormattedExpressions` function

- [x] T006 [US1] Update the `EditorView.updateListener` inside `createEditor()` in `webview-src/entity-editor/EntityEditorApp.ts` to use the single-expression auto-format pattern (matching `DLQueryApp.ts`): replace `collectLogicalLines(raw).map(e => formatManchesterForDisplay(e)).join('\n')` with `formatManchesterForDisplay(stripAndContinuations(raw))`; add `stripAndContinuations` to the import from `'../manchesterFormat'` — the `raw.trimEnd() !== reformatted` guard remains unchanged; run `npm run compile:webview` and confirm no type errors

- [x] T007 [US1] Implement `createExpressionEntry(body: HTMLElement, key: string, expr: string, refs: ExpressionEntityRef[]): void` in `webview-src/entity-editor/EntityEditorApp.ts` — creates a `<div class="expression-entry">` container; inside it creates a `<div class="expression-editor">` and calls `createEditor(editorEl, formatManchesterForDisplay(expr), shiftRefsForFormat(expr, refs))` to produce the editor; pushes the editor to `editorMap[key]` (initialising `editorMap[key] = []` if not already set); appends the entry to `body` (inserted before the `.expression-section-footer` if one exists, otherwise appended normally) — do NOT add the delete button yet (that is T013)

- [x] T008 [US1] Rewrite `renderExpressionSection` in `webview-src/entity-editor/EntityEditorApp.ts` to accept `(container: HTMLElement, title: string, key: string, expressions: string[], perExprRefs: ExpressionEntityRef[][] = [])` — call `destroySection(key)` then `editorMap[key] = []`; create the section via `makeSectionEl(title)` and get `body`; call `createExpressionEntry(body, key, expressions[i], perExprRefs[i] ?? [])` for each expression; append the section to `container` — do NOT add the footer button yet (that is T012)

- [x] T009 [US1] Update `collectEditorLines(key: string): string[]` in `webview-src/entity-editor/EntityEditorApp.ts` to aggregate across all editors in the section: replace `return collectLogicalLines(editorMap[key].state.doc.toString())` with `return (editorMap[key] ?? []).flatMap(ed => collectLogicalLines(ed.state.doc.toString())).filter(s => s.length > 0)`; run `npm run compile:webview` and confirm no type errors

- [x] T010 [US1] Update the three `renderExpressionSection` call sites in the `loadEntity` message handler in `webview-src/entity-editor/EntityEditorApp.ts` — change each call from `renderExpressionSection(content, title, key, (msg.superClassExpressions ?? []).map(e => formatManchesterForDisplay(e)).join('\n'), shiftRefsForFormattedExpressions(...))` to `renderExpressionSection(content, title, key, msg.superClassExpressions ?? [], msg.expressionEntityRefs?.['superClassExpressions'] ?? [])` (and same for `equivalentClassExpressions` and `gciExpressions`); also update the `ExpressionEntityRef` import/type usage to match the new `[][]` type; run `npm run compile:webview` — zero errors

- [x] T011 [US1] Add CSS for the `.expression-entry` class inline in `webview-src/entity-editor/EntityEditorApp.ts` (in the `EditorView.baseTheme` or the document `<style>` block): give `.expression-entry` a `margin-bottom: 8px` and a `border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35))` so consecutive entries are visually separated; the last entry's border is hidden via `.expression-entry:last-of-type { border-bottom: none }` — run `npm run compile:webview` and confirm no type errors

**Checkpoint**: US1 functional — Entity Editor shows each axiom expression in its own block with clear separation; feature 006 formatting preserved; entity underlines correctly positioned

---

## Phase 4: US2 — Add a New Axiom Expression (Priority: P1)

**Goal**: Each expression section has an explicit "Add expression" button below its entries. Clicking it creates a new empty editor at the bottom of the section, focused and ready for typing. A blank entry is silently discarded on save.

**Independent Test**: Open the Entity Editor for any class. Click "Add SubClassOf expression". Type `hasAge min 18` in the new editor. Save. Confirm the OWL document now contains a new SubClassOf axiom.

- [x] T012 [US2] Implement `addExpressionButton(body: HTMLElement, key: string): void` in `webview-src/entity-editor/EntityEditorApp.ts` — creates a `<div class="expression-section-footer">` containing a `<button class="expression-add-btn">+ Add expression</button>`; on click: calls `createExpressionEntry(body, key, '', [])` then focuses the last editor in `editorMap[key]` via `editorMap[key][editorMap[key].length - 1].focus()`; update `renderExpressionSection` to call `addExpressionButton(body, key)` after all entries are created; add CSS for `.expression-section-footer` (padding-top: 4px) and `.expression-add-btn` (styled as a small secondary button using VS Code theme variables `--vscode-button-secondaryBackground`, `--vscode-button-secondaryForeground`) — run `npm run compile:webview` and confirm no type errors

**Checkpoint**: US2 functional — "Add expression" button appears in each section; clicking it creates a focused empty editor; blank entry is discarded on save (handled by the `filter(s => s.length > 0)` in `collectEditorLines`)

---

## Phase 5: US3 — Remove an Existing Axiom Expression (Priority: P2)

**Goal**: Each axiom expression entry has a delete button (×). Clicking it removes the entry from the section and triggers a change check. After save, the removed axiom is absent from the OWL document.

**Independent Test**: Open the Entity Editor for a class with two SubClassOf expressions. Click × on one. Save. Confirm the OWL document contains exactly one SubClassOf axiom.

- [x] T013 [US3] Add a delete button to `createExpressionEntry` in `webview-src/entity-editor/EntityEditorApp.ts` — inside the `.expression-entry` container, prepend a `<button class="expression-delete-btn" title="Remove expression">×</button>`; on click: (1) call `editor.destroy()`, (2) splice the editor out of `editorMap[key]` by index (`editorMap[key].splice(editorMap[key].indexOf(editor), 1)`), (3) remove the entry's container element from the DOM, (4) call `checkForChanges()`; add CSS for `.expression-delete-btn` (float right or position absolute top-right; small, using `--vscode-errorForeground` or similar for the × icon) — run `npm run compile:webview` and confirm no type errors

**Checkpoint**: US3 functional — each expression entry has a × button; removing an expression and saving produces the correct OWL document

---

## Phase 6: Polish & Verification

**Purpose**: Full test suite, type checks, build verification, and manual end-to-end validation.

- [x] T014 Run `npm test` — all 206+ tests must pass; confirm `src/views/EntityEditorPanel.test.ts` T001 passes and no regressions introduced

- [x] T015 [P] Run `npm run compile` — zero extension-host type errors; confirms `EntityEditorMessages.ts` and `EntityEditorPanel.ts` changes are type-safe

- [x] T016 [P] Run `npm run compile:webview` — zero webview bundle type errors; confirms `EntityEditorApp.ts` changes are type-safe

- [x] T017 Run `npm run build` and execute all manual test steps from `specs/007-multi-axiom-editor/quickstart.md` — specifically: (a) visual separation of two multi-line formatted expressions; (b) "Add expression" → type → save → re-open confirms new axiom present; (c) delete expression → save → re-open confirms axiom absent; (d) add blank expression → save → confirm no new axiom; (e) round-trip hash check for unchanged save

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 (Phase 3)**: Depends on Phase 2 (T003) — BLOCKED until `expressionEntityRefs` type is updated
- **US2 (Phase 4)**: Depends on US1 (T008) — `renderExpressionSection` must exist in its new form before the footer can be added to it
- **US3 (Phase 5)**: Depends on US1 (T007) — `createExpressionEntry` must exist before the delete button can be added to it
- **Polish (Phase 6)**: Depends on all prior phases

### Within US1 (Phase 3)

Tasks T004–T011 are all in `EntityEditorApp.ts` and must execute in order (each task depends on the previous):
- T004 (type change + destroySection) → T005 (shiftRefsForFormat) → T006 (updateListener) → T007 (createExpressionEntry) → T008 (renderExpressionSection) → T009 (collectEditorLines) → T010 (call sites) → T011 (CSS)

### User Story Independence

- **US1**: Independently testable — displays multiple axioms with separation; no add/delete buttons
- **US2**: Depends on US1 rendering infrastructure; independently testable after US1
- **US3**: Depends on US1's `createExpressionEntry`; independently testable after US1

### Parallel Opportunities

- T015 and T016 (type-check commands) can run in parallel
- T001 and T002 can be done in one pass (same mindset — the test defines what T002+T003 must produce)
- After Phase 2, US2 and US3 work can begin once US1 is complete (T007 and T008 are the unblocking points)

---

## Parallel Example: After Phase 2 Completes

```
Sequential: T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 (US1, same file)
Then: T012 (US2, same file, depends on T008)
Then: T013 (US3, same file, depends on T007)
Then: T014 → [T015, T016 in parallel] → T017
```

---

## Implementation Strategy

### MVP First (US1 Only — 11 tasks)

1. Complete Phase 2: T001, T002, T003 (message type + failing test ~1 hour)
2. Complete Phase 3 (US1): T004–T011 (per-editor display + CSS ~2 hours)
3. **STOP and VALIDATE**: Open Entity Editor with a class that has two SubClassOf expressions; confirm each is in its own block with clear separation
4. Add US2 (T012) when US1 is confirmed working — ~30 minutes
5. Add US3 (T013) — ~30 minutes
6. Verification (T014–T017)

### Incremental Delivery

1. T001–T003 → Message type correct, server emits per-expression refs
2. T004–T011 → Per-editor display working (US1 MVP — readable multi-axiom view)
3. T012 → Add expression button (US2 complete)
4. T013 → Delete button (US3 complete)
5. T014–T017 → Full suite green, manually verified

---

## Notes

- The `createEditor` function (used by `createExpressionEntry`) is **unchanged** in its extension list — it retains all features (autocomplete, linter, history, clickableEntityExtension, etc.). Only its `updateListener` changes to the single-expression auto-format pattern.
- The `SaveEntityMessage` interface is **unchanged** — `superClassExpressions` etc. remain `string[]`. Only `LoadEntityMessage.expressionEntityRefs` changes.
- Blank entries in `editorMap[key]` are silently discarded by `collectEditorLines` via the `.filter(s => s.length > 0)` step — no special save-path handling needed.
- The `shiftRefsForFormat` helper replaces `shiftRefsForFormattedExpressions` entirely. The old function can be deleted after T005.
- `stripAndContinuations` is already exported from `manchesterFormat.ts` — it just needs to be added to the import line in `EntityEditorApp.ts`.
- CSS is added inline to the existing `<style>` block or `baseTheme` in `EntityEditorApp.ts` — no new CSS files.
