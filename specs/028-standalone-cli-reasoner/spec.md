# Feature Specification: Standalone CLI Reasoner (Bundled Runtime)

**Feature Branch**: `028-standalone-cli-reasoner`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Create a standalone CLI mode for OntoGraph that bundles the reasoner (Java server JAR) and a full JRE, so users can run classify/check-consistency/dl-query commands against a local ontology file directly from the CLI package with zero external dependencies (no VS Code, no system Java required). Extract ReasonerBridge's core JSON-RPC logic away from its VS Code UI dependencies (status bar, output channel) so it can run headlessly. Add file-based variants of the existing bridge commands (classify, check-consistency, dl-query) that take a <file> argument and parse+reason entirely within the CLI process, alongside the existing 'attach to a running VS Code extension' bridge commands which remain unchanged. Zero-dependency install is the priority: bundle a full JRE with the npm package rather than requiring a system java installation." Clarified: ship a bundled runtime for macOS (arm64) only in this initial release (Option C); the minimal CLI package is kept completely unmodified, and the new standalone capability is delivered as a separate, independently-installable "standalone CLI package," not as new flags on the minimal package. Further clarified: the two packages (minimal and standalone) MUST stay in command parity going forward — a command added to one in the future must not require separately re-implementing and maintaining it for the other.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run reasoning commands without VS Code (Priority: P1)

As a developer or automation script author, I want to run classification, consistency checking,
and DL queries directly against a local ontology file using a self-contained CLI tool, without VS
Code running at all, so I can use OntoGraph's reasoning capabilities in CI pipelines, scripts, or
environments where installing and running VS Code isn't practical.

**Why this priority**: This is the core value proposition of the feature — everything else exists
to support it.

**Independent Test**: With no VS Code running (and no system Java installed anywhere on the
machine), run a classification command against a local ontology file and get a valid result.

**Acceptance Scenarios**:

1. **Given** a valid ontology file, **When** the user runs the standalone CLI package's classify
   command against that file, **Then** it parses the file, reasons over it using its own bundled
   reasoner, and returns a classification result in the same shape as the minimal (VS-Code-based)
   CLI's `classify` command.
2. **Given** a valid ontology file, **When** the user runs the standalone CLI's consistency-check
   command, **Then** it reports consistency without contacting VS Code or requiring it to be
   installed.
3. **Given** a valid ontology file and a DL expression, **When** the user runs the standalone CLI's
   `dl-query` command (optionally with result-category selection and a label filter, per feature
   027), **Then** it returns the same category-selectable, filterable result shape as the minimal
   CLI's `dl-query` command, fully standalone.
4. **Given** a machine with no system Java installed at all, **When** the user runs any standalone
   CLI reasoning command, **Then** it still works, using the package's own bundled runtime.

---

### User Story 2 - Zero-dependency install (Priority: P1)

As a user installing the standalone CLI package, I want the install to give me a fully working
reasoning tool immediately, with no manual post-install step to install Java or point the tool at
a runtime, so installing the package is the only setup required.

**Why this priority**: This is the explicit, stated priority driving this feature.

**Independent Test**: On a clean machine or container with no Java installed anywhere, install the
standalone CLI package and immediately run a classify command successfully.

**Acceptance Scenarios**:

1. **Given** a clean environment with no Java installed, **When** the user installs the standalone
   CLI package, **Then** the install completes successfully and includes everything needed to run
   the reasoner.
2. **Given** the installed standalone CLI, **When** the user runs a reasoning command, **Then** it
   does not search for or depend on a system `java` executable — it uses only its own bundled
   runtime.
3. **Given** the user is on the supported platform, **When** they install the package, **Then**
   they receive the correct runtime automatically, with no manual configuration.

---

### User Story 3 - The minimal CLI package is completely unaffected (Priority: P2)

As an existing user of the minimal CLI package (which attaches to a running VS Code extension for
reasoning commands), I want that package to keep working exactly as it does today, so this new
feature doesn't disrupt my existing scripts, workflows, or installed tooling.

**Why this priority**: Backward compatibility — important, but secondary to delivering the new
standalone package itself, since it requires no changes to earn.

**Independent Test**: With the minimal CLI package installed and VS Code running with OntoGraph
active, confirm every existing command behaves identically to before this feature shipped.

**Acceptance Scenarios**:

1. **Given** the minimal CLI package, **When** a user runs any of its commands (including
   `classify`/`check-consistency`/`dl-query` attaching to a running VS Code extension), **Then**
   behavior is byte-for-byte unchanged from before this feature.
