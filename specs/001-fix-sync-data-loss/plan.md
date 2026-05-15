# Implementation Plan: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-sync-data-loss/spec.md`

## Summary

The incremental sync layer produced spurious file changes when the in-memory model stored annotations in a different iteration order than the on-disk file. Two sync functions used full-text comparison against a model-order-generated block instead of a key-based set diff: `AnnotationSync.syncManchester` (live path for `.omn`) and `AxiomSync.syncAxiomsTurtle` (live path for `.ttl`). The fix applied the same key-based diff pattern already used by `AnnotationSync.syncFunctional` to both affected functions, preserving existing annotation order in the file and appending new annotations without reordering. See [research.md](./research.md) for full root-cause analysis.

**Status**: ✅ Complete — all 74 tests passing, zero type errors, manual verification signed off (2026-05-15).

## Technical Context

**Language/Version**: TypeScript 5+, Node.js (extension host)
**Primary Dependencies**: VS Code Extension API (`vscode.WorkspaceEdit`, `vscode.TextDocument`), Vitest
**Storage**: OWL files on disk (`.ofn`, `.omn`, `.ttl`) — read via `vscode.TextDocument`, written via `vscode.workspace.applyEdit`
**Testing**: Vitest (`npm test`); test files in `src/sync/__tests__/`
**Target Platform**: VS Code Extension Host (Node.js)
**Project Type**: VS Code Extension — bug fix to sync layer only
**Performance Goals**: Sync must complete a no-op scan of `test-ontologies/anatomy.owl` (302k lines) in < 500ms
**Constraints**: No model changes; no new runtime dependencies; functional syntax code left untouched
**Scale/Scope**: Three OWL formats (`.ofn`, `.omn`, `.ttl`); two sync modules (`AnnotationSync.ts`, `AxiomSync.ts`)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Test-First** | ✅ PASS | 6 new failing tests written and confirmed failing before any implementation; all pass after fix |
| **II. Simplicity & YAGNI** | ✅ PASS | Key-based diff reuses existing `AnnotationKey` type and key formula; one new private helper `parseManchesterAnnotationLine`; no new abstractions |
| **III. OWL Standards Compliance** | ✅ PASS | No serializer changes; sync output semantically identical, order-preserving |
| **IV. Scale-Aware Architecture** | ✅ PASS | anatomy.owl benchmark passes; no new iteration passes added |
| **V. Security & Safety** | ✅ PASS | No new IRI parsing paths; regex reused from existing `parseFunctionalAnnotationItem` |

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-sync-data-loss/
├── plan.md              # This file
├── research.md          # Root cause analysis — two buggy sync functions identified
├── data-model.md        # Affected entities, changed functions, invariants
├── quickstart.md        # Developer verification guide
└── tasks.md             # All 23 tasks complete
```

### Source Code

```text
src/sync/
├── AnnotationSync.ts      # Fixed: syncManchester() + syncTurtle() — key-based diff
└── AxiomSync.ts           # Fixed: syncAxiomsTurtle() — file-order annotation preservation

src/sync/__tests__/
├── AnnotationSync.test.ts # +4 new tests (T006, T008 order-preservation scenarios)
└── AxiomSync.test.ts      # +2 new tests (Turtle annotation file-order scenarios)
```

## Implementation Phases

### Phase 1 — Red: Failing Tests (complete)

Added 6 new failing tests before any implementation:

- **Manchester ordering** (`AnnotationSync.test.ts`): file has `[definition, rdfs:label]` order; model iterates labels first → sync was not idempotent. Added tests for both idempotency and append-without-reorder.
- **Turtle ordering** (`AnnotationSync.test.ts`): same scenario for `syncTurtle`.
- **Turtle AxiomSync ordering** (`AxiomSync.test.ts`): same scenario for `syncAxiomsTurtle` (the live Turtle path).

All 6 confirmed failing before implementation. Existing 36 tests remained green.

### Phase 2 — Green: Manchester Fix (complete, commit 66de20f)

**`AnnotationSync.syncManchester`** — replaced full-text comparison with key-based set diff:

1. Added `parseManchesterAnnotationLine` — parses one Manchester annotation item line into `AnnotationKey` (reuses `extractLeadingIriTokens` and the literal regex from the functional parser).
2. Builds `fileItems` (existing annotation keys in file order, original line text stored for rebuild).
3. Computes `toRemove`/`toAdd` as set differences on `propIri|text|lang` keys.
4. Returns `null` when both are empty — order-independent idempotency.
5. Rebuilds block: kept items in **file order** (original line text, comma stripped) + generated lines for new items; joined with `,\n`.

### Phase 3 — Green: Turtle Fix (complete, commit 66de20f)

**`AnnotationSync.syncTurtle`** — replaced model-order annotation seg generation with file-order extraction:

- Scans `[firstPredSeg, ...segments.slice(1)]` for annotation predicates (IRI in `BUILTIN_ANN_SET`).
- Keys each as `predIri|text|lang`; diffs against model key set.
- Rebuilds `allSegs` as `[...structuralSegs, ...keptAnnot (file order), ...toAddAnnot]`.
- Fixed `addedRanges` to track only `toAddAnnot.length` new lines.

**`AxiomSync.syncAxiomsTurtle`** — same pattern for the live Turtle path:

- Added `import { BUILTIN_ANNOTATION_PROP_IRIS }` and module-level `BUILTIN_ANN_SET`.
- Extracted `firstPredSeg` from `firstSeg` (after subject token).
- Scanned all file predicate segments for annotation predicates.
- Keyed model annotation segs from `entityAnnotationSegs` using the same literal-parse formula.
- Rebuilt `allSegs` preserving file annotation order for unchanged annotations.

### Phase 4 — Verification (complete)

- 74/74 tests pass (`npm test`)
- Zero TypeScript type errors (`npm run compile`)
- anatomy.owl benchmark passes
- Manual round-trip verification signed off by user (2026-05-15)

## Complexity Tracking

No constitution violations. The fix is narrowly scoped: two functions, same key-based diff pattern already present in the codebase (`syncFunctional`). No new abstractions beyond one private helper function.
