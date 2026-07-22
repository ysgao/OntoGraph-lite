# Feature Specification: Delete Entity with Subtype Choice

**Feature Branch**: `029-delete-entity-subtypes`

**Created**: 2026-07-17

**Status**: Implemented (all tasks in `tasks.md` complete except T029, a manual F5 quickstart pass flagged for human follow-up)

**Implementation note (post-hoc)**: The delete action is reachable only from the tree views (Classes, Inferred Hierarchy, Object/Data/Annotation Properties, Individuals), not from the Entity Editor panel itself — FR-001 and the Assumptions section below mention the Entity Editor as a possible invocation surface, but that was not built; the Entity Editor's only involvement is being closed automatically if it was showing a deleted entity (FR-010). Functional syntax (`.ofn`) only in this release, matching `019-create-entity`'s scoping precedent — not called out explicitly elsewhere in this spec.

**Input**: User description: "Delete a selected entity as the default option (delete only the entity itself, re-parenting or otherwise handling its subtypes appropriately). The alternative option is to delete the selected entity AND all of its subtypes (cascade delete). The user must be able to choose between these two deletion modes when deleting an entity in OntoGraph (e.g. a class with subclasses, a property with sub-properties, etc.)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete a leaf entity (Priority: P1)

An ontology author selects a class, object property, or data property that has no subclasses/sub-properties and deletes it. Since there is nothing to reparent or cascade, the deletion is immediate after a single confirmation.

**Why this priority**: This is the simplest and most common deletion case (most entities in a typical hierarchy are leaves) and must work reliably before any of the more complex reparenting/cascade behavior is built.

**Independent Test**: Select a leaf class with no children in the Classes tree view, invoke "Delete Entity", confirm, and verify the entity and its declaration/axioms/annotations are removed from the source file and no longer appear in any tree view.

**Acceptance Scenarios**:

1. **Given** a class with no subclasses, **When** the user deletes it and confirms, **Then** the class and all axioms/annotations that reference only it are removed from the file, and it disappears from the Classes and Inferred Hierarchy views.
2. **Given** an individual (which has no subtype concept), **When** the user deletes it and confirms, **Then** it is removed directly with a single confirmation and no mode choice is presented.

---

### User Story 2 - Delete an entity only, reparenting its subtypes (Priority: P2)

An ontology author selects a class or property that has one or more direct subtypes (subclasses or sub-properties) and deletes it using the default mode. Rather than removing the whole subtree, each direct subtype is promoted to take the deleted entity's place in the hierarchy.

**Why this priority**: This is the default, less-destructive behavior explicitly requested for entities with children, and is the primary value of the feature: removing an unwanted entity without silently deleting everything beneath it.

**Independent Test**: Select a class with two direct subclasses and one grandchild, invoke "Delete Entity" using the default mode, confirm, and verify the two direct subclasses now list the deleted class's own superclass(es) as their superclass, the grandchild is unaffected, and the deleted class no longer appears anywhere.

**Acceptance Scenarios**:

1. **Given** a class `B` with superclass `A` and subclasses `C` and `D`, **When** the user deletes `B` in the default mode, **Then** `C` and `D` become direct subclasses of `A`, `B` is removed, and `C`/`D`'s own further subclasses (if any) are unaffected.
2. **Given** a class with multiple superclasses (multiple inheritance), **When** it is deleted in the default mode, **Then** each of its direct subclasses is reparented to *all* of the deleted class's former superclasses (deduplicated), not just one.
3. **Given** a root-level class with no superclass other than the ontology root, **When** it is deleted in the default mode, **Then** its direct subclasses become root-level classes.
4. **Given** an object property or data property with sub-properties, **When** the user deletes it in the default mode, **Then** its direct sub-properties are reparented to its former super-properties using the same rule as for classes.

---

### User Story 3 - Delete an entity and all of its subtypes (Priority: P3)

An ontology author selects a class or property that has subtypes and explicitly chooses the cascade-delete option, removing the entity and its entire subtype subtree in one operation.

**Why this priority**: This is an intentionally destructive alternative that some authors need (e.g. removing an entire obsolete branch of the hierarchy), but it is opt-in and lower priority than the safer default behavior.

**Independent Test**: Select a class with a subclass, which itself has its own subclass, invoke "Delete Entity", choose "delete with subtypes", confirm, and verify all three classes are removed from the file and from every tree view.

**Acceptance Scenarios**:

1. **Given** a class with a two-level chain of subclasses beneath it, **When** the user chooses "delete with subtypes" and confirms, **Then** the class and every transitive subclass are removed, along with axioms/annotations that reference only those entities.
2. **Given** a subtype in the deleted subtree that also has an additional superclass outside the deleted subtree (multiple inheritance), **When** cascade delete runs, **Then** that subtype is still removed as part of the cascade (its membership in the deleted subtree takes precedence), and the confirmation step surfaces this so the user is not surprised.

---

### Edge Cases

