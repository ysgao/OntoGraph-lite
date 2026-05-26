# Implementation Plan: Reload Ontology from Disk

**Branch**: `010-reload-ontology` | **Date**: 2026-05-26 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/010-reload-ontology/spec.md`

## Summary

Add a **Reload Ontology** command that (a) auto-fires when the ontology file changes on disk (file watcher + 500 ms debounce) and (b) is manually invocable via a toolbar button adjacent to Classify. On reload, the in-memory model is replaced with a freshly parsed version from disk, all tree views are refreshed, and the inferred hierarchy is cleared. On failure, the existing model is preserved and an error message is shown.

Re-uses `ParserRegistry.parseAsync()` and `refreshAllViews()` unchanged; adds one new command file, one module-level watcher variable, and package.json contributions.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js 20  
**Primary Dependencies**: VS Code Extension API (`vscode.FileSystemWatcher`, `vscode.workspace.openTextDocument`), `ParserRegistry.parseAsync` (existing)  
**Storage**: File system only (reads the OWL file from disk)  
**Testing**: Vitest 1.6.0 — `npm test`  
**Target Platform**: VS Code Extension Host (desktop, all OS)  
**Project Type**: VS Code extension  
**Performance Goals**: Reload completes within 5 s for ontologies up to 50,000 classes  
**Constraints**: Must not block extension host thread for large files (Worker Thread via `ParserRegistry.parseAsync`)  
**Scale/Scope**: Single open ontology file; watcher scoped to that specific file path

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ PASS | `reloadOntology.test.ts` written before implementation |
| II. Simplicity & YAGNI | ✅ PASS | One new command file; zero new abstractions; re-uses `parseAsync` and `refreshAllViews` |
| III. OWL Standards Compliance | ✅ PASS | Reload does not touch serializer; round-trip fidelity unaffected |
| IV. Scale-Aware Architecture | ✅ PASS | Large-file parse already dispatched to Worker Thread by `ParserRegistry.parseAsync` |
| V. Security & Safety | ✅ PASS | File read via VS Code API (no shell expansion); no new child-process spawning |

**Post-design re-check**: No violations introduced in Phase 1 design. No complexity tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/010-reload-ontology/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── command-api.md   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code Changes

```text
src/
├── commands/
│   ├── reloadOntology.ts          ← NEW: command implementation
│   └── reloadOntology.test.ts     ← NEW: unit + integration tests
└── extension.ts                   ← MODIFIED: register command, add watcher lifecycle

package.json                       ← MODIFIED: command + menu contributions
```

**Structure Decision**: Single project (VS Code extension). All new code lives in the existing `src/commands/` pattern. No new directories.

## Phase 0: Research Output

See [research.md](research.md) — all unknowns resolved. Key decisions:

| Topic | Decision |
|-------|----------|
| File watcher | `vscode.workspace.createFileSystemWatcher` scoped to specific file URI |
| Debounce | 500 ms `setTimeout` / `clearTimeout` in `extension.ts` |
| Parse | Reuse `ParserRegistry.parseAsync()` unchanged |
| View refresh | Reuse `refreshAllViews()` unchanged |
| Button disable | `setContext('ontograph.reloading', true/false)` + `when` clause |
| Error recovery | Parse into local var; assign to `activeModel` only on success |
| Watcher lifecycle | Dispose old watcher when new ontology opened or extension deactivated |

## Phase 1: Design

### `src/commands/reloadOntology.ts` (new file)

```typescript
export async function reloadOntology(
  activeModel: OntologyModel,
  onReloaded: (model: OntologyModel) => void
): Promise<void>
```

Responsibilities:
1. Read file content via `vscode.workspace.openTextDocument(vscode.Uri.parse(activeModel.sourceUri))`
2. Call `ParserRegistry.parseAsync(doc.getText(), doc.languageId, activeModel.sourceUri)`
3. On success: call `onReloaded(newModel)`
4. On failure: call `vscode.window.showErrorMessage(...)` — do NOT call `onReloaded`

The command does **not** manage progress/context — that is wired in `extension.ts` at the call site, matching how `classifyOntology.ts` works (the command does the work; extension.ts owns lifecycle).

### `src/extension.ts` additions

```typescript
// Module-level additions
let activeFileWatcher: vscode.FileSystemWatcher | undefined;
let reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// New function — wires reloadOntology into shared state
async function executeReload(): Promise<void> {
  if (!activeModel) return;
  await vscode.commands.executeCommand('setContext', 'ontograph.reloading', true);
  vscode.window.setStatusBarMessage('$(loading~spin) OntoGraph: reloading…');
  await reloadOntology(activeModel, (model) => {
    activeModel = model;
    refreshAllViews(model);
    vscode.window.setStatusBarMessage('$(check) Ontology reloaded from disk', 8000);
  });
  await vscode.commands.executeCommand('setContext', 'ontograph.reloading', false);
}

// Inside handleDocument() — after successful parse, create/replace watcher:
activeFileWatcher?.dispose();
activeFileWatcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(vscode.Uri.parse(activeModel.sourceUri), '*')
);
activeFileWatcher.onDidChange(() => {
  clearTimeout(reloadDebounceTimer);
  reloadDebounceTimer = setTimeout(() => executeReload(), 500);
});

// Command registration
context.subscriptions.push(
  vscode.commands.registerCommand('ontograph.reloadOntology', executeReload),
  { dispose: () => activeFileWatcher?.dispose() }
);
```

### `package.json` additions

**Command** (in `contributes.commands`):
```json
{
  "command": "ontograph.reloadOntology",
  "title": "Reload Ontology",
  "icon": "$(refresh)",
  "category": "OntoGraph"
}
```

**Menu** (in `contributes.menus["view/title"]`):
```json
{
  "command": "ontograph.reloadOntology",
  "when": "view == ontograph.classHierarchy && ontograph.ontologyLoaded && !ontograph.reloading",
  "group": "navigation@1"
}
```

### Inferred Hierarchy Clearing

After reload, `refreshAllViews(newModel)` calls `inferredProvider.setModel(newModel)`. If `setModel()` does not clear prior inferred results, an explicit `inferredProvider.clearInferredHierarchy()` (or equivalent) must be added. This is verified and resolved in task T-004.

### Test Plan (`reloadOntology.test.ts`)

| Test | Category | Covers |
|------|----------|--------|
| Calls `parseAsync` with correct uri and content | Unit | FR-002 |
| Calls `onReloaded` with parsed model on success | Unit | FR-003 |
| Does NOT call `onReloaded` on parse failure | Unit | FR-007 |
| Shows error message on parse failure | Unit | FR-007 |
| Does NOT call `onReloaded` on missing file | Unit | FR-007 |
| `executeReload` sets `ontograph.reloading` context | Integration | FR-006 |
| `executeReload` clears `ontograph.reloading` after success | Integration | FR-006, FR-008 |
| `executeReload` clears `ontograph.reloading` after failure | Integration | FR-006, FR-008 |
| Debounce: rapid change events produce single reload | Unit | FR-013 |
| Watcher created on file open, disposed on new file open | Integration | FR-010 |

## Complexity Tracking

*No constitution violations — table omitted.*
