# Data Model: Unsaved Entity Editor Changes Warning (022)

## Key Entities

### 1. DirtyState (Webview-side)

Lives in `EntityEditorApp.ts`.

| Field | Type | Description |
|-------|------|-------------|
| `lastSavedStateString` | `string` | JSON snapshot of the entity's last persisted or loaded state. Already exists (line 122). Used as baseline for dirty comparison. |
| `isDirty` | `boolean` (derived) | `JSON.stringify(getCurrentState()) !== lastSavedStateString`. Computed on demand by `checkForChanges()` (line 1577). Not stored separately; re-derived on query. |

**State transitions**:
- Set **clean** (`lastSavedStateString = JSON.stringify(getCurrentState())`) on:
  - Entity load (`renderEntity()`) — after populating all fields
  - Successful save (`handleSave()` line 1666)
  - `requestSave` completion (new, same code path as `handleSave`)
- Remains **dirty** until one of the above events clears it

### 2. PendingNavigation (Extension-side)

Lives in `EntityEditorPanel.ts` as module-level state (alongside existing `lastIri`).

| Field | Type | Description |
|-------|------|-------------|
| `pendingNavigationIri` | `string \| null` | IRI of the entity the user wants to navigate to, held while the guard dialog is open. Cleared after resolution. |
| `pendingNavigationCallback` | `(() => void) \| null` | Optional extra callback to run after navigation completes (e.g., `revealInTreeView`). |

**State transitions**:
- Set when `guardedShowEntityInfo()` detects a dirty editor and shows the dialog
- Cleared (set to `null`) when the user picks Save, Discard, or Cancel
- Never accumulates — only one pending navigation exists at a time (modal dialog blocks further interaction)

### 3. DirtyQueryContext (Transient, Extension-side)

A short-lived Promise resolver used during the query-response round-trip.

| Field | Type | Description |
|-------|------|-------------|
| `dirtyQueryResolve` | `((isDirty: boolean) => void) \| null` | Resolve function of the in-flight `queryDirty` Promise. Set when extension sends `queryDirty`; called when webview replies with `dirtyState`. |

**Lifecycle**: created → resolved in < 1 event loop cycle (webview responds synchronously relative to the extension's message queue).

---

## Message Contracts (New)

### Extension → Webview

```typescript
// New message type
interface QueryDirtyMessage {
  type: 'queryDirty';
}

// New message type
interface RequestSaveMessage {
  type: 'requestSave';
}
```

### Webview → Extension

```typescript
// New message type
interface DirtyStateMessage {
  type: 'dirtyState';
  isDirty: boolean;
}
```

These are added to `EntityEditorMessages.ts` alongside existing message types.

---

## Validation Rules

- `pendingNavigationIri` MUST be `null` before a new guard dialog is opened (enforced by the modal blocking further UI events).
- `dirtyQueryResolve` MUST be cleared to `null` immediately after resolution to prevent stale resolvers from being called by a late `dirtyState` reply.
- `isDirty` is re-computed fresh on each `queryDirty` request — there is no stale cached value.

---

## State Diagram: Guard Flow

```
User triggers navigation (tree click / Back / Forward)
      │
      ▼
guardedShowEntityInfo(targetIri)
      │
      ├─ [No panel open or no entity loaded] ──────────────────► showEntityInfo(targetIri) directly
      │
      ├─ [Panel open, targetIri === currentIri] ───────────────► no-op
      │
      └─ [Panel open, targetIri ≠ currentIri]
              │
              ▼
         Send 'queryDirty' to webview
              │
              ▼
         Await 'dirtyState' response
              │
              ├─ isDirty = false ──────────────────────────────► showEntityInfo(targetIri)
              │
              └─ isDirty = true
                      │
                      ▼
                 Show modal: "Unsaved changes — Save / Discard / Cancel"
                      │
                      ├─ Save ──► Send 'requestSave' to webview
                      │           Await 'save' message processed by extension
                      │           On success ──► showEntityInfo(targetIri)
                      │           On failure ──► show error, abort navigation
                      │
                      ├─ Discard ──► showEntityInfo(targetIri)  [changes lost]
                      │
                      └─ Cancel / dismiss ──► revealInTreeView(currentIri)
                                              [no navigation, edits preserved]
```
