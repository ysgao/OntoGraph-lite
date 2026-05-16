# Data Model: Multi-Axiom Expression Editor

**Feature**: 007-multi-axiom-editor  
**Date**: 2026-05-16

---

## Overview

This feature changes how the three expression sections (SubClassOf, EquivalentClasses, GCI) in the Entity Editor are represented in both the webview and the extension–webview message protocol. The OWL model and serialiser are unchanged.

---

## Message Protocol Change

### `expressionEntityRefs` (in `LoadEntityMessage`)

| Before (006) | After (007) |
|-------------|-------------|
| `Record<string, ExpressionEntityRef[]>` | `Record<string, ExpressionEntityRef[][]>` |

**Before**: a flat array of refs whose `from`/`to` offsets are measured relative to the start of the joined multi-expression string (`"expr0\nexpr1\nexpr2"`).

**After**: an array of per-expression ref arrays. Index `i` contains only the refs for expression `i`, with `from`/`to` measured from the start of `expressions[i]`.

Example — two SubClassOf expressions `["Dog and Cat", "hasAge min 18"]`:

```typescript
// Before
expressionEntityRefs['superClassExpressions'] = [
  { from: 0, to: 3, iri: '...Dog...' },    // "Dog" in "Dog and Cat\nhasAge min 18"
  { from: 8, to: 11, iri: '...Cat...' },   // "Cat"
  { from: 12, to: 18, iri: '...hasAge...' }, // "hasAge" (offset after \n)
]

// After
expressionEntityRefs['superClassExpressions'] = [
  [
    { from: 0, to: 3, iri: '...Dog...' },  // "Dog" in "Dog and Cat"
    { from: 8, to: 11, iri: '...Cat...' }, // "Cat" in "Dog and Cat"
  ],
  [
    { from: 0, to: 6, iri: '...hasAge...' }, // "hasAge" in "hasAge min 18"
  ],
]
```

### Server-side change (`renderExpressionsWithRefs`)

```typescript
// Before: accumulates cross-expression offset
let offset = 0;
for (const expr of expressions) {
  const rendered = renderExpressionWithEntityRefs(...);
  refs.push(...rendered.refs.map(r => ({ ...r, from: r.from + offset, to: r.to + offset })));
  offset += rendered.text.length + 1;
}
refsBySection[sectionKey] = refs;

// After: one sub-array per expression, no cross-expression offset
const perExprRefs: ExpressionEntityRef[][] = [];
for (const expr of expressions) {
  const rendered = renderExpressionWithEntityRefs(...);
  perExprRefs.push(rendered.refs);
}
refsBySection[sectionKey] = perExprRefs;
```

---

## Webview State Model

### `editorMap`

| Before (006) | After (007) |
|-------------|-------------|
| `Record<string, EditorView>` | `Record<string, EditorView[]>` |

Each key (`'superClassExpressions'`, `'equivalentClassExpressions'`, `'gciExpressions'`) maps to an **ordered array** of `EditorView` instances — one per axiom expression in the section.

### `collectEditorLines(key)`

| Before | After |
|--------|-------|
| `collectLogicalLines(editorMap[key].state.doc.toString())` | `editorMap[key].flatMap(ed => collectLogicalLines(ed.state.doc.toString()))` |

Each editor holds at most one logical expression. `collectLogicalLines` is still called to handle the case where the user pasted continuation `and ` lines (which are joined back into a single expression by the strip step).

---

## New UI Components

### Expression Entry Container (`.expression-entry`)

Each axiom expression is rendered inside a container `<div class="expression-entry">` that holds:
1. A CodeMirror editor div (`.expression-editor`) — the editable expression
2. A delete button (`.expression-delete-btn`) — removes this entry from the section

### Section Footer (`.expression-section-footer`)

Each expression section has a footer element appended after all entries, containing:
1. An "Add expression" button (`.expression-add-btn`) — creates a new empty entry

---

## Auto-format (per-editor, single-expression mode)

Each per-axiom editor uses the DL Query auto-format pattern rather than the multi-expression pattern:

```typescript
// In updateListener:
const logical = stripAndContinuations(raw);
const reformatted = formatManchesterForDisplay(logical);
if (reformatted !== raw && raw.trimEnd() !== reformatted) {
  view.dispatch({ changes: { from: 0, to: raw.length, insert: reformatted } });
}
```

`stripAndContinuations` handles paste of multi-line content by joining continuation `and ` lines before re-formatting.

---

## Entity Ref Shift (per-expression)

`shiftRefsForFormattedExpressions` is replaced by a simpler per-expression helper:

```typescript
function shiftRefsForFormat(
  expr: string,
  refs: ExpressionEntityRef[],
): ExpressionEntityRef[] {
  const breaks = findFormatBreaks(expr);
  if (breaks.length === 0) { return refs; }
  return refs.map(ref => {
    const shift = breaks.filter(b => b < ref.from).length * 4;
    return { ...ref, from: ref.from + shift, to: ref.to + shift };
  });
}
```

Called once per expression when creating its editor: `shiftRefsForFormat(expr, perExprRefs[i])`.

---

## Invariants

1. `editorMap[key].length` equals the number of distinct axiom expressions currently displayed in that section.
2. Each editor in `editorMap[key]` holds at most one logical expression (blank editors are discarded on save).
3. `collectEditorLines(key)` returns an array of at most `editorMap[key].length` non-empty strings (blank editors produce empty string which is filtered out).
4. The `expressionEntityRefs[key]` array is index-aligned with `superClassExpressions` (etc.): `expressionEntityRefs[key][i]` contains refs for `superClassExpressions[i]`.
5. The OWL document never receives display artefacts — blank-line separators and delete-button labels do not appear in the serialised axioms.
