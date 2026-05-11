# Fix Sync and Classification Refresh Logic

This plan fixes the synchronization issues with closed OWL documents and ensures that the model is correctly refreshed when classification is requested, as per the design intent.

## Problem Analysis
1.  **Saving Logic Bug**: `EntityEditorPanel.ts` checks `vscode.workspace.textDocuments` to decide whether to save a document. Once a closed document is opened programmatically for the first edit, it stays in `textDocuments`. Subsequent edits see it as "already open" and skip `save()`. Since there is no visible tab, the changes are never persisted to disk.
2.  **Stale Model on Classification**: The previous commit added logic to skip immediate re-parsing (via `parsedDocVersions`) to keep the hierarchy stable. However, the re-parse logic was not added to the "Update Classification" command, so the model stays stale even when the user wants to refresh.
3.  **Robustness**: The synchronization logic lacks error handling, which could leave `_annotationSyncActive` stuck at `true` if an edit fails.

## Proposed Changes

### 1. src/views/EntityEditorPanel.ts
- **Fix Save Check**: Change `wasSourceDocOpen` to check `vscode.window.visibleTextEditors`. This ensures that if the document is not visible to the user, the extension takes responsibility for saving it.
- **Add Error Handling**: Wrap the sync logic in a `try...finally` block to ensure `_annotationSyncActive` is reset and `savedEntityState` is cleared.

### 2. src/extension.ts
- **Expose Re-parse Logic**: Move `handleDocument` (or create a wrapper) so it can be called programmatically.
- **Update `classifyOntologyStale`**: When the user clicks the "Update Classification" button (stale state), force a re-parse of the source document before proceeding with classification.

## Implementation Details

### EntityEditorPanel.ts
```typescript
// Replace:
const wasSourceDocOpen = vscode.workspace.textDocuments.some(d => d.uri.toString() === model.sourceUri);
// With:
const wasSourceDocOpen = vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === model.sourceUri);
```

### extension.ts
```typescript
// In ontograph.classifyOntologyStale command:
const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(activeModel.sourceUri));
parsedDocVersions.delete(activeModel.sourceUri.toString()); // Force re-parse
await handleDocument(doc);
await classifyOntology(activeModel, ...);
```

## Verification Plan
1.  **Closed File Persistence**: Open an ontology, open Entity Editor, close the OWL tab. Make multiple edits. Verify that the file on disk is updated after every edit.
2.  **Stale Hierarchy**: Verify that hierarchy view does NOT jump immediately after an edit (intended behavior).
3.  **Classification Refresh**: Click the "Warning" icon (Update Classification). Verify that the status bar shows "parsing..." followed by "Classifying...", and that the hierarchy view finally updates to reflect the edits.
4.  **Error Recovery**: Simulate a sync error and verify that subsequent edits still work (i.e., the guard flag was reset).
