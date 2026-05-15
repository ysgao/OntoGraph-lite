# Tasks: DL Query Webview

**Input**: Design documents from `/specs/005-dl-query-webview/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

> **Note**: Test tasks are **mandatory** — the OntoGraph Constitution (Principle I: Test-First) requires
> a failing test before any implementation. The Red-Green-Refactor cycle is non-negotiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no blocking dependency)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new files and register the new webview bundle so the build system is ready before
any user story work begins.

- [ ] T001 Add `dl-query-webview.js` esbuild browser-IIFE entry to `esbuild.mjs` (entry: `webview-src/dl-query/DLQueryApp.ts`, outfile: `dist/dl-query-webview.js`); verify `npm run build` fails with "entry point not found"
- [ ] T002 [P] Create `src/views/DLQueryMessages.ts` with `DLQueryType` union, `EntityRef`, `ResultGroup`, `DLQueryExtToWebview` and `DLQueryWebviewToExt` discriminated unions per `contracts/webview-messages.md`
- [ ] T003 [P] Add `DLQueryType` and `DLQueryResult` interfaces to `src/model/OntologyModel.ts` per `data-model.md`; run `npm run compile` and confirm no new errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Java reasoner `dlQuery` method and TypeScript bridge — MUST be complete before any user
story can be implemented end-to-end.

**⚠️ CRITICAL**: No user story implementation can be validated until this phase is complete.

### Java Reasoner

- [ ] T004 Add `DLQueryResult` public static inner class (six `List<String>` fields) to `java-server/src/main/java/org/ihtsdo/ontoeditor/OntologyService.java` per `data-model.md`
- [ ] T005 Implement `dlQuery(OWLOntology ontology, OWLReasoner reasoner, String classExpression, List<String> queryTypes)` in `OntologyService.java`; use `ManchesterOWLSyntaxParser` to parse the expression in ontology context; call `getSuperClasses`/`getSubClasses`/`getEquivalentClasses`/`getInstances` only for requested query types; throw `IllegalArgumentException` on parse failure
- [ ] T006 Add `"dlQuery"` JSON-RPC dispatch case to `java-server/src/main/java/org/ihtsdo/ontoeditor/ReasonerServer.java`; deserialize `classExpression` and `queryTypes` params; serialize `DLQueryResult` as JSON response; rebuild JAR (`cd java-server && mvn clean package`) and confirm manual smoke test passes

### TypeScript Bridge

- [ ] T007 Write failing test in `src/reasoner/ReasonerBridge.test.ts` for `dlQuery()`: mock Java process stdin/stdout, assert correct JSON-RPC request is written and response is correctly deserialized into `DLQueryResult`; confirm test fails before T008
- [ ] T008 Implement `dlQuery(format, content, filePath, classExpression, queryTypes, engine)` in `src/reasoner/ReasonerBridge.ts` following the `classify()` request/response pattern; run T007 test and confirm it passes

**Checkpoint**: Foundation ready — Java accepts `dlQuery` requests, TypeScript bridge is typed and tested.

---

## Phase 3: User Story 1 — Execute a DL Query and View Results (Priority: P1) 🎯 MVP

**Goal**: The user can open the DL Query panel, enter a Manchester Syntax expression, click Execute, and
see results grouped by relationship type (Direct superclasses, Direct subclasses, Subclasses checked by
default).

**Independent Test**: Open `animals.omn` in the Extension Development Host; open DL Query panel via Command Palette; type `Animal`; click Execute; verify three result groups appear (Direct superclasses, Direct subclasses, Subclasses), each labelled.

### Tests for User Story 1

> **Write these tests FIRST — confirm they FAIL before writing any implementation**

- [ ] T009 [P] [US1] Write failing tests in `src/views/DLQueryPanel.test.ts`: (a) `openDLQueryPanel()` creates a webview panel with `viewType: 'ontograph.dlQuery'`; (b) calling it a second time calls `panel.reveal()` not `createWebviewPanel()`; (c) `execute` message triggers `ReasonerBridge.dlQuery()` and posts `dlQueryResult` back; (d) `ready` message triggers `ontologyStatus` response; confirm all four fail
- [ ] T010 [P] [US1] Write failing unit test in `webview-src/dl-query/DLQueryApp.test.ts` (or `src/views/` equivalent): DLQueryApp renders six checkboxes with correct default-checked state (Direct superclasses ✓, Superclasses ✗, Equivalent classes ✗, Direct subclasses ✓, Subclasses ✓, Instances ✗); confirm test fails

### Implementation for User Story 1

- [ ] T011 [US1] Create `src/views/DLQueryPanel.ts`: singleton `panel` variable; `openDLQueryPanel(context, bridge, activeModel, revealFn)` function; `buildHtml(webview, extensionUri)` with nonce/CSP pointing to `dist/dl-query-webview.js`; `handleMessage()` dispatcher for `ready`, `execute`, `navigate`; `retainContextWhenHidden: true`; wire T009 tests to green
- [ ] T012 [US1] Create `src/commands/openDLQuery.ts`: thin command handler calling `openDLQueryPanel()` with the shared `activeModel` and `revealInTreeView` from `src/extension.ts`
- [ ] T013 [US1] Register `ontograph.openDLQuery` command in `src/extension.ts` (follow `openSparqlEditor` pattern); add `contributes.commands` entry in `package.json` with title `"Open DL Query"` and category `"OntoGraph"`
- [ ] T014 [US1] Create `webview-src/dl-query/DLQueryApp.ts`: acquire VS Code API; send `ready` on load; implement Protégé two-column layout (query textarea + Execute button top-left; results list bottom-left; Query for checkboxes + Result filters right); default-checked state per FR-005; execute button posts `execute` message with expression and checked queryTypes; result rendering: six labelled group sections, each a `<ul>` of entity items; display `dlQueryLoading` spinner; wire T010 test to green

**Checkpoint**: User Story 1 is independently functional — panel opens, executes queries, displays grouped results.

---

## Phase 4: User Story 4 — Navigate to a Result Entity (Priority: P2)

**Goal**: Clicking any entity in the results list focuses that entity in the left sidebar hierarchy
(Classes tree for classes, Individuals tree for individuals).

**Independent Test**: Execute a query in `animals.omn`; click a class entity in results; verify the Classes tree in the sidebar scrolls to and highlights that class.

### Tests for User Story 4

> **Write these tests FIRST — confirm they FAIL before writing any implementation**

- [ ] T015 [US4] Write failing tests in `src/views/DLQueryPanel.test.ts`: (a) `navigate` message with `entityType: 'class'` calls `revealFn(iri, 'class')`; (b) `navigate` with `entityType: 'individual'` calls `revealFn(iri, 'individual')`; confirm both fail

### Implementation for User Story 4

- [ ] T016 [US4] Add `navigate` case to `handleMessage()` in `src/views/DLQueryPanel.ts`: call `revealFn(msg.iri, msg.entityType)`; wire T015 tests to green
- [ ] T017 [US4] Add click handler to each entity `<li>` in `webview-src/dl-query/DLQueryApp.ts`: on click, post `{ type: 'navigate', iri, entityType }` message; `entityType` is `'individual'` for entities from the `instances` group, `'class'` for all other groups

**Checkpoint**: User Stories 1 and 4 are both functional — Execute returns results and any result entity is clickable to navigate the sidebar.

---

## Phase 5: User Story 2 — Filter Query Results by Name (Priority: P2)

**Goal**: After executing a query the user can type a substring in "Name contains" and the results
list filters in real time without re-querying the reasoner.

**Independent Test**: Execute a query returning ≥3 results in `animals.omn`; type part of one entity name in "Name contains"; verify only matching entities remain visible.

### Tests for User Story 2

> **Write these tests FIRST — confirm they FAIL before writing any implementation**

- [ ] T018 [US2] Write failing tests for name filter logic in `webview-src/dl-query/DLQueryApp.ts`: (a) typing a substring shows only matching entities (case-insensitive); (b) clearing the field restores all results; (c) a substring matching nothing shows empty-state message; confirm all three fail

### Implementation for User Story 2

- [ ] T019 [US2] Implement "Name contains" client-side filter in `webview-src/dl-query/DLQueryApp.ts`: bind `input` event on the Name contains field; apply case-insensitive substring filter to `rawResults` labels and IRIs; re-render the results list; show "No results" empty-state when all groups are empty after filtering; wire T018 tests to green

**Checkpoint**: User Stories 1, 2, and 4 are all functional.

---

## Phase 6: User Story 3 — Control Display of owl:Thing / owl:Nothing (Priority: P3)

**Goal**: The "Display owl:Thing (in superclass results)" and "Display owl:Nothing (in subclass results)"
checkboxes, both checked by default, correctly include or exclude those entities from results without
re-querying the reasoner.

**Independent Test**: Execute a superclasses query; uncheck "Display owl:Thing"; verify `owl:Thing` disappears from superclass groups.

### Tests for User Story 3

> **Write these tests FIRST — confirm they FAIL before writing any implementation**

- [ ] T020 [US3] Write failing tests for owl:Thing / owl:Nothing toggle in `webview-src/dl-query/DLQueryApp.ts`: (a) unchecking "Display owl:Thing" removes `owl:Thing` IRI from all superclass group renders; (b) unchecking "Display owl:Nothing" removes `owl:Nothing` IRI from all subclass group renders; (c) rechecking restores them; confirm all three fail

### Implementation for User Story 3

- [ ] T021 [US3] Implement owl:Thing / owl:Nothing client-side filtering in `webview-src/dl-query/DLQueryApp.ts`: bind `change` events on the two filter checkboxes; apply filter to `rawResults` before rendering (remove `http://www.w3.org/2002/07/owl#Thing` from `directSuperClasses`/`superClasses`/`equivalentClasses` groups when unchecked; remove `http://www.w3.org/2002/07/owl#Nothing` from `directSubClasses`/`subClasses` groups when unchecked); compose with Name contains filter; wire T020 tests to green

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, empty states, ontology lifecycle, benchmark.

