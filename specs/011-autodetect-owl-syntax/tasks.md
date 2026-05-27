# Tasks: Autodetect OWL Syntax for .owl Files

**Input**: Design documents from `/specs/011-autodetect-owl-syntax/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Required — TDD is non-negotiable per constitution Principle I.  
**Organization**: Tasks grouped by user story. Single-file change (`ParserRegistry.ts`) + new test file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Tests written FIRST, confirmed FAILING before implementation

---

## Phase 1: Setup

**Purpose**: Create test file with shared helpers; no project initialization needed (single-module change in an existing project).

- [x] T001 Create `src/parser/ParserRegistry.test.ts` with vitest imports, `readFileSync`/`join` imports, ROOT constant pointing to `test-ontologies/`, and a describe block scaffold for `detectOwlFormat` and `ParserRegistry.parse` test suites

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Structural changes to `ParserRegistry.ts` required before any user story tests can be written — return type expansion and dispatch arms must exist for TypeScript to accept the new test assertions.

**⚠️ CRITICAL**: Must be complete before Phase 3.

- [x] T002 In `src/parser/ParserRegistry.ts`, expand the private `detectOwlFormat` return type from `'functional' | 'owlxml' | 'rdfxml' | 'unknown'` to `'functional' | 'manchester' | 'owlxml' | 'rdfxml' | 'turtle' | 'unknown'`
- [x] T003 In `src/parser/ParserRegistry.ts`, add `'manchester'` and `'turtle'` dispatch arms to the `'owl-xml'` case in `ParserRegistry.parse` — both arms may throw `new Error('not yet implemented')` as stubs; they will be replaced in Phase 4

**Checkpoint**: `npm run compile` must pass with no type errors before Phase 3 begins

---

## Phase 3: User Story 1 — Functional Syntax .owl File (Priority: P1) 🎯 MVP

**Goal**: A `.owl` file containing OWL Functional Syntax loads correctly, even when `Ontology(` is preceded by `Prefix(` declarations.

**Independent Test**: Rename `test-ontologies/bfo-core.ofn` to `bfo-test.owl`; open in VS Code; class hierarchy populates without error.

### Tests for User Story 1 (RED — write first, confirm FAILING)

- [x] T004 [US1] In `src/parser/ParserRegistry.test.ts`, write failing unit tests for `detectOwlFormat` Functional Syntax detection: (a) pure `Ontology(<...>)` at start returns `'functional'`; (b) `Prefix(:=<...>)\nOntology(<...>)` returns `'functional'`; (c) many prefix lines before `Ontology(` (within 4 KB) returns `'functional'`; (d) content with UTF-8 BOM (U+FEFF) before prefix lines returns `'functional'`
- [x] T005 [US1] In `src/parser/ParserRegistry.test.ts`, write failing integration test: `ParserRegistry.parse` with `languageId='owl-xml'` and functional-syntax content returns a model with `sourceFormat === 'functional'` and non-empty `classes`; use `readFileSync` on `bfo-core.ofn`

### Implementation for User Story 1

- [x] T006 [US1] In `src/parser/ParserRegistry.ts`, replace the `detectOwlFormat` Functional Syntax branch: remove `t.startsWith('Prefix(') || t.startsWith('Ontology(')` and replace with `t.slice(0, 4096).includes('Ontology(')`, keeping BOM/whitespace stripping via existing `trimStart()`

**Checkpoint**: Run `npm test -- src/parser/ParserRegistry.test.ts`; all US1 tests pass. Rename `bfo-core.ofn` to `.owl`, open in VS Code — class hierarchy loads.

---

## Phase 4: User Story 2 — Manchester and Turtle .owl Files (Priority: P2)

**Goal**: `.owl` files containing Manchester Syntax or Turtle load correctly.

**Independent Test**: Rename `test-ontologies/animals.omn` to `animals-mcs.owl`; open in VS Code; rename `test-ontologies/animals.ttl` to `animals-ttl.owl`; open — both load without error.

### Tests for User Story 2 (RED — write first, confirm FAILING)

- [x] T007 [US2] In `src/parser/ParserRegistry.test.ts`, write failing unit tests for `detectOwlFormat` Manchester detection: (a) `Ontology:\n  Class: Animal` returns `'manchester'`; (b) `Prefix: owl: <...>\nOntology:` returns `'manchester'`; (c) content with `Ontology(` (Functional Syntax) does NOT return `'manchester'`
- [x] T008 [US2] In `src/parser/ParserRegistry.test.ts`, write failing unit tests for `detectOwlFormat` Turtle detection: (a) `@prefix owl: <...> .` returns `'turtle'`; (b) `@base <http://example.org/> .` returns `'turtle'`; (c) `PREFIX owl: <...>` returns `'turtle'`; (d) `BASE <http://example.org/>` returns `'turtle'`
- [x] T009 [US2] In `src/parser/ParserRegistry.test.ts`, write failing integration tests: `ParserRegistry.parse` with `languageId='owl-xml'` on Manchester content from `animals.omn` returns model with `sourceFormat === 'manchester'`; same for Turtle content from `animals.ttl` with `sourceFormat === 'turtle'`

### Implementation for User Story 2

- [x] T010 [US2] In `src/parser/ParserRegistry.ts`, implement Manchester detection in `detectOwlFormat`: after the Functional Syntax check, add `if (t.slice(0, 2048).includes('Ontology:')) { return 'manchester'; }`
- [x] T011 [US2] In `src/parser/ParserRegistry.ts`, implement Turtle detection in `detectOwlFormat`: add `if (/(?:@prefix|@base|PREFIX\s|BASE\s)/.test(t.slice(0, 1024))) { return 'turtle'; }`
- [x] T012 [US2] In `src/parser/ParserRegistry.ts`, replace the stub `'manchester'` and `'turtle'` dispatch arms (from T003) with real parser calls: `ManchesterParser` for `'manchester'` with `sourceFormat = 'manchester'`; `TurtleParser` for `'turtle'` with `sourceFormat = 'turtle'`

**Checkpoint**: Run `npm test -- src/parser/ParserRegistry.test.ts`; all US2 tests pass. Manual verification: Manchester and Turtle `.owl` files open in VS Code.

---

## Phase 5: User Story 3 — Clear Error for Unrecognisable .owl File (Priority: P3)

**Goal**: A `.owl` file with unrecognised content produces a clear, named error rather than a cryptic failure.

**Independent Test**: Rename a plain-text file to `.owl`; open in VS Code; error notification appears naming the file.

### Tests for User Story 3 (RED — write first, confirm FAILING)

- [x] T013 [US3] In `src/parser/ParserRegistry.test.ts`, write failing tests: (a) `detectOwlFormat('{ "json": true }')` returns `'unknown'`; (b) `detectOwlFormat('')` returns `'unknown'`; (c) `ParserRegistry.parse` with `languageId='owl-xml'` on unknown content throws `Error` whose message includes the file URI string

### Implementation for User Story 3

- [x] T014 [US3] In `src/parser/ParserRegistry.ts`, verify the existing `throw new Error(`Could not detect OWL serialisation format for: ${uri}`)` in the `'owl-xml'` case satisfies the test — if message format passes T013(c), no code change needed; otherwise update the message to include the URI clearly

**Checkpoint**: Run `npm test -- src/parser/ParserRegistry.test.ts`; all US3 tests pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression coverage for existing `.owl` files; full type check and test suite.

- [x] T015 [P] In `src/parser/ParserRegistry.test.ts`, write regression tests reading from disk: `pizza.owl` parsed with `languageId='owl-xml'` produces a model (RDF/XML path); `animals.owx` parsed with `languageId='owl-xml'` produces a model (OWL/XML path); both must have non-empty `classes`
- [x] T016 Run `npm test` — full test suite passes with zero regressions; coverage on `src/parser/ParserRegistry.ts` ≥ 80%
- [x] T017 Run `npm run compile` — no TypeScript type errors across the entire project

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 — no dependency on US2/US3
- **Phase 4 (US2)**: Depends on Phase 2 — no dependency on US1/US3
- **Phase 5 (US3)**: Depends on Phase 2 — no dependency on US1/US2
- **Phase 6 (Polish)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Foundational complete → independent
- **US2 (P2)**: Foundational complete → independent of US1
- **US3 (P3)**: Foundational complete → independent of US1/US2

### Within Each User Story

- Tests (T004–T005, T007–T009, T013) MUST be written and confirmed FAILING before implementation tasks
- Implementation tasks within a story are sequential (single function in one file)

### Parallel Opportunities

- Phase 3 (US1), Phase 4 (US2), and Phase 5 (US3) can be implemented in parallel once Phase 2 is complete — they modify the same file but different branches of the function, requiring careful merge if run concurrently; sequential is safer
- T015 (regression tests) is marked [P] — can be written concurrently with T016/T017 since it targets the same test file and does not depend on T016/T017

---

## Parallel Example: Phase 3 (US1)

```text
# RED phase — write both failing tests before any implementation:
T004: detectOwlFormat unit tests (Functional Syntax variants)
T005: ParserRegistry.parse integration test (bfo-core.ofn via owl-xml languageId)

# GREEN phase — single implementation task:
T006: Fix detectOwlFormat Functional Syntax branch
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T003) — compile check
3. Complete Phase 3: US1 (T004–T006)
4. **STOP AND VALIDATE**: `bfo-core.ofn` renamed to `.owl` opens in VS Code ✓
5. This is the highest-value fix — ships the P1 bug fix immediately

### Incremental Delivery

1. Phase 1 + Phase 2 → Structural changes in place
2. Phase 3 (US1) → Functional Syntax `.owl` files work (MVP)
3. Phase 4 (US2) → Manchester + Turtle `.owl` files work
4. Phase 5 (US3) → Error message for unrecognisable files
5. Phase 6 (Polish) → Full regression suite + type check

---

## Notes

- All test tasks must produce FAILING tests before implementation begins (Red-Green-Refactor)
- Single file modified: `src/parser/ParserRegistry.ts`; single new test file: `src/parser/ParserRegistry.test.ts`
- `parserWorker.ts` requires no changes — it delegates to `ParserRegistry.parse` which gets the fix automatically
- `extension.ts` requires no changes — `.owl` → `languageId='owl-xml'` via VS Code language contribution is correct; fix is in the dispatch layer
- No new runtime dependencies introduced
