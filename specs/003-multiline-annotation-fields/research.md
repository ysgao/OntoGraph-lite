# Research: Multiline Annotation Fields

**Feature**: 003-multiline-annotation-fields  
**Date**: 2026-05-15

## Decision 1: Which properties get multi-line fields?

**Decision**: Only `skos:definition` (`http://www.w3.org/2004/02/skos/core#definition`) and `rdfs:comment` (`http://www.w3.org/2000/01/rdf-schema#comment`).

**Rationale**: Both are specified in the feature request. Both are established long-form annotation properties: `skos:definition` is intended for one-sentence-or-more formal definitions, and `rdfs:comment` is the standard OWL prose description field.

**Alternatives considered**: Extending to all SKOS properties or all non-label annotations — rejected as scope creep beyond the user request. Other properties (`rdfs:label`, `skos:prefLabel`, `skos:altLabel`) are intentionally short labels that fit on a single line.

---

## Decision 2: Testing approach for webview DOM code

**Decision**: Add `jsdom` as a dev dependency and configure a Vitest test file with `@vitest-environment jsdom` annotation. Extract a `createValueWidget(propIri, value, onchange)` helper function from `renderAnnotationsSection` and test it in isolation.

**Rationale**: Vitest 1.6 supports inline environment switching via the `@vitest-environment` doc-comment. jsdom provides a standard W3C DOM implementation suitable for testing element creation and event wiring. The constitution requires >80% coverage on new code; the conditional logic (which property gets a textarea) must be covered by an automated test.

**Alternatives considered**:
- Manual-only testing — rejected: violates constitution Principle I (Test-First) and coverage gate.
- Playwright/e2e webview test — rejected: disproportionately complex for a single DOM conditional; no existing e2e infrastructure in the project.
- `@vitest/browser` — rejected: requires additional browser runner setup (Playwright/WebdriverIO) and is heavier than jsdom for pure DOM unit tests.

---

## Decision 3: Newline round-trip in existing layers

**Decision**: No changes needed to the serializer, parser, or sync layers.

**Rationale**: All three layers already handle `\n` correctly:
- `FunctionalParser.ts:53` — unescapes `\n` → newline when reading
- `FunctionalSerializer.ts:22` — escapes newline → `\n` when writing
- `AnnotationSync.ts:19-20` — escapes newline → `\n` when writing in-place

A confirming test for newline round-trip will be added to `FunctionalSerializer.test.ts` to make the invariant explicit.

**Alternatives considered**: Treating newlines in textarea values as spaces — rejected: would lose information entered by the user.

---

## Decision 4: Textarea sizing

**Decision**: Fixed minimum height (approx. 3 rows, implemented via CSS `min-height`) with vertical scrolling on overflow. No auto-resize-to-content.

**Rationale**: Auto-resize requires a JavaScript resize observer or scroll-height measurement on every keystroke, adding complexity (Principle II). A fixed 3-row minimum satisfies the spec's SC-001 (view a 3-sentence value without horizontal scrolling) while keeping the implementation trivial.

**Alternatives considered**: Auto-resize textarea — rejected per YAGNI; the spec does not require it and a fixed minimum height meets all stated success criteria.

---

## Decision 5: CSS class strategy

**Decision**: Reuse `.annotation-value-input` class on the textarea (for shared background/border/padding/width styles) and add a single additional rule targeting `textarea.annotation-value-input` for `min-height` and `resize: vertical`.

**Rationale**: The existing class already sets `background`, `color`, `border`, `padding`, `border-radius`, `font-family`, `font-size`, and `width: 100%` — all of which should apply to the textarea as well. A targeted rule for the textarea-specific properties avoids duplication.

**Alternatives considered**: A separate CSS class for textarea — rejected: would duplicate all shared property values, violating DRY without benefit.

---

## Decision 6: "+ Add annotation" inline row

**Decision**: When the user selects `skos:definition` or `rdfs:comment` as the property for a new annotation, the value input in the inline row is replaced with a textarea (same `MULTILINE_IRIS` constant drives the decision).

**Rationale**: FR-007 explicitly requires this. Reusing the same constant ensures the set of multiline properties is defined in one place.

**Alternatives considered**: Always use a single-line input in the add-row — rejected: violates FR-007 and would create an inconsistent experience where the field shown after saving differs from the field shown when adding.
