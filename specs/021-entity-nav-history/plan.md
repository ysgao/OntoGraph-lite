# Implementation Plan: Entity Navigation History

**Branch**: `021-entity-nav-history` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md)

## Summary

Add Back (←) and Forward (→) toolbar buttons to the OntoGraph sidebar that step through the history of entity focus events within a session. The feature is implemented entirely in the VS Code extension host: a new `NavigationHistory` class tracks entity IRI sequences, two commands drive navigation, and VS Code context keys gate button enablement. No webview or Java changes are required.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)

**Primary Dependencies**: VS Code Extension API (existing), existing module-level state in `src/extension.ts`, `src/views/EntityEditorPanel.ts`

**Storage**: In-memory only — `string[]` back-stack and forward-stack on the extension host; no persistence

**Testing**: Vitest (existing `npm test`)

**Target Platform**: VS Code Extension Host (Node.js CJS)

**Project Type**: VS Code extension

**Performance Goals**: Navigation must feel instantaneous (same latency as tree click); no async work required

**Constraints**: Must not interfere with VS Code's built-in navigation shortcuts when other editors are focused; must not add any new runtime dependencies

**Scale/Scope**: Session-scoped; max 50 entries per direction stack

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Decoupled UI Core | ✅ Pass | No new UI app; pure extension host code |
| II. IPC-Only Communication | ✅ Pass | No new network calls or direct API requests |
| III. Webview Path Safety | ✅ Pass | No new webview bundles |
| IV. Test-First Integration | ⚠️ Must enforce | `NavigationHistory` unit tests must be written before commands are implemented |

## Project Structure

### Documentation (this feature)

```text
specs/021-entity-nav-history/
├── plan.md              ← this file
├── research.md          ← Phase 0
├── data-model.md        ← Phase 1
├── contracts/
│   └── vs-code-api.md   ← Phase 1
└── tasks.md             ← /speckit-tasks output
```

### Source Code Changes

```text
src/views/NavigationHistory.ts        ← NEW: NavigationHistory class
src/views/NavigationHistory.test.ts   ← NEW: Vitest unit tests (written first, TDD)
src/extension.ts                      ← MODIFIED: register commands, hook push/clear
package.json                          ← MODIFIED: commands, menus, keybindings
```

---

## Phase 0: Research

### R-001 — `suppressNextSelection` reuse for navigation guard

**Decision**: Reuse the existing `suppressNextSelection: boolean` flag in `extension.ts` (line 55) as the guard for back/forward commands, rather than introducing a new flag.

**Rationale**: `onEntitySelected()` already checks and clears `suppressNextSelection` (lines 64–65). Setting it to `true` before calling `revealInTreeView()` from a back/forward command prevents `onDidChangeSelection` from triggering a redundant history push. No new module-level state needed.

**Alternative rejected**: A separate `isNavigatingHistory` flag would duplicate the guard pattern already present.

---

### R-002 — Single push point: `onEntitySelected()`

**Decision**: Push to history ONLY inside `onEntitySelected()`, not at each call site.

**Rationale**: All user-initiated entity focus events flow through `onEntitySelected()` via VS Code's `onDidChangeSelection` event:
- **Tree view click** → `onDidChangeSelection` → `onEntitySelected()` ✓
- **Search quick-pick accept** → `revealInTreeView()` → `view.reveal({select:true})` → `onDidChangeSelection` → `onEntitySelected()` ✓
- **Webview chip click** (`navigate`/`focusEntity` message, `fromIpc=false`) → `focusEntity` command → `revealInTreeView()` → `onDidChangeSelection` → `onEntitySelected()` ✓

`suppressNextSelection` already blocks double-push for IPC-origin navigations. The same mechanism protects back/forward.

**Alternative rejected**: Hooking push at each call site (search handler, focusEntity command) risked double-pushes due to the async reveal triggering `onEntitySelected()` as a second path.

---

### R-003 — VS Code context keys for button enablement

**Decision**: Use `vscode.commands.executeCommand('setContext', key, value)` to maintain two boolean context keys:
- `ontograph.canNavigateBack` — `true` when back-stack has > 1 entry
- `ontograph.canNavigateForward` — `true` when forward-stack is non-empty

Reference these in `package.json` `contributes.menus` `"enablement"` fields on the toolbar buttons.

**Rationale**: `enablement` grays out buttons (clickable = false) without hiding them, satisfying SC-003 ("visually disabled, not merely hidden").

---

### R-004 — History clear on ontology change (not reload)

**Decision**: In `onLoadedCallback`, compare `model.sourceUri` with `activeModel?.sourceUri` **before** updating `activeModel`. Clear history only when the URIs differ (a different file is being loaded). Same-URI loads (refresh/reload of the current file) leave history intact.

```typescript
const onLoadedCallback = async (model: OntologyModel): Promise<void> => {
  if (model.sourceUri !== activeModel?.sourceUri) {
    navigationHistory.clear();
    updateNavContextKeys();
  }
  activeModel = model;
  // ... rest unchanged
};
```

**Rationale**: `OntologyModel.sourceUri` (defined in `src/model/OntologyModel.ts` line 103) is set at parse time and uniquely identifies the source file. This single comparison covers all load paths — `loadOntologyFile`, `reloadOntology`, and the workspace watcher — without needing separate hooks on each command. A refresh restores the same `sourceUri`, so history is preserved. Loading a different file produces a different `sourceUri`, so history clears (FR-011).

