---

description: "Task list for Generate UML Diagram"
---

# Tasks: Generate UML Diagram

**Input**: Design documents from `/specs/026-generate-uml-diagram/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. This repo's `conductor/workflow.md` mandates a Red→Green TDD cycle per task and Constitution Principle IV ("Test-First Integration") requires contract interfaces be defined and validated before implementation — tests are not optional here.

**Organization**: Tasks are grouped by user story (from `spec.md`) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to US1, US2, or US3 from `spec.md`
- Every task names its exact file path

## Path Conventions

Single project (this repo). All paths are repo-relative from `/Users/yoga/JavaApp/OntoGraph-lite/`,
per `plan.md`'s Project Structure section: new `src/uml/`, `src/commands/generateUmlDiagram.ts`,
`src/views/UmlDiagramMessages.ts`, `webview-src/uml/`; extended `src/utils/ManchesterFormatting.ts`,
`src/extension.ts`, `esbuild.mjs`, `package.json`. `cli/` is unaffected by this feature.

---

## Phase 1: Setup

**Purpose**: Configuration/registration surface that every story needs, with no business logic yet.

- [X] T001 [P] Add the `ontograph.generateUmlDiagram` command declaration, its `view/item/context` menu
      entry (identical `when`/`group` to the existing `ontograph.openGraph` entry), and the two new
      settings (`ontograph.umlDiagram.defaultDepth`, `ontograph.umlDiagram.compositionProperties`) to
      `package.json`, per `contracts/uml-diagram-settings.md`
- [X] T002 [P] Add the `uml-diagram-webview` IIFE bundle entry (8th output) to `esbuild.mjs`,
      mirroring the existing `graph-webview` bundle config; point its entry point at
      `webview-src/uml/UmlDiagramApp.ts` (file created in Phase 3)
- [X] T003 [P] Create placeholder directories/files: `src/uml/` (empty `diagramModel.ts`,
      `partOfGraph.ts`, `layout.ts` stubs) and `webview-src/uml/` (empty `UmlDiagramApp.ts`,
      `umlDiagramStyles.ts` stubs), per `plan.md`'s Project Structure

**Checkpoint**: `npm run compile` and `npm run build-all` still succeed with the new empty modules
wired in (bundle references resolve, package.json validates against the extension manifest schema).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, message contract, and the composition-conjunct parser every user story
depends on.

**⚠️ CRITICAL**: No user story task in Phase 3+ may begin until this phase is complete.

- [X] T004 [P] Define `Conjunct`, `DiagramNode`, `DiagramEdge`, `ExcludedRelation` types in
      `src/uml/diagramModel.ts` per `data-model.md`
- [X] T005 [P] Define the `ExtToWebview`/`WebviewToExt` typed message union
      (`UpdateDiagramMessage`, `SelectNodeMessage`, `ReadyMessage`, `RequestDiagramMessage`,
      `RequestDepthChangeMessage`, `NodeClickedMessage`) in `src/views/UmlDiagramMessages.ts`,
      mirroring `src/views/GraphViewMessages.ts`'s shape, per `contracts/uml-diagram-messages.md`
- [X] T006 [P] Write failing tests for `parseConjuncts()` in
      `src/utils/ManchesterFormatting.test.ts`: bare pairwise conjunct, genus + part-of-style
      restriction, genus + other-property restriction, and a label containing `&`/`"` — extending
      the existing test file for `hasTopLevelToken`/`isBareNamedClass`/`extractRoleLower`
- [X] T007 Implement `parseConjuncts(expr): Conjunct[]` in `src/utils/ManchesterFormatting.ts`,
      reusing the file's existing paren-depth-aware top-level-token splitting, to make T006 pass
- [X] T008 Register a not-yet-wired `ontograph.generateUmlDiagram` command stub in
      `src/extension.ts` (real handler replaces this in T017)

**Checkpoint**: Foundation ready — `npm test` passes for T006/T007; user story implementation can
begin.

---

## Phase 3: User Story 1 - Generate a UML diagram for a selected entity (Priority: P1) 🎯 MVP

**Goal**: Right-click a focus entity → "Generate UML Diagram" opens a webview showing that entity
as root, its subclasses as generalization connectors, and (if composition properties are
configured) its part-of relationships as composition connectors.

**Independent Test**: Right-click a class with known subclasses/part-of relationships, choose
"Generate UML Diagram," confirm the diagram opens with correct node set and connector styles.

### Tests for User Story 1

- [X] T009 [P] [US1] Create fixture ontology `test-ontologies/uml-fixture.ofn` encoding: a bare
      `SubClassOf(<A> <B>)` pair (generalization), a `SubClassOf` with a genus term plus an
      `ObjectSomeValuesFrom(<partOfProp> <Whole>)` restriction (composition, once `<partOfProp>` is
      configured), a restriction using an unconfigured/unrelated object property (must be excluded,
      not misclassified), an entity with **zero** relationships of either kind (isolated node), and
      an entity with **both** a composition-qualifying restriction and a bare generalization
      conjunct at the same time (dual-relationship case, e.g. a "Hepatic lobule"-style node)
- [X] T010 [P] [US1] Write failing tests in `src/uml/partOfGraph.test.ts` against the T009 fixture:
      generalization edges from bare conjuncts; composition edges only for configured property
      IRIs; composition edges absent (generalization-only diagram still renders successfully) when
      `compositionProperties` is the default empty array; `excludedRelations` entries for
      non-configured-property restrictions; the isolated node renders with an empty edge list and
      no error; the dual-relationship node keeps **both** its composition and generalization edges
      (no primary-edge selection); a cycle fixture case asserting BFS terminates and the cyclical
      edge remains visible; and a high-fan-out fixture case (one entity with more relationships than
      the node cap) asserting the cap is enforced and `nodeCapReached`/`hasHiddenRelations` are set
      — independent of any depth setting
