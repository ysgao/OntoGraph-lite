# Tasks: Load Large Ontology Files

**Input**: Design documents from `/specs/012-load-large-ontology/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included per constitution Section I (Test-First, NON-NEGOTIABLE). Each test task must FAIL before its implementation task begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete task dependency)
- **[Story]**: User story from spec.md
- Exact file paths in all descriptions

---

## Phase 1: Setup

No new project infrastructure needed — existing VS Code extension. Skip to Phase 3.

---

## Phase 2: Foundational (Blocking Prerequisites)

No cross-cutting prerequisites blocking all stories. US2/US3/US4 each depend only on US1 completing. Proceed directly to Phase 3.

---

## Phase 3: User Story 1 — Load via Toolbar Button or Command (Priority: P1) 🎯 MVP

**Goal**: User can load any-sized ontology from a file picker via toolbar button or Command Palette; all panels populate.

**Independent Test**: Command Palette → "OntoGraph: Load Ontology File…" → select `test-ontologies/bfo-core.ofn` → class hierarchy populates with correct class count; no editor tab opened for the file. Toolbar icon visible in both Classes Hierarchy and Inferred Hierarchy panel toolbars.

### Tests for User Story 1

> **Write tests FIRST. Run `npm test` and confirm they FAIL before T003.**

- [x] T001 [P] [US1] Write failing unit tests for `loadOntologyFile` — file picker invoked with `.owl,.ofn,.omn,.ttl,.owx,.n3` filter; `workspace.fs.readFile` called on selected URI; `TextDecoder` produces string passed to `parseAsync`; `onLoaded` called with returned model; silent return when picker is cancelled (no selection); `isLoading` guard: second concurrent invocation shows `"OntoGraph: a load is already in progress."` info message and returns without calling `parseAsync`; undetectable format shows error naming file; unreadable file shows error with OS message — in `src/commands/loadOntologyFile.test.ts`
- [x] T002 [P] [US1] Write failing unit test asserting `vscode.window.withProgress` called with `location: ProgressLocation.Notification` and title containing the filename during a load — in `src/commands/loadOntologyFile.test.ts`

### Implementation for User Story 1

- [x] T003 [US1] Implement `loadOntologyFile(onLoaded: (model: OntologyModel) => void, prefillUri?: vscode.Uri): Promise<void>` in `src/commands/loadOntologyFile.ts`: if `isLoading` show info message and return; set `isLoading = true`; show file picker filtered to `{ "Ontology Files": ["owl","ofn","omn","ttl","owx","n3"] }` (or use `prefillUri` to skip picker); wrap in `withProgress(ProgressLocation.Notification, "OntoGraph: loading <filename>…")`; read with `const bytes = await vscode.workspace.fs.readFile(uri); const text = new TextDecoder().decode(bytes);`; derive `langId` from extension using path-based logic mirroring `resolveLanguageId` in `reloadOntology.ts`; call `ParserRegistry.parseAsync(text, langId, uri.toString())`; call `onLoaded(model)`; set `isLoading = false` in finally; show named errors per `contracts/loadOntologyFile-command.md`
- [x] T004 [P] [US1] Add `ontograph.loadOntologyFile` command contribution (title `"Load Ontology File…"`, icon `$(folder-opened)`) to `package.json` `commands` array; add two `view/title` menu entries — `when: "view == ontograph.classes"` and `when: "view == ontograph.inferredClasses"`, both `group: "navigation@-1"` — placing the button before the Classify button (`navigation@0`)
- [x] T005 [US1] In `src/extension.ts`: extract the `activeFileWatcher` setup block from inside `handleDocument` into a local `setupFileWatcher(model: OntologyModel): void` helper (dispose old watcher, create new `FileSystemWatcher`, wire `isReloadSuppressed` + debounce + `executeReload`); call `setupFileWatcher(model)` from the existing position in `handleDocument`; register `ontograph.loadOntologyFile` command with callback `async (model) => { activeModel = model; refreshAllViews(model); await refreshEntityEditorIfOpen(model, context); updateDLQueryModel(model, activeIndex); setupFileWatcher(model); }` passing the callback to `loadOntologyFile`

**Checkpoint**: Command Palette → "Load Ontology File…" → select `test-ontologies/bfo-core.ofn` → Classes panel shows correct class count. Toolbar folder icon visible in Classes Hierarchy and Inferred Hierarchy panels. `npm test` green.

---

## Phase 4: User Story 2 — Guided Fallback for Large-File Editor Warning (Priority: P2)

**Goal**: User opens a large ontology via VS Code File → Open; OntoGraph detects empty-content condition and shows a "Load" notification; clicking "Load" populates all panels.

**Independent Test**: Open a 200 MB `.owl` file via VS Code File → Open; observe OntoGraph notification "This file is too large for VS Code's text editor. Load it in OntoGraph?" within seconds; click "Load"; panels populate. Normal-sized ontology does NOT trigger notification.

**Depends on**: Phase 3 complete — needs `loadOntologyFile` with `prefillUri` parameter (T003).

### Tests for User Story 2

> **Write tests FIRST. Run `npm test` and confirm they FAIL before T008.**

- [x] T006 [P] [US2] Write failing unit tests for `onDidChangeActiveTextEditor` notification logic — ontology-extension URI with `getText()` returning `""` and `stat.size > 10_485_760` (10 MB) → `showInformationMessage` called with message `"This file is too large for VS Code's text editor. Load it in OntoGraph?"` and action `"Load"`; ontology URI with non-empty `getText()` → no notification; non-ontology extension URI → no notification; already-notified URI (in `notifiedUris` set) → no repeat notification — in `src/extension.test.ts` (or `src/__tests__/largeFileNotification.test.ts` if extension.test.ts does not already exist)
- [x] T007 [P] [US2] Write failing unit test: notification "Load" action selected → `loadOntologyFile` invoked with `prefillUri` equal to the active editor URI, no file picker shown — in same file as T006

### Implementation for User Story 2

- [x] T008 [US2] Add to `src/extension.ts`: module-level `const notifiedUris = new Set<string>()`; register `vscode.window.onDidChangeActiveTextEditor` listener; inside listener: derive `fsPath` from `editor.document.uri`; check extension is in `['.owl','.ofn','.omn','.ttl','.owx','.n3']`; check `editor.document.getText().length === 0`; check `!notifiedUris.has(uri.toString())`; call `vscode.workspace.fs.stat(uri)` and check `stat.size > 10_485_760`; add URI to `notifiedUris`; call `vscode.window.showInformationMessage("This file is too large for VS Code's text editor. Load it in OntoGraph?", "Load")`; if result is `"Load"` call `loadOntologyFile(onLoaded, uri)` using same `onLoaded` callback as the registered command; dispose listener added to `context.subscriptions`

**Checkpoint**: T006/T007 tests pass. Integration: simulate empty-doc + large stat → notification shown → "Load" click → `loadOntologyFile` called with correct URI.

---

## Phase 5: User Story 3 — Edit Annotations and Axioms; Changes Persist (Priority: P3)

**Goal**: After loading a large file via the new command, annotation/axiom edits via the entity editor persist to disk; no data loss.

**Independent Test**: Load a writable copy of `test-ontologies/bfo-core.ofn` via `loadOntologyFile`; edit the `rdfs:label` of one class via the entity editor; read the file from disk and confirm the updated label is present.

**Depends on**: Phase 3 complete — needs `loadOntologyFile` to set `activeModel.sourceUri` to the loaded file path.

### Tests for User Story 3

> **T009 is a spike test. Run it and observe — do NOT write implementation until T009 result is known.**

- [x] T009 [US3] Write integration spike in `src/commands/loadOntologyFile.test.ts`: copy `test-ontologies/bfo-core.ofn` to a temp path; mock `loadOntologyFile` to produce a model with `sourceUri` pointing to the temp copy; call `syncAnnotationsToDocument` via the `EntityEditorPanel` save path on that model; assert the expected annotation change appears in the temp file on disk; **run `npm test` and document the result**: (a) if `workspace.openTextDocument(uri).getText()` returns content → existing sync path works for large files, T010 is skipped; (b) if `getText()` returns `""` → T010 is required
- [x] T010 [P] [US3] Write failing unit test for write-error path: `workspace.applyEdit` returns `false` → `showErrorMessage` called naming the file — verify this test passes with existing code or add the guard in T011 — in `src/views/EntityEditorPanel.test.ts`

### Implementation for User Story 3

- [x] T011 [US3] **Conditional on T009 spike result** — implement only if T009 reveals `openTextDocument.getText()` returns empty for large-file-loaded models: refactor `EntityEditorPanel.ts` save handler to detect large-file case (check `workspace.openTextDocument(uri).getText().length === 0` after open); if detected, read via `vscode.workspace.fs.readFile`, apply sync diff manually, write result via `vscode.workspace.fs.writeFile`; call `suppressReloadFor(3000)` before write; update `parsedDocVersions` if applicable. **If T009 shows `getText()` returns content, mark this task skipped and document finding.**
  **T009 outcome (2026-05-27)**: `workspace.openTextDocument(uri).getText()` returned content for bfo-core.ofn loaded via `loadOntologyFile`. Existing `WorkspaceEdit` + `applyEdit` sync path works for large-file-loaded models. T011 **skipped** — no refactor of `EntityEditorPanel.ts` required.

**Checkpoint**: Entity editor annotation save on a large-file-loaded model writes change to disk. `npm test` — all existing sync tests still pass.

---

## Phase 6: User Story 4 — Auto-Reload When File Changes on Disk (Priority: P4)

**Goal**: External modification to a loaded large-ontology file triggers reload; panels reflect updated content within 2 seconds.

**Independent Test**: Load `test-ontologies/bfo-core.ofn` via `loadOntologyFile`; externally `touch` the file; observe OntoGraph reload (class count consistent with updated content).

**Depends on**: Phase 3 complete — `loadOntologyFile` must call `setupFileWatcher(model)` (T005).

### Tests for User Story 4

> **Write tests FIRST. Confirm they FAIL before T013.**

- [x] T012 [US4] Write failing unit tests for updated `reloadOntology` covering all 5 regression scenarios from plan.md Regression Safety section — in `src/commands/reloadOntology.test.ts`:
  1. External edit → `vscode.workspace.fs.readFile` called; model updated; `openTextDocument` NOT called
  2. After reload, `handleDocument` triggered with same content → `activeModel.rawContent === content` check skips re-parse
  3. After reload, `handleDocument` triggered with changed content → re-parse runs; model updated
  4. Sync write to large file → `isReloadSuppressed()` returns `true` → file-watcher callback returns early
  5. Sync write to normal-file model → `parsedDocVersions.get(key) === version` → `handleDocument` skips re-parse

### Implementation for User Story 4

- [x] T013 [US4] In `src/commands/reloadOntology.ts`: replace `const doc = await vscode.workspace.openTextDocument(uri)` + `doc.getText()` with `const bytes = await vscode.workspace.fs.readFile(uri); const text = new TextDecoder().decode(bytes);`; replace `resolveLanguageId(doc)` call with inline path-based detection using `activeModel.sourceUri` (same extension checks already present as fallback in the old `resolveLanguageId`); update `ParserRegistry.parseAsync` call to use `text` and `activeModel.sourceUri`; all T012 tests pass; existing `reloadOntology.test.ts` tests (if any) still pass

**Checkpoint**: T012 all 5 regression scenarios green. File watcher fires after external modification → model reloads → panels refresh. `npm test` green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T014 [P] Benchmark test in `src/commands/loadOntologyFile.test.ts`: call `loadOntologyFile` with `test-ontologies/bfo-core.ofn`; assert `model.classes.size` matches expected count and wall-clock time < 5000 ms; use `describe.skip` if `bfo-core.ofn` absent so CI is never broken on machines without the file
- [x] T015 [P] Run `npm run compile` — zero TypeScript type errors; run `npm test` — all tests pass; new-file line coverage ≥ 80% (constitution Section I); fix any failures before marking complete
- [x] T016 Update `CLAUDE.md` Recent Changes section: add `012-load-large-ontology` entry with technology `vscode.workspace.fs (raw file I/O), VS Code Extension API`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 3 (US1)**: No upstream dependencies — start immediately
- **Phase 4 (US2)**: Depends on Phase 3 (`prefillUri` parameter on `loadOntologyFile` from T003)
- **Phase 5 (US3)**: Depends on Phase 3 (`activeModel.sourceUri` set correctly from T003/T005)
- **Phase 6 (US4)**: Depends on Phase 3 (`setupFileWatcher` extracted and called for loaded models, T005)
- **Phase 7 (Polish)**: Depends on all desired story phases complete

### User Story Dependencies

- **US1 (P1)**: No dependencies — implement first
- **US2 (P2)**: Needs `loadOntologyFile` with `prefillUri` (T003)
- **US3 (P3)**: Needs `activeModel.sourceUri` set by `loadOntologyFile` (T003, T005)
- **US4 (P4)**: Needs `setupFileWatcher` in `loadOntologyFile` callback (T005)
- US2, US3, US4 can proceed in parallel once Phase 3 is complete

### Within Each Phase

- Tests MUST be written and confirmed FAILING before implementation (constitution Section I)
- T001 and T002 are independent (different test cases in same file) → write both before implementing T003
- T003 and T004 are independent files → can proceed in parallel; both must complete before T005
- T006 and T007 are independent test cases → write both before T008
- T009 (spike) result gates T011 — do not skip T009

### Parallel Opportunities

- T001 + T002: parallel (same test file, independent test cases)
- T003 + T004: parallel (different files — `loadOntologyFile.ts` vs `package.json`)
- T006 + T007: parallel (same test file, independent test cases)
- T009 + T010: parallel (different files — `loadOntologyFile.test.ts` vs `EntityEditorPanel.test.ts`)
- T014 + T015 + T016: parallel (different files, polish phase)

---

## Parallel Example: User Story 1

```bash
# Step 1 — Tests in parallel (same test file, no impl dependency):
Task T001: "Unit tests for loadOntologyFile picker/read/parse/error/isLoading paths"
Task T002: "Unit test for withProgress invocation"

