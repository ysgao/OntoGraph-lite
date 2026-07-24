---

description: "Task list template for feature implementation"
---

# Tasks: Layered Graph Layout for UML Diagrams

**Input**: Design documents from `/specs/031-layered-graph-layout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/layout-module-contract.md, quickstart.md (all present)

**Tests**: Included and REQUIRED, not optional — `plan.md`'s Technical Context commits to this
repository's Conductor TDD workflow (write failing tests, confirm red, then implement to green)
for every algorithmic change in this feature.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, in priority order) to
enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact and relative to the repository root

## Path Conventions

Single project — this feature only touches `src/uml/` (existing module; no new package, no
`webview-src/` or message-contract change, per `plan.md`'s Project Structure section).

---

## Phase 1: Setup

**Purpose**: Shared test fixture needed by every later phase

- [ ] T001 [P] Create a shared synthetic "deep multi-parent" fixture (4+ layers, including one
  node reachable from two parents at different layers) in `src/uml/testFixtures.ts`, exporting
  `DiagramNode[]`/`DiagramEdge[]` for reuse by `layout.test.ts`, `diagramGeometry.test.ts`, and the
  new `layoutMetrics.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two structural building blocks (dummy-node insertion, cumulative-sum coordinate
assignment) that both US1 and US2 wire into `computeLayout()`. Independently unit-testable before
any user-story wiring happens.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 [P] Write failing unit tests for dummy-node insertion in `src/uml/dummyNodes.test.ts`:
  an edge whose child layer is more than one greater than its parent layer gets one dummy node per
  intermediate layer; an adjacent-layer edge is unchanged (no dummies); a back-edge/cycle
  contributes no dummies (mirrors `depthNormalization.ts`'s existing cycle guard)
- [ ] T003 Implement dummy-node insertion (`insertDummyNodes`) in `src/uml/dummyNodes.ts` per
  `data-model.md`'s Dummy Node entity, to make T002 pass
- [ ] T004 [P] Write failing unit tests for cumulative-sum coordinate assignment in
  `src/uml/layerCoordinates.test.ts`: given a per-layer ordering of real + dummy occupants (with
  widths) and a spacing constant, cross-axis positions are assigned by running sum
  (`cumulative += width + MIN_GAP`), never by an averaging-then-clamp pass — so two adjacent
  occupants in the same layer can never overlap regardless of input order
- [ ] T005 Implement cumulative-sum coordinate assignment (`assignLayerCoordinates`) in
  `src/uml/layerCoordinates.ts`, to make T004 pass

**Checkpoint**: Dummy-node insertion and coordinate assignment exist and are unit-tested in
isolation; `computeLayout()` itself is not yet changed.

---

## Phase 3: User Story 1 - Read a deep UML diagram without visual confusion (Priority: P1) 🎯 MVP

**Goal**: No two entity boxes overlap and no connector line passes through an unrelated box, at
any hierarchy depth (spec FR-001, FR-002, FR-005, FR-007).

**Independent Test**: Generate a diagram for the T001 deep multi-parent fixture and the
middle-ear-structure sample; assert zero node-node and node-edge overlaps via the new metric
helper.

### Tests for User Story 1 ⚠️ (write first, confirm they FAIL against current `layout.ts`/`diagramGeometry.ts`)

- [ ] T006 [P] [US1] Implement a general-purpose overlap-detection helper
  (`detectNodeOverlaps`, `detectEdgeNodeOverlaps`) in `src/uml/layoutMetrics.ts`, plus regression
  tests in `src/uml/layoutMetrics.test.ts` asserting zero overlaps for: (a) the existing shallow
  (1-2 level) fixtures already used by `layout.test.ts` — expected to already pass; (b) the T001
  deep multi-parent fixture — expected to FAIL against the current implementation; (c) the
  middle-ear-structure extraction from `middleEarRegression.test.ts` (guarded by the same
  `anatomy.owl`-presence skip). Also add, in `layout.test.ts`: (d) a case with 2+ direct ancestors
  of the root (`depth < 0`) asserting they remain centered/symmetric about the root's cross
  position after this feature's changes (regression for `layout.ts:162-175`'s existing behavior);
  (e) a case with a node unreachable from root via any parent→child edge asserting it still
  receives a valid, non-overlapping slot rather than being dropped (regression for FR-007 and
  `layout.ts:177-184`'s existing fallback; both (d) and (e) should already pass against the
  current implementation and must keep passing after T007); (f) a determinism case (mirroring the
  existing pattern in `partOfGraph.test.ts:195`/`branchColors.test.ts:46` for spec SC-003): two
  consecutive `computeLayout()` calls with identical `nodes`/`edges`/`direction` produce deep-equal
  output (spec FR-009) — should already pass and must keep passing after T007/T013

### Implementation for User Story 1