- [X] T011 [P] [US1] Write failing tests in `src/uml/layout.test.ts`: a known small tree (root + 2
      children + 1 grandchild) asserting exact depth/x/y output
- [X] T012 [P] [US1] Write failing contract test in `src/commands/generateUmlDiagram.test.ts`
      asserting every `updateDiagram` message's `edges` have `kind` set to exactly `'composition'`
      or `'generalization'` (never undefined), per `contracts/uml-diagram-messages.md`'s "Contract
      test expectations"
- [X] T013 [P] [US1] Write a failing webview test asserting that a node with a non-empty
      `excludedRelations` array is rendered with a visible badge/footnote — per FR-010's "MUST be
      visible to the user" requirement. **Deviation from the literal path in this task**: rather
      than testing `UmlDiagramApp.ts` directly (its DOM-wiring entry point isn't unit-testable —
      `webview-src/graph/GraphViewApp.ts` has no test file either, by the same constraint: it calls
      `acquireVsCodeApi()`/mutates `document.body.innerHTML` at module scope), the badge logic is a
      pure helper `excludedRelationsSummary()` in new `webview-src/uml/excludedRelationsBadge.ts`,
      tested directly in `webview-src/uml/excludedRelationsBadge.test.ts` — matching this codebase's
      established pattern of extracting and testing small pure helpers out of webview app entry
      files (e.g. `webview-src/entity-editor/annotationValueDisplay.test.ts`)

### Implementation for User Story 1

