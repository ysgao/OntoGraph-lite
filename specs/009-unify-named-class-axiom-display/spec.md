# Feature Specification: Unify Named Class Axiom Display in Entity Editor

**Feature Branch**: `009-unify-named-class-axiom-display`  
**Created**: 2026-05-23  
**Status**: Draft  
**Input**: User description: "All equivalentTo for named classes should be displayed in the EquivalentTo (expressions) in the Entity Editor pane. Similarly, all subClassOf for named classes should be displayed in the SubClassOf (expression). These should only change the current display of subClassOf(A B), and equivalentClasses(A B). A, B are named classes. Hence, we do not need to display these axioms differently from the complex expressions. Then, subClassOf and equivalentTo can be removed from the Entity Editor UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Named Class Parents Shown in Expressions Section (Priority: P1)

An ontology editor opens a named class in the Entity Editor. The class has named-class parents (SubClassOf where the superclass is a named class, e.g. SubClassOf(Animal Thing)). These parents appear in the "SubClassOf (expressions)" section alongside any complex class expressions, rather than in a separate "SubClassOf" IRI list section. The separate "SubClassOf" named-class section is absent from the UI.

**Why this priority**: Core of the request. Eliminates the redundant named-class subsection and unifies the view users interact with most when navigating class hierarchies.

**Independent Test**: Open any class with at least one named superclass. Verify its parent appears in "SubClassOf (expressions)" and no separate "SubClassOf" section exists.

**Acceptance Scenarios**:

1. **Given** a class with SubClassOf(Animal Thing), **When** that class is opened in the Entity Editor, **Then** "Thing" (or its display label) appears as an entry in "SubClassOf (expressions)" and no separate "SubClassOf" section is shown.
2. **Given** a class with both SubClassOf(A B) (named) and SubClassOf(A someExpression) (complex), **When** that class is opened, **Then** both appear together in "SubClassOf (expressions)", with named-class entries listed before complex expression entries.
3. **Given** a class with no SubClassOf axioms at all, **When** that class is opened, **Then** no "SubClassOf (expressions)" section is shown (section absent when empty, consistent with current behavior).

---

### User Story 2 - Named Class Equivalents Shown in Expressions Section (Priority: P1)

An ontology editor opens a named class in the Entity Editor. The class has named-class equivalents (EquivalentClasses where both arguments are named classes, e.g. EquivalentClasses(A B)). These equivalents appear in the "EquivalentTo (expressions)" section alongside any complex class expressions, rather than in a separate "EquivalentTo" IRI list section. The separate "EquivalentTo" named-class section is absent from the UI.

**Why this priority**: Symmetric with Story 1. Same user value: unified, consistent display.

**Independent Test**: Open any class with at least one named-class equivalent. Verify it appears in "EquivalentTo (expressions)" and no separate "EquivalentTo" section exists.

**Acceptance Scenarios**:

1. **Given** a class with EquivalentClasses(A B) where both are named, **When** that class is opened in the Entity Editor, **Then** "B" (or its display label) appears as an entry in "EquivalentTo (expressions)" and no separate "EquivalentTo" section is shown.
2. **Given** a class with both EquivalentClasses(A B) (named) and EquivalentClasses(A someExpression) (complex), **When** that class is opened, **Then** both appear together in "EquivalentTo (expressions)", with named-class entries listed before complex expression entries.
3. **Given** a class with no EquivalentClasses axioms, **When** that class is opened, **Then** no "EquivalentTo (expressions)" section is shown.

---

### Edge Cases

- What happens when a class has only named-class parents and no complex expressions? The "SubClassOf (expressions)" section appears with only the named-class entries.
- What happens when a class has only complex expressions and no named-class parents? The "SubClassOf (expressions)" section appears with only the complex expression entries — no change from current behavior.
- What happens when a class has no SubClassOf or EquivalentClasses axioms of any kind? Neither section appears — no change from current behavior.
- How are named classes rendered in the expressions section? Using the same display form already used for named classes referenced inside complex expressions (display label or short IRI).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Entity Editor MUST display all SubClassOf(A B) axioms where B is a named class as entries within the existing "SubClassOf (expressions)" section, using the same display style as complex expressions.
- **FR-002**: The Entity Editor MUST display all EquivalentClasses(A B) axioms where both A and B are named classes as entries within the existing "EquivalentTo (expressions)" section, using the same display style as complex expressions.
- **FR-003**: The Entity Editor MUST NOT show a separate "SubClassOf" IRI list section for named classes; that section MUST be removed.
- **FR-004**: The Entity Editor MUST NOT show a separate "EquivalentTo" IRI list section for named classes; that section MUST be removed.
- **FR-005**: When both named-class entries and complex expression entries exist in the same section, named-class entries MUST appear before complex expression entries within that section.
- **FR-006**: Sections MUST remain absent (hidden) when they contain no entries, consistent with current behavior.
- **FR-007**: This change MUST be scoped to the display layer only — the underlying data model, sync, serialization, and extension-to-webview message protocol MUST remain unchanged.
- **FR-008**: All other Entity Editor sections (DisjointWith, properties, individuals) MUST be unaffected.

### Key Entities

- **Named class axiom**: SubClassOf(A B) or EquivalentClasses(A B) where both A and B are OWL named classes (identified by IRI, not anonymous or complex expressions).
- **SubClassOf (expressions) section**: The Entity Editor UI section that currently shows complex superclass expressions; after this change it also shows named-class superclasses.
- **EquivalentTo (expressions) section**: The Entity Editor UI section that currently shows complex equivalent-class expressions; after this change it also shows named-class equivalents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After opening any class with named-class parents, zero separate "SubClassOf" IRI-list sections appear in the Entity Editor panel.
- **SC-002**: After opening any class with named-class equivalents, zero separate "EquivalentTo" IRI-list sections appear in the Entity Editor panel.
- **SC-003**: All named-class SubClassOf and EquivalentClasses entries previously visible in the removed sections are now visible in the unified expression sections — no axiom data is lost from the display.
- **SC-004**: Classes with no SubClassOf or EquivalentClasses axioms show no regressions; their Entity Editor panels are visually identical to the current state.
- **SC-005**: All existing Entity Editor tests pass without modification to assertions about other sections.

## Assumptions

- The change is display-only: no modifications to the extension-to-webview message protocol, OntologyModel, or any sync/serialization code.
- Named-class IRIs sent via `superClassIris` and `equivalentClassIris` in the existing message are merged into the expressions arrays on the webview side before rendering, converting each IRI to its display form (label or abbreviated IRI) as already done for named classes appearing inside complex expressions.
- The ordering convention (named-class entries first, then complex expressions) matches user expectation for scanning simple parents before complex definitions.
- Properties and individuals sections that use their own IRI list sections for equivalent/sub-property display are out of scope and unaffected.