**Alternative rejected**: Hooking `clear()` unconditionally in `onLoadedCallback` (original plan) would clear history on every refresh/reload, disrupting the user's navigation context after saving edits to the current ontology.

---

### R-005 — Keyboard shortcut `when` clause

**Decision**: `"when": "focusedView =~ /^ontograph\\./"` — matches any OntoGraph tree view without enumerating all six individually.

**Keybindings**:
- Mac: Back = `ctrl+-`, Forward = `ctrl+shift+-`
- Windows/Linux: Back = `alt+left`, Forward = `alt+right`

**Rationale**: Matches VS Code's own `navigateBack/Forward` defaults per platform but is scoped so it only fires when an OntoGraph panel is focused (FR-012).

---

## Phase 1: Design & Contracts

### NavigationHistory class (`src/views/NavigationHistory.ts`)

| Member | Type | Description |
|--------|------|-------------|
| `backStack` | `readonly string[]` (private) | IRIs visited; most-recent last |
| `forwardStack` | `readonly string[]` (private) | IRIs to redo; most-recent last |
| `MAX_DEPTH = 50` | `number` (private const) | Max back-stack size |
| `push(iri: string)` | `void` | Appends IRI; clears forwardStack; deduplicates consecutive; trims to MAX_DEPTH |
| `back()` | `string \| undefined` | Pops current from backStack → forwardStack; returns new top (entity to show) |
| `forward()` | `string \| undefined` | Pops from forwardStack → backStack; returns popped value (entity to show) |
| `canGoBack` | `boolean` getter | `backStack.length > 1` |
| `canGoForward` | `boolean` getter | `forwardStack.length > 0` |
| `clear()` | `void` | Empties both stacks |

**Stack semantics note**: `backStack` stores visited IRIs *including* the currently-shown one at the top. `back()` pops the current IRI off (saves it to forwardStack) and returns the new top — the entity to show next.

### `src/extension.ts` modifications

**New module-level additions** (before `activate()`):
```typescript
import { NavigationHistory } from './views/NavigationHistory';
const navigationHistory = new NavigationHistory();
```

**Helper** (inside `activate()`):
```typescript
function updateNavContextKeys(): void {
  void vscode.commands.executeCommand('setContext', 'ontograph.canNavigateBack', navigationHistory.canGoBack);
  void vscode.commands.executeCommand('setContext', 'ontograph.canNavigateForward', navigationHistory.canGoForward);
}
```

**`onEntitySelected()` change** — add after the `suppressNextSelection` guard block (before the `showEntityInfo` call):
```typescript
navigationHistory.push(iri);
updateNavContextKeys();
```

**New commands** (added to the `registerCommand` block):
```typescript
vscode.commands.registerCommand('ontograph.navigateBack', () => {
  const iri = navigationHistory.back();
  updateNavContextKeys();
  if (iri && activeModel) {
    suppressNextSelection = true;
    showEntityInfo(context, activeModel, iri);
    const entityType = entityTypeForIri(iri);
    if (entityType) { revealInTreeView(iri, entityType); }
  }
}),
vscode.commands.registerCommand('ontograph.navigateForward', () => {
  const iri = navigationHistory.forward();
  updateNavContextKeys();
  if (iri && activeModel) {
    suppressNextSelection = true;
    showEntityInfo(context, activeModel, iri);
    const entityType = entityTypeForIri(iri);
    if (entityType) { revealInTreeView(iri, entityType); }
  }
}),
```

**`onLoadedCallback` change** (line ~584) — add before the `activeModel = model` assignment:
```typescript
if (model.sourceUri !== activeModel?.sourceUri) {
  navigationHistory.clear();
  updateNavContextKeys();
}
```

### `package.json` additions

**In `contributes.commands`:**
```json
{ "command": "ontograph.navigateBack",    "title": "Go Back",    "icon": "$(arrow-left)",  "category": "OntoGraph" },
{ "command": "ontograph.navigateForward", "title": "Go Forward", "icon": "$(arrow-right)", "category": "OntoGraph" }
```

**In `contributes.menus."view/title"`:**
```json
{ "command": "ontograph.navigateBack",    "when": "view == ontograph.classesView", "group": "navigation@-3", "enablement": "ontograph.canNavigateBack" },
{ "command": "ontograph.navigateForward", "when": "view == ontograph.classesView", "group": "navigation@-2", "enablement": "ontograph.canNavigateForward" }
```

**New `contributes.keybindings` section:**
```json
[
  { "command": "ontograph.navigateBack",    "key": "alt+left",  "mac": "ctrl+-",       "when": "focusedView =~ /^ontograph\\./" },
  { "command": "ontograph.navigateForward", "key": "alt+right", "mac": "ctrl+shift+-", "when": "focusedView =~ /^ontograph\\./" }
]
```

---

## Verification

1. **Type check**: `npm run compile` — zero errors
2. **Tests**: `npm test` — all existing 437 tests pass; new `NavigationHistory.test.ts` covers: push/back/forward round-trip, consecutive dedup, maxDepth trim, clear resets both stacks, canGoBack/canGoForward gates
3. **Manual**: Open `test-ontologies/animals.omn` → click 3 entities → ← twice → verify correct entity in editor + tree highlight → → once → returns to previous → load another ontology → both buttons grayed out
4. **Keyboard**: Focus the Classes sidebar panel → `Ctrl+-` (Mac) / `Alt+Left` (Win) → verify back navigation fires
