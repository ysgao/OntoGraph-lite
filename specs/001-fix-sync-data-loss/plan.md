# Implementation Plan: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-sync-data-loss/spec.md`

## Summary

The incremental sync layer produces spurious file changes when the in-memory model stores annotations in a different order than the on-disk file. Two sync functions use full-text comparison against a model-order-generated block instead of a key-based diff: `AnnotationSync.syncManchester` (live path for `.omn`) and `AxiomSync.syncAxiomsTurtle` (live path for `.ttl`). The fix applies the same key-based diff pattern already used by `AnnotationSync.syncFunctional` to both affected functions, preserving existing annotation order in the file and appending new annotations without reordering.

## Technical Context

**Language/Version**: TypeScript 5+, Node.js (extension host)
**Primary Dependencies**: VS Code Extension API (`vscode.WorkspaceEdit`, `vscode.TextDocument`), Vitest
**Storage**: OWL files on disk (`.ofn`, `.omn`, `.ttl`) — read via `vscode.TextDocument`, written via `vscode.workspace.applyEdit`
**Testing**: Vitest (`npm test`); test files in `src/sync/__tests__/`
**Target Platform**: VS Code Extension Host (Node.js, no browser globals)
**Project Type**: VS Code Extension — bug fix to sync layer only
**Performance Goals**: Sync must not iterate the full file more than once per operation; SNOMED CT scale (50k classes, anatomy.owl benchmark) must still pass
**Constraints**: No model changes; no new runtime dependencies; fix must not break existing T002, T005, T007, T012, T014 idempotency tests
**Scale/Scope**: Three OWL formats (`.ofn`, `.omn`, `.ttl`); two sync modules (`AnnotationSync.ts`, `AxiomSync.ts`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Test-First** | PASS — plan mandates Red phase (failing tests) before any implementation | New tests T-NEW-1 through T-NEW-6 must be written and confirmed failing before coding |
| **II. Simplicity & YAGNI** | PASS — key-based diff reuses existing `AnnotationKey` type and key format; no new abstractions | No model changes; no new types beyond one private helper function |
| **III. OWL Standards Compliance** | PASS — no serializer changes; sync layer output is semantically identical to current, just order-preserving | Round-trip fidelity is not affected |
| **IV. Scale-Aware Architecture** | PASS — fix does not add iteration passes; anatomy.owl benchmark (T020) must pass after fix | Each sync function still O(n) in file lines |
| **V. Security & Safety** | PASS — no new IRI parsing paths; regex reused from existing `parseFunctionalAnnotationItem` | No injection vectors introduced |

**Post-design re-check**: All gates still pass. The fix is narrowly scoped to two functions and introduces no new abstractions or dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-sync-data-loss/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — root cause analysis
├── data-model.md        # Phase 1 output — affected entities and invariants
├── quickstart.md        # Phase 1 output — developer verification guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/sync/
├── AnnotationSync.ts      # Bug 1: syncManchester() — full-text comparison → key-based diff
└── AxiomSync.ts           # Bug 2: syncAxiomsTurtle() — model-order annotation segs → file-order

src/sync/__tests__/
├── AnnotationSync.test.ts # Add T-NEW-1, T-NEW-2, T-NEW-5 (Manchester ordering scenarios)
└── AxiomSync.test.ts      # Add T-NEW-3, T-NEW-4, T-NEW-6 (Turtle ordering scenarios)
```

**Structure Decision**: Single-project; changes are entirely within existing sync module files and their test counterparts. No new files needed except quickstart.md.

## Implementation Phases

### Phase 1: Red — Failing Tests

> TDD gate: tests must be written and confirmed failing **before** any implementation code is changed.

**Task 1.1 — Manchester annotation ordering tests (AnnotationSync.test.ts)**

Add to `src/sync/__tests__/AnnotationSync.test.ts`:

- **T-NEW-1** (`syncManchester — idempotency when file order ≠ model order`): File has `[skos:definition, rdfs:label]` order; model has `[rdfs:label, skos:definition]` order (because labels are iterated before annotations in the model). Assert `syncAnnotationsToDocument` returns `null` and `mockApplyEdit` is not called.
- **T-NEW-2** (`syncManchester — add annotation preserves file order`): File has `[skos:definition, rdfs:label]`; model adds a new `skos:altLabel`. Assert only one `insert` call, zero `delete` calls, and the inserted line comes after the last existing annotation line.
- **T-NEW-5** (`syncManchester — add to empty annotation section`): Entity has no annotations; model adds one. Assert the `Annotations:` block is created with exactly one item.

**Task 1.2 — Turtle annotation ordering tests (AxiomSync.test.ts)**

Add to `src/sync/__tests__/AxiomSync.test.ts`:

- **T-NEW-3** (`syncAxiomsTurtle — idempotency when file annotation order ≠ model order`): File has annotations in reverse model order. Assert `syncAxiomsToDocument` returns `null`.
- **T-NEW-4** (`syncAxiomsTurtle — add annotation preserves file order`): File has `[skos:definition, rdfs:label]`; model adds `skos:altLabel`. Assert rebuilt block has definition and label in original order, altLabel appended.
- **T-NEW-6** (`syncAxiomsTurtle — add to entity with no prior annotations`): File has structural segs only; model adds one annotation. Assert exactly one annotation predicate is appended.

Confirm all six new tests **fail** before proceeding:
```bash
npm test -- src/sync/__tests__/AnnotationSync.test.ts
npm test -- src/sync/__tests__/AxiomSync.test.ts
```

---

### Phase 2: Green — Manchester Annotation Sync Fix

**Task 2.1 — Add `parseManchesterAnnotationLine` helper to `AnnotationSync.ts`**

New private function:
```typescript
function parseManchesterAnnotationLine(
  line: string,
  prefixes: Map<string, string>,
): AnnotationKey | null
```

- Trims leading whitespace.
- Extracts first token (property IRI) using `extractLeadingIriTokens`.
- Resolves to full IRI (handles `rdfs:label` → RDFS_LABEL expansion).
- Extracts literal value and language tag with the same regex as `parseFunctionalAnnotationItem`.
- Returns `null` for the `Annotations:` header line and any continuation lines that don't match.

**Task 2.2 — Rewrite `syncManchester` body**

Replace the current logic (generate block → full-text compare → replace section) with:

1. Find the `Annotations:` section within the entity frame (existing frame-finding logic unchanged).
2. Parse each line within the section with `parseManchesterAnnotationLine` → collect `{ key, lineIdx }` items in file order.
3. Build `modelItems` from `entityAnnotationPairs(entity)` (existing helper).
4. Compute `toRemove` (in file, key not in model set) and `toAdd` (in model, key not in file set).
5. If both empty → return `null`.
6. If `toRemove` or `toAdd` non-empty:
   - Delete `toRemove` lines in reverse order.
   - Insert `toAdd` lines after the last kept annotation line (or after the `Annotations:` header if all existing were removed, or create a new `Annotations:` block if the section didn't exist).
7. Return `{ edit, addedRanges }`.

Confirm all six new tests pass AND all existing tests still pass:
```bash
npm test -- src/sync/__tests__/AnnotationSync.test.ts
```

---

### Phase 3: Green — Turtle Axiom Sync Fix

**Task 3.1 — Rewrite annotation handling in `syncAxiomsTurtle`**

Replace the current annotation seg generation (model-order) with file-order extraction + key-based diff:

1. Identify annotation predicate segs from the existing block (IRI in `BUILTIN_ANN_SET`).
2. Parse each annotation seg into a canonical key: `${resolvedPropIri}|${literalText}|${lang ?? ''}`.
3. Build model annotation key set from `entityAnnotationSegs(entity, prefixes)` parsed the same way.
4. Compute `toRemove` and `toAdd`.
5. Rebuild block: `structuralSegs` (unchanged, model-driven) + `keptAnnotSegs` (file order, minus removed) + `newAnnotSegs` (appended).
6. Existing idempotency check (`rebuiltLines.join('\n') === existingBlock`) naturally handles the case when nothing changed — no special casing needed.

Confirm all six new tests pass AND all existing Turtle tests still pass:
```bash
npm test -- src/sync/__tests__/AxiomSync.test.ts
```

---

### Phase 4: Full Verification

**Task 4.1 — Full test suite**

```bash
npm test
npm run compile
```

All tests must pass. Coverage on modified files ≥ 80%. No type errors.

**Task 4.2 — Anatomy.owl benchmark**

```bash
npm test -- src/sync/__tests__/sync-anatomy-bench.test.ts
```

Must complete within existing time budget (Principle IV).

**Task 4.3 — Manual verification**

Open `test-ontologies/animals.omn` in VS Code with the extension active:
1. Open a class, do NOT change anything, save → `git diff` empty.
2. Add one annotation, save → `git diff` shows exactly +1 `AnnotationAssertion` or `Annotations:` item line, 0 deletions.
3. Open `test-ontologies/animals.ttl`, repeat steps 1–2 for Turtle.

## Complexity Tracking

No constitution violations. The fix is narrowly scoped: two functions, same key-based diff pattern already present in the codebase.
