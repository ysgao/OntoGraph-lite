# Phase 0 Research: Include Inferred Subtypes in UML Diagram Scope

No `[NEEDS CLARIFICATION]` markers remain in `spec.md` — the two open design questions were
resolved directly with the user before this plan was written, and all remaining technical unknowns
were resolved by reading the existing codebase (this feature reuses data structures and a rendering
convention that already exist elsewhere in the product). Recorded here for traceability.

## Decision 1: Where does "inferred subtype" data come from?

**Decision**: Reuse `OntologyModel.inferredSubClasses: Map<string, Set<string>>` (parent IRI →
child IRIs), populated by the existing `classifyOntology()` command (`src/commands/
classifyOntology.ts:56-68`) from `ReasonerBridge.classify()`'s `result.hierarchy`. Gate all new
behavior on `model.isClassified` (`src/model/OntologyModel.ts:132`).

**Rationale**: This is already the single source of truth for "what did the reasoner conclude"
elsewhere in the codebase — `src/views/InferredHierarchyProvider.ts:64-71` (Inferred Hierarchy tree
view) and `src/commands/openVisualization.ts:138-196` (general Graph view) both consume it directly,
with no separate/parallel inferred-hierarchy representation anywhere in the product. Introducing a
second source would be pure duplication.

**Alternatives considered**:
- *Ask the reasoner bridge directly at diagram-generation time*: rejected — would mean invoking a
  Java process synchronously during diagram extraction, adding real latency and a new failure mode,
  when a cached, already-computed result is sitting on the model.
- *Compute a fresh transitive closure at diagram time*: rejected — `model.inferredSubClasses` from
  `classify` is already what the reasoner considers each class's hierarchy position; recomputing
  closure client-side would risk disagreeing with the reasoner's own output for equivalent-class
  cycles or complex expressions the diagram code can't itself evaluate.

## Decision 2: Should generating a UML diagram trigger classification if absent?

**Decision (confirmed with user)**: No — inferred subtypes are included only when
`model.isClassified` is already true; otherwise behavior is byte-identical to today (asserted-only).

**Rationale**: Matches the existing precedent in `openVisualization.ts` (same `model.isClassified`
gate, no auto-classify) and keeps "Generate UML Diagram" a fast, side-effect-free read of the
current model — classification is a separately-invoked, potentially slow (large-ontology) action
the user explicitly triggers.

**Alternatives considered**:
- *Auto-classify on first UML generation*: rejected by user — turns a diagram-open action into a
  potentially long-running reasoner invocation, and is a bigger behavioral change than the reported
  defect calls for.

## Decision 3: Should inferred-only edges be visually distinguished?

**Decision (confirmed with user)**: Yes — dashed line for edges with no supporting asserted axiom,
solid for edges that are asserted (whether or not also reasoner-confirmed), mirroring the
`isInferred: true` convention already implemented in `openVisualization.ts` (`src/commands/
openVisualization.ts:188-196`) for the general Graph view.

**Rationale**: Consistency with an existing, already-shipped visual convention in the same product
means no new design language to learn, and directly serves the "can I trust this line" review use
case named in the spec's User Story 2.

**Alternatives considered**:
- *No distinction*: rejected by user — loses the asserted/inferred trust signal.
- *A new/different visual treatment (e.g., color instead of dash)*: not selected — dashing is the
  existing convention; introducing a second, different convention for the same asserted/inferred
  distinction in a different diagram type of the same product would be inconsistent.

## Decision 4: How to avoid duplicate/conflicting edges when a relationship is both asserted and inferred

**Decision**: Build inferred reverse-index entries as an additive pass over the same `reverseIndex`
map already built from asserted conjuncts (`buildReverseIndex`, `src/uml/partOfGraph.ts:63-83`).
When both an asserted and an inferred entry produce the same `(parentIri, childIri)` pair, the
existing `addEdge`/`edgeMap` dedup-by-id logic (`src/uml/partOfGraph.ts:206-209`, ID format
`` `${parentIri}|${childIri}|${kind}|${propertyIri ?? ''}` ``) naturally collapses them into one
edge — the fix marks that single edge `isInferred: true` only when NO asserted entry produced it;
an edge discovered via both sources is asserted-priority (rendered solid).