# Step 2 — Implementation in parallel (different files):
Task T003: "Implement loadOntologyFile.ts"
Task T004: "Add command + menu entries to package.json"

# Step 3 — Wire (depends on T003 + T004 complete):
Task T005: "Extract setupFileWatcher; register command in extension.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: T001 → T002 → T003/T004 (parallel) → T005
2. **STOP and VALIDATE**: toolbar icon visible; Command Palette "Load Ontology File…" loads `bfo-core.ofn`; class hierarchy correct; `npm test` green
3. Ship MVP — the core use case (FR-001 through FR-007) is met

### Incremental Delivery

1. Phase 3 (US1) → **MVP**: load command works
2. Phase 4 (US2) → discoverability: large-file notification guides users who use File → Open
3. Phase 5 (US3) → round-trip editing for large files (T009 spike first)
4. Phase 6 (US4) → auto-reload parity with normal files

Each phase is independently testable and adds value without breaking prior phases.

---

## Notes

- Constitution Section I is NON-NEGOTIABLE: tests must fail before implementation
- `reloadGuard` (`suppressReloadFor`/`isReloadSuppressed`), `parsedDocVersions`, and `rawContent` check are the three reload-suppression mechanisms — all must remain intact; see plan.md Regression Safety section for full matrix
- T011 (US3 write-back fallback) is conditional: only implement if T009 spike shows `workspace.openTextDocument().getText()` returns empty for large-file-loaded models
- T013 removes the `openTextDocument` call from `reloadOntology.ts`; language ID must then be derived from `sourceUri` path (same extension checks already present in the existing `resolveLanguageId` fallback paths — inline them, do not abstract)
- `loadOntologyFile` callback in T005 must call `refreshAllViews`, `refreshEntityEditorIfOpen`, `updateDLQueryModel`, AND `setupFileWatcher` — matching the full post-parse sequence in `handleDocument`
