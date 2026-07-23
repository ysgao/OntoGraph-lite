# Feature Specification: Sync Axiom Display After Entity Label Rename

**Feature Branch**: `030-sync-labels-in-axioms`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Update the relevant axioms involve labels that have been changed. The update of label of an entity should not have impact on the axioms. Because axioms in the Editor Panel use labels in axioms, the changes to entity labels should automatically reflected these changes in the axioms. Otherwise, the axioms cannot be converted to the same URI of the entities in the axioms."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Renamed entity's label stays correct everywhere it's referenced (Priority: P1)

An ontology author renames the label of an entity (e.g. renames "Animal" to "Creature"). Other entities have axioms that reference "Animal" by name (e.g. `SubClassOf: Animal and hasPart some Wing`). When the author opens those other entities in the Entity Editor Panel — whether immediately after the rename or much later in the session — the axiom text shows the current label ("Creature"), and if the author saves those axioms, the underlying entity reference is preserved correctly. No axiom is ever silently lost, blanked, or repointed to a different entity as a side effect of a label rename that happened elsewhere.

**Why this priority**: This is the core data-integrity guarantee the request is about. Without it, a label rename can silently corrupt unrelated axioms the next time an author happens to save them, which is worse than a visible bug because the author has no reason to suspect anything is wrong.

**Independent Test**: Rename entity A's label, save. Open entity B (which references A in an axiom), confirm the axiom shows A's new label. Make an unrelated edit to B's own axioms and save. Reload the ontology and confirm B's axiom referencing A still points to A's IRI (not lost, not blank, not pointing to some other entity).

**Acceptance Scenarios**:

1. **Given** entity B has an axiom referencing entity A by A's label, **When** the author renames A's label and saves that rename, **Then** opening B's editor panel afterward shows A's new label in B's axiom text.
2. **Given** B's editor panel was already viewed (and its axiom display cached) before A's label was renamed, **When** the author navigates back to B's panel after the rename, **Then** B's axiom text reflects A's current label, not the label that was current when B was first viewed.
3. **Given** B's axiom text now correctly displays A's current label, **When** the author saves B (for the same axiom or an unrelated edit to B), **Then** the axiom referencing A is written back referencing A's same underlying entity — it is not dropped, left blank, or silently attached to a different entity.

---

### User Story 2 - Author is not required to manually refresh panels to keep axioms consistent (Priority: P2)

An ontology author is working across several entities in a session — viewing, editing, and navigating back and forth (including via undo/redo or navigation history) — while also renaming labels along the way. The author should never need to manually close and reopen the ontology file, or manually refresh a panel, to ensure that what they see and subsequently save is consistent with the latest labels.

**Why this priority**: This is the workflow-level promise behind "should automatically reflect these changes" — the sync must happen without extra manual steps, but it is secondary to the P1 correctness guarantee itself.

**Independent Test**: Perform a sequence of renames and navigations (view B, rename A, navigate away, navigate back to B via history/undo-redo) without ever closing the file or manually forcing a refresh, and confirm B's displayed axioms always match the current labels at the moment they are viewed.

**Acceptance Scenarios**:

1. **Given** the author has navigated to several entities earlier in the session (building up navigation/undo history), **When** the author renames a label that one of those earlier-viewed entities' axioms reference, **Then** revisiting that entity through navigation history shows the updated label without any manual refresh action.

---

### User Story 3 - Renaming to a label already used by another entity is prevented (Priority: P3)

An ontology author attempts to rename entity A's label to a value that another entity, C, already uses as its label. Because axiom text elsewhere refers to entities by label, allowing two entities to share a label would make it impossible to tell — both for the system resolving axioms and for a human reading them — which entity is meant. The rename is rejected with a clear explanation, and A keeps its previous label.

**Why this priority**: This is a safety-net edge case of the same underlying rule — it prevents the ambiguity from ever being created, but duplicate-label attempts are expected to be uncommon relative to the everyday rename case in User Story 1.

**Independent Test**: Attempt to rename A's label to match C's existing label; confirm the rename is rejected, A's label is unchanged, and the author sees a clear error identifying the conflicting entity.

**Acceptance Scenarios**:

1. **Given** entity C already has a given label, **When** the author attempts to rename entity A to that same label, **Then** the rename is rejected, A's label remains unchanged, and the author is shown an error identifying that the label is already in use by C.

---

### Edge Cases