**Rationale**: Reuses the dedup mechanism the code already has rather than adding a second
pass/set; keeps `removeRedundantEdges`'s later transitive-redundancy pass (`src/uml/
partOfGraph.ts:337-371`) working unmodified over a single edge list, same as today.

**Alternatives considered**:
- *Separate inferred-edge list, merged just before render*: rejected — would require duplicating
  the redundant-edge removal and node-cap logic for a second edge collection, doubling the surface
  area for a subtle divergence bug.

## Decision 5: Rendering — where dashing hooks into the three export targets

**Decision**: `isInferred` is threaded from `DiagramEdge` (`src/uml/diagramModel.ts`) through to
each of the three renderers exactly where `edge.kind` already selects a stroke style today:
`src/uml/htmlRenderer.ts` (interactive webview SVG fragment + standalone SVG export — both share
the same edge-drawing code path) and `src/uml/drawioRenderer.ts` (draw.io XML `mxCell` style
string). No change needed in `src/uml/layout.ts`, `busLanes.ts`, `layerOrdering.ts`,
`layerCoordinates.ts`, or `dummyNodes.ts` — these only branch on `edge.kind` (`'composition'` vs
`'generalization'`) for lane assignment and routing, and an inferred subtype edge is always
`kind: 'generalization'` (inferred data only ever comes from `model.inferredSubClasses`, which is
exclusively subClassOf-derived, never part-of), so it is geometrically indistinguishable from an
asserted generalization edge — only its stroke rendering differs.

**Rationale**: Keeps the change surface to exactly the files that already vary rendering by
`edge.kind`; confirmed by reading `layout.ts`/`busLanes.ts` that lane/geometry logic has no
per-edge stroke concern to begin with.

**Alternatives considered**: None — this follows directly from `edge.kind` always being
`'generalization'` for inferred edges, which is a structural fact of where `model.inferredSubClasses`
data comes from, not a design choice.

## Decision 6: Dash pattern choice, and handling the shared-bus rendering optimization

Investigation of the renderers surfaced two details the naive "just add `isInferred` next to `kind`"
approach would get wrong:

**6a. Reuse vs. distinguish the existing "far edge" dash pattern.** `htmlRenderer.ts` already draws
a dashed line (`stroke-dasharray="6 4"`) for multi-layer ("far") edges, and `drawioRenderer.ts`
mirrors it (`dashed=1;dashPattern=6 4;`) — the same pattern also marks a capped node's "more
relationships exist" indicator. `src/uml/crossFormatConsistency.test.ts` counts occurrences of this
exact string in both export formats and asserts the counts match.

**Decision**: `isInferred` gets its **own, visually distinct** dash pattern (`stroke-dasharray="3 3"`
in SVG, `dashed=1;dashPattern=3 3;` in drawio) rather than reusing `"6 4"`.

**Rationale**: Far-edge dashing and inferred-edge dashing are unrelated concepts (routing distance
vs. axiom provenance) that can co-occur on the same edge (a far, reasoner-inferred subtype is
possible). Sharing one pattern would make them visually and test-assertion-indistinguishable, and
`crossFormatConsistency.test.ts`'s substring-count comparison would silently conflate the two.
A distinct pattern keeps both existing tests and new tests independently assertable, and
`crossFormatConsistency.test.ts` gets a second, parallel count check for the new pattern.

**6b. The shared-bus rendering optimization.** `htmlRenderer.ts` does not draw one path per edge;
`diagramGeometry.ts`'s `computeEdgeSegmentsCore` groups sibling edges sharing the same
`(parentIri, kind)` into one shared parent-to-bus stem and one shared horizontal bus line, with only
the final per-child descending stem mapping 1:1 to a single edge/child. (`drawioRenderer.ts`, by
contrast, draws one independent `mxCell` per edge with its own full point route — it has no such
sharing.) Far edges never participate in this sharing at all — they route through their own
reserved dummy-node lanes entirely separately from the ordinary bus (per `routeFarEdgesThroughLanes`,
noted in `CLAUDE.md`'s 031 changelog entry) — so this only matters for **near** edges.

**Decision**: In `htmlRenderer.ts`, dash only the per-child descending stem segment for a child whose
owning edge is `isInferred`; the shared parent-to-bus stem and horizontal bus line, which do not
belong to any single edge, always render solid regardless of whether some of the children they feed
are inferred-only. In `drawioRenderer.ts`, since each edge is already an independent `mxCell`, the
entire edge's style gets the `isInferred` dash — there is no shared segment to preserve.

**Rationale**: This is the minimal change consistent with each renderer's existing architecture:
`htmlRenderer.ts`'s shared bus is genuinely multi-owner (attributing a single boolean to it would be
arbitrary when siblings disagree), while its per-child stem already maps 1:1 to one edge, giving an
unambiguous place to apply the flag. `drawioRenderer.ts` has no shared-ownership segment to begin
with, so whole-edge dashing is both correct and simplest.

**Alternatives considered**:
- *Split the shared bus into per-edge segments so it can carry a mixed dash*: rejected — a much
  larger change to `diagramGeometry.ts`'s geometry model for a cosmetic corner case (a bus with
  mixed asserted/inferred children), and would re-introduce the overlapping-stroke visual artifact
  the shared-bus optimization exists to avoid.
- *Dash the whole bus if ANY child on it is inferred-only*: rejected — would make an asserted
  relationship's line appear dashed merely because an unrelated sibling subtype is reasoner-only,
  actively misleading for the "can I trust this line" use case the feature exists for.
