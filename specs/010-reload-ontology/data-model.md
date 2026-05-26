# Data Model: Reload Ontology from Disk

## No New Data Structures

This feature introduces no new entities or data structures. It operates on the existing module-level state in `src/extension.ts`.

## Existing State Touched

### `activeModel: OntologyModel | undefined` (`extension.ts:25`)

- **On reload success**: replaced with the freshly parsed `OntologyModel` from disk.
- **On reload failure**: left unchanged.
- Key field used by reload: `activeModel.sourceUri: string` — the file path to re-read.

### `activeIndex: OntologyIndex | undefined` (`extension.ts:26`)

- **On reload success**: rebuilt from the new `activeModel` inside `refreshAllViews()`.
- **On reload failure**: left unchanged.

### New module-level variable: `activeFileWatcher: vscode.FileSystemWatcher | undefined`

- Created in `handleDocument()` after a successful initial parse of an ontology file.
- Disposed and replaced when a different ontology file is opened.
- Disposed on extension deactivation.
- Listens for `onDidChange` events on the specific file path of `activeModel.sourceUri`.

### New module-level variable: `reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined`

- Holds the pending debounce timer for coalescing rapid file-change events.
- Cleared and reset on each `onDidChange` event.
- When the timer fires (after 500 ms of quiet), the reload is executed.

## State Transitions

```
[Ontology Loaded]
      │
      ├─── File changes on disk
      │         │
      │         └─→ debounce 500ms
      │                   │
      │                   └─→ parseAsync()
      │                            │
      │                  ┌─────────┴──────────┐
      │                  │ success             │ failure
      │                  ↓                    ↓
      │         [Model replaced]      [Model unchanged]
      │         [Views refreshed]     [Error shown]
      │         [Inferred cleared]
      │
      ├─── User clicks Reload button
      │         │
      │         └─→ parseAsync()
      │                  │
      │         ┌─────────┴──────────┐
      │         │ success             │ failure
      │         ↓                    ↓
      │[Model replaced]      [Model unchanged]
      │[Views refreshed]     [Error shown]
      │[Inferred cleared]
      │
      └─── New ontology opened
                │
                └─→ Old watcher disposed → new watcher created
```
