# Feature Specification: OntoGraph CLI for AI Tools

**Feature Branch**: `018-ontograph-cli`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "create a CLI for accessing the OntoGraph-lite functionalities by AI CLI, Claude Code, Codex"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Standalone Ontology Analysis (Priority: P1)

An AI coding assistant (Claude Code, Codex) needs to inspect or process an OWL ontology file as part of a development task. The assistant invokes the CLI directly on a file path, without a VS Code instance running, and receives a structured machine-readable result.

**Why this priority**: This is the core value proposition. Any AI tool can process ontologies immediately without prerequisite setup. Delivers standalone value before the bridge integration is available.

**Independent Test**: Can be fully tested by invoking the CLI on any `.ofn`, `.omn`, `.ttl`, or `.owl` file and confirming JSON output appears on stdout with exit code 0.

**Acceptance Scenarios**:

1. **Given** an OWL file path is provided as a CLI argument, **When** the user runs a core command (parse, search, validate, or convert), **Then** the CLI outputs a valid JSON object to stdout and exits with code 0.
2. **Given** a malformed or unreadable OWL file, **When** any core command is invoked, **Then** the CLI outputs a JSON error object to stdout with a human-readable `error` field and exits with a non-zero code.
3. **Given** no file path is provided, **When** a core command requiring a file is invoked, **Then** the CLI outputs a JSON error object with an `error` field explaining the missing argument and exits with a non-zero code.

---

### User Story 2 - Workspace-Aware Reasoning via Extension Bridge (Priority: P2)

An AI coding assistant needs to classify an ontology, check its consistency, or run a DL query against the active workspace in VS Code. The assistant invokes the CLI, which connects to the running OntoGraph extension and returns reasoning results.

**Why this priority**: Reasoning operations (classification, consistency checking, DL queries) depend on state held by the running extension and cannot be reproduced outside it. High value for ontology-authoring workflows.

**Independent Test**: Can be fully tested by opening a VS Code workspace with OntoGraph active, then invoking an extension-dependent CLI command and confirming reasoning results are returned as JSON.

**Acceptance Scenarios**:

1. **Given** VS Code is running with OntoGraph active and an ontology loaded, **When** the CLI runs a reasoning command (classify, check-consistency, dl-query), **Then** the CLI connects to the extension, runs the operation, and outputs results as JSON to stdout with exit code 0.
2. **Given** no running VS Code extension is detected, **When** an extension-dependent command is invoked, **Then** the CLI outputs a JSON error object with a clear `error` field stating the extension is unavailable and exits with a non-zero code within 2 seconds.
3. **Given** the extension bridge is available, **When** a DL query expression is passed as an argument, **Then** the CLI returns the matching class IRIs as a JSON array with exit code 0.
4. **Given** an ontology that is inconsistent, **When** the check-consistency command is run, **Then** the CLI returns a JSON object containing a `consistent` boolean and a `reason` string with exit code 0.

---

### User Story 3 - Independent Package Installation (Priority: P3)

A developer or AI tool environment needs to install the OntoGraph CLI without installing the VS Code extension. The CLI is available as a standalone package that can be added to any project or global toolchain.

**Why this priority**: Separating the CLI from the VSIX package enables AI tools to depend on the CLI in non-VS Code environments and allows independent versioning.

**Independent Test**: Can be fully tested by installing only the CLI package (without VS Code), running a core command, and confirming it works.

**Acceptance Scenarios**:

1. **Given** the CLI package is installed globally or locally, **When** the bin command is invoked, **Then** the CLI is accessible from any terminal without further configuration.
2. **Given** a developer project uses a monorepo, **When** the CLI package is added as a dev dependency, **Then** it does not affect the VSIX build or extension packaging.
3. **Given** the CLI is installed without the VS Code extension, **When** extension-dependent commands are invoked, **Then** the CLI returns a clear JSON error (not a crash) indicating the extension is not running.

---

### User Story 4 - Structured Help and Discoverability (Priority: P4)

An AI tool that has never used the CLI before needs to discover available commands and their expected arguments without consulting external documentation.

**Why this priority**: AI tools rely on structured output and help text to self-describe capabilities. This enables zero-configuration integration.

**Independent Test**: Invoking the CLI with no arguments or `--help` returns a machine-parseable or human-readable listing of available commands and their input/output shapes.

**Acceptance Scenarios**:

1. **Given** the CLI is invoked with no arguments, **When** it runs, **Then** it outputs usage information (commands and arguments) to stdout.
2. **Given** the CLI is invoked with `--help` or `help`, **When** it runs, **Then** it outputs a structured listing of all available commands, their required arguments, and brief descriptions.

