# Tasks: Fix Spurious OWL File Changes on Sync

**Input**: Design documents from `specs/001-fix-sync-data-loss/`
**Branch**: `001-fix-sync-data-loss`

**TDD Requirement**: The OntoGraph Constitution mandates Test-First (Principle I). Every implementation task must be preceded by a failing test task.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no inter-task dependencies)
- **[US1]**: No-change editing produces no diff (P1)
- **[US2]**: Adding an annotation produces an exact, minimal diff (P1)
- **[US3]**: Adding a logical axiom produces an exact, minimal diff (P2)

---

## Phase 1: Foundational

**Purpose**: Confirm baseline before feature work begins.

- [x] T001 Run `npm test` and confirm all existing tests pass; record baseline count in `specs/001-fix-sync-data-loss/plan.md`

**Checkpoint**: Baseline passes — feature work may begin.

---

## Phase 2: User Story 1 + 2 — Idempotency & Minimal Annotation Diff (P1)

**Goal**: Every sync that does not change the entity's semantic content produces zero file modifications. Every sync that adds or removes one annotation touches exactly that one line.

**Independent Test**: Open a class in each format (`.ofn`, `.omn`, `.ttl`). Trigger a save with no editor changes → `git diff` is empty. Then add one annotation → `git diff` shows exactly one added line and zero deletions.

### OWL Functional Syntax (`.ofn`)

- [x] T002 [P] [US1] [US2] Write failing tests for `syncFunctional` idempotency (file order ≠ model order → no edit) in `src/sync/__tests__/AnnotationSync.test.ts`
- [x] T003 [P] [US1] [US2] Write failing tests for `syncFunctional` order-preservation and minimal diff in `src/sync/__tests__/AnnotationSync.test.ts`
- [x] T004 86170f7 [US1] [US2] Implement key-based diff in `syncFunctional` in `src/sync/AnnotationSync.ts`
  - Build `fileItems` from all `AnnotationAssertion` lines; key = `propIri|text|lang`
  - Compute `toRemove` / `toAdd` as set differences; return `null` when both empty
  - Delete removed lines (reverse order), insert new lines after last existing annotation

**Checkpoint**: `.ofn` annotation sync is idempotent and produces minimal diffs.

### Manchester Syntax (`.omn`)

- [x] T005 [P] [US1] [US2] Write failing tests for `syncManchester` idempotency (trailing newline mismatch) in `src/sync/__tests__/AnnotationSync.test.ts`
- [x] T006 [P] [US1] [US2] Write failing tests for `syncManchester` file-order idempotency (file has `[definition, rdfs:label]`; model iterates labels first → must still be a no-op) in `src/sync/__tests__/AnnotationSync.test.ts`
- [x] T007 86170f7 [US1] [US2] Implement `parseManchesterAnnotationLine` and key-based diff in `syncManchester` in `src/sync/AnnotationSync.ts`
  - Add `parseManchesterAnnotationLine` helper — parses a Manchester annotation item line into `AnnotationKey` (reuses `extractLeadingIriTokens` and the literal regex from functional)
  - Replace full-text comparison with key-based set diff (`fileKeySet` vs `modelKeySet`)
  - Rebuild block: kept items in **file order** (original line text, comma stripped) + new items appended; join all with `,\n`
  - Detect header and item indent from existing lines; fall back to `'    '` / `'        '`

**Checkpoint**: `.omn` annotation sync is idempotent regardless of annotation ordering in the file.

### Turtle Syntax (`.ttl`) — AnnotationSync path

- [x] T008 [P] [US1] [US2] Write failing tests for `syncTurtle` (in `AnnotationSync.ts`) file-order idempotency and append-without-reorder in `src/sync/__tests__/AnnotationSync.test.ts`
- [x] T009 [US1] [US2] Implement file-order-preserving annotation diff in `syncTurtle` in `src/sync/AnnotationSync.ts`
  - Extract existing annotation segs from file block in file order; key each as `predIri|text|lang`
  - Build model annotation items with keys from `entityAnnotationPairs`
  - Compute `keptAnnot` (file order, model key present) and `toAddAnnot` (model key absent from file)
  - Rebuild `allSegs` as `[...structuralSegs, ...keptAnnot.map(x => x.seg), ...toAddAnnot.map(x => x.seg)]`
  - Fix `addedRanges` to track only `toAddAnnot.length` lines at end of rebuilt block

