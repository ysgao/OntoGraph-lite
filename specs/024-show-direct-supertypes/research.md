# Research: Show Direct Supertypes in Graph View

## Decision 1: Where supertype traversal lives
**Decision**: Add a dedicated pre-BFS pass in `buildGraphData` (`src/commands/openVisualization.ts`) that collects direct supertype nodes of the focus entity BEFORE the main BFS loop runs.
**Rationale**: The main BFS loop mixes upward (superclass) and downward (subclass) traversal; removing the upward traversal from the BFS and replacing it with a single pre-pass cleanly separates the two concerns — the BFS depth slider then controls only subtypes.
**Alternatives considered**: Passing a separate `directSupertypesOnly: boolean` flag to a secondary BFS call; adding a dedicated depth-0-superclass guard inside the existing loop. Both are messier than a clean pre-pass separation.

## Decision 2: Prevent duplicate edges with "also collect edges" section
**Decision**: Reuse the same edge-id convention (`${focusIri}|sub|${sup}`) for the new `directSupertype` edge. `addEdge` already deduplicates by id, so the "also collect edges" sweep at lines 212–238 silently no-ops when it encounters the same id.
**Rationale**: Zero-effort deduplication — no conditional logic needed in the post-BFS edge sweep. The first writer wins: the pre-pass adds the `directSupertype` edge; the sweep attempts `subClassOf` with the same id and is ignored.
**Alternatives considered**: Filtering the sweep to skip nodes in a "supertype set"; using a distinct id prefix. Both require extra tracking or diverge from the existing dedup guarantee.

## Decision 3: owl:Thing handling
**Decision**: Include `owl:Thing` in the pre-pass if it appears in `focusCls.superClassIris` (i.e., do NOT filter it out unlike the current BFS at line 140). The existing node-builder fallback (line 272–273) renders unlisted IRIs as class stubs using the local name — `owl:Thing` → label "Thing". No special-case needed.
**Rationale**: The spec requires owl:Thing to be shown as a valid parent. The stub fallback already handles unknown IRIs gracefully.
**Alternatives considered**: Adding an explicit `OWL_THING` node entry in the model; special-casing in the node builder. Both add code for marginal UX gain.

## Decision 4: New edge type name and visual style
**Decision**: Add edge type `'directSupertype'` to the union in both `GraphViewMessages.ts` and the local mirrored type in `GraphViewApp.ts`. Style: solid line, triangle arrow-head, color `#c17ade` (soft purple) — unused in the existing palette and visually distinct from the gray `subClassOf` (#888), gold `equivalentTo` (#e8a800), and red `disjointWith` (#cc3333).
**Rationale**: A named type (rather than reusing `subClassOf`) satisfies FR-007 (must be visually distinguishable) and allows independent cytoscape style rules. Purple is unused and unambiguous on both light and dark themes.
**Alternatives considered**: Reusing `subClassOf` with a `isDirect` flag; a separate `ancestorOf` type. The former cannot be styled independently; the latter is semantically wrong (we show child→parent, not parent→child).

## Decision 5: Scope of supertype display (classes only)
**Decision**: The pre-pass applies only when the focused entity is a class (`model.classes.get(focusIri)` succeeds). ObjectProperties, individuals, and other entity types are unchanged.
**Rationale**: The spec refers exclusively to "superclasses" in an OWL class hierarchy. Super-properties and individual typing are separate features not requested here.
**Alternatives considered**: Generic super-property pass for object/data properties. Out of scope per spec.

## Resolved Questions
- No `NEEDS CLARIFICATION` markers were present in the spec.
- OWL_THING: shown if explicitly in `superClassIris` — covered by Decision 3.
- Deduplication: covered by Decision 2 — no extra tracking required.
- Layout modes: no layout-specific logic needed; both dagre and cose operate on the same cytoscape element set, so adding supertype nodes/edges is layout-agnostic (satisfies FR-004 for free).
