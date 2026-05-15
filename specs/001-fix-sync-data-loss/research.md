# Research: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss`
**Date**: 2026-05-14

---

## Root Cause Analysis

### Decision: Annotation ordering mismatch is the primary cause

**Finding**: `entityAnnotationPairs()` in `AnnotationSync.ts` (and the equivalent `entityAnnotationSegs()` in `AxiomSync.ts`) always enumerates annotations in a fixed model order: all entries from `entity.labels` (rdfs:label) first, then all entries from `entity.annotations` in JavaScript object-key insertion order.

When an OWL file stores annotations in a different order — for example `skos:definition` before `rdfs:label` — the sync rewrites the annotation block in model order on every save. Even when the user made no edits, this produces a non-empty diff showing lines "deleted" and "re-added" in a different order.

**Rationale**: Confirmed by tracing `syncFunctional`: it collects all `AnnotationAssertion` lines for the entity into `toDelete`, replaces the first with `newLines` (model-ordered), and deletes the rest. No comparison is made between the generated output and the current file content.

**Alternatives considered**:
- Normalise both model and file to alphabetical IRI order: rejected — changes existing stable order in ways users haven't requested.
- Always write rdfs:label last: rejected — not how Protégé writes it; would cause reordering in the other direction.

---

### Decision: The same "replace all" pattern in AxiomSync produces noisy axiom diffs

**Finding**: `syncAxiomsFunctional` finds all existing axiom lines for an entity and replaces them wholesale with the regenerated set. If a class already has five `SubClassOf` lines and the user adds a sixth, the diff shows five deleted lines and six added lines instead of a single addition.

**Rationale**: The function builds `regularToDelete` (all existing axiom line indices) then emits all new axiom lines replacing the block. No per-line comparison against the existing content is performed.

**Alternatives considered**:
- Accept noisy axiom diffs (only fix annotations): rejected — spec SC-003 explicitly requires exactly one added line when one axiom is added.

---

### Decision: No concurrent-edit race condition for .ofn/.omn

**Finding**: `EntityEditorPanel.ts` calls `syncAnnotationsToDocument` first and explicitly awaits it, then re-fetches the updated document and passes it to `syncAxiomsToDocument`. The two syncs are sequential, not parallel. The concurrent-edit race is therefore not a contributor to the reported data loss.

**Rationale**: Code at `EntityEditorPanel.ts:265–272` shows the sequential await pattern and the `updatedDoc` re-fetch between the two calls.

**Alternatives considered**:
- Combine annotation + axiom sync into one edit for .ofn (as is done for .ttl): not needed since the sequential pattern already prevents the race.

---

### Decision: Fix strategy — diff-based sync replacing "replace all"

**Finding**: Switching from "delete all existing lines, regenerate from model" to a diff-based approach achieves both idempotency and minimal diffs:

1. Build a set of annotation (or axiom) items currently present in the file, keyed by a canonical identity (`propIri|value|lang` for annotations; normalised line content for axioms).
2. Build the desired set from the in-memory entity model.
3. Compute `toAdd = desired – file` and `toRemove = file – desired`.
4. If both sets are empty: return `null` immediately (no edit applied, no diff, no commit).
5. Otherwise: delete lines in `toRemove` (by their file positions), insert lines in `toAdd` after the last existing item of that entity in the file.

For annotations this preserves file order for unchanged items.  
For axioms this inserts new items after the last existing axiom of the same semantic group (EquivalentClasses group before SubClassOf group per constitution ordering).

**Rationale**: Minimal change to observable behaviour; resolves both the spurious-reorder problem and the noisy-diff problem without restructuring the sync layer.

**Alternatives considered**:
- Idempotency check only (compare whole generated block to file block): simpler but still produces noisy diffs when adding one item (all existing lines are replaced unnecessarily).
- Full cluster replacement with pre/post comparison: overly complex; also touches axiom lines when only annotations changed.

---

### Decision: Scope — AnnotationSync (all 3 formats) and AxiomSync functional + Manchester

**Finding**: The diff-based fix is needed in:
- `AnnotationSync.ts`: `syncFunctional`, `syncManchester`, `syncTurtle` (the last also uses `entityAnnotationPairs`).
- `AxiomSync.ts`: `syncAxiomsFunctional`, `syncAxiomsManchester`, `syncAxiomsTurtle` (Turtle combines both — annotation ordering there also uses `entityAnnotationSegs`).

Manchester `Annotations:` section is a block rather than individual lines; the diff check there is simpler: compare the generated block string to the existing block string and skip if equal.

**Rationale**: All six sync functions share the "replace all" pattern.

**Alternatives considered**:
- Fix only `syncFunctional` first: partial fix; Manchester and Turtle users would still see spurious diffs.

---

## Summary Table

| Question | Decision | Key Reason |
|----------|----------|------------|
| Primary cause | Annotation ordering mismatch in `entityAnnotationPairs` / `entityAnnotationSegs` | Always emits labels before other annotations regardless of file order |
| Secondary cause | Axiom "replace all" produces noisy diffs | No per-line idempotency check |
| Concurrent race | Not a factor for .ofn/.omn | EntityEditorPanel awaits annotation sync before starting axiom sync |
| Fix strategy | Diff-based sync | Preserves unchanged line order; inserts/removes only delta lines |
| Scope | All 6 sync functions in AnnotationSync + AxiomSync | Same pattern across all three formats |