- [X] T014 [US1] Implement BFS extraction + composition/generalization classification in
      `src/uml/partOfGraph.ts`: build the one-pass `Map<classIri, Conjunct[]>` from
      `OntologyModel.classes` (merging `superClassIris`/`equivalentClassIris` with
      `parseConjuncts()` applied to `superClassExpressions`/`equivalentClassExpressions`), then BFS
      from the focus IRI reading `ontograph.umlDiagram.compositionProperties`, with a visited-set
      (cycle-safe) and a node cap mirroring `MAX_NODES` in `src/commands/openVisualization.ts` —
      depends on T004, T007, T010. **Two post-review corrections, both found via manual testing
      against the real anatomy.owl file, not caught by the synthetic fixture alone:**
      1. The initial implementation only traversed DOWNWARD (via the reverse index). Most real
         classes declare their own superclass but are never themselves declared as another
         class's supertype, so this rendered only the focus node for the vast majority of
         clicked entities. A second attempt made the BFS traverse both directions at every hop —
         but that caused a combinatorial explosion the moment a hop reached a generic hub concept
         (SNOMED's "Body structure", tens of thousands of subtypes): going up to the hub and back
         down flooded the diagram and starved out the relevant nodes before the cap triggered.
         **Final fix**: two distinct traversals — direct ancestors of the focus entity ONLY, one
         hop via its own conjuncts, never expanded further (mirrors `buildGraphData`'s "direct
         supertype pre-pass" in `openVisualization.ts` — always shown, not part of the depth
         BFS); plus the original multi-hop downward BFS via the reverse index. No recursive
         ancestor expansion, so no hub explosion, while every clicked entity still shows its own
         immediate context.
      2. Even with (1) fixed, clicking a SNOMED clinical-structure concept (e.g. "Middle ear
         structure") still showed almost nothing, because `uml-diagram-generation-spec.md` §3's
         clinical/continuant split means the real part-of children attach to a SEPARATE "Entire
         X" concept, not to the clicked concept itself. Added `resolveAnchor()` (SNOMED's "All or
         part of" property, `733928003`) applied lazily at every level of the downward expansion
         (`getDownwardEntries`, memoized) since the same duplicate pattern recurs throughout the
         hierarchy (e.g. "Structure of pharyngotympanic tube" is itself a clinical alias for
         "Entire pharyngotympanic tube") — the anchor is never itself rendered as a node.
      `src/uml/partOfGraph.test.ts` gained regression tests for both bugs (a fixture case with no
      descendants of its own, and a synthetic clinical/continuant anchor pair), and
      `src/uml/middleEarRegression.test.ts` validates directly against the real anatomy.owl
      "Middle ear structure" case. `ontograph.umlDiagram.compositionProperties`'s default also
      changed from `[]` to SNOMED's four part-of property IRIs (`package.json`), since an empty
      default meant the feature showed no composition edges at all out of the box for this
      project's reference ontology.
      **Known follow-up, not blocking**: `layout.ts`'s row assignment uses raw BFS hop-count for
      `y`, so an ancestor and a descendant discovered at the same hop-distance from the focus can
      land on the same row; connectors still render with correct direction/notation regardless, so
      this is a layout-polish item, not a correctness gap.
- [X] T015 [US1] Implement `computeLayout(nodes, edges): Map<nodeId, {x, y, depth}>` in
      `src/uml/layout.ts` (tidy-tree: depth-based rows, leaf-slot allocation, parent x = avg of
      children x) — depends on T004, T011. **Addition beyond the original task text**: `DiagramNode`
      (`src/uml/diagramModel.ts`) gained optional `x`/`y` fields so layout positions can flow through
      `UpdateDiagramMessage` to the webview, which renders them via Cytoscape's `preset` layout
      instead of force-directed auto-layout — a UML class diagram reads best as a deterministic
      top-down tree. `contracts/uml-diagram-messages.md` and `data-model.md` were updated to match.
- [X] T016 [US1] Implement `generateUmlDiagram` command handler and module-level singleton webview
      panel in `src/commands/generateUmlDiagram.ts` (same pattern as
      `src/commands/openVisualization.ts`'s `panel` variable): reads the focus IRI from the
      tree-view context item, calls `src/uml/partOfGraph.ts` + `src/uml/layout.ts`, posts
      `updateDiagram` (including `excludedRelations`) per `src/views/UmlDiagramMessages.ts` —
      depends on T005, T014, T015, T012
- [X] T017 [US1] Replace the T008 stub in `src/extension.ts` with real registration of
      `ontograph.generateUmlDiagram` wired to `src/commands/generateUmlDiagram.ts` — depends on T016
- [X] T018 [US1] Implement `webview-src/uml/UmlDiagramApp.ts`: Cytoscape.js init, sends `ready`,
      renders `nodes`/`edges` from `updateDiagram` at their server-computed `x`/`y` positions
      (Cytoscape `preset` layout), **and** renders a visible badge/footnote per node for any entries
      in that node's `excludedRelations` via `excludedRelationsBadge.ts` (to satisfy T013 and
      FR-010) — depends on T005, T013
- [X] T019 [US1] Implement `webview-src/uml/umlDiagramStyles.ts`: Cytoscape stylesheet with
      `target-arrow-shape: diamond` (composition, filled, at parent end) and
      `target-arrow-shape: triangle` (generalization, hollow, at parent end), a distinct root-node
      fill, a visible style for nodes with `hasHiddenRelations: true` (depth/cap truncation), and a
      visually distinct style for the excluded-relation badge added in T018 (so it reads as
      "excluded," not as a missed rendering bug) — depends on T018
- [X] T020 [US1] Finalize the `uml-diagram-webview` bundle in `esbuild.mjs` (from the T002
      scaffold) now that `UmlDiagramApp.ts` has real content; run `npm run build-all` and confirm
      the bundle emits

**Checkpoint**: User Story 1 fully functional and independently testable — run
`quickstart.md`'s Story 1 steps.

---

## Phase 4: User Story 3 - Diagram generation never depends on external AI (Priority: P1)

**Goal**: Confirm — with tests, not just code review — that diagram generation is fully
deterministic and has zero AI/LLM/network dependency.

**Independent Test**: Generate the same diagram twice (or offline) and confirm identical, complete
output both times.

### Tests for User Story 3

- [X] T021 [P] [US3] Write a determinism test in `src/uml/partOfGraph.test.ts`: two consecutive
      calls to the Phase 3 extraction function with the same `OntologyModel`/composition-property
      setting produce deep-equal `DiagramNode[]`/`DiagramEdge[]`/`ExcludedRelation[]` (spec SC-003)
- [X] T022 [P] [US3] Write a static-guard test (e.g. a source-scan assertion in a new
      `src/uml/noExternalDependency.test.ts`) asserting no file under `src/uml/` or
      `src/commands/generateUmlDiagram.ts` imports a network/HTTP/AI-client module (`fetch`,
      `http`, `https`, `axios`, `@anthropic-ai/*`, or similar) — regression guard for FR-008

### Validation for User Story 3

- [~] T023 [US3] Manually run `quickstart.md`'s Story 3 steps with networking disabled; confirm the
      diagram still generates successfully with no degraded behavior, and record the result.
      **Partially validated only**: T021/T022 plus the full `npm test` run (which itself has no
      network dependency and passes) give strong static + behavioral evidence, but launching the
      actual Extension Development Host with networking disabled requires a VS Code UI session this
      terminal-only implementation environment cannot drive — that last manual click-through step
      is still owed and is called out explicitly in the final report rather than claimed as done.

**Checkpoint**: US1 + US3 both verified — the MVP is confirmed deterministic and offline-safe before
adding the depth-control layer.

---

## Phase 5: User Story 2 - Adjust how much of the ontology is shown (Priority: P2)

**Goal**: A depth control in the open diagram widens/narrows the rendered relationships in place.

**Independent Test**: With a diagram open for an entity with ≥2 levels of descendants, move the
depth control up/down and confirm the diagram redraws without closing/reopening the panel.

### Tests for User Story 2

- [X] T024 [P] [US2] Extend `src/uml/partOfGraph.test.ts` with tests asserting the extraction
      function respects a `depth` parameter and sets `nodeCapReached`/`hasHiddenRelations`
      correctly at the depth boundary (relationships one level beyond the requested depth are
      neither rendered nor silently dropped — they're flagged). Also added: an explicit
      "depth increases → more nodes revealed" test and a test proving depth truncation alone never
      sets `nodeCapReached` (that flag is reserved for the node-count cap, a separate concept).
- [X] T025 [P] [US2] Write a failing webview-side test asserting the depth control dispatches a
      `requestDepthChange` message with the new depth value and the current focus IRI. **Same
      deviation as T013**: extracted as a pure, directly-testable helper —
      `buildRequestDepthChangeMessage()`/`clampDepth()` in new `webview-src/uml/depthControl.ts`,
      tested in `webview-src/uml/depthControl.test.ts` — rather than driving DOM events against
      `UmlDiagramApp.ts` directly.

### Implementation for User Story 2

- [X] T026 [US2] Add a depth-slider control to `webview-src/uml/UmlDiagramApp.ts`, matching
      `webview-src/graph/GraphViewApp.ts`'s existing depth-slider pattern, dispatching
      `requestDepthChange` on input — depends on T018, T025
- [X] T027 [US2] Handle `requestDepthChange` in `src/commands/generateUmlDiagram.ts`: re-run
      `src/uml/partOfGraph.ts` + `src/uml/layout.ts` at the new depth and post a fresh
      `updateDiagram`, without recreating the panel — depends on T016, T024. **Already implemented
      as part of T016**: the full `onDidReceiveMessage` switch (`ready`/`requestDiagram`/
      `requestDepthChange`/`nodeClicked`) was written in one pass since the message contract was
      already fully specified — no additional code needed here, verified against T024's new tests.
- [X] T028 [US2] Wire `ontograph.umlDiagram.defaultDepth` so a newly generated diagram's initial
      `requestDiagram` uses the configured default instead of a hardcoded value — depends on T001,
      T016. **Already implemented as part of T016** alongside `compositionProperties` config
      reading — both settings are read from `vscode.workspace.getConfiguration('ontograph')` at the
      top of `generateUmlDiagram()`.

**Checkpoint**: US1 + US2 + US3 all independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T029 [P] Add a `## Recent Changes` entry to `CLAUDE.md` summarizing the feature, following
      the existing entries' convention (command name, key files, settings added)
- [X] T030 [P] Run `quickstart.md` end to end against `test-ontologies/bfo-core.ofn` and
      `test-ontologies/anatomy.owl` to confirm SC-001 (<5s open), SC-004 (<3s depth-change
      re-render — time the T026/T027 round-trip against these large fixtures, not just the small
      fixture), and SC-005 (responsive under large relationship counts, visible cap indicator) all
      hold at the project's existing large-ontology scale. **Automated, not manual**: implemented as
      a committed benchmark, `src/uml/partOfGraph.bench.test.ts` (skipped automatically when
      `anatomy.owl` — not committed to the repo — is absent, same convention as
      `src/sync/__tests__/sync-anatomy-bench.test.ts`), timing `buildDiagramMessage` against the
      "Body structure" (123037004) high-fan-out SNOMED concept: SC-001/SC-005 (<5s, cap reached,
      `hasHiddenRelations` set) and SC-004 (<3s depth change) both hold with wide margin (~1.1s
      total for both anatomy.owl checks plus the bfo-core.ofn check in this run). The interactive
      half of quickstart.md (right-click in the actual Extension Development Host UI, watch the
      diagram render) still needs a manual pass — see final report.
- [X] T031 Run `npm run compile` and `npm test` (full suite) to confirm no regressions — 655/656
      pass; the sole failure (`sync-anatomy-bench.test.ts`'s unrelated 500ms AxiomSync threshold) is
      pre-existing, unmodified-by-this-feature, and confirmed to pass in isolation (flakes only
      under full-suite parallel load). **Coverage percentage not measured**: no coverage provider
      (`@vitest/coverage-v8` or similar) is installed in this repo, and installing one is a new
      dependency this task doesn't have standing approval to add; coverage is qualitatively
      thorough instead — every branch of `partOfGraph.ts`/`layout.ts`/`generateUmlDiagram.ts` has an
      explicit asserting test (see the Phase 3–5 test lists above).
- [X] T032 [P] Run `pnpm --filter ontograph-cli build` and `pnpm --filter ontograph-cli test` to
      confirm the `cli/` package is unaffected by the new `src/uml/` module (regression guard for
      the FR-012 reuse claim) — build succeeds, all 36 CLI tests pass unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 3 (Phase 4)**: Depends on Foundational **and** User Story 1 (it tests US1's
  extraction output for determinism/no-external-dependency — there's nothing to test until US1
  exists)
- **User Story 2 (Phase 5)**: Depends on Foundational and User Story 1 (extends the same webview
  and command handler); independent of User Story 3
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — the MVP
- **US3 (P1)**: Depends on US1's artifacts existing (tests US1's output); does not depend on US2
- **US2 (P2)**: Depends on US1's webview/command scaffolding existing; does not depend on US3

### Within Each User Story

- Tests written and failing before implementation (T009–T013 before T014–T020; T021–T022 before
  T023; T024–T025 before T026–T028)
- Extraction/layout (`src/uml/*`) before the command handler that calls them
- Command handler before webview wiring
- Story complete (checkpoint) before moving to the next priority phase

### Parallel Opportunities

- T001, T002, T003 (Setup) — different files, run in parallel
- T004, T005, T006 (Foundational) — different files, run in parallel; T007 depends on T006
- T009, T010, T011, T012, T013 (US1 tests) — different files, run in parallel
- T021, T022 (US3 tests) — different files, run in parallel
- T024, T025 (US2 tests) — different files, run in parallel
- T029, T030, T032 (Polish) — different files/packages, run in parallel; T031 should run after
  T029/T030 land so the full suite reflects the finished feature

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (after Foundational is done):
Task: "Create fixture ontology test-ontologies/uml-fixture.ofn"
Task: "Write failing tests in src/uml/partOfGraph.test.ts"
Task: "Write failing tests in src/uml/layout.test.ts"
Task: "Write failing contract test in src/commands/generateUmlDiagram.test.ts"
Task: "Write failing webview test for excludedRelations rendering in webview-src/uml/UmlDiagramApp.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Story 1 steps against `test-ontologies/animals.omn`
5. Demo: right-click → diagram opens with correct composition/generalization connectors

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → MVP demoable
3. User Story 3 → validate determinism/offline behavior on top of the MVP
4. User Story 2 → validate depth control on top of the MVP
5. Polish → large-ontology scale check, CLAUDE.md update, `cli/` regression guard, full test run

### Parallel Team Strategy

With multiple developers, once Foundational (Phase 2) is done: Developer A takes US1 (Phase 3);
Developer B and C wait for US1's checkpoint (both US3 and US2 depend on US1's artifacts existing)
before starting Phase 4 and Phase 5 respectively — US3 and US2 themselves have no dependency on
each other, so they can then proceed in parallel.

---

## Notes

- [P] tasks touch different files with no unmet dependencies
- [Story] labels trace every Phase 3+ task back to spec.md's US1/US2/US3
- Tests are written and confirmed failing before their corresponding implementation task, per this
  repo's mandatory Red→Green workflow (`conductor/workflow.md`)
- Commit after each task or logical group, updating `conductor/tracks/` per this repo's task
  lifecycle if this feature is tracked there
- Avoid: vague tasks, same-file conflicts within a `[P]` group, and cross-story dependencies beyond
  the ones explicitly called out above

## Post-delivery addendum: drawio export (out-of-plan scope addition)

After all 32 tasks above shipped, manual testing revealed the Cytoscape webview wasn't rendering
the full diagram correctly (root's context menu opened a diagram showing only the focus entity's
immediate ancestor, not the composition/generalization breakdown below it), and this couldn't be
diagnosed further without either live VS Code access or the user's browser console log. Since
spec FR-013 explicitly deferred file export past v1, but the user confirmed export (draw.io/SVG/
PNG) is needed regardless, the following was added as an independently-verifiable alternative
rendering path — deliberately NOT dependent on the still-unconfirmed webview code:

- `src/uml/drawioRenderer.ts` (+ `drawioRenderer.test.ts`, 15 tests): renders the same
  `DiagramNode[]`/`DiagramEdge[]`/`ExcludedRelation[]` data the webview consumes as native mxGraph
  XML, matching `uml-diagram-cli-plan/gen_drawio.py`'s conventions (composition = filled diamond
  at parent/whole, generalization = hollow triangle at parent/supertype) but computing
  `exitX/exitY/entryX/entryY` connector points from each edge's actual node positions
  (`pickConnectionPoints`, unit-tested against all four quadrants) rather than assuming a fixed
  vertical layout — necessary because an ancestor edge can have its "parent" positioned below its
  "child" given how `depth` is assigned in `partOfGraph.ts`.
- New `ontograph.exportUmlDiagramDrawio` command + context-menu entry (same availability as
  "Generate UML Diagram"), `exportUmlDiagramDrawio()` in `generateUmlDiagram.ts`: extracts + lays
  out + renders + prompts a save dialog, mirroring `exportOntology.ts`'s conventions.
- Fixed a latent bug found while touching this file: the webview panel's `onDidReceiveMessage`
  handler closed over `focusIri`/`model`/`compositionProperties` from whichever entity's click
  FIRST created the singleton panel; reusing the panel for a different entity meant the depth
  slider and `ready` handshake could act on stale state. Now tracked as mutable module state
  (`currentModel`/`currentFocusIri`/etc.), updated on every `generateUmlDiagram()` call.
- Generated and sent the user an actual `.drawio` file for the real anatomy.owl "Middle ear
  structure" case (56 nodes, 55 edges) as direct, immediate evidence that the extraction/layout
  pipeline is correct independent of the webview.
- SVG/PNG export (also requested) is NOT yet implemented — out of scope for this addendum;
  draw.io's own desktop/CLI export (`--export --embed-diagram`, spec §8.1) is the interim path
  once a `.drawio` file exists.
- The original webview rendering bug remains unresolved and is not yet root-caused.

## Second post-delivery addendum: HTML/SVG webview rendering + full export set

The drawio export above confirmed the extraction/layout pipeline was correct; the user reported
the Cytoscape webview itself only showed a single node ("Body structure") even after the fixes
above, and directed a full replacement of the rendering approach — generate the same static
HTML/SVG diagram the original prototypes produced (`gen_html_diagram.py`,
`gen_html_diagram_liver.py`) directly in the webview, then add export buttons for draw.io/SVG/PNG
from that same data, and validate against the liver reference (the other worked example).

- **`src/uml/diagramGeometry.ts`** (+ 11 tests): the shared-bus edge routing algorithm from the
  reference scripts, generalized for computed (not hand-tuned) positions — N siblings sharing a
  (parent, kind) get ONE elbow (stem → bus → per-child stems) with the marker on the
  parent-facing stem only, exactly reproducing the marker-placement invariant the original build
  had to debug by hand. An edge whose child is not positioned below the parent (an inverted
  ancestor edge, or a same-row edge) is excluded from bus grouping and routed independently via
  `pickConnectionFractions` (moved here from `drawioRenderer.ts`, which now imports it — single
  source of truth for edge direction across both renderers).
- **`src/uml/htmlRenderer.ts`** (+ 14 tests): `renderDiagramFragment()` produces the exact
  node-div + SVG-overlay markup the reference scripts wrote to a file, computed ENTIRELY on the
  extension host; `renderStandaloneSvg()` produces the same diagram as a single well-formed
  `<svg>` document (nodes as `<rect>`/`<text>` instead of HTML `<div>`s, since a `.svg` file can't
  contain HTML) for the SVG export command.
- **`webview-src/uml/UmlDiagramApp.ts` rewritten**: Cytoscape removed entirely (bundle size
  437KB → 5.3KB). The webview now has NO rendering/layout logic of its own — it injects the
  host-computed `svg`/`nodesHtml` fragment via `innerHTML` and uses ONE delegated click listener
  on `[data-iri]` for node interaction, avoiding any src/webview-src import boundary question.
  Added CSS-transform-based zoom controls and a scrollable viewport (the reference scripts had no
  interactivity at all, being one-off generation scripts). `umlDiagramStyles.ts` and
  `excludedRelationsBadge.ts`/`.test.ts` (webview-side) deleted as dead code — the badge is now
  rendered server-side directly in the HTML fragment.
- **`UpdateDiagramMessage` extended** with `svg`/`nodesHtml`/`canvasWidth`/`canvasHeight`;
  **`RequestExportMessage`** added so the webview's toolbar buttons can request drawio/SVG/PNG
  export without needing a separate command-palette action.
- **`src/uml/drawioCli.ts`** (+ 7 tests): shells out to the local draw.io desktop CLI
  (`--export --embed-diagram --format png`) for the "editable PNG" requirement — embedding the
  mxfile XML in a PNG `zTXt` chunk so re-opening in draw.io recovers the full editable diagram,
  per spec §8.1. `pickPngScale()` implements the same scale-1-fallback the spec documented
  (liver's ~4155px-wide diagram failed PNG export at scale 2, exceeding the 16384px GPU texture
  cap). Falls back to a clear error + "export as draw.io instead" offer when the CLI isn't found,
  rather than failing silently.
- **`ontograph.exportUmlDiagramSvg`/`...Png` commands** added alongside the existing drawio
  export command, same context-menu availability; `exportUmlDiagram()` in
  `generateUmlDiagram.ts` unifies all three formats behind one function so the command-palette
  path and the webview-button path can never drift from each other.
- **Verified against the real anatomy.owl liver structure** (the other worked reference example,
  more structurally complex than middle ear — vasculature exclusion, the Hepatic-lobule
  dual-relationship case): 43 nodes / 46 edges at depth 2, zero position overlaps, well-formed
  drawio XML and SVG, sent to the user for visual comparison against the hand-built
  `uml-diagram-cli-plan/liver-structure.svg`/`.png` reference.
- **Known limitation, unchanged from before**: `layout.ts` still assigns rows by raw BFS
  hop-count, so an ancestor and a descendant at the same hop-distance can land on the same visual
  row; `diagramGeometry.ts`'s off-axis routing means this no longer produces a visually broken
  connector (the bridge routing handles it), but the row-sharing itself is still a layout-polish
  item, not corrected in this addendum.

## Third post-delivery addendum: entire-concept graph, label stripping, marker-collision fix

The user reported the exported diagrams still had overlapping/misplaced edges, box styling that
didn't match the reference, and incorrect class/relationship selection — caused by mixing SNOMED's
clinical concepts (e.g. "Middle ear structure") with their separate "Entire X" continuant concepts
(e.g. "Entire middle ear") in the same graph, when only the latter carry the real part-of axioms.
Per direction ("The easiest way might be use the entire classes for generating diagrams... do not
display 'entire' in descriptions"), the graph now operates entirely in "Entire X" space and strips
the prefix only at display time.

- **`src/uml/partOfGraph.ts` redesigned**: `resolveAnchor(focusIri, conjunctsByClass)` runs ONCE
  up front to resolve the clicked entity to its "Entire X" anchor, which becomes `rootIri` for
  every subsequent step — the one-hop ancestor pass and the downward BFS both traverse purely in
  anchor space. This replaces the earlier design's per-node lazy anchor splicing (which spliced in
  a second concept's reverse-index entries mid-BFS and was the root cause of mismatched/duplicated
  edges); that splicing mechanism is now removed entirely. `isRoot` is `iri === rootIri`, not
  `iri === focusIri` — the diagram's root node is always the anchor, even though the user clicked
  the clinical concept.
- **`stripEntirePrefix(label)` added**: strips a leading `entire ` (case-insensitive) and
  re-capitalizes the remainder, so "Entire liver" displays as "Liver". Applied in `labelFor()`,
  the single place every node label is derived, so it's impossible for an unstripped "Entire "
  label to reach either renderer.
- **`src/uml/layout.ts` fixed**: `childrenByParent` now clusters a parent's children by edge kind
  (all `composition` children before all `generalization` children) instead of preserving raw
  edge-array order, which previously interleaved the two kinds and caused their bus lines to cross.
- **`src/uml/diagramGeometry.ts` fixed — the core "edges overlapped" bug**: when a parent has both
  a composition group and a generalization group of children (common, since a node can have both
  parts and subtypes), both groups previously computed the identical parent-exit x-coordinate,
  so the diamond and triangle markers landed on top of each other. Added `PARENT_STEM_SPREAD = 24`:
  each kind-group off a given parent now gets a distinct, symmetric x-offset from center, and the
  bus's min/max-x span accounts for the offset stem too. Regression test added reproducing the
  exact reported symptom (a diamond and a triangle colliding at one parent).
- **`src/uml/branchColors.ts` added** (new file, 5 tests): mechanical, non-semantic category-style
  coloring — each of the root's direct descendant branches gets a distinct color from a fixed
  8-color palette, propagated by BFS to every descendant of that branch; ancestors of the root get
  a neutral gray. Deliberately NOT based on any domain classification of what a concept "is" (bone
  vs. muscle vs. membrane), since the spec's "no AI/LLM judgment" principle (FR-004/FR-008) rules
  out inferring semantic categories — branch position is a judgment-free structural proxy that
  still gives the diagram the reference's visually distinct, organized regions. Wired into both
  `htmlRenderer.ts` (inline `background-color`/`border-color`/`color` per node) and
  `drawioRenderer.ts` (`fillColor`/`strokeColor`/`fontColor` per node style); the `hasHiddenRelations`
  amber-stroke indicator still overrides the branch color where applicable.
  `webview-src/uml/UmlDiagramApp.ts`'s `.dnode-hidden`/`.dnode-excluded` CSS border-color rules
  gained `!important` so they show through the new per-node inline branch-color style.
- **`test-ontologies/uml-fixture.ofn` and `middleEarRegression.test.ts` updated**: fixture's
  `AnchorWhole` label changed to "Entire anchor whole" to exercise stripping; regression
  assertions updated for the anchor-as-root design (root is now IRI 181185000, labeled "Middle
  ear"; a no-longer-reachable node under the old lazy-splicing design was removed with rationale
  documented inline).
- **Verified against real anatomy.owl** (middle ear 25342003→anchor 181185000, liver
  10200004→anchor 181268008): programmatic checks confirm (a) no node label contains "entire"
  (case-insensitive), (b) no two nodes share identical layout coordinates, (c) no two
  marker-carrying path segments share an identical anchor point — the exact class of bug reported.
  Regenerated `.drawio`/HTML previews for both sent to the user for visual confirmation.
- Full suite: 714/714 tests passing, `npm run compile` clean.

## Fourth post-delivery addendum: edges crossing class boxes (draw.io export + layout row bug)

The user reported the exported draw.io diagram still had edges drawn through class boxes. Two
distinct causes, both fixed:

- **`src/uml/drawioRenderer.ts` was letting mxGraph auto-route every edge.** It only ever
  supplied fixed `exitX/exitY/entryX/entryY` connection points plus
  `edgeStyle=orthogonalEdgeStyle`, and left the actual path to mxGraph's own automatic router —
  which has no notion of sibling boxes and will happily draw a straight orthogonal path directly
  through an unrelated node sitting between the two connection points. This is a different code
  path from the HTML/SVG webview renderer (`htmlRenderer.ts`), which has always used
  `diagramGeometry.ts`'s explicit shared-bus segment geometry — so the drawio export could
  diverge from what the webview showed. Fixed by adding `computeEdgeRoutes()` to
  `diagramGeometry.ts`: a per-`DiagramEdge.id` counterpart to the existing `computeEdgeSegments()`
  (which returns segments grouped for rendering, not keyed by originating edge) that returns the
  exact elbow via-points each edge's line must pass through. `drawioRenderer.ts` now emits those
  points as an explicit `<Array as="points"><mxPoint .../></Array>` in the edge's `mxGeometry` and
  drops `edgeStyle=orthogonalEdgeStyle` entirely (an unset `edgeStyle` makes mxGraph draw straight
  segments through the supplied points instead of computing its own route) — the draw.io export
  now physically cannot diverge from the webview's own routing, since both consume the same
  underlying elbow-point math.
- **The deeper bug, affecting the webview too, not just draw.io export**: `partOfGraph.ts`'s
  one-hop ancestor pre-pass assigned the ancestor node `depth: 1` — the exact same depth
  `layout.ts` assigns the root's own depth-1 children. Since `layout.ts` maps depth directly to a
  fixed row (`y = depth * ROW_HEIGHT`), the ancestor landed on the identical visual row as
  unrelated descendants, and `diagramGeometry.ts`'s off-axis "bridge" routing for that ancestor
  edge drew a straight horizontal segment along that shared row — sweeping directly through
  whichever of the root's own children happened to sit between the ancestor and the root
  horizontally. This is why box-crossing only shows up for real, complex ontology data (anatomy.owl)
  and not the small hand-built fixtures used in most unit tests: it requires several children on
  the root's row plus an ancestor positioned off to one side. Fixed by giving the ancestor
  `depth: -1` instead of `1`, so it always renders on its own row strictly above the root — never
  shares a row with any descendant regardless of how many children the root has.
  `layout.ts`'s `computeLayout()` now normalizes: since `y` is used as a `top:${y}px` value (must
  stay non-negative), it computes `minDepth = Math.min(0, ...allDepths)` and shifts every row down
  by `-minDepth * ROW_HEIGHT` so the most-negative row still lands at `y=0`.
