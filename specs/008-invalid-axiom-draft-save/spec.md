# Feature Specification: Allow Saving Invalid Axiom Expressions as Drafts

**Feature Branch**: `008-invalid-axiom-draft-save`  
**Created**: 2026-05-16  
**Status**: Draft  
**Input**: User description: "Invalid axiom expressions can be saved, but they should not be synchronised to the OWL document. There should be an error message displayed on save to reminder user to check and updated. This will enable a temporary save of such as incomplete axiom that can be updated later. However, this temporary saved axiom would be lost if the classifcation is performed because it will reload from OWL doc and refresh the model."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save Incomplete Axiom Without Breaking Document (Priority: P1)

An ontology editor is in the middle of drafting a complex class axiom expression (e.g., a long Manchester syntax SubClassOf restriction) and needs to step away or switch context. They want to save their in-progress work without corrupting the OWL document or losing what they have typed so far.

**Why this priority**: This is the core behaviour the feature is built around. Without it, users must either complete an axiom in one sitting or discard their work-in-progress — both are unacceptable for complex authoring sessions.

**Independent Test**: Can be fully tested by typing a syntactically invalid axiom expression in the entity editor, triggering save, verifying the error message is shown, and confirming the OWL document on disk remains unchanged.

**Acceptance Scenarios**:

1. **Given** a user has an axiom editor open with a syntactically invalid expression, **When** the user saves, **Then** the expression is retained in the editor UI, the axiom input is outlined in red, and an error notification is displayed indicating the axiom is invalid and has not been written to the document.
2. **Given** an invalid axiom was draft-saved in the editor, **When** the user opens the OWL document file, **Then** the invalid expression does not appear in the file — the file contains only the previously valid content.
3. **Given** the editor displays a draft-saved invalid axiom, **When** the user corrects the expression and saves again, **Then** the corrected axiom is synchronised to the OWL document and the error message clears.

---

### User Story 2 - Visual Error Highlight on Invalid Draft Axiom (Priority: P2)

An ontology editor saves an axiom expression that contains a parse error. They need an immediate visual signal — a red border around the invalid axiom input — so they can see at a glance which axiom requires attention without reading through all axioms on the entity.

**Why this priority**: A colour highlight draws attention instantly and persists as long as the draft is unresolved, serving as a continuous reminder that the axiom is not in the ontology.

**Independent Test**: Can be fully tested by inspecting the visual state of the axiom editor after saving an invalid axiom — the input field for the invalid axiom must be outlined in red, and the outline must clear when the axiom is corrected and saved successfully.

**Acceptance Scenarios**:

1. **Given** a user saves an invalid axiom expression, **When** the save completes, **Then** the axiom input field is outlined with a red border to indicate the invalid draft state.
2. **Given** a red-outlined invalid draft axiom, **When** the user corrects the expression and saves successfully, **Then** the red border is removed from that axiom input.
3. **Given** multiple axioms on an entity and only one is invalid, **When** the user saves, **Then** only the invalid axiom input shows the red border; other axiom inputs are unaffected.

---

### User Story 3 - Clear Error Notification on Invalid Draft Save (Priority: P3)

An ontology editor saves an axiom expression that contains a parse error. They need an immediate, clear notification — displayed in the editor panel — that the axiom has NOT been persisted to the ontology and requires correction.

**Why this priority**: The red border signals the location; the notification message explains why and what to do. Together they give the user full context.

**Independent Test**: Can be fully tested by inspecting the UI notification shown after saving an invalid axiom — the message must identify the affected entity and axiom and instruct the user to correct it.

**Acceptance Scenarios**:

1. **Given** a user saves an invalid axiom expression, **When** the save completes, **Then** an error notification is displayed in the editor panel, identifying the entity and axiom as invalid and not synchronised, instructing the user to correct it.
2. **Given** an error notification is visible for a draft-saved invalid axiom, **When** the user corrects and re-saves the axiom successfully, **Then** the error notification is dismissed.
3. **Given** multiple axioms are present and only one is invalid, **When** the user saves, **Then** the error message specifically identifies the invalid axiom and valid axioms are synchronised normally.

---

### User Story 4 - Blocking Confirmation Before Discarding Draft Axioms (Priority: P4)

An ontology editor has one or more draft-saved invalid axioms in the editor. They trigger an operation that would reload the model (classification, consistency check, refresh, or opening a different file). Before proceeding, a blocking confirmation prompt appears listing the affected entities with a link to navigate to each one. The dialog offers three explicit choices: go back and fix the drafts, discard the drafts and proceed, or cancel the operation entirely.

