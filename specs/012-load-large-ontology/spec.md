# Feature Specification: Load Large Ontology Files

**Feature Branch**: `012-load-large-ontology`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "Load large ontology files (>50 MB) that VS Code cannot open as text documents."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Load a Large Ontology File via Toolbar Button or Command (Priority: P1)

An ontology engineer works with a large ontology file (e.g. the SNOMED CT snapshot, ~200 MB) that the editor refuses to open as an editable text document. They click the "Open File" button that appears in the Classes Hierarchy or Inferred Hierarchy panel toolbar (positioned before the Classify button), select the file from a picker, and OntoGraph loads it: the class hierarchy, properties, and individuals panels all populate normally. The same action is also available from the Command Palette for keyboard-first users. No editor window for the file is required.

**Why this priority**: This is the core use case. Without it, large ontologies are completely inaccessible in OntoGraph. Everything else builds on this.

**Independent Test**: Click the "Open File" toolbar button in the Classes Hierarchy panel, select a 200 MB OWL Functional Syntax file, observe class hierarchy populates with the expected class count. No other user story needs to be implemented first.

**Acceptance Scenarios**:

1. **Given** no ontology is loaded, **When** the user clicks the "Open File" button in the Classes Hierarchy or Inferred Hierarchy toolbar, **Then** a file picker opens filtered to supported ontology extensions.
2. **Given** a 200 MB `.owl` file on disk, **When** the user selects it via the toolbar button or Command Palette, **Then** the class hierarchy panel shows the correct number of classes within 60 seconds and no error is shown.
3. **Given** a file larger than 50 MB with a supported format, **When** the user selects it via the button or command, **Then** OntoGraph loads it regardless of whether the editor has it open as a text document.
4. **Given** an unsupported or unrecognisable file is selected, **When** loading is attempted, **Then** a clear error message names the file and states the format could not be detected.
5. **Given** a load is already in progress, **When** the user triggers the command or button again, **Then** the second invocation cancels gracefully without corrupting state.

---

### User Story 2 — Guided Fallback When VS Code Cannot Open a Large File (Priority: P2)

A user opens an ontology file using the standard VS Code file-open mechanism (File → Open, drag-and-drop, or Explorer click). If the file is too large for VS Code's text editor to handle, the editor shows a "file is too large" message and OntoGraph receives no parse event. OntoGraph detects this situation and displays a notification offering to load the file via its own direct-read pathway, so the user does not need to discover a separate command.

**Why this priority**: Users naturally reach for the standard file-open gesture. If that silently does nothing in OntoGraph, they have no idea the toolbar button exists. This story closes the discoverability gap and makes the experience seamless.

**Independent Test**: Open a 200 MB `.owl` file via VS Code's normal File → Open. Without clicking anything else, observe a notification or message from OntoGraph offering to load the file. Click the offered action — panels populate.

**Acceptance Scenarios**:

1. **Given** the user opens an ontology file via normal VS Code means and the file exceeds the editor's large-file threshold, **When** OntoGraph detects that the active editor path is an ontology file with no loadable content, **Then** OntoGraph shows a notification: "This file is too large for VS Code's text editor. Load it in OntoGraph?" with a "Load" action button.
2. **Given** the notification is shown, **When** the user clicks "Load", **Then** OntoGraph loads the file directly from disk and populates all panels.
3. **Given** the notification is shown, **When** the user dismisses it, **Then** nothing changes and no error is logged.
4. **Given** a normally-sized ontology file is opened via VS Code, **When** OntoGraph loads it via the existing pathway, **Then** no notification is shown (normal files must not trigger the large-file message).

---

### User Story 3 — Edit Annotations and Axioms; Changes Persist to Disk (Priority: P3)

After loading a large ontology via the button or command, the engineer selects a class, edits its label or adds a subclass axiom in the entity editor, and saves. The change is written back to the original file on disk. Reopening the file in any OWL tool shows the edit.

**Why this priority**: Loading without write-back is read-only. Round-trip editing is what makes the feature production-useful.

**Independent Test**: Load a large file via the toolbar button, edit one annotation label via the entity editor, confirm the change appears in the file on disk when read by an external tool.

**Acceptance Scenarios**:

1. **Given** a large ontology is loaded and a class is selected, **When** the user edits an annotation (e.g. `rdfs:label`) and confirms, **Then** the updated annotation is written to the file on disk within 5 seconds.
2. **Given** a large ontology is loaded, **When** the user adds or removes a subclass axiom and saves, **Then** the axiom change is reflected in the file on disk.
3. **Given** the file is read-only on the filesystem, **When** a save is attempted, **Then** OntoGraph shows a clear error explaining the file cannot be written.

---

### User Story 4 — Auto-Reload When the File Changes on Disk (Priority: P4)

While a large ontology is loaded, an external process modifies the file on disk. OntoGraph detects the change and reloads, keeping the in-memory model consistent with the file.

