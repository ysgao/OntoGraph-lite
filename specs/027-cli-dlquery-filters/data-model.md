# Data Model: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

No persistent storage is involved. The entities below are in-memory shapes that flow between the
CLI process, the bridge socket protocol, and the extension host for a single `dl-query`
invocation.

## DlQueryRequest (CLI-internal, not sent verbatim over the bridge)

| Field | Type | Notes |
|---|---|---|
| `expression` | `string` | The Manchester Syntax class expression, unchanged from today |
| `queryTypes` | `DLQueryType[]` | Parsed/validated from `--types`; defaults to `['subClasses']` when `--types` is omitted (FR-006) |
| `labelFilter` | `string \| undefined` | From `--filter`; applied client-side only — never sent to the bridge (Decision 4) |

Only `expression` and `queryTypes` cross the bridge, as `BridgeRequest.params`. `labelFilter` is
consumed entirely inside the CLI process after the bridge response returns.

## DLQueryType (existing, reused verbatim — `src/views/DLQueryMessages.ts`)

```ts
type DLQueryType =
  | 'directSuperClasses' | 'superClasses' | 'equivalentClasses'
  | 'directSubClasses'   | 'subClasses'   | 'instances';
```

No changes to this type. `DL_QUERY_TYPE_LABELS` (same file) is reused as the canonical list of
valid names for CLI-side validation (FR-007) — no second list is introduced.

## ApiDLQueryResult (`src/api.ts` — extended)

Previously a fixed shape with 4 always-present array fields. Becomes a partial record: only keys
for categories the caller actually requested are present.

```ts
interface ApiDLQueryResult {
  expression: string;
  directSuperClasses?: ClassRef[];
  superClasses?:       ClassRef[];
  equivalentClasses?:  ClassRef[];
  directSubClasses?:   ClassRef[];
  subClasses?:         ClassRef[];
  instances?:          IndividualRef[];
}
```

| Field | Present when | Notes |
|---|---|---|
| `expression` | always | echoes the query expression, unchanged |
| `directSuperClasses` | requested via `--types` | list of `ClassRef` |
| `superClasses` | requested via `--types` | list of `ClassRef` (all ancestors) |
| `equivalentClasses` | requested via `--types` | list of `ClassRef` |
| `directSubClasses` | requested via `--types` | list of `ClassRef` |
| `subClasses` | requested via `--types`, or by default | list of `ClassRef` (all descendants) |
| `instances` | requested via `--types` | list of `IndividualRef` |

`ClassRef`/`IndividualRef` (`{ iri: string; label: string | null }`) are unchanged.

**Validation rule**: after label filtering, an entity is retained only if its `label` (when
non-null) or its `iri` contains the filter text, case-insensitively (Decision 5). A category with
zero surviving entities after filtering is still present as an empty array (FR-009) — this is
distinct from a category that was never requested, which is absent from the object entirely
(Decision 6).

## OntoGraphApi.dlQuery signature (`src/api.ts` — extended)

```ts
dlQuery(expression: string, queryTypes: DLQueryType[]): Promise<ApiDLQueryResult>;
```

`queryTypes` is a required parameter (the CLI always resolves and passes an explicit list — either
user-specified or the `['subClasses']` default — before calling the bridge; there is no implicit
default at this layer).

## BridgeRequest params for `method: 'dlQuery'` (`cli/src/bridge/bridgeClient.ts` — no type change, richer contents)

```json
{ "expression": "<manchester-expression>", "queryTypes": ["subClasses", "instances"] }
```

`params` was already an untyped `Record<string, unknown>` bag, so no interface change is needed
there — only what `BridgeServer.dispatch()` reads out of it (`src/bridge/BridgeServer.ts`) and
forwards to `api.dlQuery(...)`.

## ClassificationState (existing — `src/model/OntologyModel.ts`, consumed not changed)

| Field | Type | Notes |
|---|---|---|
| `isClassified` | `boolean` | Set `true` by `classifyOntology.ts` after a successful classify |
| `classificationNeedsUpdate` | `boolean` | Set `true` when the ontology changes after being classified |

New pure predicate consuming these (no new fields):

```ts
function needsClassificationBeforeQuery(model: OntologyModel): boolean {
  return !model.isClassified || model.classificationNeedsUpdate;
}
```
