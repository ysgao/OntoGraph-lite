# Research: Unsaved Entity Editor Changes Warning (022)

## Decision 1: Dirty-State Communication Channel

**Decision**: Use a synchronous request-response pattern over the existing webview message bus. The extension sends a `'queryDirty'` message to the webview; the webview immediately replies with a `'dirtyState'` message containing `isDirty: boolean`.

**Rationale**: The webview already computes dirty state in `checkForChanges()` (EntityEditorApp.ts:1577) by comparing `JSON.stringify(getCurrentState())` against `lastSavedStateString`. That computation is O(fields) and synchronous in the webview event loop. A query/response round-trip is simpler and more reliable than maintaining a mirrored flag in the extension host (which could drift if messages are dropped or reordered).

**Alternatives considered**:
- *Proactive push on every change*: Webview sends `'dirtyChanged'` on every field edit. Rejected — high message volume, complex debouncing needed, still requires the extension to hold a copy that could desync.
- *Extension mirrors field state*: Extension re-computes dirty itself. Rejected — duplicates field-level logic across two execution contexts; brittle when new field types are added.

---

## Decision 2: Triggering Save From the Extension Host

**Decision**: Add a `'requestSave'` message (extension → webview). The webview's existing `handleSave()` function is invoked in response, producing a `'save'` message back to the extension that flows through the existing save pipeline.

**Rationale**: The extension cannot call `handleSave()` directly (it lives in the webview sandbox). Sending `'requestSave'` reuses 100 % of the existing save code path (field collection, `lastSavedStateString` update, button state reset) without duplication. The extension already receives the `'save'` message; the only addition is a flag that says "after this save completes, proceed with the pending navigation".

**Alternatives considered**:
- *Extension re-reads entity state and persists itself*: Would bypass the webview's dirty-state bookkeeping; the webview's `lastSavedStateString` would be out of sync, causing false dirty warnings on subsequent edits.
- *Separate save API independent of the message bus*: Over-engineered for this use case.

---

## Decision 3: Guard Function Location

**Decision**: Introduce a single async guard function `guardedShowEntityInfo()` in `EntityEditorPanel.ts` (or a dedicated helper imported there). All navigation callsites in `extension.ts` that currently call `showEntityInfo()` directly are replaced with `guardedShowEntityInfo()`.

**Rationale**: `showEntityInfo()` is the single convergence point for all entity loads. Centralising the guard there means new navigation paths added in the future automatically get the guard for free. The function returns `Promise<void>` so it integrates cleanly with async command handlers.

**Callsites to update** (currently bypass the guard):
1. `extension.ts` `onEntitySelected()` (line ~72) — tree-item click
2. `extension.ts` `ontograph.navigateBack` handler (line ~425) — Back button
3. `extension.ts` `ontograph.navigateForward` handler (line ~436) — Forward button
4. `extension.ts` `ontograph.focusEntity` command (line ~406) — graph/search focus
5. `extension.ts` `ontograph.entityEditor` command (line ~525) — right-click context menu

---

## Decision 4: Modal Dialog API

**Decision**: Use `vscode.window.showWarningMessage(message, { modal: true }, 'Save', 'Discard')` and treat a `undefined` (dismissed) result as Cancel.

**Rationale**: This is exactly the pattern used by `promptForDraftDiscard()` (EntityEditorPanel.ts:187), which is already shipping and tested. Reusing it is consistent with the existing VS Code UX. The modal flag blocks all other UI until the user responds, preventing race conditions where the user triggers a second navigation while the first dialog is open.

**Alternatives considered**:
- *Non-modal notification*: Would not block navigation; user could click away and trigger another navigation before responding.
- *Custom webview dialog*: Unnecessary complexity; native VS Code dialogs are more accessible and keyboard-navigable.

---

## Decision 5: Cancel Behaviour and Tree Restoration

**Decision**: When the user cancels, the entity focus must not change. Since `onEntitySelected()` is called from the VS Code tree-view click handler (which has already updated tree-view selection by the time it fires), the extension must call `revealInTreeView(currentIri)` to restore the tree selection to the currently focused entity.

**Rationale**: VS Code's tree-view API fires the selection-change callback only after the tree has already updated visually. To make Cancel feel complete, the tree must be snapped back to the old entity. Feature 021 uses `revealInTreeView()` successfully for this purpose.

---

## Decision 6: Ontology Reload Guard

**Decision**: The reload-ontology path (file watcher or explicit reload command) calls `showEntityInfo()` indirectly when re-opening the previously focused entity. The guard should **not** apply on reload because (a) the file on disk may have changed externally, making the in-editor state stale, and (b) the user explicitly triggered a reload. Instead, on reload, if the editor is dirty, show a simpler notification: "Ontology reloaded — your unsaved edits have been discarded."

**Rationale**: The spec's FR-002 lists reload as a guarded path, but after inspecting the code, a full Save/Discard/Cancel dialog on reload would be disruptive (the user already chose to reload). A simpler advisory message is consistent with how most editors handle external file changes.

**Note**: This is a scope reduction from the spec. The spec's Edge Cases section says "The same warning must appear before loading proceeds" — this should be updated if the simpler notification is accepted by the product owner.

---

## Summary of New Artifacts

| Artifact | Type | Purpose |
|----------|------|---------|
| `'queryDirty'` message | IPC message | Extension → Webview: ask if editor is dirty |
| `'dirtyState'` message | IPC message | Webview → Extension: reply with `isDirty` boolean |
| `'requestSave'` message | IPC message | Extension → Webview: trigger save from extension side |
| `guardedShowEntityInfo()` | Function | Wraps `showEntityInfo()` with dirty check and dialog |
| `pendingNavigation` holder | State variable | Stores deferred navigation target during dialog |