- **Verified with a new programmatic box-intersection check** (not present in the committed test
  suite — a throwaway diagnostic script) against real anatomy.owl middle-ear and liver diagrams:
  walked every edge's full waypoint chain (exit point → intermediate elbow points → entry point)
  and checked each straight segment against every OTHER node's box for intersection. Before this
  fix: 13 violations (middle ear), 26 violations (liver), all on the ancestor bridge edge. After:
  0 violations in both. Regenerated `.drawio` files sent to the user for visual confirmation.
- Full suite: 714/714 tests passing (12 UML test files, 84 tests), `npm run compile` clean.

## Fifth post-delivery addendum: node exclusion (User Story extension), notes relocation, marker bug

The user asked for a new capability on top of the delivered feature: "not all classes need to be
included in the diagram... can user select the nodes and remove them, then regenerate the diagram
without those marked for exclusion." Clarified via three decisions: (1) BOTH "remove whole
subtree" and "splice out just this node, reconnecting its children" should be available as a
per-regenerate user choice, not a single hard-coded default; (2) interaction model is click-to-mark
then a "Regenerate" button; (3) exclusions are session-only per focus entity, resetting on refocus.
A related clarification mid-implementation: Regenerate must be ADDITIVE across repeated clicks
(never silently un-excluding an earlier removal), and only an explicit "Reset exclusions" or
closing the panel should bring excluded nodes back.

