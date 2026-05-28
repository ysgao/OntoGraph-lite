# Contract: `ontograph.loadOntologyFile` Command

## VS Code Command

**ID**: `ontograph.loadOntologyFile`  
**Title**: "Load Ontology File…"  
**Icon**: `$(folder-opened)`

## Invocation

The command accepts zero or one argument:

| Invocation | Argument | Behaviour |
|---|---|---|
| Command Palette | none | Opens file picker filtered to ontology extensions |
| Toolbar button | none | Same as above |
| Notification "Load" button | `vscode.Uri` | Skips picker; loads the given URI directly |

## File Picker Filter

```
{ "Ontology Files": ["owl", "ofn", "omn", "ttl", "owx", "n3"] }
```

## Success Outcome

After a successful load:
1. All OntoGraph panels refresh with the loaded model.
2. `activeModel.sourceUri` equals `vscode.Uri.file(fsPath).toString()` for the loaded file.
3. The file watcher for the loaded file is active.
4. No editor tab is opened for the file.

## Failure Outcomes

| Condition | Error message format |
|---|---|
| No file selected (picker cancelled) | Silent — no error shown |
| Load already in progress | Info: "OntoGraph: a load is already in progress." |
| Format undetectable | Error: "OntoGraph: cannot detect ontology format for '<filename>'." |
| File unreadable | Error: "OntoGraph: failed to read '<filename>' — <OS error message>." |
| Parse error | Error: "OntoGraph: failed to parse '<filename>' — <parser error message>." |

## Progress Indicator

`vscode.window.withProgress`:
- `location: ProgressLocation.Notification`
- `title: "OntoGraph: loading <filename>…"`
- `cancellable: false`

## State Guard

If a load is already in progress when the command fires, shows info message and returns immediately. Does not open a second progress indicator.
