# Feature Specification: Fix Entity Editor Stale Display After Save

**Feature Branch**: `016-fix-editor-stale-display`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Fix bug for changes are not displayed when they are saved. The data are correctly saved and synchronised to ontology file. The only issue is the changes in the Entity Editor is not displaying the changes. It displays the axioms before the changes when save button was clicked."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entity Editor reflects saved changes immediately (Priority: P1)

An ontologist edits an entity in the Entity Editor — adding, removing, or modifying axioms or annotations — then clicks Save. The editor immediately shows the updated state, not the pre-save state.

**Why this priority**: This is a correctness bug visible on every save. The ontology file is correct but the editor is misleading — users see stale data and cannot trust what is displayed, potentially triggering redundant edits.

**Independent Test**: Open any entity in the Entity Editor, modify an axiom, click Save, and verify the editor displays the newly saved values without requiring a manual refresh or re-opening the panel.

**Acceptance Scenarios**:

1. **Given** an entity is open in the editor with axiom A, **When** the user changes axiom A to axiom B and clicks Save, **Then** the editor immediately displays axiom B.
2. **Given** the user adds a new annotation and clicks Save, **Then** the new annotation appears in the editor display without requiring a panel reload.
3. **Given** the user removes an axiom and clicks Save, **Then** the removed axiom no longer appears in the editor display.
4. **Given** the save completes successfully, **When** the user inspects the editor, **Then** the displayed state matches exactly what was written to the ontology file.

---

### User Story 2 - No regression on undo/redo after save (Priority: P2)

After the fix, undo and redo continue to work correctly. Undoing a save restores the previous display state; redoing re-applies it.

**Why this priority**: The undo/redo system tracks save checkpoints. The display refresh fix must not disturb the checkpoint history or cause undo to display incorrect states.

**Independent Test**: Save a change, undo it, verify the editor shows the pre-save state; redo it, verify the editor shows the post-save state.

**Acceptance Scenarios**:

1. **Given** a change was saved and displayed correctly, **When** the user triggers undo, **Then** the editor displays the state prior to the save.
2. **Given** an undo was performed, **When** the user triggers redo, **Then** the editor re-displays the saved state.

---

### Edge Cases

- What if the save fails (file write error)? The display must NOT update to the intended new state — it must retain the pre-save display to stay consistent with the actual file state.
- What if the user edits again before the display refresh completes? The in-progress edit must not be overwritten by the refresh.
- What if the entity being edited is navigated away from during save? On return, the editor must show the saved (correct) state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a successful save, the Entity Editor MUST display the state that was just written to the ontology file.
- **FR-002**: The display refresh MUST occur automatically on save completion — no manual action by the user required.
- **FR-003**: The pre-save display state MUST NOT persist in the editor after a successful save.
- **FR-004**: If a save fails, the editor MUST retain the pre-save display state (not show the unsaved intended changes as if saved).
- **FR-005**: The display refresh MUST NOT reset any in-progress edits the user has started after clicking Save.
- **FR-006**: Undo and redo MUST continue to function correctly after the fix — save checkpoints and display states must remain consistent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of save operations result in the editor displaying the post-save state within 500ms of save completion.
- **SC-002**: Zero instances of the editor showing pre-save axioms after a completed save, across all entity types (class, property, individual).
- **SC-003**: All existing undo/redo tests pass without modification after the fix is applied.
- **SC-004**: Save-then-display round-trip is verified for all axiom types: SubClassOf, EquivalentClasses, GCI, annotations, object/data property axioms.

## Assumptions

- The bug affects all entity types (class, object property, data property, annotation property, individual) — not limited to one type.
- The ontology file is being written correctly; the bug is purely in the display layer not reloading after save.
- The fix does not require changes to the file synchronisation or serialisation logic.
- The undo/redo checkpoint history is captured correctly at save time; only the display refresh after save is broken.
