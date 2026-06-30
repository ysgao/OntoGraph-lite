# Tasks: Entity Navigation History (021)

**Input**: Design documents from `specs/021-entity-nav-history/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [data-model.md](data-model.md) · [contracts/vs-code-api.md](contracts/vs-code-api.md) · [research.md](research.md)

**Tests**: Included for `NavigationHistory` class per Constitution Principle IV (TDD mandatory for custom integration services). Specified in [plan.md](plan.md) Verification section.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state dependencies)
- **[Story]**: Which user story — US1 (Back), US2 (Forward), US3 (Keyboard)

---

## Phase 1: Setup

**Purpose**: No new tooling or project structure is required — this feature adds files to an existing TypeScript project with Vitest already configured.

- [x] T001 Verify branch `021-entity-nav-history` is active (`git branch --show-current`)

---

## Phase 2: Foundational — NavigationHistory Class (Blocking Prerequisite)

**Purpose**: The `NavigationHistory` class is shared by both US1 (back) and US2 (forward). It must exist and be tested before commands are wired in `extension.ts`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests first (TDD — red phase)

> **Write these tests FIRST. Run `npm test` and confirm they FAIL before proceeding to implementation.**

- [x] T002 Create `src/views/NavigationHistory.test.ts` with failing Vitest tests covering: `push` basic append, consecutive dedup (same IRI twice = one entry), `push` clears forwardStack, `back()` returns new top and moves popped value to forwardStack, `back()` returns `undefined` when stack ≤ 1, `forward()` returns popped value and pushes to backStack, `forward()` returns `undefined` when forwardStack empty, `clear()` empties both stacks, MAX_DEPTH=50 trim (shift oldest), `canGoBack` gates (false until 2+ entries), `canGoForward` gates

### Implementation (green phase)

- [x] T003 Create `src/views/NavigationHistory.ts` implementing `NavigationHistory` class: private `backStack: string[]`, private `forwardStack: string[]`, private `MAX_DEPTH = 50`, `push(iri: string): void`, `back(): string | undefined`, `forward(): string | undefined`, `clear(): void`, getters `canGoBack` and `canGoForward` — exact semantics per [data-model.md](data-model.md)

- [x] T004 Run `npm test -- src/views/NavigationHistory.test.ts` and confirm all tests pass; run `npm run compile` to verify no type errors

- [x] T004b Hook history clear into `onLoadedCallback` in `src/extension.ts` (line ~584, **before** `activeModel = model`): add `if (model.sourceUri !== activeModel?.sourceUri) { navigationHistory.clear(); updateNavContextKeys(); }` — import `NavigationHistory` (module-level const) and define `updateNavContextKeys()` here; see [plan.md](plan.md) R-004 for the URI comparison rationale (FR-011)

**Checkpoint**: `NavigationHistory` class is complete, tested, and wired to clear on ontology change — user story implementation can begin.

---

## Phase 3: User Story 1 — Back Navigation (Priority: P1) 🎯 MVP

**Goal**: Users can click ← in the OntoGraph sidebar to step back to the previously focused entity.

**Independent Test**: Open `test-ontologies/animals.omn`, click 3 different entities in sequence, click ← twice, confirm each click shows the correct previous entity in the Entity Editor and highlights it in the tree.

### Implementation for User Story 1

- [x] T005 [US1] Add `NavigationHistory` import and module-level instance to `src/extension.ts`: `import { NavigationHistory } from './views/NavigationHistory';` before `activate()`, `const navigationHistory = new NavigationHistory();` as module-level const

- [x] T006 [US1] Add `updateNavContextKeys()` helper function inside `activate()` in `src/extension.ts` (after `revealInTreeView` definition): calls `vscode.commands.executeCommand('setContext', 'ontograph.canNavigateBack', navigationHistory.canGoBack)` and `vscode.commands.executeCommand('setContext', 'ontograph.canNavigateForward', navigationHistory.canGoForward)` — see [plan.md](plan.md) Phase 1 design

- [x] T007 [US1] Hook history push into `onEntitySelected()` in `src/extension.ts` (line ~68, after the `suppressNextSelection` guard block, before the `showEntityInfo` call): add `navigationHistory.push(iri); updateNavContextKeys();`

- [x] T008 [US1] Register `ontograph.navigateBack` command in `activate()` in `src/extension.ts` (alongside existing `registerCommand` calls): get `iri = navigationHistory.back()`, call `updateNavContextKeys()`, then if `iri && activeModel` set `suppressNextSelection = true`, call `showEntityInfo(context, activeModel, iri)`, call `revealInTreeView(iri, entityTypeForIri(iri))` — see [plan.md](plan.md) Phase 1 design

- [x] T009 [P] [US1] Add `ontograph.navigateBack` command declaration to `package.json` `contributes.commands`: `{ "command": "ontograph.navigateBack", "title": "Go Back", "icon": "$(arrow-left)", "category": "OntoGraph" }` — see [contracts/vs-code-api.md](contracts/vs-code-api.md)

- [x] T010 [P] [US1] Add ← button to `package.json` `contributes.menus."view/title"`: `{ "command": "ontograph.navigateBack", "when": "view == ontograph.classesView", "group": "navigation@-3", "enablement": "ontograph.canNavigateBack" }` — see [contracts/vs-code-api.md](contracts/vs-code-api.md)

- [x] T011 [US1] Build extension (`npm run build`) and manually test US1: open `test-ontologies/animals.omn`, click 3 entities, verify ← button appears in sidebar header, click ← and confirm Entity Editor and tree highlight show correct previous entity; verify ← is grayed out with no prior history; refresh ontology and confirm ← remains active

**Checkpoint**: User Story 1 is fully functional. ← toolbar button navigates back through entity history.

---

## Phase 4: User Story 2 — Forward Navigation (Priority: P2)

**Goal**: After navigating back, users can click → to return forward through the history.

**Independent Test**: Click A → B → C, click ← (shows B), click ← (shows A), click → (shows B), click → (shows C); verify → is disabled when at the tip.

### Implementation for User Story 2

- [x] T012 [US2] Register `ontograph.navigateForward` command in `activate()` in `src/extension.ts` (alongside `navigateBack` command): get `iri = navigationHistory.forward()`, call `updateNavContextKeys()`, then if `iri && activeModel` set `suppressNextSelection = true`, call `showEntityInfo(context, activeModel, iri)`, call `revealInTreeView(iri, entityTypeForIri(iri))` — mirrors navigateBack pattern

- [x] T013 [P] [US2] Add `ontograph.navigateForward` command declaration to `package.json` `contributes.commands`: `{ "command": "ontograph.navigateForward", "title": "Go Forward", "icon": "$(arrow-right)", "category": "OntoGraph" }` — see [contracts/vs-code-api.md](contracts/vs-code-api.md)

- [x] T014 [P] [US2] Add → button to `package.json` `contributes.menus."view/title"`: `{ "command": "ontograph.navigateForward", "when": "view == ontograph.classesView", "group": "navigation@-2", "enablement": "ontograph.canNavigateForward" }` — see [contracts/vs-code-api.md](contracts/vs-code-api.md)

- [x] T015 [US2] Build extension (`npm run build`) and manually test US2: navigate A→B→C, click ← twice, click → twice, confirm round-trip; verify → is disabled at history tip and after navigating to a new entity

**Checkpoint**: User Stories 1 AND 2 work. ← and → buttons navigate entity history in both directions.

---

## Phase 5: User Story 3 — Keyboard Navigation (Priority: P3)

**Goal**: Power users can press `Alt+Left` / `Ctrl+-` (platform-specific) while the OntoGraph sidebar is focused to navigate back/forward without using the mouse.

**Independent Test**: Focus the Classes tree view, visit 3 entities, press `Ctrl+-` (Mac) or `Alt+Left` (Win/Linux), confirm back navigation fires. Press `Ctrl+Shift+-` / `Alt+Right` for forward. Switch to a text editor and confirm the same keys revert to VS Code's default behaviour.

### Implementation for User Story 3

- [x] T016 [US3] Add `contributes.keybindings` section to `package.json` with back and forward bindings: Mac back = `ctrl+-`, Mac forward = `ctrl+shift+-`, Win/Linux back = `alt+left`, Win/Linux forward = `alt+right`, `when` clause = `focusedView =~ /^ontograph\./` — see [contracts/vs-code-api.md](contracts/vs-code-api.md)

- [x] T017 [US3] Build extension (`npm run build`) and test US3: focus the OntoGraph Classes view in VS Code, press the platform shortcut, confirm navigation; then click into a text editor and press the same key to confirm VS Code default is preserved

**Checkpoint**: All three user stories complete. Keyboard shortcuts activate only in OntoGraph context.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T018 Verify FR-011 end-to-end: navigate to 3 entities, trigger `ontograph.refresh` (same file), confirm ← is still active; then load `test-ontologies/bfo-core.ofn` (different file), confirm ← and → are both grayed out (implementation done in T004b)

- [x] T019 Run full test suite `npm test` and confirm all existing 437 tests pass alongside the new `NavigationHistory.test.ts` tests; run `npm run compile` to confirm zero type errors; run `npm run build` for final production build; **manual verify**: (a) click 3 entities, refresh the same ontology (`ontograph.refresh`), confirm ← still works; (b) load a different ontology file, confirm ← is grayed out

- [x] T020 [P] Update `conductor/tracks/` plan file (if applicable) marking tasks complete with commit SHAs per project workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — no dependency on US2/US3
- **US2 (Phase 4)**: Depends on Foundational — reuses `NavigationHistory.forward()` from Phase 2; `onLoadedCallback` guard (T004b) already active
- **US3 (Phase 5)**: Depends on Foundational — `package.json` only change, can overlap with US1/US2
- **Polish (Phase 6)**: Depends on all user stories

### Within Phase 3 (US1)

```
T005 (import) → T006 (helper) → T007 (push hook) → T008 (command)
T009 [P] ──────────────────────────────────────────────────────────┐
T010 [P] ──────────────────────────────────────────────────────────┤
                                                                    T011 (verify)
