# Contract: VS Code Command `ontograph.openDLQuery`

**Registered in**: `src/extension.ts`  
**Handler in**: `src/commands/openDLQuery.ts`  
**Declared in**: `package.json` → `contributes.commands`

---

## Command

| Field | Value |
|-------|-------|
| Command ID | `ontograph.openDLQuery` |
| Title | `OntoGraph: Open DL Query` |
| Category | `OntoGraph` |
| When clause | Always available (panel shows "no ontology" state if none loaded) |

---

## Behaviour

1. If the DL Query panel is already open, `panel.reveal()` brings it to the foreground.
2. If no panel is open, creates a new `vscode.WebviewPanel` with `viewType: 'ontograph.dlQuery'`.
3. Sends `ontologyStatus` message immediately after panel creation to set the initial enabled/disabled state of Execute.

---

## Package.json Registration

```json
{
  "command": "ontograph.openDLQuery",
  "title": "Open DL Query",
  "category": "OntoGraph"
}
```