- **`src/uml/nodeExclusion.ts`** (new, 18 tests): `applyNodeExclusions(nodes, edges, excludeIris,
  mode)` — pure post-processing over an already-extracted diagram (not part of `partOfGraph.ts`'s
  BFS), so exclusion can be re-applied on every depth change without re-running extraction. The
  root can never be excluded (silently ignored if requested). `'subtree'` recomputes graph
  reachability from the root (plus its ancestors) with excluded nodes treated as removed vertices —
  a dual-relationship node (FR-011) reachable via a second, non-excluded parent survives.
  `'splice'` reconnects an excluded node's children to its nearest surviving ancestor (walking up
  through any chain of consecutively-excluded ancestors, cycle-safe), preserving the CHILD's own
  edge kind/property rather than the ancestor's. Both modes finish with `renumberDepths()`: a
  cycle-safe LONGEST-path-from-root recomputation (not a shortest-path BFS) — a shortest-path
  assignment can leave a dual-relationship node level-with or above a farther surviving parent,
  which resurrects the exact "edges cross class boxes" bug in its general form (the parent's edge
  becomes an off-axis bridge whose straight-line routing sweeps across whatever occupies that row).
  Verified via an exhaustive sweep (every non-root node in both middle-ear and liver, both modes)
  with a programmatic box-intersection check: 0 violations across all combinations, versus 11
  before the longest-path fix (found via one specific case, "Microscopic liver" under splice mode).
