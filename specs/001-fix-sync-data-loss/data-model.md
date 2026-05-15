# Data Model: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss` | **Phase**: 1 | **Date**: 2026-05-15

This feature is a bug fix to the incremental sync layer. No new entities or fields are added to `OntologyModel`. The changes are entirely within `AnnotationSync.ts` and `AxiomSync.ts`.

---

## Affected Entities (Existing, Unchanged)

### `OWLEntity` (`src/model/OntologyModel.ts`)

| Field | Type | Role in sync |
|-------|------|--------------|
| `iri` | `string` | Identifies the entity in the file |
| `type` | `'class' \| 'objectProperty' \| ...` | Determines which axiom keywords to look for |
| `labels` | `Record<string, string[]>` | Language-keyed label strings; iterated in insertion order |
| `annotations` | `Record<string, string[]>` | Property-IRI-keyed annotation values; iterated in insertion order |

**Invariant** (unchanged): The model's iteration order over `labels` and `annotations` is not required to match the on-disk file order. Sync must treat the model as an unordered bag of annotation key-value pairs and use the file order as authoritative for existing annotations.

---

## Internal Types (sync layer only, no model changes)

### `AnnotationKey` (already in `AnnotationSync.ts`, extended to Manchester)

```typescript
interface AnnotationKey {
  propIri: string;
  text: string;
  lang?: string;
  key: string;  // canonical: `${propIri}|${text}|${lang ?? ''}`
}
```

This type already exists in `AnnotationSync.ts` for the functional format. The Manchester fix reuses the same key format. The Turtle fix uses the same key format inline.

---

## Changed Functions

### `src/sync/AnnotationSync.ts`

| Function | Change | Reason |
|----------|--------|--------|
| `syncManchester` | Replace full-text idempotency check + block-replace with key-based diff + targeted insert/delete | Bug 1: model-order block replaces file-order block |
| `syncTurtle` | Replace model-order annotation segs with file-order extraction + key-based diff | Dead code path, but fix for correctness |
| `parseManchesterAnnotationLine` *(new)* | Parse a single Manchester annotation item line into `AnnotationKey` | Supports key-based diff in `syncManchester` |

### `src/sync/AxiomSync.ts`

| Function | Change | Reason |
|----------|--------|--------|
| `syncAxiomsTurtle` | Extract annotation segs from existing block in file order; key-based diff; rebuild with file-order-preserved annotation segs | Bug 2: model-order annotations cause spurious full-block rewrite |

---

## Key Invariants (post-fix)

1. **Idempotency**: If model annotations = file annotations (same set of `propIri|text|lang` keys), `syncManchester` and `syncAxiomsTurtle` return `null` regardless of ordering differences between model and file.

2. **Order preservation**: For annotations kept in both model and file, their relative order in the rebuilt/patched block MUST match their relative order in the original file.

3. **Append-only for new**: New annotations (in model, not in file) are appended after the last existing annotation line. They do not affect the positions of existing lines.

4. **Deletion without reorder**: Removed annotations (in file, not in model) are deleted individually without reordering remaining lines.

5. **No cross-contamination**: Manchester annotation sync does not touch axiom sections. Manchester axiom sync does not touch the `Annotations:` section.

---

## State Transitions (Sync Operation, post-fix)

```
Trigger: EntityEditorPanel receives 'save' message
    │
    ├─ format = turtle
    │      └─ syncAxiomsTurtle()
    │             ├─ Extract structural segs from existing block (model-driven, unchanged)
    │             ├─ Extract annotation segs from existing block (FILE ORDER) ← NEW
    │             ├─ Diff file annotation keys vs model annotation keys ← NEW
    │             ├─ Rebuild: structural (model) + kept annots (file order) + new annots ← NEW
    │             └─ If rebuilt == existing → return null (idempotent) ← already present
    │
    └─ format = manchester | functional
           ├─ syncAnnotationsToDocument()
           │      ├─ functional → syncFunctional() [no change — already correct]
           │      └─ manchester → syncManchester() [FIXED]
           │             ├─ Parse annotation keys from each line in Annotations: block ← NEW
           │             ├─ Compute toAdd / toRemove via set diff ← NEW
           │             ├─ If both empty → return null (idempotent) ← NEW
           │             └─ If changed → delete removed lines + insert new lines ← NEW
           │
           └─ syncAxiomsToDocument()  [no change to this path for Manchester/Functional]
```

---

## Test Coverage Plan

New test cases added (all failing before fix, passing after):

| Test ID | Format | Scenario | Assertion |
|---------|--------|----------|-----------|
| T-NEW-1 | Manchester | File annotation order (definition → label) ≠ model order (label → definition); no changes | `syncAnnotationsToDocument` returns `null`; no write |
| T-NEW-2 | Manchester | Add one annotation to class with annotations in reverse model order | Diff: +1 line, 0 deletions, existing lines in original file order |
| T-NEW-3 | Turtle | File annotation order ≠ model order; no axiom changes | `syncAxiomsToDocument` returns `null`; no write |
| T-NEW-4 | Turtle | Add one annotation; existing annotations in reverse model order | Rebuilt block: existing annotations in original order, new appended |
| T-NEW-5 | Manchester | Zero existing annotations → add first annotation | Exactly one `Annotations:` block added, no other changes |
| T-NEW-6 | Turtle | Zero existing annotations → add first annotation | Exactly one annotation predicate appended, structural segs unchanged |
