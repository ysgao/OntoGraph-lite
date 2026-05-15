# Implementation Plan: DL Query Webview

**Branch**: `005-dl-query-webview` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/005-dl-query-webview/spec.md`

---

## Summary

Add a Protégé-style DL Query panel as a VS Code webview. The user enters a Manchester Syntax class expression, selects relationship types (Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, Instances — first three checked by default), and clicks Execute. Results appear grouped by type in a left panel; a right panel holds the checkboxes and result filters. Clicking any result entity navigates the sidebar hierarchy to that entity.

Requires extending the Java reasoner with a new `dlQuery` JSON-RPC method (OWLAPI 5 `ManchesterOWLSyntaxParser` + reasoner queries), wiring it into `ReasonerBridge.ts`, and building a new browser IIFE webview bundle (`DLQueryApp.ts`).

---

## Technical Context

**Language/Version**: TypeScript 5+ (strict), Java 21+  
**Primary Dependencies**: VS Code Extension API (webview), OWLAPI 5 (ManchesterOWLSyntaxParser, OWLReasoner), esbuild (browser IIFE bundle)  
**Storage**: N/A — no persistent state; query results are transient  
**Testing**: Vitest 1.6.0 (`npm test`); Vitest mocked `vscode` for panel tests  
**Target Platform**: VS Code Extension Host (Node.js) + webview (browser IIFE)  
**Project Type**: VS Code extension feature  
**Performance Goals**: Execute returns results ≤3 s for ≤50k-class ontologies (SC-001); name filter updates ≤200ms (SC-002); click-to-navigate ≤500ms (SC-006)  
**Constraints**: Per-request fresh OWLAPI OntologyManager (existing pattern); no new runtime npm dependencies; no stateful Java process between requests  
**Scale/Scope**: Must remain responsive at SNOMED CT scale (50k+ classes); ELK auto-selected above 5k classes

---

## Constitution Check

### Pre-Design Gate (Pass/Fail)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | PASS | Each task below has a Red step before Green |
| II. Simplicity (YAGNI) | PASS | DLQueryPanel mirrors EntityEditorPanel; no new abstractions beyond what the feature requires |
| III. OWL Standards | PASS | No serializer/parser changes; existing IRI abbreviation rules are unaffected |
| IV. Scale-Aware | PASS | Java engine auto-selection (ELK >5k) already applies to new `dlQuery` method; anatomy.owl benchmark added in T006 |
| V. Security | PASS | Class expression sent as JSON string value; JSON-RPC message validated before forwarding; no shell construction |

### Complexity Tracking

No constitution violations. No entries required.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-dl-query-webview/
├── plan.md              ← this file
├── research.md          ← Phase 0: decisions and rationale
├── data-model.md        ← Phase 1: TypeScript + Java types
├── quickstart.md        ← Phase 1: build + manual verification
├── contracts/
│   ├── json-rpc-dl-query.md    ← Java JSON-RPC contract
│   ├── webview-messages.md     ← Extension ↔ Webview message types
│   └── vscode-command.md       ← ontograph.openDLQuery contract
└── tasks.md             ← Phase 2 (/speckit.tasks — not created here)
```

### Source Code Changes

```text
java-server/src/main/java/org/ihtsdo/ontoeditor/
├── OntologyService.java       ← add DLQueryResult + dlQuery() method
└── ReasonerServer.java        ← add "dlQuery" JSON-RPC case

src/
├── model/
│   └── OntologyModel.ts       ← add DLQueryType, DLQueryResult interfaces
├── reasoner/
│   └── ReasonerBridge.ts      ← add dlQuery() method
├── views/
│   ├── DLQueryMessages.ts     ← new: typed message contract
│   └── DLQueryPanel.ts        ← new: singleton panel, HTML builder, message router
└── commands/
    └── openDLQuery.ts         ← new: VS Code command handler

webview-src/
└── dl-query/
    └── DLQueryApp.ts          ← new: browser IIFE webview entry point

esbuild.mjs                    ← add dl-query-webview.js bundle entry
package.json                   ← add contributes.commands entry

src/extension.ts               ← register openDLQuery command
```

---

## Implementation Phases

### Phase 1 — Java Reasoner Extension

**Goal**: Expose `dlQuery` over the existing JSON-RPC transport.

#### T001 — Add `DLQueryResult` inner class and `dlQuery()` to `OntologyService.java`