**Why this priority**: Discarding in-progress work silently is unacceptable. The blocking prompt ensures the user consciously chooses to proceed. Offering an explicit discard option is important because the invalid drafts were never in the OWL document anyway — if the user has no intention of fixing them, they should not be forced to navigate back just to delete them.

**Independent Test**: Can be fully tested by saving one or more invalid draft axioms, triggering classification, and verifying: (a) the operation does not proceed until the user responds; (b) the dialog lists the affected entities with working links; (c) "Fix" navigates to the entity and aborts the operation; (d) "Discard and proceed" removes all draft axioms and continues the operation; (e) "Cancel" aborts the operation and leaves all draft axioms intact.

**Acceptance Scenarios**:

1. **Given** at least one invalid draft axiom is present, **When** the user triggers classification, consistency checking, model refresh, or opening a different ontology file, **Then** a blocking confirmation dialog is shown before the operation proceeds.
2. **Given** the blocking dialog is shown, **Then** it lists each entity that has at least one invalid draft axiom and provides a navigable link to open that entity in the editor.
3. **Given** the blocking dialog is shown, **When** the user clicks an entity link, **Then** the editor navigates to that entity and the operation is aborted so the user can fix the draft.
4. **Given** the blocking dialog is shown, **When** the user chooses "Discard and proceed", **Then** all invalid draft axioms are silently removed and the operation (classification, refresh, etc.) continues.
5. **Given** the blocking dialog is shown, **When** the user chooses "Cancel", **Then** the operation is aborted and all draft axioms remain intact in the editor.
6. **Given** no invalid draft axioms are present, **When** the user triggers classification or refresh, **Then** no blocking prompt is shown and the operation proceeds immediately.

---

### Edge Cases

- What happens when a user saves an axiom that is syntactically valid but semantically unsatisfiable? (Assumed out of scope — semantic validation requires reasoning; this feature addresses parse/syntax validity only.)
- What happens if the user closes and re-opens the entity editor panel while a draft invalid axiom is present? The draft should be lost only when the model is explicitly reloaded; closing and reopening the panel within the same session should restore the draft state.
- What happens when a user switches to a different entity in the tree view while the current entity has invalid draft axioms? The draft is preserved — the entity IRI remains in the draft Set and switching entities does not trigger any warning or discard. No draft loss occurs until a model-reload operation is triggered.
- What happens when a brand-new axiom (one that has never had a valid state) is draft-saved? The axiom is not written to the document; the document remains unchanged. The "last valid state" for a never-valid axiom is absent, so the document simply does not gain the new axiom until it is corrected and saved successfully.
- What happens when ALL axioms for an entity are invalid? All are draft-saved and none are written to the document; the entity's axiom section in the document remains unchanged.
- What happens if a previously valid axiom is edited to become invalid and then saved? The previous valid version remains in the OWL document; the editor shows the new (invalid) draft with an error indicator.
- What happens if a user deletes an axiom that is in invalid draft state? The deletion is applied immediately in the editor with no document write required (the axiom was never persisted). The entity IRI is removed from the draft Set if that was its only invalid draft axiom.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST allow users to save an axiom expression that fails syntax validation without rejecting the save action.
- **FR-002**: The editor MUST NOT synchronise an invalid axiom expression to the OWL document file; the document MUST retain its last valid state for that axiom.
- **FR-003**: When an invalid axiom is draft-saved, the editor MUST display a visible error notification in the editor panel informing the user that the axiom is invalid, has not been written to the document, and needs correction.
- **FR-004**: The error notification MUST identify the affected entity and axiom type.
- **FR-005**: When an invalid axiom is draft-saved, the axiom input field MUST be outlined with a red border to provide a persistent visual indicator of the invalid draft state.
- **FR-006**: When the user corrects a draft-saved invalid axiom so it passes syntax validation and saves again, the corrected axiom MUST be synchronised to the OWL document, the error notification MUST be dismissed, and the red border MUST be removed.
- **FR-007**: When the user triggers any operation that causes a model reload (classification, consistency checking, model refresh, or opening a different ontology file) while at least one invalid draft axiom exists, the system MUST show a blocking confirmation dialog before proceeding.
- **FR-008**: The blocking confirmation dialog MUST list each entity that has one or more invalid draft axioms as a named button in a single `vscode.window.showWarningMessage` call.
- **FR-009**: Each entity button in the dialog acts as the navigable link: clicking it opens that entity in the entity editor and aborts the triggering operation.
- **FR-010**: The blocking confirmation dialog MUST offer three action types: (a) an entity-name button per affected entity (navigates to that entity and aborts the operation), (b) "Discard and Proceed" to silently remove all invalid draft axioms and continue the operation, and (c) "Cancel" to abort the operation and leave all draft axioms intact.
- **FR-010a**: Choosing "Discard and proceed" MUST remove all invalid draft axioms from the editor and continue the originally requested operation.
- **FR-010b**: Choosing "Cancel" MUST abort the originally requested operation and leave all draft axioms in their current state.
- **FR-011**: If no invalid draft axioms are present when a model-reload operation is triggered, no blocking prompt is shown and the operation proceeds immediately.
- **FR-012**: Valid axioms MUST continue to be synchronised normally to the OWL document even when other axioms on the same entity are invalid drafts.