- What happens when an entity's label is renamed to exactly match another existing entity's label? The rename is rejected before it takes effect (see User Story 3) — duplicate labels are never created, so no axiom ever needs to disambiguate between two entities sharing a label.
- What happens when an entity referenced in an axiom is deleted (not just relabeled) after the axiom's display was cached? The axiom display and save behavior should not crash or corrupt other, unrelated entities' data (existing delete-entity behavior from `029-delete-entity-subtypes` already reparents/cascades affected axioms; this feature must not regress that, and the reverse-reference scan this feature introduces must tolerate a referenced entity no longer existing in the model without erroring).
- What happens when the same rename is repeated multiple times in a session (A → B → C)? Every previously-cached view of an entity referencing A must eventually reflect "C", not an intermediate stale value ("A" or "B").
- What happens when a rename is undone (label reverted) after other entities' axiom displays have already picked up the new label? The reverted label must propagate the same way a forward rename does — an undo/redo of a label change goes through the same persistence path as a forward save, so it MUST trigger the same reverse-reference invalidation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST ensure that after an entity's label is renamed and saved, every other entity's axiom that references the renamed entity continues to resolve to the same underlying entity as before the rename, regardless of when those other entities' editor panels were last viewed or cached.
- **FR-002**: The system MUST display the current, up-to-date label for every entity referenced within axiom text shown in the Entity Editor Panel — for all entities, not only the entity whose label was just changed.
- **FR-003**: The system MUST invalidate or refresh any previously cached representation of an entity's axiom text (including undo/redo history) whenever a different entity's label changes, so that the next time that entity is viewed or saved, its axiom text reflects the current label rather than a stale one captured before the rename.
- **FR-004**: The system MUST NOT lose, blank out, or silently reattach an axiom to a different entity when an editor panel containing a stale label reference is saved after another entity's label was renamed elsewhere.
- **FR-005**: The system MUST NOT require the author to manually reload the ontology file or manually force a refresh in order for previously viewed entities to show current labels in their axiom text.
- **FR-006**: The system MUST block a label rename outright, with a clear error message, if the new label already belongs to a different existing entity in the ontology — preventing duplicate labels from ever being created, so that axiom text referencing an entity by label always remains unambiguous. The check MUST apply to every label string submitted in the rename, across all languages present in the edit, not just a single primary value.
- **FR-007**: This behavior applies to every file format the Entity Editor Panel already supports for label/annotation edits — OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), and Turtle (`.ttl`) — since the mechanisms involved (the entity label index and the per-entity display cache) are format-agnostic and label/annotation sync (`AnnotationSync.ts`) already supports all three. This is narrower than, and should not be confused with, the `.ofn`-only scoping of `019-create-entity`/`029-delete-entity-subtypes`, which applies specifically to entity *creation/deletion* axiom-syntax writing, not to label edits.

### Key Entities

- **Entity**: An OWL class, object property, data property, annotation property, or individual, identified by a stable IRI and a human-readable label (rdfs:label) that can be renamed independently of the IRI.
- **Axiom Expression**: A textual representation of an axiom (e.g. SubClassOf, EquivalentClasses, GCI) shown in the Entity Editor Panel, in which referenced entities are displayed by their current label rather than their IRI.
- **Cached Axiom Display / Edit History**: A per-entity snapshot of previously rendered axiom text (used for undo/redo and fast navigation) that must stay consistent with entities' current labels even when those labels changed after the snapshot was taken.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After renaming any entity's label and saving, 100% of axioms in other entities that reference the renamed entity continue to point to the correct original entity when those entities are reopened, reloaded, or re-saved — verified across representative test ontologies.
- **SC-002**: Authors see the updated label in axiom text for every affected entity the next time that entity is viewed, with zero manual reload or refresh actions required.
- **SC-003**: Zero instances of an axiom being silently dropped, blanked, or misattributed to a different entity due to a label rename, across regression testing that includes repeated renames and undo/redo of renames.
- **SC-004**: 100% of rename attempts that would produce a duplicate label are rejected before taking effect, with a clear message identifying the conflicting entity, so no axiom ever needs to disambiguate between two entities sharing a label.

## Assumptions

- This feature builds on the existing behavior where axiom expressions are stored internally by IRI and only *displayed* using labels (per `AxiomDisplay.ts`) — the fix is about keeping that display (and anything derived from it, such as cached history used on save) synchronized with current labels, not about changing how axioms are stored on disk.
- Scope covers every format the Entity Editor Panel already supports for label/annotation edits — `.ofn`, `.omn`, and `.ttl` — since this fix touches only the in-memory label index and display cache (both format-agnostic), not the axiom-syntax writers that `019-create-entity`/`029-delete-entity-subtypes` restricted to `.ofn`.
- "Automatically reflected" means an author never has to take a manual action (reload file, force refresh) to see correct, current labels — but it is acceptable for the refresh to happen at the next time an entity is viewed/loaded rather than instantaneously pushing updates into a panel the author is not currently looking at, since only one entity is shown in the editor panel at a time.
- No retroactive repair tool is in scope for axioms that may have already been corrupted by this bug prior to the fix shipping; the fix prevents the problem going forward.
- Renaming an entity's label is already a supported operation (via the existing label-editing flow); this feature does not change how a rename itself is performed, only how its effects propagate to other entities' axiom displays and saves.

## Clarifications

### Session 2026-07-23

- Q: When a rename causes two entities to share the same label, how should the system respond? → A: Block the rename outright with a clear error, matching the existing ambiguous-match precedent used elsewhere in the codebase (CLI search/entity-info). A entity keeps its previous label; no duplicate labels are ever created.
