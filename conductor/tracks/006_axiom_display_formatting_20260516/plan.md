# Implementation Plan: Axiom Expression Display Formatting

**Spec**: `/specs/006-axiom-display-formatting/`  
**Branch**: `006-axiom-display-formatting`  
**Started**: 2026-05-16 | **Signed off**: 2026-05-16

## Phase 1: Foundational Module — `manchesterFormat.ts` (TDD) [checkpoint: 2b5ae0b]

- [x] Task: Write failing tests in `webview-src/manchesterFormat.test.ts` [2b5ae0b]
    - [x] 40 tests covering `formatManchesterForDisplay`, `collectLogicalLines`, `stripAndContinuations`, `findFormatBreaks`, and round-trip invariant
- [x] Task: Implement `webview-src/manchesterFormat.ts` [2b5ae0b]
    - [x] Four-state machine (normal/iri/dquote/squote) with trailing-space guard (`/\S/.test(expr[i+5])`)
    - [x] `findFormatBreaks` — companion function returning break positions for offset remapping
    - [x] All 40 tests pass

## Phase 2: US1 — Entity Editor Read Path [checkpoint: 2b5ae0b]

- [x] Task: Patch `validateManchesterText` in `src/views/EntityEditorPanel.ts` [2b5ae0b]
    - [x] Write failing test in `src/views/EntityEditorPanel.test.ts` (continuation-line validation)
    - [x] Two-pass join before parsing; 8 panel tests pass
- [x] Task: Format expressions on load in `webview-src/entity-editor/EntityEditorApp.ts` [2b5ae0b]
    - [x] Map each expression through `formatManchesterForDisplay` before passing to `renderExpressionSection`
    - [x] `shiftRefsForFormattedExpressions` remaps entity-ref offsets (+4 per `and` break) so underlines land on entity names not `and` keywords

## Phase 3: US2 — Entity Editor Edit/Save Path [checkpoint: 2b5ae0b]

- [x] Task: Wire `collectLogicalLines` into save path in `webview-src/entity-editor/EntityEditorApp.ts` [2b5ae0b]
    - [x] `collectEditorLines` delegates to `collectLogicalLines`; save payload is always single-line
- [x] Task: Add auto-format `updateListener` to `createEditor()` [2b5ae0b]
    - [x] `trimEnd` guard prevents space-eating: dispatches only when `reformatted !== raw && raw.trimEnd() !== reformatted`
    - [x] `manchesterCompletionSource` guards: non-alphanumeric prefix → null; Manchester keywords in unquoted branch → null

## Phase 4: US3 — DL Query Panel [checkpoint: 2b5ae0b]

- [x] Task: Patch `validateExpression` in `src/views/DLQueryPanel.ts` [2b5ae0b]
    - [x] Strips continuation `and` lines before wrapping in OMN boilerplate; 23 panel tests pass
- [x] Task: Add auto-format `updateListener` to `createExpressionEditor()` and strip in execute handler [2b5ae0b]
    - [x] Same `trimEnd` guard as US2; `stripAndContinuations` used on execute

## Phase 5: Verification [checkpoint: 2b5ae0b]

- [x] Task: Full test suite [2b5ae0b]
    - [x] 206/206 tests pass across 16 test files
- [x] Task: Type checks [2b5ae0b]
    - [x] `npm run compile` — 0 errors
    - [x] `npm run compile:webview` — 0 errors
- [x] Task: Production build [2b5ae0b]
    - [x] `npm run build` — 6 bundles, clean
- [x] Task: Conductor — User Manual Verification 'Axiom Expression Display Formatting' (Protocol in workflow.md)
