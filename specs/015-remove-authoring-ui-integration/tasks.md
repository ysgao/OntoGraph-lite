# Tasks: Remove Authoring-UI Integration — Standalone Extension

**Input**: Design documents from `specs/015-remove-authoring-ui-integration/`

**Branch**: `015-remove-authoring-ui-integration`

**Organization**: Tasks grouped by user story for independent implementation and testing.

---

## Phase 1: Setup

**Purpose**: No project initialization needed — changes are within an existing file.

- [x] T001 Confirm `updateGraphPanel` is not imported anywhere: `grep -rn "updateGraphPanel" src/`

---

## Phase 2: Foundational (Blocking Prerequisites)

No foundational blockers — changes are isolated to one function and one comment in one file.

---

## Phase 3: User Story 1 — Clean Integration Artifacts (Priority: P1) 🎯 MVP

**Goal**: Remove the two remaining artifacts in `src/commands/openVisualization.ts` that were added for OntoGraphEditor integration and are unused in the standalone extension.

**Independent Test**: `npm run compile` passes with no errors; `grep -rn "updateGraphPanel\|Nothing for now" src/` returns no results.

### Implementation for User Story 1

- [x] T002 [US1] Delete `updateGraphPanel()` export (lines 69-77) from `src/commands/openVisualization.ts`
- [x] T003 [US1] Replace `// Nothing for now — could reveal in tree` with `// intentional no-op` in `src/commands/openVisualization.ts:58`

**Checkpoint**: No integration artifacts remain. `grep -rn "updateGraphPanel\|Nothing for now\|ipcRoute\|fromIpc\|suppressNextSelection\|preserveFocus" src/` returns zero results.

---

## Phase 4: User Story 2 — No Regressions (Priority: P2)

**Goal**: Confirm all existing functionality works after removal. `updateGraphPanel` was unused, so no behaviour change is expected.

**Independent Test**: `npm run compile && npm test && npm run build` all pass cleanly.

### Implementation for User Story 2

- [x] T004 [US2] Run `npm run compile` — verify zero type errors
- [x] T005 [US2] Run `npm test` — verify all tests pass
- [x] T006 [US2] Run `npm run build` — verify clean build output in `dist/`

**Checkpoint**: All quality gates green. Extension ready for packaging.

---

## Phase 5: User Story 3 — No Orphaned Integration Code (Priority: P3)

**Goal**: Verify no other integration code referencing OntoGraphEditor remains in the codebase.

**Independent Test**: Targeted search returns zero results for any OntoGraphEditor-specific identifiers.

### Implementation for User Story 3

- [x] T007 [US3] Run broad integration search: `grep -rn "ipcRoute\|fromIpc\|suppressNextSelection\|extractSctid\|preserveFocus\|updateGraphPanel\|ontographEditor\|authoring-ui-vscode" src/` — confirm zero results

**Checkpoint**: Codebase is clean of all OntoGraphEditor integration identifiers.

---

## Phase 6: Polish

- [ ] T008 [P] Update `CHANGELOG.md` (or create if absent) with entry: standalone cleanup, removal of unused `updateGraphPanel` export

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately
- **Phase 2 (Foundational)**: N/A — no blockers
- **Phase 3 (US1)**: Can start after T001 confirms `updateGraphPanel` is unused
- **Phase 4 (US2)**: Depends on Phase 3 (T002, T003) complete
- **Phase 5 (US3)**: Depends on Phase 3 complete; can run in parallel with Phase 4
- **Phase 6 (Polish)**: After Phase 4 passes

### Parallel Opportunities

- T004, T005, T006 (compile/test/build) must run sequentially (each confirms the previous)
- T007 (Phase 5 search) can run in parallel with Phase 4 since it is read-only

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. T001 — confirm safe to remove
2. T002, T003 — remove artifacts
3. T004 — compile check
4. **STOP and VALIDATE** — extension is clean

### Full Delivery

1. T001 → T002, T003 → T004, T005, T006 → T007 → T008

---

## Notes

- Total tasks: 8
- US1 tasks: 2 (T002, T003) — both in same file, sequential
- US2 tasks: 3 (T004–T006) — sequential quality gates
- US3 tasks: 1 (T007) — read-only verification
- No tests requested in spec — no test tasks generated
- Suggested MVP scope: T001 → T002 → T003 → T004 (compile check)
