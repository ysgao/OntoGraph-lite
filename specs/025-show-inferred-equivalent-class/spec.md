# Feature Specification: Show Inferred Equivalent Class in Entity Editor

**Feature Branch**: `025-show-inferred-equivalent-class`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "the inferred equivalent class should be displayed in the entity editor below GCI (General Concept Inclusions) and above DisjointWith. The inferred equivalent class is an error, it should be displayed in red to highlight the issue. The inferred equivalent classes are normally named classes, but it could be complex expression or equivalent to multiple named classes. Hence, it can be displayed similar to the equivalentto axioms. If there is no inferred equivalent class, the entity editor should not display this at all to save the space for display."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spot an unintended equivalence after classification (Priority: P1)

An ontology editor runs reasoner classification on their ontology. Due to an unintentional combination of axioms, the reasoner determines that one of their named classes is logically equivalent to another named class (or to a complex expression), even though the editor never intended to declare that equivalence. When the editor opens that class in the Entity Editor, they immediately see a clearly-flagged "Inferred Equivalent Class" entry so they know their axioms need to be reviewed and fixed.

**Why this priority**: This is the entire purpose of the feature — surfacing a modeling error that is otherwise invisible unless the editor manually inspects the inferred class hierarchy or reasoner output.

**Independent Test**: Load an ontology with two classes that become equivalent only after classification (not asserted as equivalent in the source file), run "Classify Ontology," open either class in the Entity Editor, and confirm the inferred equivalence is shown in red between the GCI and DisjointWith sections.

**Acceptance Scenarios**:

1. **Given** a classified ontology where class `A` is inferred equivalent to named class `B` (not asserted), **When** the editor opens class `A` in the Entity Editor, **Then** an "Inferred Equivalent Class" section appears below GCI and above DisjointWith, showing `B` rendered in red.
2. **Given** the same ontology, **When** the editor opens class `B`, **Then** the same section appears showing `A` in red (the relationship is symmetric).
3. **Given** a classified ontology where class `A` is inferred equivalent to a complex expression (e.g., an intersection of several classes) rather than a single named class, **When** the editor opens class `A`, **Then** the full complex expression is shown in the section, in red.
4. **Given** a classified ontology where class `A` is inferred equivalent to more than one other named class, **When** the editor opens class `A`, **Then** all inferred equivalent classes are listed in the section, each in red.

---

### User Story 2 - No visual clutter when there is nothing wrong (Priority: P2)

An ontology editor opens a class that has no inferred equivalence problems. The Entity Editor does not show an empty or placeholder "Inferred Equivalent Class" section, so the editor's attention is not drawn to a non-issue and screen space is preserved for the axioms that do apply.

**Why this priority**: Directly requested by the user ("save the space for display") and necessary so the red-flagged section reads as meaningful only when present — otherwise editors would need to check an always-visible section for emptiness, defeating its purpose as an attention-grabbing error indicator.

**Independent Test**: Open any class that has not been found to have an unintended inferred equivalence, and confirm no "Inferred Equivalent Class" heading or empty section is rendered anywhere in the Entity Editor.

**Acceptance Scenarios**:

1. **Given** a classified ontology where class `C` has no inferred equivalence beyond what is already explicitly asserted, **When** the editor opens class `C` in the Entity Editor, **Then** no "Inferred Equivalent Class" section is rendered (not even as an empty/collapsed heading).
2. **Given** an ontology that has not yet been classified, **When** the editor opens any class in the Entity Editor, **Then** no "Inferred Equivalent Class" section is rendered.

---

### User Story 3 - Consistent, familiar reading experience (Priority: P3)

An ontology editor who is already familiar with reading the EquivalentTo axioms section (which supports named classes, complex expressions, and clickable entity references) encounters the new Inferred Equivalent Class section and can read and navigate it the same way, without learning a new interaction pattern — the only difference being the red color that marks it as a problem rather than an intentional axiom.

**Why this priority**: Reduces learning cost and implementation risk by reusing an established, already-trusted display pattern; lower priority than the core detection/visibility behavior because it is about presentation consistency rather than new capability.

**Independent Test**: Compare the rendering of a multi-class EquivalentTo axiom against a multi-class Inferred Equivalent Class entry side by side; confirm equivalent structure (list of expressions, clickable class references) and that the only material difference is the red styling and section position.

**Acceptance Scenarios**:

1. **Given** an inferred equivalent class that references a named class elsewhere in the ontology, **When** the editor views the Inferred Equivalent Class section, **Then** the referenced class name is presented as a navigable/clickable reference, consistent with how EquivalentTo axioms present class references.

---

### Edge Cases

