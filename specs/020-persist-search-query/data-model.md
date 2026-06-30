# Data Model: Persist Entity Search Query

**Feature**: 020-persist-search-query
**Date**: 2026-06-30

---

## Search State

| Field | Type | Default | Scope | Notes |
|-------|------|---------|-------|-------|
| `lastSearchQuery` | `string` | `''` | Module-level in `extension.ts` | In-session only; not persisted to disk |

### Validation Rules

- Any string value is valid (no length limit enforced at the storage layer).
- Empty string `''` is the canonical "no query" state — treated identically to first-use.

### State Transitions

```
[no query / first use]
       │
       ▼
  lastSearchQuery = ''
       │
  User types in QuickPick
       │
       ▼
  lastSearchQuery = user input (updated on every onDidChangeValue)
       │
  User closes QuickPick (accepted or cancelled)
       │  (no change — last value is retained)
       │
  User opens QuickPick again
       │
       ▼
  QuickPick pre-filled with lastSearchQuery; search auto-executed
       │
  User clears field → types nothing → closes
       │
       ▼
  lastSearchQuery = ''   (cleared state is persisted)
       │
  New ontology loaded (loadOntologyFile / reloadOntology succeeds)
       │
       ▼
  lastSearchQuery = ''   (scope reset)
```

### Scope Boundaries

- **Retained across**: QuickPick close/reopen within the same session and same ontology.
- **Reset to `''` on**: New ontology file loaded or reloaded via any path (file open, command, file watcher).
- **Not persisted**: VS Code window restart, extension host restart.
