# Contract: standalone CLI package commands

Package name (proposed, confirm at implementation time): `@ysgao/ontograph-cli-standalone`.
Binary name: `ontograph` (same as the minimal package — see spec Assumptions: the two packages are
alternative distributions a user chooses between, not designed to be installed together).

## Shared (non-reasoning) commands

`parse <file>`, `search <file> <query>`, `validate <file>`, `convert <file> --to <format>`,
`stats <file>`, `entity-info <file> <iri>` — byte-for-byte identical invocation/output contract to
the minimal package's own commands (`cli/README.md`), since both are registered via the same
`registerCoreCommands()` (see `data-model.md`).

## `classify <file>`

```
ontograph classify <file> [--reasoner <hermit|elk|auto>] [--timeout <ms>]
```

- `<file>` (required, positional): path to a local ontology file.
- `--reasoner` (optional): reasoner engine selection. Default when omitted: `elk` — a deliberate,
  explicit CLI-level default (not `auto`), chosen for predictable behavior in scripts/CI; `auto`
  remains available as an explicit choice for callers who want the minimal CLI's own
  auto-selects-by-size behavior instead.
- `--timeout` (existing, global): operation timeout in milliseconds.

Success response: identical shape to the minimal CLI's `classify` result
(`ClassificationResult` — `consistent`, `incoherentClasses`, `hierarchy`, `equivalentClasses`).

## `check-consistency <file>`

```
ontograph check-consistency <file> [--timeout <ms>]
```

Success response: identical shape to the minimal CLI's `check-consistency` result
(`ConsistencyResult` — `consistent`, `explanation?`).

## `dl-query <file> <expression>`

```
ontograph dl-query <file> <expression> [--types <list>] [--filter <substring>] [--timeout <ms>]
```

Identical `--types`/`--filter` contract to feature 027's minimal-CLI `dl-query` (see
`specs/027-cli-dlquery-filters/contracts/cli-dl-query-command.md`) — same six category names, same
`subClasses`-only default, same case-insensitive label/IRI filter, same partial-keys result shape.

## Error responses (new codes, additive to the existing envelope)

| Condition | `errorCode` | Exit code |
|---|---|---|
| Ontology file not found | `FILE_NOT_FOUND` (existing) | 1 |
| Ontology file fails to parse | `PARSE_ERROR` (existing) | 2 |
| Invalid `--types` value | `INVALID_ARGS` (existing) | 4 |
| Bundled runtime fails to start / is corrupted | `RUNTIME_UNAVAILABLE` (new) | 13 |
| Current platform has no bundled runtime | `PLATFORM_UNSUPPORTED` (new) | 14 |
| Reasoner reports an error for a given request (e.g. malformed DL expression) | `BRIDGE_ERROR` (existing, reused — same meaning as the minimal CLI's use) | 12 |

`RUNTIME_UNAVAILABLE`/`PLATFORM_UNSUPPORTED` have no equivalent in the minimal CLI (spec FR-002
only requires reasoning-*result* shape parity on success, not identical error taxonomies for
failure modes that are unique to bundling a runtime).

## Non-goals for this contract

- No VS-Code-attached mode of any kind — every command in this package operates only against a
  local file with the bundled runtime.
- No new bridge socket protocol — this package never talks to a running VS Code extension.
