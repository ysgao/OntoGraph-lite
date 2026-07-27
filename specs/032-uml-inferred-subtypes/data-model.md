# Phase 1 Data Model: Include Inferred Subtypes in UML Diagram Scope

This feature modifies existing entities from `specs/026-generate-uml-diagram/data-model.md`; it
introduces no new persisted data. Rewritten after the second implementation refinement, which
replaced the original "merge inferred into the same diagram" design with two completely SEPARATE
views (Stated/Inferred) — see `spec.md`'s Assumptions for the full history. Only the deltas are
documented below.

## Diagram Edge (modified)

One rendered connector between two Diagram Nodes (`src/uml/diagramModel.ts`'s `DiagramEdge`).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unchanged |
| `parentIri` | `string` | Unchanged |
| `childIri` | `string` | Unchanged |
| `kind` | `'composition' \| 'generalization'` | Unchanged for the Stated view. In the Inferred view, ALWAYS `'generalization'` — that view has no composition/part-of concept at all (spec FR-012) |
| `propertyIri` | `string \| undefined` | Unchanged |
| `isInferred` | `boolean \| undefined` | **New**, Inferred-view-only in practice (the Stated view's `extractUmlDiagram` never sets it — reverted back to its pre-feature shape). True only when this edge's `(parentIri, childIri)` pair has NO supporting asserted axiom; an edge that's both reasoner-confirmed AND directly asserted is falsy (asserted-priority, still meaningful signal even within the fully-reasoner-derived Inferred view — see spec Assumptions). Optional so every pre-existing `DiagramEdge` construction site and test fixture is unaffected. |

## Extraction functions (two separate entry points, `src/uml/partOfGraph.ts`)

| Function | Options | Notes |
|---|---|---|
| `extractUmlDiagram` (Stated) | `ExtractOptions { compositionProperties, maxNodes?, preferredLang? }` | **Reverted to its pre-feature shape** — no `includeInferred` option, no knowledge of `model.inferredSubClasses` at all. Anchor-hops to "Entire X" via the "All or part of" property, exactly as before this feature existed. |
| `extractInferredUmlDiagram` (Inferred, **new**) | `InferredExtractOptions { maxNodes?, preferredLang? }` | Entity scope built ENTIRELY from `model.inferredSubClasses` (gated on `model.isClassified`) — never reads asserted conjuncts for scope, only to flag whether a given edge is ALSO asserted (for the isInferred flag) and whether a node is lateralized (its own conjuncts). Root is `focusIri` as-is — no anchor-hop. No `compositionProperties` param — there is no composition concept in this view. |

## Extraction Result (`ExtractResult`, shared shape, `src/uml/partOfGraph.ts`)

| Field | Type | Notes |
|---|---|---|
| `nodes`, `edges`, `excludedRelations`, `nodeCapReached` | unchanged | `extractInferredUmlDiagram` always returns `excludedRelations: []` — there is no restriction-property evaluation step in a generalization-only view, so nothing is ever "excluded" in that sense. |
| `lateralizedIris` | `string[]` | Unchanged shape; computed identically by both functions (a node's own `Laterality some Left/Right` restriction). |
| `entireIris` | `string[] \| undefined` | **New.** Only populated by `extractInferredUmlDiagram` — IRIs of rendered (non-root) nodes whose label starts with "Entire " (spec FR-013). `undefined` for `extractUmlDiagram` (Stated view has no such concept — see the Non-goals section). |

## View Mode (new, `src/views/UmlDiagramMessages.ts`'s `ViewMode` type + `src/commands/generateUmlDiagram.ts` state)

Per-focus-session UI state, mirroring the existing lateralized-classes toggle's lifecycle exactly (spec FR-010) — but a two-value SWITCH, not an additive boolean.

| Field | Type | Notes |
|---|---|---|
| `ViewMode` | `'stated' \| 'inferred'` | Exported type, shared by the message contract and the extension host. |
| `currentViewMode` | `ViewMode` | Module-level state in `generateUmlDiagram.ts`; `'stated'` for a fresh focus session (new entity, or panel reopened/closed). Set by the `requestSetViewMode` webview message; read on every subsequent `extractAndLayout()` call, which branches to `extractUmlDiagram` or `extractInferredUmlDiagram` accordingly — never both. |

## Label stripping (new, `src/uml/partOfGraph.ts`)

| Function | Applies to | Notes |
|---|---|---|
| `stripEntirePrefix` (existing, unchanged) | Stated view only | Strips a leading "Entire " for display, substituting the anchor-resolved concept's natural name. |
| `stripStructureLabel` (**new**) | Inferred view only | Strips a leading "structure of " or trailing " structure" (case-insensitive), re-capitalizing what remains (spec FR-014) — e.g. "Kidney structure" / "Structure of kidney" → "Kidney". Independent of `stripEntirePrefix`; an "Entire X" label in the Inferred view is shown verbatim (unstripped) if ever revealed — there is no anchor-substitution concept in this view. |

## Relationships between entities

```
OntologyModel (existing)
   ├─ per-class Conjunct[] (asserted) ──────────────────┐
   │      used for SCOPE + anchor-hop                   │ used ONLY to flag isInferred/lateralized
   │      ▼                                              ▼
   │  extractUmlDiagram (Stated)              extractInferredUmlDiagram (Inferred)
   │      │                                              │
   │      │                                   inferredSubClasses: Map<parent, Set<child>>
   │      │                                   (gated on isClassified) ── used for SCOPE, exclusively
   │      ▼                                              ▼
   │  Diagram Node[] / Edge[]                  Diagram Node[] / Edge[] (kind always generalization,
   │  (unchanged from pre-feature)              isInferred set per-edge, entireIris computed)
   │
   └─ ViewMode switch (generateUmlDiagram.ts) selects exactly ONE of the two functions above per
      extractAndLayout() call — outputs are never merged.

Diagram Edge[] (Inferred view, edges with isInferred: true)
   └─ consumed by diagramGeometry.ts → RenderedSegment[] (isInferred on per-child stems only)
        └─ consumed by htmlRenderer.ts (dash pattern "3 3", distinct from existing far-edge "6 4")
   └─ consumed directly by drawioRenderer.ts (dashed=1;dashPattern=3 3; on the whole mxCell)
```

## Non-goals / explicitly unchanged

- **Composition Property Selection**, **Depth Setting**, **Excluded Relation** concepts (from
  `026`'s data-model.md) — apply to the Stated view exactly as before; irrelevant to the Inferred
  view by design (FR-012).
- **Node visual category** (root vs. non-root fill/stroke) — untouched in both views.
- **`extractUmlDiagram`'s "Entire X" anchor resolution** — completely unchanged; the Inferred view
  simply never invokes it (FR-011), rather than needing to "stay compatible" with it.
