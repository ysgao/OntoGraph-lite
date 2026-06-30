# Tasks: Persist Entity Search Query

**Input**: Design documents from `specs/020-persist-search-query/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Source file**: All implementation changes are in `src/extension.ts` (single file).
**Test file**: `src/commands/searchEntity.test.ts` (new, TDD per constitution Principle IV).

**Organization**: Tasks are grouped by user story. US1 and US2 share the same mechanism (QuickPick re-open); US3 verifies the clear-state edge case.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Create test file and establish TDD baseline before any implementation.

- [x] T001 Create test file `src/commands/searchQueryState.test.ts` with five real failing assertions (module extracted to `src/commands/searchQueryState.ts` for testability); confirmed red phase

**Checkpoint**: Run `npm test -- src/commands/searchEntity.test.ts` and confirm all five tests fail (red phase).

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Add the `lastSearchQuery` state variable and the reset hook. All three user stories depend on this.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [x] T002 Create `src/commands/searchQueryState.ts` exporting `getSearchQuery`, `setSearchQuery`, `resetSearchQuery`; import into `src/extension.ts`
- [x] T003 Call `resetSearchQuery()` in `onLoadedCallback` in `src/extension.ts` (targeted reset on file load, not `setRefreshAllViews` broadcast)

**Checkpoint**: `npm run compile` passes. The variable exists and is reset on ontology change.

---

## Phase 3: User Story 1 — Search Persists Across Panel Close/Reopen (P1) 🎯 MVP

**Goal**: The QuickPick re-opens with the last search term pre-filled and results already shown.

**Independent Test**: Open the search QuickPick (`ontograph.searchEntity`), type a term, dismiss it, reopen it — the field shows the same term and results appear immediately without typing.

### Implementation for User Story 1

- [x] T004 [US1] Set `qp.value = getSearchQuery()` before `qp.show()` in `src/extension.ts` `ontograph.searchEntity` handler
- [x] T005 [US1] Call `runSearch(getSearchQuery())` after `qp.show()` when stored query is non-empty; extracted local `runSearch()` helper from inline handler
- [x] T006 [US1] Call `setSearchQuery(value)` inside `qp.onDidChangeValue` so every keystroke updates stored state

**Checkpoint**: T001 tests `query retained after typing` and `search auto-executes on open with stored query` now pass (green phase). Manually verify: open search, type "liver", dismiss, reopen — "liver" is shown with results.

---

## Phase 4: User Story 2 — Search Persists Across Panel Switches (P2)

**Goal**: Switching to another sidebar panel and returning to search leaves the query and results intact.

**Independent Test**: Enter a search query, click to the Classes panel, click back to invoke `ontograph.searchEntity` — query and results are unchanged.

### Implementation for User Story 2

- [x] T007 [US2] Verified: same mechanism as US1 covers panel-switch scenario; no additional code required

**Checkpoint**: No additional code. T001 passing tests from Phase 3 cover this story. Document manual verification result in a comment or commit message.

---

## Phase 5: User Story 3 — Cleared Search State Is Also Retained (P3)

**Goal**: If the user clears the field before closing, the panel reopens with an empty field (the empty state is persisted, not the prior term).

**Independent Test**: Type a query, clear the field (select all + delete), dismiss, reopen — field is empty.

### Implementation for User Story 3

- [x] T008 [US3] Verified: `setSearchQuery('')` fires via `onDidChangeValue` on clear; `empty string retained after clear` test passes

**Checkpoint**: T001 test `empty string retained after clear` passes. Manual verify: type "liver", clear field, dismiss, reopen — field is empty.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T009 [P] All 5 tests in `src/commands/searchQueryState.test.ts` pass; full test suite 471/471 pass
- [x] T010 `npm run compile` — zero TypeScript errors
- [ ] T011 Manual end-to-end validation with `test-ontologies/bfo-core.ofn`: load ontology, search "continuant", dismiss, reopen — "continuant" pre-filled with results; reload ontology, reopen — field empty

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (test stubs must exist before green phase)
- **Phase 3 (US1)**: Depends on Phase 2 (needs `lastSearchQuery` variable)
- **Phase 4 (US2)**: Depends on Phase 3 (verification of same mechanism)
- **Phase 5 (US3)**: Depends on Phase 3 (T006 must be in place)
- **Phase 6 (Polish)**: Depends on Phases 3–5

### User Story Dependencies

- **US1 (P1)**: Blocks US2 and US3 (both rely on the same mechanism)
- **US2 (P2)**: Independent of US3; no additional code
- **US3 (P3)**: Independent of US2; no additional code

---

## Parallel Example: Phase 3

```
# T004, T005, T006 must be sequential (same file, depend on each other):
T004 → T005 → T006

# T009 (test bodies) and T010 (compile check) can run in parallel:
T009 [P] | T010 [P]
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Create test file with failing stubs
2. Complete Phase 2: Add `lastSearchQuery` variable + reset hook
3. Complete Phase 3: Pre-populate + update on change + auto-search
4. **STOP and VALIDATE**: All US1 tests pass; manual QuickPick test confirms retention
5. US2 and US3 are verified (no additional code) and Polish completes

### Total Change Surface

- `src/extension.ts`: ~6 lines added (1 variable declaration, 1 reset, 1 value set, 1 conditional search call, 1 update in handler)
- `src/commands/searchEntity.test.ts`: new file (~80 lines)

---

## Notes

- This feature touches a single file (`src/extension.ts`) — no parallel file conflicts
- Constitution Principle IV: tests (T001) MUST fail before T004–T006 implementation
- `lastSearchQuery` is never written to disk — in-session only by design
- US2 and US3 require no code beyond what US1 adds; they are verification tasks only
