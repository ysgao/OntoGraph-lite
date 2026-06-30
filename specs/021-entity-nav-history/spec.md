# Feature Specification: Entity Navigation History

**Feature Branch**: `021-entity-nav-history`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "create a new branch for new feature of go back and go forward buttons for navigating the view history of focus entities"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Back to Previously Focused Entity (Priority: P1)

An ontology editor is browsing through related classes — clicking from Animal → Mammal → Dog → GoldenRetriever. They want to step back through that path to re-examine Mammal without having to find it again in the tree.

**Why this priority**: This is the core value of the feature. Without backward navigation the rest is meaningless.

**Independent Test**: Open any ontology, click three different entities in sequence, click the ← Back button, and confirm the previously focused entity is shown in the Entity Editor and highlighted in the tree.

**Acceptance Scenarios**:

1. **Given** the user has focused entity A then entity B, **When** they click ←, **Then** entity A is shown in the Entity Editor and highlighted in the tree view.
2. **Given** the user has focused only one entity (no prior history), **When** the ← button is present, **Then** it is visually disabled (grayed out) and cannot be clicked.
3. **Given** the user navigates back through 3 entities, **When** they reach the oldest recorded entity, **Then** the ← button becomes disabled.

---

### User Story 2 - Navigate Forward After Going Back (Priority: P2)

After stepping back through history, the user wants to return forward to where they were.

**Why this priority**: Forward navigation is the natural complement to back; without it, going back is destructive to the user's current position.

**Independent Test**: Click A → B → C, click ← (shows B), click → (shows C).

**Acceptance Scenarios**:

1. **Given** the user has navigated back at least once, **When** they click →, **Then** the next entity in the forward history is shown.
2. **Given** the user is at the most recent position in their history (no forward history), **Then** the → button is disabled.
3. **Given** the user navigated back to entity B and then clicks a new entity D, **When** the new navigation occurs, **Then** the forward history is cleared (D is the new tip, → becomes disabled).

---

### User Story 3 - Keyboard Navigation (Priority: P3)

Power users want to navigate entity history without reaching for the mouse, using familiar shortcuts while the OntoGraph sidebar is focused.

**Why this priority**: Keyboard shortcuts improve workflow efficiency but are not required for the core feature to deliver value.

**Independent Test**: With an OntoGraph tree view focused, press `Alt+Left` (Windows/Linux) or `Ctrl+-` (Mac) after visiting multiple entities and confirm navigation back works.

**Acceptance Scenarios**:

1. **Given** an OntoGraph tree view is focused and history exists, **When** the user presses the Go Back shortcut, **Then** the previous entity is shown (same as clicking ←).
2. **Given** the OntoGraph sidebar is NOT focused (e.g., a text editor is active), **When** the user presses the same keys, **Then** the default VS Code behavior is preserved (OntoGraph does not intercept).

---

### Edge Cases

- What happens when the same entity is focused twice in a row (consecutive duplicate)? → The second focus is ignored; the history stack is not doubled.
- What happens when a **different** ontology file is loaded? → History is cleared and both buttons become disabled.
- What happens when the same ontology is **refreshed/reloaded** from disk (e.g., after saving edits)? → History is preserved; back/forward buttons remain in their current state.
- What happens when history reaches 50 entries? → The oldest entry is silently dropped (FIFO); the user never sees an overflow error.
- What happens when the entity in history no longer exists (e.g., deleted after undo)? → Navigation shows the entity editor in its "not found" / empty state; the button does not error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST maintain a session-scoped navigation history of focused entity IRIs, ordered by the sequence in which entities were focused.
- **FR-002**: The history MUST record entity focus triggered by: tree view clicks, search/quick-pick selection, and clicking related-entity links within the Entity Editor.
- **FR-003**: The history MUST NOT record focus events triggered by programmatic back/forward navigation itself.
- **FR-004**: Consecutive duplicate entries MUST be suppressed (focusing the same entity twice records only one entry).
- **FR-005**: The history stack MUST be capped at 50 entries; when exceeded, the oldest entry is discarded.
- **FR-006**: A ← (back) toolbar button MUST appear in the OntoGraph sidebar view header, disabled when no prior entity exists.
- **FR-007**: A → (forward) toolbar button MUST appear in the OntoGraph sidebar view header, disabled when no forward history exists.
- **FR-008**: Clicking ← MUST show the previous entity in the Entity Editor and highlight it in the tree view.
- **FR-009**: Clicking → MUST show the next entity in the forward history in the Entity Editor and highlight it in the tree view.
- **FR-010**: Navigating to a new entity (any user-initiated focus) MUST clear the forward history.
- **FR-011**: Loading a **different** ontology file MUST clear both the back and forward history stacks. Reloading (refreshing) the **same** ontology file from disk MUST NOT clear the history.
- **FR-012**: Keyboard shortcuts MUST be bound to ← and → navigation when any OntoGraph tree view is focused; the shortcuts MUST NOT interfere with VS Code's own navigation or text-editing shortcuts in other contexts.

### Key Entities

- **Navigation History**: A session-scoped, in-memory pair of stacks (back-stack and forward-stack) holding entity IRIs in visit order.
- **Entity Focus Event**: Any user action that causes a specific entity IRI to be shown in the Entity Editor panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has visited 5 or more entities can reach any previously visited entity in the current session using only the ← button, with each click correctly stepping one entity back.
- **SC-002**: After navigating back N steps, pressing → N times returns the user to the exact entity they started from.
- **SC-003**: The ← and → buttons are visually disabled (not merely hidden) whenever the respective history direction is empty, preventing user confusion about available actions.
- **SC-004**: Loading a **different** ontology file results in both buttons being disabled within one second of the load completing. Refreshing/reloading the same file leaves button state unchanged.
- **SC-005**: Keyboard shortcuts respond within the same latency as toolbar button clicks (no perceptible difference).

## Assumptions

- Navigation history is in-memory only — it is not persisted to disk and does not survive VS Code restarts or extension reloads.
- History is global across all OntoGraph tree view panels (not per-panel); one shared history serves the entire extension session.
- The toolbar buttons appear on the Classes tree view header (the primary OntoGraph panel), consistent with where other primary actions such as Search and Load live.
- The maximum history depth of 50 entries is sufficient for typical ontology editing sessions.
- Keyboard shortcut defaults: `Alt+Left` / `Alt+Right` on Windows/Linux; `Ctrl+-` / `Ctrl+Shift+-` on Mac — these match VS Code's own navigation defaults but are scoped to OntoGraph focus context so they do not conflict.
- Entity focus via the graph visualization webview is out of scope for v1 (graph interactions are a separate subsystem).
