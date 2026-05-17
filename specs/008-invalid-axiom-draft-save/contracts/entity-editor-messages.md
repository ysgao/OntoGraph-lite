# Contract: Entity Editor Webview ↔ Extension Host Messages

**Feature**: 008-invalid-axiom-draft-save  
**File**: `src/views/EntityEditorMessages.ts`  
**Direction**: Webview → Extension Host and Extension Host → Webview

This document records the message protocol additions introduced by this feature. The complete protocol is defined in `EntityEditorMessages.ts`.

---

## Changes to Existing Messages

### `SaveEntityMessage` (Webview → Extension Host)

**Before** (unchanged fields omitted):
```typescript
interface SaveEntityMessage {
  type: 'save';
  iri: string;
  entityType: EntityType;
  superClassExpressions?: string[];
  equivalentClassExpressions?: string[];
  gciExpressions?: string[];
  // ... other fields unchanged
}
```

**After** — new optional field added:
```typescript
interface SaveEntityMessage {
  type: 'save';
  iri: string;
  entityType: EntityType;
  superClassExpressions?: string[];
  equivalentClassExpressions?: string[];
  gciExpressions?: string[];
  // ... other fields unchanged

  /** Indices within each expression array that have CodeMirror error diagnostics. */
  invalidExpressionIndices?: {
    superClassExpressions?: number[];
    equivalentClassExpressions?: number[];
    gciExpressions?: number[];
  };
}
```

**Contract**:
- If `invalidExpressionIndices` is absent or all sub-arrays are empty, all expressions are valid and will be synced to the OWL document.
- If present, the extension host MUST NOT update the model or sync expressions at the listed indices.
- Indices are zero-based positions within the corresponding `string[]` array.

---

### `LoadEntityMessage` (Extension Host → Webview)

**After** — new optional field added:
```typescript
interface LoadEntityMessage {
  // ... all existing fields unchanged ...

  /**
   * Draft expressions stored from a previous invalid save.
   * The webview renders these with red-border indicator pre-applied.
   * Absent when no drafts exist for this entity.
   */
  draftExpressions?: Array<{
    sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions';
    text: string;
  }>;
}
```

**Contract**:
- When present, the webview MUST append each draft expression to the correct section and render it with the `draft-invalid` visual state.
- The main expression arrays (`superClassExpressions`, etc.) contain only the last-valid values from the OWL document; drafts are additional entries.

---

## New Messages

### `SaveDraftErrorMessage` (Extension Host → Webview)

```typescript
interface SaveDraftErrorMessage {
  type: 'saveDraftError';
  invalidExpressions: Array<{
    sectionKey: string;   // e.g. 'superClassExpressions'
    index: number;        // zero-based index within the section
    text: string;         // the raw invalid expression text
  }>;
}
```

**Trigger**: Sent by the extension host immediately after processing a `save` message that contained one or more entries in `invalidExpressionIndices`.

**Webview contract**:
1. Apply `draft-invalid` CSS class (red border) to the expression container at `sectionKey[index]`.
2. Display a dismissible error notification banner identifying the affected sections.
3. The banner MUST remain visible until the user corrects and successfully saves the expression (i.e., until a subsequent `loadEntity` message with no `draftExpressions` for this section/index is received, or the expression is deleted).

**Updated union type**:
```typescript
export type EntityEditorExtToWebview =
  | LoadEntityMessage
  | CompletionResultMessage
  | ValidationResultMessage
  | SaveDraftErrorMessage;   // NEW
```

---

## Unchanged Messages

The following message types are unaffected by this feature:

- `EntityEditorReadyMessage`
- `RequestCompletionMessage`
- `ValidateMessage`
- `NavigateMessage`
- `FocusEntityMessage`
- `OpenExternalMessage`
- `CompletionResultMessage`
- `ValidationResultMessage`
