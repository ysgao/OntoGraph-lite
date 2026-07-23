# Contract: Label rename rejection message (webview ↔ extension)

This project has no external API; its "contract" surface is the typed `postMessage` protocol between the Entity Editor webview (`webview-src/entity-editor/`) and the extension host (`src/views/EntityEditorPanel.ts`), defined in `src/views/EntityEditorMessages.ts`.

## New message: `LabelRenameResultMessage`

Direction: extension → webview. Sent in response to a `save` message whose `labels` field would create a duplicate label (per `OntologyIndex.exactMatchByLabel`, excluding the entity being renamed itself).

Follows the same shape already established by `IriRenameResultMessage` for the analogous IRI-rename rejection case:

```ts
export interface LabelRenameResultMessage {
  type: 'labelRenameResult';
  success: boolean;
  /** The accepted label; only present when success === true. */
  newLabel?: string;
  /** Human-readable error naming the conflicting entity; only present when success === false. */
  error?: string;
}
```

Added to the `EntityEditorExtToWebview` union alongside `IriRenameResultMessage`.

## Behavioral contract

- **Given** a `save` message whose `labels` field, if applied, would make this entity's label identical (case-insensitively) to another existing entity's label:
  **Then** the extension MUST NOT apply the label change, MUST NOT write it to disk, and MUST respond with `{ type: 'labelRenameResult', success: false, error: '<message identifying the conflicting entity>' }`.
  All *other* valid fields in the same `save` message (annotations, other axioms) MUST still be applied and persisted — a rejected label change does not block the rest of the save, consistent with how `saveDraftError` already lets the valid portion of a save proceed.
  The extension additionally surfaces the same reason as a native VS Code `showWarningMessage` notification (`OntoGraph: label not saved — <reason>`), so the user reliably sees *why* the label wasn't saved even if they aren't looking at the Entity Editor panel's in-line banner at that moment.

- **Given** a `save` message whose `labels` field does not conflict with any other entity:
  **Then** the extension MUST apply and persist the label change as today, and MUST additionally invalidate `entityHistoryMap` entries for every other entity whose axiom-bearing fields reference this entity's IRI (see `data-model.md`), so their next load renders the new label.

## Non-goals of this contract

- This message is not a replacement for `SaveDraftErrorMessage` (which reports invalid *expression syntax*, an orthogonal concern).
- This contract does not change the shape or behavior of `RenameIriMessage`/`IriRenameResultMessage`; label rename and IRI rename remain two distinct flows that happen to share a response-shape convention.
