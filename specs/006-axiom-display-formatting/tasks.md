# Tasks: Axiom Expression Display Formatting

**Input**: Design documents from `/specs/006-axiom-display-formatting/`
**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**TDD required**: All implementation tasks MUST be preceded by failing tests (Constitution Principle I).

**Organization**: Foundational module first, then User Story phases in P1 → P2 order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no dependency)
- **[Story]**: User story this task belongs to (US1, US2, US3)
- Exact file paths are given in every task description

---

## Phase 2: Foundational — `manchesterFormat.ts` Module (TDD)

**Purpose**: The pure-function formatter module that all subsequent phases depend on. Must be complete before any user-story work begins.

**⚠️ CRITICAL**: US1, US2, and US3 all import from this module. No user-story phase can begin until T002 is complete and all T001 tests pass.

- [x] T001 Write failing unit tests in `webview-src/manchesterFormat.test.ts` covering: (a) `formatManchesterForDisplay` — identity on no-`and` input; inserts `\n    and ` before bare ` and `; does NOT break at `and` inside `<…>` IRI brackets; does NOT break at `and` inside `"…"` double-quoted strings; does NOT break at `and` inside `'…'` single-quoted labels; handles escaped `\"` and `\'` inside strings; multiple conjuncts produce multiple breaks; empty string returns empty string; (b) `collectLogicalLines` — single expression (no `and`) returns one-element array; two separate single-line expressions (joined with `\n`) return two-element array; formatted multi-line expression with continuation lines collapses to original single-line expression; blank lines skipped; `#`-comment lines skipped; continuation line with no preceding expression becomes its own entry (malformed-input guard); empty input returns `[]`; (c) `stripAndContinuations` — equals `collectLogicalLines(raw).join(' ')` for both single-expression and empty inputs; (d) **Round-trip invariant**: `collectLogicalLines(exprs.map(formatManchesterForDisplay).join('\n'))` deep-equals `exprs` for arrays of 1–5 non-empty single-line expressions — Run `npm test -- webview-src/manchesterFormat.test.ts` and confirm ALL tests fail (file does not exist yet)

- [x] T002 Implement `webview-src/manchesterFormat.ts` exporting `formatManchesterForDisplay`, `collectLogicalLines`, and `stripAndContinuations` — state-machine in `formatManchesterForDisplay` tracks four states (Normal/InIri/InDoubleQuote/InSingleQuote); replaces bare ` and ` with `\n    and ` (4-space indent) in Normal state only; `collectLogicalLines` splits by `\n`, trims, skips blank/comment lines, appends `and`-continuation lines to previous entry; `stripAndContinuations` delegates to `collectLogicalLines` — Run `npm test -- webview-src/manchesterFormat.test.ts` and confirm ALL tests pass; run `npm run compile:webview` and confirm no TypeScript errors

**Checkpoint**: Foundation ready — all three exports implemented and tested; US1, US2, US3 phases may now begin

---

## Phase 3: US1 — Read Complex Conjunctive Axioms in Entity Editor (Priority: P1) 🎯 MVP

**Goal**: Entity Editor expression sections (SubClassOf expressions, EquivalentTo expressions, GCI expressions) display multi-line formatted expressions with each `and` starting a new indented line when an entity is loaded.

**Independent Test**: Open VS Code (F5), open `test-ontologies/animals.omn`, navigate to a class with a conjunctive SubClassOf or EquivalentTo axiom; confirm the expression section shows each `and` on a new line.

- [x] T003 [US1] Export `validateManchesterText` as a named export from `src/views/EntityEditorPanel.ts` AND add a failing unit test in `src/views/EntityEditorPanel.test.ts` (new file) with the `vscode` mock pattern from the constitution — test case: call `validateManchesterText('hasRole some Doctor\n    and hasLocation some Hospital')` and assert it returns an empty error array (zero errors); run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm this test FAILS (the current function splits by `\n` and validates each line separately, causing the `and hasLocation…` continuation line to produce a parse error — so the returned array is non-empty and the assertion fails)

- [x] T004 [US1] Patch exported `validateManchesterText` in `src/views/EntityEditorPanel.ts` to join continuation `and` lines before validating each logical expression — replace the current `lines.split('\n')` loop with a two-pass approach: first collect logical lines (joining lines matching `/^and\s/` after trimming to their predecessor), then validate each logical line as before; character offset reported in errors MUST reference the start of the logical expression in the original text — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm T003 test passes; run full `npm test` to confirm no regressions

