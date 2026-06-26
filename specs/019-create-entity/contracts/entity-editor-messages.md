# Contract: Entity Editor IPC Messages (Extension)

**Feature**: 019-create-entity
**File**: `src/views/EntityEditorMessages.ts`
**Protocol**: VS Code `postMessage` over the extension-webview boundary

This document describes the **new message types** added by this feature. Existing message types are unchanged.

---

## New: Webview → Extension

### `RenameIriMessage`

Sent when the user edits the IRI field in the Entity Editor and confirms the change.

```typescript
{
  command: 'renameIri';
  currentIri: string;   // The entity's current IRI (used to locate it in the model)
  newIri: string;       // The desired new IRI (absolute IRI string)
}
```

**Trigger**: User submits the IRI input field (blur or Enter key).

**Extension host response**: Must send back an `IriRenameResultMessage`.

---

## New: Extension → Webview

### `IriRenameResultMessage`

Sent in response to `RenameIriMessage`. Reports success or failure.

```typescript
{
  command: 'iriRenameResult';
  success: boolean;
  newIri?: string;    // The accepted new IRI; only present if success === true
  error?: string;     // Human-readable error string; only present if success === false
}
```

**On success**: The webview updates the displayed IRI to `newIri` and clears the error state.

**On failure**: The webview reverts the IRI field to `currentIri` and displays `error` inline.

---

## Existing Messages: IRI Field Behaviour (unchanged contract)

The existing `LoadEntityMessage` carries the entity IRI:

```typescript
{
  command: 'loadEntity';
  iri: string;          // Full entity IRI — now also pre-populates the editable IRI field
  type: EntityType;
  labels: ...;
  annotations: ...;
  axioms: ...;
}
```

No changes to `LoadEntityMessage` structure; only the webview rendering changes (span → input).

---

## Validation Rules (enforced by extension host)

| Rule | Error message |
|------|---------------|
| `newIri` is empty | "IRI must not be empty" |
| `newIri` is not a valid absolute IRI | "Not a valid IRI" |
| `newIri` already exists in the ontology | "An entity with this IRI already exists" |
| `newIri` equals `currentIri` | no-op (no message sent) |
