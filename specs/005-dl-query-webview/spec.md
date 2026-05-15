# Feature Specification: DL Query Webview

**Feature Branch**: `005-dl-query-webview`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "create a new webview for DL Query that has a similar UI to Protege app but do not need the button for 'Add to ontology'"

## Clarifications

### Session 2026-05-15

- Q: How should the query expression be submitted to the reasoner? → A: The expression is wrapped internally as an `EquivalentClasses` axiom for a temporary named class; full classification is then run on the extended ontology.
- Q: Which reasoning invocation pattern should Execute use — ad-hoc reasoner query or full classify pipeline? → A: Execute calls the full classification service (HermiT or ELK) on the ontology extended with the temporary EquivalentClasses axiom; results are read from the inferred hierarchy of the temporary class.
- Q: Where does TempQueryClass live and what is the source of truth for Execute? → A: TempQueryClass is added to the TypeScript runtime OntologyModel before classification and removed after results are collected; Execute uses the live in-memory model (including any unsaved edits from the Entity Editor), not the saved file. The runtime model must never sync to disk during Execute execution.
- Q: Is the DL Query expression syntax the same as the EquivalentClasses expression in the Entity Editor? → A: Yes — the DL Query "Query (class expression)" input accepts exactly the same Manchester Syntax as the EquivalentClasses axiom field in the Entity Editor, including quoted rdfs:label names (e.g., `'Body structure'`). The classification button in the class hierarchy panel differs in that it classifies the synchronized OWL document on disk; DL Query classifies the runtime model.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute a DL Query and View Results (Priority: P1)

An ontology developer types a Manchester Syntax class expression into the DL Query panel and clicks Execute to retrieve matching classes or individuals from the current ontology. They select which relationship types to query for (subclasses, superclasses, equivalents, instances) and see results immediately in the results panel.

**Why this priority**: This is the core functionality — querying the ontology with a class expression is the primary user need. Without this, no other part of the panel has value.

**Independent Test**: Can be fully tested by opening the DL Query panel with an ontology loaded, entering a valid class expression, clicking Execute with the default checkboxes, and verifying that results appear in the results list and that clicking a result navigates the sidebar hierarchy to that entity.

**Acceptance Scenarios**:

1. **Given** an ontology is loaded and the DL Query panel is open, **When** the user enters a valid class expression and clicks Execute, **Then** the results panel shows results for all default-checked types (Direct superclasses, Direct subclasses, Subclasses), each group labelled by type.
2. **Given** the user has multiple query types checked (e.g., "Subclasses" and "Instances"), **When** they execute the query, **Then** results for each checked type are displayed, grouped or labelled by query type.
3. **Given** results are displayed, **When** the user clicks an entity in the results list, **Then** the left sidebar hierarchy scrolls to and highlights that entity in the appropriate tree view (Classes, Properties, or Individuals).
4. **Given** the user enters a syntactically invalid class expression, **When** they click Execute, **Then** an error message is shown in the results area describing the parse failure.
5. **Given** no ontology is loaded, **When** the user opens the DL Query panel, **Then** the Execute button is disabled or an appropriate "no ontology" message is shown.

---

### User Story 2 - Filter Query Results by Name (Priority: P2)

After executing a DL query that returns many results, an ontology developer types a substring into the "Name contains" filter field. The results list updates immediately to show only entities whose labels or IRIs contain that text.

**Why this priority**: Practical usability for large ontologies where a query may return hundreds of results. Without filtering, the results panel becomes unwieldy.

**Independent Test**: Can be fully tested by executing a query that returns multiple results, typing text into the "Name contains" field, and verifying the results list updates to show only matching entries.

**Acceptance Scenarios**:

1. **Given** a query has been executed and results are displayed, **When** the user types a string in the "Name contains" field, **Then** the results list immediately filters to show only entities whose name or IRI contains the typed string (case-insensitive).
2. **Given** a filter is active, **When** the user clears the "Name contains" field, **Then** the full unfiltered result set is restored.
3. **Given** the filter string matches no results, **Then** the results area shows an empty-state message rather than a blank panel.

---

### User Story 3 - Control Display of owl:Thing and owl:Nothing in Results (Priority: P3)

An ontology developer can choose whether to include `owl:Thing` in superclass results and `owl:Nothing` in subclass results, since these are trivially true for any well-formed class expression and often add noise.

