# Contract: Entity Editor Message Types (Undo/Redo additions)

**Feature**: 014-entity-editor-undo-redo  
**Date**: 2026-06-02  
**File to modify**: `src/views/EntityEditorMessages.ts`

This document describes the three new message types added to the existing bidirectional message bus between the entity editor webview and the extension host.

---

## New Messages: Webview → Extension

### UndoRequestMessage

Sent when the user clicks the Undo button or triggers the Undo keyboard shortcut in the entity editor.

```typescript
interface UndoRequestMessage {
  type: 'undoRequest';
}
```

**Precondition**: `canUndo` was `true` in the most recent `UndoRedoStateMessage`.  
**Effect**: Extension pops the top of the undo stack, pushes current display state onto redo stack, and sends a `LoadEntityMessage` with the popped snapshot plus an updated `UndoRedoStateMessage`.

---

### RedoRequestMessage

Sent when the user clicks the Redo button or triggers the Redo keyboard shortcut.

```typescript
interface RedoRequestMessage {
  type: 'redoRequest';
}
```

**Precondition**: `canRedo` was `true` in the most recent `UndoRedoStateMessage`.  
**Effect**: Extension pops the top of the redo stack, pushes current display state onto undo stack, and sends a `LoadEntityMessage` with the popped snapshot plus an updated `UndoRedoStateMessage`.

---

## New Messages: Extension → Webview

### UndoRedoStateMessage

Sent after every save, undo, redo, or entity load to synchronize button enabled/disabled state in the webview.

```typescript
interface UndoRedoStateMessage {
  type: 'undoRedoState';
  canUndo: boolean;
  canRedo: boolean;
}
```

**When sent**:
- After a successful save (always `canRedo: false` immediately post-save)
- After a successful undo
- After a successful redo
- After the initial entity load (always `canUndo: false`, `canRedo: false`)

**Webview response**: Enable/disable Undo and Redo toolbar buttons and update keyboard shortcut handlers accordingly.

---

## Existing Message Used for Restore

### LoadEntityMessage (existing — no type change)

The existing `LoadEntityMessage` (Extension → Webview) is reused to restore editor state on undo/redo. The extension constructs a `LoadEntityMessage` from the popped `EntitySnapshot` and sends it via `postMessage`. The webview already handles this message for initial entity loading — no new webview rendering logic is required.

**Constraint**: When sent for undo/redo restore (not initial load), the webview MUST NOT trigger auto-scroll or focus-steal behavior. This distinction is signalled by an optional field:

```typescript
// Addition to existing LoadEntityMessage:
interface LoadEntityMessage {
  // ... existing fields ...
  restoreContext?: 'undo' | 'redo';  // present only on undo/redo restore
}
```

When `restoreContext` is present, the webview skips any initial-load side effects (e.g., focus on first label field).

---

## Message Flow Diagram

```
User clicks Save
  Webview  ──[SaveEntityMessage]──────────────────→  Extension
  Extension captures snapshot, updates history
  Extension applies save to model + disk
  Extension ──[UndoRedoStateMessage(canUndo=T)]──→  Webview
  Webview enables Undo button

User clicks Undo
  Webview  ──[UndoRequestMessage]────────────────→  Extension
  Extension pops undo stack, pushes redo stack
  Extension ──[LoadEntityMessage(restoreContext='undo')]→ Webview
  Extension ──[UndoRedoStateMessage]──────────────→  Webview
  Webview renders restored snapshot
  Webview updates button states

User clicks Save (after undo)
  Webview  ──[SaveEntityMessage]──────────────────→  Extension
  Extension captures snapshot, clears redo stack
  Extension applies save to model + disk
  Extension ──[UndoRedoStateMessage(canRedo=F)]──→  Webview
  Webview disables Redo button
```
