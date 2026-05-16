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

- [x] T001 Write failing unit tests in `webview-src/manchesterFormat.test.ts` covering: (a) `formatManchesterForDisplay` — identity on no-`and` input; inserts `\n    and ` before bare ` and ` only when a non-whitespace character follows (trailing ` and ` and ` and  ` do NOT break); does NOT break at `and` inside `<…>` IRI brackets; does NOT break at `and` inside `"…"` double-quoted strings; does NOT break at `and` inside `'…'` single-quoted labels; handles escaped `\"` and `\'` inside strings; multiple conjuncts produce multiple breaks; empty string returns empty string; (b) `collectLogicalLines` — single expression (no `and`) returns one-element array; two separate single-line expressions (joined with `\n`) return two-element array; formatted multi-line expression with continuation lines collapses to original single-line expression; blank lines skipped; `#`-comment lines skipped; continuation line with no preceding expression becomes its own entry (malformed-input guard); empty input returns `[]`; (c) `stripAndContinuations` — equals `collectLogicalLines(raw).join(' ')` for both single-expression and empty inputs; (d) `findFormatBreaks` — returns `[]` for no-`and` input; returns one position for single conjunct; returns two positions for two conjuncts; returns `[]` for trailing ` and ` (no content after); skips `and` inside IRI brackets; skips `and` inside single-quoted labels; correct positions for a realistic SNOMED expression; (e) **Round-trip invariant**: `collectLogicalLines(exprs.map(formatManchesterForDisplay).join('\n'))` deep-equals `exprs` for arrays of 1–5 non-empty single-line expressions — Run `npm test -- webview-src/manchesterFormat.test.ts` and confirm ALL tests fail (file does not exist yet)

- [x] T002 Implement `webview-src/manchesterFormat.ts` exporting `formatManchesterForDisplay`, `collectLogicalLines`, `stripAndContinuations`, and `findFormatBreaks` — state-machine in `formatManchesterForDisplay` and `findFormatBreaks` tracks four states (Normal/InIri/InDoubleQuote/InSingleQuote); replaces bare ` and ` with `\n    and ` (4-space indent) ONLY when a non-whitespace character follows (`i + 5 < expr.length && /\S/.test(expr[i + 5])`), to prevent the formatter from consuming trailing spaces the user is still typing; `collectLogicalLines` splits by `\n`, trims, skips blank/comment lines, appends `and`-continuation lines to previous entry; `findFormatBreaks` mirrors the state machine and returns `number[]` of break start positions in the original expression (each position is where ` and ` begins in `expr`); `stripAndContinuations` delegates to `collectLogicalLines` — Run `npm test -- webview-src/manchesterFormat.test.ts` and confirm ALL tests pass; run `npm run compile:webview` and confirm no TypeScript errors

**Checkpoint**: Foundation ready — all four exports implemented and tested; US1, US2, US3 phases may now begin

---

## Phase 3: US1 — Read Complex Conjunctive Axioms in Entity Editor (Priority: P1) 🎯 MVP

**Goal**: Entity Editor expression sections (SubClassOf expressions, EquivalentTo expressions, GCI expressions) display multi-line formatted expressions with each `and` starting a new indented line when an entity is loaded. Clickable entity underlines land on entity names (not `and` keywords).

**Independent Test**: Open VS Code (F5), open `test-ontologies/animals.omn`, navigate to a class with a conjunctive SubClassOf or EquivalentTo axiom; confirm the expression section shows each `and` on a new line; click an entity name in the expression and confirm navigation fires (not the keyword `and`).

- [x] T003 [US1] Export `validateManchesterText` as a named export from `src/views/EntityEditorPanel.ts` AND add a failing unit test in `src/views/EntityEditorPanel.test.ts` (new file) with the `vscode` mock pattern from the constitution — test case: call `validateManchesterText('hasRole some Doctor\n    and hasLocation some Hospital')` and assert it returns an empty error array (zero errors); run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm this test FAILS (the current function splits by `\n` and validates each line separately, causing the `and hasLocation…` continuation line to produce a parse error — so the returned array is non-empty and the assertion fails)

