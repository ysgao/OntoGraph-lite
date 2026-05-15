# Research: Clickable URL Links in Annotations

**Branch**: `004-annotation-url-links`  
**Date**: 2026-05-15

---

## Decision 1: How to open external URLs from a VS Code webview

**Decision**: Post a `{ type: 'openExternal', url }` message from the webview to the extension host, which then calls `vscode.env.openExternal(vscode.Uri.parse(url))`.

**Rationale**: VS Code webviews run in a sandboxed iframe. `window.open()` is blocked; `<a target="_blank">` does not open the system browser. The only reliable pattern is the postMessage bridge already in use for navigation and save operations. The extension host has full access to `vscode.env.openExternal`, which opens the default browser.

**Alternatives considered**:
- `<a href="..." target="_blank">` — blocked by VS Code webview sandbox; does not work.
- `window.open(url)` — also blocked inside the webview.
- `href="vscode-webview-resource://..."` — only for local extension assets, not external URLs.

---

## Decision 2: CSP change required for inline image previews

**Decision**: Extend the `img-src` directive in `src/views/EntityEditorPanel.ts` (line ~652) from `${webview.cspSource} data:` to `${webview.cspSource} data: https:`.

**Rationale**: The current CSP only permits images from the extension's local `dist/` folder and data URIs. Rendering external image URLs (e.g., `https://example.org/image.png`) requires allowing `https:` in `img-src`. No other CSP directive needs changing; scripts, styles, and connections are unaffected.

**Alternatives considered**:
- Proxying images through the extension host — unnecessary complexity for a display-only preview; YAGNI.
- Using data URIs by fetching image bytes in the extension host — adds network I/O to the extension host and complicates the message bridge; rejected per Principle II.
- Not showing image previews at all — contradicts the feature requirement (US3).

---

## Decision 3: URL detection regex

**Decision**: Use the regex `/https?:\/\/[^\s"<>[\]()]+/g` to find URLs in annotation values. Strip trailing punctuation (`.`, `,`, `;`, `!`, `?`, `)`) from matched URLs.

**Rationale**: This is the standard minimal approach used by Markdown renderers and chat applications. It terminates at whitespace and common URL-boundary characters, handles the vast majority of real ontology annotation URLs, and has no false positives on typical OWL annotation content. It avoids a full RFC-3986 parser (unnecessary complexity per Principle II).

**Alternatives considered**:
- Full RFC-3986 URI parsing — over-engineered for annotation text; significantly more complex with negligible practical benefit.
- `URL` constructor validation — useful for validating a whole string as a URL but not for finding URLs embedded in prose.
- Third-party URL-parsing library — no new runtime dependencies allowed without explicit approval (Constitution §Technical Stack).

---

## Decision 4: Image URL detection

**Decision**: A URL is treated as an image URL if its path (lowercased, before any query string or fragment) ends with one of: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`. Detection is done with `/\.(?:png|jpe?g|gif|svg|webp)(?:[?#]|$)/i` applied to the URL string.

**Rationale**: Extension-based detection is simple, covers all formats listed in the spec (FR-009), and requires no network round-trip. The alternative — issuing a HEAD request and checking `Content-Type` — would require async code in a rendering function and add latency; rejected per Principle II.

**Alternatives considered**:
- HEAD request + `Content-Type` check — async, adds latency, requires network access from the webview; rejected.
- Only `.png` and `.jpg` — too narrow; spec explicitly lists six formats.

---

## Decision 5: Display/Edit mode toggle per annotation row

**Decision**: Each annotation row displays a linkified `<div>` (display mode) initially. Clicking the `<div>` (not a link or image) hides the display element and shows the existing editable widget (edit mode). The widget's `blur` event returns the row to display mode, refreshing the linkified content from the current state value.

**Rationale**: The current UI renders all annotation values as always-editable inputs/textareas. The spec (FR-002, FR-004, FR-005) requires that URLs are rendered as real clickable links — impossible inside an `<input>` or `<textarea>`. Introducing display/edit mode per row is the minimal change that satisfies all requirements. Both elements are kept in the DOM simultaneously and toggled via `style.display`, avoiding complex re-render logic.

**Alternatives considered**:
- Always-edit + link button alongside the input — does not satisfy FR-002 ("URLs rendered as interactive links"); the link would be a separate affordance, not the value itself.
- Rebuild the entire annotation table on mode switch — more expensive; keeping both elements toggled is simpler.
- Click-to-edit only for URL-valued rows — inconsistent UX; simpler to always use display/edit mode for all rows.

---

## Decision 6: New module for URL display logic

**Decision**: Extract URL detection and display element creation to a new file `webview-src/entity-editor/annotationValueDisplay.ts`, with unit tests in `annotationValueDisplay.test.ts` (jsdom environment, same pattern as `createValueWidget.test.ts`).

**Rationale**: Keeps the logic testable in isolation (Constitution Principle I). Avoids making `EntityEditorApp.ts` (already large) even harder to navigate. Follows the precedent set by `createValueWidget.ts`.

**Alternatives considered**:
- Inline the logic in `EntityEditorApp.ts` — harder to unit-test; not consistent with the createValueWidget precedent.
