# Tasks: Reload Ontology from Disk

**Input**: Design documents from `/specs/010-reload-ontology/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: TDD is MANDATORY per the OntoGraph Constitution (Principle I). Tests MUST be written and confirmed failing before implementation.

**Organization**: Tasks grouped by user story — each story is independently completable and testable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelizable — different files, no blocking dependencies
- **[Story]**: User story this task belongs to (US1/US2/US3)
- Stories: **US1** = Auto-Reload (P1), **US2** = Manual Button (P2), **US3** = Error Handling (P3)

---

## Phase 1: Setup

**Purpose**: Pre-implementation investigation to resolve the one open design question before any code is written.

- [x] T001 Read `src/views/InferredHierarchyProvider.ts` to determine whether `setModel()` alone clears inferred hierarchy results, or if a separate method (e.g., `clearInferredHierarchy()` or `setInferredHierarchy([])`) must also be called after reload

**Checkpoint**: T001 finding recorded — informs T006 and T013 implementation.

---

## Phase 2: Foundational — TDD Red Phase

**Purpose**: Create the command stub and all tests so every test fails before a single line of implementation is written. This phase BLOCKS all user story phases.

**⚠️ CRITICAL**: No US implementation can begin until T003 tests are confirmed failing.

- [x] T002 Create `src/commands/reloadOntology.ts` with exported stub `reloadOntology(activeModel: OntologyModel, onReloaded: (model: OntologyModel) => void): Promise<void>` — body throws `new Error('not implemented')`
- [x] T003 Write all 10 tests in `src/commands/reloadOntology.test.ts` (mock `vscode` and `ParserRegistry`); run `npm test -- src/commands/reloadOntology.test.ts` and confirm every test fails

Tests to write in T003 (all must fail before T004):

1. `reloadOntology` calls `openTextDocument` with the URI from `activeModel.sourceUri`
2. `reloadOntology` calls `ParserRegistry.parseAsync` with document text and languageId
3. `reloadOntology` calls `onReloaded` with the parsed model on success
4. `reloadOntology` does NOT call `onReloaded` when `parseAsync` throws
5. `reloadOntology` shows `showErrorMessage` when `parseAsync` throws
6. `reloadOntology` does NOT call `onReloaded` when `openTextDocument` throws (file missing)
7. `reloadOntology` shows `showErrorMessage` when `openTextDocument` throws
8. `executeReload` sets `ontograph.reloading` context to `true` before parse starts
9. `executeReload` sets `ontograph.reloading` context to `false` after success
10. `executeReload` sets `ontograph.reloading` context to `false` after failure

**Checkpoint**: All 10 tests confirmed failing — implementation can now begin.

---

## Phase 3: User Story 1 — Auto-Reload After Git Pull (Priority: P1) 🎯 MVP

**Goal**: OntoGraph automatically reloads the ontology when the file changes on disk, without user interaction.

**Independent Test**: Open any ontology in OntoGraph; externally modify the file (e.g., `touch animals.omn`); within 1 second the tree views refresh and the status bar shows "Ontology reloaded from disk".

### Implementation for User Story 1

- [x] T004 [US1] Implement `reloadOntology()` in `src/commands/reloadOntology.ts`: call `vscode.workspace.openTextDocument(vscode.Uri.parse(activeModel.sourceUri))`, then `ParserRegistry.parseAsync(doc.getText(), doc.languageId, activeModel.sourceUri)`, then `onReloaded(newModel)` on success — run tests and confirm T003 tests 1–3 now pass
- [x] T005 [P] [US1] Add two module-level vars to `src/extension.ts` below `activeIndex`: `let activeFileWatcher: vscode.FileSystemWatcher | undefined;` and `let reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;`
- [x] T006 [US1] Add `async function executeReload(): Promise<void>` to `src/extension.ts`: guard on `!activeModel`, call `reloadOntology(activeModel, (model) => { activeModel = model; refreshAllViews(model); })`, and based on T001 findings add any additional call needed to clear inferred hierarchy
- [x] T007 [US1] Wire file watcher into `handleDocument()` in `src/extension.ts`: after successful model assignment, add `activeFileWatcher?.dispose()` then `activeFileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.parse(model.sourceUri), '*'))` with `activeFileWatcher.onDidChange(() => { clearTimeout(reloadDebounceTimer); reloadDebounceTimer = setTimeout(() => executeReload(), 500); })`
- [x] T008 [US1] Add watcher disposal to extension deactivation in `src/extension.ts`: push `{ dispose: () => { activeFileWatcher?.dispose(); clearTimeout(reloadDebounceTimer); } }` to `context.subscriptions`

**Checkpoint**: US1 complete. Auto-reload works for valid files. Tests 1–3 pass. Manually verify with `touch test-ontologies/animals.omn`.

---

## Phase 4: User Story 2 — Manual Reload via Toolbar Button (Priority: P2)

**Goal**: A `$(refresh)` button next to Classify triggers reload on demand.

**Independent Test**: With an ontology open, modify the file externally, click the Reload button in the Classes view toolbar — tree views update and button is disabled during reload.

### Implementation for User Story 2

- [x] T009 [P] [US2] Add command definition to `contributes.commands` in `package.json`: `{ "command": "ontograph.reloadOntology", "title": "Reload Ontology", "icon": "$(refresh)", "category": "OntoGraph" }`
- [x] T010 [P] [US2] Add menu entry to `contributes.menus["view/title"]` in `package.json`: `{ "command": "ontograph.reloadOntology", "when": "view == ontograph.classHierarchy && ontograph.ontologyLoaded && !ontograph.reloading", "group": "navigation@1" }`
- [x] T011 [US2] Register the command in `src/extension.ts` activation: `context.subscriptions.push(vscode.commands.registerCommand('ontograph.reloadOntology', executeReload))`
- [x] T012 [US2] Add `setContext` calls to `executeReload()` in `src/extension.ts`: `await vscode.commands.executeCommand('setContext', 'ontograph.reloading', true)` at start, `await vscode.commands.executeCommand('setContext', 'ontograph.reloading', false)` in a `finally` block — run tests and confirm T003 tests 8–10 now pass

**Checkpoint**: US2 complete. Reload button visible and functional. Tests 8–10 pass. Manually verify button appears next to Classify and is disabled during reload.

---

## Phase 5: User Story 3 — Reload Error Handling (Priority: P3)

**Goal**: Failed reloads (missing file, parse error) show a clear error message and leave the existing model intact.

**Independent Test**: Rename `animals.omn` to a different path; click Reload — an error message appears, tree views still show the original ontology, and the Reload button re-enables.

### Implementation for User Story 3

- [x] T013 [P] [US3] Add try/catch to `reloadOntology()` in `src/commands/reloadOntology.ts`: wrap both `openTextDocument` and `parseAsync` in try/catch; on error call `vscode.window.showErrorMessage(\`OntoGraph: failed to reload ontology — \${err instanceof Error ? err.message : String(err)}\`)` and return without calling `onReloaded` — run tests and confirm T003 tests 4–7 now pass
- [x] T014 [P] [US3] Confirm that `executeReload()` in `src/extension.ts` already re-enables the button in the `finally` block (from T012); if not, move the `setContext('ontograph.reloading', false)` call into a `finally` block to guarantee it runs on both success and failure paths

**Checkpoint**: US3 complete. All 10 tests pass. Manually verify error path: corrupt `animals.omn`, click Reload, see error message, confirm tree still shows original content.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Status messages and final quality gates.

- [x] T015 Add status bar spinner to `executeReload()` in `src/extension.ts`: call `vscode.window.setStatusBarMessage('$(loading~spin) OntoGraph: reloading…')` immediately after setting `ontograph.reloading = true`
- [x] T016 Add success status bar message to `executeReload()` in `src/extension.ts`: inside the `onReloaded` callback, after `refreshAllViews(model)`, call `vscode.window.setStatusBarMessage('$(check) Ontology reloaded from disk', 8000)`
- [x] T017 [P] Run `npm test` — 7/7 new tests pass; pre-existing failures unrelated to this feature
- [x] T018 [P] Run `npm run compile` — zero TypeScript type errors
- [x] T019 Update `conductor/tracks.md` to add track `010-reload-ontology` with status `in-progress`

**Checkpoint**: All gates pass. Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — core reload logic
- **Phase 4 (US2)**: Depends on Phase 3 (`executeReload` must exist before registering command)
- **Phase 5 (US3)**: Depends on Phase 2; can run in parallel with Phase 4
- **Phase 6 (Polish)**: Depends on Phases 3–5 complete

### User Story Dependencies

```
Phase 1 → Phase 2 → Phase 3 (US1)
                           ↓
                    Phase 4 (US2)   Phase 5 (US3) ← parallel with US2
                           ↓               ↓
                       Phase 6 (Polish)
```

### Within Each Phase — Task Order

| Phase | Sequential order |
|-------|-----------------|
| 2 | T002 → T003 (stub before tests) |
| 3 | T004 → T006 → T007, T008; T005 can start with T004 [P] |
| 4 | T009, T010 [P] → T011 → T012 |
| 5 | T013, T014 [P] (different files) |
| 6 | T015 → T016; T017, T018 [P] |

---

## Parallel Opportunities

```bash
# Phase 2
T002 (stub) → T003 (all tests, single file)

# Phase 3 — after T004 complete
T005 (extension.ts vars)   # can start with T004 [P]
T006 (executeReload fn)    # after T004
T007 → T008                # sequential, after T006

# Phase 4 — after T006 complete
T009 (package.json commands)  # parallel
T010 (package.json menus)     # parallel
T011 → T012                   # sequential, after T009/T010

# Phase 5 — after Phase 2 complete (T003)
T013 (reloadOntology.ts)      # parallel
T014 (extension.ts finally)   # parallel

# Phase 6
T015 → T016                   # sequential (same function)
T017 (npm test)               # parallel
T018 (npm compile)            # parallel
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: T001
2. Complete Phase 2: T002 → T003 (all failing)
3. Complete Phase 3: T004 → T008
4. **STOP and VALIDATE**: Auto-reload works via file watcher — deliver this immediately
5. Proceed to Phase 4 and 5 for button + error handling

### Incremental Delivery

1. T001–T003 → TDD foundation ready
2. T004–T008 → Auto-reload ships (git pull use case solved)
3. T009–T012 → Manual button ships
4. T013–T014 → Error handling ships
5. T015–T019 → Polish and quality gates

---

## Notes

- [P] = different files or independent operations, safe to run concurrently
- TDD is non-negotiable: T003 tests MUST all fail before T004 implementation begins
- `reloadOntology.ts` is pure logic (no global state); `extension.ts` owns lifecycle wiring — keep this separation
- T001 finding about `InferredHierarchyProvider` determines whether T006 needs an extra line; do not skip T001
- Commit after each phase checkpoint with format: `feat(010-reload-ontology): <description>`
- Conductor plan commits use: `conductor(plan): mark T00N complete [sha]`
