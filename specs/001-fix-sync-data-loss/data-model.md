# Data Model: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss`
**Date**: 2026-05-14

---

## Core Concepts

### AnnotationItem
Represents a single annotation statement as it exists in either the in-memory model or the OWL file.

| Field | Type | Description |
|-------|------|-------------|
| `propIri` | `string` | Full IRI of the annotation property (e.g. `http://www.w3.org/2000/01/rdf-schema#label`) |
| `text` | `string` | Literal value (unescaped) |
| `lang` | `string \| undefined` | Language tag (e.g. `"en"`) or `undefined` for plain/datatype literals |

**Identity key**: `propIri + "|" + text + "|" + (lang ?? "")` — two `AnnotationItem`s are considered the same statement if all three fields match.

---

### AxiomItem
Represents a single logical axiom statement as it exists in either the in-memory model or the OWL file (functional syntax).

| Field | Type | Description |
|-------|------|-------------|
| `keyword` | `string` | Axiom keyword (e.g. `SubClassOf`, `EquivalentClasses`) |
| `lineContent` | `string` | Full normalised line content (trimmed whitespace) used as identity key |

**Identity key**: `lineContent` — two `AxiomItem`s are the same if their full normalised line content matches.

---

### SyncDiff\<T\>
The result of comparing the file's current items to the model's desired items.

| Field | Type | Description |
|-------|------|-------------|
| `toAdd` | `T[]` | Items present in model but not in file — must be inserted |
| `toRemove` | `{ item: T; lineIdx: number }[]` | Items present in file but not in model — must be deleted by line index |
| `isEmpty` | `boolean` | `true` when both `toAdd` and `toRemove` are empty (no-op) |

---

### FileAnnotationBlock
The current state of an entity's annotation lines as read from the file.

| Field | Type | Description |
|-------|------|-------------|
| `items` | `Array<{ item: AnnotationItem; lineIdx: number }>` | Ordered list of (annotation, line index) pairs as they appear in the file |
| `lastLineIdx` | `number` | Line index of the last annotation line for this entity (insertion point for additions) |

---

### FileAxiomBlock
The current state of an entity's logical axiom lines as read from the file.

| Field | Type | Description |
|-------|------|-------------|
| `items` | `Array<{ item: AxiomItem; lineIdx: number; keyword: string }>` | Ordered list of axiom lines |
| `anchorLineIdx` | `number` | Line index after which new axioms should be inserted (last axiom line, or Declaration line if no axioms) |
| `lastByKeyword` | `Map<string, number>` | Maps keyword → line index of its last occurrence (for per-keyword insertion) |

---

## State Transitions

```
Entity in UI
     │
     ▼
User makes edit (add/remove/update annotation or axiom)
     │
     ▼
In-memory OntologyModel updated (entity.labels / entity.annotations / cls.superClassIris / etc.)
     │
     ▼
EntityEditorPanel triggers sync
     │
     ├─ [format == turtle] ──► syncAxiomsTurtle (handles both annotations + axioms atomically)
     │
     └─ [format == functional | manchester]
          │
          ├─ syncAnnotationsToDocument (awaited)
          │       ├─ Read file → build FileAnnotationBlock
          │       ├─ Read model → build desired AnnotationItem[]
          │       ├─ Compute SyncDiff<AnnotationItem>
          │       ├─ [isEmpty == true] → return null (NO FILE CHANGE)
          │       └─ [isEmpty == false] → apply minimal edit (delete removed, insert added)
          │
          └─ syncAxiomsToDocument (awaited, on updated doc)
                  ├─ Read file → build FileAxiomBlock
                  ├─ Read model → build desired AxiomItem[]
                  ├─ Compute SyncDiff<AxiomItem>
                  ├─ [isEmpty == true] → return null (NO FILE CHANGE)
                  └─ [isEmpty == false] → apply minimal edit
```

---

## Validation Rules

- **Annotation identity is value-based**: Two annotations with the same propIri + text + lang are the same statement, even if the IRI is abbreviated differently in the file (resolved via prefix map before comparison).
- **Axiom identity is content-based**: Axiom lines are compared after normalisation (trim leading/trailing whitespace; resolve prefix abbreviations to full IRIs for comparison only — the file line written back uses the original abbreviation form).
- **Insertion order for new annotations**: New annotation items are appended after `FileAnnotationBlock.lastLineIdx`. They do not change the position of existing annotations.
- **Insertion order for new axioms**: New axiom items are inserted after `FileAxiomBlock.lastByKeyword[keyword]` if that keyword already exists in the file; otherwise after `FileAxiomBlock.anchorLineIdx`. This preserves the EquivalentClasses-before-SubClassOf ordering required by the constitution.
- **No-op guarantee**: If `SyncDiff.isEmpty` is true for both annotations and axioms, `vscode.workspace.applyEdit` MUST NOT be called for that entity save operation.
