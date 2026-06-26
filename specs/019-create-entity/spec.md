# Feature Specification: Create New Ontology Entity

**Feature Branch**: `019-create-entity`

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "new feature to create new entity in the opening ontology. The new entity should use the default namespace of the ontology or the namespace can be specified in the setting of the app. The UI for detail of the new entity should reuse the existing Entity Editor UI. The full IRI of the new entity should be available in the Entity Editor for editing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a New Entity in the Open Ontology (Priority: P1)

An ontology author is editing an ontology and needs to add a new entity. Each entity-type panel (Classes, Inferred Hierarchy, Object Properties, Data Properties, Annotation Properties, Individuals) has an "Add" button in its toolbar. Clicking the button creates an entity of the type corresponding to that panel, using the currently focused entity as the parent in the appropriate sub-entity axiom. The Entity Editor immediately opens showing the new entity.

**Why this priority**: This is the core workflow the feature is built around. Without it, no other stories have value.

**Independent Test**: Can be fully tested by creating a new class with a local name and verifying it appears in the ontology with the correct IRI and that the Entity Editor opens pre-populated.

**Acceptance Scenarios**:

1. **Given** an ontology is open, a default namespace is available, and no entity is selected in the Classes panel, **When** the user clicks the "Add Entity" button in the Classes toolbar and enters the local name "HeartDisease", **Then** a new OWL class is created with IRI `<namespace>HeartDisease`, it appears in the Classes panel with no parent, and the Entity Editor opens showing the new entity.
2. **Given** a class "BodyStructure" is selected in the Classes or Inferred Hierarchy panel, **When** the user clicks the "Add Entity" button and enters the local name "HeartDisease", **Then** a new OWL class is created with IRI `<namespace>HeartDisease` and a `SubClassOf(<namespace>HeartDisease, <BodyStructureIRI>)` axiom, and the Entity Editor opens pre-populated with BodyStructure as the parent.
3. **Given** an object property "hasPart" is selected in the Object Properties panel, **When** the user clicks the "Add Entity" button and enters the local name "hasDirectPart", **Then** a new object property is created with a `SubObjectPropertyOf(<namespace>hasDirectPart, <hasPartIRI>)` axiom, and the Entity Editor opens with hasPart as the parent.
4. **Given** a data property "score" is selected in the Data Properties panel, **When** the user clicks the "Add Entity" button and enters the local name "rawScore", **Then** a new data property is created with a `SubDataPropertyOf(<namespace>rawScore, <scoreIRI>)` axiom.
5. **Given** an annotation property "note" is selected in the Annotation Properties panel, **When** the user clicks the "Add Entity" button and enters the local name "editorialNote", **Then** a new annotation property is created with a `SubAnnotationPropertyOf(<namespace>editorialNote, <noteIRI>)` axiom.
6. **Given** the user is creating a new entity, **When** they submit an empty local name, **Then** an error message is shown and no entity is created.
7. **Given** the user is creating a new entity, **When** they enter a local name that duplicates an existing entity's IRI within the namespace, **Then** an error message is shown and no entity is created.
8. **Given** the user is creating a new entity, **When** they enter a local name containing characters not valid in an IRI, **Then** an error message is shown describing which characters are invalid.

---

### User Story 2 - Configure the Namespace for New Entities (Priority: P2)

An ontology author works with multiple ontologies that use different base namespaces. They want to set a preferred namespace in the application settings so all newly created entities automatically receive the correct IRI prefix without having to specify it each time.

**Why this priority**: Without namespace configuration, entities may be created with the wrong IRI prefix, requiring manual correction. Configuration makes the workflow reliable across different ontologies.

**Independent Test**: Can be fully tested by setting a custom namespace in settings, creating a new entity, and confirming the created IRI uses the custom namespace.

**Acceptance Scenarios**:

