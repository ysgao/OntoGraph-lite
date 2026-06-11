# Research: Open Workspace Folder with Ontology File

## Decision 1: VS Code API for workspace folder management

**Decision**: Use `vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...folders)`

**Rationale**:
- Available since VS Code 1.10; well within extension engine requirements
- Synchronous call (returns `boolean`); workspace change applied asynchronously by VS Code internals
- The only supported extension API for adding/removing workspace folders without a full window reload
- `vscode.commands.executeCommand('vscode.openFolder', ...)` reloads the window — unacceptable, destroys in-memory model

**Alternatives considered**:
- `vscode.commands.executeCommand('vscode.openFolder', uri)` — rejected: triggers full window reload, destroys loaded model
- Asking user to manually open folder — rejected: this is exactly the UX problem being fixed

---

## Decision 2: Add vs. replace when a conflicting workspace folder exists

**Decision**: Always add the new folder; never remove existing workspace folders.

**Rationale**:
- Spec FR-004 and edge case both say "add to multi-root workspace"
- Removing existing roots silently would surprise users with multi-root setups
- VS Code will display both folders in Explorer; user can manually remove stale ones if desired
- `updateWorkspaceFolders(folders.length, 0, { uri: folderUri })` — append at end

**Alternatives considered**:
- Replace single-root workspace: simpler for single-folder users but destroys existing context silently
- Replace all roots: too destructive, breaks multi-root workflows

---

## Decision 3: Timing — when to call `updateWorkspaceFolders`

**Decision**: Call `ensureWorkspaceFolderContains` immediately after `uri` is resolved, before `withProgress` and before file read.

**Rationale**:
- VS Code processes workspace changes asynchronously after the synchronous call returns
- By calling before the (async) file read + parse, the workspace change has maximum time to propagate before the user can interact with the loaded model
- FR-005 requires workspace change to happen "before or together with file load completion"
- No timing issues for `reloadOntology` or file-watcher paths — those already have an established workspace from the initial `loadOntologyFile` call

---

## Decision 4: Integration point — where to place the logic

**Decision**: Add `ensureWorkspaceFolderContains(fileUri: vscode.Uri): void` as a module-level function in `src/commands/loadOntologyFile.ts`.

**Rationale**:
- `loadOntologyFile` is the sole entry point for all user-initiated file loads (toolbar button, command, both use the same registered command handler via `extension.ts:375`)
- `reloadOntology` and file-watcher (`setupFileWatcher`) operate on an already-loaded file — workspace is already set from the initial `loadOntologyFile` call; no change needed there
- A single integration point avoids duplication; co-location with the load function keeps the change easy to review
- No separate module needed for a 10-line helper

**Alternatives considered**:
- Add to `extension.ts` `onLoaded` callback: would also work but scatters the logic
- Separate `src/workspace/` module: overengineered for a single helper function

---

## Decision 5: "Already contained" check

**Decision**: Check `uri.fsPath.startsWith(f.uri.fsPath + path.sep)` for each existing workspace folder.

**Rationale**:
- `path.sep` ensures `/foo/bar` does not falsely match `/foo/baz`
- Case-sensitive on macOS (default HFS+) — acceptable; VS Code uses the same comparison
- Must use `fsPath` (local OS path) not `toString()` (URI string) for correct path prefix matching on Windows (`C:\` paths)

**Alternatives considered**:
- `uri.toString().startsWith(f.uri.toString())`: fails on Windows UNC paths and percent-encoding differences
