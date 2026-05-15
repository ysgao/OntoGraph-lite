# UI Contract: Annotation Row Display/Edit Mode

**Feature**: 004-annotation-url-links  
**Date**: 2026-05-15

---

## annotationValueDisplay module

### `segmentAnnotationValue(value: string): AnnotationValueSegment[]`

Splits an annotation value string into typed segments.

**Input**: any string (including empty string).

**Output**: ordered array of `AnnotationValueSegment`. Guarantees:
- Concatenating all `content` fields reconstructs the original `value` exactly.
- Adjacent segments are never the same type.
- An empty string produces `[{ type: 'text', content: '' }]`.
- All URLs that match `/https?:\/\/[^\s"<>[\]()]+/g` (after stripping trailing `.,:;!?)`  characters) are extracted as `'url'` or `'imageUrl'` segments.
- A URL segment is `'imageUrl'` if the URL (lowercased, before `?` or `#`) ends with `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, or `.webp`.

---

### `createAnnotationDisplayElement(value: string, onOpen: (url: string) => void): HTMLElement`

Returns a `<div class="annotation-value-display">` ready to insert into the DOM.

**Rendering rules**:
- `'text'` segments → `Text` node.
- `'url'` segments → `<a class="annotation-link" data-url="{url}" href="#">{url}</a>`. Click calls `onOpen(url)` and calls `e.preventDefault()`.
- `'imageUrl'` segments → same `<a>` as above, followed by `<img class="annotation-image-preview" src="{url}" alt="" loading="lazy">`. Click on image also calls `onOpen(url)`.
- The `<div>` has `cursor: text` pointer to signal click-to-edit, except over `<a>` and `<img>` which have `cursor: pointer`.

---

## Annotation Row Behaviour Contract

### Display Mode (initial state)

- The `<div class="annotation-value-display">` is visible; the edit widget is hidden (`display: none`).
- Clicking the div (except on `<a>` or `<img>`) enters edit mode.
- Clicking an `<a>` or `<img>` calls `vscode.postMessage({ type: 'openExternal', url })` and does NOT enter edit mode.

### Edit Mode

- The edit widget (input or textarea from `createValueWidget`) is visible; the display div is hidden.
- The widget receives focus immediately on mode entry.
- On `blur`, the widget exits edit mode: the display div is updated from the current `annotationState[i].value` and made visible again; the widget is hidden.

### Invariants

- At any moment exactly one of {display div, edit widget} is visible per row.
- The underlying `annotationState` value is never changed by the display/edit mode toggle itself — only by user edits to the widget.
- The display div content always reflects the current `annotationState[i].value` at the moment display mode is entered.

---

## Extension Host Message Contract: `openExternal`

```typescript
interface OpenExternalMessage {
  type: 'openExternal';
  url: string;
}
```

- Added to `EntityEditorWebviewToExt` union in `src/views/EntityEditorMessages.ts`.
- Handled in `EntityEditorPanel.ts` `handleMessage` switch: calls `await vscode.env.openExternal(vscode.Uri.parse(message.url))`.
- No response message is sent back to the webview.

---

## CSP Change

File: `src/views/EntityEditorPanel.ts` line ~652

```
// Before:
img-src ${webview.cspSource} data:;

// After:
img-src ${webview.cspSource} data: https:;
```

This is the only CSP modification required.