1. **Given** the user has set a custom namespace `https://example.org/myontology#` in settings, **When** they create a new entity with local name "BodyPart", **Then** the entity is created with IRI `https://example.org/myontology#BodyPart`.
2. **Given** no custom namespace is configured in settings, **When** the user creates a new entity, **Then** the namespace is derived from the ontology's declared namespace (ontology IRI prefix).
3. **Given** the ontology has no declared namespace and no custom namespace is set, **When** the user attempts to create an entity, **Then** the application prompts the user to provide a namespace before proceeding.

---

### User Story 3 - View and Edit the Full IRI in the Entity Editor (Priority: P3)

An ontology author opens the Entity Editor for any entity — newly created or existing — and can see the entity's complete IRI. If they need to correct or update the IRI (for example after a namespace migration), they can edit it directly in the Entity Editor and apply the change.

**Why this priority**: IRI visibility ensures authors can verify correct entity identity. IRI editing enables correction of IRI errors without workarounds.

**Independent Test**: Can be fully tested by opening the Entity Editor for any existing entity, confirming the full IRI is displayed, editing it, saving, and verifying the change is reflected in the ontology.

**Acceptance Scenarios**:

1. **Given** a new entity has been created, **When** the Entity Editor opens for that entity, **Then** the entity's full IRI is prominently displayed in the editor.
2. **Given** the Entity Editor is open for any entity, **When** the user edits the IRI field and confirms the change, **Then** the entity's IRI is updated throughout the ontology, and all axioms referencing the old IRI are updated to use the new IRI.
3. **Given** the user attempts to set an IRI that already exists in the ontology, **When** they confirm the change, **Then** an error is shown and the IRI is not changed.
4. **Given** the user enters a syntactically invalid IRI, **When** they attempt to confirm the change, **Then** an error message is shown and the change is rejected.

---

### Edge Cases

- What happens when the ontology has no declared namespace and no namespace is configured in settings? → The system prompts the user to provide a namespace before entity creation proceeds.
- How does the system handle local names with spaces or special characters? → The system shows a validation error indicating which characters are not permitted.
- What happens if the user renames an IRI to one that is referenced by axioms in other loaded ontologies (imports)? → The rename applies only to the current ontology. Detection of cross-import IRI references is out of scope for this release; the user is responsible for updating imported ontologies separately.
- What happens when the user closes the Entity Editor without editing the new entity? → The entity remains in the ontology with its generated IRI and default empty label; no rollback occurs.
- What happens when the user clicks "Add Entity" with no entity selected in the panel? → The new entity is created with no parent axiom; it appears at the root level of the corresponding panel.
- What happens when the user clicks "Add Entity" in the Individuals panel with no individual selected? → A new individual is created with no type assertion and no parent axiom; the user can add type assertions in the Entity Editor.
- What happens when the open ontology is in Manchester Syntax, Turtle, or OWL/XML format? → Entity creation is supported only for OWL Functional Syntax in this release. For other formats, a user-visible warning is shown and no entity is created. Support for additional formats is planned for a future release.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide an "Add Entity" button in the toolbar of every entity-type panel: Classes, Inferred Hierarchy, Object Properties, Data Properties, Annotation Properties, and Individuals.
- **FR-002**: The entity type created by each panel's button is fixed by the panel: Classes and Inferred Hierarchy → OWL Class; Object Properties → Object Property; Data Properties → Data Property; Annotation Properties → Annotation Property; Individuals → Named Individual. No type selection dialog is shown.
- **FR-003**: The "Add Entity" dialog MUST accept a user-provided local name for the new entity.
- **FR-004**: The system MUST construct the full IRI for the new entity by combining the active namespace with the user-supplied local name.
- **FR-005**: The system MUST validate the local name and reject names that produce syntactically invalid IRIs, with a clear error message.
- **FR-006**: The system MUST prevent creation of an entity whose resulting IRI already exists in the ontology, with a clear error message.
- **FR-007**: Upon successful creation, the system MUST open the Entity Editor pre-populated with the new entity.
- **FR-008**: When an entity is selected in the panel at the time the "Add Entity" button is triggered, the system MUST add a parent axiom to the new entity based on the focused entity's type:
  - Focused entity is a Class → `SubClassOf(newEntity, focusedClass)`
  - Focused entity is an Object Property → `SubObjectPropertyOf(newProperty, focusedProperty)`
  - Focused entity is a Data Property → `SubDataPropertyOf(newProperty, focusedProperty)`
  - Focused entity is an Annotation Property → `SubAnnotationPropertyOf(newProperty, focusedProperty)`
  - Focused entity is an Individual → no parent axiom (OWL has no sub-individual relationship; type assertions are added manually in the Entity Editor)
