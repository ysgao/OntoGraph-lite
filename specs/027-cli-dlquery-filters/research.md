# Phase 0 Research: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

No items in the spec's Technical Context were left as `NEEDS CLARIFICATION` — the one open
question from specification (default result category when `--types` is omitted) was resolved
directly with the user (`subClasses` alone). The research below instead resolves the *design*
decisions needed to implement the resolved spec against this codebase's existing architecture.

## Decision 1: Where classify-first orchestration lives

**Decision**: Implement the "ensure classified before querying" guarantee (FR-001/002/003)
entirely server-side, inside `OntoGraphApi.dlQuery()`'s implementation in `src/extension.ts`,
using a new pure predicate `needsClassificationBeforeQuery(model)` that reads the model's
existing `isClassified`/`classificationNeedsUpdate` flags. If classification is needed, the
handler runs the same logic `api.classify()` already uses before proceeding; if that fails
(inconsistent ontology, reasoner error), `dlQuery` returns an error and never calls
`reasonerBridge.dlQuery`.

**Rationale**: The bridge socket protocol (`BridgeRequest.method: 'classify' | 'checkConsistency'
| 'dlQuery'`) already has everything needed — no new RPC method has to be added. Doing this
server-side also makes the guarantee atomic from the CLI's point of view: a single `dl-query`
invocation either succeeds against a classified ontology or fails clearly, with no window where a
CLI process could crash between two separate round trips (an explicit `classify` call followed by
a `dlQuery` call) and leave the caller unsure what state the ontology is in.

**Alternatives considered**:
- *CLI calls `classify` itself before `dlQuery`* (mirroring `classifyCommand.ts` + `dlQueryCommand.ts`
  as two sequential bridge calls from the CLI process): rejected — doubles round-trip latency on
  every invocation and duplicates the "do I even need to classify" decision in a second place.
- *New dedicated `ensureClassified` bridge method*: rejected as unneeded protocol growth; the
  existing `dlQuery` handler is the one place that actually needs the guarantee.

## Decision 2: `--types` vocabulary reuses the existing `DLQueryType` union verbatim

**Decision**: The CLI's `--types` option accepts the same six camelCase names already defined in
`src/views/DLQueryMessages.ts`'s `DLQueryType` union (`directSuperClasses`, `superClasses`,
`equivalentClasses`, `directSubClasses`, `subClasses`, `instances`), comma-separated. Validity is
checked against `Object.keys(DL_QUERY_TYPE_LABELS)` — no new list of valid names is introduced.

**Rationale**: `DLQueryMessages.ts` has zero VS Code API imports, so it's safely importable from
the CLI via the existing `@core/*` → `../src/*` path alias (`cli/tsconfig.json`). Reusing it keeps
one source of truth for "what are the six valid category names" across the webview panel and the
CLI, rather than risking the two vocabularies drifting apart over time.

**Alternatives considered**: A separate kebab-case CLI vocabulary (`direct-superclasses`, etc.)
mapped internally to the camelCase names — rejected as an unnecessary translation layer for a
developer/scripting-facing tool whose JSON output already uses the camelCase names directly.

## Decision 3: The CLI's own default (`subClasses` alone) is independent of the webview's default

**Decision**: A new CLI-local constant (not `DEFAULT_QUERY_TYPES` from `DLQueryMessages.ts`, which
is `['directSuperClasses', 'directSubClasses', 'subClasses']` for the webview panel) defines the
CLI's default as `['subClasses']`, applied only when `--types` is omitted entirely.

**Rationale**: Per the user's explicit resolution during specification — the CLI and the webview
panel serve different audiences and don't need to share a default just because they share a
vocabulary.

**Alternatives considered**: Reusing `DEFAULT_QUERY_TYPES` — rejected per that same resolution.

## Decision 4: Label filtering happens entirely client-side in the CLI process

**Decision**: `--filter` is never sent to the bridge/extension host. The CLI command receives the
full (category-selected, but not label-filtered) result from `dlQuery`, then applies the label
filter locally before writing output.

**Rationale**: The filter is a pure substring match with no dependency on the reasoner or the
ontology model beyond the labels already present in the returned `ClassRef`/`IndividualRef`
entries. Keeping it out of the bridge protocol avoids growing that surface for logic that has
nothing to do with reasoning, and keeps `dlQuery`'s bridge contract reusable by any other consumer
that might want the unfiltered categorized result.

**Alternatives considered**: Passing `filter` as a bridge param and filtering server-side —
rejected; no benefit over client-side filtering here, and it would couple a display-only concern
into the reasoning-facing API.

## Decision 5: Extract the existing label/IRI match predicate into a shared, dependency-free module

**Decision**: The case-insensitive "label or IRI contains X" predicate already implemented inline
in `webview-src/dl-query/DLQueryFilters.ts` (lines 27-30) is extracted into a new, VS-Code-API-free
function in `src/utils/dlQueryLabelFilter.ts`. `DLQueryFilters.ts` is refactored to call it (no
behavior change); the CLI imports the same function via `@core/utils/dlQueryLabelFilter`.

**Rationale**: Matches this repo's established pattern of pulling reusable logic out of
webview-only modules specifically so a CLI (or any other non-webview consumer) can reuse it
without reimplementing it — the same rationale documented for `src/uml/`'s "zero VS Code API
imports so a future CLI command can reuse it" design. Avoids two independent implementations of
the same trivial matching rule silently drifting apart later.

**Alternatives considered**: Reimplementing the same substring-match logic independently inside
the CLI package — rejected; needlessly duplicates a few lines of logic that are trivial to share.

## Decision 6: Unrequested categories are omitted from the result, not returned empty

**Decision**: `ApiDLQueryResult`'s JSON shape becomes a partial record keyed by the requested
`DLQueryType` values only — a category the caller didn't ask for is absent from the object
entirely, not present with an empty array.

**Rationale**: Directly satisfies FR-005 ("categories not requested MUST NOT appear in the
result") and keeps payload size strictly proportional to what was requested (SC-002), which
matters most for large ontologies where an unwanted category could otherwise contain thousands of
entries even when empty-vs-present is the only difference.

**Alternatives considered**: Always including all six keys, with unrequested ones set to `[]` —
rejected; it would violate FR-005 verbatim and forces every caller to filter out keys it never
asked for.
