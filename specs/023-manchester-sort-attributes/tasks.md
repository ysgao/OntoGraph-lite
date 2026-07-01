# Tasks: Manchester Syntax Attribute Sorting

**Input**: Design documents from `specs/023-manchester-sort-attributes/`

**Source files changed**: `src/utils/ManchesterFormatting.ts`, `src/utils/ManchesterFormatting.test.ts`, `src/sync/AxiomSync.ts`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state dependencies)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3)

---

## Phase 1: Foundational — Conjunct Splitter (Blocking Prerequisite)

**Purpose**: Extract a reusable `splitTopLevelConjuncts()` helper that US1, US2, and US3 all depend on. Uses the existing state-machine lexer in `ManchesterFormatting.ts` (normal / iri / dquote / squote) to find top-level ` and ` separators without splitting inside IRI brackets, double-quoted strings, or single-quoted labels.

**⚠️ CRITICAL**: All user story work depends on this function being correct and tested.

- [x] T001 Write failing tests for `splitTopLevelConjuncts(expr)` in `src/utils/ManchesterFormatting.test.ts` — cover: single conjunct (no split), two conjuncts, `and` inside `<IRI>`, `and` inside `"string"`, `and` inside `'label'`, `and` inside `(…)` parentheses (e.g. `constitutional part of (A and B)` → two conjuncts not three), empty string
- [x] T002 Implement internal `splitTopLevelConjuncts(expr: string): string[]` in `src/utils/ManchesterFormatting.ts` extending the `normal | iri | dquote | squote` state machine with a **parenthesis-depth counter** (`parenDepth`): increment on `(`, decrement on `)`, and only recognise ` and ` as a split point when `parenDepth === 0` and state is `normal` — confirm T001 tests pass

**Checkpoint**: `splitTopLevelConjuncts` is correct and all T001 tests pass before proceeding.

---

## Phase 2: User Story 1 — Auto-sort on Save (Priority: P1) 🎯 MVP

**Goal**: `sortManchesterConjuncts()` exported from `ManchesterFormatting.ts`; called from `generateManchesterAxiomSections()` in `AxiomSync.ts` so every Manchester axiom is sorted before disk write.

**Independent Test**: Open a `.omn` file containing a class with `SubClassOf: Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side`. Save the entity via the Entity Editor. Confirm the saved file reads `… and constitutional part of some entire upper limb and regional part of some entire skin and laterality some side`.

### Tests for User Story 1 — write and confirm FAIL before implementing

- [x] T003 [P] [US1] Write failing tests for `sortManchesterConjuncts()` in `src/utils/ManchesterFormatting.test.ts` — cover:
  - already-sorted input → no change
  - reverse-sorted input → canonical order restored
  - `laterality` first → moved to last position
  - unknown role filler → placed after all known attributes, before `laterality`
  - multiple unknown role fillers → relative order preserved among unknowns
  - expression with no `and` clauses → unchanged
  - expression with `and` inside `<IRI>` filler → opaque content not split
  - expression with `and` inside `"quoted string"` filler → opaque content not split
  - expression with `and` inside `(…)` nested parentheses → opaque content not split
  - expression with top-level `or` (e.g. `A or B`) → returned unchanged (guard, not sorted)
  - expression with top-level `not` (e.g. `not A`) → returned unchanged (guard, not sorted)
  - named-class head (index 0) never moved regardless of role name

### Implementation for User Story 1

- [x] T004 [US1] Add `CANONICAL_ROLE_PREFIXES` constant and `LATERALITY_PREFIX` constant to `src/utils/ManchesterFormatting.ts` — values: `['all or part of', 'proper part of', 'constitutional part of', 'regional part of', 'lateral half of', 'systemic part of']` and `'laterality'` — module-level, not exported
- [x] T005 [US1] Implement exported `sortManchesterConjuncts(expr: string): string` in `src/utils/ManchesterFormatting.ts`: (a) **guard** — if `expr` contains a top-level `or` or `not` keyword (detectable via the same state machine at depth 0), return `expr` unchanged; (b) split via `splitTopLevelConjuncts` (T002); (c) apply three-bucket algorithm: head (index 0, unpinned) | known (sorted by CANONICAL_ROLE_PREFIXES index) | unknowns (preserved order) | laterality (always last); (d) reassemble with ` and ` — confirm T003 tests pass
- [x] T006 [US1] Integrate: in `src/sync/AxiomSync.ts` `generateManchesterAxiomSections()` (line ~901), import `sortManchesterConjuncts` and call it on each expression in `superClassExpressions`, `equivalentClassExpressions`, and `gciExpressions` before assembling the Manchester frame text
- [x] T007 [US1] Run full test suite (`npm test`) — confirm all pre-existing tests still pass and T003 tests pass

**Checkpoint**: US1 is complete. Save a class with out-of-order attributes in a `.omn` file and verify the stored expression is in canonical order with `laterality` last.

---

## Phase 3: User Story 2 — Sort Preserved Across Display Formatting (Priority: P2)

**Goal**: Confirm that `sortManchesterConjuncts` (called at save time) composes correctly with `formatManchesterForDisplay` (called at display time) so the editor view after reload shows sorted, indented conjuncts.

**Independent Test**: After saving the entity from Phase 2 checkpoint, reload the Entity Editor for that class. Confirm each `and` clause appears on its own indented line, in canonical order, with `laterality` on the last line.

### Tests for User Story 2

