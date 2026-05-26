# Feature Specification: Reload Ontology from Disk

**Feature Branch**: `010-reload-ontology`  
**Created**: 2026-05-26  
**Status**: Draft  
**Input**: User description: "Reload the ontology after the git pull changes. After open the ontology file from a folder in the OntoGraph, the git pull some changes from the remote repository. However, these changes are not reflected in the opened ontology. The refresh and classification does not seems to read the changes from the git pull. The only way is to close the application and restart. We can add a button next to the classification button to reload the ontology file. This will ensure the latest changes from git will be included."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Reload After Git Pull (Priority: P1)

A user opens an OWL ontology file in OntoGraph without making any local edits. A colleague pushes changes to the shared repository and the user runs a git pull from their terminal. OntoGraph detects that the file on disk has changed and automatically reloads the ontology — no prompt, no dialog. A brief status message confirms the reload. The tree views immediately reflect the pulled changes without any user action and without restarting VS Code.

**Why this priority**: This is the core problem being solved. The typical git pull workflow happens before the user starts editing, so there are no local changes to protect. Silent auto-reload is the least disruptive response.

**Independent Test**: Can be fully tested by opening an ontology without editing, modifying the file on disk externally, and confirming the tree views update automatically within a few seconds. Delivers standalone value.

**Acceptance Scenarios**:

1. **Given** an ontology is open in OntoGraph with no local unsaved changes, **When** the file is modified on disk (e.g., by git pull), **Then** OntoGraph automatically reloads the ontology without any user prompt.
2. **Given** the auto-reload completes successfully, **Then** a brief status message (e.g., "Ontology reloaded from disk") is shown to confirm the update.
3. **Given** the auto-reload completes, **Then** all sidebar tree views (Classes, Properties, Individuals) reflect the updated on-disk content within 5 seconds for ontologies up to 50,000 classes.
4. **Given** the auto-reload completes, **Then** any previously inferred hierarchy is cleared and the Inferred Hierarchy view is reset to empty (requiring re-classification).
5. **Given** the file changes on disk multiple times in rapid succession (e.g., git pull writing a large file), **Then** OntoGraph triggers at most one reload, not one per write event.

---

### User Story 2 - Manual Reload via Toolbar Button (Priority: P2)

A user wants to explicitly reload the ontology at a moment of their choosing — for example, after a git pull they ran before opening OntoGraph, or to confirm the current state matches disk. They click the "Reload Ontology" button in the toolbar, adjacent to the Classify button, and the tree views update immediately.

**Why this priority**: The manual button provides a reliable, always-available control independent of file-watcher delivery timing. It is the primary path when the file was already changed before OntoGraph opened.

**Independent Test**: Can be fully tested independently by clicking the toolbar button after an external file change and confirming the UI updates.

**Acceptance Scenarios**:

1. **Given** an ontology is open in OntoGraph, **When** the user clicks the Reload Ontology button, **Then** the ontology is re-read from disk and all tree views update within 5 seconds for ontologies up to 50,000 classes.
2. **Given** the user clicks Reload, **When** the reload is in progress, **Then** a visible progress indicator is shown and the Reload button is disabled to prevent concurrent reloads.
3. **Given** the reload completes, **Then** any previously inferred hierarchy is cleared and the Inferred Hierarchy view is reset to empty.

---

### User Story 3 - Reload Error Handling (Priority: P3)

A user triggers a reload (auto or manual) but the file on disk has a syntax error from a bad merge, or the file has been deleted. OntoGraph displays a clear error message and leaves the existing in-memory model unchanged so the user is not left with an empty or corrupt view.

**Why this priority**: Silent failures are worse than no feature at all; users may believe they are working with current data when they are not.

**Independent Test**: Can be fully tested by corrupting the ontology file, clicking Reload, and confirming an error is displayed and the prior model remains accessible.

**Acceptance Scenarios**:

1. **Given** the ontology file no longer exists at its original path when reload is triggered, **Then** OntoGraph displays an error message identifying the problem, and the existing in-memory model remains unchanged.
2. **Given** the ontology file contains a parse error when reload is triggered, **Then** OntoGraph displays an error message indicating the file could not be parsed, and the existing in-memory model remains unchanged.
3. **Given** a reload fails for any reason, **Then** the Reload button becomes active again so the user can retry after fixing the issue.