```

### Within Phase 4 (US2)

```
T012 (command) ──────────────────────────┐
T013 [P] ────────────────────────────────┤ → T015 (verify)
T014 [P] ────────────────────────────────┘
```

### Parallel Opportunities

- T009 and T010 (package.json additions for US1) can run in parallel with each other — different array entries in the same file, no ordering dependency between them
- T013 and T014 (package.json additions for US2) same
- US3 keybinding (T016) can be added at the same time as US2 package.json changes (T013, T014) since they are separate `contributes` sections

---

## Parallel Example: Foundational Phase

```bash
# Write tests first (T002), then implement (T003), then verify (T004)
# These are sequential — must not be parallelized (TDD red→green)
Task T002: "Create NavigationHistory.test.ts with failing tests"
  → confirm FAIL with: npm test -- src/views/NavigationHistory.test.ts
Task T003: "Create NavigationHistory.ts implementation"
  → confirm PASS with: npm test -- src/views/NavigationHistory.test.ts
```

## Parallel Example: User Story 1

```bash
# After T005–T008 complete (extension.ts changes), launch T009 and T010 together:
Task T009: "Add ontograph.navigateBack to package.json contributes.commands"
Task T010: "Add ← button to package.json contributes.menus.view/title"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T004) — NavigationHistory class with tests
3. Phase 3: US1 (T005–T011) — ← button, back command, history push
4. **STOP and VALIDATE**: Confirm ← works manually with `test-ontologies/animals.omn`
5. Deliver — users can already navigate back, even without forward/keyboard

### Incremental Delivery

1. Setup + Foundational → NavigationHistory class ready
2. US1 → ← button ships → MVP
3. US2 → → button ships
4. US3 → keyboard shortcuts ship
5. Polish → history-clear on load, final verification

---

## Notes

- [P] tasks operate on different `package.json` array entries — no merge conflict risk when done in sequence within the same editing session
- `suppressNextSelection` (existing flag in `extension.ts`) is reused as the navigation guard — no new flags needed (see [research.md](research.md) R-001)
- History push happens ONLY in `onEntitySelected()` — do not add push calls at other call sites (see R-002)
- Run `npm test -- src/views/NavigationHistory.test.ts` to confirm red phase before implementing T003
- Commit after each phase with `feat(021-entity-nav-history): <description>` following project commit convention
