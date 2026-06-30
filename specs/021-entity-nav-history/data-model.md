# Data Model: Entity Navigation History

**Feature**: 021-entity-nav-history | **Date**: 2026-06-30

## NavigationHistory

**File**: `src/views/NavigationHistory.ts`

### Fields

| Field | Type | Access | Description |
|-------|------|--------|-------------|
| `backStack` | `string[]` | private | Ordered list of visited entity IRIs; index 0 = oldest, last = current |
| `forwardStack` | `string[]` | private | IRIs available to redo; index 0 = oldest, last = most recently undone |
| `MAX_DEPTH` | `50` | private | Maximum number of entries retained in `backStack` |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `push` | `(iri: string) => void` | Appends `iri` to `backStack`. Clears `forwardStack`. Skips if `iri === backStack.at(-1)` (consecutive dedup). Shifts oldest if length exceeds `MAX_DEPTH`. |
| `back` | `() => string \| undefined` | Pops `backStack` top → `forwardStack`. Returns new `backStack` top (entity to show). Returns `undefined` if `backStack` has ≤ 1 entry. |
| `forward` | `() => string \| undefined` | Pops `forwardStack` top → `backStack`. Returns the popped value (entity to show). Returns `undefined` if `forwardStack` is empty. |
| `clear` | `() => void` | Sets both stacks to `[]`. |

### Getters

| Getter | Returns | Condition |
|--------|---------|-----------|
| `canGoBack` | `boolean` | `this.backStack.length > 1` |
| `canGoForward` | `boolean` | `this.forwardStack.length > 0` |

### State Transitions

```
Initial state:   backStack=[], forwardStack=[]

push("A"):       backStack=["A"], forwardStack=[]
push("B"):       backStack=["A","B"], forwardStack=[]
push("C"):       backStack=["A","B","C"], forwardStack=[]
push("C"):       backStack=["A","B","C"], forwardStack=[]   ← dedup, no change

back()→"B":      backStack=["A","B"], forwardStack=["C"]    ← shows "B"
back()→"A":      backStack=["A"], forwardStack=["C","B"]    ← shows "A"

forward()→"B":   backStack=["A","B"], forwardStack=["C"]    ← shows "B"

push("D"):       backStack=["A","B","D"], forwardStack=[]   ← forward cleared

clear():         backStack=[], forwardStack=[]
```

### Validation Rules

- `push` with an empty string is a no-op (guard: `if (!iri) return`).
- When `backStack` grows beyond `MAX_DEPTH`, `backStack.shift()` removes the oldest entry.
- `back()` and `forward()` are safe to call when stacks are at boundary; they return `undefined` gracefully.
