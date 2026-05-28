# Data Model: Load Large Ontology Files

**Branch**: `012-load-large-ontology`

---

## Entities

### Large Ontology File

A file on disk whose size exceeds VS Code's text-editor display threshold. Not a new model type — represented by an `OntologyModel` with `sourceUri` pointing to the file path on disk, identical in structure to models loaded from normal-sized files.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `sourceUri` | `string` | file path as `vscode.Uri.file(fsPath).toString()` | Used by sync + reload paths |
| `rawContent` | `string` | `fs.readFile` result | Same field as normal load |
| `sourceFormat` | `string` | detected by `detectOwlFormat` | Same field as normal load |

No new fields on `OntologyModel`. No schema migration needed.

---

## State Transitions

### Load lifecycle

```
IDLE
  │
  ├─ command invoked ──► isLoading=true, show progress
  │                           │
  │                     file picked → fs.readFile → parseAsync
  │                           │
  │                     success: refreshAllViews(model), isLoading=false
  │                     failure: show error, isLoading=false
  │
  └─ (second invocation while isLoading) → show info msg, return
```

### Large-file notification lifecycle

```
onDidChangeActiveTextEditor fires
  │
  ├─ doc has ontology extension?  No → skip
  │                               Yes ↓
  ├─ doc.getText().length === 0?  No → skip (normal file loaded OK)
  │                               Yes ↓
  ├─ notifiedUris has this URI?   Yes → skip (already shown)
  │                               No ↓
  ├─ stat(uri).size > 10 MB?      No → skip (empty ontology file)
  │                               Yes ↓
  └─ show notification → user clicks "Load" → invoke loadOntologyFile(uri)
                       → user dismisses  → add URI to notifiedUris
```

---

## Module Boundaries

### New module: `src/commands/loadOntologyFile.ts`

```typescript
// Public API
export async function loadOntologyFile(
  onLoaded: (model: OntologyModel) => void,
  prefillUri?: vscode.Uri,   // optional: skip file picker, use this URI directly
): Promise<void>
```

`prefillUri` enables the notification "Load" button to pass the already-known file path without re-opening the picker. No other callers need this parameter.

### Modified module: `src/commands/reloadOntology.ts`

Replace `openTextDocument(uri).getText()` with `vscode.workspace.fs.readFile(uri)` + `TextDecoder`. Keeps same public signature.

### Modified module: `src/extension.ts`

- Register `ontograph.loadOntologyFile` command.
- Add `onDidChangeActiveTextEditor` listener for large-file notification.
- Pass `(model) => refreshAllViews(model)` callback to `loadOntologyFile`.

### Modified: `package.json`

- Add command contribution `ontograph.loadOntologyFile`.
- Add `view/title` menu entries for `ontograph.classes` and `ontograph.inferredClasses`.

---

## Validation Rules

| Input | Rule |
|-------|------|
| File extension | `.owl`, `.ofn`, `.omn`, `.ttl`, `.owx`, `.n3` accepted in picker filter; other extensions rejected with named error |
| Format detection | `detectOwlFormat(text)` returns `'unknown'` → show named error, do not update model |
| File not readable | `fs.readFile` throws → show named error with OS message |
| File write-protected (P3) | `workspace.openTextDocument` succeeds but `applyEdit` fails → show named error naming the file |

---

## Interface Contracts

See `contracts/loadOntologyFile-command.md`.
