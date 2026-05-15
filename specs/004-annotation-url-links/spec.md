# Feature Specification: Clickable URL Links in Annotations

**Feature Branch**: `004-annotation-url-links`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "the URLs in all annotations should be displayed as clickable links."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — URL Values Open in Browser (Priority: P1)

When a user views an entity's annotation panel and an annotation value is (or contains) a URL, the URL appears as a clickable hyperlink. Clicking it opens the URL in the default browser.

**Why this priority**: This is the core ask. Ontology annotations routinely contain reference IRIs and web links (e.g., `rdfs:seeAlso`, `skos:exactMatch`, definition sources). Today the user must copy-paste. A single click saves time and reduces errors for every reviewer or editor working with cross-referenced resources.

**Independent Test**: Open any entity that has an annotation whose value starts with `http://` or `https://`. The value renders as an underlined/highlighted link. Clicking it opens the target URL in the browser.

**Acceptance Scenarios**:

1. **Given** an annotation value is exactly a URL (e.g., `http://example.org/concept`), **When** the annotation panel is displayed, **Then** the value is rendered as a clickable link, not plain text.
2. **Given** an annotation value contains a URL embedded in prose (e.g., `"See http://example.org for details"`), **When** the annotation panel is displayed, **Then** the URL portion is a clickable link while surrounding text is plain.
3. **Given** a user clicks a link in the annotation panel, **When** the click is registered, **Then** the URL opens in the default browser without navigating away from the editor.
4. **Given** an annotation value contains no URL, **When** the annotation panel is displayed, **Then** the value renders as plain text (no false positives).

---

### User Story 2 — Links in Read-Only and Edit Mode (Priority: P2)

URLs remain clickable in display mode. When the user activates the edit field for a URL-valued annotation, the raw URL text is shown so it can be modified. The link is restored when editing ends.

**Why this priority**: Users need to both navigate to and edit annotation values. The edit experience must not break the click-to-open convenience once editing is done.

**Independent Test**: Click an annotation row to edit a URL value. The field shows raw text. Cancel or save. The value reverts to a link. Clicking it opens the browser.

**Acceptance Scenarios**:

1. **Given** an annotation value is a URL displayed as a link, **When** the user activates the edit field for that row, **Then** the field shows the raw URL text for editing.
2. **Given** the user finishes editing and the row returns to display mode, **When** the value still contains a URL, **Then** the URL is again displayed as a clickable link.
3. **Given** the user edits a URL value and saves, **When** the new value is a different valid URL, **Then** the saved value reflects the edited URL and the link points to the new address.

---

### User Story 3 — In-Editor Image Preview for Image URLs (Priority: P3)

When an annotation value is a URL that points to an image file (PNG, JPG/JPEG, GIF, SVG, or WebP), the image is rendered inline within the annotation panel below the URL link, so the user can see the referenced image without leaving the editor.

**Why this priority**: Some ontologies store references to diagrams, icons, or photographs in annotation values (e.g., a `schema:image` or custom illustration property). Being able to preview those images in-place removes the need to open a separate browser tab just to inspect a referenced graphic.

**Independent Test**: Open an entity whose annotation value is a URL ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, or `.webp`. The annotation row shows both the clickable URL link and a rendered image below it.

**Acceptance Scenarios**:

1. **Given** an annotation value is a URL ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, or `.webp`, **When** the annotation panel is displayed, **Then** the image is rendered inline below the URL link at a constrained maximum size.
2. **Given** the image URL is unreachable or the resource cannot be loaded, **When** the annotation panel is displayed, **Then** a placeholder or error indicator is shown instead of a broken image, and the URL link remains functional.
3. **Given** an annotation value is a non-image URL (e.g., pointing to an HTML page), **When** the annotation panel is displayed, **Then** only the clickable link is shown — no image preview is attempted.
4. **Given** a user clicks the image preview, **When** the click is registered, **Then** the image URL opens in the default browser (same behaviour as clicking the link).

---

### Edge Cases

