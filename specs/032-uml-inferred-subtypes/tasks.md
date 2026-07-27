---

description: "Task list for 032-uml-inferred-subtypes"
---

# Tasks: Include Inferred Subtypes in UML Diagram Scope

**Input**: Design documents from `/specs/032-uml-inferred-subtypes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/uml-diagram-messages-delta.md, quickstart.md

**Tests**: Included — this repo's `conductor/workflow.md` mandates Red-Green TDD (write failing tests first) and >80% coverage for every task; test tasks below are not optional.

**Organization**: Tasks are grouped by user story from `spec.md` (US1 = P1 core fix, US3 = P1 regression guard for existing exclusion behavior, US2 = P2 visual distinction). US3 is scheduled before US2 because it only needs test coverage confirming already-correct-by-construction behavior once US1 lands, while US2 requires new production code in the rendering layer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, or US3 — maps to `spec.md`'s user stories
- File paths are exact and relative to repo root

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before any change.

- [X] T001 On branch `032-uml-inferred-subtypes`, run `npm test` and `npm run compile` from the repo root; confirm both currently pass with zero failures/errors, establishing the pre-change baseline. (75 test files / 949 tests passed; compile clean.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one shared type change every user story's tests and implementation reference.

**⚠️ CRITICAL**: Must complete before any user story task below.

- [X] T002 Add `isInferred?: boolean` to the `DiagramEdge` interface in `src/uml/diagramModel.ts`, with a doc comment per `data-model.md` ("true only when this edge has no supporting asserted axiom — see `research.md` Decision 4"). **Correction from the original plan**: made OPTIONAL rather than required — a required field broke ~10 pre-existing test files across `src/uml/` that construct `DiagramEdge` literals with no knowledge of this feature (`branchColors.test.ts`, `diagramGeometry.test.ts`, `drawioRenderer.test.ts`, `htmlRenderer.test.ts`, `layout.test.ts`, etc.), contradicting the plan's own "purely additive" framing. Optional + "absent means false" preserves zero-blast-radius on existing fixtures, confirmed by `npm run compile` reporting zero errors after the change (vs. dozens with a required field).

**Checkpoint**: Type declared, compiles clean with zero pre-existing test files touched.

---

## Phase 3: User Story 1 - Reasoner-inferred subtypes appear in the diagram (Priority: P1) 🎯 MVP

**Goal**: A classified ontology's UML diagram includes subtypes that exist only because the reasoner inferred them, not only directly-written ones — without ever auto-triggering classification.

**Independent Test**: Classify a small ontology containing a class B that is a subtype of A only via reasoning (e.g. an `EquivalentClasses` definition, no direct `SubClassOf(B A)`). Generate a UML diagram rooted at A. Confirm B appears as a generalization child of A.

### Tests for User Story 1 (write first — confirm they FAIL before implementing)

- [X] T003 [P] [US1] In `src/uml/partOfGraph.test.ts`, add a test: given a model with `isClassified: true` and `inferredSubClasses` mapping A → {B} (no asserted `SubClassOf`/`EquivalentClasses` axiom relating B to A), `extractUmlDiagram(model, A, depth, opts)` returns B as a node and an edge `{parentIri: A, childIri: B, kind: 'generalization', isInferred: true}`.
- [X] T004 [P] [US1] In `src/uml/partOfGraph.test.ts`, add a test: given a class C that is BOTH a directly-asserted subtype of A AND present in `inferredSubClasses.get(A)`, `extractUmlDiagram` returns exactly one edge A→C with `isInferred` falsy (asserted takes priority; no duplicate edge/node).
- [X] T005 [P] [US1] In `src/uml/partOfGraph.test.ts`, added two tests: `isClassified: false` (B absent) and `isClassified: true` with empty `inferredSubClasses` (only root present) — both confirm asserted-only behavior is unchanged. Re-ran `src/uml/middleEarRegression.test.ts` unmodified — still passes exactly (SC-004 regression guard).
- [X] T006 [P] [US1] In `src/commands/generateUmlDiagram.test.ts`, added a test asserting `buildDiagramMessage` never calls `vscode.commands.executeCommand` (this file's existing mocked entry point), for both an unclassified and an already-classified model — confirming FR-002.

Ran `npm test -- src/uml/partOfGraph.test.ts src/commands/generateUmlDiagram.test.ts` — only T003 went red (`expected [A] to include B`); T004/T005/T006 passed immediately since they describe behavior that must hold both before and after the fix (regression guards, valid TDD — they still catch a regression once T007/T008 change the code).

### Implementation for User Story 1

- [X] T007 [US1] In `src/uml/partOfGraph.ts`, added `mergeInferredSubClasses()` (called right after `buildReverseIndex`, before BFS) which additively appends `model.inferredSubClasses` entries as `{kind: 'bare', isInferred: true}` reverse-index entries, gated on `model.isClassified`. Appending (never prepending) after the asserted build guarantees an asserted entry for a given pair is always processed before an inferred duplicate of it.
- [X] T008 [US1] Threaded `isInferred` through `processConjunct`/`addEdge`. `addEdge`'s existing "first entry to construct a given id wins, later calls no-op" dedup then naturally gives asserted data priority with no extra bookkeeping — confirmed correct by T004's test.
- [X] T009 [US1] `npm test -- src/uml/partOfGraph.test.ts src/commands/generateUmlDiagram.test.ts src/uml/middleEarRegression.test.ts` — all 60 tests pass. `npm run compile` — zero errors.

**Note on the plan's original T007 wording**: it said the merge should add entries "only when an asserted conjunct entry for that exact pair isn't already present." The implementation does NOT need that check — ordering (asserted always built first, inferred always appended after) plus the existing id-based edge dedup achieves the same asserted-priority result more simply, without a pre-check pass. Recorded here since this deviates from the literal task wording, though not from its intent.

**Checkpoint**: User Story 1 is fully functional and independently testable/shippable — the core "missing subtypes" defect is fixed, even before US2's visual styling lands.

---

## Phase 4: User Story 3 - Existing exclusion behavior keeps working (Priority: P1)

**Goal**: Confirm the already-implemented lateralized-variant default-exclusion and "Entire X" anchor-resolution behavior correctly covers nodes that now reach the diagram only via the inferred hierarchy — a regression guard on the same code path as US1, expected to require test coverage only (both mechanisms already operate on whichever nodes/conjuncts reached the diagram, regardless of source).

**Independent Test**: Classify an ontology where a reasoner-inferred (not directly-asserted) subtype of the diagram's root is itself a lateralized variant. Generate the diagram with defaults and confirm that subtype is excluded, same as an asserted lateralized variant would be.

### Tests for User Story 3 (write first — confirm they currently pass, or fail and reveal a real gap)

- [X] T010 [P] [US3] In `src/uml/partOfGraph.test.ts`, added a test: a class reachable at the diagram root ONLY via an inferred subClassOf entry, which itself owns a `Laterality some Left` restriction (via a hand-built `superClassExpressions` conjunct — note: plain IRIs, no `<>` brackets, since `splitTopLevelSome`/the `LATERALITY_*` constants compare bracket-free strings), appears in `ExtractResult.lateralizedIris` exactly like an asserted lateralized variant would.
- [X] T011 [P] [US3] In `src/uml/partOfGraph.test.ts`, added a test: for the fixture's "All or part of" anchor scenario (`ClinicalStructure` → `AnchorWhole`), adding an inferred-only generalization child (`Isolated`, reused from elsewhere in the fixture) alongside the existing asserted composition child (`AnchorChild`) leaves `resolveAnchor`'s result and the displayed ("Entire "-stripped) label unchanged — confirming root/anchor resolution is unaffected by subtype source (FR-007/FR-009).
- [X] Also added, in `src/commands/generateUmlDiagram.test.ts` (end-to-end, one layer above `extractUmlDiagram`): a reasoner-inferred-only lateralized subtype is excluded from the default diagram exactly like an asserted one, and reveals via the existing `requestToggleLateralized` control the same way — directly exercising spec User Story 3's acceptance scenarios 1 & 2, not just the `lateralizedIris` flag in isolation.

### Verification for User Story 3

- [X] T012 [US3] Ran `npm test -- src/uml/partOfGraph.test.ts src/uml/middleEarRegression.test.ts src/commands/generateUmlDiagram.test.ts` — all 63 tests passed on the first try (after fixing the bracket-format mistake above, which was a test-authoring bug, not a production-code gap). Confirms the hypothesis: `isLateralized`/`resolveAnchor` already operate uniformly on whatever nodes/conjuncts reached the diagram, regardless of source — zero production code changes were needed for User Story 3.

**Checkpoint**: US1 + US3 verified together — the correctness fix is safe to ship even before US2's dashed-line styling exists.

---

## Phase 5: User Story 2 - Distinguishing inferred-only relationships visually (Priority: P2)

**Goal**: A relationship line that exists only because of reasoning is visually distinguished (dashed, using a pattern distinct from the existing far-edge/node-cap dash pattern) from directly-written ones, consistently across the interactive view and every export format.

**Independent Test**: Generate a diagram containing both an inferred-only and a directly-written subtype relationship. Confirm the two render with different line styles in the webview, and that the distinction survives SVG, PNG, and draw.io export.

### Tests for User Story 2 (write first — confirm they FAIL before implementing)

- [X] T013 [P] [US2] In `src/uml/diagramGeometry.test.ts`, added 3 tests: a mixed asserted+inferred group flags only the inferred child's own per-child stem (shared parent-stem stays unflagged); a far child's own stem is flagged when its edge is inferred; nothing is flagged when no edge is inferred.
- [X] T014 [P] [US2] In `src/uml/htmlRenderer.test.ts`, added a test: `renderDiagramFragment` output contains `stroke-dasharray="3 3"` for the inferred child's path, not `"6 4"` (no far edges in this fixture), and the asserted sibling's own stem carries no dash at all.
- [X] T015 [P] [US2] In `src/uml/drawioRenderer.test.ts`, added a test: `renderDrawio`'s `mxCell` for an inferred-only edge contains `dashed=1;dashPattern=3 3;`, distinct from `6 4`; the asserted sibling's cell doesn't. (Caught and fixed a test-authoring mistake: generalization edges route `source=child, target=parent`, not `source=parent, target=child` — my first regex assumed the wrong direction.)
- [X] T016 [P] [US2] In `src/uml/crossFormatConsistency.test.ts`, added a test: marking one ordinary near edge (`A`→`A1`) of the existing `deepMultiParentFixture` as `isInferred` produces equal, positive `3 3`-pattern counts in both the SVG and drawio outputs, AND leaves the existing `6 4` far-edge pattern count exactly unchanged — confirming the two concepts don't conflate.

Ran `npm test -- src/uml/diagramGeometry.test.ts src/uml/htmlRenderer.test.ts src/uml/drawioRenderer.test.ts src/uml/crossFormatConsistency.test.ts` before implementing T017-T019 — all four went red as expected (the `isInferred`-driven assertions had nothing to produce them yet).

### Implementation for User Story 2 — results

- [X] T017 [US2] In `src/uml/diagramGeometry.ts`: added `isInferred?: boolean` to `RenderedSegment`; built an `edgesById` lookup map in `computeEdgeSegmentsCore`; threaded `isInferred` onto the near-child stem, the far-child stem, the fan-in group's per-parent stem (which required also passing `edgeId` through `fanInCandidates`, mirroring a pattern the parallel drawio-oriented `computeEdgeRoutesCore` already used), and the off-axis `renderBridge` segment. Shared parent-to-bus stems and horizontal bus lines were deliberately left unflagged (Decision 6).
- [X] T018 [US2] In `src/uml/htmlRenderer.ts`: added `stroke-dasharray="3 3"` (as an `else if` after the existing `seg.far` check, so `far` always wins if both are ever true) in both `renderDiagramFragment` and `renderStandaloneSvg`.
- [X] T019 [US2] In `src/uml/drawioRenderer.ts`: added an `isInferred` parameter to `edgeStyle()`, emitting `dashed=1;dashPattern=3 3;` when true and not `far`; updated `renderDrawio`'s call site to pass `e.isInferred`. Confirmed `computeEdgeRoutesCore`/`EdgeRoute` (the drawio-side geometry helper) needed NO change — `renderDrawio` already iterates `edges` directly and has `e.isInferred` on hand without any geometry-layer plumbing, since drawio has no shared-bus deduplication to preserve.
- [X] T020 [US2] `npm test -- src/uml/diagramGeometry.test.ts src/uml/htmlRenderer.test.ts src/uml/drawioRenderer.test.ts src/uml/crossFormatConsistency.test.ts` — all pass. Full `npm test`: 962/963 pass; the one failure (`sync-anatomy-bench.test.ts`, a 500ms performance threshold on an unrelated 302k-line sync benchmark) is a pre-existing, system-load-dependent flaky test — confirmed by re-running it alone (passes) and re-running the full suite (fails again, same file, unrelated to any file this feature touched). `npm run compile` and `npm run compile:webview` both clean.

**Checkpoint**: All three user stories complete. Full feature (correctness fix + visual distinction + verified-safe exclusion behavior) is done.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final repo-wide verification per `conductor/workflow.md`'s quality gates.

- [X] T021 [P] `npm run compile` and `npm run compile:webview` — both clean, zero type errors.
- [X] T022 [P] Full `npm test` — 962/963 pass. The one failure (`sync-anatomy-bench.test.ts`'s 500ms threshold) is a pre-existing, system-load-dependent flaky performance test unrelated to any file this feature touches (confirmed: passes in isolation, fails again under full-suite load regardless of this feature's changes — see T020's note). All UML-module tests (`src/uml/*.test.ts`, 21 files) and `src/commands/generateUmlDiagram.test.ts` pass in full.
- [~] T023 **NOT performed** — launching the Extension Development Host (F5) requires an interactive VS Code window, which this agent session cannot drive headlessly. The `quickstart.md` walkthrough is written and ready; a human (or a `claude-in-chrome`/VS-Code-attached session) should run it manually before this feature is considered fully verified end-to-end. All automated coverage (unit tests across `partOfGraph.ts`, `diagramGeometry.ts`, `htmlRenderer.ts`, `drawioRenderer.ts`, `crossFormatConsistency.test.ts`, `generateUmlDiagram.test.ts`) passes, but that verifies code correctness, not the live webview experience.
- [X] T024 Added a one-line pointer entry for `032-uml-inferred-subtypes` under `CLAUDE.md`'s "Recent Changes" section.

---

## Phase 7: Refinement — explicit "Include inferred subtypes" tick-box (post-implementation user feedback)

**Trigger**: After Phase 1-6 shipped inferred-subtype inclusion as automatic-whenever-classified (no user control), the user asked for a dedicated tick-box instead, defaulting to "stated" (unchecked). This phase changes *when* inferred data is merged (now user-controlled) without touching any of the dedup/rendering/exclusion-compatibility logic already built in Phases 3-5.

- [X] T025 `src/uml/partOfGraph.ts`: added `includeInferred?: boolean` to `ExtractOptions` (default falsy); gated the `mergeInferredSubClasses` call site on `options.includeInferred` (previously ran unconditionally whenever `model.isClassified`).
- [X] T026 `src/views/UmlDiagramMessages.ts`: added `includeInferred: boolean` to `UpdateDiagramMessage`; added `RequestToggleInferredMessage` (mirrors `RequestToggleLateralizedMessage` exactly) and added it to the `WebviewToExt` union.
- [X] T027 `src/commands/generateUmlDiagram.ts`: added `currentIncludeInferred` state (default `false`), mirroring `currentIncludeLateralized`'s lifecycle exactly — reset on new focus, reset on panel dispose, threaded through `ExtractOptions`/`buildDiagramMessage`/`sendDiagram`/`exportUmlDiagram`, and a new `requestToggleInferred` message handler branch.
- [X] T028 `webview-src/uml/inferredControl.ts` (new file, mirrors `lateralizedControl.ts`): `RequestToggleInferredMessage` type + `buildRequestToggleInferredMessage()`.
- [X] T029 `webview-src/uml/UmlDiagramApp.ts`: added an actual `<input type="checkbox">` ("Include inferred subtypes", unchecked by default) to the toolbar — deliberately a tick-box, not a button like the lateralized toggle, per the user's explicit request — wired to send `requestToggleInferred` on `change` and to sync its checked-state from every `updateDiagram` message's `includeInferred` field.
- [X] T030 Updated existing tests broken by the new default-off behavior: 4 `extractUmlDiagram` calls in `src/uml/partOfGraph.test.ts` (the US1 "inferred appears" test, the asserted+inferred dedup-priority test, and both US3 exclusion-behavior tests) now pass `includeInferred: true` explicitly; added a NEW test confirming the default (option omitted) excludes inferred data even when classified with data present. Restructured `generateUmlDiagram.test.ts`'s inferred-lateralized-exclusion test into a 3-step sequence (default absent → still absent after only toggling "inferred" on, because lateralized-exclusion still applies → revealed once BOTH toggles are on). Added 4 new dedicated tests for the toggle itself (default-off + echo, reveal + echo, persistence across depth change, reset on refocus), mirroring the existing lateralized-toggle test suite.
- [X] T031 Verification: `npm run compile`, `npm run compile:webview`, and `npm run build` (full esbuild, confirms the new `inferredControl.ts` module bundles correctly) all clean. Full `npm test`: 967/968 pass (same pre-existing flaky `sync-anatomy-bench.test.ts` failure noted in T022, confirmed unrelated).

**Checkpoint**: "Include inferred subtypes" is now a genuine, discoverable, default-off tick-box — not silent automatic behavior — matching the user's explicit request and the product's existing default-to-"stated" convention.

---

## Dependencies & Execution Order

## Phase 8: Second Refinement — split Stated/Inferred into two separate views (post-Phase-7 user feedback)

**Trigger**: After Phase 7 shipped an additive "Include inferred subtypes" tick-box (inferred data MERGED into the same diagram as stated), the user asked for a bigger change: Stated and Inferred must never be mixed — a switch between two SEPARATE diagrams instead. Further requirements: the Inferred view is generalization-only (no "part of"), default-excludes both lateralized AND "Entire X" classes, never anchor-hops to "Entire X" (root = focus entity as-is), and applies a new "X structure"/"Structure of X" → "X" label rule (Inferred-view-only).

- [X] T032 `src/uml/partOfGraph.ts`: **Reverted** `extractUmlDiagram` (Stated) completely back to its pre-Phase-6/7 shape — removed `includeInferred` from `ExtractOptions`, removed `mergeInferredSubClasses` and all `isInferred` plumbing from `processConjunct`/`addEdge`/`ReverseIndexEntry`. Stated is now byte-for-byte the same code as before this whole feature existed.
- [X] T033 `src/uml/partOfGraph.ts`: added `extractInferredUmlDiagram()` — an entirely separate extraction function. Scope comes exclusively from `model.inferredSubClasses` (gated on `model.isClassified`, defensively re-added since the earlier merge function's guard was lost in the revert); root is `focusIri` as-is (no `resolveAnchor`/anchor-hop); edges are always `kind: 'generalization'` (FR-012); `isInferred` is still computed per-edge (via a same-pair asserted-conjunct check, reusing `buildConjunctsByClass` for that ONE purpose only, never for scope) since a relationship confirmed by both reasoning and a direct axiom remains worth distinguishing even within this fully-reasoner-derived view. New `entireIris` result field (labels starting with "Entire ") parallels `lateralizedIris`.
- [X] T034 `src/uml/partOfGraph.ts`: added `stripStructureLabel()` (strips "structure of "/" structure", Inferred-view-only) and `inferredLabelFor()` (uses it instead of `stripEntirePrefix`).
- [X] T035 `src/views/UmlDiagramMessages.ts`: added exported `ViewMode = 'stated' | 'inferred'` type; replaced `includeInferred: boolean` on `UpdateDiagramMessage` with `viewMode: ViewMode`; replaced `RequestToggleInferredMessage`/`requestToggleInferred` with `RequestSetViewModeMessage`/`requestSetViewMode` (carries `mode: ViewMode`).
- [X] T036 `src/commands/generateUmlDiagram.ts`: replaced `currentIncludeInferred: boolean` with `currentViewMode: ViewMode = 'stated'` (same reset lifecycle as before — new focus, panel dispose). `extractAndLayout` now branches: `viewMode === 'inferred'` calls `extractInferredUmlDiagram` (no `compositionProperties`); otherwise calls `extractUmlDiagram` unchanged. Default exclusion seeding extended: `lateralizedIris ∪ (entireIris ?? [])` when `!includeLateralized`, reusing the SAME reveal control for both views (entireIris is always `undefined` for Stated, so the union is a no-op there).
- [X] T037 `webview-src/uml/`: removed `inferredControl.ts` (checkbox message builder); added `viewModeControl.ts` (`RequestSetViewModeMessage` + builder). `UmlDiagramApp.ts`: replaced the `<input type="checkbox">` with a genuine `<select id="view-mode-select">` ("Stated"/"Inferred") — a switch, not an additive tick-box, per the user's explicit request — wired to `requestSetViewMode` and synced from `updateDiagram.viewMode`.
- [X] T038 Rewrote tests broken by the revert + new architecture:
  - `src/uml/partOfGraph.test.ts`: replaced the Phase-7 "reasoner-inferred subtypes"/US3 describe blocks (which called `extractUmlDiagram` with `includeInferred`) with a small "Stated view unaffected" block plus a full new `extractInferredUmlDiagram` describe block (inferred-only inclusion, also-asserted dedup, unclassified no-op, generalization-only, no anchor-hop, ancestor pre-pass, lateralized flagging, entire-concept flagging, structure-label simplification). Added a dedicated `stripStructureLabel` unit-test block.
  - `src/commands/generateUmlDiagram.test.ts`: replaced the Phase-7 toggle tests with `requestSetViewMode`-based equivalents (default-stated, switch-reveals, persists-across-depth-change, resets-on-refocus), plus new tests for Inferred-view lateralized exclusion, "Entire X" exclusion, and "never produces a composition edge even when compositionProperties is configured."
- [X] T039 Verification: `npm run compile`, `npm run compile:webview`, `npm run build` (full esbuild, confirms `viewModeControl.ts` bundles and `inferredControl.ts`'s removal doesn't break anything) all clean. Full `npm test`: 975/977 pass (same pre-existing flaky `sync-anatomy-bench.test.ts` failure, confirmed unrelated across repeated runs).

**Checkpoint**: Stated and Inferred are now two genuinely separate, switchable diagrams. Stated is provably unchanged from pre-feature behavior (full revert, not just "should be unaffected"). Inferred is generalization-only, self-contained, and default-excludes both lateralized and "Entire X" noise.

---

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user story phases.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3 — this is the MVP.
- **User Story 3 (Phase 4)**: Depends on User Story 1 (needs inferred nodes actually reaching the diagram to test exclusion/anchor behavior against them). Independent of US2.
- **User Story 2 (Phase 5)**: Depends on User Story 1 (needs `DiagramEdge.isInferred` populated to have anything to render). Independent of US3 — could be built in parallel with Phase 4 by a second developer once Phase 3 lands.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests are written and confirmed failing before implementation (Red-Green per `conductor/workflow.md`).
- US1: reverse-index merge (T007) before edge-tagging (T008) — tagging needs to know which entries are inferred-only.
- US2: geometry-layer flag (T017) before either renderer consumes it (T018, T019).

### Parallel Opportunities

- T003-T006 (US1 tests) are all `[P]` — different assertions, most in the same file but independent test blocks; can be drafted together.
- T010-T011 (US3 tests) are `[P]`.
- T013-T016 (US2 tests) are `[P]` — four different test files.
- Once Phase 3 (US1) is complete, Phase 4 (US3) and Phase 5 (US2) can proceed in parallel (different files: `partOfGraph.test.ts` additions for US3 vs. `diagramGeometry.ts`/`htmlRenderer.ts`/`drawioRenderer.ts` for US2).
- T021/T022 (Polish) are `[P]`.

---

## Parallel Example: User Story 2

```bash
# Launch all four US2 test-writing tasks together (different files):
Task: "diagramGeometry.test.ts — isInferred segment-flagging test"
Task: "htmlRenderer.test.ts — stroke-dasharray=3 3 assertion"
Task: "drawioRenderer.test.ts — dashPattern=3 3 assertion"
Task: "crossFormatConsistency.test.ts — parallel 3 3 count check"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational: `isInferred` field) → Phase 3 (US1).
2. **STOP and VALIDATE**: inferred subtypes now appear in generated diagrams; unclassified behavior is unchanged. This alone resolves the reported defect.

### Incremental Delivery

1. Setup + Foundational → Phase 3 (US1) → ship the correctness fix.
2. Phase 4 (US3) → confirm no regression in lateralized-exclusion/anchor behavior → safe checkpoint.
3. Phase 5 (US2) → ship the dashed visual distinction on top.
4. Phase 6 → polish, full-suite verification, quickstart walkthrough, changelog pointer.

### Notes

- Commit after each task or logical group, per `conductor/workflow.md`'s task lifecycle (mark task, red, green, commit, `git notes`, update `tasks.md`/plan tracking).
- Every implementation task depends on its own phase's tests already existing and failing — do not reorder tests after implementation.