---

### Edge Cases

- What happens when the file watcher fires during an already in-progress reload triggered by the toolbar button?
- What happens when the ontology file is being written by git pull at the exact moment the auto-reload triggers (partial file read)?
- What happens when the user clicks Reload and then immediately triggers classification before the reload completes?
- How does the system handle a reload where the ontology IRI has changed between the original load and the git-pulled version?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Reload Ontology" control in the OntoGraph toolbar, positioned adjacent to the existing "Classify" button.
- **FR-002**: When reload is triggered (auto or manual), the system MUST re-read the ontology file from its original on-disk path.
- **FR-003**: On successful reload, the system MUST replace the in-memory ontology model with the newly parsed content from disk.
- **FR-004**: On successful reload, the system MUST refresh all sidebar tree views (Classes, Object Properties, Data Properties, Annotation Properties, Individuals) to reflect the updated model.
- **FR-005**: On successful reload, the system MUST clear the Inferred Hierarchy view, as any prior classification results are no longer valid for the updated ontology.
- **FR-006**: While a reload is in progress, the system MUST display a progress indicator and disable the Reload control to prevent concurrent reload operations.
- **FR-007**: If the reload fails (file missing, unreadable, or unparseable), the system MUST display a descriptive error message and leave the existing in-memory model unchanged.
- **FR-008**: The Reload control MUST be re-enabled after a reload completes, whether the reload succeeded or failed.
- **FR-009**: The Reload operation MUST work for all supported ontology formats (OWL Functional Syntax, Manchester Syntax, OWL/XML, Turtle/N-Triples).
- **FR-010**: System MUST monitor the open ontology file for on-disk changes while OntoGraph is active.
- **FR-011**: When an on-disk change is detected, the system MUST automatically reload the ontology without prompting the user.
- **FR-012**: After a successful auto-reload, the system MUST display a brief status message confirming the ontology was reloaded from disk.
- **FR-013**: If the file changes multiple times in rapid succession, the system MUST coalesce these into a single reload, not trigger one per change event.

### Key Entities

- **Active Ontology**: The ontology currently loaded in memory, identified by its on-disk file path. This is the target of any reload operation.
- **Disk State**: The current content of the ontology file as it exists on disk at the time reload is triggered. This becomes the new authoritative source.
- **In-Memory Model**: The parsed representation of the ontology held in memory. After a successful reload, this is replaced by the parsed Disk State.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a git pull that modifies the ontology file, OntoGraph automatically updates the tree views without any user action and without restarting VS Code, in 100% of cases where the file is valid and accessible.
- **SC-002**: For ontologies up to 50,000 classes, auto-reload and manual reload each complete and update the UI within 5 seconds of the triggering event.
- **SC-003**: Every reload attempt results in either a fully updated UI with a confirmation message (success) or a clear error message (failure) — no silent failures, no partial updates.
- **SC-004**: The Reload button is visually discoverable next to the Classify button without requiring documentation or onboarding.
- **SC-005**: Support tickets related to "stale ontology data requiring VS Code restart" are eliminated for the git-pull workflow.

## Assumptions

- The primary use case is a git pull that modifies the ontology file on disk before or during a session where the user has not yet made local edits. In this case, auto-reload proceeds with no prompt.
- If a user has saved their changes and then runs git pull, any merge conflicts are resolved by VS Code Source Control before the file is written to disk. By the time OntoGraph's file watcher fires, the file is already in a resolved, valid state. OntoGraph does not need to handle merge conflicts.
- The reload targets the file path from which the ontology was originally opened; no file-picker dialog is shown.
- Inferred hierarchy is always discarded on reload; the user must re-run classification explicitly. This is the safe default since the ontology content may have changed in ways that invalidate prior inferences.
- The ontology file is modified in-place on disk (git pull overwrites it at the same path); the path does not change.
- For large ontologies (above the large-ontology threshold), reload uses the same non-blocking parse mechanism as initial load to avoid freezing the editor.
- No collaborative editing conflict resolution is in scope — that responsibility belongs to VS Code Source Control.