2. **Given** both the minimal CLI package and the new standalone CLI package happen to be
   installed on the same machine, **When** either is invoked, **Then** each operates entirely
   independently of the other — installing or using one has no effect on the other.

---

### User Story 4 - Future commands stay available in both packages (Priority: P2)

As the maintainer adding a new CLI command after this feature ships, I want that command to
become available in both the minimal and standalone packages without writing and maintaining two
separate implementations, so the two packages never quietly drift apart in what they can do.

**Why this priority**: This is a maintainability guarantee rather than an end-user-facing
capability on its own — it protects the value of both packages over time, but nothing in this
feature's day-one scope depends on it directly.

**Independent Test**: Add a new CLI command after this feature ships and confirm it becomes usable
from both packages as a natural consequence of how it was added — not because it was separately
built or wired up twice.

**Acceptance Scenarios**:

1. **Given** a new command is added to the CLI's command set after this feature ships, **When** it
   is released, **Then** it is available in both the minimal and standalone packages without a
   second, package-specific implementation effort.
2. **Given** the minimal and standalone packages, **When** compared command-for-command at any
   point in time, **Then** the standalone package's non-reasoning commands (e.g., `parse`,
   `search`, `validate`, `convert`, `stats`, `entity-info`) and the minimal package's own commands
   are never allowed to silently diverge — any intentional difference between the two (such as the
   standalone package's bundled-runtime reasoning commands not existing in the minimal package) is
   a deliberate, documented exception, not an accident of maintenance.

---

### Edge Cases

- What happens when the bundled runtime fails to start (corrupted install)? The command reports a
  clear, actionable error — never a silent hang or an opaque crash.
- What happens when the standalone CLI package is installed on an unsupported platform/
  architecture? A clear error (ideally surfaced at install time by the package manager, per
  platform-specific package conventions) explaining the platform isn't supported, rather than a
  cryptic process-spawn failure at first use.
- What happens for a large (SNOMED CT-scale) ontology processed by the standalone CLI? The same
  performance/engine-selection behavior as the minimal CLI's VS-Code-attached path — the
  standalone package reuses the identical reasoner, so no new scale limitation is introduced.
- What happens when the ontology file itself is invalid or unparseable? The same structural error
  handling and reporting the minimal CLI's file-based commands (`parse`, `validate`) already use.
- What happens if a user installs both CLI packages globally under the same command name? Treated
  as the user's own choice among two independent, alternative distributions — not a scenario this
  feature needs to detect or prevent (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A new, separate standalone CLI package MUST provide classify, check-consistency, and
  DL query commands that operate directly against a local ontology file — it MUST NOT require a
  running VS Code extension for any of these commands.
- **FR-002**: The standalone CLI's reasoning commands MUST produce output in the same JSON
  success/error envelope and result shape as the minimal CLI's equivalent (VS-Code-attached)
  commands, so scripts consuming the output don't need to distinguish which CLI produced it.
- **FR-003**: The standalone CLI package MUST include everything needed to run the reasoner
  without requiring a system-installed Java runtime — there is no separate "install Java" step.
- **FR-004**: The standalone CLI's reasoning commands MUST use the package's own bundled runtime
  exclusively — they MUST NOT search for, or depend on, a system `java` executable on the user's
  `PATH`.
- **FR-005**: The minimal CLI package MUST remain completely unmodified by this feature — every
  existing command, including its VS-Code-attached `classify`/`check-consistency`/`dl-query`,
  continues to work exactly as it does today.
- **FR-006**: The standalone CLI package MUST be installable and usable entirely independently of
  the minimal CLI package — installing, updating, or using either package MUST have no effect on
  the other.
- **FR-007**: The standalone CLI's reasoning commands MUST support the same ontology file formats
  the minimal CLI's file-based commands already support (OWL Functional Syntax, Manchester
  Syntax, OWL/XML, Turtle/N-Triples).
- **FR-008**: The standalone CLI's DL query command MUST support the same result-category
  selection and label filtering capabilities as the minimal CLI's `dl-query` command (feature
  027).
- **FR-009**: When the bundled runtime fails to start or is corrupted, the standalone CLI MUST
  report a clear, actionable error rather than hanging or crashing opaquely.
- **FR-010**: For this initial release, the standalone CLI package MUST ship a bundled runtime for
  macOS on Apple Silicon (arm64) only. Running it on any other platform/architecture MUST produce
  a clear "platform not supported" message rather than a silent or cryptic failure. Broader
  platform coverage is explicitly out of scope for this release and may be addressed as a
  follow-up.
