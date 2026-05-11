# Fix Sync Issue for Closed Documents

The recent implementation of document retrieval for closed files introduced a race condition or logic error that causes synchronization to stop.

## Problem
In `src/views/EntityEditorPanel.ts`, after updating and saving a previously closed document, we manually update `parsedDocVersions`:

```typescript
if (finalDoc) {
  if (!wasSourceDocOpen) {
    await finalDoc.save();
  }
  parsedDocVersions.set(finalDoc.uri.toString(), finalDoc.version);
  model.rawContent = finalDoc.getText();
}
```

When `finalDoc.save()` is called, VS Code eventually fires `onDidSaveTextDocument`. This triggers `handleDocument` in `extension.ts`.

In `handleDocument`:
```typescript
const key = doc.uri.toString();
const version = doc.version;
if (parsedDocVersions.get(key) === version) { return; }
parsedDocVersions.set(key, version);
```

Because `EntityEditorPanel.ts` already set `parsedDocVersions[key]` to the latest version, `handleDocument` sees the version is the same and **returns early without re-parsing**.

However, `activeModel` (which the UI uses) is only updated inside `handleDocument`. By skipping the parse, we leave the `activeModel` in a state where it might be slightly out of sync or the UI doesn't get the refresh it expects. More importantly, if `handleDocument` is skipped, `refreshEntityEditorIfOpen(model)` is not called with a new model.

## Proposed Changes

### 1. src/views/EntityEditorPanel.ts
- Remove manual update of `parsedDocVersions`.
- Remove manual update of `model.rawContent` (it will be updated by the parser anyway).
- Ensure `_annotationSyncActive` remains true until the document is saved and handled, OR ensure that `handleDocument` can still run.

Actually, the best approach is:
1. Don't set `parsedDocVersions` in `EntityEditorPanel.ts`.
2. Let `handleDocument` perform the parse and update the model.
3. Keep `_annotationSyncActive = true` until we are reasonably sure `handleDocument` has started or finished, to prevent `refreshEntityEditorIfOpen` from clearing `savedEntityState` prematurely.

Wait, if we don't set `parsedDocVersions`, then `handleDocument` *will* run. That's good.

But `_annotationSyncActive` is set to `false` at the end of the async block in `handleMessage`.
If `handleDocument` runs *after* `_annotationSyncActive = false`, then `refreshEntityEditorIfOpen` will call `savedEntityState.delete(lastIri)`, which is what we want (the model is now fresh).

### 2. Implementation Detail
Modify `src/views/EntityEditorPanel.ts` to remove the manual `parsedDocVersions` update.

```typescript
          const finalDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === model.sourceUri);
          if (finalDoc) {
            if (!wasSourceDocOpen) {
              await finalDoc.save();
            }
            // REMOVE THESE:
            // parsedDocVersions.set(finalDoc.uri.toString(), finalDoc.version);
            // model.rawContent = finalDoc.getText();
          }
```

Wait, if the document WAS already open, `EntityEditorPanel.ts` *should* update `parsedDocVersions` to prevent a redundant parse if we don't want one? No, usually we WANT a re-parse to update the model. The only reason to skip it is if we just did it. But here we *didn't* do a re-parse, we just did a text edit.

## Verification Plan
1. Open an ontology.
2. Open the Entity Editor for a class.
3. Close the OWL file tab.
4. Edit a label in the Entity Editor and save.
5. Check if the change is persisted (it should be saved to disk).
6. Edit another label. If synchronization "stopped", the second change might not work or the first one might disappear from the UI.
7. Verify that the UI reflects the changes and the status bar shows "parsed OK".
