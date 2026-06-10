# Implementation Plan: Open Workspace Folder with Ontology File

**Branch**: `017-open-workspace-folder`
**Spec**: [spec.md](spec.md)
**Research**: [research.md](research.md)

---

## Technical Context

| Item | Detail |
|------|--------|
| Touch files | `src/commands/loadOntologyFile.ts` |
| New test file | `src/commands/loadOntologyFile.test.ts` |
| VS Code API | `vscode.workspace.updateWorkspaceFolders`, `vscode.workspace.workspaceFolders` |
| Node built-in | `path` (for `path.sep`) |
| No changes needed | `src/commands/reloadOntology.ts`, `src/extension.ts`, file-watcher |

---

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Decoupled UI Core | Pass | No webview or app-layer changes |
| II. IPC-Only Communication | Pass | No network calls; uses VS Code workspace API only |
| III. Webview Path Safety | Pass | No webview changes |
| IV. Test-First Integration | Applies | Tests written before implementation (TDD) |

---

## Design

### Helper function

```typescript
// src/commands/loadOntologyFile.ts  (module-level addition)
import * as path from 'path';

function ensureWorkspaceFolderContains(fileUri: vscode.Uri): void {
  const folderUri = vscode.Uri.joinPath(fileUri, '..');
  const folders = vscode.workspace.workspaceFolders;
  if (folders) {
    const fsPath = fileUri.fsPath;
    const contained = folders.some(
      f => fsPath.startsWith(f.uri.fsPath + path.sep) || fsPath === f.uri.fsPath,
    );
    if (contained) return;
  }
  const insertAt = folders?.length ?? 0;
  vscode.workspace.updateWorkspaceFolders(insertAt, 0, { uri: folderUri });
}
```

### Integration point

In `loadOntologyFile`, after `uri` is resolved and before `withProgress`:

```typescript
// After: uri = result[0];  (or prefillUri assignment)
ensureWorkspaceFolderContains(uri);
// Then: await vscode.window.withProgress(...)
```

---

## Tasks

### [ ] T1 — Write failing tests for `ensureWorkspaceFolderContains`

**Files**: `src/commands/loadOntologyFile.test.ts`

Tests to cover (mock `vscode.workspace`):
1. No workspace folders → calls `updateWorkspaceFolders(0, 0, { uri: parentFolder })`
2. File already inside workspace folder → does NOT call `updateWorkspaceFolders`
3. File outside existing workspace folder → calls `updateWorkspaceFolders(1, 0, { uri: parentFolder })` (append)
4. File path equals workspace folder root exactly → treated as contained, no-op
5. Path prefix false-positive → `/foo/bar2` NOT contained by `/foo/bar`

**Red phase**: Confirm tests fail before implementation.

---

### [ ] T2 — Implement `ensureWorkspaceFolderContains` in `loadOntologyFile.ts`

**Files**: `src/commands/loadOntologyFile.ts`

Changes:
- Add `import * as path from 'path';`
- Add `ensureWorkspaceFolderContains(fileUri: vscode.Uri): void` function
- Call `ensureWorkspaceFolderContains(uri)` after `uri` is resolved, before `withProgress`

**Green phase**: All T1 tests must pass.

---

### [ ] T3 — Type-check and build

```bash
npm run compile
npm run build
```

No type errors, no build errors.

---

### [ ] T4 — Manual smoke test

1. Open VS Code with no folder open
2. Use OntoGraph toolbar to load `test-ontologies/animals.omn`
3. Verify Explorer shows `test-ontologies/` folder; Source Control shows git status
4. Load `test-ontologies/bfo-core.ofn` (same folder) → workspace unchanged (no-op)

---

## Commit Plan

| Commit | Type | Message |
|--------|------|---------|
| T1+T2 | feat | `feat(loadOntologyFile): set workspace folder when loading ontology file` |

---

## Out of Scope

- No changes to `reloadOntology.ts` — operates on already-loaded file
- No changes to `setupFileWatcher` — correct folder post-load
- No git operations (stage, commit) — spec excludes
- No UI changes