- **FR-009**: When no entity is selected in the panel at the time the action is triggered, the new entity is created without any parent axiom.
- **FR-010**: The application settings MUST include a configurable "Default Namespace for New Entities" field.
- **FR-011**: When a custom namespace is configured in settings, the system MUST use that namespace when constructing IRIs for new entities.
- **FR-012**: When no custom namespace is configured, the system MUST fall back to the ontology's declared namespace.
- **FR-013**: When neither a custom namespace nor an ontology-declared namespace is available, the system MUST prompt the user to provide a namespace before proceeding.
- **FR-014**: The Entity Editor MUST display the full IRI of the currently shown entity in a visible field.
- **FR-015**: The Entity Editor MUST allow the user to edit the full IRI of any entity.
- **FR-016**: When an IRI is changed, the system MUST update all axioms within the current ontology that reference the old IRI to use the new IRI. Updates to entities in imported ontologies are out of scope.
- **FR-017**: The system MUST validate any edited IRI and reject syntactically invalid values with a clear error message.
- **FR-018**: The system MUST prevent changing an entity's IRI to one that already exists in the ontology.

### Key Entities

- **Ontology Entity**: A named element in the ontology (Class, Object Property, Data Property, Annotation Property, or Individual), identified uniquely by its IRI.
- **IRI (Internationalized Resource Identifier)**: The globally unique identifier for an entity, composed of a namespace prefix and a local name.
- **Namespace**: The base URI prefix used when constructing IRIs for new entities; sourced from the app settings or the ontology's declared namespace.
- **Local Name**: The user-provided suffix appended to the namespace to form the full IRI of a new entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a new entity and have its Entity Editor open within 3 seconds of confirming the local name.
- **SC-002**: 100% of entities created through the "Create New Entity" workflow receive syntactically valid IRIs.
- **SC-003**: Users can configure the default namespace in settings in under 1 minute without consulting documentation.
- **SC-004**: When an IRI edit is confirmed, all references within the ontology are updated in under 5 seconds for ontologies with up to 50,000 axioms.
- **SC-005**: The full IRI is visible in the Entity Editor on first open without any additional user interaction (no scrolling or expanding required).
- **SC-006**: Zero data-loss incidents: closing the Entity Editor after creating an entity leaves the entity intact in the ontology.

## Assumptions

- All five OWL entity types (Class, Object Property, Data Property, Annotation Property, Individual) are in scope for creation; no type is excluded.
- The "default namespace" of an ontology is the ontology IRI (or its declared prefix mapping) as declared in the ontology file header.
- The Entity Editor referred to in the description is the existing entity editing panel already present in the application; this feature extends it rather than replacing it.
- A newly created entity starts with no label, no definition, and no axioms; the Entity Editor is the mechanism for adding those details.
- IRI renaming applies only within the currently open ontology; changes to entities in imported ontologies are out of scope.
- The local name entered by the user is appended directly to the namespace string to form the IRI; no additional separator is inserted (the namespace is expected to end with `#` or `/` as appropriate).
- Mobile or tablet usage is out of scope; the feature targets desktop use of the editor.
