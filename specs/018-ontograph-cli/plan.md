# Implementation Plan: OntoGraph CLI for AI Tools

**Branch**: `018-ontograph-cli` | **Date**: 2026-06-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-ontograph-cli/spec.md`

## Summary

Add a standalone `cli/` package that exposes OntoGraph ontology operations as a JSON-emitting command-line tool. Core operations (parse, search, validate, convert) run directly by importing existing pure-TypeScript code from `src/`. Extension-dependent operations (classify, check-consistency, dl-query) route via a new `BridgeServer` that the extension starts on `activate()` and advertises via a lock file. The CLI is published separately as `ontograph-cli`; it is excluded from the VSIX package.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js 18+ (LTS)

**Primary Dependencies** (CLI package only, not bundled into VSIX):
- `commander` — CLI argument parsing (zero transitive deps)
- Shared source: `../src/parser/`, `../src/model/`, `../src/serializer/` (imported via tsconfig path aliases)

**Storage**: Lock file `~/.ontograph-lite/bridge.json` (IPC socket path discovery); Unix socket `/tmp/ontograph-lite-{pid}.sock` or Windows named pipe `\\.\pipe\ontograph-lite`

**Testing**: Vitest (existing); CLI unit tests in `cli/src/**/*.test.ts`, integration tests in `cli/tests/`

**Target Platform**: Node.js 18+ on macOS, Linux, Windows

**Project Type**: CLI tool (separate package within pnpm workspace)

**Performance Goals**:
- Core commands: <5 seconds per operation on files up to `pizza.owl` size (163 KB)
- Bridge timeout: 30 seconds default for reasoning operations
- Bridge unavailable detection: <2 seconds

**Constraints**:
- CLI MUST NOT increase VSIX package size
- CLI MUST NOT import `vscode` module
- Bridge server MUST NOT block the extension host thread
- Lock file and socket MUST be cleaned up on extension `deactivate()`

**Scale/Scope**: Ontologies up to SNOMED CT scale (~350k classes) for bridge ops; BFO/pizza scale for core ops

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Decoupled UI Core | ✅ Pass | CLI is not a frontend app; it is a separate Node.js package. Not subject to `apps/` directory rule. |
| II. IPC-Only Communication | ✅ Pass | CLI-to-extension bridge uses a local IPC socket (Unix domain socket / Windows named pipe). CLI does not make direct calls to external terminology APIs. Bridge is analogous to the existing `postMessage` IPC pattern. |
| III. Webview Path Safety | ✅ N/A | CLI has no webview or browser context. |
| IV. Test-First Integration | ⚠️ Requires action | Bridge contract is defined in `contracts/cli-commands.md` and `data-model.md` (this plan phase). Implementation MUST write contract tests before `BridgeServer.ts` or `bridgeClient.ts` are coded. |

**Post-design re-check**: All gates pass. Principle IV satisfied by defining contracts in Phase 1 before any implementation.

## Project Structure

### Documentation (this feature)

```text
specs/018-ontograph-cli/
├── plan.md              ← this file
├── research.md          ← Phase 0 decisions
├── data-model.md        ← JSON schemas for all CLI outputs
├── contracts/
│   └── cli-commands.md  ← CLI command interface contract
├── quickstart.md        ← Usage guide
└── tasks.md             ← Phase 2 output (/speckit-tasks — NOT yet created)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml            ← NEW: declares cli/ as workspace package

cli/                           ← NEW: standalone CLI package (not in VSIX)
├── package.json               ← name: ontograph-cli, bin: {ontograph: dist/main.js}
├── tsconfig.json              ← extends ../tsconfig.json, adds @core alias, excludes vscode
├── esbuild.mjs                ← CLI bundler → dist/main.js
├── src/
│   ├── main.ts                ← entry point (process.argv → commander)
│   ├── output.ts              ← CliResponse envelope, writeResult(), writeError()
│   ├── commands/
│   │   ├── core/
│   │   │   ├── parseCommand.ts
│   │   │   ├── searchCommand.ts
│   │   │   ├── validateCommand.ts
│   │   │   └── convertCommand.ts
│   │   └── bridge/
│   │       ├── classifyCommand.ts
│   │       ├── consistencyCommand.ts
│   │       └── dlQueryCommand.ts
│   └── bridge/
│       ├── bridgeClient.ts    ← reads lock file, connects via net.Socket (IPC), sends NDJSON
│       └── lockFile.ts        ← lock file path resolution (OS-aware); stale PID detection
└── tests/
    ├── core/                  ← unit tests for core commands
    ├── bridge/                ← contract tests for bridge protocol
    └── integration/           ← end-to-end tests against real OWL files

src/
├── api.ts                     ← NEW: OntoGraphApi interface + activate() return type
├── bridge/                    ← NEW: extension-side bridge server
│   └── BridgeServer.ts        ← IPC socket server; receives OntoGraphApi, routes socket requests to it
└── ... (existing unchanged)

.vscodeignore                  ← MODIFIED: add cli/ exclusion
package.json                   ← MODIFIED: package script uses --no-dependencies
```

**Structure Decision**: Single workspace with CLI as a sibling package at `cli/`. The extension stays at root. No `packages/` restructure needed — too disruptive for a working extension with published VSIXes.

## Implementation Phases

### Phase 1: Workspace & Scaffold (prerequisite)

1. [ ] Add `pnpm-workspace.yaml` (packages: `['.', 'cli']`)
2. [ ] Migrate extension from npm to pnpm (`pnpm install` from root)
3. [ ] Create `cli/` with `package.json`, `tsconfig.json`, `esbuild.mjs`
4. [ ] Verify VSIX packaging with `--no-dependencies`; add `cli/` to `.vscodeignore`

### Phase 2: Core Commands (no bridge, TDD)

5. [ ] Implement `output.ts` (CliResponse envelope, writeResult, writeError)
6. [ ] Implement `main.ts` (commander setup, all commands registered)
7. [ ] TDD: `parseCommand.ts` — test + implement; calls `ParserRegistry`
8. [ ] TDD: `searchCommand.ts` — test + implement; calls `OntologyIndex`
9. [ ] TDD: `validateCommand.ts` — test + implement; calls parser, checks for errors
10. [ ] TDD: `convertCommand.ts` — test + implement; calls parser + serializer

### Phase 3: Bridge Server (contract test first)

11. [ ] Define `OntoGraphApi` interface in `src/api.ts`; update `activate()` return type
12. [ ] TDD: `bridgeClient.ts` contract test against mock IPC socket server
13. [ ] Implement `BridgeServer.ts` in `src/bridge/` (IPC socket server, lock file write/delete); accepts `OntoGraphApi` instance
14. [ ] Wire `BridgeServer` into `activate()` / `deactivate()` in `src/extension.ts`
15. [ ] Implement `bridgeClient.ts` + `lockFile.ts` (stale PID detection, timeout)
16. [ ] Implement `classifyCommand.ts`, `consistencyCommand.ts`, `dlQueryCommand.ts`

### Phase 4: Integration & Polish

17. [ ] Integration tests against `test-ontologies/animals.omn`, `bfo-core.ofn`, `pizza.owl`
18. [ ] `--help` output test (all commands documented)
19. [ ] Verify VSIX artifact excludes `cli/` (size check vs baseline)
20. [ ] Update `CLAUDE.md` and `AGENTS.md` with CLI build commands and architecture note

## Complexity Tracking

No constitution violations. No complexity justification required.
