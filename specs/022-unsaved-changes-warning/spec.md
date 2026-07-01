# Feature Specification: Unsaved Entity Editor Changes Warning

**Feature Branch**: `022-unsaved-changes-warning`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "changes are made in Entity Editor, but not saved. Then select a different entity and come back, the changes are gone. The app should give warning to user if these changes will be lost if move away to another entity. Therefore, user can decide to save or discard the changes, or continue the editing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Warned Before Switching Entity (Priority: P1)

A user has edited an entity's annotations or axioms in the Entity Editor panel. Before their changes are written to the file, they click a different entity in the sidebar tree. Rather than silently discarding the edits, the application presents a dialog asking whether to save, discard, or continue editing.

**Why this priority**: This is the core protection against silent data loss, which is the bug being fixed. Without it the feature has no value.

**Independent Test**: Open an ontology, edit an entity annotation without saving, click a different entity in the sidebar — a confirmation dialog must appear with Save, Discard, and Cancel options before any navigation occurs.

**Acceptance Scenarios**:

1. **Given** a user has unsaved changes in the Entity Editor, **When** they select a different entity in any sidebar tree panel, **Then** a warning dialog appears before the entity focus changes.
2. **Given** the warning dialog is shown, **When** the user chooses **Save**, **Then** the current changes are persisted to file and the new entity is loaded.
3. **Given** the warning dialog is shown, **When** the user chooses **Discard**, **Then** the current changes are discarded and the new entity is loaded.
4. **Given** the warning dialog is shown, **When** the user chooses **Cancel** (or dismisses the dialog), **Then** the entity focus remains on the current entity and the edits are preserved.

---

### User Story 2 - Warning on Back/Forward Navigation (Priority: P2)

A user has unsaved changes and then uses the Back or Forward navigation history buttons to jump to a previously viewed entity.

**Why this priority**: Entity navigation history (feature 021) is another way to change the focused entity; the same guard must apply there.

**Independent Test**: Edit an entity, then press the Back toolbar button — the same Save/Discard/Cancel dialog must appear.

**Acceptance Scenarios**:

1. **Given** a user has unsaved changes, **When** they press the Back or Forward navigation button, **Then** the warning dialog appears before navigating away.
2. **Given** the dialog appears on Back/Forward, **When** the user saves, **Then** changes persist and navigation completes.
3. **Given** the dialog appears on Back/Forward, **When** the user cancels, **Then** the navigation is aborted and the user remains on the current entity.

---

### User Story 3 - No Warning When No Changes Exist (Priority: P1)

When the Entity Editor contains no unsaved changes, switching entities proceeds silently without any dialog.

**Why this priority**: A false-positive warning on every entity click would be highly disruptive and degrade usability.

**Independent Test**: Open an entity, make no edits (or save all edits), then click another entity — no dialog should appear.

**Acceptance Scenarios**:

1. **Given** the Entity Editor has no pending unsaved changes, **When** the user selects a different entity, **Then** the entity switches immediately with no dialog.
2. **Given** a user saves all changes via the Save button, **When** they then click a different entity, **Then** no warning appears.

---

### Edge Cases

- What happens when the user edits a field but reverts it to the original value? The system should treat the editor state as clean (no unsaved changes) and not show a warning.
- What happens if saving fails (e.g., file is read-only or locked)? The dialog should remain open and an error message should inform the user the save failed; the entity focus must not change.
- What happens when a new ontology is loaded while the editor has unsaved changes? An advisory notification is shown after the load discards the edits (FR-010); a full modal dialog is not used for this path.
- What happens if the Entity Editor is not open or no entity is focused? No warning is shown; navigation proceeds normally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect when the Entity Editor contains unsaved changes relative to the last saved or loaded state.
- **FR-002**: When the user attempts to navigate away from an entity with unsaved changes — via sidebar tree click or Back/Forward history buttons — the system MUST interrupt the navigation and display a Save/Discard/Cancel warning dialog.
- **FR-010**: When a new ontology is loaded (via reload command or file watcher) while the Entity Editor has unsaved changes, the system MUST display an advisory notification informing the user that their unsaved edits have been discarded. A full Save/Discard/Cancel dialog is not required for ontology reload because the reload replaces the entire model and is an explicit user action.
- **FR-003**: The warning dialog MUST offer three actions: **Save** (persist changes then navigate), **Discard** (abandon changes then navigate), and **Cancel** (abort navigation, return focus to current entity).
- **FR-004**: If the user chooses **Save** and the save operation fails, the system MUST display an error message and keep the user on the current entity without completing the navigation.
- **FR-005**: If the user chooses **Discard** or **Save** (successfully), the navigation MUST complete and the new entity MUST be loaded in the Entity Editor.
- **FR-006**: If the user chooses **Cancel** or dismisses the dialog, the entity focus MUST remain unchanged and all pending edits MUST be preserved in the editor.
- **FR-007**: When there are no unsaved changes, entity navigation MUST proceed without any dialog.
- **FR-008**: After a successful Save or Discard, the editor's dirty/unsaved state MUST be reset so subsequent navigation triggers no further warning until new edits are made.
- **FR-009**: The system MUST correctly identify that changes have been reverted to their original values and treat such a state as clean (no unsaved changes).

### Key Entities

- **Dirty State**: A boolean flag (or equivalent) tracked per open Entity Editor session indicating whether the current editor content differs from the last persisted state.
- **Pending Navigation Event**: The entity selection or navigation action that was intercepted while the editor was dirty; used to complete navigation after user confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero cases of silent data loss — every navigation away from a dirty Entity Editor presents the warning dialog 100% of the time.
- **SC-002**: Users can complete a Save-and-navigate flow in under 5 seconds with no additional steps beyond clicking Save in the dialog.
- **SC-003**: False-positive dialogs are eliminated — navigating away from a clean Entity Editor produces a warning 0% of the time.
- **SC-004**: After a user chooses Cancel, 100% of in-progress edits remain intact in the editor with no data loss.
- **SC-005**: Save failures are surfaced to the user — 100% of failed save attempts display an actionable error message and leave the user on the current entity.

## Assumptions

- The Entity Editor tracks changes locally within the VS Code webview; the "dirty" state can be determined by comparing current field values against the values last loaded or last saved.
- "Saving" means writing the edited annotation or axiom values back to the ontology source file using the existing sync mechanism (AnnotationSync / AxiomSync).
- Navigation events that must be guarded include: sidebar tree-item clicks (Classes, Properties, Individuals, Inferred Hierarchy panels), Back/Forward entity history buttons (feature 021), and ontology reload.
- Opening the Entity Editor for the first time (no previous entity) does not require a guard.
- The warning dialog uses the standard VS Code notification or modal dialog API, consistent with the existing VS Code UX patterns used elsewhere in the extension.
- Undo/redo history (feature 014) is independent of this feature; the dirty flag reflects the difference between the editor state and the persisted file, regardless of undo steps taken.
