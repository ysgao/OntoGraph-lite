# Feature Specification: Multiline Text Areas for Long-Form Annotation Properties

**Feature Branch**: `003-multiline-annotation-fields`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "The annotations for annotation properties skos:definition and rdfs:comment require more space for text entries. Change the field to area of multiple lines in the UI of entity editor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a Long Definition Without Scrolling (Priority: P1)

An ontology editor opens a class in the entity editor panel and finds the `skos:definition` annotation. They type or paste a multi-sentence definition. With a multi-line text area, the full text is visible at once without horizontal scrolling or truncation.

**Why this priority**: Definitions are the most common long-form annotation. The single-line field forces users to scroll horizontally to read or edit, which is the core pain point. Fixing this delivers immediate, standalone value.

**Independent Test**: Open the entity editor for any class that has a `skos:definition` annotation. The field renders as a tall text area showing the full content. Editing works correctly and changes are saved.

**Acceptance Scenarios**:

1. **Given** a class with a `skos:definition` value containing more than one sentence, **When** the user opens the entity editor, **Then** the `skos:definition` field is displayed as a multi-line text area that shows the full text without horizontal scrolling.
2. **Given** a `skos:definition` text area is visible, **When** the user types a multi-line definition (including line breaks), **Then** the text area expands or scrolls vertically and the value is saved correctly including any newlines.
3. **Given** a class has no `skos:definition` annotation yet, **When** the user adds one via the "+ Add annotation" flow, **Then** the new value field is also rendered as a multi-line text area.

---

### User Story 2 - Edit rdfs:comment With Sufficient Vertical Space (Priority: P2)

An ontology editor working with an OWL file opens a class that carries an `rdfs:comment` annotation containing a paragraph-length description. The field renders as a multi-line text area, giving the editor room to read and modify the text comfortably.

**Why this priority**: `rdfs:comment` is the standard OWL annotation for human-readable descriptions and is often lengthy. It is lower priority than `skos:definition` only because many ontologies use `skos:definition` for primary definitions; both are equally common in practice.

**Independent Test**: Open the entity editor for any class that has an `rdfs:comment` annotation. The field renders as a multi-line text area. Changes are saved correctly.

**Acceptance Scenarios**:

1. **Given** a class with an `rdfs:comment` value longer than 60 characters, **When** the user opens the entity editor, **Then** the `rdfs:comment` field is displayed as a multi-line text area.
2. **Given** a multi-line `rdfs:comment` text area, **When** the user edits and saves, **Then** the saved value matches what was shown in the text area, preserving whitespace.

---

### Edge Cases

- What happens when the annotation value is empty? The text area should display empty and accept input normally.
- What happens when the annotation value contains embedded newlines already stored in the ontology file? The text area should display them as natural line breaks.
- What happens when the user pastes a very long value (thousands of characters)? The text area should scroll vertically and not overflow the panel layout.
- How does the field behave when the entity editor panel is narrow? The text area should resize to fit the available width, consistent with other fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The entity editor MUST render the value field for `skos:definition` annotations as a multi-line text area instead of a single-line text input.
- **FR-002**: The entity editor MUST render the value field for `rdfs:comment` annotations as a multi-line text area instead of a single-line text input.
- **FR-003**: Multi-line text areas MUST have a minimum visible height sufficient to display at least 3 lines of text without scrolling.
- **FR-004**: Multi-line text areas MUST allow the user to type and paste text including newline characters, which are preserved when the annotation is saved.
- **FR-005**: The change detection mechanism MUST treat edits in multi-line text areas the same as edits in single-line inputs — the Save button MUST become active when content changes.
- **FR-006**: All other annotation properties (e.g., `rdfs:label`, `skos:prefLabel`, `skos:altLabel`) MUST continue to use single-line text inputs unchanged.
- **FR-007**: When a new `skos:definition` or `rdfs:comment` annotation is added via the "+ Add annotation" flow, the value entry field in that row MUST also be a multi-line text area.

### Key Entities

- **Annotation entry**: A property IRI + value + optional language tag triple displayed as a row in the Annotations table of the entity editor.
- **Value field widget**: The editable control within an annotation row that captures the annotation's string value — either a single-line input or a multi-line text area depending on the property.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view a 3-sentence `skos:definition` or `rdfs:comment` value in full without any horizontal scrolling.
- **SC-002**: Editing and saving a multi-line annotation value (including newlines) round-trips correctly — the value read back from the ontology file matches what was typed.
- **SC-003**: All existing annotation properties that were single-line before this change remain single-line after this change (zero regressions to other annotation fields).
- **SC-004**: The time to open the entity editor panel for a class with multiple annotations is not visibly increased (no perceptible delay introduced by the change).

## Assumptions

- Only `skos:definition` (IRI: `http://www.w3.org/2004/02/skos/core#definition`) and `rdfs:comment` (IRI: `http://www.w3.org/2000/01/rdf-schema#comment`) are changed to multi-line; all other properties keep single-line inputs.
- The multi-line text area does not need auto-resize-to-content behaviour; a fixed minimum height with vertical scrolling for overflow is sufficient.
- Language tag input (e.g., `en`) for `rdfs:comment` remains a separate small single-line field alongside the text area, consistent with current layout.
- No changes are required to the serializer or sync layer — both already handle annotation values as plain strings and will preserve newlines correctly if present.
- Mobile or touch-specific behaviour is out of scope; the entity editor targets VS Code desktop.
