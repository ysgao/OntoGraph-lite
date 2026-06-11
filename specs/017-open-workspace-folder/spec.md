# Feature Specification: Open Workspace Folder with Ontology File

**Feature Branch**: `017-open-workspace-folder`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Open ontology file in OntoGraph should also open the folder that ontology file belongs to. Currently, open ontology file will not change the folder used by VS Code. This cause problem when ontology file change. The changes are not show in the Source Control of VS Code because it is look into a different folder."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Ontology File Sets Workspace Folder (Priority: P1)

A user opens an ontology file using the OntoGraph "Load Ontology File" command. The folder containing that file becomes the VS Code workspace folder, so Source Control, file watchers, and other VS Code features point to the correct location.

**Why this priority**: Core correctness issue. Without this, Source Control shows no changes even when the ontology file is modified and saved — blocking the user's version-control workflow entirely.

**Independent Test**: Open an ontology file from a directory that is not the current workspace folder. Verify that VS Code's Source Control panel shows the git status of the file's parent directory.

**Acceptance Scenarios**:

1. **Given** VS Code has no workspace folder open, **When** the user loads an ontology file via OntoGraph, **Then** the folder containing that file is set as the workspace folder.
2. **Given** VS Code has a different workspace folder open, **When** the user loads an ontology file from a different directory via OntoGraph, **Then** VS Code updates the workspace folder to the directory containing the newly loaded file.
3. **Given** the loaded ontology file is already inside the current workspace folder, **When** the user loads it, **Then** the workspace folder is not changed (no-op).

---

### User Story 2 - Source Control Reflects Ontology File Changes (Priority: P2)

After loading an ontology file, a user edits and saves it. The VS Code Source Control panel shows the file as modified.

**Why this priority**: This is the primary symptom the user reported. Once the workspace folder is correct, Source Control should work automatically — but this story makes the acceptance critera explicit and testable.

**Independent Test**: Load an ontology file, make a change, save it. Observe that Source Control shows the file as modified without any manual folder navigation.

**Acceptance Scenarios**:

1. **Given** an ontology file has been loaded and its parent folder is now the workspace, **When** the user saves a change to the ontology, **Then** the file appears as modified in VS Code Source Control.
2. **Given** the ontology file is tracked by git, **When** the user saves a change, **Then** the diff is visible in the Source Control diff viewer.

---

### Edge Cases

- What happens when the ontology file is on a drive or path where git is not initialized? The workspace folder should still be set; Source Control simply shows no repository (standard VS Code behaviour).
- What happens when the user declines a workspace-switch prompt? The workspace folder remains unchanged; OntoGraph still loads and displays the ontology.
- What happens when the ontology file path is a symlink or alias? The resolved canonical path's parent directory is used as the workspace folder.
- What happens when VS Code already has a multi-root workspace? Opening the folder should add it to the multi-root workspace rather than replacing existing roots.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an ontology file is opened via OntoGraph's load command, the extension MUST set the parent directory of that file as the VS Code workspace folder if it is not already inside the current workspace.
- **FR-002**: If the file's parent directory is already within the current workspace folder, the extension MUST NOT change the workspace folder.
- **FR-003**: If VS Code has no workspace folder, the extension MUST open the file's parent directory as the workspace folder without prompting the user.
- **FR-004**: If VS Code has a workspace folder that does not contain the ontology file, the extension MUST either replace the workspace folder or add the folder to a multi-root workspace, consistent with VS Code conventions.
- **FR-005**: The workspace folder change MUST happen before or together with the file load completion, so that Source Control is active by the time the user can interact with the loaded ontology.
- **FR-006**: The feature MUST work for all file-open paths in OntoGraph: the "Load Ontology File" toolbar button, the `openFile` command, and any file-watcher triggered reloads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After loading an ontology file, VS Code's Source Control panel shows the correct repository for the file's folder in 100% of cases where the file is git-tracked.
- **SC-002**: No additional user steps (e.g., manually opening a folder) are required to see Source Control changes after loading an ontology file.
- **SC-003**: Workspace folder update adds no perceptible delay (under 200 ms) to the file-load operation.
- **SC-004**: The behaviour is consistent across all three file-open entry points (toolbar button, command, file-watcher reload).

## Assumptions

- VS Code's `vscode.workspace.updateWorkspaceFolders` API is available in the target extension host version.
- The user's ontology files are in git-tracked directories; the feature's primary value is enabling Source Control, which requires git.
- Multi-root workspace behaviour follows VS Code defaults: adding a folder does not remove existing roots.
- File-watcher triggered reloads (existing feature) re-use the same code path as the explicit load command, so a single integration point covers all cases.
- Out of scope: automatically committing changes, automatically staging files, or any git operations beyond setting the workspace folder.
