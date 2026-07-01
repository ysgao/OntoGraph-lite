# Implementation Plan: Manchester Syntax Attribute Sorting

**Branch**: `023-manchester-sort-attributes` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

## Summary

Add a `sortManchesterConjuncts()` function to `src/utils/ManchesterFormatting.ts` that sorts the `and`-conjoined attribute clauses of a Manchester class expression into a prescribed canonical order (All or part of → … → Systemic part of → unknowns → laterality always last). Call this function from `generateManchesterAxiomSections()` in `src/sync/AxiomSync.ts` so every Manchester axiom is sorted before it is written to disk.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)

**Primary Dependencies**: None new — extends `src/utils/ManchesterFormatting.ts` using existing lexer patterns already established in the file.

**Storage**: N/A (pure string transformation; disk write handled by existing `AxiomSync.ts` / `writeTextStreamed`)

**Testing**: Vitest — existing test file at `src/utils/ManchesterFormatting.test.ts` (207 lines, 95 tests across four functions)

**Target Platform**: Node.js extension host; webview IIFE bundle (both already import `ManchesterFormatting.ts`)

**Project Type**: VS Code extension utility function

**Performance Goals**: Sort is O(n log n) on the number of conjuncts; expressions are short (< 20 conjuncts in practice) — no performance concern.

**Constraints**: Must not corrupt IRI brackets (`<…>`), double-quoted strings, or single-quoted labels. Must compose correctly with existing `formatManchesterForDisplay` (sort first, format second).

**Scale/Scope**: One new exported function (~60 lines), one integration call-site in `AxiomSync.ts`, new unit tests in the existing test file.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Decoupled UI Core | ✅ Pass | Change is in a shared utility (`src/utils/`) — no new coupling introduced |
| II. IPC-Only Communication | ✅ Pass | No new network calls; sort happens on extension host during sync write |
| III. Webview Path Safety | ✅ Pass | No build config changes; `ManchesterFormatting.ts` is already imported by the webview bundle |
| IV. Test-First Integration | ✅ Pass | TDD required; tests written before implementation (see task ordering below) |

No violations. No complexity tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/023-manchester-sort-attributes/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
└── tasks.md             ← /speckit-tasks output (not created here)
```

### Source Code Changes

```text
src/utils/
└── ManchesterFormatting.ts      # new export: sortManchesterConjuncts()

src/utils/
└── ManchesterFormatting.test.ts # new test suite: sortManchesterConjuncts

src/sync/
└── AxiomSync.ts                 # call sortManchesterConjuncts() in generateManchesterAxiomSections()
```

No new files. No new directories. No new runtime dependencies.

## Save-Path Flow (current → changed)

```
webview → EntityEditorPanel.handleMessage() [EntityEditorPanel.ts:701]
        → queueSyncWrite [EntityEditorPanel.ts:852]
        → computeUpdatedText [EntityEditorPanel.ts:411]
        → syncAxiomsToDocument [AxiomSync.ts:1285]
        → syncAxiomsManchester [AxiomSync.ts:1012]
        → generateManchesterAxiomSections [AxiomSync.ts:901]  ← SORT INSERTED HERE
        → writeTextStreamed → Disk
```

Sorting is applied inside `generateManchesterAxiomSections()` on each expression string before it is assembled into the Manchester frame. This is the last transformation point before disk write and is format-agnostic (the function already handles IRI abbreviation at the same point).

## Algorithm Design

### Conjunct splitting

Re-use the same character-level state machine already in `ManchesterFormatting.ts` (tracks `normal | iri | dquote | squote` states) to find top-level ` and ` separators. Returns `string[]` of raw conjunct text.

### Canonical order table

```typescript
const CANONICAL_ROLE_PREFIXES: readonly string[] = [
  'all or part of',
  'proper part of',
  'constitutional part of',
  'regional part of',
  'lateral half of',
  'systemic part of',
  // laterality is pinned last separately
];
const LATERALITY_PREFIX = 'laterality';
```

### Sorting rule

1. Conjunct at index 0 (named-class head) is never moved.
2. Remaining conjuncts are partitioned into three buckets:
   - **known**: role prefix matches a `CANONICAL_ROLE_PREFIXES` entry (case-insensitive); sorted by index in that array.
   - **unknown**: no prefix match; appended after known, preserving relative order.
   - **laterality**: role prefix matches `'laterality'`; always last.
3. Result: `[head, ...known_sorted, ...unknowns, ...laterality_conjuncts]`.
4. Reassemble with ` and `.

### Role-prefix matching

`conjunct.trimStart().toLowerCase().startsWith(prefix)` for each prefix. Prefixes are checked in canonical order — no ambiguity in the current list.

## Phase 0 Research

### Decision: Integration point — `generateManchesterAxiomSections` in `AxiomSync.ts`

**Rationale**: This function is the single assembly point for all Manchester axiom text immediately before disk write. Inserting sort here:
- Guarantees sort on every save regardless of how the expression arrived (direct edit, paste, programmatic update).
- Requires no changes to the webview or message protocol.
- `EntityEditorPanel.handleMessage()` already normalises expressions before storing in the model — sorting after normalisation avoids ordering noise.

**Alternatives considered**:
- Sort in `EntityEditorPanel.handleMessage()` when expressions are stored — rejected; would reorder on every model load, not just on save.
- Sort in webview before sending the `save` message — rejected; crosses the IPC boundary with host-side business logic.

### Decision: New function in `ManchesterFormatting.ts`, not inline in `AxiomSync.ts`

**Rationale**: `ManchesterFormatting.ts` owns all Manchester string transformations. Keeping the sort there makes it independently testable, reusable at other call-sites, and consistent with the module's responsibility.

### Decision: Laterality always last; unknowns between known and laterality

**Rationale**: Per FR-002/FR-003. Hard domain rule. Laterality conjuncts are pinned in a separate bucket so the rule cannot be broken by reordering the canonical prefix array.