- [ ] T007 [US1] In `src/uml/layout.ts`, replace `computeLayout()`'s average-of-children placement
  and same-depth-only clamp (current lines ~139-229) with: `insertDummyNodes` (T003) to expand
  multi-layer edges, a naive/deterministic per-layer ordering (existing declaration order is
  sufficient here — US2 replaces it), and `assignLayerCoordinates` (T005) for final cross-axis
  positions. `computeLayout()`'s external signature and return type (`Map<string,
  LayoutPosition>`, keyed by real node IRI only) are unchanged, per
  `contracts/layout-module-contract.md`. This range also contains two sub-behaviors that MUST be
  preserved (either carried over as-is or intentionally reimplemented in the new coordinate step —
  not silently dropped), each verified by T006(d)/(e): direct-ancestor centering-on-root
  (`layout.ts:162-175`) and the unreachable-node fallback slot (`layout.ts:177-184`, spec FR-007).
- [ ] T008 [US1] Implement per-edge route resolution (e.g. `resolveEdgeRoutes`) in `src/uml/layout.ts`
  that converts each edge's dummy-node chain plus T007's assigned coordinates into an ordered
  `Position[]` point list keyed by `edge.id` (the Edge Route entity in `data-model.md`)
- [ ] T009 [US1] In `src/uml/diagramGeometry.ts`, wire T008's resolved point lists into
  `computeEdgeSegments`/`computeEdgeRoutes` so a multi-layer edge routes through its dummy-derived
  points instead of calling `computeStemDetour`/`computeSafeJogY`; adjacent-layer edges keep using
  the existing direct bus/elbow computation unchanged (per `plan.md`'s "don't regress shallow
  cases")
- [ ] T010 [US1] Remove the now-dead average-of-children/same-depth-clamp code in `layout.ts` and
  the `computeStemDetour`/`computeSafeJogY` branches fully subsumed by T009; update the existing
  `layout.test.ts`/`diagramGeometry.test.ts` cases that asserted the old behavior to assert the new
  behavior instead (no case should be silently deleted — each either still applies or is replaced
  by an equivalent new assertion)
- [ ] T011 [US1] Run T006 plus the full `src/uml` test suite (`npm test -- src/uml`); confirm every
  test passes, including zero overlaps on the deep multi-parent and middle-ear fixtures. Also add
  a lightweight timing assertion (mirroring `partOfGraph.bench.test.ts`'s `Date.now()`-based
  pattern) for `computeLayout()` at a diagram size representative of this feature's Scale/Scope
  (tens to low hundreds of nodes/edges), asserting it completes well within the existing 5s/3s
  interactive-use budgets from `026` (spec FR-010)

**Checkpoint**: User Story 1 complete — diagrams at any depth have zero node/edge overlaps,
independently demoable via `quickstart.md`.

---

## Phase 4: User Story 2 - Follow relationships with minimal crossing lines (Priority: P2)

**Goal**: Reduce total connector-line crossings versus the current output, by choosing a
layer-ordering that minimizes crossings rather than leaving order to declaration/discovery order
(spec FR-004).

**Independent Test**: Generate a diagram for a fixture with siblings sharing common
parents/children; assert the counted crossings are lower than the pre-US2 (T007) baseline for the
same input.

### Tests for User Story 2 ⚠️ (write first, confirm they FAIL against US1's naive ordering)

- [ ] T012 [P] [US2] Add a crossing-count metric (`countCrossings`) to `src/uml/layoutMetrics.ts`
  (pairwise per adjacent-layer-pair comparison, per `LayeredGraphAlgorithm.md` §3's crossing
  test), plus a regression test in `layoutMetrics.test.ts` comparing crossing count on a
  shared-parent/shared-child fixture before vs. after this story's ordering pass — expected to
  FAIL until T013/T014 land

### Implementation for User Story 2

- [ ] T013 [US2] Implement the crossing-minimization ordering sweep (median/barycenter-style,
  ~8-10 alternating up/down passes, keep the snapshot with the fewest counted crossings) as a pure
  function (e.g. `reduceCrossings`) in `src/uml/layerOrdering.ts`, operating over each layer's real
  + dummy occupants (from T003)
- [ ] T014 [US2] Wire `reduceCrossings`'s output ordering into `layout.ts`'s coordinate-assignment
  call (T007/T005), replacing the naive/declaration-order baseline introduced in T007
- [ ] T015 [US2] Retire `layout.ts`'s `reorderBySharedChildren` union-find heuristic, now subsumed
  by T013's global ordering sweep; update the `layout.test.ts` cases that exercised it directly to
  assert against the new ordering pass instead
- [ ] T016 [US2] Run T012 plus the full `src/uml` test suite; confirm crossing count is reduced
  (not merely unchanged) on shared-parent/shared-child fixtures, and unchanged/zero on fixtures
  that were already crossing-free

**Checkpoint**: User Stories 1 AND 2 both work independently — zero overlaps AND minimized
crossings.

---

## Phase 5: User Story 3 - Consistent, correct layout across every export format (Priority: P3)

**Goal**: The editor panel, draw.io export, SVG export, and PNG export all show the same
non-overlapping, low-crossing layout for the same diagram (spec FR-006).

**Independent Test**: Generate a diagram, export to every format, and confirm matching node
positions and connector routing across all of them.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T017 [P] [US3] Write a cross-format consistency test asserting `src/uml/drawioRenderer.ts`
  and `src/uml/htmlRenderer.ts` produce matching node positions and edge point-lists for the same
  diagram input (new shared-assertion test, or extend `drawioRenderer.test.ts` /
  `htmlRenderer.test.ts`)

### Implementation for User Story 3

- [ ] T018 [US3] Verify (and adjust if any divergence is found) that `src/uml/drawioRenderer.ts`
  and `src/uml/htmlRenderer.ts` both consume T009's shared edge-route output with no
  format-specific fallback/divergent path
- [ ] T019 [US3] Confirm PNG export (`src/uml/drawioCli.ts`, which shells out to the draw.io
  desktop CLI on the exported `.drawio` file) reflects the same layout by construction; extend
  `drawioCli.test.ts` if any gap is found
- [ ] T020 [US3] Run T017 plus the full `src/uml` test suite; confirm all four formats show
  identical non-overlapping layout for the same diagram

**Checkpoint**: All three user stories independently functional — this is the full feature.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and final validation across all stories

- [ ] T021 [P] Update stale module-level comments in `src/uml/layout.ts` and
  `src/uml/diagramGeometry.ts` (e.g. `layout.ts`'s docstring referencing "average of its
  children's (post-order)" and "Cytoscape, `preset` layout") to describe the new dummy-node /
  ordering / coordinate-assignment pipeline
- [ ] T022 [P] Run `npm run compile` (type-check) and `npm test` (full suite) to confirm no type
  errors and no coverage regression, per CLAUDE.md's quality gates
- [ ] T023 Execute `quickstart.md`'s manual verification steps in the Extension Development Host
  (F5) — regenerate the middle-ear-structure diagram, export to draw.io/SVG/PNG, visually confirm
  no overlaps and reduced crossings versus `uml-diagram-cli-plan/Middle-ear-structure-uml.drawio`;
  also walk through the T001 synthetic deep multi-parent fixture (or another 4+ level sample) as
  the "at least one other multi-level sample" spec SC-003 requires alongside the middle-ear sample

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) only for its own tests to have a fixture to
  reuse later; T002-T005 themselves need no fixture and can start immediately in parallel with
  T001. BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (T003, T005) completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 (T007) completion — it replaces the ordering
  T007 introduced
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T009) completion — it verifies the shared
  routing output T009 produced; does not require US2, since crossing count doesn't affect
  cross-format consistency
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (P2)**: Depends on Foundational AND User Story 1 (extends its ordering step) —
  not independent of US1 the way a typical unrelated-feature user story would be, because both
  stories modify the same `computeLayout()` ordering input; still independently *testable*
  (T012's crossing-count assertion is meaningless without US1's dummy-node/coordinate wiring
  already in place, which is why it's sequenced after, not because it duplicates US1's work).
- **User Story 3 (P3)**: Depends on Foundational AND User Story 1 (verifies its shared output);
  independent of US2.

### Within Each User Story

- Tests MUST be written and confirmed FAILING before implementation (T006 before T007-T010; T012
  before T013-T015; T017 before T018-T019)
- Foundational building blocks before wiring (T003/T005 before T007)
- Wiring before cleanup (T007-T009 before T010; T013-T014 before T015)
- Story complete (checkpoint task) before moving to the next priority

### Parallel Opportunities

- T001 (Setup) can run in parallel with T002/T004 (Foundational tests)
- T002 and T004 (Foundational tests, different files) can run in parallel
- T006 (US1 tests) can start as soon as T001 exists, in parallel with T002-T005 continuing
- T012 (US2 tests) and T017 (US3 tests) can be drafted in parallel once T007/T009 exist, even
  though their implementation tasks are sequenced after US1's checkpoint
- T021 and T022 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch both foundational test-writing tasks together (different files):
Task: "Write failing unit tests for dummy-node insertion in src/uml/dummyNodes.test.ts"
Task: "Write failing unit tests for cumulative-sum coordinate assignment in src/uml/layerCoordinates.test.ts"
```

