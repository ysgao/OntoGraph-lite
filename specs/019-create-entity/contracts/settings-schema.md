# Contract: Extension Settings Schema (Extension)

**Feature**: 019-create-entity
**File**: `package.json` → `contributes.configuration.properties`

## New Setting

### `ontograph.entity.defaultNamespace`

```json
"ontograph.entity.defaultNamespace": {
  "type": "string",
  "default": "",
  "markdownDescription": "Base IRI prefix used when creating new ontology entities. Must end with `#` or `/` (e.g., `http://example.org/ontology#`). Leave empty to derive the namespace from the ontology's declared IRI."
}
```

**Access pattern in extension code:**
```typescript
const cfg = vscode.workspace.getConfiguration('ontograph');
const ns = cfg.get<string>('entity.defaultNamespace') ?? '';
```

**Scope**: User and workspace settings (standard VS Code defaults).

**Validation**: No schema-level pattern constraint; runtime validation rejects values that are non-empty and do not end with `#` or `/`, showing an error message in the input UI.

## Namespace Resolution Order

1. `ontograph.entity.defaultNamespace` (non-empty)
2. `model.metadata.iri` (the ontology's declared IRI, populated by all parsers)
3. User prompted via `vscode.window.showInputBox()` with placeholder `http://example.org/ontology#`
