# Tasks: Open Workspace Folder with Ontology File

**Input**: Design documents from `specs/017-open-workspace-folder/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

**Tests**: TDD required per constitution (Principle IV). Test tasks are included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Setup

**Purpose**: No new project structure needed — single helper function added to existing file.

- [x] T001 Verify `vscode.workspace.updateWorkspaceFolders` is available in current engine version by checking `package.json` `engines.vscode` field

---

## Phase 2: Foundational

**Purpose**: No blocking prerequisites beyond the existing codebase. Phase 1 is sufficient.

*(No tasks — feature adds directly to `src/commands/loadOntologyFile.ts` with no cross-cutting infrastructure changes.)*

---

## Phase 3: User Story 1 — Open Ontology File Sets Workspace Folder (Priority: P1) 🎯 MVP

**Goal**: When a user loads an ontology file, its parent directory becomes the VS Code workspace folder so Source Control and file watchers point to the correct location.

**Independent Test**: Load an ontology file from a directory that is not the current workspace folder. Verify VS Code's Source Control panel shows the git status of the file's parent directory.

### Tests for User Story 1 ⚠️ TDD — write first, confirm failing before T005

- [x] T002 [P] [US1] Write unit test: no workspace → `updateWorkspaceFolders(0, 0, {uri: parentFolder})` called — in `src/commands/loadOntologyFile.test.ts`
- [x] T003 [P] [US1] Write unit test: file already inside workspace folder → `updateWorkspaceFolders` NOT called — in `src/commands/loadOntologyFile.test.ts`
- [x] T004 [P] [US1] Write unit test: file outside existing workspace → `updateWorkspaceFolders(1, 0, {uri: parentFolder})` called (append) — in `src/commands/loadOntologyFile.test.ts`
- [x] T005 [P] [US1] Write unit test: path prefix false-positive guard — `/foo/bar2` not contained by `/foo/bar` — in `src/commands/loadOntologyFile.test.ts`

**Red phase checkpoint**: Run `npm test -- src/commands/loadOntologyFile.test.ts` — all T002–T005 tests MUST FAIL before proceeding.

### Implementation for User Story 1

- [x] T006 [US1] Add `import * as path from 'path'` and implement `ensureWorkspaceFolderContains(fileUri: vscode.Uri): void` helper in `src/commands/loadOntologyFile.ts`
- [x] T007 [US1] Call `ensureWorkspaceFolderContains(uri)` after `uri` is resolved and before `withProgress` block in `loadOntologyFile` function — in `src/commands/loadOntologyFile.ts`
- [x] T008 [US1] Run `npm test -- src/commands/loadOntologyFile.test.ts` — all tests must pass

**Checkpoint**: User Story 1 is complete. `loadOntologyFile` now sets the workspace folder. Source Control automatically reflects the correct repository.

---

## Phase 4: User Story 2 — Source Control Reflects Ontology File Changes (Priority: P2)

**Goal**: After loading an ontology file, edits saved to disk appear as modified in VS Code Source Control.

**Independent Test**: Load an ontology file, make a change, save it. Source Control shows the file as modified without any manual folder navigation.

**Note**: User Story 2 is satisfied automatically by US1. No additional implementation is needed — once the workspace folder is correctly set, VS Code's built-in Source Control handles the rest. Tasks here cover type-check and build validation only.

- [x] T009 [US2] Run `npm run compile` — no TypeScript errors
- [x] T010 [US2] Run `npm run build` — no build errors; `dist/extension.js` updated

**Checkpoint**: All user stories complete and verified via type-check and build.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T011 [P] Manual smoke test: open VS Code with no folder, load `test-ontologies/animals.omn` via toolbar button, verify Explorer shows `test-ontologies/` and Source Control shows git status
- [ ] T012 [P] Manual smoke test: load `test-ontologies/bfo-core.ofn` (same folder as animals.omn) — workspace unchanged (no-op); no duplicate workspace root added
- [x] T013 Run full test suite `npm test` — no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 3 (US1)**: Depends on Phase 1 — write tests first (T002–T005), confirm failing, then implement (T006–T008)
- **Phase 4 (US2)**: Depends on Phase 3 completion — run type-check/build after implementation
- **Phase 5 (Polish)**: Depends on Phases 3 and 4 — manual smoke test after build passes

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 1 — no dependency on US2
- **User Story 2 (P2)**: Automatically satisfied by US1; only needs type-check/build confirmation

### Within User Story 1

- T002–T005 (test writing): all parallel, no ordering requirement
- Red phase check must confirm failure before T006
- T006 before T007 (function must exist before it is called)
- T008 after T007 (verify tests pass after implementation)

### Parallel Opportunities

- T002, T003, T004, T005 can all be written in parallel (same file, non-conflicting tests)
- T009 and T010 can run in parallel
- T011 and T012 can run in parallel

---

## Parallel Example: User Story 1 Tests

```bash
# Write all four tests in one pass (same file, all independent assertions):
Task: T002 — no workspace → calls updateWorkspaceFolders(0, 0, ...)
Task: T003 — already contained → does NOT call updateWorkspaceFolders
Task: T004 — outside workspace → calls updateWorkspaceFolders(1, 0, ...)
Task: T005 — false-positive guard for /foo/bar vs /foo/bar2
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Write and confirm failing tests: T002–T005
3. Implement: T006–T007
4. Verify tests pass: T008
5. **STOP and VALIDATE**: Source Control shows correct folder after file load
6. Proceed to Phase 4 (type-check/build) and Phase 5 (smoke test)

### Full Delivery

1. MVP path above
2. Phase 4: T009–T010
3. Phase 5: T011–T013

Total: 13 tasks. Single developer, estimated 1–2 hours.

---

## Notes

- `[P]` test tasks (T002–T005) can be written simultaneously; they target the same file but different `it()` blocks
- `vscode.workspace` must be mocked in tests (Vitest vi.mock or manual stub)
- `ensureWorkspaceFolderContains` is a pure function (no side effects beyond calling VS Code API) — straightforward to unit test
- File-watcher and `reloadOntology` paths require NO changes; workspace is set once during initial `loadOntologyFile`