### Turtle Syntax (`.ttl`) — AxiomSync combined path (live path for Turtle)

- [x] T010 [P] [US1] [US2] Write failing tests for `syncAxiomsTurtle` annotation file-order idempotency and append-without-reorder in `src/sync/__tests__/AxiomSync.test.ts`
- [x] T011 [US1] [US2] Implement file-order-preserving annotation diff in `syncAxiomsTurtle` in `src/sync/AxiomSync.ts`
  - Import `BUILTIN_ANNOTATION_PROP_IRIS` from `src/model/OntologyModel.ts`; create module-level `BUILTIN_ANN_SET`
  - Extract `firstPredSeg` from `firstSeg` (subject stripped) to scan all file predicate segments
  - Extract existing annotation segs from `[firstPredSeg, ...segments.slice(1)]` in file order; key each as `predIri|text|lang`
  - Key model annotation segs from `entityAnnotationSegs` using the same literal-parse formula
  - Compute `keptAnnot` and `toAddAnnot`; rebuild `allSegs` preserving file annotation order

**Checkpoint**: All three formats produce zero diff on no-op save and exactly one added line on annotation addition. Run `npm test -- src/sync/__tests__/AnnotationSync.test.ts src/sync/__tests__/AxiomSync.test.ts` — all 42 tests pass.

---

## Phase 3: User Story 3 — Minimal Axiom Diff (P2)

**Goal**: Adding or removing a logical axiom touches exactly that axiom line; annotation lines and other axiom lines are never modified.

**Independent Test**: Open a class with one `SubClassOf` axiom. Add a second `SubClassOf` → `git diff` shows exactly one new axiom line and no deletions or annotation-line changes.

### OWL Functional Syntax (`.ofn`)

- [x] T012 [P] [US3] Write failing tests for `syncAxiomsFunctional` idempotency in `src/sync/__tests__/AxiomSync.test.ts`
- [x] T013 [P] [US3] Write failing tests for `syncAxiomsFunctional` minimal diff (insert one axiom → exactly one insert, zero deletes) in `src/sync/__tests__/AxiomSync.test.ts`
- [x] T014 86170f7 [US3] Implement key-based diff in `syncAxiomsFunctional` in `src/sync/AxiomSync.ts`
  - Build `fileAxioms` / `modelAxioms` keyed by trimmed line content
  - Compute `regRemoveIdxs` / `regAddLines`; return `null` when both empty
  - Use `findInsertionPointForKeyword` with `AXIOM_KW_PRIORITY` to place `EquivalentClasses` before `SubClassOf`

### Manchester Syntax (`.omn`)

- [x] T015 [P] [US3] Write failing tests for `syncAxiomsManchester` idempotency in `src/sync/__tests__/AxiomSync.test.ts`
- [x] T016 86170f7 [US3] Implement trimEnd idempotency in `syncAxiomsManchester` in `src/sync/AxiomSync.ts`
  - Compare `existingText.trimEnd() === newSections.trimEnd()` before replacing managed sections

### Turtle Syntax (`.ttl`)

- [x] T017 [P] [US3] Write failing tests for `syncAxiomsTurtle` structural-change idempotency in `src/sync/__tests__/AxiomSync.test.ts`
- [x] T018 86170f7 [US3] Confirm `syncAxiomsTurtle` is idempotent for structural segments via the final `rebuiltLines.join('\n') === existingBlock` check in `src/sync/AxiomSync.ts` (no code change needed; covered by tests)

**Checkpoint**: Axiom sync for all three formats produces zero diff on no-op and minimal diff on axiom addition. Run `npm test -- src/sync/__tests__/AxiomSync.test.ts`.

---

## Phase 4: Polish & Verification

**Purpose**: Full suite pass, type safety, scale gate, and manual round-trip confirmation.

- [x] T019 86170f7 [P] Run `npm test` — all tests pass; coverage ≥ 80% for `src/sync/AnnotationSync.ts` and `src/sync/AxiomSync.ts`
- [x] T020 86170f7 [P] Run `npm run compile` — zero TypeScript type errors
- [x] T021 86170f7 [P] Principle IV benchmark — `src/sync/__tests__/sync-anatomy-bench.test.ts` asserts both sync functions complete a no-op scan of `test-ontologies/anatomy.owl` (302k lines) in < 500ms each