**Why this priority**: Secondary filtering preferences that improve result quality for experienced users but do not block the core workflow.

**Independent Test**: Can be fully tested by executing a query (Direct superclasses is checked by default), then toggling the "Display owl:Thing" checkbox and verifying that `owl:Thing` appears or disappears in the superclass results accordingly.

**Acceptance Scenarios**:

1. **Given** the "Display owl:Thing (in superclass results)" checkbox is unchecked, **When** a superclasses query is executed, **Then** `owl:Thing` does not appear in superclass results.
2. **Given** the "Display owl:Thing" checkbox is checked, **When** a superclasses query is executed, **Then** `owl:Thing` appears in the results if it is a superclass.
3. **Given** the "Display owl:Nothing (in subclass results)" checkbox is unchecked, **When** a subclasses query is executed, **Then** `owl:Nothing` does not appear in subclass results.

---

### User Story 4 - Navigate to a Result Entity in the Sidebar (Priority: P2)

An ontology developer sees an interesting entity in the DL Query results and clicks it to jump directly to that entity in the sidebar hierarchy, so they can inspect its annotations, axioms, and relationships without having to search manually.

**Why this priority**: Navigation from results to the entity editor/hierarchy is a key workflow shortcut, making the DL Query panel significantly more useful than a read-only list.

**Independent Test**: Can be fully tested by executing a query, clicking an entity in the results, and verifying that the corresponding sidebar tree view (Classes, Properties, or Individuals) scrolls to and highlights that entity.

**Acceptance Scenarios**:

1. **Given** query results are displayed and contain a class entity, **When** the user clicks that entity, **Then** the Classes tree in the left sidebar scrolls to and selects that class.
2. **Given** query results contain an individual, **When** the user clicks it, **Then** the Individuals tree scrolls to and selects that individual.
3. **Given** the entity clicked no longer exists in the current ontology (e.g., ontology was reloaded), **When** navigation is attempted, **Then** a message is shown indicating the entity was not found.

---

### Edge Cases

- What happens when the query expression is empty and the user clicks Execute?
- What happens when a query returns zero results for all selected query types?
- How are very long class expression strings handled in the input area (scrolling vs. resize)?
- What happens if the ontology is closed or replaced while results are displayed?
- What happens if the temporary EquivalentClasses axiom causes an inconsistency in the ontology?
- **Execute fails mid-way (parse error, reasoner error, timeout):** `TempQueryClass` MUST still be removed from the runtime OntologyModel; the error message is shown in the results area; no sync to disk occurs.
- **Unsaved Entity Editor changes:** Execute operates on the live runtime model, which includes any pending entity edits made in the Entity Editor that have not yet been saved. This is intentional — DL Query queries the current working state, not the last-saved state.
- **Concurrent Execute clicks:** If Execute is clicked while a previous query is still running, the second click MUST be ignored or the in-progress query MUST be cancelled before starting the new one to prevent double-mutation of the runtime model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The DL Query panel MUST provide a Manchester Syntax expression editor (CodeMirror with syntax highlighting and entity autocompletion), labelled "Query (class expression)".
- **FR-002**: The panel MUST include an "Execute" button. When clicked, the system MUST: (1) parse the expression as an anonymous class expression, (2) add a `TempQueryClass` declaration and `EquivalentClasses(TempQueryClass, <expression>)` axiom to the **TypeScript runtime OntologyModel** (the live in-memory model, which includes any unsaved Entity Editor changes), (3) invoke the full classification service (HermiT or ELK) on the runtime model, (4) read the inferred hierarchy position of `TempQueryClass` for all checked query types, (5) return those results, and (6) remove `TempQueryClass` and its `EquivalentClasses` axiom from the runtime OntologyModel. The sync-to-disk mechanism MUST be inhibited throughout steps 2–6 so the temporary axiom is never written to the source file. Cleanup (step 6) MUST occur even if the classification fails or throws an error.
- **FR-003**: The panel MUST display a "Query results" area that lists entities returned for each checked query type.
- **FR-004**: The panel MUST provide checkboxes for the following six query relationship types: Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, Instances.
- **FR-005**: The "Direct superclasses", "Direct subclasses", and "Subclasses" checkboxes MUST be checked by default when the panel is opened.
- **FR-006**: The panel MUST provide a "Result filters" section with a "Name contains" text field that filters the displayed results in real time (client-side, no re-query needed).
- **FR-007**: The panel MUST provide a "Display owl:Thing (in superclass results)" checkbox, checked by default, under "Result filters".
- **FR-008**: The panel MUST provide a "Display owl:Nothing (in subclass results)" checkbox, checked by default, under "Result filters".
- **FR-009**: When the class expression is syntactically invalid or the classifier rejects the temporary axiom, the panel MUST display a human-readable error message in or near the results area.
- **FR-010**: The panel MUST NOT include an "Add to ontology" button.
- **FR-011**: The Execute button MUST be disabled when no ontology is loaded in the extension.
- **FR-012**: The results area MUST show an empty-state message when a valid query returns no results for any checked query type.
- **FR-013**: Results MUST be grouped and labelled by query type when multiple relationship types are checked; only groups for checked types are shown.
- **FR-014**: The panel layout MUST follow the Protégé DL Query arrangement: query input at the top, results panel on the left, "Query for" checkboxes and "Result filters" on the right.
- **FR-015**: Each entity in the results list MUST be clickable; clicking an entity MUST set it as the focused entity in the left sidebar hierarchy views (Classes or Individuals tree, as appropriate for the entity type).
- **FR-016**: The classification triggered by Execute MUST use the same reasoner engine (HermiT or ELK) selected in the extension settings; the temporary `TempQueryClass` declaration and `EquivalentClasses` axiom MUST be removed from the **TypeScript runtime OntologyModel** after results are collected (or on error), MUST NOT be written to the source file, and MUST NOT cause the extension's sync-to-disk mechanism to fire at any point during Execute execution. The DL Query Execute operation and the sidebar Classify command are distinct: Classify operates on the saved/synchronized OWL document; Execute operates on the live runtime model.