- **Red**: Write a manual smoke test (launch JAR, send `dlQuery` request with `animals.omn` content, verify JSON response shape). Confirm the test fails (method not found error response) before implementing.
- **Green**:
  1. Add `DLQueryResult` inner class with six `List<String>` fields (see data-model.md).
  2. Import `ManchesterOWLSyntaxParser` from `org.semanticweb.owlapi.manchestersyntax.parser`.
  3. Implement `dlQuery(OWLOntology ontology, OWLReasoner reasoner, String classExpression, List<String> queryTypes)`:
     - Create `ManchesterOWLSyntaxParser`; set prefix map from ontology.
     - Parse class expression to `OWLClassExpression`.
     - For each requested query type, call the appropriate reasoner method.
     - Return `DLQueryResult` with IRIs as strings.
  4. Wrap in try/catch; throw `IllegalArgumentException` for parse failures (message forwarded as JSON-RPC error).
- **Commit**: `feat(reasoner): add dlQuery to OntologyService`

#### T002 — Wire `dlQuery` in `ReasonerServer.java`

- **Red**: Send `{ "method": "dlQuery", "params": {...} }` via the existing JSON-RPC harness. Confirm `"error": {"message": "Unknown method: dlQuery"}` before implementing.
- **Green**:
  1. Add `"dlQuery"` case in the dispatcher switch/if-else in `ReasonerServer.java`.
  2. Deserialize params (reuse existing Jackson deserialization pattern).
  3. Call `ontologyService.dlQuery(...)`.
  4. Serialize `DLQueryResult` to JSON response.
- **Commit**: `feat(reasoner): expose dlQuery JSON-RPC method`

---

### Phase 2 — TypeScript Bridge

**Goal**: Expose `dlQuery` on the TypeScript side with full type safety.

#### T003 — Add `DLQueryType` and `DLQueryResult` to `OntologyModel.ts`

- **Red**: Write type-check-only test (`npm run compile` must report errors referencing the new types before they exist). Alternatively, write a unit test importing the new types — confirm it fails to compile.
- **Green**: Add `DLQueryType` union and `DLQueryResult` interface to `src/model/OntologyModel.ts` (see data-model.md).
- **Commit**: `feat(model): add DLQueryType and DLQueryResult types`

#### T004 — Add `dlQuery()` to `ReasonerBridge.ts`

- **Red**: Write `src/reasoner/ReasonerBridge.test.ts` (or extend existing) with a test that:
  - Mocks the Java process stdin/stdout.
  - Calls `bridge.dlQuery(...)` and asserts the JSON-RPC request was written and the result is correctly deserialized.
  - Confirm test fails (method does not exist).
- **Green**: Implement `dlQuery(format, content, filePath, classExpression, queryTypes, engine)` following the `classify()` pattern (send request, await `id`-matched response, parse result).
- **Commit**: `feat(bridge): add dlQuery method to ReasonerBridge`

---

### Phase 3 — Webview Infrastructure

**Goal**: Panel creation, message contracts, command registration.

#### T005 — Create `DLQueryMessages.ts`

- **Red**: Write a compile-only test (import the message union types, assert discriminated union narrowing compiles). Confirm failure before file exists.
- **Green**: Create `src/views/DLQueryMessages.ts` with `DLQueryExtToWebview` and `DLQueryWebviewToExt` discriminated unions (see contracts/webview-messages.md).
- **Commit**: `feat(views): add DLQueryMessages typed contract`

#### T006 — Create `DLQueryPanel.ts`

- **Red**: Write `src/views/DLQueryPanel.test.ts`:
  - Mock `vscode` (createWebviewPanel, postMessage, onDidReceiveMessage).
  - Test: `openDLQueryPanel()` creates a panel with correct `viewType`.
  - Test: calling it a second time calls `panel.reveal()` rather than creating a new panel.
  - Test: `execute` message from webview triggers `ReasonerBridge.dlQuery()`.
  - Test: `navigate` message from webview triggers `revealInTreeView(iri, entityType)`.
  - Confirm tests fail.
- **Green**: Implement `src/views/DLQueryPanel.ts`:
  - Singleton `panel` variable.
  - `openDLQueryPanel(context, bridge, model, revealFn)` — creates or reveals panel.
  - `buildHtml(webview, extensionUri)` — nonce/CSP HTML builder pointing to `dist/dl-query-webview.js`.
  - `handleMessage(msg)` — dispatch `execute` → `bridge.dlQuery()` → post `dlQueryResult`; `navigate` → `revealFn(iri, entityType)`.
  - `retainContextWhenHidden: true`.
  - Sends `ontologyStatus` on `ready` and whenever `activeModel` changes.
- **Commit**: `feat(views): add DLQueryPanel singleton panel`

#### T007 — Create `openDLQuery.ts` command and register in `extension.ts`

- **Red**: Write a test confirming the command is not yet registered (VS Code API mock check). Confirm failure.
- **Green**:
  1. Create `src/commands/openDLQuery.ts` — thin wrapper calling `openDLQueryPanel(...)`.
  2. Register `ontograph.openDLQuery` in `extension.ts` (follow `openVisualization` pattern).
  3. Add `contributes.commands` entry in `package.json`.
