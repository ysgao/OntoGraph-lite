# Contract: manchesterFormat module API

**Module**: `webview-src/manchesterFormat.ts`  
**Consumers**: `webview-src/entity-editor/EntityEditorApp.ts`, `webview-src/dl-query/DLQueryApp.ts`

## Exported Functions

### `formatManchesterForDisplay`

```typescript
export function formatManchesterForDisplay(expr: string): string
```

**Preconditions**: `expr` is a string (may be empty, may be invalid Manchester syntax).  
**Postconditions**: Returns a string where each bare ` and ` (not inside `<…>`, `"…"`, or `'…'`) is replaced by `'\n    and '` (newline + 4-space indent).  
**Never throws**.

### `collectLogicalLines`

```typescript
export function collectLogicalLines(rawText: string): string[]
```

**Preconditions**: `rawText` is the `toString()` of a CodeMirror document.  
**Postconditions**:
- Returns an array of trimmed, non-empty, non-comment strings.
- Lines matching `/^and\s/i` after trimming are appended to the previous entry.
- An empty rawText or all-blank rawText returns `[]`.

**Never throws**.

### `stripAndContinuations`

```typescript
export function stripAndContinuations(rawText: string): string
```

**Preconditions**: `rawText` contains at most one logical expression (single-expression editors).  
**Postconditions**: Returns a single-line string equivalent to `collectLogicalLines(rawText).join(' ')`, or `''` if the input is blank.  
**Never throws**.

## Stability

These three exports are the complete public API. No other symbols are exported. The module has no side effects on import.
