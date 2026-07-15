# Contract: `ontograph dl-query` CLI command

## Invocation

```
ontograph dl-query <expression> [--types <list>] [--filter <substring>] [--timeout <ms>]
```

- `<expression>` (required, positional): a Manchester Syntax class expression — unchanged from today.
- `--types <list>` (optional): comma-separated list of one or more of:
  `directSuperClasses`, `superClasses`, `equivalentClasses`, `directSubClasses`, `subClasses`, `instances`.
  Duplicates are deduplicated silently. Default when omitted: `subClasses`.
- `--filter <substring>` (optional): case-insensitive substring matched against each entity's
  label OR IRI. Default when omitted: no filtering (all entities in the selected categories are
  returned). Empty string is equivalent to omitting the flag.
- `--timeout <ms>` (existing, global, unchanged): bridge round-trip timeout.

## Success response (`writeResult`)

```json
{
  "success": true,
  "command": "dl-query",
  "durationMs": 842,
  "data": {
    "expression": "Kidney",
    "subClasses": [
      { "iri": "http://example.org#LeftKidney", "label": "Left kidney" }
    ]
  }
}
```

- `data` contains only the keys for categories that were requested (explicitly, or via the
  `subClasses` default). A requested category with no matches (including after `--filter`
  narrowing) is present as an empty array — it is never omitted once requested.
- `expression` always echoes the input expression.

## Error responses (`writeError` + exit code)

| Condition | `errorCode` | Exit code |
|---|---|---|
| No ontology loaded in the extension | `BRIDGE_ERROR` (verified: `BridgeServer`'s socket-level catch-all always reports this code for any thrown error, including "No ontology loaded" — there is no dedicated `NOT_FOUND` path for bridge commands) | 12 |
| Unrecognized value in `--types` | `INVALID_ARGS` | 4 |
| Ontology fails classification (e.g. inconsistent) — query is NOT executed | `BRIDGE_ERROR` (same code `ontograph classify` itself already reports for this case — no new error code is introduced) | 12 |
| Extension not running / stale lock file | `BRIDGE_UNAVAILABLE` (existing) | 10 |
| Bridge round-trip exceeds `--timeout` | `BRIDGE_TIMEOUT` (existing) | 11 |

`--types`/`--filter` validation (unrecognized category name) happens client-side, before any
bridge call, so an invalid `--types` value never reaches the extension host and never triggers
classification or query work (SC-005).

## Examples

```bash
# Default: only subClasses, ontology classified automatically if needed
ontograph dl-query "Kidney"

# Multiple categories
ontograph dl-query "Kidney" --types directSuperClasses,equivalentClasses

# Category + label filter
ontograph dl-query "Body structure" --types subClasses --filter "liver"

# Everything
ontograph dl-query "Body structure" --types directSuperClasses,superClasses,equivalentClasses,directSubClasses,subClasses,instances
```

## Backward compatibility note

This is an intentional breaking change from the previous fixed four-category output
(`superClasses`, `equivalentClasses`, `subClasses`, `instances` always present). Existing scripts
that relied on that shape without passing `--types` will now see only `subClasses` by default —
per the resolved specification (spec.md FR-006/FR-011, Assumptions).