- [ ] T022 [P] Add `ontologyStatus` message handler to `webview-src/dl-query/DLQueryApp.ts`: disable Execute button when `hasOntology: false`; enable when `hasOntology: true`; add corresponding message send in `src/views/DLQueryPanel.ts` on `ready` and on `activeModel` change (follow EntityEditorPanel pattern)
- [ ] T023 [P] Add loading and error states to `webview-src/dl-query/DLQueryApp.ts`: show spinner/loading message on `dlQueryLoading`; show error message in results area on `dlQueryError`; clear error on next `dlQueryLoading`
- [ ] T024 Add anatomy.owl benchmark test to `src/reasoner/ReasonerBridge.test.ts`: skip with `describe.skip` if `test-ontologies/anatomy.owl` absent; execute `dlQuery` for subclasses of a top-level class; assert wall-clock time < 3000 ms
- [ ] T025 Run `npm test` and confirm all tests pass with coverage ≥ 80% for new TypeScript files; run `npm run compile` and `npm run compile:webview` and confirm zero type errors; run `npm run build` and confirm `dist/dl-query-webview.js` is produced
- [ ] T026 Complete manual verification per `specs/005-dl-query-webview/quickstart.md` steps 1–9; confirm no "Add to ontology" button, default checkboxes, click-to-navigate, and error display all work as specified

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (T002, T003 must exist) — **BLOCKS all user story phases**
- **Phase 3 (US1)**: Depends on Phase 2 completion — first user story, MVP
- **Phase 4 (US4)**: Depends on Phase 3 (needs results to click) — click-to-navigate
- **Phase 5 (US2)**: Depends on Phase 3 (needs results to filter)
- **Phase 6 (US3)**: Depends on Phase 3 (needs results to filter by entity type)
- **Phase 7 (Polish)**: Depends on Phases 3–6

