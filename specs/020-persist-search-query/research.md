# Research: Persist Entity Search Query

**Feature**: 020-persist-search-query
**Date**: 2026-06-30

---

## Decision 1: Which search mechanism to target?

**Decision**: Target the QuickPick-based entity search (`ontograph.searchEntity` command).

**Rationale**: `SearchWebviewProvider` is defined in `src/views/SearchWebviewProvider.ts` but is **not registered** — no `vscode.window.registerWebviewViewProvider()` call exists and no `views` entry is in `package.json`. The only active entity search mechanism exposed to users is the VS Code QuickPick launched by `ontograph.searchEntity` (extension.ts lines 347–377). Persisting state in the QuickPick requires no new panel registration and is the minimal-scope solution.

**Alternatives considered**:
- Register `SearchWebviewProvider` as a sidebar panel and persist state there — rejected because it expands scope beyond what the spec requests (the spec says "entity search panel", referring to the existing search UX, not a new panel).

---

## Decision 2: Where to store the last search string?

**Decision**: Module-level `let lastSearchQuery = ''` variable in `src/extension.ts` (or co-located with the command handler), reset to `''` when the active ontology index changes.

**Rationale**:
- VS Code extension host process lifetime matches "current VS Code session" (spec FR-001).
- No disk I/O needed; `vscode.ExtensionContext.workspaceState` / `globalState` would survive restarts, which the spec explicitly excludes.
- Resetting on index change (new ontology loaded) satisfies FR-006 (scoped to active ontology session). The `loadOntologyFile` and `reloadOntology` paths already update `activeIndex`; a reset hook can be placed where `setRefreshAllViews` / `buildModelSegmentIndex` is called after a load.

**Alternatives considered**:
- `vscode.ExtensionContext.workspaceState` (disk-persisted per workspace) — rejected because spec says in-session only.
- Instance variable on a command class — rejected because the command is a plain function registered in `extension.ts`, not a class; a module-level variable is the natural fit.

---

## Decision 3: How to pre-populate and auto-execute the QuickPick?

**Decision**: Set `quickPick.value = lastSearchQuery` before `quickPick.show()`, then immediately call the internal search helper to populate initial results, mirroring the existing `onDidChangeValue` handler.

**Rationale**:
- VS Code's `QuickPick.value` property is writable before `show()`. Setting it pre-populates the field without extra events.
- Calling the search helper with the stored query immediately after `show()` displays results without requiring a keypress (satisfies FR-003).
- The existing debounce (180 ms) on `onDidChangeValue` is not triggered by a programmatic `value` set, so the explicit call is necessary.

**Alternatives considered**:
- Firing a synthetic `onDidChangeValue` event — not possible with the VS Code API; VS Code does not emit `onDidChangeValue` on programmatic `value` assignment.

---

## Decision 4: When to reset the stored query?

**Decision**: Reset `lastSearchQuery = ''` in the existing `setRefreshAllViews` callback (called after every `loadOntologyFile` / `reloadOntology` success), as that is already the canonical "new ontology loaded" signal in `extension.ts`.

**Rationale**: The `setRefreshAllViews` callback is called in `activate()` and passed to `loadOntologyFile` / `handleDocument`; it is always invoked when the active index changes. Placing the reset there covers all paths (drag-drop open, command open, file-watcher reload) without duplicating reset logic.

**Alternatives considered**:
- Resetting in `onDidChangeActiveTextEditor` — unreliable; the index may not have updated yet.
- Resetting on every `activeIndex` reassignment — would require a setter wrapper; over-engineered for the scope.

---

## Findings: `SearchWebviewProvider` future compatibility

If `SearchWebviewProvider` is registered in a future feature, persistence there would require:
1. Storing `lastSearchQuery` in the provider instance (it is recreated per-webview-resolve).
2. Sending a `{ type: 'restore', query: string }` message immediately after webview HTML is loaded.
3. NOT sending `{ type: 'clear' }` in `setIndex()` when the query should be preserved.

This is out of scope for 020 but documented here to avoid rework.
