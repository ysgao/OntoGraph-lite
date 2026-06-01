# Research: Load Large Ontology Files

**Branch**: `012-load-large-ontology`
**Phase**: 0 — Research

---

## Decision 1: How to read large file content

**Decision**: Use `vscode.workspace.fs.readFile(uri)` + `new TextDecoder().decode(bytes)`.

**Rationale**: VS Code's visual text editor blocks display of files above ~50 MB via `workbench.editor.largeFileOptimizations`. However, `vscode.workspace.fs.readFile` is a raw byte-level API that has no such limit. `workspace.openTextDocument` + `doc.getText()` will return empty content for files the editor considers too large. Using `vscode.workspace.fs.readFile` sidesteps this restriction and also works for smaller files, so `loadOntologyFile` and the updated `reloadOntology` use this API exclusively.

**Alternatives considered**:
- `workspace.openTextDocument` + `doc.getText()`: Works for small files; returns empty for large files. Rejected because the new command targets exactly those large files.
- Node.js `fs.promises.readFile`: Works, but `vscode.workspace.fs` is the VS Code-idiomatic API for file access and handles virtual file systems correctly.

---

## Decision 2: Write-back (sync) for large files

**Decision**: Before calling `syncAnnotationsToDocument` / `syncAxiomsToDocument`, open the document programmatically via `workspace.openTextDocument(uri)`. VS Code's programmatic open does not have the same size restriction as the visual editor (the limit is on rendering, not on in-memory model). If `doc.getText()` is unexpectedly empty (file > ~500 MB where even programmatic load fails), surface a clear error. No new document abstraction layer needed for P3.

**Rationale**: `vscode.workspace.openTextDocument` opens a file as an in-memory text buffer regardless of visual editor restrictions. This is well-documented VS Code API behaviour. The sync functions then build a `WorkspaceEdit` and apply it via `workspace.applyEdit`, which writes atomically to disk without requiring the editor tab to be open. This keeps P3 scope minimal and avoids a premature `TextDocument` abstraction.

**Alternatives considered**:
- Adapter/duck-type shim over raw text: Cleaner for testing, but doubles the scope of P3 and crosses the YAGNI boundary. Save for if the programmatic-open approach proves unreliable at 200 MB+.
- `fs.writeFile` after manual text splice: Bypasses VS Code's undo stack entirely; risky.

**Open risk**: Behaviour of `workspace.openTextDocument` above ~200 MB needs empirical verification. If `doc.getText()` returns empty for the target scale (SNOMED CT snapshot), we revisit this decision and implement the adapter.

---

## Decision 3: Large-file detection (FR-008)

**Decision**: Listen on `vscode.window.onDidChangeActiveTextEditor`. When the active editor's document has an ontology extension AND `doc.getText().length === 0` AND `doc.uri.fsPath` is a local file, stat the file: if size > `LARGE_FILE_NOTIFICATION_THRESHOLD` (10 MB), show the notification. Track notified URIs in a `Set<string>` to suppress repeats.

**Rationale**: VS Code fires `onDidChangeActiveTextEditor` when a user opens a file in the editor (via File → Open, drag-drop, Explorer click). For large files the editor cannot display, the document is visible as a tab but its `getText()` returns `""`. Checking file size via `vscode.workspace.fs.stat` distinguishes the empty-large-file case from a genuinely empty ontology file. A 10 MB threshold is well below the 50 MB+ files this feature targets and above any realistic empty-ontology false positive.

**Alternatives considered**:
- Parse VS Code's `workbench.editor.largeFileOptimizations` or `editor.maxTokenizationLineLength` settings: fragile, depends on user config.
- Checking `doc.getText().length < 1000` instead of `=== 0`: too broad; small ontology files exist.

---

## Decision 4: Toolbar button placement

**Decision**: Add `ontograph.loadOntologyFile` to `view/title` menu for both `ontograph.classes` and `ontograph.inferredClasses` at `group: "navigation@-1"` so it appears before the existing Classify button (group `navigation@0`).

**Rationale**: The spec (FR-002) requires the button in both the Classes Hierarchy and Inferred Hierarchy panel toolbars, positioned before Classify. The VS Code `view/title` `navigation` group uses `@N` suffixes for ordering; lower N renders leftmost.

**Icon chosen**: `$(folder-opened)` — communicates "open file" without conflicting with existing icons (refresh=`$(refresh)`, classify=`$(symbol-class)`, reload=`$(refresh)`).

---

## Decision 5: Progress indicator

**Decision**: Use `vscode.window.withProgress` with `ProgressLocation.Notification` for the load operation. Pass a `CancellationToken` but do not wire cancellation into `parseAsync` (Worker Thread cancellation is not implemented; adding it is out of scope for P1). Show "Loading: <filename>" in the progress title.

**Rationale**: `withProgress` with `Notification` shows a toast with a progress spinner — exactly the right affordance for a 10–60 second operation. No changes to `parseAsync` needed. FR-005 requires visible progress; FR-001 user story 1 acceptance scenario 5 says a second invocation cancels gracefully — this is handled by checking `isLoading` state and ignoring/cancelling the second call, not by wiring the cancellation token into the parser.

---

## Decision 6: Guard against concurrent loads

**Decision**: Add a module-level `isLoading` boolean in `loadOntologyFile.ts`. If `isLoading === true` when the command is invoked again, show an info message "A load is already in progress" and return early.

**Rationale**: Spec acceptance scenario 5 (user story 1) requires graceful handling of concurrent invocations. `isLoading` guard is the minimal safe implementation.