- **FR-011**: The standalone CLI's reasoning commands MUST handle ontologies at the same scale the
  rest of the project already supports (up to SNOMED CT scale, tens of thousands of classes),
  introducing no new performance ceiling versus the minimal CLI's VS-Code-attached path.
- **FR-012**: A command added to either CLI package's shared (non-reasoning) command set in the
  future MUST become available in both packages without a separate, package-specific
  implementation effort — the two packages MUST NOT be independently maintained forks that can
  silently drift apart in capability. Any deliberate difference between the two (such as the
  standalone package's bundled-runtime reasoning commands not existing in the minimal package)
  MUST be an intentional, documented exception rather than an accident of maintenance.

### Key Entities *(include if feature involves data)*

- **Standalone CLI Package**: A new, separate, independently-installable command-line package that
  performs reasoning entirely within its own process, against a local ontology file, using its own
  bundled runtime — it has no VS-Code-attached mode.
- **Bundled Runtime**: The packaged Java runtime and reasoner artifact shipped inside the
  standalone CLI package for its one supported platform (macOS arm64, this release).
- **Minimal CLI Package**: The current, unmodified command-line package, whose
  `classify`/`check-consistency`/`dl-query` commands continue to require a running VS Code
  extension exactly as they do today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user on a clean macOS-arm64 machine with no Java installed can install the
  standalone CLI package and successfully classify a sample ontology on the first attempt, with no
  setup steps beyond the single install command.
- **SC-002**: A script consuming the standalone CLI's output cannot distinguish it (aside from
  timing) from the minimal CLI's equivalent VS-Code-attached command output.
- **SC-003**: On the one supported platform (macOS arm64), all three reasoning commands run
  without any additional user-provided software.
- **SC-004**: The minimal CLI package's workflows show zero behavior change after this feature
  ships.
- **SC-005**: A large (SNOMED CT-scale) ontology processed by the standalone CLI completes within
  the same time budget as the equivalent operation via the minimal CLI today.
- **SC-006**: An unsupported-platform or corrupted-runtime scenario is always reported clearly to
  the user within a few seconds — never a silent, indefinite hang.
- **SC-007**: A command added to the CLI's shared command set after this feature ships requires
  implementing it once; it becomes available in both packages without a second, package-specific
  implementation pass.

## Assumptions

- "Zero-dependency install" means bundling a complete Java runtime inside the standalone package's
  distribution — an explicit, deliberate priority favoring installation simplicity over package
  size.
- The bundled runtime is a redistribution-friendly JRE build (e.g., Eclipse Temurin/Adoptium,
  already the JRE family in use in this project's own development environment) rather than a full
  JDK, since only runtime execution of the existing reasoner is needed.
- The bundled reasoner artifact is the same Java server already used by the VS Code extension —
  this feature changes only how and where the runtime that executes it is obtained and launched,
  not the reasoner's own logic, capabilities, or JSON-RPC protocol.
- The standalone CLI package includes the full set of existing file-based utility commands
  (`parse`, `search`, `validate`, `convert`, `stats`, `entity-info` — none of which need Java or VS
  Code today) alongside the new bundled-runtime reasoning commands, so it is a complete,
  self-contained tool rather than a companion that still requires the minimal package for basic
  operations.
- The standalone package is scoped to macOS arm64 only for this release (per the resolved
  clarification); broader platform support is a candidate for a future, separate feature rather
  than part of this one.
- Both CLI packages may use the same command names/binary name — they are alternative
  distributions a user chooses between, not designed to be installed together; this feature does
  not need to detect or prevent that combination.
- Package size is expected to grow substantially for the standalone package (a bundled runtime is
  on the order of tens to a couple hundred MB); this is an accepted tradeoff of the
  "zero-dependency" priority. Minimizing that size further (e.g., via a trimmed custom runtime
  containing only the modules the reasoner needs) is an implementation-level optimization, not a
  scope constraint on this feature.
- This feature does not change the reasoner's own reasoning logic or JSON-RPC protocol — those are
  reused as-is; only their packaging and invocation path change for the standalone package.
- Keeping the two packages in command parity (FR-012) implies they share a common source of
  command implementations rather than being two independently hand-maintained codebases — the
  standalone package differs from the minimal package in packaging and bundled runtime, not in
  having its own separate command logic to keep in sync by hand. The exact mechanics of that
  sharing are a planning/implementation concern, not a scope decision this spec needs to settle.
