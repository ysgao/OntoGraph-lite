# Implementation Plan: Axiom Expression Display Formatting

**Branch**: `006-axiom-display-formatting` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-axiom-display-formatting/spec.md`

## Summary

Display Manchester syntax class expressions split across multiple lines in the Entity Editor and DL Query panels, with each `and` keyword starting a new indented line. The transformation is purely cosmetic: all save, validation, and classification code paths receive single-line expressions after stripping continuation lines.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode), targeting browser IIFE bundles  
**Primary Dependencies**: CodeMirror 6 (already present — `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`); no new runtime dependencies  
**Storage**: N/A — purely display layer; OWL document untouched  
**Testing**: Vitest 1.6.0  
**Target Platform**: VS Code Webview (Chromium browser sandbox)  
**Project Type**: VS Code extension with browser webview bundles  
**Performance Goals**: Formatter runs in O(n) on expression character length; no scale concern  
**Constraints**: No new npm packages; no changes to the Java server; formatting transparent to reasoner and serializer  
**Scale/Scope**: Individual expression strings (typically < 500 characters); unaffected by SNOMED CT scale

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ Required | Unit tests for `manchesterFormat.ts` must be written before any implementation. Integration tests verify round-trip save fidelity. |
| II. Simplicity/YAGNI | ✅ | One new module, three touched files. No abstraction layers. |
| III. OWL Standards | ✅ | Serializer, AxiomSync, and AnnotationSync are **not touched**. The formatted text never reaches the file system. |
| IV. Scale-Aware | ✅ | Formatter is O(n) on expression length; anatomy.owl benchmark not needed (no hierarchy traversal). |
| V. Security | ✅ | Formatter processes Manchester expression strings from the in-memory model; no injection surface introduced. |

## Project Structure

### Documentation (this feature)

```text
specs/006-axiom-display-formatting/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched by this feature)

```text
webview-src/
├── manchesterFormat.ts              # NEW — formatter + logical-line collector
├── manchesterFormat.test.ts         # NEW — unit tests
├── entity-editor/
│   └── EntityEditorApp.ts           # MODIFIED — format on load, strip on save/validate
└── dl-query/
    └── DLQueryApp.ts                # MODIFIED — auto-format while typing, strip on execute/validate

src/views/
├── EntityEditorPanel.ts             # MODIFIED — validateManchesterText joins continuation lines
└── DLQueryPanel.ts                  # MODIFIED — validateExpression strips continuation lines
```

## Complexity Tracking

No constitution violations. No entries required.

---

## Phase 0: Research

### R-1 — Does the Peggy-generated Manchester parser handle newlines within class expressions?

**Decision**: Validation functions are server-side TypeScript, not the Peggy parser. Both `validateManchesterText` (EntityEditorPanel.ts:614–638) and `validateExpression` (DLQueryPanel.ts:134–147) wrap the text in a synthetic OMN document and call `new ManchesterParser(wrappedDoc, '').parse()`. Each splits by `\n` and validates **one line at a time**. With continuation lines (`    and ...`), a continuation-only line would be wrapped as `SubClassOf: and ...` which is syntactically invalid and would produce a spurious error.

**Resolution**: Both validation functions must be patched to join continuation `and` lines before calling the parser. This is a two-line change per function.

---

### R-2 — CodeMirror 6 approach for auto-formatting while typing

**Decision**: Use a `StateEffect` + `EditorView.updateListener` (already present in EntityEditorApp.ts as `EditorView.updateListener.of((update) => { if (update.docChanged) { checkForChanges(); } })`). When a doc change is detected, a follow-up check can inspect whether the last inserted character(s) completed the ` and ` pattern and dispatch a replacement transaction.

The specific mechanism: use CodeMirror's `inputRules` from `@codemirror/autocomplete` — **but that package is already a dependency** and does not export `inputRules`. Instead, implement a transaction filter:

A `domEventHandlers` approach does not intercept paste or programmatic insertions. A `transaction.filter` (from `@codemirror/state`) receives every transaction before it is applied, but formatting logic is easier to express as a post-insertion correction.

**Chosen approach**: After each doc-changed update in the `updateListener`, check if the string ` and ` (with word boundaries) appears in the newly modified region of the document text, outside of angle-bracket or quote contexts. If so, dispatch a replacement transaction that substitutes ` and ` → `\n    and `. This is performed synchronously after the user's transaction and does not cause a visible flicker. The replacement must guard against recursion (only apply when the inserted change itself introduced ` and `).