- What if the URL is very long? The link should truncate visually but the full URL must still open when clicked.
- What if the annotation value contains multiple URLs? Each URL found in the value is independently clickable.
- What if the value is a bare IRI with a non-HTTP scheme (e.g., `urn:isbn:...`)? Only `http://` and `https://` URLs are treated as clickable; other URI schemes are shown as plain text.
- What if the URL contains special characters or the surrounding text includes angle brackets? The correct URL boundary must be detected and the URL opened without corruption.
- What if the annotation value is a multi-line textarea value containing URLs? Each URL anywhere in the value is a link in display mode.
- What if no annotation values contain URLs? The annotation panel appears identical to today — no visual change.
- What if the image URL is very large? The preview must be constrained to a reasonable maximum width/height so it does not dominate the annotation panel layout.
- What if the same annotation value contains both an image URL and non-image text? The image preview is shown for the image URL portion; any other content is handled by the standard link-detection rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The annotation panel MUST detect any annotation value that is, or contains, one or more URLs beginning with `http://` or `https://`.
- **FR-002**: Detected URLs MUST be rendered as interactive links that open in the default browser when clicked.
- **FR-003**: Non-URL annotation values MUST continue to display as plain text with no change in appearance or behaviour.
- **FR-004**: When an annotation row enters edit mode, the field MUST display the raw text (URL or otherwise) so the user can modify it freely.
- **FR-005**: When an annotation row exits edit mode, the display MUST revert to link-rendered form if the value contains URLs.
- **FR-006**: URL detection MUST apply to all annotation properties without exception (built-in properties such as `rdfs:label`, `rdfs:comment`, `skos:definition`, `rdfs:seeAlso`, and any custom annotation properties added to the ontology).
- **FR-007**: Links MUST be visually distinguishable from plain text in a way that is legible against both VS Code light and dark themes.
- **FR-008**: The feature MUST NOT affect how annotation values are stored in or written back to OWL source files — the underlying string value is unchanged.
- **FR-009**: When a URL ends with a recognised image extension (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, case-insensitive), the annotation panel MUST render the image inline below the URL link at a constrained maximum size.
- **FR-010**: If the image resource cannot be loaded (network error, 4xx/5xx response, or timeout), the panel MUST show a non-broken fallback indicator; the URL link MUST remain functional.
- **FR-011**: Clicking the inline image preview MUST open the image URL in the default browser, consistent with FR-002.

### Key Entities

- **Annotation value**: A string stored in the in-memory model that may be plain text, a bare URL, or mixed prose containing one or more URLs.
- **Annotation row**: The display unit in the entity editor that shows one annotation property–value pair in either display or edit mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of annotation values that are bare `http://`/`https://` URLs render as clickable links in the annotation panel.
- **SC-002**: 100% of annotation values with no URL render unchanged (zero false positives).
- **SC-003**: Clicking a link opens the target URL within 1 second with no visible error in the editor.
- **SC-004**: Entering and leaving edit mode for a URL-valued annotation preserves the exact URL string (no corruption on round-trip through the edit field).
- **SC-005**: The feature works consistently across all entity types (classes, object properties, data properties, individuals, annotation properties).
- **SC-006**: 100% of annotation values whose URLs end in a recognised image extension render an inline image preview.
- **SC-007**: An unreachable image URL never produces a broken-image icon — a graceful fallback is always shown.

## Assumptions

- Links open in the default system browser; no in-editor preview or hover tooltip is required for v1.
- Only `http://` and `https://` schemes are treated as clickable; other URI schemes (`ftp://`, `urn:`, etc.) are out of scope.
- The annotation panel is the only surface requiring link rendering; the graph visualisation and SPARQL result views are out of scope.
- The existing display/edit mode toggle for annotation rows is preserved — no redesign of row layout is needed.
- URL boundary detection uses a standard regex pattern; no external URL-validation service is required.
- The feature does not alter how annotation values are serialised to OWL source files.
- Recognised image extensions for inline preview are: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` (case-insensitive). Other image formats are out of scope for v1.
- Image preview is display-only; editing the annotation value still shows the raw URL text in the edit field.