- [x] T005 [P] [US1] Update the three `renderExpressionSection` invocations in `webview-src/entity-editor/EntityEditorApp.ts` (for `superClassExpressions`, `equivalentClassExpressions`, and `gciExpressions` in the `loadEntity` message handler at lines ~1251–1259) to map each expression string through `formatManchesterForDisplay` before joining with `\n` — add `import { formatManchesterForDisplay, collectLogicalLines } from '../manchesterFormat';` at the top of the file; change `(msg.superClassExpressions ?? []).join('\n')` to `(msg.superClassExpressions ?? []).map(e => formatManchesterForDisplay(e)).join('\n')` (and same for equivalentClassExpressions and gciExpressions); run `npm run compile:webview` and confirm no type errors

**Checkpoint**: User Story 1 functional — entity editor shows formatted multi-line axiom expressions on load

---

## Phase 4: US2 — Edit and Save Without Corruption (Priority: P1)

**Goal**: When a user edits or saves a formatted expression, the OWL document receives the original single-line form with no injected newlines. Auto-formatting fires during typing when ` and ` is completed.

**Independent Test**: Open a class in Entity Editor; save without changes; confirm file hash unchanged (see `quickstart.md`). Then type `hasAge some Integer and hasName some String` in a SubClassOf expression editor and confirm auto line-break occurs.

**Tests**: The round-trip correctness is guaranteed by the T001 invariant test. No additional failing tests are needed before T006 (the implementation change is replacing a call with an already-tested equivalent). T007 (auto-format) has no unit test path (CodeMirror EditorView requires a browser); validated manually via quickstart.md.

- [x] T006 [US2] Replace `collectEditorLines` call-sites in `getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts` (three occurrences: `superClassExpressions`, `equivalentClassExpressions`, `gciExpressions` at lines ~1329–1336) with `collectLogicalLines(editorMap[key]?.state.doc.toString() ?? '')` — `collectLogicalLines` is already imported from T005; delete the `collectEditorLines` function if it has no remaining callers; run `npm run compile:webview` and confirm no type errors

- [x] T007 [US2] Add an auto-format `EditorView.updateListener` to the extensions array in `createEditor()` in `webview-src/entity-editor/EntityEditorApp.ts` — the listener fires when `update.docChanged` is true; computes `reformatted = collectLogicalLines(newDocText).map(formatManchesterForDisplay).join('\n')`; if `reformatted !== newDocText`, dispatches a follow-up transaction replacing the full document content with `reformatted` while preserving the current selection; the `reformatted !== newDocText` guard prevents infinite recursion — run `npm run build` and manually verify auto-format fires in the extension development host

**Checkpoint**: User Story 2 functional — save produces clean single-line expressions; typing auto-formats

---

## Phase 5: US3 — DL Query Expression Formatting (Priority: P2)

**Goal**: DL Query panel auto-formats expressions during typing. Execute sends a clean single-line expression to the reasoner. Validation handles multi-line formatted input.

**Independent Test**: Open DL Query panel, type `hasRole some Doctor and hasLocation some Hospital`, confirm automatic line break; submit query with the reasoner running, confirm valid results identical to the single-line version.

- [x] T008 [US3] Add a test case to `src/views/DLQueryPanel.test.ts` that sends a continuation-line `validate` message: `{ type: 'validate', requestId: 99, text: 'Dog\n    and Cat' }` and asserts the resulting `validationResult` has `errors: []` (empty array, no parse error) — run `npm test -- src/views/DLQueryPanel.test.ts`; **if this test PASSES** (Manchester parser handles newlines in OMN SubClassOf context), T009 is a no-op; **if this test FAILS**, T009 must be implemented before proceeding

- [x] T009 [US3] *(Implement only if T008 test fails)* Patch `validateExpression` in `src/views/DLQueryPanel.ts` to strip continuation `and` lines before wrapping in OMN boilerplate — add inline joining logic (≈ 6 lines) before the `const trimmed = text.trim()` line; re-run `npm test -- src/views/DLQueryPanel.test.ts` and confirm T008 test passes

- [x] T010 [US3] Add an auto-format `EditorView.updateListener` to the extensions array in `createExpressionEditor()` in `webview-src/dl-query/DLQueryApp.ts` — same logic as T007 but using `stripAndContinuations` + `formatManchesterForDisplay` for a single-expression editor: `const logical = stripAndContinuations(newDocText); const reformatted = formatManchesterForDisplay(logical); if (reformatted !== newDocText) { /* dispatch replacement */ }` — import `{ formatManchesterForDisplay, stripAndContinuations }` from `'../manchesterFormat'`; run `npm run compile:webview` and confirm no type errors

- [x] T011 [US3] Strip continuation lines from the expression before sending the `execute` message in `webview-src/dl-query/DLQueryApp.ts` (in the `executeBtn` click handler at line ~292) — replace `const expression = editor.state.doc.toString().trim()` with `const expression = stripAndContinuations(editor.state.doc.toString()).trim()`; `stripAndContinuations` is already imported from T010; run `npm run compile:webview` and confirm no type errors

