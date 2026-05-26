# Contract: ontograph.reloadOntology Command

## Command ID

```
ontograph.reloadOntology
```

## Trigger Points

| Trigger | Description |
|---------|-------------|
| Toolbar button | `$(refresh)` icon in Classes view title bar, adjacent to Classify button |
| Auto (file watcher) | Fired internally when on-disk change detected; not user-invokable via Command Palette |

## Preconditions

- An ontology file is currently loaded (`activeModel !== undefined`).
- No reload is currently in progress (`ontograph.reloading` context is `false`).

## Behaviour

1. Sets VS Code context `ontograph.reloading = true` (disables button).
2. Shows status bar spinner: `$(loading~spin) OntoGraph: reloading…`
3. Reads the file at `activeModel.sourceUri` from disk.
4. Parses via `ParserRegistry.parseAsync()`.
5. **On success**:
   - Replaces `activeModel` with new model.
   - Calls `refreshAllViews(newModel)` — rebuilds index, updates all providers.
   - Clears inferred hierarchy.
   - Shows: `$(check) Ontology reloaded from disk` (8 s auto-dismiss).
6. **On failure**:
   - Leaves `activeModel` unchanged.
   - Shows `vscode.window.showErrorMessage(...)` with description.
7. Sets `ontograph.reloading = false` (re-enables button).

## Package.json Additions

### Command definition (contributes.commands)

```json
{
  "command": "ontograph.reloadOntology",
  "title": "Reload Ontology",
  "icon": "$(refresh)",
  "category": "OntoGraph"
}
```

### Menu entry (contributes.menus → view/title)

```json
{
  "command": "ontograph.reloadOntology",
  "when": "view == ontograph.classHierarchy && ontograph.ontologyLoaded && !ontograph.reloading",
  "group": "navigation@1"
}
```

## VS Code Context Variables

| Variable | Type | Set when |
|----------|------|----------|
| `ontograph.reloading` | boolean | `true` during reload; `false` at start/end |

(Existing `ontograph.ontologyLoaded` context, assumed already set when `activeModel` is populated, gates button visibility.)
