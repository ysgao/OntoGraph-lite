# Contract: `src/uml/` layout module boundary

This feature has **no external contract change** — the extension↔webview `postMessage` contract
(`specs/026-generate-uml-diagram/contracts/uml-diagram-messages.md`) and the Composition Property
Selection setting contract (`uml-diagram-settings.md`) are both unaffected; `updateDiagram` still
carries `DiagramNode[]`/`DiagramEdge[]` with the same fields. What changes is the internal
contract between `src/uml/layout.ts` (+ new layering helpers) and `src/uml/diagramGeometry.ts`,
which both `htmlRenderer.ts` and `drawioRenderer.ts` depend on. Documented here because it is the
real interface boundary this feature's implementation must preserve.

## `computeLayout(nodes, edges, direction)` — unchanged signature, changed internals

Still returns `Map<string, LayoutPosition>` keyed by real node IRI only (dummy nodes are never
exposed past this module's internals). Callers in `src/commands/generateUmlDiagram.ts` and every
existing test in `layout.test.ts` that only inspects the returned map for real IRIs continue to
work unmodified. The guarantee this function must now uphold, verified by the new overlap/crossing
test helper (see `research.md` §4), is:

- No two real nodes' resulting boxes (position + known width/height) overlap, at any depth.
- The relative order chosen within each layer is the one (among those tried) with the fewest
  counted edge crossings for that diagram, not arbitrary discovery order.

## New: per-edge route resolution consumed by `diagramGeometry.ts`

A new function (name TBD during implementation, e.g. `resolveEdgeRoutes`) in `src/uml/` takes the
same `nodes`/`edges`/`direction` plus the dummy-node/ordering state produced internally by
`computeLayout`'s new steps, and returns one Edge Route (see `data-model.md`) per `DiagramEdge`,
keyed by `edge.id`. `diagramGeometry.ts`'s existing `computeEdgeSegments`/`computeEdgeRoutes`
consume this per-edge point list for multi-layer edges instead of calling
`computeStemDetour`/`computeSafeJogY`; adjacent-layer edges keep using the existing direct
bus/elbow computation unchanged. Both existing renderer entry points (`computeEdgeSegments` for
HTML/SVG, `computeEdgeRoutes` for draw.io) keep their existing external signatures and output
shapes (`RenderedSegment[]`, `EdgeRoute[]` respectively, as already defined in
`diagramGeometry.ts`) — only what feeds their multi-layer-edge branch changes.

## Invariants any implementation MUST preserve

- Zero VS Code API imports anywhere in `src/uml/` (guarded today by convention and by
  `noExternalDependency.test.ts`'s network/AI-client check; this feature adds no network/AI
  surface so that test's existing assertions keep passing unmodified).
- No new runtime dependency (per CLAUDE.md: "No new runtime dependencies without documented
  rationale and explicit approval" — `research.md` §1 documents why a third-party layout library
  was rejected).
- Deterministic output: the same `nodes`/`edges`/`direction` input MUST produce byte-identical
  layout output across repeated calls (spec FR-009), matching the existing determinism guarantee
  `026`'s spec SC-003 already established for this module.
