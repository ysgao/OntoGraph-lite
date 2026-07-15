# Quickstart: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

Manual end-to-end verification steps once the feature is implemented. These map directly onto the
spec's acceptance scenarios and success criteria.

## Setup

1. `npm run build` (extension) and `pnpm --filter ontograph-cli build` (CLI), then launch the
   Extension Development Host (F5 in VS Code) with OntoGraph active — the CLI talks to it over the
   bridge socket, same as `ontograph classify`/`check-consistency` today.
2. Open `test-ontologies/animals.omn` for a quick check, or `anatomy.owl` (SNOMED-scale, ~75k
   classes, not committed to the repo) for the large-ontology checks.
3. From a terminal: `node cli/dist/main.js dl-query --help` and confirm `--types`/`--filter` appear
   alongside the existing `--timeout`.

## Story 1 — Auto-classify before querying

1. With a freshly opened, never-classified ontology, run:
   `ontograph dl-query "Dog"` (or an equivalent expression valid in the loaded ontology).
   Confirm the command succeeds without a separate `ontograph classify` call, and that the
   response reflects the classified hierarchy (e.g. inferred subclass relations are present).
2. Run the exact same command again immediately. Confirm it completes noticeably faster the
   second time (no redundant reclassification — spec SC-004) while still returning correct
   results.
3. Load or construct a logically inconsistent ontology and run `dl-query` against it. Confirm the
   command reports a clear classification failure and the query does not run (no `data.subClasses`
   etc. in the error response).

## Story 2 — Result category selection

1. `ontograph dl-query "Kidney"` with no `--types` — confirm the JSON response's `data` contains
   only a `subClasses` key (the documented default), no other category.
2. `ontograph dl-query "Kidney" --types instances` — confirm `data` contains only `instances`.
3. `ontograph dl-query "Kidney" --types directSuperClasses,equivalentClasses` — confirm `data`
   contains exactly those two keys.
4. `ontograph dl-query "Kidney" --types bogusCategory` — confirm the command fails immediately
   with an `INVALID_ARGS`-style error listing the six valid category names, and that no
   classification or query work runs (check timing/logs — should fail near-instantly).

## Story 3 — Label filtering

1. Against an ontology/expression whose `subClasses` category has several entries, run
   `ontograph dl-query "<expr>" --filter "<substring known to match some but not all>"`. Confirm
   only matching entities (by label or IRI, case-insensitive) remain.
2. Run the same command with a filter that matches nothing. Confirm the category is present but
   empty (`[]`), not an error.
3. Combine `--types` and `--filter` together and confirm filtering only affects the selected
   category/categories.

## Edge cases to spot-check

- No ontology loaded in the extension: confirm the existing "not available" error/exit code,
  unchanged from today.
- Extension not running (stale/missing lock file): confirm the existing `BRIDGE_UNAVAILABLE`
  behavior, unchanged.
- `--types` with duplicate names (e.g. `subClasses,subClasses`): confirm no error, `subClasses`
  appears once.
- `--filter ""` (empty string) and omitting `--filter` entirely: confirm identical, unfiltered
  output.
- Large ontology (`anatomy.owl`), a narrow `--types` selection (e.g. just `instances`): confirm
  the command completes quickly and the payload is small — not the full six-category shape.
