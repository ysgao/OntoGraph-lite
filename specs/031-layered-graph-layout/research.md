# Phase 0 Research: Layered Graph Layout for UML Diagrams

## 1. What does the current layout algorithm actually do, and where does it break down?

**Decision**: Treat `src/uml/layout.ts`'s `computeLayout()` (tidy-tree, average-of-children +
same-depth clamp) and `src/uml/diagramGeometry.ts`'s reactive bus/detour routing
(`computeStemDetour`, `computeSafeJogY`, `computeBusGroupPlacements`) as the baseline to replace
for the cross-axis ordering/coordinate steps, while keeping layer (depth) assignment as-is.

**Rationale**: Direct inspection confirms the failure mode described in the feature spec:

- Depth/layer assignment (`src/uml/depthNormalization.ts`'s `renumberDepthsLongestPath`) already
  computes each node's layer as the **longest** path from root, exactly matching Layered Graph
  Layout Algorithm's layering intent (a node must sit strictly below every parent, including its
  farthest one). This part does not need to change.
- Cross-axis placement (`layout.ts` lines 139-229) only guarantees separation for **leaf** nodes
  (via `nextSlot`) and only clamps **same-depth** collisions after the fact (`byDepth` loop, lines
  204-219). An internal node's position is a bare average of its children with no reservation of
  space for its own subtree width — the code's own comment (lines 186-203) documents this as a
  known, accepted source of real bounding-box overlap once a node has two parents whose other
  children are far apart in slot order.
