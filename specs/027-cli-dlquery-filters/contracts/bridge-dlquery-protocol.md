# Contract: bridge socket `dlQuery` method (extension host ↔ CLI)

No new bridge RPC method is added. `BridgeRequest.method: 'dlQuery'` (`cli/src/bridge/bridgeClient.ts`,
`src/bridge/BridgeServer.ts`) gains a required `queryTypes` field in `params`; its dispatch target
(`OntoGraphApi.dlQuery`, `src/api.ts`/`src/extension.ts`) gains classify-first orchestration and
per-category result filtering. `--filter` is never part of this protocol (see research.md Decision 4)
— it is applied entirely inside the CLI process after this response is received.

## Request (`params`)

```json
{ "expression": "Kidney", "queryTypes": ["subClasses", "instances"] }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `expression` | `string` | yes | unchanged from today |
| `queryTypes` | `DLQueryType[]` (non-empty) | yes | the CLI always resolves an explicit list (user-supplied or the CLI's own `['subClasses']` default) before sending — the bridge itself has no default |

## Response (`data`, on success)

Only keys for requested `queryTypes` are present — see `data-model.md`'s `ApiDLQueryResult`.

```json
{
  "expression": "Kidney",
  "subClasses": [{ "iri": "...", "label": "..." }],
  "instances": [{ "iri": "...", "label": "..." }]
}
```

## Server-side behavior contract (inside `OntoGraphApi.dlQuery`, `src/extension.ts`)

1. If no ontology is active, throw (surfaces as `BRIDGE_ERROR` — `BridgeServer`'s socket-level catch-all reports this code for any thrown error; verified, no dedicated `NOT_FOUND` path exists for bridge commands).
2. Evaluate `needsClassificationBeforeQuery(model)` (new pure predicate, `src/model/OntologyModel.ts`
   or `src/api.ts`):
   - `true` → run the same classification path `api.classify()` already uses. If it fails
     (inconsistent ontology, reasoner error), `dlQuery` rejects with that failure — `reasonerBridge.dlQuery`
     is never called (FR-003).
   - `false` (already classified, not stale) → skip straight to step 3 (FR-002 — no redundant
     reclassification).
3. Call `reasonerBridge.dlQuery(..., queryTypes)` — the Java layer already computes only the
   requested categories (no change needed at the Java/OWLAPI layer).
4. Map each requested category's IRIs to `{ iri, label }` refs (existing `toRef` helper,
   `src/extension.ts`) and return an object containing only the requested keys (Decision 6).

## Non-goals for this contract

- No `filter`/label-matching field is ever part of this protocol.
- No new `method` value is added to `BridgeRequest`/`BridgeServer.dispatch`'s switch.
- No change to `classify`/`checkConsistency` request or response shapes.
