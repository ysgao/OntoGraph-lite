# Data Model: Layered Graph Layout for UML Diagrams

This feature changes internal layout computation only. The data already sent across the
extension↔webview boundary (`DiagramNode`, `DiagramEdge`, `ExcludedRelation` — see
`specs/026-generate-uml-diagram/data-model.md` and `src/uml/diagramModel.ts`) is **unchanged in
shape**; `DiagramNode.x`/`DiagramNode.y` still carry a single final pixel position per real node,
and renderers still consume per-edge point lists as they do today. The entities below are new,
internal-only constructs introduced to compute those same final values correctly.

## Layer (spec.md's "Hierarchy Level"; existing, reused as-is)

An integer assigned to every real node, equal to its longest-path distance from the diagram root
(`src/uml/depthNormalization.ts`'s `renumberDepthsLongestPath`, unchanged by this feature).
Ancestors of the root keep their existing negative-layer convention. Maps directly to a row (TB)
or column (LR) exactly as it does today.

## Dummy Node (new, internal-only)

A placeholder occupying one layer-slot for one intermediate layer that a multi-layer edge passes
through.

- **id**: synthetic, derived from the owning edge's id and the intermediate layer index (not an
  ontology IRI — never confused with a real `DiagramNode`).
- **layer**: the intermediate layer it occupies.
- **ownerEdgeId**: the original `DiagramEdge.id` it stands in for.
- **width/height**: a small fixed footprint (per the algorithm's guidance), distinct from a real
  node's text-based footprint.

Relationships: a single edge whose child's layer is more than one greater than its parent's layer
is represented, for layout purposes, as parent → dummy₁ → dummy₂ → … → child, one dummy per
intermediate layer. Dummy nodes never appear in the data sent to a webview or export renderer —
they are consumed entirely within `src/uml/` and resolved back into a single edge's ordered
waypoint list before handoff to `diagramGeometry.ts`'s existing rendering functions.

## Layer Ordering (new, internal-only)

Per layer, an ordered list of occupant ids (a mix of real node ids and dummy node ids for that
layer). Produced by the crossing-minimization sweep (median/barycenter-style, alternating
up/down passes per `LayeredGraphAlgorithm.md` §3) and kept only if it has fewer counted crossings
than the previous best ordering for that diagram.

- **layer**: the layer index this ordering applies to.
- **occupantIds**: real + dummy ids, in final left-to-right (or top-to-bottom for LR) order.

Relationships: every real node and every dummy node for a given diagram appears in exactly one
Layer Ordering entry (the one matching its own layer).

## Edge Route (extends existing edge-rendering output, internal-only until resolved to points)

The resolved geometry for one `DiagramEdge`, replacing today's ad hoc detour/jog computation for
multi-layer edges.

- **edgeId**: the owning `DiagramEdge.id`.
- **points**: an ordered list of `(x, y)` positions — source box anchor, one point per
  intermediate dummy node (from Dummy Node + its assigned coordinate), target box anchor.

Relationships: for an adjacent-layer edge (no intermediate dummy nodes), this is unchanged from
today's direct bus/elbow routing — `points` has just the two endpoints (or the existing bus-stem
midpoints), still produced by the existing `diagramGeometry.ts` functions. For a multi-layer edge,
`points` is derived from the coordinates assigned to that edge's chain of Dummy Nodes, and is what
`diagramGeometry.ts`'s existing elbow-segment renderer walks instead of running
`computeStemDetour`/`computeSafeJogY`.

## Unchanged entities (for reference)

- **DiagramNode** (`src/uml/diagramModel.ts`): one real ontology entity box; `depth`/`x`/`y`
  fields keep their existing meaning and are populated by the new coordinate-assignment step
  instead of the old average-of-children step.
- **DiagramEdge** (`src/uml/diagramModel.ts`): one composition/generalization relationship;
  unchanged shape. Its rendered path may now route through intermediate points per Edge Route
  above.
- **ExcludedRelation** (`src/uml/diagramModel.ts`): unaffected by this feature.