- **Commit**: `feat(commands): register ontograph.openDLQuery command`

---

### Phase 4 — Webview UI

**Goal**: Functional Protégé-style DL Query UI bundle.

#### T008 — Create `DLQueryApp.ts` webview entry point

- **Red**: Add the esbuild entry in `esbuild.mjs` pointing to `webview-src/dl-query/DLQueryApp.ts`. Run `npm run build` — confirm build fails (file does not exist).
- **Green**: Create `webview-src/dl-query/DLQueryApp.ts` implementing:

  **Layout** (mirrors Protégé screenshot):
  ```
  ┌─────────────────────────────────────────────────┐
  │ Query (class expression)                         │
  │ [multiline textarea                           ]  │
  │ [Execute]                                        │
  ├─────────────────────────┬───────────────────────┤
  │ Query results            │ Query for             │
  │                          │ ☑ Direct superclasses│
  │  [grouped result list]   │ ☐ Superclasses        │
  │                          │ ☐ Equivalent classes  │
  │                          │ ☑ Direct subclasses   │
  │                          │ ☑ Subclasses          │
  │                          │ ☐ Instances           │
  │                          ├───────────────────────┤
  │                          │ Result filters        │
  │                          │ Name contains: [    ] │
  │                          │ ☑ Display owl:Thing   │
  │                          │   (in superclass res) │
  │                          │ ☑ Display owl:Nothing │
  │                          │   (in subclass res)   │
  └─────────────────────────┴───────────────────────┘
  ```

  **Behaviour**:
  - Acquire `vscode` API; send `ready` on load.
  - Execute button: disabled until `ontologyStatus.hasOntology` true; on click, post `execute` message.
  - Checkbox state: persisted in local `DLQueryUIState`; defaults per spec (FR-005).
  - Results rendering: grouped sections, each with a type label and a `<ul>` of clickable `<li>` items.
  - Click handler on entity `<li>`: post `navigate` message with `iri` and `entityType`.
  - Name filter: `input` event on "Name contains" field; client-side filter applied to `rawResults`.
  - `owl:Thing` / `owl:Nothing` filter: applied when checkboxes change; no re-query.
  - Loading state: show spinner/message on `dlQueryLoading`; hide on `dlQueryResult` or `dlQueryError`.
  - Error state: show error message in results area on `dlQueryError`.
  - Empty state: show "No results" message when all groups are empty after filtering.

- **Commit**: `feat(webview): add DLQuery webview UI bundle`

---

### Phase 5 — Integration & Benchmark

**Goal**: End-to-end wiring and scale verification.

#### T009 — Integration test: Execute → results → navigate

- **Red**: Write `src/views/DLQueryPanel.test.ts` integration scenario:
  - Full message round-trip: `ready` → `ontologyStatus` → `execute` → `dlQueryResult`.
  - Clicking navigate fires `revealInTreeView` with correct IRI and entity type.
  - Invalid expression → `dlQueryError` is posted.
  - Confirm tests fail.
- **Green**: Fix any wiring gaps found. No new production code expected beyond T006 fixes.
- **Commit**: `test(views): DLQueryPanel integration tests`

#### T010 — Benchmark: DL Query on anatomy.owl

- **Red**: Write `src/reasoner/ReasonerBridge.test.ts` benchmark (skip if `anatomy.owl` absent):
  - Load `test-ontologies/anatomy.owl`.
  - Execute `dlQuery` for `subClasses` of a top-level class.
  - Assert wall-clock time < 3000 ms.
  - Confirm test scaffolding is in place (may pass vacuously if Java not running — that's acceptable for unit test context).
- **Green**: Confirm benchmark passes in manual test with Java JAR running.
- **Commit**: `test(reasoner): DLQuery benchmark against anatomy.owl`

---

## Phase Completion Checklist

Before marking the feature complete:

- [ ] `npm test` — all tests pass, coverage ≥ 80% for new TypeScript code
- [ ] `npm run compile` — no TypeScript errors
- [ ] `npm run compile:webview` — no type errors in webview bundle
- [ ] `npm run build` — `dist/dl-query-webview.js` produced without errors
- [ ] `cd java-server && mvn clean package` — builds without errors
- [ ] Manual verification per `quickstart.md` completed
- [ ] Anatomy.owl benchmark passes (DL Query < 3 s)
- [ ] No "Add to ontology" button present in UI
- [ ] Default checkboxes verified: Direct superclasses, Direct subclasses, Subclasses
- [ ] Click-to-navigate verified for both classes and individuals
