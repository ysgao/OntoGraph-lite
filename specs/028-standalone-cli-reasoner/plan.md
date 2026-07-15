# Implementation Plan: Standalone CLI Reasoner (Bundled Runtime)

**Branch**: `028-standalone-cli-reasoner` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-standalone-cli-reasoner/spec.md`

## Summary

Today, `classify`/`check-consistency`/`dl-query` in `@ysgao/ontograph-cli` (the "minimal" CLI)
only work by relaying a request to a running VS Code extension over a local socket — the actual
reasoning happens in a Java process (`java-server/target/onto-reasoner-server.jar`) the extension
spawns. This feature adds a new, separate npm package (the "standalone" CLI) that bundles a
Java runtime and the same reasoner JAR, so its own `classify`/`check-consistency`/`dl-query`
commands reason directly against a local ontology file — no VS Code, no system Java. The minimal
package is untouched. To satisfy the resolved command-parity requirement (spec FR-012), the two
packages share their non-reasoning command implementations from one source rather than forking,
and the reasoner's core JSON-RPC client is extracted out of `ReasonerBridge.ts`'s VS Code-specific
UI code so both the extension and the standalone package can use it without duplication.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js ≥18 (both CLI packages); Java 21 (the
existing reasoner, unchanged) — a bundled Eclipse Temurin 21 JRE for the standalone package

**Primary Dependencies**: `commander` (existing CLI framework, reused as-is); Node's `child_process`/
`readline` (existing JSON-RPC-over-stdio transport, reused as-is); no new *runtime* dependency for
either published package — the new build-time dependency is a fetched/vendored JRE archive

**Storage**: N/A — no persistence; a local ontology file is read once per standalone invocation

**Testing**: Vitest, matching both `cli/`'s and the root `src/`'s existing conventions; the new
sibling package reuses the same tooling

**Target Platform**: The standalone package: macOS on Apple Silicon (arm64) only, this release
(spec FR-010). The minimal package: unchanged (any platform Node + a system Java can run on)

**Project Type**: Single monorepo gaining one new sibling package (`cli-standalone/`, alongside
the existing `cli/`, `src/`, `java-server/`) plus an extraction inside `src/reasoner/`

**Performance Goals**: Standalone reasoning commands must reason at the same speed as the
VS-Code-attached path for the same ontology (spec SC-005) — this feature changes only how the
runtime is obtained/launched, not the reasoning engine itself, so no new performance work is
needed beyond not regressing today's reasoner startup/response time

**Constraints**: The minimal CLI package (`cli/`) MUST NOT change its published behavior, its
`package.json`, or gain a build-time dependency on the vendored JRE (spec FR-005); the standalone
package MUST NOT require a system `java` on `PATH` under any circumstance (spec FR-004); a command
added to the shared (non-reasoning) command set MUST require no separate per-package
implementation (spec FR-012)

**Scale/Scope**: Same ontology scale as the rest of the project — small fixtures through
SNOMED CT-scale `anatomy.owl` (~75k classes); same three reasoning commands as feature 027
(classify, check-consistency, dl-query, the latter with 027's category-selection/label-filter
options)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Decoupled UI Core** — N/A. No frontend/webview UI is added or changed; this is a CLI
  packaging and reasoner-invocation feature only.
- **II. IPC-Only Communication (NON-NEGOTIABLE)** — N/A/PASS. This principle governs
  webview-based frontends talking to backend terminology APIs; neither CLI package is a webview.
  The standalone package's reasoning commands spawn and talk to their own local subprocess (the
  bundled JRE running the reasoner JAR) directly — there is no "backend terminology API" being
  bypassed, and the minimal package's existing IPC-over-socket path to the VS Code extension is
  completely unchanged.
- **III. Webview Path Safety** — N/A. No webview assets are touched.
- **IV. Test-First Integration** — PASS (planned). The reasoner core extracted from
  `ReasonerBridge.ts` (`src/reasoner/ReasonerProcess.ts`) is designed to be VS-Code-API-free and
  directly unit-testable, mirroring this repo's established pattern (`src/uml/`, and this same
  feature-027 session's `src/reasoner/dlQueryOrchestration.ts`). Tests are written first and
  confirmed failing before implementation, per `conductor/workflow.md`.

*Re-checked after Phase 1 design: no new violations — still PASS/N/A across all four principles.
No Complexity Tracking entries required.*

## Project Structure

### Documentation (this feature)

```text
specs/028-standalone-cli-reasoner/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/             # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── reasoner/
│   ├── ReasonerProcess.ts        # NEW — extracted, VS-Code-API-free JSON-RPC-over-stdio client
│   │                             # (spawn, readline framing, pending-request map, temp-file
│   │                             # handling for large payloads) — the core of today's
│   │                             # ReasonerBridge, minus status bar/output channel/vscode config
│   └── ReasonerBridge.ts         # THINNED — becomes a vscode-facing wrapper: reads
│                                 # vscode.workspace.getConfiguration(...), drives the status bar/
│                                 # output channel, and delegates all JSON-RPC work to a
│                                 # ReasonerProcess instance. Public API unchanged (FR-005).
└── (unchanged otherwise)

cli/                               # MINIMAL package — UNCHANGED behavior/package.json (FR-005)
├── src/
│   ├── main.ts                    # refactored to call the new shared registerCoreCommands()
│   │                              # instead of inlining the 6 file-based command registrations —
│   │                              # a structural refactor with NO behavior change
│   └── registerCoreCommands.ts    # NEW — shared commander registration for parse/search/
│                                  # validate/convert/stats/entity-info, imported by BOTH cli/ and
│                                  # cli-standalone/ (this is what makes FR-012 hold structurally,
│                                  # not by convention alone)
└── (bridge commands, tests, etc. — unchanged)

cli-standalone/                    # NEW sibling package — the "standalone CLI package"
├── package.json                  # name: @ysgao/ontograph-cli-standalone; bin: ontograph
├── tsconfig.json                  # mirrors cli/tsconfig.json's @core/* → ../src/* alias
├── esbuild.mjs                    # bundles src/main.ts; copies the vendored JRE + reasoner JAR
│                                  # into dist/runtime/ as part of the build, included in `files`
├── scripts/
│   └── fetch-runtime.mjs          # NEW — downloads/vendors the Eclipse Temurin 21 JRE
│                                  # (macOS arm64) into a gitignored local cache before build
├── src/
│   ├── main.ts                    # commander setup: registerCoreCommands(program) (shared) +
│   │                              # this package's OWN classify/check-consistency/dl-query
│   │                              # (bundled-runtime, file-based) registrations
│   └── commands/
│       ├── standaloneClassifyCommand.ts          # NEW
│       ├── standaloneConsistencyCommand.ts       # NEW
│       └── standaloneDlQueryCommand.ts           # NEW — reuses feature 027's --types/--filter
│                                                  # parsing (dlQueryTypes.ts, dlQueryLabelFilter)
└── tests/
    └── (mirrors cli/tests/ layout and conventions)
```

**Structure Decision**: Single monorepo. Adds one new sibling package (`cli-standalone/`) plus an
extraction inside the existing `src/reasoner/`. No changes to `cli/`'s public behavior or
`java-server/` (the reasoner JAR itself is reused unmodified, just packaged differently).

## Complexity Tracking

*No entries — Constitution Check reports no violations to justify.*