**Checkpoint**: User Story 3 functional — DL Query formats expressions and sends clean single-line expression to the reasoner

---

## Phase 6: Polish & Verification

**Purpose**: Full test suite pass, type checks, manual end-to-end validation.

- [x] T012 Run full test suite with `npm test` — ALL tests must pass; new code in `webview-src/manchesterFormat.ts`, `src/views/EntityEditorPanel.ts` (if T003/T004 added tests), and `src/views/DLQueryPanel.ts` (if T008/T009 added/modified tests) must collectively reach >80% coverage on new lines (Constitution Principle I quality gate)

- [x] T013 [P] Run `npm run compile` (extension host TypeScript check) — zero errors; confirms `src/views/EntityEditorPanel.ts` and `src/views/DLQueryPanel.ts` changes are type-safe

- [x] T014 [P] Run `npm run compile:webview` (webview bundle TypeScript check) — zero errors; confirms `webview-src/manchesterFormat.ts`, `EntityEditorApp.ts`, and `DLQueryApp.ts` changes are type-safe

- [x] T015 Run `npm run build` and execute all manual test steps from `specs/006-axiom-display-formatting/quickstart.md` — specifically: (a) formatted display in Entity Editor for conjunctive axioms; (b) save round-trip hash check; (c) DL Query auto-format and execution; (d) guard test for `and` inside IRIs (no spurious break)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1, US2, US3 (Phases 3–5)**: All depend on Phase 2 (T002) completion — BLOCKED until T002 passes
- **US2 (Phase 4)**: T006 and T007 logically depend on T005 (same import is used)
- **US3 (Phase 5)**: T009 is conditional on T008 result; T010 and T011 are independent of T009
- **Polish (Phase 6)**: T012 depends on all prior phases; T013/T014 [P] can run together; T015 depends on T013+T014

### User Story Dependencies

- **US1 (Phase 3)**: Depends only on Foundational (T002)
- **US2 (Phase 4)**: Depends on US1 (T005 must import `collectLogicalLines` which T005 already added to EntityEditorApp.ts)
- **US3 (Phase 5)**: Depends only on Foundational (T002) — no dependency on US1 or US2

### Within Each Phase

Per Constitution Principle I: test tasks MUST be written first and confirmed to FAIL before the corresponding implementation task begins.

- T001 (failing tests) → T002 (implementation)
- T003 (failing test for EntityEditorPanel) → T004 (implementation patch)
- T005 (format on load — no failing test since it's a display enhancement depending on already-tested `formatManchesterForDisplay`) → can start after T002
- T006, T007 (save path and auto-format — correctness guaranteed by T001 round-trip invariant)
- T008 (verify DL Query validation) → T009 (only if T008 fails)
- T010, T011 (DL Query auto-format and strip) — can proceed after T002

### Parallel Opportunities

- T003 and T005 are in different files and can be worked in parallel after T002 completes
- T013 and T014 (both type-check commands) can run in parallel
- After T002, US3 tasks (T008 onward) can proceed in parallel with US1/US2 tasks if two developers are available

---

## Parallel Example: Phase 3 + Phase 5 (after T002 completes)

```
Parallel track A (Entity Editor):
  T003 → T004 → T005 → T006 → T007

Parallel track B (DL Query):
  T008 → T009 (if needed) → T010 → T011

Both tracks independently testable. Merge at Phase 6.
```

---

## Implementation Strategy

### MVP First (US1 Only — 5 tasks)

1. Complete Phase 2: T001, T002 (foundational module — ~2 hours)
2. Complete Phase 3 (US1): T003, T004, T005 (Entity Editor display — ~1.5 hours)
3. **STOP and VALIDATE**: Open Entity Editor with a conjunctive axiom; confirm multi-line display
4. Demo to stakeholders if needed — formatted reading already delivers significant value

### Incremental Delivery

1. T001–T002 → Formatter module working, all unit tests green
2. T003–T005 → Entity Editor shows formatted axioms (US1 MVP)
3. T006–T007 → Save round-trip clean, auto-format during typing (US2 complete)
4. T008–T011 → DL Query panel formatted (US3 complete)
5. T012–T015 → Full suite green, manually verified

---

## Notes

- `collectEditorLines` in `EntityEditorApp.ts` is fully replaced by `collectLogicalLines` in T006 — no callers remain after T006, so the function can be deleted
- The `formatManchesterForDisplay` + `collectLogicalLines` auto-format loop in T007/T010 is safe from infinite recursion because the guard `reformatted !== docText` short-circuits immediately after the first reformat
- Known limitation (documented in plan.md): linter error positions within a multi-line expression may point to the expression start rather than the precise error character. Accepted for this version.
- No Java server changes required — Java's OWLAPI Manchester parser is whitespace-agnostic
- No new npm packages — no additions to `package.json`
