# Tasks: Multiline Text Areas for Long-Form Annotation Properties

**Input**: Design documents from `specs/003-multiline-annotation-fields/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add jsdom dev dependency so that DOM element tests can be run under Vitest.

- [x] T001 Add `jsdom` and `@types/jsdom` as dev dependencies by running `npm install --save-dev jsdom @types/jsdom` from the repo root, then verify the entries appear under `devDependencies` in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites — Red Tests)

**Purpose**: Write all failing tests before any implementation. No user story work begins until tests are written and confirmed to fail.

**⚠️ CRITICAL**: Confirm each test **fails** before moving to Phase 3.

- [x] T002 Create `webview-src/entity-editor/EntityEditorApp.test.ts` with `// @vitest-environment jsdom` at the top and four failing tests for the `createValueWidget` export: (a) returns `<textarea>` for `http://www.w3.org/2004/02/skos/core#definition`, (b) returns `<textarea>` for `http://www.w3.org/2000/01/rdf-schema#comment`, (c) returns `<input type="text">` for `http://www.w3.org/2000/01/rdf-schema#label`, (d) the `onChange` callback receives the element's current value when the `input` event fires

- [x] T003 [P] Add a newline round-trip test to `src/serializer/FunctionalSerializer.test.ts`: serialize a class with a `skos:definition` annotation whose value contains a literal `\n` character, then parse the output and assert the value is recovered with the newline intact (confirms existing behaviour — expected to pass immediately after writing)

**Checkpoint**: `npm test` shows T002's tests failing and T003's test passing. Do not proceed until this is confirmed.

---

## Phase 3: User Story 1 — skos:definition Textarea in Existing Rows (Priority: P1) 🎯 MVP

**Goal**: Existing annotation rows for `skos:definition` display a multi-line textarea with correct change detection.

**Independent Test**: Open the entity editor for any class with a `skos:definition` annotation. The field renders as a `<textarea>` with at least 3 visible lines. Editing the value enables the Save button. Saving and reopening the file preserves the full value.

### Implementation for User Story 1

- [x] T004 [US1] Add `const MULTILINE_IRIS: readonly string[] = [SKOS_DEFINITION, RDFS_COMMENT];` near the `PRIORITY_IRIS` constant on line ~128 in `webview-src/entity-editor/EntityEditorApp.ts`

- [x] T005 [US1] Extract and implement `createValueWidget(propIri: string, value: string, onChange: (v: string) => void): HTMLInputElement | HTMLTextAreaElement` as a named function just above `renderAnnotationsSection` in `webview-src/entity-editor/EntityEditorApp.ts`. The function MUST: check `MULTILINE_IRIS.includes(propIri)` and return a `<textarea>` if true, else return `<input type="text">`; in both branches set `.value`, apply `annotation-value-input` CSS class, and attach an `'input'` event listener that calls `onChange(el.value)`. Export the function so the test file can import it.

- [x] T006 [US1] In `renderAnnotationsSection` in `webview-src/entity-editor/EntityEditorApp.ts`, replace the existing `const valueInput = document.createElement('input'); valueInput.type = 'text'; valueInput.className = 'annotation-value-input'; valueInput.value = entry.value; valueInput.addEventListener('input', ...)` block (lines ~912–920) with a single call to `createValueWidget(entry.propIri, entry.value, (v) => { annotationState[i] = { ...annotationState[i], value: v }; checkForChanges(); })` and append the returned element to `tdValue`

- [x] T007 [US1] Add `textarea.annotation-value-input { min-height: 4.5em; resize: vertical; }` to the inline `<style>` block in `webview-src/entity-editor/EntityEditorApp.ts` (after the existing `.annotation-value-input:focus` rule, line ~1544)

**Checkpoint**: `npm test` shows all T002 tests now passing. `skos:definition` rows render as textareas; `rdfs:label` rows are still single-line inputs.

---

## Phase 4: User Story 2 — "+ Add annotation" Inline Row Textarea (Priority: P2)

**Goal**: When the user adds a new `skos:definition` or `rdfs:comment` annotation via the "+ Add annotation" flow, the value entry field in the inline row is a textarea, not a single-line input.

