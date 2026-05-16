# Implementation Plan: Axiom Expression Display Formatting

**Branch**: `006-axiom-display-formatting` | **Date**: 2026-05-16 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/006-axiom-display-formatting/spec.md`

## Summary

Improve the readability of conjunctive Manchester OWL class expressions in the Entity Editor and DL Query panels by automatically breaking at `and` keywords during display, while preserving single-line form in the OWL document, synchroniser, and reasoner. A pure display transformation: no model, serialiser, or Java changes required.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode), targeting Node.js (extension host) and browser IIFE bundles (webviews)  
**Primary Dependencies**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`) — already present  
**Storage**: N/A — purely display layer; OWL document untouched  
**Testing**: Vitest 1.6.0 (`npm test`)  
**Target Platform**: VS Code extension host (Node.js) + Webview (browser IIFE bundle)  
**Project Type**: VS Code extension  
**Performance Goals**: Formatter must run synchronously within CodeMirror's `updateListener`; no measurable latency on expressions up to 10 000 characters  
**Constraints**: No new runtime npm dependencies; webview bundles are browser-only IIFE — cannot import extension-host modules  
**Scale/Scope**: Expressions range from short (2–3 conjuncts) to moderately long (10–20 conjuncts in SNOMED CT). No full-ontology iteration.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ PASS | T001 (failing tests) written and confirmed failing before T002 (implementation); continuation tests written before fixes |
| II. Simplicity & YAGNI | ✅ PASS | No abstraction layers beyond what is needed; duplication of ≈6 lines in host-side validators accepted over cross-bundle coupling |
| III. OWL Standards Compliance | ✅ PASS | No change to serialiser or sync layer; OWL document content unchanged |
| IV. Scale-Aware Architecture | ✅ PASS | State-machine formatter is O(n) in expression length; no class-hierarchy iteration |
| V. Security & Safety | ✅ PASS | No user input reaches the sync or serialise path in formatted form; formatter is a pure function with no side effects |

## Complexity Tracking

| Item | Justification |
|------|--------------|
| Duplicated continuation-joining logic in `EntityEditorPanel.ts` and `DLQueryPanel.ts` | Cannot import from a browser IIFE bundle into the extension host without extracting a shared package. Per Principle II, 6-line duplication is preferable to premature extraction. |
| `findFormatBreaks` export (companion to `formatManchesterForDisplay`) | Required to remap entity-ref offsets from original-expression positions to formatted-document positions. Without it, clickable entity underlines would decorate `and` keywords instead of entity names. |

---

## Phase 0: Research

### Decision: Where does formatting live?

**Decision**: Formatting is confined to the webview layer (`manchesterFormat.ts`). The extension host receives only logical (single-line) expressions in both directions.

**Rationale**: The sync layer (`AxiomSync.ts`) and serialiser (`FunctionalSerializer.ts`) operate on model strings. Introducing formatted strings there would require stripping logic in two more places and risk corruption. Keeping formatting purely in the webview means the OWL document can never receive injected newlines.

**Alternatives considered**:
- Format in the extension host and pass formatted strings to webview: rejected — the host would need to strip before syncing, adding an error-prone step.
- Share a formatting utility between host and webview via a third npm package: rejected — over-engineered for a 6-line utility; Principle II.

### Decision: State-machine vs. regex

**Decision**: Four-state character-by-character state machine (`normal / iri / dquote / squote`) rather than a regex approach.

**Rationale**: Regex approaches break down with nested escape sequences (`\"`, `\'`) and require look-behind/look-ahead that obscures intent. The state machine handles all delimiter contexts explicitly and is straightforward to test and extend.

### Decision: Auto-format trigger

**Decision**: `EditorView.updateListener` fires on every `docChanged` event; it computes `reformatted` and dispatches a follow-up transaction only when `raw.trimEnd() !== reformatted`. The `trimEnd` guard prevents the listener from consuming trailing whitespace the user is still typing.

**Rationale**: Earlier attempts using `reformatted !== raw` caused spaces to be eaten because `collectLogicalLines` trims every line. The `trimEnd` guard correctly ignores trailing-whitespace-only differences.

---

## Phase 1: Design & Contracts

See [data-model.md](data-model.md), [contracts/manchesterFormat-api.md](contracts/manchesterFormat-api.md), and [quickstart.md](quickstart.md).

**Key design decisions captured in data-model.md**:
- Two forms: *logical* (single-line, used everywhere except the CodeMirror `doc`) and *formatted* (multi-line display, never leaves the webview)
- Three exported functions: `formatManchesterForDisplay`, `collectLogicalLines`, `stripAndContinuations`
- `findFormatBreaks` added post-design to support entity-ref offset remapping