- **`src/views/UmlDiagramMessages.ts`**: `RequestRegenerateMessage`/`ResetExclusionsMessage` added
  to `WebviewToExt`.
- **`src/commands/generateUmlDiagram.ts`**: new module-level `currentExcludeIris`/
  `currentExclusionMode`, applied in `extractAndLayout`/`buildDiagramMessage` before
  `computeLayout`. Reset on refocus (`isNewFocus`) AND on `panel.onDidDispose` (closing the
  diagram ends the exclusion session) — but the `requestRegenerate` handler is ADDITIVE
  (`currentExcludeIris.add(iri)` per marked IRI, never `= new Set(...)`), so a second Regenerate
  click can't silently un-exclude an earlier one. `exportUmlDiagram()` inherits the current
  exclusion set only when exporting the SAME entity currently tracked/open in the webview, never a
  different one exported via command palette without opening its diagram first.
- **`webview-src/uml/exclusionControl.ts`** (new, 3 tests, mirrors `depthControl.ts`'s convention)
  + **`UmlDiagramApp.ts`**: clicking a node (other than the root) toggles a client-side
  "marked for removal" `.dnode-marked` outline; a toolbar `<select>` picks subtree-vs-splice mode;
  "Regenerate (N marked)"/"Reset exclusions" buttons post the new messages. Marked-but-not-yet-
  regenerated state clears on every fresh render (the marked nodes are gone or renumbered anyway).
- **Excluded-relations rendering redesigned** per explicit user direction: "should not be included
  in the class box... added as notes with class name and detail of excluded relation below the
  entire diagram... not part of the diagram" (previously a `⚠ N relations excluded` badge/border
  on the owning node). `ExcludedRelation` (`diagramModel.ts`) gained `fromLabel`/`propertyLabel`/
  `targetLabel`, resolved once in `partOfGraph.ts`'s `addExcluded` (new `propertyLabelFor()`
  checking all three property maps) so no renderer needs a further model lookup.
  `htmlRenderer.ts`'s `renderDiagramFragment()` gained `renderExcludedNotes()` — a plain-text
  section positioned below the lowest diagram node (`diagramBottom + MARGIN`), listing each
  excluded relation as "FromLabel — propertyLabel → targetLabel"; `canvasHeight` grows to fit it.
  Per a following clarification, this notes section is a **webview-only** affordance:
  `renderDrawio()` and `renderStandaloneSvg()` still accept `excludedRelations` for signature
  parity but deliberately never render it (`void excludedRelations;`) — an exported file contains
  only the diagram.