**Independent Test**: Click "+ Add annotation" and select `skos:definition` from the property autocomplete. The value input swaps to a `<textarea>`. Completing the add flow saves a value that can contain newlines.

### Implementation for User Story 2

- [x] T008 [US2] In the "+ Add annotation" inline row in `webview-src/entity-editor/EntityEditorApp.ts` (around line ~959): after the `createIriInput` callback sets `newPropIri`, call `createValueWidget(newPropIri, '', (v) => { /* value is read from widget on OK click */ })` to create a replacement widget, then swap it into the DOM in place of the original `valueInput` element (using `valueInput.replaceWith(newWidget)`); update the OK-button click handler to read `newWidget.value` instead of `valueInput.value` when pushing to `annotationState`

**Checkpoint**: `npm test` passes. The add-annotation row shows a textarea when `skos:definition` or `rdfs:comment` is selected; it shows a single-line input for all other properties.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Type-check, confirm test suite health, and validate the full feature end-to-end.

- [x] T009 [P] Run `npm run compile:webview` and confirm zero TypeScript errors in `webview-src/entity-editor/EntityEditorApp.ts`

- [x] T010 [P] Run `npm run compile` and confirm zero TypeScript errors in the extension source

- [x] T011 Run `npm test` and confirm all tests pass, including the new tests in `webview-src/entity-editor/EntityEditorApp.test.ts` and `src/serializer/FunctionalSerializer.test.ts`

- [x] T012 Run `npm run build` to produce the updated `dist/entity-editor-webview.js` bundle and confirm the build completes without errors

- [ ] T013 Perform manual verification in VS Code per the steps in `specs/003-multiline-annotation-fields/quickstart.md`: open `test-ontologies/animals.omn`, open entity editor for a class, confirm `skos:definition` → textarea, `rdfs:comment` → textarea, `rdfs:label` → single-line input; add a new `skos:definition`, save, reopen and confirm round-trip

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (jsdom must be installed before tests run) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 (tests must be written and failing)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (createValueWidget must exist before it can be reused in the add-annotation row)
- **Polish (Phase 5)**: Depends on Phases 3 and 4 being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependency on US2
- **User Story 2 (P2)**: Depends on US1 completing T005 (`createValueWidget` must exist) — cannot start until T005 is done

### Within Each Phase

- T004 → T005 (constant before function) → T006 (function before use) → T007 (CSS, parallel with T006)
- T009 and T010 can run in parallel; T011 must run after both

### Parallel Opportunities

- T003 can be written in parallel with T002 (different test files)
- T009 and T010 compile-check tasks run in parallel (different tsconfig targets)

---

## Parallel Example: Phase 2

```bash
# Write both test files simultaneously:
Task T002: Create webview-src/entity-editor/EntityEditorApp.test.ts
Task T003: Add newline round-trip test to src/serializer/FunctionalSerializer.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (jsdom install)
2. Complete Phase 2: Write failing tests — CONFIRM they fail
3. Complete Phase 3: Implement constant + helper + use in existing rows + CSS
4. **STOP and VALIDATE**: Run `npm test` — all T002 tests pass; `skos:definition` renders as textarea
5. Ship Phase 3 as MVP

### Incremental Delivery

1. Phase 1 + 2 → Tests in place, confirmed failing
2. Phase 3 → US1 (skos:definition in existing rows) — independently testable
3. Phase 4 → US2 (add-annotation inline row swap) — extends US1
4. Phase 5 → Full build + manual verification

---

## Notes

- [P] tasks = different files, no dependencies on other in-progress tasks
- T003 is a *confirming* test — it should pass immediately after being written since the serializer already handles newlines; write it anyway to make the invariant explicit
- The `createValueWidget` function must be exported (or at least importable) from `EntityEditorApp.ts` for the test file to reach it. Since the file is a browser IIFE bundle, the simplest approach is to export it at the module level using a named export and let esbuild tree-shake it from the production bundle, OR to move it to a separate small module `webview-src/entity-editor/createValueWidget.ts` if exporting from the IIFE entry file proves difficult
- Avoid: touching parser, serializer, or sync layer code — no changes are needed there
