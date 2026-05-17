# Data Model: Allow Saving Invalid Axiom Expressions as Drafts

**Branch**: `008-invalid-axiom-draft-save` | **Date**: 2026-05-16

## New Types (Extension Host)

### `DraftExpression`

Lives in `src/views/EntityEditorPanel.ts`.

```typescript
interface DraftExpression {
  text: string;
  sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions';
}
```

- `text`: the raw expression string as typed by the user (invalid Manchester syntax).
- `sectionKey`: identifies which expression list the draft belongs to, so it can be re-injected into the correct section on panel reload.

### `draftAxioms` Store

```typescript
const draftAxioms = new Map<string, DraftExpression[]>();
// Key: entity IRI (e.g., "http://example.org/Class1")
// Value: all draft expressions for that entity (may span multiple sections)
```

**Lifecycle**:
- Written: when a `save` message arrives with `invalidExpressionIndices` present.
- Merged: when `sendLoadEntity` is called for an entity that has drafts — they are appended as `draftExpressions` in `LoadEntityMessage`.
- Cleared (per entity): when a subsequent `save` message for the same entity has no `invalidExpressionIndices` (all expressions are now valid).
- Cleared (global): when the user chooses "Discard and proceed" in the blocking dialog.

---

## Message Protocol Changes

### `SaveEntityMessage` — extended

New optional field added to `SaveEntityMessage`:

```typescript
invalidExpressionIndices?: {
  superClassExpressions?: number[];
  equivalentClassExpressions?: number[];
  gciExpressions?: number[];
};
```

- Each array lists the zero-based indices within the corresponding expression array that failed `getDiagnostics()` in the webview.
- Absent or empty means all expressions are valid.

### `LoadEntityMessage` — extended

New optional field added to `LoadEntityMessage`:

```typescript
draftExpressions?: Array<{
  sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions';
  text: string;
}>;
```

- Present only when the entity being loaded has entries in `draftAxioms`.
- The webview renders these expressions appended to the respective section, with the `draft-invalid` CSS class pre-applied.

### `SaveDraftErrorMessage` — new (Extension → Webview)

```typescript
interface SaveDraftErrorMessage {
  type: 'saveDraftError';
  invalidExpressions: Array<{
    sectionKey: string;
    index: number;
    text: string;
  }>;
}
```

- Sent by the extension host after processing a `save` message that contained invalid expressions.
- The webview uses this to apply the red border and display the error notification banner.

---

## State Transitions

### Per-expression validation state (webview)

```
CLEAN ──[user types invalid]──► LINTING_ERROR
LINTING_ERROR ──[user clicks Save]──► DRAFT_INVALID (red border + error banner)
DRAFT_INVALID ──[user corrects + Save]──► CLEAN (border removed, banner dismissed)
DRAFT_INVALID ──[panel reload with draftExpressions]──► DRAFT_INVALID (red border restored)
```

### Draft store (extension host)

```
EMPTY ──[save with invalidExpressionIndices]──► HAS_DRAFTS
HAS_DRAFTS ──[save same entity, no invalid indices]──► EMPTY (for that entity)
HAS_DRAFTS ──[discardAllDrafts()]──► EMPTY
HAS_DRAFTS ──[refreshEntityEditorIfOpen + user cancels/fixes]──► HAS_DRAFTS (reload aborted)
HAS_DRAFTS ──[refreshEntityEditorIfOpen + user chooses Discard]──► EMPTY (reload proceeds)
```

---

## Invariants

1. **No invalid expression ever reaches `syncAxiomsToDocument`**: the save handler filters them out of the model before calling sync.
2. **Valid expressions on the same entity are always synced**: draft status is per-expression, not per-entity.
3. **Draft state is lost on process restart**: the `draftAxioms` Map is in-process memory only. The spec explicitly accepts this.
4. **`draftAxioms` is keyed by IRI**: navigating away from an entity and back restores its drafts within the same session.