- [x] T004 [US1] Patch exported `validateManchesterText` in `src/views/EntityEditorPanel.ts` to join continuation `and` lines before validating each logical expression — replace the current `lines.split('\n')` loop with a two-pass approach: first collect logical lines (joining lines matching `/^and\s/` after trimming to their predecessor), then validate each logical line as before; character offset reported in errors MUST reference the start of the logical expression in the original text — run `npm test -- src/views/EntityEditorPanel.test.ts` and confirm T003 test passes; run full `npm test` to confirm no regressions

- [x] T005 [P] [US1] Update the three `renderExpressionSection` invocations in `webview-src/entity-editor/EntityEditorApp.ts` (for `superClassExpressions`, `equivalentClassExpressions`, and `gciExpressions` in the `loadEntity` message handler) to map each expression string through `formatManchesterForDisplay` before joining with `\n` — add `import { formatManchesterForDisplay, collectLogicalLines, findFormatBreaks } from '../manchesterFormat';` at the top; change `(msg.superClassExpressions ?? []).join('\n')` to `(msg.superClassExpressions ?? []).map(e => formatManchesterForDisplay(e)).join('\n')` (and same for `equivalentClassExpressions` and `gciExpressions`); run `npm run compile:webview` and confirm no type errors

- [x] T006 [P] [US1] Add entity-ref offset remapping in `webview-src/entity-editor/EntityEditorApp.ts` to correct clickable underline positions after formatting — implement `shiftRefsForFormattedExpressions(expressions: string[], refs: ExpressionEntityRef[]): ExpressionEntityRef[]` before `renderExpressionSection`: iterate over `expressions`, collect all break positions from `findFormatBreaks(expr)` (shifted by accumulated expression offsets including `\n` separators), then remap each ref's `from`/`to` by `count_of_breaks_before_position × 4`; update the three `renderExpressionSection` calls to pass remapped refs using `shiftRefsForFormattedExpressions(msg.superClassExpressions ?? [], msg.expressionEntityRefs?.['superClassExpressions'] ?? [])` (same for the other two); run `npm run compile:webview` and confirm no type errors

**Checkpoint**: User Story 1 functional — entity editor shows formatted multi-line axiom expressions on load; entity underlines are positioned correctly

---

## Phase 4: US2 — Edit and Save Without Corruption (Priority: P1)

**Goal**: When a user edits or saves a formatted expression, the OWL document receives the original single-line form with no injected newlines. Auto-formatting fires during typing when ` and X` (non-whitespace after `and`) is completed.

**Independent Test**: Open a class in Entity Editor; save without changes; confirm file hash unchanged (see `quickstart.md`). Then type `hasAge some Integer and hasName some String` in a SubClassOf expression editor and confirm auto line-break occurs at the correct point.

**Tests**: The round-trip correctness is guaranteed by the T001 invariant test. No additional failing tests are needed before T007. T008 (auto-format) has no unit test path (CodeMirror EditorView requires a browser); validated manually via quickstart.md.

- [x] T007 [US2] Replace `collectEditorLines` call-sites in `getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts` (three occurrences: `superClassExpressions`, `equivalentClassExpressions`, `gciExpressions`) with `collectLogicalLines(editorMap[key]?.state.doc.toString() ?? '')` — `collectLogicalLines` is already imported from T005; delete the `collectEditorLines` function if it has no remaining callers; run `npm run compile:webview` and confirm no type errors

- [x] T008 [US2] Add an auto-format `EditorView.updateListener` to the extensions array in `createEditor()` in `webview-src/entity-editor/EntityEditorApp.ts` — the listener fires when `update.docChanged` is true; computes `reformatted = collectLogicalLines(newDocText).map(formatManchesterForDisplay).join('\n')`; dispatches a follow-up transaction only when `reformatted !== raw && raw.trimEnd() !== reformatted` (the `trimEnd` guard prevents consuming trailing whitespace the user is still typing — without this guard, every space typed triggers an unwanted reformat dispatch that eats the space); also add a guard in `manchesterCompletionSource` so that if the matched prefix starts with a non-alphanumeric character (e.g. a space, indicating the closing `'` of a prior label was picked up as an opening quote by `matchBefore`) the function returns `null`, and guard Manchester keywords (`and`, `or`, `not`, `some`, `only`, `all`, `value`, `min`, `max`, `exactly`, `that`, `Self`) in the unquoted branch — run `npm run build` and manually verify auto-format fires in the extension development host

**Checkpoint**: User Story 2 functional — save produces clean single-line expressions; typing auto-formats; spaces can be entered freely after `and`

---