**Entity-ref offset remapping** (post-design addition):
Server-side entity refs carry character offsets into the original single-line expression. After formatting, each ` and ` replacement inserts 4 extra characters. `findFormatBreaks` returns the positions of all such replacements; `shiftRefsForFormattedExpressions` applies `count_of_breaks_before_position × 4` to each ref's `from`/`to`.

---

## Phase 2: Foundational Module — `manchesterFormat.ts`

**Files**: `webview-src/manchesterFormat.ts`, `webview-src/manchesterFormat.test.ts`

**Exports**: `formatManchesterForDisplay`, `collectLogicalLines`, `stripAndContinuations`, `findFormatBreaks`

**Test coverage**: 40 unit tests including round-trip invariant and edge cases (IRI guards, escaped quotes, trailing-space handling, `findFormatBreaks` position correctness).

---

## Phase 3: US1 — Entity Editor Display (read path)

**Files**: `src/views/EntityEditorPanel.ts`, `webview-src/entity-editor/EntityEditorApp.ts`

**Changes**:
- `validateManchesterText` in `EntityEditorPanel.ts` joins continuation `and` lines before validating each logical expression (otherwise the `and hasLocation…` continuation line produces a parse error)
- Three `renderExpressionSection` calls in `EntityEditorApp.ts` map each expression through `formatManchesterForDisplay` before joining with `\n`
- Entity-ref positions remapped via `shiftRefsForFormattedExpressions` so clickable underlines land on entity names, not `and` keywords

---

## Phase 4: US2 — Entity Editor Edit/Save (write path + auto-format)

**Files**: `webview-src/entity-editor/EntityEditorApp.ts`

**Changes**:
- `getCurrentState` uses `collectLogicalLines` (already imported) instead of the deleted `collectEditorLines` to produce clean single-line expressions for the sync payload
- `createEditor` gains an `EditorView.updateListener` that auto-formats on keystroke using `collectLogicalLines` + `formatManchesterForDisplay`; guard: `raw.trimEnd() !== reformatted`

---

## Phase 5: US3 — DL Query Panel

**Files**: `src/views/DLQueryPanel.ts`, `webview-src/dl-query/DLQueryApp.ts`

**Changes**:
- `validateExpression` in `DLQueryPanel.ts` strips continuation lines before wrapping in OMN boilerplate
- `createExpressionEditor` in `DLQueryApp.ts` gains the same auto-format `updateListener` pattern (using `stripAndContinuations` for the single-expression editor)
- `executeBtn` click handler uses `stripAndContinuations` to send clean single-line expression to the reasoner

---

## Phase 6: Bug Fixes (post-implementation)

Four bugs discovered during live testing and resolved:

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Space after `and` was impossible to type | `formatManchesterForDisplay` fired when ` and ` had nothing after it | Added `i + 5 < expr.length && /\S/.test(expr[i + 5])` guard |
| ALL trailing spaces eaten on every keypress | `collectLogicalLines` trims lines; `reformatted !== raw` is always true when `raw` has trailing space | Changed guard to `raw.trimEnd() !== reformatted` |
| Autocomplete triggered on `and` keyword after single-quoted label | `'[^']*'?` in `matchBefore` mistook closing `'` of prior label as opening quote | Strip prefix; return null if it starts with non-alphanumeric; also guard Manchester keywords in unquoted branch |
| Clickable underlines decorated `and` instead of entity names | Entity refs use original-expression offsets; formatted doc has +4 chars per `and` break | `findFormatBreaks` + `shiftRefsForFormattedExpressions` |

---

## Phase 7: Polish & Verification

- Full test suite (`npm test`): 206 tests pass, 0 failures
- TypeScript type check (`npm run compile`): 0 errors
- Webview type check (`npm run compile:webview`): 0 errors
- Production build (`npm run build`): clean
- Manual end-to-end: Entity Editor multi-line display, save round-trip hash unchanged, DL Query auto-format and execute, IRI guard confirmed

## File Change Summary

| File | Change |
|------|--------|
| `webview-src/manchesterFormat.ts` | New module — 4 exports |
| `webview-src/manchesterFormat.test.ts` | New test file — 40 tests |
| `src/views/EntityEditorPanel.ts` | `validateManchesterText` joins continuation lines |
| `src/views/EntityEditorPanel.test.ts` | New test file — validates continuation-line handling |
| `src/views/DLQueryPanel.ts` | `validateExpression` strips continuation lines |
| `src/views/DLQueryPanel.test.ts` | New test case — continuation-line validation |
| `webview-src/entity-editor/EntityEditorApp.ts` | Format on load, auto-format on edit, collect logical lines on save, entity-ref offset remapping |
| `webview-src/dl-query/DLQueryApp.ts` | Auto-format on edit, strip on execute |
