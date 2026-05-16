# Research: Multi-Axiom Expression Editor

**Feature**: 007-multi-axiom-editor  
**Date**: 2026-05-16

---

## Decision 1: One editor per axiom vs. decorations in a shared editor

**Decision**: One CodeMirror editor per axiom expression.

**Rationale**: The spec requires (a) a visible separator between expressions, (b) an "Add expression" action, and (c) a way to remove an individual expression. A per-editor model satisfies all three naturally:
- The separator is implicit — the border/gap between adjacent editor containers is the boundary.
- "Add expression" appends a new empty editor to the section's DOM container.
- "Remove expression" destroys the editor and removes its container element from the DOM.

A shared-editor approach (all axioms in one CodeMirror instance, with line decorations as separators) would require complex CodeMirror 6 decoration infrastructure (`Decoration.widget` or `Decoration.line`) and custom transaction handling to identify and extract the expression under the cursor for the delete action. The per-editor model is both simpler and less fragile.

**Alternatives considered**:
- **Shared editor with line decorations**: CodeMirror 6 `StateField` + `EditorView.decorations` can render widget decorations at blank-line positions. Rejected: complex, requires custom position tracking for the delete action, no precedent in the existing codebase.
- **Shared editor with no separator (status quo)**: Rejected by the spec — unambiguous visual separation is FR-001.

---

## Decision 2: `expressionEntityRefs` message type

**Decision**: Change `expressionEntityRefs` from `Record<string, ExpressionEntityRef[]>` (flat, cross-expression offsets) to `Record<string, ExpressionEntityRef[][]>` (array of per-expression ref arrays, 0-indexed within each expression string).

**Rationale**: The current flat array was designed for a model where all expressions in a section are joined into a single string. With one editor per expression, each editor needs only the refs for its own expression, with `from`/`to` offsets measured from the start of that expression. Providing a flat cross-section array to per-expression editors requires splitting logic in the webview. Providing a nested array per expression is explicit and eliminates the splitting step.

The server-side change (`renderExpressionsWithRefs` in `EntityEditorPanel.ts`) is minimal: stop accumulating the cross-expression `offset` and instead push a separate array per expression into the result.

**Alternatives considered**:
- **Keep flat array, split in webview**: The webview would reconstruct expression boundaries from the `superClassExpressions` strings and partition the flat refs accordingly. Correct but more fragile — a subtle off-by-one in boundary calculation would silently misplace underlines.

---

## Decision 3: Auto-format in single-expression editors

**Decision**: Each per-axiom editor auto-formats using `formatManchesterForDisplay(stripAndContinuations(raw))` — the DL Query pattern, not the multi-expression `collectLogicalLines(...).map(...).join('\n')` pattern.

**Rationale**: Each editor holds exactly one logical expression. `stripAndContinuations` handles the case where the user pastes a multi-line block (joining continuation `and ` lines), then `formatManchesterForDisplay` re-formats it. The guard remains `raw.trimEnd() !== reformatted` to prevent space-eating.

If the user pastes a block containing blank lines (multiple expressions), each blank-line-separated segment should become its own editor. However, implementing this paste-split behaviour is complex and is deferred. For this version, blank lines are ignored (stripped by `stripAndContinuations` via `collectLogicalLines`), and the content lands in the single editor as a merged expression. The spec edge case acknowledges this and leaves the resolution to planning — this decision documents the resolution: paste of multi-expression content merges into the current editor.

---

## Decision 4: `shiftRefsForFormattedExpressions` replacement

**Decision**: Replace `shiftRefsForFormattedExpressions` with a per-expression helper `shiftRefsForFormat(expr, refs)` that takes one expression string and its corresponding refs array.

**Rationale**: The existing function iterated over all expressions and accumulated cross-expression offsets. With per-editor refs (each already 0-indexed to their expression), the helper only needs to shift by `findFormatBreaks(expr).filter(b => b < ref.from).length × 4` — one straightforward line per ref.

---

## Decision 5: Lifecycle of `editorMap`

**Decision**: Change `editorMap` from `Record<string, EditorView>` to `Record<string, EditorView[]>`. A new `destroySection(key)` helper replaces the inline `editorMap[key].destroy()` call.

**Rationale**: When a new entity is loaded, each expression section must destroy all its current editors before creating new ones. Iterating over `editorMap[key]` (an array) and calling `.destroy()` on each is the natural replacement for the single-editor destroy call.

---

## Dependency Analysis

No new npm packages required. All technology is already present:
- CodeMirror 6 (`@codemirror/state`, `@codemirror/view`) — dynamic `EditorView` creation and destruction is supported natively.
- `manchesterFormat.ts` (`formatManchesterForDisplay`, `stripAndContinuations`, `findFormatBreaks`) — re-used unchanged.
- `EntityEditorMessages.ts` — one type change (`ExpressionEntityRef[][]`).
- `EntityEditorPanel.ts` — `renderExpressionsWithRefs` simplification.
- `EntityEditorApp.ts` — the primary change surface.
