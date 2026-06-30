# VS Code API Contract: Entity Navigation History

**Feature**: 021-entity-nav-history | **Date**: 2026-06-30

This document defines the VS Code extension API surface introduced by this feature: command IDs, context keys, menu contributions, and keybindings.

## Commands

| Command ID | Title | Icon | Category | Description |
|------------|-------|------|----------|-------------|
| `ontograph.navigateBack` | Go Back | `$(arrow-left)` | OntoGraph | Show the previously focused entity |
| `ontograph.navigateForward` | Go Forward | `$(arrow-right)` | OntoGraph | Show the next entity in forward history |

## Context Keys

Set via `vscode.commands.executeCommand('setContext', key, value)`:

| Key | Type | Meaning |
|-----|------|---------|
| `ontograph.canNavigateBack` | `boolean` | `true` when back-stack has > 1 entry |
| `ontograph.canNavigateForward` | `boolean` | `true` when forward-stack is non-empty |

Both keys start as `false` (empty history on extension activation).

## Menu Contributions (`view/title`)

These buttons appear in the OntoGraph Classes view header toolbar:

| Command | `when` | `group` | `enablement` |
|---------|--------|---------|--------------|
| `ontograph.navigateBack` | `view == ontograph.classesView` | `navigation@-3` | `ontograph.canNavigateBack` |
| `ontograph.navigateForward` | `view == ontograph.classesView` | `navigation@-2` | `ontograph.canNavigateForward` |

**Toolbar order** (left to right, ascending by group order value):
`← (–3)` → `→ (–2)` → `loadFile (–1)` → `classify (0)` → `refresh (1)` → `search (2)` → `add entity (3)`

## Keybindings

| Platform | Back | Forward | `when` condition |
|----------|------|---------|-----------------|
| Mac | `ctrl+-` | `ctrl+shift+-` | `focusedView =~ /^ontograph\./` |
| Windows/Linux | `alt+left` | `alt+right` | `focusedView =~ /^ontograph\./` |

The `when` clause uses a regex to match all six OntoGraph tree views:
`ontograph.classesView`, `ontograph.inferredClassesView`, `ontograph.objectPropertiesView`, `ontograph.dataPropertiesView`, `ontograph.annotationPropertiesView`, `ontograph.individualsView`.

**Behaviour outside OntoGraph focus**: VS Code's default bindings for `ctrl+-` / `alt+left` (navigate back in editor) apply unchanged.