- Deleting a built-in/reserved entity (e.g. the ontology root such as `owl:Thing`) MUST be prevented; the delete action is not offered or is disabled for such entities.
- Deleting an entity that is still referenced elsewhere in the ontology (e.g. as an individual's asserted type, as the domain/range of a property, or inside another entity's complex class expression) proceeds, but the confirmation step warns the user that other references to the entity will become dangling, consistent with how a reasoner would flag it afterward.
- Deleting an entity while the Entity Editor panel for that entity (or for one of its affected subtypes) is open updates or closes the panel so it never displays a deleted entity.
- Attempting to delete an entity that no longer exists (e.g. removed by an external edit to the file moments earlier) fails gracefully with a clear error instead of corrupting the file.
- Choosing cascade delete on an entity with a very large subtree (e.g. hundreds of descendants) still requires the user to see an accurate affected-count before confirming, so they understand the scale of the operation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to invoke a delete action on a selected class, object property, data property, annotation property, or individual from the same tree views/entity editor surfaces already used to manage entities.
- **FR-002**: For entity types that support subtypes (classes: subclasses; object/data/annotation properties: sub-properties), when the entity has one or more direct subtypes, the System MUST present the user with an explicit choice between two deletion modes: "delete entity only" (default/pre-selected) and "delete entity and all subtypes."
- **FR-003**: For an entity with no subtypes, or for entity types with no subtype concept (individuals), the System MUST skip the mode choice and delete only that single entity.
- **FR-004**: In "delete entity only" mode, the System MUST reparent each of the deleted entity's direct subtypes to all of the deleted entity's own direct supertypes (deduplicated across multiple inheritance), or to the ontology root if the deleted entity had no other supertype.
- **FR-005**: In "delete entity only" mode, subtypes below the direct subtypes (i.e. grandchildren and beyond) MUST remain unaffected other than inheriting the new ancestry introduced by the reparenting of their direct parent.
- **FR-006**: In "delete entity and all subtypes" mode, the System MUST remove the selected entity together with its entire transitive closure of subtypes.
- **FR-007**: The System MUST require the user to explicitly confirm the delete operation before any change is made, and the confirmation MUST state the deletion mode and the number of entities that will be removed (1 for entity-only mode, or the full subtree count for cascade mode).
- **FR-008**: The System MUST remove all axioms and annotations that reference only the deleted entity/entities (declaration, sub/super relationships, disjointness, equivalence, annotation assertions), consistent with how the extension already writes changes back to the source file in place.
- **FR-009**: The System MUST prevent deletion of the ontology's built-in root entities (e.g. `owl:Thing`, `owl:Nothing`).
- **FR-010**: After a delete operation completes, the System MUST refresh all affected tree views (Classes, Properties, Individuals, Inferred Hierarchy) and close or refresh any open Entity Editor panel for an entity that was deleted.
- **FR-011**: If the deleted entity is still referenced elsewhere in the ontology outside the hierarchy relationship being handled (e.g. as a property's domain/range, an individual's type, or inside another entity's class expression), the System MUST surface a warning in the confirmation step rather than silently leaving dangling references unexplained.
- **FR-012**: If the delete operation cannot complete (e.g. the target entity was removed by a concurrent external edit), the System MUST leave the source file unmodified and show a clear error to the user.

### Key Entities *(include if feature involves data)*

- **Target Entity**: The class, object property, data property, or individual the user selected to delete.
- **Subtype**: A direct or transitive subclass (for classes) or sub-property (for object/data properties) of the target entity; individuals have no subtypes.
- **Deletion Mode**: One of two choices presented when the target entity has subtypes — "entity only" (default, reparents direct subtypes) or "entity and subtypes" (cascade, removes the whole subtree).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can delete a leaf entity (no subtypes) in a single action plus one confirmation step.
- **SC-002**: After deleting an entity with subtypes in the default mode, 100% of its direct subtypes are reparented to the correct former supertype(s), with zero entities left with no supertype unless the deleted entity itself had none.
- **SC-003**: After a cascade delete, 100% of the deleted entity's transitive subtype closure is absent from every tree view and from the source file.
- **SC-004**: Before any destructive change is applied, the user is shown an accurate affected-entity count and can cancel; this holds true 100% of the time across both modes.
- **SC-005**: Re-running `ontograph validate` (or equivalent structural check) on the file immediately after a delete operation reports no new structural errors introduced by the operation itself (pre-existing dangling references warned about in FR-011 are expected, not treated as errors).

## Assumptions

- This feature applies to classes, object properties, data properties, and annotation properties — the entity types that carry a sub/super hierarchy today. Individuals are deleted directly, without a mode choice, since they have no subtype concept in this codebase today.
- "Delete entity only" reparents *direct* subtypes to the deleted entity's *direct* supertypes; it does not attempt to rewrite deeper indirect ancestry, matching how single-level reparenting works in Protégé-style tools.
- Dangling references outside the direct hierarchy (e.g. an expression elsewhere that mentions the deleted entity's IRI) are warned about but not automatically rewritten or blocked — resolving them is left to the user, consistent with how a reasoner already surfaces such issues.
- The delete action is reachable from the same tree views (Classes, Properties, Individuals) that already expose other entity actions (e.g. copy IRI, open graph), plus the Entity Editor if it is the active edit surface.
- Deletion is a file-modifying, in-place sync operation like existing annotation/axiom writes, not a separate undo-tracked transaction; standard file undo (e.g. VS Code's own undo) is the recovery path if a user changes their mind immediately after saving.
