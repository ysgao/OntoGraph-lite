# Quickstart: Multiline Annotation Fields

**Feature**: 003-multiline-annotation-fields  
**Date**: 2026-05-15

## What This Feature Does

Changes the value input for `skos:definition` and `rdfs:comment` annotations in the entity editor from a single-line text box to a multi-line text area. All other annotation properties are unchanged.

## Files to Change

| File | Change |
|------|--------|
| `webview-src/entity-editor/EntityEditorApp.ts` | Add `MULTILINE_IRIS` constant; extract and use `createValueWidget`; update CSS |
| `src/serializer/FunctionalSerializer.test.ts` | Add newline round-trip confirming test |

## New Dev Dependency

```bash
npm install --save-dev jsdom @types/jsdom
```

Needed only for the Vitest test file that exercises DOM element creation.

## Test File to Create

```
webview-src/entity-editor/EntityEditorApp.test.ts
```

Must use `// @vitest-environment jsdom` at the top.

Covers:
1. `createValueWidget` returns `<textarea>` for `skos:definition`
2. `createValueWidget` returns `<textarea>` for `rdfs:comment`
3. `createValueWidget` returns `<input type="text">` for `rdfs:label`
4. `onChange` callback fires on 'input' event with the new value

## Implementation Sketch (for reference during tasks)

```typescript
// New constant (near PRIORITY_IRIS):
const MULTILINE_IRIS: readonly string[] = [SKOS_DEFINITION, RDFS_COMMENT];

// New helper (near createIriInput or just before renderAnnotationsSection):
function createValueWidget(
  propIri: string,
  value: string,
  onChange: (v: string) => void,
): HTMLInputElement | HTMLTextAreaElement {
  if (MULTILINE_IRIS.includes(propIri)) {
    const ta = document.createElement('textarea');
    ta.className = 'annotation-value-input';
    ta.value = value;
    ta.addEventListener('input', () => onChange(ta.value));
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'annotation-value-input';
  inp.value = value;
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}
```

Replace the inline `document.createElement('input')` block in `renderAnnotationsSection` with a call to `createValueWidget(entry.propIri, entry.value, ...)`.

## CSS Addition

```css
textarea.annotation-value-input {
  min-height: 4.5em;   /* ~3 visible lines */
  resize: vertical;
}
```

## Manual Verification Steps

1. Open `test-ontologies/animals.omn` in VS Code with the extension active.
2. Open the entity editor for a class (e.g., `Animal`).
3. Add a `skos:definition` annotation with a multi-sentence value — confirm the textarea is visible.
4. Add a `rdfs:comment` annotation — confirm the textarea is visible.
5. Add a `rdfs:label` annotation — confirm it is still a single-line input.
6. Save and reopen the file — confirm the definition value round-trips correctly (no data loss, newlines preserved if entered).
