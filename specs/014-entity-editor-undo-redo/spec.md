# Feature Specification: Entity Editor Undo/Redo

**Feature Branch**: `014-entity-editor-undo-redo`  
**Created**: 2026-06-02  
**Status**: Draft  
**Input**: User description: "new feature for undo and redo in entity editor. The changes made in the entity editor can be undo or redo for each saving were made."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Undo Last Save (Priority: P1)

A user edits entity properties (labels, annotations, axioms) in the entity editor and saves. They then realize the changes were a mistake and want to revert to the previous saved state.

**Why this priority**: Core undo capability — without it the feature delivers no value. Single save-point reversal is the minimum viable unit.

**Independent Test**: Open an entity in the entity editor, make changes, save, then click Undo. The entity editor should display the field values from before the save.

**Acceptance Scenarios**:

1. **Given** an entity is open in the editor and has been saved at least once, **When** the user clicks Undo, **Then** all field values revert to the state they were in immediately before that save.
2. **Given** the entity is at its initial (pre-edit) state with no prior saves in history, **When** the user clicks Undo, **Then** the Undo action is disabled and no change occurs.
3. **Given** the user has undone to a prior state, **When** the user saves again, **Then** the redo history is cleared and the new save becomes the latest checkpoint.

---

### User Story 2 - Redo After Undo (Priority: P2)

A user undoes a save and then decides the original change was correct after all. They use Redo to move forward through saved checkpoints.

**Why this priority**: Without redo, users who accidentally undo lose work. Undo without redo is incomplete.

**Independent Test**: Save twice, undo twice, then redo. Verify the entity editor reflects the re-applied saved states in order.

**Acceptance Scenarios**:

1. **Given** the user has undone one or more saves, **When** the user clicks Redo, **Then** the entity editor restores the field values from the next checkpoint forward.
2. **Given** the user is at the most recent saved state, **When** the user clicks Redo, **Then** the Redo action is disabled and no change occurs.
3. **Given** the user undoes and then makes a new edit and saves, **When** the user inspects the redo history, **Then** redo is no longer available (new branch replaces forward history).

---

### User Story 3 - Multi-Step Undo/Redo Traversal (Priority: P3)

A user makes and saves many incremental edits to an entity over a working session and wants to step backward or forward through the full checkpoint history.

**Why this priority**: Delivers full value for iterative editing workflows, but single-step undo (P1/P2) already provides a safety net.

**Independent Test**: Save five distinct states for one entity, then undo three times and redo twice — confirm each step shows the expected historical values.

**Acceptance Scenarios**:

1. **Given** N saves have been made in a session, **When** the user repeatedly clicks Undo, **Then** the editor steps backward through all N checkpoints down to the initial state.
2. **Given** the user has undone to the initial state, **When** the user repeatedly clicks Redo, **Then** the editor steps forward through all N checkpoints to the most recent save.
3. **Given** the user switches to a different entity in the editor, **When** the user returns to the original entity, **Then** its undo/redo history is still intact and functional.

---

### Edge Cases

- What happens when the user tries to undo with no prior saves in the session (fresh entity, never saved)?
- How does undo/redo behave if the underlying ontology file is externally modified while history exists?
- What happens when the user closes and reopens the entity editor — is history preserved or cleared?
- How many undo steps are retained before the oldest checkpoint is discarded?
- Does undo/redo operate independently per entity, or is there a single shared history across all entities open in the same session?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The entity editor MUST maintain a per-entity save-checkpoint history for the duration of the editing session.
- **FR-002**: Each time the user saves changes in the entity editor, the system MUST record a checkpoint capturing all editable field values at that moment.
- **FR-003**: The entity editor MUST provide an Undo action that reverts the editor's displayed values to the most recent prior checkpoint.
- **FR-004**: The entity editor MUST provide a Redo action that re-applies the next checkpoint when the user is at a non-latest history position.
- **FR-005**: The Undo action MUST be disabled (visually and functionally) when there is no prior checkpoint to revert to.
- **FR-006**: The Redo action MUST be disabled (visually and functionally) when the user is already at the most recent checkpoint.
- **FR-007**: When the user saves after performing one or more undo operations, the system MUST discard all forward (redo) checkpoints and record the new state as the latest checkpoint.
- **FR-008**: Undo/redo history MUST be scoped per entity and MUST NOT interfere with the history of other entities open in the same session.
- **FR-009**: The system MUST retain at least 50 save checkpoints per entity before discarding the oldest.
- **FR-010**: Undo/redo history MUST NOT persist across VS Code window restarts or extension deactivation (session-scoped only).
- **FR-011**: Performing an undo or redo MUST NOT automatically save to disk — it only updates the editor's displayed values; the user must explicitly save to persist.

### Key Entities

- **SaveCheckpoint**: A snapshot of all editable field values for a single entity at the moment of a save action. Contains entity IRI, timestamp, and field values.
- **EntityEditHistory**: An ordered stack of SaveCheckpoints for one entity, with a pointer to the current position. Supports push (new save), undo (move pointer back), and redo (move pointer forward).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can undo and redo any saved change within a session in under 1 second per step.
- **SC-002**: Undo/redo traversal through 50 consecutive checkpoints completes without visible lag or data loss.
- **SC-003**: Undo and Redo controls are visible and clearly labeled in the entity editor UI, requiring no documentation to discover.
- **SC-004**: 100% of field values modified before a save are restored when that save is undone.
- **SC-005**: Redo history is fully cleared after a new save following an undo, with no stale forward states reachable.

## Assumptions

- Undo/redo history is session-scoped and does not persist after the editor is closed or VS Code is restarted.
- "Save" means the user's explicit save action within the entity editor, not auto-save triggered by file watching or external tools.
- All editable fields in the entity editor (annotations, labels, axioms) are included in each checkpoint.
- History is per-entity (scoped by entity IRI), not shared globally across all entities.
- The default maximum history depth is 50 checkpoints per entity; older checkpoints are dropped when this limit is exceeded.
- Performing undo/redo updates only the in-memory editor state and visual display; it does not write to disk until the user explicitly saves.
- The ontology's on-disk state is not affected by undo/redo — only the editor view is affected until a save is performed.