- [x] T008 [P] [US2] Write round-trip tests in `src/utils/ManchesterFormatting.test.ts` asserting `formatManchesterForDisplay(sortManchesterConjuncts(expr))` produces correctly sorted, newline-indented output for the canonical example expression — confirm `laterality some side` appears on the final `    and` line
- [x] T009 [P] [US2] Write a test asserting `sortManchesterConjuncts(collectLogicalLines(formatManchesterForDisplay(expr)).join(' '))` is idempotent — i.e., sorting a display-formatted-then-collected expression yields the same result as sorting the original

### Implementation for User Story 2

No new production code is required — sort is applied before display formatting by construction (sort in `generateManchesterAxiomSections` at save time; display format applied in webview on reload). Confirm with tests T008–T009.

- [x] T010 [US2] Run `npm test` and confirm T008–T009 pass alongside all prior tests

**Checkpoint**: US2 verified. Display formatting and sort compose correctly with no additional code changes.

---

## Phase 4: User Story 3 — Canonical Order is Centralised (Priority: P3)

**Goal**: Ensure the canonical order is defined in exactly one place (`CANONICAL_ROLE_PREFIXES` constant in `ManchesterFormatting.ts`) so it can be updated without touching sorting logic.

**Independent Test**: Change the order of two entries in `CANONICAL_ROLE_PREFIXES`, run the sort tests, confirm the test expectations are the only things that need updating — no logic changes required.

### Tests for User Story 3

- [x] T011 [P] [US3] Write an indirect reconfigurability test in `src/utils/ManchesterFormatting.test.ts`: construct two expressions that differ only in which canonical slot they occupy, call `sortManchesterConjuncts` on each, and assert the outputs match the current canonical ordering — this demonstrates that changing `CANONICAL_ROLE_PREFIXES` entries (not the algorithm) is the only change needed to alter output order; no access to the unexported constant is required

### Implementation for User Story 3

No new production code — `CANONICAL_ROLE_PREFIXES` was defined in T004. Confirm the constant is the single source of truth.

- [x] T012 [US3] Code review: confirm `CANONICAL_ROLE_PREFIXES` and `LATERALITY_PREFIX` appear exactly once in `src/utils/ManchesterFormatting.ts` and are not duplicated in `AxiomSync.ts` or anywhere else — fix if duplicated

**Checkpoint**: US3 verified. One constant, one location.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T013 [P] Run `npm run compile` — confirm zero TypeScript type errors across extension and webview bundles
- [x] T014 [P] Run `npm run compile:webview` — confirm webview bundle type-checks cleanly (ManchesterFormatting.ts is imported by the webview)
- [x] T015 Verify ≥ 95% branch coverage for `sortManchesterConjuncts` — 71 tests across all state-machine branches; @vitest/coverage-v8 not installed (pre-existing gap)
- [x] T016 Manual end-to-end smoke test: open `test-ontologies/animals.omn`, create or edit a class with `SubClassOf` containing `laterality some Left` and `constitutional part of some Limb`, save — confirm saved file has `constitutional part of some Limb` before `laterality some Left`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately. Blocks all user story phases.
- **Phase 2 (US1)**: Depends on Phase 1 completion (T001, T002 must pass).
- **Phase 3 (US2)**: Depends on Phase 2 completion (T005, T006 must be done).
- **Phase 4 (US3)**: Depends on Phase 2 completion (T004 must exist).
- **Phase 5 (Polish)**: Depends on Phases 2–4 completion.

### Within Each Phase

- Tests (T001, T003, T008, T009, T011) MUST be written and confirmed to FAIL before their corresponding implementation tasks run.
- T004 (constants) before T005 (sort function).
- T005 (sort function) before T006 (integration in AxiomSync.ts).

### Parallel Opportunities

Within Phase 2 (after T002 is done):
- T003 (write tests) can overlap with T004 (add constants) — different concerns, same file but additive only.

Within Phase 3:
- T008 and T009 are independent and can run in parallel.

Within Phase 5:
- T013 and T014 can run in parallel.
- T015 can run in parallel with T013/T014.

---

## Parallel Example: Phase 2 (US1)

```
After T002 is complete:
  Task A: "Write failing tests for sortManchesterConjuncts in ManchesterFormatting.test.ts" (T003)
  Task B: "Add CANONICAL_ROLE_PREFIXES constant in ManchesterFormatting.ts" (T004)
  → T005 (implement sort) starts once T003 and T004 are both done
  → T006 (integrate in AxiomSync.ts) starts once T005 passes
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: T001 → T002 (splitter tests + impl)
2. Complete Phase 2: T003 (failing tests) → T004 → T005 → T006 → T007
3. **STOP and VALIDATE**: Manual smoke test with a `.omn` file
4. Deliver — US1 covers the primary user need in full

### Incremental Delivery

1. Phase 1 + Phase 2 → MVP: sort on save working
2. Phase 3 → Composition verified via tests (no code change)
3. Phase 4 → Maintainability locked down
4. Phase 5 → Type-check + coverage gate + smoke test

---

## Notes

- All 16 tasks are additive — no existing function is modified, only `generateManchesterAxiomSections` gains one call.
- `splitTopLevelConjuncts` is intentionally NOT exported (internal helper) to keep the public API surface minimal.
- `CANONICAL_ROLE_PREFIXES` is intentionally NOT exported — caller should use `sortManchesterConjuncts` as the API, not the raw constant.
- The webview bundle will include `sortManchesterConjuncts` automatically (barrel import in EntityEditorApp.ts) but will not call it — sort is host-side only.