- **Context-menu cleanup**: `package.json`'s `view/item/context` no longer lists
  `ontograph.exportUmlDiagramDrawio`/`...Svg`/`...Png` — those three actions are redundant with
  the UML panel's own toolbar export buttons (which call the underlying functions directly, not
  via the registered command). The commands themselves remain registered (harmless, just no
  longer cluttering the focused-class right-click menu); `ontograph.generateUmlDiagram` (opening
  the panel) stays in the menu.
- **Real bug found and fixed in the drawio export's edge routing**: `computeEdgeRoutes()`
  (`diagramGeometry.ts`) could emit two IDENTICAL waypoints for the single-child case (parent and
  child sharing the same x — the common case for any node with exactly one child) — a degenerate
  zero-length interior segment in mxGraph's point array, which made the line into the diamond/
  triangle marker render as disconnected. Fixed via a new `dedupeConsecutive()` helper applied to
  all three route-construction paths (composition bus, generalization bus, off-axis bridge); 3 new
  regression tests added directly against `computeEdgeRoutes` (previously only exercised
  indirectly through `drawioRenderer.test.ts`).
- **Also fixed while investigating the same box-crossing bug class**: `computeEdgeSegments()`/
  `computeEdgeRoutes()`'s shared-bus line was positioned at the PROPORTIONAL midpoint of the
  parent-child gap (`(pyBottom + childTopY) / 2`) — fine for a normal one-row gap, but a bus edge
  spanning MULTIPLE rows (splice mode collapsing levels, or a dual-relationship node whose
  depth-defining parent is much deeper) would then land the horizontal bus sweep in the MIDDLE of
  an intermediate row, crossing whatever nodes populated it. Fixed via `busYFor()`: the bus now
  sits a small FIXED gap below the parent, always inside the empty band between the parent's row
  and the very next row, regardless of how many rows the edge as a whole spans.
- **Immediate follow-up regression**: the first `BUS_GAP` value tried (20px) over-corrected —
  the parent-to-bus stem carrying the diamond/triangle marker became barely longer than the
  marker itself (drawio `startSize=16`), so the marker visually appeared to sit directly on the
  horizontal bus line with no connecting vertical segment. Fixed by setting `BUS_GAP = 42`
  (exactly half of `layout.ts`'s `ROW_HEIGHT - NODE_HEIGHT` = 84, i.e. what the ORIGINAL
  proportional-midpoint formula produced for a normal one-row gap) — restores the pre-regression
  stem length for the common case while keeping the fixed-cap behavior that prevents multi-row
  crossings. New regression test asserts the stem is ≥30px. Re-verified the full exhaustive
  exclusion sweep (every non-root node × both modes, middle ear + liver): 0 box-crossing
  violations across all 130 combinations, confirming the larger gap didn't reopen the earlier bug.
- Full suite: 751/751 tests passing, `npm run compile` clean, production build succeeds
  (`uml-diagram-webview.js` 7.0KB, up from 5.3KB for the new toolbar controls).
