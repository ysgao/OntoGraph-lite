# Research: Reload Ontology from Disk

## File Watcher: VS Code FileSystemWatcher

**Decision**: Use `vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, uri.fsPath))` scoped to the specific open file, not a glob pattern across the workspace.

**Rationale**: Watching only the specific file path eliminates false triggers from unrelated files and avoids the overhead of scanning the full workspace. The LSP client already uses a glob-based watcher for diagnostics (`src/lsp/client.ts`) — the reload watcher is intentionally narrower.

**Alternatives considered**:
- `onDidSaveTextDocument` — only fires for edits made inside VS Code; misses git pull writes done by the OS (external process).
- `onDidChangeTextDocument` — in-memory edits only; doesn't detect external file changes.
- Polling on a timer — wasteful, introduces latency, not idiomatic in VS Code.

---

## Parse Reuse: `ParserRegistry.parseAsync`

**Decision**: Reuse `ParserRegistry.parseAsync(content, languageId, uri)` (`src/parser/ParserRegistry.ts:23`) as the sole parse entry point for reload.

**Rationale**: This function already handles format detection, Worker Thread dispatch for large files (>5 MB), and returns a `Promise<OntologyModel>`. No new parse path is needed.

**How reload reads the file**: `vscode.workspace.openTextDocument(uri)` returns the on-disk content (not the in-memory buffer) when the file is changed externally. The `languageId` is already stored on the returned `TextDocument`.

---

## View Refresh: `refreshAllViews`

**Decision**: Reuse the existing `refreshAllViews()` function at `src/extension.ts:111-120` to update all six tree providers after a successful reload.

**Rationale**: `refreshAllViews()` already rebuilds `activeIndex` and calls `setModel()` on every provider in a single call. No new fan-out logic is needed.

**Inferred hierarchy clearing**: The inferred hierarchy is populated separately (by classify). After reload it must be explicitly cleared so stale inferences are not shown. This requires calling the equivalent of `inferredProvider.setModel(model)` with a fresh (unclassified) model — need to verify that `setModel()` alone clears inferred data, or add an explicit clear call.

---

## Debounce: Coalescing Rapid Change Events

**Decision**: Debounce file-watcher events with a 500 ms delay using `setTimeout` / `clearTimeout` in extension.ts.

**Rationale**: git pull on a large file writes in multiple OS-level chunks, each of which triggers a `FileSystemWatcher.onDidChange` event. Without debouncing, the extension would attempt several concurrent parses. 500 ms is enough to let git finish writing while remaining imperceptible to users.

**Alternatives considered**:
- `onDidChange` with an in-progress lock — prevents concurrent parses but still fires once per chunk. Debounce is simpler and avoids wasted parse attempts entirely.

---

## Command and UI Placement

**Decision**: Register `ontograph.reloadOntology` with icon `$(refresh)`, placed in the `view/title` menu for the Classes tree view at `group: "navigation@1"` (beside Classify at @0).

**Rationale**: The Classes view is always visible when an ontology is open, making the button always accessible. The Classify button is at @0 (leftmost); Reload at @1 places it immediately adjacent as specified.

**Button disabling during reload**: Use `vscode.commands.executeCommand('setContext', 'ontograph.reloading', true/false)` with a `when` clause on the menu item. This grays out the button during an in-progress reload, matching the behavior described in FR-006.

---

## Error Recovery: In-Memory Model Unchanged on Failure

**Decision**: Parse into a local variable first; only assign to `activeModel` on success. On error, display `vscode.window.showErrorMessage(...)` and leave `activeModel` and `activeIndex` untouched.

**Rationale**: Guarantees FR-007. The existing `handleDocument()` pattern (`extension.ts:323-386`) follows the same approach: `const model = await ParserRegistry.parseAsync(...)` then assign. Reload mirrors this.

---

## Watcher Lifecycle

**Decision**: Create one watcher per active file; dispose the previous watcher when a new ontology is opened, and dispose on extension deactivation.

**Rationale**: Prevents memory leaks and phantom change events after the user switches to a different ontology file. The watcher is stored in a module-level variable alongside `activeModel`.
