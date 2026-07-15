# Contract: Extension ↔ UML Diagram Webview messages

Mirrors the existing `src/views/GraphViewMessages.ts` contract shape (`ExtToWebview` /
`WebviewToExt` typed unions), so the two webviews stay consistent for anyone reading both. This is
the interface boundary between the extension host and the new webview bundle — the only channel
either side may use, per Constitution Principle II (IPC-only via `postMessage`).

## Extension → Webview

### `updateDiagram`
Sent after the extension host builds diagram data (both on initial "Generate UML Diagram" and
after a `requestDepthChange` round-trip).

| Field | Type | Notes |
|---|---|---|
| `type` | `'updateDiagram'` | |
| `nodes` | `DiagramNode[]` | See `data-model.md`; each node carries `x`/`y` from `src/uml/layout.ts`'s tidy-tree layout — the webview renders these as fixed (Cytoscape `preset` layout) positions rather than auto-laying-out, since a UML diagram reads best as a deterministic top-down tree |
| `edges` | `DiagramEdge[]` | See `data-model.md` |
| `excludedRelations` | `ExcludedRelation[]` | See `data-model.md`; empty array if none |
| `focusIri` | `string` | The root/focus entity IRI |
| `depth` | `number` | The depth the response was generated at (echoes the request so the webview can keep its slider in sync) |
| `nodeCapReached` | `boolean` | True if traversal stopped early due to the node cap (drives a visible banner, per FR-007) |

### `selectNode`
Optional — parity with `GraphViewMessages.ts`'s `SelectNodeMessage`, for future click-to-navigate
support; not required for this feature's v1 acceptance scenarios but kept in the same shape so the
two contracts don't diverge for no reason.

| Field | Type | Notes |
|---|---|---|
| `type` | `'selectNode'` | |
| `iri` | `string` | |

## Webview → Extension

### `ready`
Sent once on webview load, before the first diagram is requested (parity with `ReadyMessage`).

| Field | Type |
|---|---|
| `type` | `'ready'` |

### `requestDiagram`
Sent on initial load (after `ready`) and can be resent by the webview if it needs a full rebuild.

| Field | Type | Notes |
|---|---|---|
| `type` | `'requestDiagram'` | |
| `iri` | `string` | Focus entity |
| `depth` | `number` | Current depth-control value |

### `requestDepthChange`
Sent whenever the user moves the depth control (spec User Story 2). The extension host re-runs
extraction/layout at the new depth and responds with `updateDiagram` — no panel close/reopen.

| Field | Type | Notes |
|---|---|---|
| `type` | `'requestDepthChange'` | |
| `iri` | `string` | Focus entity (unchanged) |
| `depth` | `number` | New depth value |

### `nodeClicked`
Parity with `NodeClickedMessage`; reserved for future navigation, not required for v1 acceptance.

| Field | Type |
|---|---|
| `type` | `'nodeClicked'` |
| `iri` | `string` |

## Type union summary

```ts
export type ExtToWebview = UpdateDiagramMessage | SelectNodeMessage;
export type WebviewToExt  = ReadyMessage | RequestDiagramMessage
                           | RequestDepthChangeMessage | NodeClickedMessage;
```

## Contract test expectations

- Every `updateDiagram` message MUST have `edges` where each element's `kind` is exactly
  `'composition'` or `'generalization'` — never `undefined` or a third value (spec SC-002).
- `nodeCapReached: true` MUST be accompanied by at least one node with `hasHiddenRelations: true`,
  or the cap indicator has nothing concrete to point at.
- Sending the same `requestDiagram { iri, depth }` twice against unchanged ontology content MUST
  yield byte-for-byte identical `nodes`/`edges`/`excludedRelations` arrays (spec SC-003,
  determinism requirement) — this is the property the contract test asserts, not just "some
  diagram was returned."
