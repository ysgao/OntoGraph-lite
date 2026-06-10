# Feature Specification: Remove Authoring-UI Integration — Standalone Extension

**Feature Branch**: `015-remove-authoring-ui-integration`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "remove the integration with the authoring-ui-vscode. The listeners and messaging etc. between ontograph-lite and authoring-ui-vscode can be removed. So, we will have the ontograph-lite as standalone application. These changes that need to be revised can be found after the git commit 95e8cb2."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install OntoGraph-lite without activation errors (Priority: P1)

A developer or ontologist installs the OntoGraph-lite VS Code extension. It activates cleanly with no errors, regardless of whether other SNOMED-related extensions are also installed.

**Why this priority**: The "command already exists" error blocks OntoGraph-lite from functioning at all when co-installed with the authoring-ui-vscode extension. This is a hard blocker.

**Independent Test**: Install OntoGraph-lite alone or alongside the authoring-ui-vscode extension, reload VS Code, open an OWL ontology file, and verify no activation error appears in the output channel or developer console.

**Acceptance Scenarios**:

1. **Given** OntoGraph-lite is the only extension installed, **When** VS Code activates it, **Then** the extension activates without errors and all commands are available.
2. **Given** OntoGraph-lite and authoring-ui-vscode are both installed, **When** VS Code activates, **Then** OntoGraph-lite activates without "command already exists" errors.
3. **Given** the extension was previously failing with "command 'ontograph.searchEntity' already exists", **When** the fix is applied, **Then** that specific error no longer appears.

---

### User Story 2 - All existing features work after decoupling (Priority: P2)

An ontologist uses all standard OntoGraph-lite features — loading an ontology, editing entities, searching, classifying, visualizing — without any regression caused by the removal of the integration code.

**Why this priority**: The decoupling must not break existing standalone functionality. Any listener, message handler, or export that was added for the integration must be cleanly removed or its standalone equivalent preserved.

**Independent Test**: Load `test-ontologies/bfo-core.ofn`, perform entity search, edit a class, save, undo, redo, run classification. All operations complete without error.

**Acceptance Scenarios**:

1. **Given** an ontology is loaded, **When** the user searches for an entity, **Then** results appear as expected (no regression from removing integration hooks).
2. **Given** the entity editor is open, **When** the user saves a change, **Then** the file is updated correctly and no integration-related side effects occur.
3. **Given** the undo/redo feature is active, **When** undo is triggered, **Then** the previous state is restored without errors.

---

### User Story 3 - No orphaned listeners or exports remain (Priority: P3)

After the integration removal, no code in OntoGraph-lite listens for or dispatches messages intended for authoring-ui-vscode. The extension exposes no VS Code API surface that was added solely for the other extension to consume.

**Why this priority**: Orphaned integration code increases maintenance burden and can cause subtle runtime errors or unexpected behaviour for standalone users.

**Independent Test**: Code review confirms no message listeners, command registrations, or API exports remain that reference or were added for the authoring-ui-vscode integration.

**Acceptance Scenarios**:

1. **Given** the codebase after the change, **When** a code search is performed for integration-specific identifiers, **Then** no integration code remains in production files.
2. **Given** the extension is running standalone, **When** any previously integration-specific code path would have been executed, **Then** it is either absent or gracefully no-ops.

---

### Edge Cases

- What happens if the authoring-ui-vscode extension is installed after this change? OntoGraph-lite must still activate cleanly — it should have no awareness of the other extension.
- What if a command was shared (registered by both extensions)? After this change, each extension registers only its own commands; no shared registration remains.
- What if the integration was injected via extension dependencies in `package.json`? Any `extensionDependencies` or `extensionPack` entries referencing authoring-ui-vscode must be removed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: OntoGraph-lite MUST activate without errors when installed alongside any other VS Code extension, including authoring-ui-vscode.
- **FR-002**: OntoGraph-lite MUST NOT register any VS Code command that is also registered by another extension (no shared command identifiers).
- **FR-003**: All message listeners added solely to communicate with authoring-ui-vscode MUST be removed from the extension host code.
- **FR-004**: All message dispatch calls targeting authoring-ui-vscode MUST be removed from the extension host and webview code.
- **FR-005**: OntoGraph-lite MUST NOT declare `extensionDependencies` or any other `package.json` coupling to authoring-ui-vscode.
- **FR-006**: All existing standalone features (entity editing, search, classification, undo/redo, graph view) MUST continue to work after the integration code is removed.
- **FR-007**: The extension MUST expose only the public VS Code command API surface described in its own `package.json` contributes — no additional exports added for external extension consumption.

### Key Entities

- **Integration point**: Any code path in OntoGraph-lite that was added to communicate with, respond to, or be invoked by authoring-ui-vscode — including message listeners, custom commands, exported functions, and `package.json` manifest entries.
- **Standalone activation**: The `activate()` function running to completion with all commands registered exactly once, with no errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: OntoGraph-lite activates in under 3 seconds with zero activation errors when installed alongside authoring-ui-vscode.
- **SC-002**: 100% of existing tests pass after the integration code is removed.
- **SC-003**: All commands listed in `package.json` contributes are registered exactly once at activation — verified by absence of "command already exists" errors across 10 consecutive VS Code reloads with both extensions installed.
- **SC-004**: Zero integration-specific identifiers remain in production source files after the change (verified by targeted code search).

## Assumptions

- The integration code introduced by the other project is localised to changes made after commit `95e8cb2` (version 0.1.9) and/or to specific files identifiable by diffing that baseline.
- The "command already exists" error for `ontograph.searchEntity` is the primary visible symptom; other commands may also be double-registered.
- The authoring-ui-vscode extension is a separate VS Code extension that was made to depend on or re-use OntoGraph-lite internals.
- OntoGraph-lite's own webview message bus (`postMessage` between extension host and its own webview panels) is internal and is NOT part of the integration being removed.
- Removing the integration requires no changes to the Java reasoner server.
