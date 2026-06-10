# Research: Remove Authoring-UI Integration

**Branch**: `015-remove-authoring-ui-integration` | **Date**: 2026-06-10

## Root Cause Analysis

### Architecture

`OntoGraphEditor` (`/Users/yoga/OntoGraphEditor`, extension ID `ontograph.ontograph-editor-extension`) is a monorepo that:
- Contains `apps/OntoGraph-lite` — a working copy of this repo used for integrated development
- Contains `apps/authoring-ui-vscode` — the SNOMED CT authoring UI
- Has its own `extension/` — a VS Code extension that registers an IPC bridge and re-registers all `ontograph.*` commands via `extension/src/graph/activateGraph.ts`

### How the Error Occurs

When both `ysgao.ontograph-lite` and `ontograph.ontograph-editor-extension` are installed in the same VS Code instance:

1. OntoGraph-lite activates first, registers `ontograph.searchEntity` (and 14 other commands)
2. OntoGraphEditor activates, calls `activateGraph(context)` which tries to register the same `ontograph.*` commands
3. VS Code throws: `Activating extension 'ontograph.ontograph-editor-extension' failed: command 'ontograph.searchEntity' already exists.`

**OntoGraphEditor already acknowledges this conflict**: its `.vscode/launch.json` contains `"--disable-extension=ysgao.ontograph-lite"`, disabling the standalone OntoGraph-lite when developing/running OntoGraphEditor.

### What Was Pushed Into This Repo

During integrated development, OntoGraphEditor's `apps/OntoGraph-lite` diverged from the standalone. The integration-specific code consisted of:

| Code | Purpose | Status in standalone |
|------|---------|---------------------|
| `suppressNextSelection` flag + `extractSctid()` | Suppress tree reveal when IPC triggers focus | Already removed |
| `fromIpc` parameter on `focusEntity` command | Skip sidebar focus when called from IPC | Already removed |
| `fromIpc` guards on `view.reveal()` calls | Don't bring views to front during IPC navigation | Already removed |
| `ontographEditor.ipcRoute` dispatch on graph node click | Send node selection to authoring UI | Already removed from `extension.ts` |
| `preserveFocus` parameter on `showEntityInfo` | Load entity silently (no panel reveal) for IPC nav | Already removed |
| `updateGraphPanel()` export in `openVisualization.ts` | Called by `activateGraph.ts` to sync graph on model change | **Still present — unused** |
| `// Nothing for now — could reveal in tree` comment | Vestigial from IPC dispatch removal | **Still present** |

### Remaining Integration Artifacts

Only two items remain in the standalone OntoGraph-lite:

**`src/commands/openVisualization.ts:58`**
```typescript
} else if (msg.type === 'nodeClicked') {
  // Nothing for now — could reveal in tree
}
```
The comment is a leftover stub from when the `ontographEditor.ipcRoute` dispatch was removed. The `nodeClicked` handler itself is fine to keep (future use); only the comment is misleading.

**`src/commands/openVisualization.ts:69-77`**
```typescript
/** Update the graph panel when the model changes (called from extension.ts) */
export function updateGraphPanel(
  model: OntologyModel,
  focusIri?: string,
  preferredLang = 'en',
): void {
  if (!panel) { return; }
  sendGraph(panel, model, focusIri, 2, { showInferred: true, showDisjoint: false }, preferredLang);
}
```
This function is exported but never imported or called anywhere in standalone OntoGraph-lite. It was added for `activateGraph.ts` in OntoGraphEditor to call. Safe to remove.

### Why the Collision Cannot Be Fixed From OntoGraph-lite Alone

Without renaming `ontograph.*` command IDs (which the user explicitly does not want), there is no way for OntoGraph-lite to prevent OntoGraphEditor from attempting to register the same commands. The correct long-term fix is in OntoGraphEditor — remove `activateGraph.ts` and rely on the standalone OntoGraph-lite extension instead. That is out of scope for this feature.

**Decision**: Remove the two remaining integration artifacts from OntoGraph-lite. Document that the extensions are mutually exclusive (as OntoGraphEditor already acknowledges).
