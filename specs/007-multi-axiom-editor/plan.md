# Implementation Plan: Multi-Axiom Expression Editor

**Branch**: `007-multi-axiom-editor` | **Date**: 2026-05-16 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/007-multi-axiom-editor/spec.md`

## Summary

Replace the single shared CodeMirror editor per expression section with one CodeMirror editor per axiom expression. Add a delete button to each entry and an "Add expression" button per section. Change the `expressionEntityRefs` message type from a flat array to an array-of-arrays aligned with expressions. No changes to the OWL model, serialiser, or Java server.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode), targeting Node.js (extension host) and browser IIFE bundles (webviews)  
**Primary Dependencies**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`) — already present; `manchesterFormat.ts` — already present  
**Storage**: N/A — no new persistence; OWL document unchanged  
**Testing**: Vitest 1.6.0 (`npm test`)  
**Target Platform**: VS Code extension host (Node.js) + Webview (browser IIFE bundle)  
**Project Type**: VS Code extension  
**Performance Goals**: Sections with 20+ axioms must remain responsive; each editor creation is O(1) and independent  
**Constraints**: No new npm dependencies; webview is a browser IIFE bundle  
**Scale/Scope**: Typical 2–5 axioms per section; scales to 20+ without degradation

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ REQUIRED | TDD mandatory: failing tests before each implementation task. EntityEditorPanel.ts changes need updated tests first. |
| II. Simplicity & YAGNI | ✅ PASS | Per-editor model eliminates complex line-decoration infrastructure. No abstractions beyond what the spec requires. |
| III. OWL Standards Compliance | ✅ PASS | No serialiser or sync-layer changes. Save payload remains `string[]` of single-line expressions. |
| IV. Scale-Aware Architecture | ✅ PASS | Each editor is created independently; no full-section re-render required for add/delete. |
| V. Security & Safety | ✅ PASS | No new attack surfaces. Delete button only modifies in-memory editor state; no external calls. |

## Complexity Tracking

| Item | Justification |
|------|--------------|
| `expressionEntityRefs` type change to `ExpressionEntityRef[][]` | Required for clean per-editor ref delivery. Flat array to per-editor model is a breaking change in the message contract; the only consumer (webview) is updated in the same feature. |
| `shiftRefsForFormattedExpressions` replaced by `shiftRefsForFormat` | Simplification — per-expression version is ≈5 lines vs. the 12-line cross-expression version. No functional regression. |

---

## Phase 0: Research

See [research.md](research.md). All decisions resolved:
- One editor per axiom (vs. shared editor with decorations)
- `ExpressionEntityRef[][]` message type
- DL Query auto-format pattern per editor
- `shiftRefsForFormat` per-expression helper replaces `shiftRefsForFormattedExpressions`

---

## Phase 1: Design & Contracts

See [data-model.md](data-model.md), [contracts/expression-section-ui.md](contracts/expression-section-ui.md), [quickstart.md](quickstart.md).

**Key structural changes**:

1. **`EntityEditorMessages.ts`**: `expressionEntityRefs` type changes from `Record<string, ExpressionEntityRef[]>` to `Record<string, ExpressionEntityRef[][]>`.

2. **`EntityEditorPanel.ts`**: `renderExpressionsWithRefs` stops accumulating cross-expression offset; produces one sub-array per expression.

3. **`EntityEditorApp.ts`** (primary change surface):
   - `editorMap: Record<string, EditorView>` → `Record<string, EditorView[]>`
   - `renderExpressionSection(container, title, key, initialDoc, entityRefs)` → `renderExpressionSection(container, title, key, expressions, perExprRefs)`
   - New `createExpressionEntry(body, key, expr, refs)` creates one editor + delete button
   - New `addExpressionButton(body, key)` creates the "Add expression" footer button
   - `collectEditorLines(key)` → iterate over `editorMap[key][]`
   - `shiftRefsForFormattedExpressions` → replaced by `shiftRefsForFormat(expr, refs)`
   - Per-editor auto-format uses `formatManchesterForDisplay(stripAndContinuations(raw))` (DL Query pattern)