### Key Entities

- **DL Query Expression**: A Manchester Syntax class expression string entered by the user, using the same syntax as the EquivalentClasses axiom field in the Entity Editor (including quoted rdfs:label names). Internally wrapped as `EquivalentClasses(TempQueryClass, <expression>)` before classification.
- **TempQueryClass**: A temporary named OWL class added to the TypeScript runtime OntologyModel for the duration of a single DL query Execute; removed from the runtime model after results are collected or on error; never persisted to disk.
- **Query Result Set**: The inferred hierarchy position of TempQueryClass — superclasses, subclasses, equivalent classes, or instances — as returned by the classifier after the full classify operation.
- **Query Type**: One of six relationship types (Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, Instances) selected via checkboxes; determines which parts of TempQueryClass's inferred position are returned.
- **Result Filter**: A substring applied client-side to the displayed result set without re-querying the reasoner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can enter a class expression, click Execute, and see results within 3 seconds for ontologies under 50,000 classes (time includes classification of the ontology extended with the temporary EquivalentClasses axiom).
- **SC-002**: The "Name contains" filter updates the displayed results within 200 milliseconds of each keystroke.
- **SC-003**: All six query type checkboxes operate independently; checking or unchecking one updates the displayed results without requiring re-execution of the full query. Direct superclasses, Direct subclasses, and Subclasses are checked by default on panel open.
- **SC-004**: 100% of syntactically invalid class expressions display a human-readable error message rather than a silent failure or crash.
- **SC-005**: The panel layout matches the Protégé DL Query panel: query input at top, results on the left, query options and result filters on the right.
- **SC-006**: Clicking an entity in the results list navigates the sidebar hierarchy to that entity within 500 milliseconds.

## Assumptions

- The existing Java reasoner server classify endpoint is reused for DL query; the server receives the runtime OntologyModel (serialized, already containing `TempQueryClass` and its `EquivalentClasses` axiom) and performs full classification.
- `TempQueryClass` and its `EquivalentClasses` axiom are added to the TypeScript runtime OntologyModel before serialization/classification and removed from it after results are returned; they are never written to the user's source file. The sidebar Classify command is distinct: it operates on the saved/synchronized OWL document.
- Manchester Syntax parsing for class expressions reuses the existing Manchester parser already present in the codebase.
- The panel is implemented as a VS Code webview, consistent with the existing entity-editor and graph webviews.
- The panel is accessible from a VS Code command (e.g., "Open DL Query") when an OWL ontology file is open.
- Client-side filtering ("Name contains") does not require a round-trip to the reasoner.
- The "Add to ontology" button shown in the Protégé reference UI is explicitly out of scope.
- Internationalization and accessibility beyond standard HTML semantics are out of scope for v1.