- Because layers can be more than one hop apart (a shallow parent and a deep parent of the same
  child, per `depthNormalization.ts`'s own docstring), many edges span multiple rows. Today those
  are handled by `computeStemDetour`/`computeSafeJogY` — heuristics that react to a specific
  obstacle after the fact — rather than by reserving a column through the intervening rows, which
  is exactly the multi-level scenario the user reports ("overlaps... when the level [goes] beyond
  two or three").
- There is no crossing-minimization pass. `reorderBySharedChildren` (`layout.ts` lines 96-128) is a
  local union-find clustering of siblings that share a child — it improves some cases but is not a
  global sweep/crossing-count optimizer, so ordering is otherwise left at BFS discovery order.

**Alternatives considered**:
- Patch the existing heuristics further (add more special-cased detours) — rejected; the codebase
  comments already document multiple rounds of this (bus grouping, stem detour, safe jog) without
  resolving the reported multi-level cases, because none of them make overlap structurally
  impossible the way a reserved-slot approach does.
- Adopt a third-party layout library (e.g. `dagre`, already present as `cytoscape-dagre` in
  `package.json` for the unrelated Graph view) — rejected for this feature; `src/uml/`'s
  `noExternalDependency.test.ts` guards this module against new runtime dependencies for FR-008
  offline/determinism reasons, and per CLAUDE.md no new runtime dependency should be added without
  documented rationale and explicit approval. The proposed `LayeredGraphAlgorithm.md` approach
  achieves the same guarantees with plain code already in this style.

## 2. Does adopting `LayeredGraphAlgorithm.md` as proposed resolve the issue, or does it need adaptation?

**Decision**: Adopt the algorithm's dummy-node insertion, layer-ordering (crossing minimization),
and cumulative-sum coordinate assignment (its steps 2-4), but keep this codebase's existing
longest-path layer assignment (its step 1 is BFS/shortest-path, which this codebase already
improved on for a documented, tested reason) and keep the existing elbow/jog SVG rendering style
(its step 5 is compatible with, not a replacement for, `diagramGeometry.ts`'s existing "M/L only,
no bezier" path convention).

**Rationale**: The algorithm's core insight — reserve real slots for the segments of a
multi-layer edge instead of computing a route reactively — is exactly what's missing from the
current implementation and directly targets the reported defect. Its invariants
(node-node via cumulative sum, edge-node via dummy nodes occupying real ordering slots) are
argued from construction, not from case-by-case checks, matching CLAUDE.md's general preference
for structural guarantees over accumulated special-casing. Using BFS/shortest-path layering as
written would reintroduce the exact bug `renumberDepthsLongestPath`'s docstring describes (a
child positioned level-with or above a farther parent), so that one step is deliberately not
adopted as literally proposed.

**Alternatives considered**:
- Adopt the algorithm exactly as written, including BFS layering — rejected; would regress a
  previously-fixed, tested bug (`depthNormalization.ts`'s docstring cites a real reported case).
- Do only crossing minimization (step 3) without dummy nodes (step 2) — rejected; without dummy
  nodes, a multi-layer edge still has no reserved column, so the ordering pass has nothing to
  route it around and node/edge overlap on far-spanning edges would persist.

## 3. Where does the new layout logic live, and what happens to the existing heuristics it replaces?

**Decision**: Introduce the dummy-node/ordering/coordinate-assignment logic as new functions
alongside the existing `src/uml/layout.ts` and `src/uml/depthNormalization.ts` (same module
boundary, zero VS Code API imports, per the `026` precedent of keeping `src/uml/` importable via
`@core/*`). Retire `layout.ts`'s average-of-children placement, the same-depth-only clamp, and
`reorderBySharedChildren`'s union-find heuristic once the new ordering/coordinate steps subsume
them. In `diagramGeometry.ts`, replace `computeStemDetour`/`computeSafeJogY`'s reactive detour
logic for multi-layer ("far child") edges with direct routing through each edge's dummy-node
point list; keep the existing bus-grouping/elbow rendering style for adjacent-layer edges, since
those already render correctly today (spec FR-008: don't regress shallow cases).

**Rationale**: Keeping the change inside `src/uml/` preserves the existing CLI-reuse path
(`@core/uml/*`) and the "no VS Code API, no network" invariants both already tested
(`noExternalDependency.test.ts`). Reusing the existing elbow-routing style for short edges avoids
a wholesale rewrite of code that isn't broken, matching CLAUDE.md's "don't refactor beyond what
the task requires" guidance.

**Alternatives considered**:
- Route every edge (including adjacent-layer ones) through the new dummy-node/point-list
  mechanism uniformly — considered for simplicity, but deferred: it's a valid future
  simplification once the far-edge case is proven, not required to fix the reported defect, and
  would touch more of the already-working, well-tested short-edge rendering path than necessary.

## 4. How is "resolved" verified — what does the test suite need that doesn't exist today?

**Decision**: Add a general-purpose overlap-detection and crossing-count helper (pure functions
over node rectangles and edge point-lists, not tied to any one fixture) under `src/uml/`, used by
new tests that assert **zero** node-node/node-edge overlaps and a **reduced-or-equal** crossing
count, run against both the middle-ear-structure sample and at least one synthetic 4+ level
multi-parent fixture, plus regression coverage that the existing shallow (1-2 level) fixtures in
`layout.test.ts`/`diagramGeometry.test.ts` still pass unchanged.

**Rationale**: The current test suite (`layout.test.ts`, `diagramGeometry.test.ts`,
`middleEarRegression.test.ts`) confirmed via direct search to contain no general overlap/crossing
metric — every existing test targets one specific previously-reported bug case, which is exactly
why deeper-than-3-level cases keep surfacing new instances of the same underlying gap. A reusable
metric is required to make FR-001/FR-002/SC-001/SC-002 machine-checkable rather than
visually-inspected each time, and to prevent regression per FR-008/SC-005. Per CLAUDE.md's
Conductor workflow, this test must be written and failing (red) before the layout change is
implemented (green).

**Alternatives considered**:
- Keep verifying only by manual/visual inspection of exported `.drawio`/SVG files — rejected;
  doesn't scale, isn't repeatable in CI, and is exactly the gap that let the reported multi-level
  overlaps ship in the first place.

## 5. Performance envelope for crossing-minimization passes

**Decision**: Use the algorithm's documented O(passes · E²) pairwise crossing-count approach (~8-10
alternating sweeps) as-is; no need for the O(E log E) sort-based counter it mentions as a
scale-up option.

**Rationale**: UML diagrams generated by this feature are bounded by the existing depth control
and the node cap already enforced in `src/commands/generateUmlDiagram.ts` (per `026`'s plan,
mirroring `openVisualization.ts`'s `MAX_NODES` guard) — tens to low hundreds of nodes/edges per
diagram, not SNOMED CT-scale graphs. At that scale, O(passes · E²) is well within the feature's
existing interactive-use performance goals (diagram visible within 5s, depth-change re-render
within 3s, per `026`'s Technical Context, unchanged by this feature).

**Alternatives considered**:
- Implement the sort-based O(E log E) crossing counter up front — rejected as premature; no
  evidence current or anticipated diagram sizes need it, and CLAUDE.md discourages designing for
  hypothetical future requirements.