**Why this priority**: Mirrors existing behaviour for normal-sized files. Can ship after P1–P3.

**Independent Test**: Load a large file, externally modify it, confirm OntoGraph reloads without manual intervention.

**Acceptance Scenarios**:

1. **Given** a large ontology is loaded, **When** the file on disk changes, **Then** OntoGraph reloads (or prompts to reload) within 2 seconds of the change.
2. **Given** a reload is triggered, **When** the reload completes, **Then** all panels reflect the updated content.

---

### Edge Cases

- What happens when the selected file is deleted from disk before loading completes?
- What happens when available memory is insufficient to hold the parsed model?
- What if the file path contains non-ASCII characters or spaces?
- What if two Load commands or button clicks are triggered in rapid succession for different files?
- What if the editor is closed while a large file is being parsed?
- What if VS Code shows a large-file message for a non-ontology file (e.g. a large CSV) — should the notification appear?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: OntoGraph MUST provide a command "Load Ontology File…" accessible from the Command Palette that opens a file-picker filtered to supported ontology extensions (.owl, .ofn, .omn, .ttl, .owx).
- **FR-002**: The Classes Hierarchy panel toolbar and the Inferred Hierarchy panel toolbar MUST each show an "Open File" button positioned before the existing Classify button; clicking it invokes the same load action as the command.
- **FR-003**: The load operation MUST read file content directly from disk without relying on the editor's text-document API, so files of any size are supported.
- **FR-004**: OntoGraph MUST detect the ontology format from file content (not file extension alone) and route to the correct parser, consistent with how normally-sized files are handled.
- **FR-005**: A visible progress indicator MUST be shown during loading; the user MUST be able to see that work is in progress for files that take tens of seconds to parse.
- **FR-006**: After a successful load, all OntoGraph panels (class hierarchy, properties, individuals, inferred hierarchy) MUST populate with the loaded ontology's data.
- **FR-007**: The loaded file's path MUST be recorded as the ontology's source so that all subsequent save and sync operations target that file on disk.
- **FR-008**: When the active editor contains an ontology file path but VS Code has not delivered parseable content (large-file condition), OntoGraph MUST show a notification offering to load the file via the direct-read pathway, with a single-click "Load" action.
- **FR-009**: The large-file notification MUST NOT appear for files that loaded successfully via the normal document pathway.
- **FR-010**: Annotation and axiom edits made via the entity editor MUST be written back to the source file on disk.
- **FR-011**: If the source file cannot be written (permissions, missing path), OntoGraph MUST show an error message that names the file and describes the problem.
- **FR-012**: OntoGraph MUST watch the source file for changes on disk and reload (or prompt to reload) when an external modification is detected, consistent with behaviour for normal-sized files.
- **FR-013**: If the file format cannot be detected, OntoGraph MUST display a clear error naming the file and MUST NOT leave the UI in a partially-loaded state.

### Key Entities

- **Large Ontology File**: An ontology file on disk whose size exceeds the editor's internal text-document threshold. Characterised by a file path, a detectable serialisation format, and content that may take tens of seconds to parse.
- **Loaded Model**: The in-memory representation of the ontology after parsing. Holds the source file path so edits can be written back. Identical in structure to models loaded from normal-sized files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 200 MB OWL Functional Syntax ontology (~380k classes) loads and populates all panels within 60 seconds on a standard developer workstation.
- **SC-002**: 100% of annotation and axiom edits made after loading a large file are persisted to disk; zero edits are silently lost.
- **SC-003**: Disk-change detection triggers a reload within 2 seconds of the file modification timestamp changing.
- **SC-004**: Loading a large file produces zero regressions in loading normal-sized files via the existing open-document pathway.
- **SC-005**: A clear, named error is shown for every failure mode (unrecognised format, read error, write error) — zero silent failures.
- **SC-006**: A user unfamiliar with the "Load Ontology File…" command can discover and use the large-file pathway within 30 seconds of VS Code showing a large-file warning, guided solely by the OntoGraph notification. *(Manual acceptance only — cannot be measured in automated CI. Not a CI quality gate.)*

## Assumptions

- Files below the editor's large-file threshold continue to load via the existing automatic open-document pathway; this feature adds a parallel path for large files only.
- The existing five parsers already support large files when given raw text content; the bottleneck is getting the content to the parser, not the parsers themselves.
- Write-back for annotation and axiom edits can adapt the existing in-place sync mechanisms to read from and write to disk directly when the file is not open as an editor text document.
- The SNOMED CT snapshot (~200 MB, ~380k classes) is the scale benchmark; files of this size must complete within SC-001.
- Memory consumption for the parsed model of a 200 MB file is within the Node.js process limits on a standard workstation (assumed ≥16 GB RAM).
- The large-file detection heuristic (ontology file path with no loadable content) is sufficient to distinguish large-file failures from other editor states; false positives (offering the notification when not needed) are handled by FR-009.
