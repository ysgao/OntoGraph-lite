# Data Model: Multiline Annotation Fields

**Feature**: 003-multiline-annotation-fields  
**Date**: 2026-05-15

## Entities

### AnnotationEntry (existing, unchanged)

```
interface AnnotationEntry {
  propIri: string;   // Full IRI of the annotation property
  value:   string;   // Plain string value (may contain \n after this feature)
  lang?:   string;   // Optional BCP-47 language tag
}
```

No changes to the data structure. The `value` field is already a `string` and can hold newlines; the model is not modified.

### MULTILINE_IRIS (new constant, EntityEditorApp.ts)

```
const MULTILINE_IRIS: readonly string[] = [SKOS_DEFINITION, RDFS_COMMENT];
```

A read-only set of property IRIs whose value widget should be a multi-line textarea.

| IRI | Local name |
|-----|-----------|
| `http://www.w3.org/2004/02/skos/core#definition` | `skos:definition` |
| `http://www.w3.org/2000/01/rdf-schema#comment` | `rdfs:comment` |

### createValueWidget (new helper function, EntityEditorApp.ts)

```
function createValueWidget(
  propIri:  string,
  value:    string,
  onChange: (newValue: string) => void
): HTMLInputElement | HTMLTextAreaElement
```

**Responsibilities**:
- Returns a `<textarea>` if `MULTILINE_IRIS.includes(propIri)`, else returns `<input type="text">`.
- Sets `.value` to the given `value`.
- Adds an `'input'` event listener that calls `onChange(el.value)`.
- Applies `annotation-value-input` CSS class.

**State transitions**: None — widget is stateless. Caller owns state via `annotationState[i]`.

## Validation Rules

- `value` may contain newlines (`\n`); callers treat it as an opaque string.
- No length limit is enforced in the widget (mirrors existing single-line behaviour).

## Impact on Persistence

| Layer | Change | Why |
|-------|--------|-----|
| `FunctionalParser.ts` | None | Already unescapes `\n` → newline |
| `FunctionalSerializer.ts` | None (+ confirming test) | Already escapes newline → `\n` |
| `AnnotationSync.ts` | None | Already escapes newline → `\n` in `fmtLiteral` |
| `EntityEditorApp.ts` | New helper + conditional | Core of this feature |
