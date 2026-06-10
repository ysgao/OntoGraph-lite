# Research: Fix Entity Editor Stale Display After Save

**Branch**: `016-fix-editor-stale-display` | **Date**: 2026-06-10

## Root Cause

### Save Flow

`EntityEditorPanel.ts` handles the `save` message from the webview in `handleMessage`. The flow is:

1. **Model updated synchronously** (lines 531–605): entity fields (`superClassIris`, `equivalentClassIris`, annotations, etc.) are written to the in-memory model from the save message.
2. **`queueSyncWrite` enqueued** (line 650): async callback that computes the updated text, writes to disk, and — inside the callback — calls `saveHistory.recordSave(newSnapshot, deletedPositions)` (line 727), which sets `history.current = newSnapshot`.
3. **`sendLoadEntity(p, model, msg.iri)` called immediately** (line 746): intended to refresh the webview display.

### Why the Display Is Stale

`sendLoadEntity` reads its payload from:

```typescript
// EntityEditorPanel.ts:896-897
const historySnapshot = entityHistoryMap.get(iri)?.currentSnapshot;
const payload = historySnapshot ?? buildEntityPayload(model, iri);
```

At the moment `sendLoadEntity` fires (line 746), `queueSyncWrite` has been enqueued but **not yet executed** — it runs asynchronously. Therefore `currentSnapshot` in `EntityEditHistory` still holds the **pre-save** state. The `??` fallback to `buildEntityPayload` (which WOULD return fresh data) is never reached because `historySnapshot` is not `null` — it is the old snapshot.

Result: the webview receives a `loadEntity` message with the pre-save data and displays stale axioms.

### Why `recordSave` Is Inside `queueSyncWrite`

`recordSave` takes `deletedPositions` (file line numbers of items removed during the save), which is only known after `computeUpdatedText` runs inside `queueSyncWrite`. This is why the checkpoint cannot be recorded before the async write. However, updating the display snapshot does not need `deletedPositions` — it only needs the fresh entity data.

### Fix

Before `sendLoadEntity` is called (line 746), synchronously update `currentSnapshot` to the fresh model state for regular (non-autoSave) saves:

```typescript
// Synchronously update currentSnapshot so sendLoadEntity shows post-save state.
// recordSave() inside queueSyncWrite will later promote this to a full undo
// checkpoint with deletedPositions; this just ensures the display is correct.
if (saveHistory && !isAutoSave) {
  const freshSnapshot = buildEntityPayload(model, msg.iri);
  if (freshSnapshot) { saveHistory.updateCurrentSnapshot(freshSnapshot); }
}
sendLoadEntity(p, model, msg.iri);
```

`updateCurrentSnapshot` (already exists in `EntityEditHistory`) replaces `this.current` without touching the undo/redo stacks — safe to call here. Later, `recordSave` inside `queueSyncWrite` will push the pre-save state onto the undo stack and set `current` again with `deletedPositions` — this second assignment to `current` is idempotent (same fresh snapshot) and does not break undo.

### Why autoSave Is Not Affected

For `isAutoSave=true` (undo/redo-triggered saves), the webview already received the target snapshot via the explicit `loadEntity` message posted in the undo/redo handlers (lines 438, 452). The `sendLoadEntity` at line 746 fires after that and sends the same old snapshot — but since the webview was already showing that state, there is no visible stale display. The autoSave path is correct as-is.

### Files Changed

| File | Change |
|------|--------|
| `src/views/EntityEditorPanel.ts` | Add `updateCurrentSnapshot` call before `sendLoadEntity` in the non-autoSave path (~4 lines) |

No other files need changes. `EntityEditHistory.ts`, sync layer, and webview are all unchanged.
