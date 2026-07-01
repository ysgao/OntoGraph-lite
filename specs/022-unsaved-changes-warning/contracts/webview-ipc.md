# Webview IPC Contract: Entity Editor Dirty Guard (022)

This document describes the three new message types added to the Entity Editor
IPC protocol for feature 022. All existing message types (defined in
`src/views/EntityEditorMessages.ts`) remain unchanged.

---

## 1. `queryDirty` — Extension → Webview

**Purpose**: Ask the Entity Editor webview whether it has unsaved changes.

```typescript
interface QueryDirtyMessage {
  type: 'queryDirty';
}
```

**Trigger**: Sent by `guardedShowEntityInfo()` in `EntityEditorPanel.ts` when the
user initiates a navigation away from the currently focused entity.

**Expected response**: The webview MUST respond with a `dirtyState` message
within one event-loop cycle of receiving this message.

**Side effects**: None. This is a read-only query.

---

## 2. `dirtyState` — Webview → Extension

**Purpose**: Reply to a `queryDirty` request.

```typescript
interface DirtyStateMessage {
  type: 'dirtyState';
  isDirty: boolean;
}
```

**`isDirty`**: `true` if `JSON.stringify(getCurrentState()) !== lastSavedStateString`,
i.e., the user has made at least one change that has not been saved to file.
`false` otherwise (including when the entity editor has no entity loaded).

**Sent by**: The webview's `window.addEventListener('message', ...)` handler in
`EntityEditorApp.ts`, case `'queryDirty'`.

**Contract invariant**: The webview MUST NOT batch or defer this message. It is
sent synchronously within the message handler to avoid the extension timing out
waiting for a response.

---

## 3. `requestSave` — Extension → Webview

**Purpose**: Command the Entity Editor webview to save the current entity, as
if the user had clicked the Save button.

```typescript
interface RequestSaveMessage {
  type: 'requestSave';
}
```

**Trigger**: Sent by `guardedShowEntityInfo()` after the user chooses "Save" in
the dirty-guard modal dialog.

**Expected behaviour**: The webview calls `handleSave()`, which:
1. Collects the current form state via `getCurrentState()`
2. Updates `lastSavedStateString` (marking the editor clean)
3. Posts a `save` message back to the extension with the full `SaveEntityMessage` payload

**Side effects**: Same as a user-initiated save. The extension's existing `'save'`
message handler in `EntityEditorPanel.ts` processes the payload identically.

**Post-save navigation**: After the extension successfully processes the `save`
message triggered by a `requestSave`, it calls `showEntityInfo(pendingNavigationIri)`
to complete the deferred navigation. On write failure, the extension shows an
error notification and clears `pendingNavigationIri` without navigating.

---

## Message Sequence: Save-then-Navigate

```
Extension                         Webview
    │                               │
    │──── 'queryDirty' ────────────►│
    │◄─── 'dirtyState' {true} ──────│
    │                               │
    │  [shows modal dialog]         │
    │  [user picks Save]            │
    │                               │
    │──── 'requestSave' ───────────►│
    │                  [handleSave()]
    │◄─── 'save' {payload} ─────────│
    │                               │
    │  [writes to file via AxiomSync/AnnotationSync]
    │  [on success:]                │
    │──── 'loadEntity' {targetIri}►│
    │                               │
```

## Message Sequence: Discard-then-Navigate

```
Extension                         Webview
    │                               │
    │──── 'queryDirty' ────────────►│
    │◄─── 'dirtyState' {true} ──────│
    │                               │
    │  [shows modal dialog]         │
    │  [user picks Discard]         │
    │                               │
    │──── 'loadEntity' {targetIri}►│
    │                               │
```

## Message Sequence: Cancel

```
Extension                         Webview
    │                               │
    │──── 'queryDirty' ────────────►│
    │◄─── 'dirtyState' {true} ──────│
    │                               │
    │  [shows modal dialog]         │
    │  [user picks Cancel]          │
    │                               │
    │  [revealInTreeView(currentIri)]
    │  [no message sent]            │
    │                               │
```