### Key Entities

- **Axiom Draft**: An in-editor axiom expression that has failed syntax validation, held in transient UI state only; not persisted to the OWL document. Lost when the model is reloaded.
- **OWL Document**: The on-disk ontology file. Only receives axiom updates when the expression is syntactically valid.
- **Axiom Validation State**: A per-axiom flag (valid / invalid-draft) tracked in the entity editor webview; used to control synchronisation and display of red-border error indicators per axiom input field.
- **Draft Entity Set**: A module-level `Set<string>` in `EntityEditorPanel.ts` containing Entity IRIs that currently have one or more invalid draft axioms. Per-axiom red-border state is managed within the entity editor webview itself; the Set is used only to support the blocking confirmation dialog (knowing which entities have drafts).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can save an in-progress invalid axiom expression and continue editing it in the same session without data loss for 100% of save attempts.
- **SC-002**: Zero invalid axiom expressions appear in the OWL document after a draft save of an invalid axiom.
- **SC-003**: An error notification is visible within 1 second of saving an invalid axiom expression in 100% of cases.
- **SC-004**: After correcting and saving a previously invalid axiom, the document is updated and the error message is cleared in 100% of cases.
- **SC-005**: A blocking confirmation dialog is shown in 100% of model-reload operations (classification, consistency check, refresh, file open) that would discard one or more draft axioms, and the operation does not proceed until the user responds.
- **SC-006**: The blocking dialog renders one named button per entity with draft axioms, and clicking each button navigates directly to that entity in the editor in 100% of cases.
- **SC-007**: Choosing "Discard and proceed" removes all invalid draft axioms and continues the operation in 100% of cases, without requiring the user to navigate to each entity individually.

## Clarifications

### Session 2026-05-17

- Q: How is an individual axiom uniquely identified in the draft state structure? → A: A module-level `Set<string>` of Entity IRIs (not a Map) is sufficient. Per-axiom red-border state is tracked inside the entity editor webview; users identify the invalid axiom visually when the entity is opened.
- Q: How should the blocking confirmation dialog be implemented, given VS Code modals cannot render clickable entity links? → A: One single `vscode.window.showWarningMessage` dialog with entity names as individual buttons (serving as navigable links) plus "Discard and Proceed" and "Cancel" buttons. Clicking an entity button navigates to that entity in the editor and aborts the operation.
- Q: When a user switches to a different entity in the tree view while the current entity has invalid draft axioms, is the draft preserved or discarded? → A: Preserved. The entity IRI remains in the draft Set; switching entities does not trigger any warning or discard. The draft is lost only on model reload (which shows the blocking dialog).
- Q: When a brand-new axiom (no prior valid state) is saved while still invalid, what happens? → A: The new axiom is not written to the document; the document remains unchanged. The last valid state for a never-valid axiom is "absent", so FR-002 naturally applies — the document stays as-is.
- Q: If a user deletes an axiom that is in invalid draft state, is the deletion applied immediately? → A: Yes. The axiom was never written to the OWL document so no document write is needed. The entity IRI is removed from the draft Set if that was its only invalid draft axiom.

## Assumptions

- Syntax validity is determined by the existing Manchester/Functional syntax parser already integrated in the entity editor; no new parsing engine is required.
- Semantic validation (e.g., satisfiability, logical consistency) is out of scope for this feature — only syntactic validity is checked.
- Draft axiom state is held in memory only (transient UI state); it is not persisted to any separate file or storage mechanism.
- Draft axioms are discarded on any operation that causes a full model reload from the OWL document, including classification, consistency checking, model refresh, and opening a different file. This is by design and expected by users.
- The protection against accidental draft loss is a blocking confirmation dialog (not a passive notification), requiring explicit user action before the model-reload operation proceeds.
- Multiple axioms on the same entity can independently be in draft (invalid) or synchronised (valid) state.
- The feature applies to all supported axiom expression types editable in the entity editor (SubClassOf, EquivalentClasses, etc.).
