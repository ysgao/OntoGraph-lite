# Implementation Plan: Generate UML Diagram

**Branch**: `026-generate-uml-diagram` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-generate-uml-diagram/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a right-click "Generate UML Diagram" command to the Classes/Individuals tree views (matching
the existing "Generate Graph" entry point) that opens a webview showing a UML-style diagram rooted
at the selected entity — composition (part-of) connectors and generalization (subtype) connectors,
derived mechanically from the ontology's own axioms with no AI/LLM involvement, and a depth control
that re-renders the diagram in place. Composition is driven by a user-configurable set of object
properties (a persisted setting, not a fixed "part-of" vocabulary or heuristic); an entity with
multiple qualifying relationships shows every edge (general graph, not a strict tree). The
extraction/classification/layout logic lives in a new, dependency-free `src/uml/` module (reused by
the extension command today; importable later by `cli/` via the existing `@core/*` path alias
without reimplementation, satisfying the deferred-but-not-precluded CLI requirement in the spec).

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js (extension host — same runtime as every
other command in `src/commands/`)

**Primary Dependencies**: VS Code Extension API; existing `OntologyModel` / `OntologyIndex` /
`ParserRegistry` (`src/model/`, `src/parser/`); `src/utils/ManchesterFormatting.ts` (extended with
a new conjunct-parsing helper, following the same pattern as its existing
`hasTopLevelToken`/`isBareNamedClass`/`extractRoleLower` helpers); existing webview message-bus
convention (`postMessage`, typed in `src/views/*Messages.ts`); Cytoscape.js — already a dependency
of the Graph webview (`webview-src/graph/GraphViewApp.ts`) and natively supports the `diamond` /
`triangle` edge-arrow shapes UML notation needs, so the new webview reuses it rather than
introducing a second rendering library.

**Storage**: N/A — diagram data is derived in-memory from the already-loaded `OntologyModel` on
every generation/depth-change request (no persistence of the diagram itself, per the point-in-time
assumption in the spec). One new piece of durable state: the Composition Property Selection,
stored as a VS Code workspace setting (same mechanism as existing `ontograph.*` settings).

**Testing**: Vitest, following the existing `src/**/*.test.ts` convention (`npm test`); new
`src/uml/*.test.ts` suite for extraction, classification, and layout, plus a webview-side test for
the message contract under `webview-src/uml/*.test.ts` (mirroring the precedent set for the entity
editor's webview tests, per `025-show-inferred-equivalent-class`'s `vitest.config.ts` inclusion).

**Target Platform**: VS Code extension host (Node.js) driving a new browser-sandboxed webview
bundle (IIFE), the same two-target split as the four existing webview bundles.

**Project Type**: Single-repo VS Code extension with a pnpm-workspace `cli/` sibling package that
already reuses root `src/` via the `@core/*` path alias — no new project type or package boundary
is introduced by this feature.

**Performance Goals**: Diagram visible within 5s of invocation (spec SC-001); depth-change
re-render reflected within 3s (spec SC-004) — the same order of magnitude the existing Graph view
already meets for comparable ontology sizes.

**Constraints**: Fully deterministic and offline — no network call and no AI/LLM call of any kind
in the diagram-generation path (spec FR-008); node/relationship count capped for responsiveness,
with the cap breach surfaced explicitly in the diagram rather than silently truncating (spec
FR-007), mirroring the existing `MAX_NODES` guard in `src/commands/openVisualization.ts`.

**Scale/Scope**: Must remain usable against the project's existing large-ontology benchmark
(`test-ontologies/anatomy.owl`, ~75k classes) per the project's quality-gate convention
(`conductor/workflow.md`); v1 is view-only (no file export) and Classes/Individuals-only (no new
entity kinds), per the spec's Assumptions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Decoupled UI Core | Partially — this repo has no `apps/` monorepo split (that principle targets a different, multi-frontend layout this project doesn't use) | N/A / already satisfied in spirit: the new webview is its own esbuild IIFE bundle (`uml-diagram-webview.js`), never a direct dependency of extension-host logic, same as the other four webview bundles. **PASS** |
| II. IPC-Only Communication (NON-NEGOTIABLE) | Yes | The new webview communicates with the extension host exclusively through the existing typed `postMessage` bridge (new `src/views/UmlDiagramMessages.ts`, same shape as `GraphViewMessages.ts`). No direct network/API calls from the webview. **PASS** |
| III. Webview Path Safety | Yes | New bundle output is registered through the same `asWebviewUri`-wrapped resource loading as the other four webview bundles; no Angular-specific requirement applies since this project doesn't use Angular. **PASS** |
| IV. Test-First Integration | Yes | New `src/uml/` extraction/classification/layout module and the `UmlDiagramMessages.ts` contract are built red-then-green per `conductor/workflow.md`, with contract tests preceding the webview implementation. **PASS (enforced during task execution, not by this plan itself)** |

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-generate-uml-diagram/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── uml-diagram-messages.md
│   └── uml-diagram-settings.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── uml/                              # NEW — pure, dependency-free extraction/classification/layout
│   ├── partOfGraph.ts                # BFS extraction + composition/generalization classification
│   ├── layout.ts                     # tree/graph layout (positions for the webview to render)
│   └── diagramModel.ts               # DiagramNode / DiagramEdge / ExcludedRelation types
│                                      # (Conjunct lives in ManchesterFormatting.ts, where it's produced)
├── commands/
│   └── generateUmlDiagram.ts         # NEW — command wrapper: reads focus IRI, calls src/uml/*,
│                                      #        owns the webview panel (module-level singleton,
│                                      #        same pattern as src/commands/openVisualization.ts)
├── views/
│   └── UmlDiagramMessages.ts         # NEW — typed ExtToWebview / WebviewToExt message contract
├── utils/
│   └── ManchesterFormatting.ts       # EXTENDED — new parseConjuncts()-style helper for pulling
│                                      #            {property, target} restrictions out of an
│                                      #            expression string (reuses existing paren-depth
│                                      #            top-level-token-splitting helpers already there)
└── extension.ts                      # EXTENDED — registers `ontograph.generateUmlDiagram` command

webview-src/
└── uml/                               # NEW — fourth-sibling webview bundle
    ├── UmlDiagramApp.ts               # entry point; depth control + Cytoscape render, same shape
    │                                   # as webview-src/graph/GraphViewApp.ts
    └── umlDiagramStyles.ts            # Cytoscape style sheet: diamond/triangle arrow shapes,
                                        # category-based node fill

esbuild.mjs                            # EXTENDED — 8th bundle output: uml-diagram-webview.js

package.json                           # EXTENDED — new command (`ontograph.generateUmlDiagram`),
                                        # new context-menu entry (view/item/context, same `when`
                                        # clause as "Open Graph"), two new settings
                                        # (`ontograph.umlDiagram.defaultDepth`,
                                        # `ontograph.umlDiagram.compositionProperties`)

cli/                                    # UNCHANGED by this feature — later CLI exposure imports
                                        # src/uml/* via the existing @core/* alias; no rework needed
```

**Structure Decision**: Single-project structure (this repo already is the single VS Code
extension; there is no `apps/` split to decouple further). The only new top-level concern is
`src/uml/`, deliberately built with no VS Code API imports so it stays reusable by both the new
extension command and, later, a `cli/` command via the pre-existing `@core/*` alias — this is what
lets FR-012 ("structured so it can later be exposed through the CLI without re-implementing the
extraction, classification, or layout logic") hold without inventing a new package or build step.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
