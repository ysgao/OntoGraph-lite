# Feature Specification: Persist Entity Search Query

**Feature Branch**: `020-persist-search-query`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "When returning to the entity search panel it would be helpful for the field to retain the last search string. Hence, users do not need to type the same search string again."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search persists across panel close/reopen (Priority: P1)

A user searches for an entity (e.g., "liver structure"), navigates away to inspect the entity editor, then returns to the search panel. The search field still shows "liver structure" and the results are already displayed.

**Why this priority**: This is the core requested behaviour — eliminating repetitive re-typing that interrupts the ontology editing workflow.

**Independent Test**: Open the search panel, enter a query, close the panel, reopen it — the query and results are present without any additional user action.

**Acceptance Scenarios**:

1. **Given** the user has entered a search term in the entity search panel, **When** the user closes and reopens the panel, **Then** the search field contains the same term that was entered previously.
2. **Given** the search field is restored with the previous term, **When** the panel opens, **Then** results matching that term are displayed immediately without requiring the user to press search again.
3. **Given** the user has never performed a search, **When** the panel opens for the first time, **Then** the search field is empty (no spurious default value).

---

### User Story 2 - Search persists across ontology tool panel switches (Priority: P2)

A user switches between the Classes, Properties, and Individuals panels (or to the graph view or entity editor) and then returns to the search panel. The last search is still present.

**Why this priority**: Panel switching is the most common navigation pattern during ontology editing; preserving context across these switches reduces friction.

**Independent Test**: Enter a search query, click to another sidebar panel, click back to search — query and results are intact.

**Acceptance Scenarios**:

1. **Given** a search term is active in the search panel, **When** the user switches to a different panel and returns, **Then** the search field and results are unchanged.
2. **Given** a search term is active, **When** the user opens the entity editor for a result and then returns to search, **Then** the previous search context is fully restored.

---

### User Story 3 - Search cleared when user explicitly clears it (Priority: P3)

If the user clears the search field and closes the panel, the panel reopens with an empty field (the cleared state is also persisted).

**Why this priority**: Users should be able to intentionally reset the search state; the persistence must not become a nuisance that traps stale queries.

**Independent Test**: Enter a query, clear the field, close and reopen — the field is empty.

**Acceptance Scenarios**:

1. **Given** the user has cleared the search field, **When** the panel is closed and reopened, **Then** the search field is empty.
2. **Given** the search field is empty and the user types a new term, **When** the panel is closed and reopened, **Then** the new term is shown (most recent state wins).

---

### Edge Cases

- What happens when the ontology file is closed and a different file is opened — should the search query carry over or reset?
- What happens when the VS Code window is fully restarted — should the query survive across sessions or only within a session?
- How does the panel behave if the previously searched term returns zero results in the current ontology (e.g., after an ontology reload that removed entities)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST retain the most recent search string entered in the entity search panel for the lifetime of the current VS Code session.
- **FR-002**: When the entity search panel is reopened or re-focused, it MUST pre-populate the search field with the retained search string.
- **FR-003**: When the panel opens with a retained search string, the system MUST automatically execute the search and display matching results without requiring additional user input.
- **FR-004**: If the user clears the search field, the system MUST treat the cleared (empty) state as the new retained value, so that reopening the panel shows an empty field.
- **FR-005**: If no previous search exists (first use or after explicit clear), the panel MUST open with an empty search field.
- **FR-006**: The retained search string MUST be scoped to the active ontology session; switching to a different ontology file resets the retained value to empty.

### Key Entities

- **Search State**: The most recently entered search string, scoped to the current session and ontology file. Holds a single string value (empty string representing "no search").

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users returning to the entity search panel find their previous query pre-filled 100% of the time within the same session and ontology file.
- **SC-002**: The search panel opens with results already shown in under 500 ms when a retained query exists, matching the speed of a fresh search.
- **SC-003**: Zero cases where a stale query from a previous ontology file appears after switching files.
- **SC-004**: Users report reduced repetitive typing in workflow tasks involving repeated entity lookups (qualitative: feedback collected during testing shows the panel is noticeably less disruptive).

## Assumptions

- The search string is retained only for the lifetime of the current VS Code session (not persisted to disk across restarts), which covers the primary reported pain point without requiring persistent storage.
- Switching to a different ontology file resets the search state, since queries are specific to the content of the open file.
- The feature applies to the entity search panel; other search or filter inputs in the extension are out of scope.
- If the retained query returns no results after an ontology reload, the empty-results state is shown — the query is not silently discarded.