---

### Edge Cases

- What happens when the OWL file is too large to process within a reasonable timeout?
- What happens when two VS Code windows are open with different ontologies — which extension instance does the bridge connect to?
- What happens when the extension bridge port/socket is occupied by another process?
- How does the CLI behave when invoked from a directory with no OWL files and no file path argument?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST be invocable as a standalone executable via a single bin command without a running VS Code instance for core commands.
- **FR-002**: The CLI MUST output all results, errors, and diagnostics exclusively as JSON to stdout. No human-readable prose is written to stdout; informational messages go to stderr only. **Exception**: `--help` and `--version` output follows standard CLI conventions (human-readable text to stdout) as these are tool-discovery commands, not data operations.
- **FR-003**: The CLI MUST exit with code 0 on success and a non-zero code on any error or failure.
- **FR-004**: Core commands MUST accept an OWL file path as a required argument and operate on that file independently of any editor state.
- **FR-005**: Core commands MUST support at minimum the following operations: parse an ontology file and return a summary, search entities by label or IRI substring, validate an OWL file for structural errors, and convert an OWL file from one supported format to another.
- **FR-006**: Extension-dependent commands MUST automatically detect and connect to a running OntoGraph extension instance via a local communication channel.
- **FR-007**: Extension-dependent commands MUST return a JSON error object within 2 seconds when no running extension is detected, without hanging or crashing.
- **FR-008**: Extension-dependent commands MUST support at minimum the following operations: classify the active ontology, check consistency of the active ontology, and run a DL query expression against the active ontology.
- **FR-009**: The CLI package MUST be publishable and installable independently of the VS Code extension; installing the CLI MUST NOT require installing VS Code or the VSIX package.
- **FR-010**: The CLI MUST NOT be included in the VSIX extension package; it is distributed separately.
- **FR-011**: All JSON output MUST include a top-level `success` boolean field so callers can check the result without inspecting HTTP-style codes.
- **FR-012**: Error JSON MUST include a top-level `error` string field with a human-readable description of what failed.

### Key Entities

- **OntologyFile**: An OWL ontology in one of the supported formats (Functional Syntax, Manchester Syntax, Turtle, OWL/XML). Identified by file path.
- **EntitySummary**: A machine-readable description of a class, property, or individual — including its IRI, labels, and type.
- **SearchResult**: A ranked list of EntitySummary items matching a query term.
- **ClassificationResult**: The inferred class hierarchy produced by running a reasoner over the active ontology.
- **ConsistencyResult**: A boolean outcome plus an optional explanation of why the ontology is inconsistent.
- **DLQueryResult**: A list of class IRIs satisfying a given DL expression.
- **BridgeConnection**: A live communication channel between the CLI and the running OntoGraph VS Code extension.
- **CLICommand**: A named operation with a defined set of input arguments and a defined JSON output shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: AI tools can invoke all core ontology operations on a local OWL file and receive results in under 5 seconds per operation.
- **SC-002**: 100% of CLI output (success and error paths) is valid, parseable JSON — no CLI invocation produces non-JSON stdout.
- **SC-003**: When no extension is running, extension-dependent commands return an error response within 2 seconds (no hang).
- **SC-004**: AI tools can classify, check consistency, and run DL queries via the CLI when the extension is running, receiving complete results in under 30 seconds for ontologies up to SNOMED CT scale.
- **SC-005**: The CLI can be installed in a fresh environment and a core command executed successfully in under 2 minutes with no manual configuration.
- **SC-006**: The VSIX package size is not increased by the addition of the CLI package (CLI is excluded from VSIX build artifacts).

## Assumptions

- The OntoGraph extension exposes a local IPC socket (Unix domain socket on macOS/Linux, named pipe on Windows) after activation; the exact mechanism is an implementation detail outside this spec.
- When multiple VS Code windows are open, the bridge connects to the most recently activated OntoGraph instance; handling multiple simultaneous instances is out of scope for this feature.
- Mobile or remote-SSH VS Code environments are out of scope; the bridge assumes a local process on the same machine.
- The CLI targets developers and AI coding assistants, not end users; no interactive prompts or wizard-style UX is required.
- Supported OWL formats in the CLI match the formats already supported by the extension: Functional Syntax, Manchester Syntax, Turtle, and OWL/XML.
- Authentication between the CLI and the extension bridge is not required for this feature; the channel is local-only and protected by OS-level process isolation.
- The CLI version and extension version are independently managed; backward-compatibility guarantees between versions are not part of this spec.
