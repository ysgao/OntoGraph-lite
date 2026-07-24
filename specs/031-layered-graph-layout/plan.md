# Implementation Plan: Layered Graph Layout for UML Diagrams

**Branch**: `031-layered-graph-layout` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-layered-graph-layout/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Replace the UML diagram feature's cross-axis node placement and multi-layer edge routing with a
Sugiyama-style layered layout — dummy-node insertion for edges spanning more than one hierarchy
layer, a crossing-minimization ordering sweep, and cumulative-sum coordinate assignment — so that
node overlap becomes structurally impossible and edge crossings are minimized, at any hierarchy
depth. Layer (depth) assignment already uses longest-path-from-root
(`src/uml/depthNormalization.ts`) and is kept unchanged; only `src/uml/layout.ts`'s
average-of-children placement and `src/uml/diagramGeometry.ts`'s reactive
`computeStemDetour`/`computeSafeJogY` detour heuristics for multi-layer edges are replaced. The
extension↔webview message contract, the draw.io/SVG/PNG export renderers' external signatures, and
the depth-control/exclusion/direction features are unaffected — this is an internal correctness
fix to the shared layout module all four export formats already consume.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js (extension host) — same runtime as the
rest of `src/uml/`, no new runtime introduced.

**Primary Dependencies**: None new. Reuses existing `src/uml/diagramModel.ts` types
(`DiagramNode`, `DiagramEdge`), `src/uml/depthNormalization.ts`'s longest-path layer assignment
(unchanged), and `src/uml/diagramGeometry.ts`'s existing box-rect/elbow-path helpers
(`boxRect`, `pickConnectionFractions`, the M/L-only SVG path convention). No third-party layout
library (`dagre`/ELK/graphviz) is added — see `research.md` §1 for why that was rejected for this
module specifically (the sibling `cytoscape-dagre` dependency belongs to the unrelated Graph view
and is out of scope here).

**Storage**: N/A — layout is recomputed in-memory on every diagram generation/depth-change
request, exactly as today.

**Testing**: Vitest, `src/uml/*.test.ts` convention. Extends `layout.test.ts` and
`diagramGeometry.test.ts` in place; adds one new test file for a general-purpose, fixture-agnostic
overlap/crossing-count helper (see `research.md` §4) exercised against the middle-ear-structure
regression fixture (`middleEarRegression.test.ts`'s existing extraction, feeding the new layout)
and a new synthetic 4+ level multi-parent fixture. Per CLAUDE.md's Conductor workflow, the new
overlap/crossing test must be written and confirmed failing against the current implementation
before the layout change lands (red → green).

**Target Platform**: VS Code extension host (Node.js) — same target as today; no change to the
webview bundle's runtime target.

**Project Type**: Single-repo VS Code extension (existing `src/uml/` module) — no new package or
project boundary.

**Performance Goals**: No regression to the existing UML feature's interactive-use goals (diagram
visible within 5s, depth-change re-render within 3s, per `026`'s Technical Context) — see
`research.md` §5 for why the algorithm's O(passes · E²) crossing-count pass is within budget at
this feature's existing diagram-size scale.

**Constraints**: Deterministic output (spec FR-009, same guarantee `026`'s SC-003 already
established); zero VS Code API imports and no new network/AI-client surface in `src/uml/`
(existing `noExternalDependency.test.ts` guard); no visible regression to already-correct shallow
(1-2 level) diagrams (spec FR-008/SC-005).

**Scale/Scope**: Bounded by the existing UML feature's depth control and node cap (tens to low
hundreds of nodes/edges per diagram) — not extending scope to SNOMED CT-scale single diagrams, per
the spec's Assumptions section.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository's checked-in constitution (`~/.specify/memory/constitution.md`, referenced by
CLAUDE.md) describes a decoupled-frontend/`apps/`-submodule + Angular/IPC architecture that does
not match this repository's actual structure (OntoGraph-lite is itself the VS Code extension host,
with `webview-src/` esbuild bundles, not a separate `apps/` Angular submodule) — Principles I and
III are **not applicable** to this codebase and are not evaluated further. The two principles that
do genuinely apply:

- **Principle II (IPC-Only Communication)**: PASS. This feature makes no change to how the
  extension host and the UML webview communicate — `postMessage` remains the only channel, and no
  new message type is introduced (see `contracts/layout-module-contract.md`).
- **Principle IV (Test-First Integration)**: PASS, enforced via CLAUDE.md's Conductor workflow
  (red phase before green phase for the new overlap/crossing test — see Technical Context/Testing
  above), which is the concretely-followed TDD process for this repository's actual work.

No violations requiring justification; Complexity Tracking table below is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/031-layered-graph-layout/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── layout-module-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/uml/
├── depthNormalization.ts        # Layer (depth) assignment — UNCHANGED, already longest-path
├── depthNormalization.test.ts   # (implied by existing suite; unchanged)
├── layout.ts                    # Cross-axis placement — average-of-children + same-depth clamp
│                                 #   REPLACED by dummy-node-aware ordering + cumulative-sum
│                                 #   coordinate assignment; public computeLayout() signature
│                                 #   unchanged (see contracts/layout-module-contract.md)
├── layout.test.ts                # Extended: existing cases kept green, new dummy-node/ordering
│                                 #   cases added
├── diagramGeometry.ts            # computeStemDetour/computeSafeJogY REPLACED (for multi-layer
│                                 #   edges only) by direct dummy-node point-list routing;
│                                 #   computeEdgeSegments/computeEdgeRoutes signatures unchanged
├── diagramGeometry.test.ts       # Extended: existing detour cases re-verified via new routing
│                                 #   path, new multi-layer-edge cases added
├── middleEarRegression.test.ts   # UNCHANGED extraction; consumed by new overlap/crossing checks
├── noExternalDependency.test.ts  # UNCHANGED — still guards no network/AI-client import
├── partOfGraph.ts                # UNCHANGED — extraction/BFS traversal, not part of this feature
├── layoutMetrics.ts               # NEW — pure overlap-detection + crossing-count helper functions
└── layoutMetrics.test.ts         # NEW — regression assertions using the helper (see research.md §4)

webview-src/uml/                  # UNCHANGED — no message-contract or control changes
src/commands/generateUmlDiagram.ts # UNCHANGED — still calls computeLayout() with the same signature
src/uml/drawioRenderer.ts          # UNCHANGED signature — consumes the same Edge Route data
src/uml/htmlRenderer.ts            # UNCHANGED signature — consumes the same Edge Route data
```

**Structure Decision**: Single-project VS Code extension (existing `src/uml/` module, reused by
`cli/` later via the `@core/*` alias per `026`'s precedent — unaffected by this feature). All
changes are contained within `src/uml/layout.ts` and `src/uml/diagramGeometry.ts`'s internal
routing logic, plus one new test-support file; no new module, package, or webview bundle is
introduced, and `webview-src/uml/`, the message contract, and the CLI are untouched.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
