# Contract: package.json contributions

This is the extension's user-facing surface for this feature — the command, its menu placement,
and its two settings. Anyone integrating with or reviewing this feature's `package.json` changes
should be able to check them against this contract directly.

## Command

```json
{
  "command": "ontograph.generateUmlDiagram",
  "title": "Generate UML Diagram",
  "icon": "$(type-hierarchy)"
}
```

Registered alongside `ontograph.openGraph` in `contributes.commands`.

## Context menu

```json
{
  "command": "ontograph.generateUmlDiagram",
  "when": "view =~ /^ontograph\\.(classes|inferredClasses|individuals)/ && viewItem =~ /^owlEntity/",
  "group": "2_navigate"
}
```

Identical `when` clause and `group` to the existing `ontograph.openGraph` entry (`view/item/context`
in `contributes.menus`) — same availability, same menu section, appearing next to "Open Graph" as a
sibling entry, per spec FR-001's requirement to reuse "Generate Graph"'s existing availability rule.

## Settings

```json
"ontograph.umlDiagram.defaultDepth": {
  "type": "number",
  "default": 1,
  "minimum": 1,
  "maximum": 5,
  "description": "Default relationship depth for a newly generated UML diagram"
},
"ontograph.umlDiagram.compositionProperties": {
  "type": "array",
  "items": { "type": "string" },
  "default": [],
  "markdownDescription": "Object property IRIs treated as composition (part-of) relationships when generating a UML diagram. Properties not listed here are never rendered as composition connectors — see FR-004a. Leave empty to render generalization-only diagrams until configured."
}
```

Both declared in `contributes.configuration`, alongside the existing `ontograph.graph.defaultDepth`
and `ontograph.entity.defaultNamespace` entries — same section, same naming convention
(`ontograph.<feature>.<setting>`).

## Contract test expectations

- `package.json` MUST remain valid JSON and pass the existing VS Code extension manifest schema
  check after these additions (no existing command IDs, menu entries, or setting keys collide).
- The context-menu `when` clause MUST be textually identical to `ontograph.openGraph`'s, not just
  equivalent — a future change to one that isn't mirrored to the other is a regression this
  contract is meant to catch in review.
