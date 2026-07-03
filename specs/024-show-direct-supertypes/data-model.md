# Data Model: Show Direct Supertypes in Graph View

## Entities

### GraphEdge (extended)
**Location**: `src/views/GraphViewMessages.ts` + `webview-src/graph/GraphViewApp.ts` (mirrored)

Extended with one new discriminant value in the `type` union:

| Field | Type (before) | Type (after) |
|-------|--------------|-------------|
| `type` | `'subClassOf' \| 'equivalentTo' \| 'disjointWith' \| 'subPropertyOf' \| 'domain' \| 'range' \| 'type' \| 'inverseOf' \| 'inferred'` | + `\| 'directSupertype'` |

All other fields (`id`, `source`, `target`, `label`, `isInferred`) are unchanged.

### directSupertype Edge Convention
- `source` = IRI of the focused (child) entity
- `target` = IRI of the direct superclass (parent entity)
- `id` = `${focusIri}|sub|${sup}` — matches the existing `subClassOf` id convention so `addEdge` deduplication prevents a redundant `subClassOf` edge from the post-BFS sweep
- `type` = `'directSupertype'`
- `label` / `isInferred` = absent / false

## State / Data Flow

```
OWLClass.superClassIris         ← source of truth (model, extension host)
        │
        │  pre-BFS pass (buildGraphData)
        ▼
directSupertype edges + nodes   ← added to edgeMap / nodeIris BEFORE main BFS
        │
        │  postMessage('updateGraph')
        ▼
GraphViewApp.ts                 ← receives nodes[] + edges[]
        │
        │  cytoscape elements
        ▼
edge[type="directSupertype"]    ← styled purple, arrow at target (parent)
```

## Validation Rules
- Pre-pass runs only when `focusIri` is set and resolves to a class in the model.
- `owl:Thing` (`http://www.w3.org/2002/07/owl#Thing`) is NOT filtered from the pre-pass; it is shown if present in `superClassIris`.
- Supertype nodes added by the pre-pass are NOT added to the BFS `frontier`, so they are not traversed further.
- `nodeIris.size < MAX_NODES` guard applies to supertype nodes the same as all other nodes.