- [x] T022 66de20f Manual round-trip verification per `specs/001-fix-sync-data-loss/quickstart.md`:
  - Open `test-ontologies/animals.omn` in VS Code with the extension active
  - Inspect a class (open + no changes + save) → `git diff` must be empty ✓
  - Add one annotation to that class, save → `git diff` shows exactly one added item line, zero deletions, existing annotations in original file order ✓
  - Open `test-ontologies/animals.ttl`, repeat both steps ✓
  - Open `test-ontologies/animals.ofn` (or `bfo-core.ofn`), repeat no-op step as regression guard ✓

- [x] T023 66de20f Conductor — Manual Verification 'Fix Spurious OWL File Changes on Sync': confirmed `git diff` behaviour matches all acceptance scenarios in `specs/001-fix-sync-data-loss/spec.md §User Stories`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1 + US2)**: Depends on Phase 1 checkpoint
- **Phase 3 (US3)**: Can start in parallel with Phase 2 — touches different files (`AxiomSync.ts` vs `AnnotationSync.ts`)
- **Phase 4 (Polish)**: Depends on Phase 2 AND Phase 3 completion

### Within Phase 2

```
T002 → T003 → T004   (functional annotation — AnnotationSync.ts)
T005 → T006 → T007   (Manchester annotation — AnnotationSync.ts, same file: sequential)
T008 → T009          (Turtle AnnotationSync — AnnotationSync.ts)
T010 → T011          (Turtle AxiomSync — AxiomSync.ts, can run parallel with T008/T009)
```

### Within Phase 3

```
T012 + T013 → T014   (functional axiom — AxiomSync.ts)
T015 → T016          (Manchester axiom — AxiomSync.ts)
T017 → T018          (Turtle structural — AxiomSync.ts)
```

### Parallel Opportunities

- Phase 2 and Phase 3 can run in parallel (AnnotationSync.ts vs AxiomSync.ts — different files)
- Within Phase 2: Turtle AxiomSync (T010–T011) can run in parallel with Turtle AnnotationSync (T008–T009)
- T019, T020, T021 in Phase 4 can all run in parallel

---

## Parallel Example: Phase 2 + Phase 3 Concurrently

```
Developer A (AnnotationSync.ts):
  T002 → T003 → T004   functional annotation fix
  T005 → T006 → T007   Manchester annotation fix
  T008 → T009          Turtle AnnotationSync fix

Developer B (AxiomSync.ts) — starts at same time:
  T012 + T013 → T014   functional axiom fix
  T015 → T016          Manchester axiom fix
  T017 → T018          Turtle structural fix
  T010 → T011          Turtle AxiomSync annotation fix
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 — highest impact)

1. Complete Phase 1 (T001) — baseline confirmed
2. Complete Phase 2 functional track (T002–T004) — `.ofn` idempotency restored
3. **STOP and VALIDATE**: `git diff` empty on no-op save for `.ofn`
4. Complete Phase 2 Manchester track (T005–T007) — `.omn` ordering bug fixed
5. Complete Phase 2 Turtle tracks (T008–T011) — `.ttl` ordering bug fixed
6. Complete Phase 3 all tracks (T012–T018) — axiom sync confirmed correct
7. Complete Phase 4 (T019–T023) — full verification

### Incremental Delivery

- T002–T004: Restores `.ofn` annotation idempotency (most common format)
- T005–T007: Fixes `.omn` spurious annotation rewrites
- T008–T011: Fixes `.ttl` spurious annotation rewrites (live path: AxiomSync)
- T012–T018: Confirms axiom sync is not regressed
- T022–T023: Closes the feature with manual and conductor sign-off

---

## Notes

- Constitution Principle I (Test-First) is non-negotiable: every test task must be confirmed **failing** before its paired implementation task begins
- Commit after each Red-Green pair with message format `fix(sync): <description>` + attach `git notes add -m "<summary>" <sha>`
- Do not mark any task `[x]` until `npm test` passes for all tests in the relevant file
- T022 requires VS Code with the extension running — cannot be automated; must be done manually
- T023 is a conductor gate — requires explicit user confirmation before the track is closed
