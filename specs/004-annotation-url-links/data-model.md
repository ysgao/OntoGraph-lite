# Data Model: Clickable URL Links in Annotations

**Branch**: `004-annotation-url-links`  
**Date**: 2026-05-15

---

## Entities

### AnnotationValueSegment

A typed segment produced by splitting an annotation value string into alternating text and URL parts.

| Field   | Type                          | Description                                         |
|---------|-------------------------------|-----------------------------------------------------|
| type    | `'text' \| 'url' \| 'imageUrl'` | `'text'` = plain text; `'url'` = http/https link; `'imageUrl'` = link that also triggers inline preview |
| content | `string`                      | The raw substring for this segment (URL or text)    |

**Validation rules**:
- `content` is never empty for a `'url'` or `'imageUrl'` segment.
- A `'url'` segment never starts with whitespace.
- An `'imageUrl'` segment satisfies the image extension regex AND the HTTP/HTTPS URL regex.

**State transitions**: None — this is a pure value type derived at render time from an annotation string.

---

### AnnotationRowDisplayState (per-row UI state, not persisted)

| Field     | Type      | Description                                          |
|-----------|-----------|------------------------------------------------------|
| isEditing | `boolean` | `true` = edit widget visible; `false` = display div visible |

**Initial value**: `false` (display mode).  
**Transition**: `false → true` on click of the display div (non-link area); `true → false` on blur of the edit widget.

---

## Relationships

- `EntityEditorApp` holds `annotationState[]` (existing). Each entry maps 1-to-1 to a rendered annotation row.
- Each annotation row holds one `AnnotationRowDisplayState` (local DOM state, not in `annotationState`).
- `annotationValueDisplay.ts` is a pure function module: it takes an annotation value string and returns an array of `AnnotationValueSegment` objects, and a factory function that takes those segments plus an `onOpen` callback to return an `HTMLElement`.

---

## Message Types (extension ↔ webview)

### OpenExternalMessage (new)

Direction: webview → extension host

| Field | Type     | Description                                |
|-------|----------|--------------------------------------------|
| type  | `'openExternal'` | Discriminant                      |
| url   | `string` | The fully-qualified `http://`/`https://` URL to open |

**Handled by**: `EntityEditorPanel.ts` message handler — calls `vscode.env.openExternal(vscode.Uri.parse(message.url))`.