## Phase 5: US3 — DL Query Expression Formatting (Priority: P2)

**Goal**: DL Query panel auto-formats expressions during typing (same `trimEnd` guard as US2). Execute sends a clean single-line expression to the reasoner. Validation handles multi-line formatted input.

**Independent Test**: Open DL Query panel, type `hasRole some Doctor and hasLocation some Hospital`, confirm automatic line break fires after each `and X` but NOT when `and ` has no non-whitespace content after it; submit query with the reasoner running, confirm valid results identical to the single-line version.

- [x] T009 [US3] Add a test case to `src/views/DLQueryPanel.test.ts` that sends a continuation-line `validate` message: `{ type: 'validate', requestId: 99, text: 'Dog\n    and Cat' }` and asserts the resulting `validationResult` has `errors: []` (empty array, no parse error) — run `npm test -- src/views/DLQueryPanel.test.ts`; **if this test PASSES** (Manchester parser handles newlines in OMN SubClassOf context), T010 is a no-op; **if this test FAILS**, T010 must be implemented before proceeding

- [x] T010 [US3] *(Implement only if T009 test fails)* Patch `validateExpression` in `src/views/DLQueryPanel.ts` to strip continuation `and` lines before wrapping in OMN boilerplate — add inline joining logic (≈ 6 lines) before the `const trimmed = text.trim()` line; re-run `npm test -- src/views/DLQueryPanel.test.ts` and confirm T009 test passes

- [x] T011 [P] [US3] Add an auto-format `EditorView.updateListener` to the extensions array in `createExpressionEditor()` in `webview-src/dl-query/DLQueryApp.ts` — same logic as T008 but using `stripAndContinuations` + `formatManchesterForDisplay` for a single-expression editor: `const logical = stripAndContinuations(newDocText); const reformatted = formatManchesterForDisplay(logical); if (reformatted !== raw && raw.trimEnd() !== reformatted) { /* dispatch replacement */ }`; also add the same `manchesterCompletionSource` guards (non-alphanumeric prefix → null; unquoted Manchester keywords → null using the existing `MANCHESTER_KEYWORDS` Set); import `{ formatManchesterForDisplay, stripAndContinuations }` from `'../manchesterFormat'`; run `npm run compile:webview` and confirm no type errors

- [x] T012 [P] [US3] Strip continuation lines from the expression before sending the `execute` message in `webview-src/dl-query/DLQueryApp.ts` (in the `executeBtn` click handler) — replace `const expression = editor.state.doc.toString().trim()` with `const expression = stripAndContinuations(editor.state.doc.toString()).trim()`; `stripAndContinuations` is already imported from T011; run `npm run compile:webview` and confirm no type errors

**Checkpoint**: User Story 3 functional — DL Query formats expressions and sends clean single-line expression to the reasoner

---

## Phase 6: Polish & Verification

**Purpose**: Full test suite pass, type checks, manual end-to-end validation.

- [x] T013 Run full test suite with `npm test` — ALL tests must pass; new code in `webview-src/manchesterFormat.ts`, `src/views/EntityEditorPanel.ts`, and `src/views/DLQueryPanel.ts` must collectively reach >80% coverage on new lines (Constitution Principle I quality gate)

- [x] T014 [P] Run `npm run compile` (extension host TypeScript check) — zero errors; confirms `src/views/EntityEditorPanel.ts` and `src/views/DLQueryPanel.ts` changes are type-safe

- [x] T015 [P] Run `npm run compile:webview` (webview bundle TypeScript check) — zero errors; confirms `webview-src/manchesterFormat.ts`, `EntityEditorApp.ts`, and `DLQueryApp.ts` changes are type-safe