### User Story Dependencies

- **US1 (P1)**: Needs full stack (Java + Bridge + Panel + App) — foundational MVP
- **US4 (P2)**: Depends on US1 results panel existing; adds navigate message to Panel + App
- **US2 (P2)**: Depends on US1 results existing; purely client-side in App — can parallelize with US4
- **US3 (P3)**: Depends on US1 results existing; purely client-side in App — can parallelize with US2/US4

### Within Each Phase

- Test tasks (T00x in each phase) MUST be written and confirmed to FAIL before implementation tasks begin
- Java tasks T004→T005→T006 are sequential (each builds on previous)
- Bridge tasks T007→T008 are sequential
- Panel tasks T011→T012→T013 are sequential (T012 depends on T011 exports)
- App tasks are sequential within each story

### Parallel Opportunities (Phase 1)

```bash
# All three Phase 1 tasks can run in parallel (different files):
Task T001: esbuild.mjs
Task T002: src/views/DLQueryMessages.ts
Task T003: src/model/OntologyModel.ts
```

### Parallel Opportunities (US2, US4)

```bash
# After US1 is complete, these two stories can proceed in parallel (different files/concerns):
Story US4: T015 → T016 → T017  (navigate handler in Panel + App click handler)
Story US2: T018 → T019          (name filter in App only)
```

---

## Parallel Example: Phase 1

```bash
# All three can run simultaneously (no shared files):
Task: "Add esbuild entry in esbuild.mjs"            → T001
Task: "Create DLQueryMessages.ts"                   → T002
Task: "Add types to OntologyModel.ts"               → T003
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational Java + Bridge (T004–T008) — **CRITICAL blocker**
3. Complete Phase 3: US1 Execute + View Results (T009–T014)
4. **STOP and VALIDATE**: Open `animals.omn`, run DL Query, verify grouped results appear
5. Demo-ready MVP at this point

### Incremental Delivery

1. Setup + Foundational → reasoner extended, bridge tested
2. US1 → panel opens, queries execute, results display — **MVP Demo**
3. US4 → click any result to navigate sidebar — **navigation complete**
4. US2 + US4 in parallel → name filter + navigate both working
5. US3 → owl:Thing / owl:Nothing toggles working
6. Polish → error states, loading, benchmark, full test suite

---

## Notes

- [P] tasks = different files or clearly non-overlapping concerns, safe to parallelize
- Test tasks map to the same story as their implementation counterparts
- The OntoGraph Constitution (Principle I) requires test tasks to be written and FAILING before any implementation task in the same story begins
- Java changes require JAR rebuild: `cd java-server && mvn clean package && cp target/*.jar resources/java/onto-reasoner-server.jar`
- The new webview follows the EntityEditorPanel.ts singleton pattern exactly — refer to it as a reference throughout
- `revealInTreeView(iri, entityType)` already exists in `src/extension.ts` — pass it as `revealFn` to `openDLQueryPanel()`; do not duplicate it