**Precedent**: This pattern is widely used in CodeMirror 6 for auto-pairing brackets and auto-completing list markers.

---

### R-3 — Guard: detecting `and` inside IRIs and quoted strings

**Decision**: The formatter must not break at `and` that appears inside:
- `<...>` IRI brackets (e.g. `<http://example.org/land>`)
- `"..."` double-quoted string literals
- `'...'` single-quoted labels (Manchester syntax local names with spaces)

**Approach**: A single-pass state machine over the expression string, tracking which of four states is active (Normal, InIri, InDoubleQuote, InSingleQuote). In the Normal state only, look for `\band\b` (word boundary: preceded and followed by non-word characters). Replace the occurrence of ` and ` with `\n    and ` (4-space indent). Escape sequences inside strings (`\"`, `\'`) are consumed to avoid premature state exit.

The token boundary rule: `and` is a keyword only when the character before it is a space (or it is at the start of the expression) and the character after it is a space. In practice the pattern is always ` and ` surrounded by spaces in valid Manchester syntax.

---

### R-4 — Indentation width

**Decision**: 4 spaces. This matches the indent typically seen in `.omn` Manchester syntax files (e.g. `animals.omn`) and provides clear visual offset from the expression start.

---

## Phase 1: Design & Contracts

### Data model

No new persistent entities. The feature introduces one pure-function module:

```
manchesterFormat.ts
  formatManchesterForDisplay(expr: string): string
    Input:  a single-line Manchester class expression string
    Output: a multi-line display string with '\n    and ' inserted before 
            each 'and' keyword outside of angle-brackets / quoted strings
    Invariant: stripAndContinuations(formatManchesterForDisplay(e)) === e (for valid inputs)

  collectLogicalLines(rawText: string): string[]
    Input:  raw editor content — may contain formatted continuation lines
            (lines that start with 'and ' after trimming)
    Output: list of single-line logical expressions, suitable for serialization
    Rules:
      1. Split rawText by '\n'
      2. Trim each line
      3. Skip blank lines and comment lines (start with '#')
      4. A line starting with 'and ' (after trim) is a continuation — 
         append ' <line>' to the previous result entry
      5. All other non-blank non-comment lines start a new result entry

  stripAndContinuations(rawText: string): string
    Input:  raw editor content for a SINGLE-expression editor (DL Query)
    Output: a single logical line (joins all continuation lines)
    Implementation: collectLogicalLines(rawText).join(' ')
```

Full data model at: [`data-model.md`](./data-model.md)

### Interface contracts (`contracts/`)

**No new VS Code message types are introduced.** All existing message schemas (Entity Editor and DL Query) remain unchanged. The formatting is an entirely intra-webview concern; the extension host never sees formatted text.

The one non-message contract is the formatter module API itself — see [`contracts/manchesterFormat-api.md`](./contracts/manchesterFormat-api.md).

### Change-by-change design

#### 1. `webview-src/manchesterFormat.ts` (new)

Three exported functions (see data model above). No side effects. No imports from VS Code or CodeMirror.

Test file: `webview-src/manchesterFormat.test.ts` — must be written first (TDD):
- `formatManchesterForDisplay`: identity on no-`and` input; breaks at bare `and`; does not break at `and` inside `<...>`; does not break at `and` inside `"..."` or `'...'`; handles escaped quotes; multiple conjuncts produce multiple breaks; empty string returns empty string
- `collectLogicalLines`: single expression, no `and` → one-element array; two separate expressions → two-element array; formatted expression (with continuation lines) round-trips back to original; mixed (some with `and`, some without); blank lines ignored; comment lines ignored
- Round-trip property: `collectLogicalLines(exprs.map(formatManchesterForDisplay).join('\n'))` equals `exprs` for any array of valid single-line expressions

#### 2. `webview-src/entity-editor/EntityEditorApp.ts`

**A. Format on load** — `renderExpressionSection` receives `initialDoc` as the joined expressions. Change the join to:
```
(msg.superClassExpressions ?? []).map(e => formatManchesterForDisplay(e)).join('\n')
```
(Same for `equivalentClassExpressions`, `gciExpressions`.)

**B. Strip on save** — Replace `collectEditorLines(key)` call-sites with `collectLogicalLines(editorMap[key]?.state.doc.toString() ?? '')`. The function `collectEditorLines` is only called from `getCurrentState()`; replace all three call-sites.

