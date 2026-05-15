# Implementation Plan: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss` | **Date**: 2026-05-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-fix-sync-data-loss/spec.md`

## Summary

The sync layer (`AnnotationSync.ts`, `AxiomSync.ts`) rewrites entity annotation and axiom blocks from the in-memory model's enumeration order on every save, regardless of whether anything changed. `entityAnnotationPairs()` always emits `rdfs:label` annotations first, then others — so files that store annotations in a different order receive a spurious reordering diff on every sync. Axiom sync similarly deletes and regenerates all axiom lines even when only one was added.

The fix switches every sync function from "delete all, regenerate from model" to a **diff-based approach**: compare the file's current annotation/axiom set to the model's desired set; apply only the delta (insert new items, delete removed items). When the delta is empty the function returns `null` without touching the file.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode), Node.js (extension host)
**Primary Dependencies**: VS Code Extension API (`vscode.TextDocument`, `vscode.WorkspaceEdit`, `vscode.Position`, `vscode.Range`)
**Storage**: OWL files on disk (`.ofn`, `.omn`, `.ttl`)
**Testing**: Vitest — test files in `src/sync/__tests__/`
**Target Platform**: VS Code extension host (Node.js)
**Project Type**: VS Code extension
**Performance Goals**: Sync must remain sub-second for entities with up to 200 annotations; no regression on SNOMED CT–scale files
**Constraints**: No full file re-parse on sync; in-place edit only; no new runtime dependencies
**Scale/Scope**: Handles individual entity edits inside ontologies up to 50 000+ classes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ PASS | Failing tests written before every implementation task (TDD enforced per workflow) |
| II. Simplicity & YAGNI | ✅ PASS | Diff logic added inline to each sync function; no new abstractions, no new layers |
| III. OWL Standards Compliance | ✅ PASS | Output format is unchanged; only the edit strategy changes. New axioms inserted per constitution ordering (EquivalentClasses before SubClassOf) |
| IV. Scale-Aware Architecture | ✅ PASS | Sync is entity-scoped (touches only the edited entity's lines); no full-file iteration added |
| V. Security & Safety | ✅ PASS | No new input surfaces; IRI resolution and prefix-map parsing are unchanged |

**Post-design re-check**: All gates pass. The diff-based approach adds no new abstractions and introduces no ordering deviations.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-sync-data-loss/
├── plan.md              # This file
├── research.md          # Phase 0 — root cause analysis and fix strategy
├── data-model.md        # Phase 1 — AnnotationItem, AxiomItem, SyncDiff types
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

No contracts directory — this is a pure internal bug fix with no public API surface changes.

### Source Code (repository root)

```text
src/
└── sync/
    ├── AnnotationSync.ts        # Modified: all three format sync functions
    ├── AxiomSync.ts             # Modified: functional and Manchester axiom syncs + Turtle combined sync
    └── __tests__/
        ├── AnnotationSync.test.ts  # Extended with idempotency + order-preservation tests
        └── AxiomSync.test.ts       # Extended with idempotency + minimal-diff tests
```

No other files are touched. The serializer, parser, model, and extension layers are unaffected.

**Structure Decision**: Single project, modifications confined to `src/sync/`. Tests live alongside the source files per project convention.

---

## Phase 1: Fix AnnotationSync — Functional Syntax

**Goal**: `syncFunctional` in `AnnotationSync.ts` must be idempotent and order-preserving.

### Algorithm change (syncFunctional)

**Current**: Collect all `AnnotationAssertion` line indices for the entity → `toDelete`. Replace the first with all model-generated lines; delete the rest. Always produces an edit, always emits in model order.

**New**:
1. Parse the file for all `AnnotationAssertion` lines matching this entity → `fileItems: Array<{key, lineIdx, generatedLine}>` (key = `propIri|text|lang`).
2. Generate the desired annotation lines from the model → `modelItems: Map<key, generatedLine>`.
3. `toRemove` = entries in `fileItems` whose key is absent from `modelItems`.
4. `toAdd` = entries in `modelItems` whose key is absent from the file key set.
5. If `toRemove` is empty and `toAdd` is empty → return `null` (no edit).
6. Delete lines in `toRemove` (in reverse line-index order).
7. Insert lines in `toAdd` after `fileItems[fileItems.length - 1].lineIdx` (last existing annotation line); if no existing annotations, insert after the cluster header or entity anchor.

**Preserves**: existing annotation order for unchanged items.

### Tasks

- [ ] Task 1.1: Write failing tests for `syncFunctional` idempotency and order-preservation
  - Test: same annotation set in file and model → `applyEdit` NOT called
  - Test: annotations in non-model order (definition before label) + no model change → `applyEdit` NOT called
  - Test: new annotation added → exactly one insert edit, no deletes, existing lines unchanged
  - Test: annotation removed → exactly one delete edit, no other lines touched
  - Run tests; confirm they fail before any implementation

- [ ] Task 1.2: Implement diff-based `syncFunctional` in `AnnotationSync.ts`
  - Add `buildAnnotationItemKey(propIri, text, lang?)` helper
  - Rewrite the body of `syncFunctional` to compute `toAdd`/`toRemove` before building the edit
  - Early return `{ edit: new WorkspaceEdit(), addedRanges: [] }` with empty edit object if no delta; or return `null`
  - Run tests; confirm they pass

---

## Phase 2: Fix AnnotationSync — Manchester and Turtle Formats

**Goal**: `syncManchester` and `syncTurtle` share the same idempotency and order-preservation requirements.

### syncManchester

Manchester stores all annotations in a single `Annotations: … ,\n    …` block. The idempotency fix here is simpler: compare the **generated block string** to the **existing block string** (after normalising whitespace). If equal → return `null`.

For order-preservation: regenerate the block in file order (track existing annotation order from the parsed block, emit unchanged annotations first, append new ones at the end).

### syncTurtle

`syncTurtle` in `AnnotationSync.ts` uses `entityAnnotationPairs` which emits in model order. Apply the same diff-based approach as functional syntax but for Turtle predicate segments.

### Tasks

- [ ] Task 2.1: Write failing tests for `syncManchester` idempotency
  - Test: same annotation content → no edit applied
  - Test: new annotation added → block update contains only the addition at the end
  - Run and confirm failures

- [ ] Task 2.2: Implement idempotency check and order-preservation in `syncManchester`
  - Before building the edit, compare the new block to the extracted existing block
  - If identical → return `null`
  - For order: preserve existing annotation items in document order; append new ones after

- [ ] Task 2.3: Write failing tests for `syncTurtle` (AnnotationSync) idempotency
  - Test: same annotation set in Turtle file → no edit
  - Test: add annotation → single segment addition, existing segments unmoved
  - Run and confirm failures

- [ ] Task 2.4: Implement diff-based annotation handling in `syncTurtle` (AnnotationSync)
  - Apply same diff-key approach used for functional syntax to the Turtle predicate segment list

---

## Phase 3: Fix AxiomSync — Functional Syntax

**Goal**: `syncAxiomsFunctional` must return `null` when the axiom set is unchanged, and produce a minimal diff (only new axiom lines added, only removed axiom lines deleted) when it does change.

### Algorithm change (syncAxiomsFunctional)

**Current**: `regularToDelete` = all existing regular-axiom line indices → replace first with all new lines, delete the rest. Always a block rewrite.

**New**:
1. Collect existing regular axiom lines for the entity → `fileAxioms: Array<{normalised, lineIdx, keyword}>`.
2. Generate desired axiom lines from model → `modelAxioms: Array<{normalised, keyword}>` (same normalisation).
3. `toRemove` = entries in `fileAxioms` absent from `modelAxioms` (by normalised content).
4. `toAdd` = entries in `modelAxioms` absent from `fileAxioms`.
5. If both empty → return `null`.
6. Delete `toRemove` lines (reverse order).
7. Insert `toAdd` lines:
   - New EquivalentClasses axioms: after last existing EquivalentClasses line, or before first SubClassOf if no EquivalentClasses exist.
   - New SubClassOf axioms: after last existing SubClassOf line, or after anchor if none.
   - New DisjointClasses axioms: after last existing DisjointClasses line, or after last SubClassOf.
   - Other entity types: after last existing axiom of the same keyword type, or at anchor.

Apply same approach to GCI lines (they use a separate toDelete/insert already).

### Tasks

- [ ] Task 3.1: Write failing tests for `syncAxiomsFunctional` idempotency
  - Test: same axiom set in file and model → `applyEdit` NOT called
  - Test: add one SubClassOf → diff has exactly one insert, zero deletes (excluding the replaced range trick)
  - Test: remove one SubClassOf → diff has exactly one delete, zero inserts
  - Test: EquivalentClasses insertion preserves ordering before SubClassOf
  - Run and confirm failures

- [ ] Task 3.2: Implement diff-based `syncAxiomsFunctional` in `AxiomSync.ts`
  - Add `normaliseAxiomLine(line, prefixes)` helper (trims whitespace, resolves abbreviated IRIs for comparison)
  - Rewrite regular-axiom portion of `syncAxiomsFunctional`
  - Preserve GCI handling (already separate; add no-op check for GCIs too)
  - Run tests; confirm they pass

---

## Phase 4: Fix AxiomSync — Manchester and Turtle Formats

**Goal**: Manchester axiom sections and the Turtle combined sync share the same no-op requirement.

### syncAxiomsManchester

Manchester axiom sections (SubClassOf:, EquivalentTo:, etc.) are already written as blocks. Idempotency check: compare generated section string to existing section string. If equal → no edit for that section.

### syncAxiomsTurtle (combined annotation + axiom)

`syncAxiomsTurtle` in `AxiomSync.ts` rebuilds the entire Turtle subject block from scratch (structural + annotation segments). Apply diff-based segment comparison: if `allSegs` generated equals the segments extracted from the current block → return `null`.

### Tasks

- [ ] Task 4.1: Write failing tests for `syncAxiomsManchester` idempotency
  - Test: same axiom sections → no edit
  - Test: add one SubClassOf item → only that item appears in diff
  - Run and confirm failures

- [ ] Task 4.2: Implement idempotency checks in `syncAxiomsManchester`
  - Add per-section content comparison before building the edit
  - Return `null` if all sections unchanged

- [ ] Task 4.3: Write failing tests for `syncAxiomsTurtle` (combined) idempotency
  - Test: no annotation or axiom changes → no edit
  - Test: add structural segment → minimal diff
  - Test: add annotation segment → minimal diff
  - Run and confirm failures

- [ ] Task 4.4: Implement idempotency check in `syncAxiomsTurtle`
  - Compare `rebuiltLines.join('\n')` to `lines.slice(blockStart, blockEnd).join('\n')` before applying
  - If equal → return `null`

---

## Phase 5: Integration Verification

**Goal**: Confirm all six sync functions pass the full test suite and real-file round-trips.

### Tasks

- [ ] Task 5.1: Run full test suite; confirm all tests pass
  - `npm test` — zero failures
  - Coverage ≥ 80% for modified files

- [ ] Task 5.2: Type-check; confirm no regressions
  - `npm run compile` — zero errors

- [ ] Task 5.3: Manual round-trip verification
  - Open `test-ontologies/animals.omn` in VS Code with extension loaded
  - Add annotation to a class → verify git diff shows exactly one added line
  - Add SubClassOf axiom → verify git diff shows exactly one added line
  - Open and close entity editor without editing → verify git diff is empty
  - Repeat with `animals.ttl` and a `.ofn` test file

- [ ] Task 5.4: Conductor — User Manual Verification 'Fix Spurious OWL File Changes on Sync' (Protocol in workflow.md)

---

## Complexity Tracking

No constitution violations. The diff-based approach is strictly simpler than the current "replace all" strategy — it adds a comparison step and removes the unconditional block rewrite.

| Item | Principle | Resolution |
|------|-----------|------------|
| Principle IV anatomy.owl benchmark | IV. Scale-Aware Architecture | `sync-anatomy-bench.test.ts` added (T020): asserts both sync functions complete a no-op scan of the 302k-line anatomy.owl in < 500ms. Benchmark skips gracefully when the file is absent (not committed to git). Measured: two scans take ~250ms combined on development hardware. |
