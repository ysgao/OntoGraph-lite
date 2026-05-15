# Quickstart: Clickable URL Links in Annotations

**Branch**: `004-annotation-url-links`  
**Date**: 2026-05-15

---

## Manual Verification Scenarios

### Scenario 1: Plain URL annotation value renders as a link

1. Open `test-ontologies/animals.omn` in VS Code.
2. Open the Entity Editor for any class (e.g., `Animal`).
3. In the Annotations panel, click **+ Add annotation**.
4. Select `rdfs:seeAlso` as the property.
5. Enter `http://example.org/animal` as the value and save.
6. **Expected**: The annotation row shows `http://example.org/animal` as an underlined/highlighted link, not plain text.
7. Click the link. **Expected**: `http://example.org/animal` opens in the default browser.

---

### Scenario 2: URL embedded in prose

1. Add an `rdfs:comment` annotation with value `"See http://www.w3.org/TR/owl2-primer/ for details."`.
2. **Expected**: Only the URL portion is a link; `"See "` and `" for details."` are plain text.

---

### Scenario 3: Non-URL value is unaffected

1. Add an `rdfs:label` annotation with value `"Domestic Animal"`.
2. **Expected**: Value renders as plain text with no link styling. Clicking it enters edit mode.

---

### Scenario 4: Click-to-edit and return to link

1. In the annotation panel for a class with a `rdfs:seeAlso` URL value, click the display area (not the link itself).
2. **Expected**: The row enters edit mode, showing the raw URL in the editable field.
3. Change the URL to `http://example.org/updated` and click **Save**.
4. **Expected**: The row returns to display mode, now showing `http://example.org/updated` as a link.

---

### Scenario 5: Image URL shows inline preview

1. Add an annotation (e.g., using a custom property or `rdfs:seeAlso`) with value `https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg`.
2. **Expected**: The annotation row shows the URL as a clickable link AND renders the image inline below it (constrained to a reasonable max-width).
3. Click the image. **Expected**: The image URL opens in the default browser.

---

### Scenario 6: Unreachable image URL shows fallback

1. Add an annotation with value `https://example.invalid/nonexistent.png`.
2. **Expected**: The row shows the URL link. No broken-image icon is visible — a graceful fallback (e.g., hidden `<img>` via `onerror` handler or styled placeholder) is shown instead.

---

### Scenario 7: Multiple URLs in one value

1. Add an `rdfs:comment` with value `"Primary: http://example.org/a — Secondary: http://example.org/b"`.
2. **Expected**: Both `http://example.org/a` and `http://example.org/b` are independently clickable links.

---

## Unit Test Coverage Targets

| Module                        | Test file                                | Coverage |
|-------------------------------|------------------------------------------|---------|
| `annotationValueDisplay.ts`   | `annotationValueDisplay.test.ts`         | ≥ 80%   |
| `EntityEditorPanel.ts`        | Covered by existing integration pattern  | ≥ 80%   |
| `EntityEditorMessages.ts`     | Type-only change; no tests needed        | N/A     |