4. **CSS** (inline in `EntityEditorApp.ts`): `.expression-entry` with bottom margin/border as separator, `.expression-delete-btn` styled as a small icon button, `.expression-add-btn` styled as a secondary action button.

---

## Phase 2: Implementation

### Phase 2a: Message Type Update (TDD, extension host)

**Files**: `src/views/EntityEditorMessages.ts`, `src/views/EntityEditorPanel.ts`, `src/views/EntityEditorPanel.test.ts`

**Tasks**:

1. Update `EntityEditorPanel.test.ts`: add test asserting that `renderExpressionsWithRefs` produces an array-of-arrays where `result[i]` has refs with offsets relative to `expressions[i]`, not the joined string. Confirm this test FAILS.
2. Update `expressionEntityRefs` type in `EntityEditorMessages.ts` to `Record<string, ExpressionEntityRef[][]>`.
3. Update `renderExpressionsWithRefs` in `EntityEditorPanel.ts` to produce per-expression sub-arrays (remove cross-expression offset accumulation).
4. Confirm all `EntityEditorPanel.test.ts` tests pass.

### Phase 2b: Webview Refactor (EntityEditorApp.ts)

**Files**: `webview-src/entity-editor/EntityEditorApp.ts`

**Tasks** (no unit tests possible for CodeMirror browser components; validated via build + manual):

5. Change `editorMap` type to `Record<string, EditorView[]>`. Add `destroySection(key)` helper.
6. Replace `shiftRefsForFormattedExpressions` with `shiftRefsForFormat(expr, refs)`.
7. Implement `createExpressionEntry(body, key, expr, refs)`:
   - Creates `.expression-entry` container
   - Creates delete button; on click: destroy editor, splice from `editorMap[key]`, remove DOM element, `checkForChanges()`
   - Creates editor via `createEditor(editorEl, formatManchesterForDisplay(expr), shiftRefsForFormat(expr, refs))`
   - Pushes editor to `editorMap[key]`
   - Appends entry before the footer (if present)
8. Implement `addExpressionButton(body, key)` footer with "Add expression" button:
   - On click: calls `createExpressionEntry(body, key, '', [])` then focuses the new editor
9. Rewrite `renderExpressionSection(container, title, key, expressions, perExprRefs)`:
   - Calls `destroySection(key)` to clean up any previous editors
   - Initialises `editorMap[key] = []`
   - Creates the section DOM using `makeSectionEl`
   - Calls `createExpressionEntry` for each expression
   - Calls `addExpressionButton` to append the footer
10. Update `createEditor` updateListener to use single-expression auto-format: `formatManchesterForDisplay(stripAndContinuations(raw))`
11. Update `collectEditorLines(key)` to iterate over `editorMap[key][]`
12. Update the three `renderExpressionSection` call sites in `loadEntity` handler to pass `expressions[]` and `perExprRefs[][]`
13. Update the section destroy loop in the entity-cleanup path
14. Add CSS for `.expression-entry`, `.expression-delete-btn`, `.expression-add-btn`
15. Run `npm run compile:webview` — zero errors

### Phase 2c: Verification

16. Run `npm test` — all tests pass
17. Run `npm run compile` — zero extension-host type errors
18. Run `npm run build` — clean
19. Manual end-to-end tests per `quickstart.md`

---

## File Change Summary

| File | Change |
|------|--------|
| `src/views/EntityEditorMessages.ts` | `expressionEntityRefs` type: `[]` → `[][]` |
| `src/views/EntityEditorPanel.ts` | `renderExpressionsWithRefs`: remove cross-expression offset |
| `src/views/EntityEditorPanel.test.ts` | Update/add tests for new per-expression refs structure |
| `webview-src/entity-editor/EntityEditorApp.ts` | `editorMap` refactor, `createExpressionEntry`, `addExpressionButton`, `shiftRefsForFormat`, `renderExpressionSection` rewrite, CSS additions |

No changes to: `manchesterFormat.ts`, `DLQueryApp.ts`, sync layer, serialiser, Java server.
