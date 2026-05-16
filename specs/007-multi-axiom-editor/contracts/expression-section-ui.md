# Contract: Expression Section UI

**Component**: Expression section in `webview-src/entity-editor/EntityEditorApp.ts`  
**Consumers**: `renderExpressionSection` → `loadEntity` message handler → `getCurrentState` → `save` message

---

## Section Rendering Contract

### `renderExpressionSection(container, title, key, expressions, perExprRefs)`

```typescript
function renderExpressionSection(
  container: HTMLElement,
  title: string,
  key: string,
  expressions: string[],          // array of single-line logical expressions (pre-format)
  perExprRefs: ExpressionEntityRef[][],  // index-aligned with expressions[]
): void
```

**Preconditions**:
- `expressions` is a (possibly empty) array of single-line Manchester class expression strings.
- `perExprRefs[i]` contains entity refs for `expressions[i]` with `from`/`to` offsets relative to `expressions[i]`.
- Any previous editors for `key` have been destroyed before this call.

**Postconditions**:
- `editorMap[key]` is an array of `expressions.length` editors, each displaying `formatManchesterForDisplay(expressions[i])`.
- Each editor is contained in a `.expression-entry` div with a delete button.
- A `.expression-section-footer` containing an "Add expression" button is appended after all entries.
- If `expressions` is empty, the section shows only the footer with the "Add expression" button.

---

## Expression Entry Contract

### `createExpressionEntry(body, key, expr, refs)`

```typescript
function createExpressionEntry(
  body: HTMLElement,
  key: string,
  expr: string,               // single-line logical expression (pre-format)
  refs: ExpressionEntityRef[], // refs for this expression only, pre-format offsets
): void
```

**Preconditions**:
- `body` is the `.section-body` element of the section.
- `expr` is a single-line string (may be empty for a newly added entry).
- `refs` may be empty.

**Postconditions**:
- A new `<div class="expression-entry">` is appended to `body` (before the footer if one exists).
- The entry contains a CodeMirror editor showing `formatManchesterForDisplay(expr)` with refs shifted for formatting breaks.
- The entry contains a delete button; clicking it destroys the editor, removes the entry from `editorMap[key]`, removes the DOM element, and calls `checkForChanges()`.
- The editor is pushed to `editorMap[key]`.

---

## State Collection Contract

### `collectEditorLines(key): string[]`

```typescript
function collectEditorLines(key: string): string[]
```

**Postconditions**:
- Returns one string per non-blank editor in `editorMap[key]`, in order.
- Each string is a single logical expression (result of `stripAndContinuations(editor.state.doc.toString())`).
- Editors whose content is blank or whitespace-only contribute nothing to the result.

---

## Message Protocol Contract

### `expressionEntityRefs` in `LoadEntityMessage`

**Type**: `Record<string, ExpressionEntityRef[][]>`

Where `ExpressionEntityRef` is:
```typescript
{
  from: number;   // character offset within expressions[i] (0-indexed, pre-format)
  to: number;     // character offset within expressions[i] (0-indexed, pre-format)
  iri: string;
  entityType: EntityType;
  label: string;
}
```

**Constraint**: `expressionEntityRefs[key][i]` is index-aligned with `loadEntityMessage[key][i]`. If `key` has `n` expressions, `expressionEntityRefs[key]` has exactly `n` sub-arrays (some may be empty `[]`).

**Backward compatibility**: Any consumer that reads `expressionEntityRefs[key]` as a flat array will break. The only consumer is `EntityEditorApp.ts` (webview), which is updated in this feature.

---

## Save Message Contract

The `SaveEntityMessage` interface is unchanged. `superClassExpressions`, `equivalentClassExpressions`, and `gciExpressions` remain `string[]` (array of single-line logical expressions). Blank entries are excluded before sending.
