# Implementation Plan: CLI DL Query — Auto-Classify, Result-Type Selection & Label Filtering

**Branch**: `027-cli-dlquery-filters` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-cli-dlquery-filters/spec.md`

## Summary

`ontograph dl-query` currently sends only a class expression to the running extension and
always gets back a fixed four-category result (`superClasses`, `equivalentClasses`,
`subClasses`, `instances`) with no classification guarantee. This feature extends the existing,
already-working extension-host/reasoner machinery (`ReasonerBridge.dlQuery`'s `queryTypes`
param, already supporting all six categories end-to-end at the Java layer) so the CLI can (1)
trust that the ontology has been classified before the query runs, classifying automatically
only when needed; (2) request any subset of the six result categories (direct/all superclasses,
equivalent classes, direct/all subclasses, instances), defaulting to `subClasses` alone when
`--types` is omitted; (3) narrow every returned category by a case-insensitive label/IRI
substring filter, applied client-side in the CLI process after the bridge call returns. No new
bridge socket RPC method is introduced — the existing `dlQuery` method's params/result grow
richer, and classify-first orchestration is absorbed into its existing extension-host handler.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js — both the CLI process (`cli/`) and the
VS Code extension host (`src/`)

**Primary Dependencies**: `commander` (existing CLI framework, `cli/src/main.ts`); the existing
`net`-socket JSON-RPC bridge (`src/bridge/BridgeServer.ts` / `cli/src/bridge/bridgeClient.ts`);
no new runtime dependencies

**Storage**: N/A — in-memory `OntologyModel` on the extension host; no persistence

**Testing**: Vitest — `npm test` (root, covers `src/`) and `pnpm --filter ontograph-cli test`
(covers `cli/`)

**Target Platform**: Node.js CLI (macOS/Linux/Windows) communicating with a running VS Code
extension host over a local Unix socket (Windows: named pipe)

**Project Type**: Single monorepo touching two existing packages — the CLI (`cli/`) and the
extension host (`src/`) — no new package/service is created

**Performance Goals**: A `--types` selection narrower than all six categories MUST NOT cause the
reasoner to compute categories the caller didn't ask for (the Java layer already supports this
per-category computation — this feature only needs to plumb `queryTypes` through); repeated
`dl-query` invocations against an ontology that is already classified and unchanged MUST NOT
re-run classification

**Constraints**: No new bridge socket RPC method — reuse the existing `dlQuery` method with
richer `params`/result shape; the CLI's JSON output envelope (`writeResult`/`writeError`/exit
codes) is unchanged; `ontograph dl-query "<expr>"` with no additional flags remains a valid
invocation (now defaulting `--types` to `subClasses` alone, an intentional breaking change to the
default result shape per the resolved spec clarification)

**Scale/Scope**: Same ontology scale as the rest of the project — small hand-built fixtures
(`animals.omn`) through SNOMED-scale `anatomy.owl` (~75k classes)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Decoupled UI Core** — N/A. No frontend/webview UI is added or changed by this feature; it
  is CLI- and extension-host-only.
- **II. IPC-Only Communication (NON-NEGOTIABLE)** — PASS. The CLI continues to communicate with
  the ontology/reasoner exclusively through the existing `BridgeServer`/`bridgeClient` socket
  protocol. No direct network or reasoner-process calls are introduced from the CLI process; the
  classify-first orchestration and category computation stay entirely on the extension-host side
  of that boundary.
- **III. Webview Path Safety** — N/A. No webview assets are touched (the one file this feature
  refactors under `webview-src/dl-query/` — extracting a shared label-filter predicate — is a
  pure-logic change with no effect on asset loading/paths).
- **IV. Test-First Integration** — PASS (planned). Every new behavior is decomposed into a small,
  pure, directly-unit-testable function *before* it is wired into `extension.ts`/`dlQueryCommand.ts`
  (a classification-needed predicate, query-type validation, and a shared label-filter predicate),
  mirroring this repo's established pattern of extracting VS-Code-API-free helpers for testability
  (e.g. `src/uml/`'s zero-VS-Code-import design). Tests for each helper are written first and
  confirmed failing before implementation, per `conductor/workflow.md`.

*Re-checked after Phase 1 design: no new violations introduced by the data model or contracts
below — still PASS/N/A across all four principles. No Complexity Tracking entries required.*

## Project Structure

### Documentation (this feature)

```text
specs/027-cli-dlquery-filters/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/             # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
cli/
├── src/
│   ├── main.ts                          # `dl-query` command gains --types/--filter options
│   ├── commands/bridge/
│   │   ├── dlQueryCommand.ts            # applies --filter client-side; calls dlQueryTypes.ts to validate --types
│   │   └── dlQueryTypes.ts              # NEW — parseQueryTypes(): parses/validates --types against DLQueryType
│   └── bridge/
│       └── bridgeClient.ts              # unchanged — params bag is already untyped Record<string, unknown>
└── tests/bridge/
    ├── dlQuery.test.ts                  # extended with --types/--filter/invalid-category/no-op-filter cases
    └── dlQueryTypes.test.ts             # NEW — parseQueryTypes() unit tests

src/
├── api.ts                                # ApiDLQueryResult becomes a partial per-category map;
│                                          # OntoGraphApi.dlQuery(expression, queryTypes) signature grows
├── extension.ts                          # api.dlQuery(): wires dlQueryOrchestration.ts + queryTypes forwarding
├── reasoner/
│   └── dlQueryOrchestration.ts           # NEW — classify-first orchestration, decoupled from vscode state
├── bridge/
│   └── BridgeServer.ts                   # dispatch('dlQuery'): forwards params.queryTypes through
├── model/
│   └── OntologyModel.ts                  # new pure predicate: needsClassificationBeforeQuery(model)
├── utils/
│   └── dlQueryLabelFilter.ts             # NEW — shared label/IRI substring predicate (CLI + webview)
└── views/
    └── DLQueryMessages.ts                # unchanged — DLQueryType/DL_QUERY_TYPE_LABELS reused for
                                           # CLI category-name validation (single source of truth)

webview-src/dl-query/
└── DLQueryFilters.ts                     # refactored to call the new shared predicate — no
                                           # behavior change, removes duplicated matching logic
```

**Structure Decision**: Single project. This feature extends two already-existing packages in
this monorepo — the CLI (`cli/`) and the VS Code extension host (`src/`) — reusing established
types (`DLQueryType`, `ClassRef`/`IndividualRef`) and the existing socket-bridge protocol. No new
package, service, or bridge RPC method is introduced.

## Complexity Tracking

*No entries — Constitution Check reports no violations to justify.*
