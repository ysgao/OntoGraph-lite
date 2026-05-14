<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump type: MAJOR — first-ever ratified version; replaces blank template

Modified principles:
  All principles are NEW (template had no concrete values)

Added sections:
  - Core Principles (I–V)
  - Technical Stack Requirements
  - Development Workflow
  - Governance

Removed sections:
  - None (no prior content)

Templates reviewed:
  ✅ .specify/templates/plan-template.md   — Constitution Check section is dynamically filled per plan; no update needed
  ✅ .specify/templates/spec-template.md   — Structure aligns with Principle I (user stories as acceptance tests); no update needed
  ✅ .specify/templates/tasks-template.md  — Task phases and TDD ordering align with Principle I; no update needed

Follow-up TODOs:
  None — all fields resolved from project context.
-->

# OntoGraph Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

All implementation MUST be preceded by failing tests. The Red-Green-Refactor cycle
is mandatory and non-negotiable:

- **Red**: Write one or more unit or integration tests that define the expected
  behavior. Run the tests and confirm they fail before writing any implementation code.
- **Green**: Write the minimum code necessary to make the failing tests pass.
  Confirm all tests pass.
- **Refactor**: Improve clarity and remove duplication while keeping tests green.

No task may be marked complete unless all associated tests pass. Coverage target
for new code is >80%.

**Rationale**: The project's correctness properties (OWL round-trip fidelity,
ordering stability) are subtle and hard to verify by inspection alone. Tests
enforce the contract explicitly and catch regressions immediately.

### II. Simplicity & YAGNI

No abstractions, layers, error handling, or features beyond what the current task
requires. Specifically:

- Three similar lines is preferable to a premature abstraction.
- Do not add fallbacks or validation for scenarios that cannot occur internally.
  Validate only at system boundaries (user input, external APIs).
- Do not introduce backwards-compatibility shims for code that is simply being
  changed or removed.
- Do not design for hypothetical future requirements.

**Rationale**: OWL tooling accrues complexity quickly. Keeping implementations
minimal ensures each layer remains auditable and testable at SNOMED CT scale.

### III. OWL Standards Compliance

The serializer MUST produce Protégé-compatible OWL Functional Syntax output.
Round-trip fidelity — parsing a file and re-serializing MUST preserve all ontology
semantics — is a first-class requirement.

Mandatory entity cluster ordering within an `Ontology(...)` block:

1. Prefix declarations
2. Declarations (all entities declared before any axiom)
3. Object Property clusters (annotations → hierarchy → characteristics)
4. Data Property clusters
5. Class clusters (annotations first, then logical axioms in order of equivalentClass axioms and subClassOf axioms)
6. Named Individual clusters
7. Complex GCI axioms
8. Property chains at the end

Any deviation from this ordering MUST be justified in the plan and covered by a
dedicated test asserting the new order.

**Rationale**: Clinicians and terminologists round-trip files through Protégé.
Output that violates Protégé's expected arrangement breaks their workflows even
if it is semantically equivalent.

### IV. Scale-Aware Architecture

The extension MUST remain responsive at SNOMED CT scale (50 000+ classes):

- Parsing ontologies above `ontograph.largeOntologyThreshold` (default 50 000
  classes) MUST execute in a Worker Thread; blocking the extension host is
  prohibited.
- The Java reasoner MUST auto-select ELK for ontologies above 5 000 classes
  and HermiT for smaller ones (both thresholds are configurable via settings).
- Any new feature that iterates over the class hierarchy MUST be benchmarked
  against `test-ontologies/anatomy.owl` before merging.

**Rationale**: The primary production target is SNOMED CT. Algorithms that are
acceptable at toy-ontology scale routinely become unusable at SNOMED CT scale.

### V. Security & Safety

All code MUST be free of OWASP Top 10 vulnerabilities. In particular:

- IRI abbreviation and prefix-map parsing MUST not be vulnerable to injection
  attacks through crafted ontology content.
- The JSON-RPC bridge to the Java process MUST validate message structure before
  forwarding.
- No secrets, API keys, or credentials may be hardcoded in any source file.
- Child-process spawning (Java JAR) MUST use argument arrays, never shell strings,
  to prevent command injection.

**Rationale**: Ontology files are shared artefacts that can be crafted by
adversaries. The extension runs with full extension-host privileges inside VS Code.

## Technical Stack Requirements

**Language/Runtime**: TypeScript 5+ (strict mode), Node.js (extension host,
LSP server, Worker Threads), Java 21+ (reasoner server).

**Build**: esbuild (6 bundles — see CLAUDE.md); `npm run build` for production.
Maven shade plugin for the fat JAR.

**Testing**: Vitest (`npm test`). Test files live alongside source under
`src/**/*.test.ts`. No separate `tests/` directory.

**Key Libraries**: OWLAPI 5 (Java), HermiT, ELK, Peggy (Manchester grammar),
VS Code Extension API.

**No new runtime dependencies** may be added without documenting the rationale
in the relevant plan.md and obtaining explicit user approval.

## Development Workflow

All work is tracked in the Conductor system (`conductor/tracks.md`,
per-track `plan.md` files). The plan is the source of truth.

**Task lifecycle**: Select → Mark in-progress (`[~]`) → Red (failing tests) →
Green (passing tests) → Refactor → Coverage check → Commit code → Attach git
note → Mark complete (`[x]` + commit SHA) → Commit plan update.

**Commit format**: `<type>(<scope>): <description>` where type is one of
`feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Conductor commits use
`conductor(plan):` scope.

**Phase completion**: After the final task of a phase, run the full test suite,
propose a manual verification plan, await explicit user confirmation, then create
a checkpoint commit with a git note containing the verification report.

**Quality gates** (all MUST pass before any task is complete):
- All tests pass
- New code coverage ≥ 80%
- No TypeScript type errors (`npm run compile`)
- No linting errors
- No security vulnerabilities introduced

## Governance

This constitution supersedes all other practices documented in the repository
when they conflict. Amendments require:

1. A written rationale explaining what principle is changing and why.
2. A version bump following semantic versioning:
   - **MAJOR**: principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR**: new principle or section; material expansion of existing guidance.
   - **PATCH**: clarifications, wording, or typographic fixes.
3. Propagation of changes to dependent templates (plan, spec, tasks) as needed,
   noted in the Sync Impact Report prepended to this file.

All pull requests and code reviews MUST verify compliance with the active
constitution version. Complexity that violates a principle MUST be recorded in
the plan's Complexity Tracking table with explicit justification.

Runtime development guidance: `conductor/workflow.md`.

**Version**: 1.0.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-14