- [x] T016 Run `npm run build` and execute all manual test steps from `specs/006-axiom-display-formatting/quickstart.md` — specifically: (a) formatted display in Entity Editor for conjunctive axioms; (b) save round-trip hash check (file unchanged after save without edits); (c) DL Query auto-format and execution; (d) guard test for `and` inside IRIs (no spurious break); (e) typing test — confirm spaces can be entered freely after `and` before the next conjunct is started; (f) entity underline test — confirm clicking an entity name in a formatted expression navigates to it (not clicking `and`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1, US2, US3 (Phases 3–5)**: All depend on Phase 2 (T002) completion — BLOCKED until T002 passes
- **US2 (Phase 4)**: T007 and T008 logically depend on T005 (same import is used)
- **US3 (Phase 5)**: T009 is conditional on T009 result; T011 and T012 are independent of T010
- **Polish (Phase 6)**: T013 depends on all prior phases; T014/T015 [P] can run together; T016 depends on T014+T015

### User Story Dependencies

- **US1 (Phase 3)**: Depends only on Foundational (T002)
- **US2 (Phase 4)**: Depends on US1 (T005 must import `collectLogicalLines` which T005 already added to EntityEditorApp.ts)
- **US3 (Phase 5)**: Depends only on Foundational (T002) — no dependency on US1 or US2

### Within Each Phase

Per Constitution Principle I: test tasks MUST be written first and confirmed to FAIL before the corresponding implementation task begins.

- T001 (failing tests) → T002 (implementation)
- T003 (failing test for EntityEditorPanel) → T004 (implementation patch)
- T005/T006 [P] (format on load + entity-ref remapping) — can start after T002; no failing test needed (display enhancement relying on already-tested `formatManchesterForDisplay` and `findFormatBreaks`)
- T007, T008 (save path and auto-format) — correctness guaranteed by T001 round-trip invariant + `trimEnd` guard
- T009 (verify DL Query validation) → T010 (only if T009 fails)
- T011, T012 [P] (DL Query auto-format and strip) — can proceed after T002

### Parallel Opportunities

- T005 and T006 are in the same file but operate on different sections (renderExpressionSection calls vs. shiftRefsForFormattedExpressions function) — they can be batched into a single pass
- T003 and T005/T006 are after T002 and can be worked simultaneously (different files)
- T011 and T012 are in the same file but independent changes — can be done in one pass
- T013, T014, T015 (verification) — T014 and T015 can run in parallel; T013 must run separately

---

## Parallel Example: Phase 3 + Phase 5 (after T002 completes)

```
Parallel track A (Entity Editor):
  T003 → T004 → T005+T006 (same file, one pass) → T007 → T008

Parallel track B (DL Query):
  T009 → T010 (if needed) → T011+T012 (same file, one pass)

Both tracks independently testable. Merge at Phase 6.
```

---

## Implementation Strategy

### MVP First (US1 Only — 6 tasks)

1. Complete Phase 2: T001, T002 (foundational module — ~2 hours)
2. Complete Phase 3 (US1): T003, T004, T005, T006 (Entity Editor display + entity-ref remapping — ~2 hours)
3. **STOP and VALIDATE**: Open Entity Editor with a conjunctive axiom; confirm multi-line display; click entity names to confirm navigation fires correctly
4. Demo to stakeholders if needed — formatted reading already delivers significant value

### Incremental Delivery

1. T001–T002 → Formatter module working, all unit tests green
2. T003–T006 → Entity Editor shows formatted axioms with correct underlines (US1 MVP)
3. T007–T008 → Save round-trip clean, auto-format during typing with correct space-entry behaviour (US2 complete)
4. T009–T012 → DL Query panel formatted (US3 complete)
5. T013–T016 → Full suite green, manually verified

---

## Notes

- `collectEditorLines` in `EntityEditorApp.ts` is fully replaced by `collectLogicalLines` in T007 — no callers remain after T007, so the function can be deleted
- The `formatManchesterForDisplay` + `collectLogicalLines` auto-format loop in T008/T011 is safe from infinite recursion because the combined guard `reformatted !== raw && raw.trimEnd() !== reformatted` short-circuits when raw ends in whitespace
- The `trimEnd` guard is essential: `collectLogicalLines` trims every line, so `reformatted` is always fully trimmed — without the guard, any trailing space in `raw` triggers a dispatch that eats the space
- The `matchBefore` regex `'[^']*'?` in `manchesterCompletionSource` can pick up the closing `'` of a completed label as an opening quote, matching subsequent keywords (e.g. ` and`) as prefix content; the non-alphanumeric prefix guard in T008/T011 prevents false autocomplete triggers
- `findFormatBreaks` enables `shiftRefsForFormattedExpressions` to remap entity-ref offsets precisely — each ` and ` replacement inserts exactly 4 extra characters (`\n   ` replacing ` `)
- Known limitation: linter error positions within a multi-line expression may point to the expression start rather than the precise error character. Accepted for this version.
- No Java server changes required — Java's OWLAPI Manchester parser is whitespace-agnostic
- No new npm packages — no additions to `package.json`
