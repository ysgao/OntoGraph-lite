# Data Model: Entity Editor Undo/Redo

**Feature**: 014-entity-editor-undo-redo  
**Date**: 2026-06-02

## Entities

### EntitySnapshot

A point-in-time capture of all editable fields for a single entity, in the same shape as `LoadEntityMessage`. This is the checkpoint payload stored in `EntityEditHistory`.

```
EntitySnapshot
├── iri: string                         — entity IRI (key)
├── entityType: EntityType              — 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual'
├── labels: Record<langTag, string[]>   — language-tagged label values
├── annotations: Record<propIri, string[]> — annotation property IRI → values
│
│   (class-specific)
├── superClassIris: string[]
├── superClassExpressions: string[]
├── equivalentClassIris: string[]
├── equivalentClassExpressions: string[]
├── gciExpressions: string[]
├── disjointClassIris: string[]
│
│   (property-specific)
├── superPropertyIris: string[]
├── domainIris: string[]
├── rangeIris: string[]
├── equivalentPropertyIris: string[]
├── disjointPropertyIris: string[]
├── inverseOfIri: string | undefined
├── propertyChains: string[][]
├── isTransitive: boolean
├── isSymmetric: boolean
├── isReflexive: boolean
├── isIrreflexive: boolean
├── isAsymmetric: boolean
├── isFunctional: boolean
├── isInverseFunctional: boolean
│
│   (individual-specific)
├── classIris: string[]
├── objectPropertyAssertions: { propertyIri: string; targetIri: string }[]
└── dataPropertyAssertions: { propertyIri: string; value: string; datatype?: string }[]
```

**Validation rules**:
- `iri` must be non-empty
- `entityType` must be a known enum value
- All array fields default to `[]` when absent; all optional scalars default to `undefined`

---

### EntityEditHistory

Manages the undo/redo checkpoint stack for a single entity. Lives in-memory on the extension host, keyed by entity IRI in `EntityEditorPanel`.

```
EntityEditHistory
├── entityIri: string
├── undoStack: EntitySnapshot[]    — oldest at index 0; push to end, pop from end
├── redoStack: EntitySnapshot[]    — cleared on new save; push/pop from end
└── maxSize: number = 50
```

**State transitions**:

```
Initial state: undoStack = [], redoStack = []

[Entity first loaded] → undoStack = [initialSnapshot], redoStack = []
  (initial snapshot is the "before first save" baseline)

[User saves] →
  if undoStack.length >= maxSize: drop undoStack[0]
  undoStack.push(currentSnapshot)   // snapshot taken BEFORE applying save
  redoStack = []                     // new save clears redo branch

[User undoes] →
  requires: undoStack.length > 0
  redoStack.push(currentDisplayedSnapshot)
  restore(undoStack.pop())

[User redoes] →
  requires: redoStack.length > 0
  undoStack.push(currentDisplayedSnapshot)
  restore(redoStack.pop())

[External file change / panel close] →
  undoStack = []
  redoStack = []
```

**Invariants**:
- `undoStack.length <= maxSize` at all times
- `redoStack` is always empty immediately after a save
- After undo: `undoStack.length` decreases by 1, `redoStack.length` increases by 1
- After redo: opposite

---

### UndoRedoState

Derived view sent to the webview after every undo/redo/save to enable or disable toolbar buttons.

```
UndoRedoState
├── canUndo: boolean    — undoStack.length > 0
└── canRedo: boolean    — redoStack.length > 0
```

---

## Lifecycle / Ownership

```
EntityEditorPanel
└── historyMap: Map<entityIri, EntityEditHistory>
    ├── Created when entity first loaded into editor
    ├── Updated on every save, undo, redo
    └── Cleared (and entry removed) on panel dispose or external file change
```

No persistence across sessions. `historyMap` is a plain instance field on `EntityEditorPanel` — no VS Code `Memento` or file I/O.