## Parallel Example: User Story 1 Kickoff

```bash
# Once Foundational (T003, T005) is done, these can start together:
Task: "Create shared synthetic deep multi-parent test fixture in src/uml/testFixtures.ts" (if not already done in Setup)
Task: "Implement overlap-detection helper + regression tests in src/uml/layoutMetrics.ts / layoutMetrics.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (dummy-node insertion + coordinate assignment — CRITICAL, blocks
   everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run `quickstart.md`'s checks — zero overlaps at any depth
5. This alone resolves the reported defect (overlapping boxes) and is independently shippable

### Incremental Delivery

1. Setup + Foundational → building blocks ready, unit-tested in isolation
2. User Story 1 → zero overlaps at any depth (MVP — the core reported bug)
3. User Story 2 → minimized crossings on top of US1's overlap-free layout
4. User Story 3 → verified consistency across draw.io/SVG/PNG/editor exports
5. Polish → comment cleanup, full-suite validation, manual quickstart walkthrough

### Solo Developer Strategy

Given the sequential dependency between US1 → US2 and US1 → US3 (both build on the same
`computeLayout()`/`diagramGeometry.ts` wiring US1 introduces), this feature is best done linearly
phase-by-phase rather than split across parallel developers, despite the `[P]` markers within each
phase.
