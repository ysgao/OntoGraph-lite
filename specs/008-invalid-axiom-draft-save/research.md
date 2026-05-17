# Research: Allow Saving Invalid Axiom Expressions as Drafts

**Branch**: `008-invalid-axiom-draft-save` | **Date**: 2026-05-16

## Decision 1: How to Detect Invalid Expressions at Save Time

**Decision**: Use `getDiagnostics(view.state)` from `@codemirror/lint` to synchronously check each expression CodeMirror editor at the moment the user clicks Save.

**Rationale**: `@codemirror/lint` is already installed (`^6.9.6`). The `manchesterLinter` is already registered on each expression editor via `linter(manchesterLinter, { delay: 400 })`. `getDiagnostics` reads from the editor's current state without an additional async round-trip; any error-severity diagnostic indicates an invalid expression. This avoids re-invoking the extension host's `validateManchesterText` at save time.

**Alternatives considered**:
- Re-validate via `validate` message round-trip at save time: rejected — async, adds latency, the linter has already run.
- Track validation state in a side-channel variable updated by the linter: possible, but fragile (linter runs async; state could be stale if user types very fast). `getDiagnostics` reads the committed state.

---

## Decision 2: Where to Store Draft State

**Decision**: Module-level `Map<string, DraftExpression[]>` named `draftAxioms` in `EntityEditorPanel.ts`, keyed by entity IRI.

**Rationale**: The existing `savedEntityState` Map in the same file follows the same pattern for preserving annotation/label edits across model reloads. Draft axioms live at the same scope level and are managed the same way: written on save, cleared on confirmed discard, merged back on `sendLoadEntity`. No new persistence mechanism is needed.

**Alternatives considered**:
- Store draft state in the webview (JavaScript global): rejected — draft state must survive the webview being hidden/revealed and must be accessible to the blocking dialog logic in the extension host.
- Store in a file on disk: rejected — drafts are explicitly transient (spec §Assumptions); file persistence would give false permanence expectations and complicate cleanup.

---

## Decision 3: Blocking Dialog API

**Decision**: `vscode.window.showWarningMessage(message, { modal: true }, 'Discard and proceed', 'Fix in editor')` where the message body lists affected entity labels. Return value determines the action.

**Rationale**: The `{ modal: true }` option renders a blocking VS Code dialog (identical UX to confirmation prompts already used in `exportOntology.ts`). Button strings are the only clickable elements in a VS Code modal — inline hyperlinks are not supported. Listing entity names in the message text and providing a 'Fix in editor' button that navigates to the first affected entity satisfies the spec's intent of "navigable link to each entity" within the constraints of the VS Code API.

**Button mapping**:
| Button | Action |
|--------|--------|
| `'Discard and proceed'` | Clear `draftAxioms`, proceed with reload |
| `'Fix in editor'` | Navigate panel to first entity with drafts; abort reload |
| (dialog dismissed / `undefined`) | Cancel; abort reload; drafts preserved |

**Alternatives considered**:
- `vscode.window.showQuickPick` for multi-entity selection before navigating: would work for multiple affected entities, but adds a second interaction step. For the initial implementation the first affected entity is navigated to; a follow-up can add QuickPick for multi-entity cases.
- Non-modal notification with action buttons (`showWarningMessage` without `modal: true`): rejected — the spec explicitly requires a blocking prompt.

---

## Decision 4: Making `refreshEntityEditorIfOpen` Async

**Decision**: Change the signature to `async function refreshEntityEditorIfOpen(model: OntologyModel): Promise<void>` and update the 3 call sites in `extension.ts` to `await` the result.

**Rationale**: All 3 call sites are already inside `async` functions (the classify commands and `handleDocument`). The change is purely mechanical. The function currently returns `void`; making it return `Promise<void>` is backward-compatible for callers that don't `await` (they just won't wait for the dialog).

**Alternatives considered**:
- Add a separate `checkDraftsBeforeReload()` function that callers must call explicitly before each reload trigger: rejected — scattered and easy to miss at future call sites. Centralising the check in `refreshEntityEditorIfOpen` is the single point of truth.

---

## Decision 5: Scope of Expression Types Covered

**Decision**: Draft detection and storage applies to the three Manchester expression array fields on OWL classes: `superClassExpressions`, `equivalentClassExpressions`, `gciExpressions`. IRI-list fields (e.g., `superClassIris`, `equivalentClassIris`) are plain text inputs validated separately and are out of scope.

**Rationale**: Syntactic complexity that produces parse errors occurs in Manchester syntax expression fields, not in IRI list pickers. The spec's focus on "axiom expressions" refers to these three fields. Property expression fields on non-class entities are plain IRIs and cannot fail Manchester parsing.

**Alternatives considered**:
- Apply to all entity types' expression fields: no other entity type has free-form Manchester expression inputs — object/data/annotation properties and individuals use IRI pickers, not expression editors.
