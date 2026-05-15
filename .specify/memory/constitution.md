<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump type: MINOR — new "Testing Standards" section added with materially expanded
  test-framework guidance; Technical Stack Requirements updated accordingly.

Modified principles:
  Technical Stack Requirements — Testing line expanded; detailed guidance moved to
    the new Testing Standards section.

Added sections:
  - Testing Standards (test runner, file placement, import style, VS Code mocking,
    test categories, benchmark pattern, coverage enforcement)

Removed sections:
  - None

Templates reviewed:
  ✅ .specify/templates/plan-template.md  — "Testing" field in Technical Context
       block now has a concrete example value to use (Vitest); no structural change
       needed.
  ✅ .specify/templates/spec-template.md  — Acceptance Scenarios structure unchanged;
       no update needed.
  ✅ .specify/templates/tasks-template.md — Test task examples are framework-neutral;
       no update needed.

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

**Testing**: Vitest 1.6.0 (`npm test` / `npm run test:watch`). See the
[Testing Standards](#testing-standards) section for file placement, mocking
conventions, and test categories.

**Key Libraries**: OWLAPI 5 (Java), HermiT, ELK, Peggy (Manchester grammar),
VS Code Extension API.

**No new runtime dependencies** may be added without documenting the rationale
in the relevant plan.md and obtaining explicit user approval.

## Testing Standards

### Runner

**Vitest 1.6.0** is the sole test runner. Commands:

```
npm test            # single run (CI)
npm run test:watch  # watch mode (development)
```

No `jest`, `mocha`, or other runners MUST be added.

### File Placement

Test files MUST follow one of two co-location patterns, chosen consistently
within a module:

1. **Alongside source** (preferred for single-file modules):
   `src/<module>/Foo.test.ts` next to `src/<module>/Foo.ts`.
2. **`__tests__` subdirectory** (acceptable when a module has multiple related
   test files): `src/<module>/__tests__/Foo.test.ts`.

There is NO top-level `tests/` directory. All test files live under `src/`.

### Import Style

Always use named imports from `'vitest'`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

Do not use globals (`test`, `expect` without imports) or the `@vitest/globals`
package.

### Mocking VS Code APIs

Tests MUST NOT start a real VS Code extension host. The `vscode` module is
mocked with a hand-rolled stub:

```typescript
const { mockReplace, mockApplyEdit } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockApplyEdit: vi.fn().mockResolvedValue(true),
}));

vi.mock('vscode', () => ({
  Range: vi.fn((s1, c1, s2, c2) => ({
    start: { line: s1, character: c1 },
    end: { line: s2, character: c2 },
  })),
  Position: vi.fn((l, c) => ({ line: l, character: c })),
  WorkspaceEdit: vi.fn(() => ({ replace: mockReplace })),
  workspace: { applyEdit: mockApplyEdit },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockApplyEdit.mockResolvedValue(true);
});
```

Rules:
- `vi.hoisted()` MUST be used when mock factory closures need to reference
  variables declared in module scope (avoids temporal dead zone errors).
- `vi.clearAllMocks()` MUST be called in `beforeEach` whenever `vi.fn()` mocks
  are defined at module scope.
- Stub only the VS Code surface area the code under test actually uses — do not
  copy a full vscode stub that the module doesn't need.

### Test Categories

| Category | When to write | Pattern |
|----------|---------------|---------|
| **Unit** | Pure TypeScript functions (parsers, serializer, model) | Read fixture files from `test-ontologies/`; no mocking required |
| **Integration** | Code that calls VS Code APIs (sync layer, commands) | Mock `vscode` module as above; supply document content as inline strings |
| **Benchmark** | Any path touching the class hierarchy (Principle IV) | Load `test-ontologies/anatomy.owl`; skip gracefully if absent |

### Benchmark Pattern

Benchmark tests MUST:

1. Check for `anatomy.owl` existence and call `describe.skip` if absent, so CI
   is not broken on machines without the large file.
2. Assert wall-clock time is below an explicit threshold (e.g., `< 1000 ms`).
3. Use a no-op fixture (model matches file) so `applyEdit` is never reached and
   timing captures only the scan path.

### Coverage

Coverage threshold: **>80% for all new code** (Principle I). Coverage is verified
by running `npm test` — no separate coverage command is needed; the threshold is
enforced per-run.

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

**Version**: 1.1.0 | **Ratified**: 2026-05-14 | **Last Amended**: 2026-05-15