**C. Strip before validation** — In `manchesterLinter`, the `text` sent for validation is currently `view.state.doc.toString()`. Replace with:
```
const text = collectLogicalLines(view.state.doc.toString()).join('\n');
```
This means the validation server receives the original single-line expressions (one per line), exactly as before the feature was added. Error character positions will reference the stripped text, not the formatted text. This is an accepted limitation (error underlines will mark the whole logical line).

**D. Auto-format while typing** — Add an `EditorView.updateListener` extension to `createEditor()` that fires after doc changes. If the new doc text contains ` and ` in the Normal (non-IRI, non-quote) state at the cursor's immediate vicinity, dispatch a follow-up transaction replacing it. Guard flag prevents recursive application. Implementation sketch:

```typescript
EditorView.updateListener.of((update) => {
  if (!update.docChanged) { return; }
  const docText = update.state.doc.toString();
  const reformatted = formatManchesterForDisplay(
    collectLogicalLines(docText).join('\n')
  );
  if (reformatted !== docText) {
    // preserve cursor position approximately
    update.view.dispatch({
      changes: { from: 0, to: docText.length, insert: reformatted },
      selection: update.state.selection,
    });
  }
})
```

Note: this reformats the whole editor on each change. For short expressions (< 500 chars) this is imperceptible. The guard is that `reformatted !== docText`; if they're already equal, no transaction is dispatched (no infinite loop).

#### 3. `webview-src/dl-query/DLQueryApp.ts`

**A. Auto-format while typing** — Add the same `EditorView.updateListener` to `createExpressionEditor()`. Same approach as Entity Editor above; single-expression editor so `collectLogicalLines` always returns 0 or 1 element.

**B. Strip on execute** — Replace:
```typescript
const expression = editor.state.doc.toString().trim();
```
with:
```typescript
const expression = stripAndContinuations(editor.state.doc.toString()).trim();
```

**C. Strip before validation** — In `manchesterLinter`, replace:
```typescript
const text = view.state.doc.toString();
```
with:
```typescript
const text = stripAndContinuations(view.state.doc.toString());
```

#### 4. `src/views/EntityEditorPanel.ts`

**Patch `validateManchesterText`** — Replace the current line-by-line loop with a logical-line collector before validation:

Current (lines 618–635):
```typescript
const lines = text.split('\n');
let offset = 0;
for (const line of lines) {
  const trimmed = line.trim();
  const lineLen = line.length + 1;
  if (trimmed.length > 0 && !trimmed.startsWith('#')) {
    // ... validate trimmed
  }
  offset += lineLen;
}
```

New: collect logical lines first (joining `and` continuations), then validate each. Character offsets reference the start of each logical expression in the raw text. When a continuation line caused the expression start offset, the `from` and `to` positions of any error cover the whole multi-line expression span. This is implemented inline — no import of the webview module (the validator lives in the extension host, not the webview).

The logic to join continuation lines is duplicated (about 8 lines) in the extension host and the webview's `collectLogicalLines`. This duplication is intentional — Principle II (no abstraction across process boundaries). The validator is not on the hot path and the code is trivial.

#### 5. `src/views/DLQueryPanel.ts`

**Patch `validateExpression`** — Strip continuation lines from the input before wrapping and parsing:
```typescript
function validateExpression(text: string): ... {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const logical = lines.reduce<string[]>((acc, line) => {
    if (/^and\s/.test(line) && acc.length > 0) {
      acc[acc.length - 1] += ' ' + line;
      return acc;
    }
    return [...acc, line];
  }, []);
  const stripped = logical.join('\n');
  // ... rest of existing function using `stripped` instead of `text`
}
```

### quickstart.md

See [`quickstart.md`](./quickstart.md) for how to manually test the formatted display locally.

---

## Known Limitations (documented, not bugs)

1. **Linter error positions** — When a logical expression spans multiple display lines (due to `and` breaks), validation errors are reported at the start character of the whole expression rather than the precise character within the expression. The error underline covers the whole expression.

2. **`or` and other conjunctions not formatted** — Per the spec, only `and` triggers line breaks in this version. `or`, `not`, `some`, `only`, etc. remain on the same line.

3. **Deep nesting indentation** — All continuation lines receive a flat 4-space indent regardless of nesting depth. Contextual indentation is out of scope.