- What happens when a class is inferred equivalent to `owl:Thing` (i.e., the class became unconstrained/tautological)? It is treated like any other inferred equivalence and displayed in the section.
- What happens when the ontology has never been classified? The section is not shown for any class, since there is no reasoner output to display.
- What happens when the ontology is edited after the last classification run, making the previously-computed inferred equivalence stale? The section follows the same staleness handling already used for the existing Inferred Hierarchy view, so the editor is not shown outdated inferred-equivalence information as if it were current.
- What happens for entities that are not OWL classes (object properties, data properties, individuals)? This feature does not apply; the section never appears for non-class entities.
- What happens when an inferred equivalence exactly matches an equivalence the editor already explicitly asserted (already visible in the EquivalentTo section)? It is not repeated in the Inferred Equivalent Class section, since it is intentional and not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Entity Editor MUST display an "Inferred Equivalent Class" section for OWL class entities, positioned immediately below the GCI (General Concept Inclusions) section and immediately above the DisjointWith section.
- **FR-002**: The Entity Editor MUST populate the Inferred Equivalent Class section only with class equivalences that the reasoner has derived for the current entity as part of the most recent classification run.
- **FR-003**: The Entity Editor MUST exclude from this section any equivalence that is already explicitly asserted for the entity (i.e., already shown in the EquivalentTo axioms section), so the section only surfaces unintended/unasserted equivalences.
- **FR-004**: The Inferred Equivalent Class section MUST support the same range of content as the EquivalentTo axioms section: a single named class, a complex class expression, or multiple named classes.
- **FR-005**: The Inferred Equivalent Class section MUST render using the same visual/interactive layout as the EquivalentTo axioms section (including navigable references to named classes), so it is immediately familiar to editors.
- **FR-006**: All text within the Inferred Equivalent Class section MUST be visually distinguished using a red/error color, distinct from the styling used for asserted axiom sections, to signal that its contents represent a problem to resolve rather than an intended design choice.
- **FR-007**: When an entity has no qualifying inferred equivalent class (per FR-002/FR-003), the Entity Editor MUST NOT render the Inferred Equivalent Class section (no heading, no empty placeholder).
- **FR-008**: The Entity Editor MUST NOT render the Inferred Equivalent Class section for any entity when the ontology has not yet been classified, or when the most recent classification results are stale (i.e., the ontology has changed since classification last ran), consistent with existing staleness handling used elsewhere in the extension for inferred data.
- **FR-009**: The Inferred Equivalent Class section MUST NOT be editable — its contents are derived reasoning output, not axioms the editor authors or syncs back to the source file.

### Key Entities

- **Inferred Equivalent Class Entry**: A class expression (named class, or complex expression built from multiple classes) that the reasoner has determined is logically equivalent to a given OWL class as a result of classification, and which is not already explicitly asserted as an EquivalentTo axiom for that class. Associated with exactly one class entity per Entity Editor view; an entity may have zero, one, or several such entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After running classification on an ontology containing an unintended equivalence, an editor can identify which class(es) are affected by opening the class in the Entity Editor alone — without consulting logs, the inferred hierarchy tree, or any tool outside the Entity Editor.
- **SC-002**: For every class with no unasserted inferred equivalence, the Entity Editor renders zero additional lines of UI for this feature (section fully absent), preserving existing vertical space usage.
- **SC-003**: An editor scanning the Entity Editor can distinguish the Inferred Equivalent Class section from all other (non-error) axiom sections by color alone, without reading any label text.
- **SC-004**: Ontologies with inferred equivalences spanning complex expressions or multiple named classes display with no loss of information compared to inspecting the equivalence directly in the reasoner/raw ontology output — every named class involved remains identifiable and navigable.

## Assumptions

- "Inferred equivalent class" refers specifically to equivalences discovered by the reasoner that go beyond what the editor explicitly asserted — i.e., unintended equivalences. Equivalences the editor deliberately declared continue to be shown only in the existing EquivalentTo axioms section and are not duplicated here.
- The feature depends on reasoner classification having already run (via the existing "Classify Ontology" command) for the currently loaded ontology; this feature does not introduce a new way to trigger classification.
- The existing mechanism used to detect a stale classification state (used by the current Inferred Hierarchy sidebar view) is reused as-is to decide when to suppress this section; no new staleness-detection logic is introduced.
- This feature applies only to OWL class entities; object properties, data properties, individuals, and annotation properties are out of scope, matching the fact that class-equivalence inference is a class-only concept in OWL.
- A class inferred equivalent to `owl:Thing` is treated as a normal (if unusual) case of this feature and is displayed like any other inferred equivalence, since it still represents an unintended/unasserted equivalence worth flagging.
