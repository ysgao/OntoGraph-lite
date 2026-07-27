# Implementation Plan: Include Inferred Subtypes in UML Diagram Scope

**Branch**: `032-uml-inferred-subtypes` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-uml-inferred-subtypes/spec.md`

## Summary

`extractUmlDiagram()` (`src/uml/partOfGraph.ts`) currently gathers a focus entity's subtype scope purely from asserted axioms (`superClassIris`/`equivalentClassIris`/their Manchester-expression forms), via `buildConjunctsByClass`/`buildReverseIndex`. When the ontology has been classified, its reasoner-computed hierarchy (`model.inferredSubClasses: Map<parentIri, Set<childIri>>`, populated by `classifyOntology.ts`) is never consulted, so subtypes that only exist because of reasoning (e.g. via an `EquivalentClasses` definition) are silently missing from generated UML diagrams. The fix merges `model.inferredSubClasses` into the downward reverse-index traversal (gated on `model.isClassified`, no auto-classify triggered), tags edges with no supporting asserted axiom as `isInferred: true` on `DiagramEdge`, dedupes so an edge that's both asserted and inferred renders once as a normal (solid) edge, and threads the new flag through all three render targets (interactive webview SVG/HTML, standalone SVG export, draw.io XML export) as a dashed line — mirroring the existing `isInferred`/dashed convention `src/commands/openVisualization.ts` already uses for its general graph view. Existing lateralized-default-exclusion and "Entire X" anchor-resolution behavior are unaffected since both operate on whichever nodes reach the diagram, regardless of source.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js (VS Code extension host) + Browser (webview iframe, existing bundle)

**Primary Dependencies**: VS Code Extension API (existing); no new runtime dependency — reuses `model.inferredSubClasses`/`model.isClassified` (`src/model/OntologyModel.ts`), already populated by the existing `classifyOntology` command via `ReasonerBridge`

**Storage**: N/A — in-memory `OntologyModel` fields only, no persistence change

**Testing**: Vitest (`npm test`), existing convention: `src/uml/partOfGraph.test.ts` (extraction/scope unit tests), `src/commands/generateUmlDiagram.test.ts` (message-building/exclusion-toggle tests), `src/uml/middleEarRegression.test.ts` (asserted-data regression fixture) — all to be extended, not replaced

**Target Platform**: VS Code extension host (Node/CJS) + webview bundle (browser/IIFE), both already built by `esbuild.mjs`; no new bundle

**Project Type**: Single project — existing VS Code extension (`src/`), no new package

**Performance Goals**: No new performance target; must not regress the existing `DEFAULT_MAX_NODES = 200` cap behavior or large-ontology (`test-ontologies/bfo-core.ofn`) benchmark

**Constraints**: Must not trigger reasoner classification as a side effect of generating a UML diagram (FR-002); must produce byte-identical output to current behavior when the ontology is unclassified (SC-004)

**Scale/Scope**: Touches `src/uml/partOfGraph.ts`, `src/uml/diagramModel.ts`, `src/uml/htmlRenderer.ts`, `src/uml/drawioRenderer.ts`, and their existing test files; no changes to `src/uml/layout.ts`/`busLanes.ts`/`layerOrdering.ts` geometry expected (inferred subtype edges are always `kind: 'generalization'`, routed identically to asserted ones — only stroke style differs)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository (the path `CLAUDE.md`/`conductor/workflow.md` reference is aspirational/stale — this repo's actual governing process document is `conductor/workflow.md`). Applying `conductor/workflow.md`'s principles as the operative gate instead:

- **TDD (Red-Green-Refactor)**: PASS (by construction) — Phase 2 tasks will write failing tests against `extractUmlDiagram`/render output first, confirm red, then implement.
- **High Code Coverage (>80%)**: PASS expected — change is additive to already-well-covered files (`partOfGraph.ts`, `generateUmlDiagram.ts`) with existing test suites to extend.
- **Scale-Awareness (SNOMED CT-scale)**: PASS — merging `model.inferredSubClasses` (already a `Map`/`Set` structure, O(1) lookup) into the existing reverse-index BFS adds no new asymptotic cost; the existing node cap continues to bound traversal.
- **No new runtime dependencies**: PASS — no new dependency introduced.
- **OWL write format normative spec**: N/A — this feature only reads the model and renders diagrams; it never writes/serializes OWL files.

No violations to justify. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/uml/
├── partOfGraph.ts          # extractUmlDiagram() — MODIFIED: merge model.inferredSubClasses
│                           #   into the reverse-index downward traversal; tag inferred-only
│                           #   edges
├── diagramModel.ts         # DiagramEdge — MODIFIED: add `isInferred?: boolean` (optional, see
│                           #   tasks.md T002 note — kept optional to avoid breaking every
│                           #   pre-existing DiagramEdge test fixture)
├── diagramGeometry.ts      # RenderedSegment/computeEdgeSegmentsCore — MODIFIED: thread
│                           #   isInferred onto per-child descending stem segments only (shared
│                           #   parent-stem/bus segments unaffected — see research.md Decision 6)
├── htmlRenderer.ts         # renderDiagramFragment/renderStandaloneSvg — MODIFIED: distinct
│                           #   dashed stroke ("3 3") for isInferred segments
├── drawioRenderer.ts       # renderDrawio/edgeStyle — MODIFIED: distinct dashed mxCell style
│                           #   ("dashed=1;dashPattern=3 3;") for isInferred edges
├── partOfGraph.test.ts     # MODIFIED: new inferred-subtype scope test cases
├── diagramGeometry.test.ts # MODIFIED: isInferred segment-flagging test cases
├── htmlRenderer.test.ts    # MODIFIED: dashed-stroke assertions for isInferred
├── drawioRenderer.test.ts  # MODIFIED: dashed mxCell assertions for isInferred
├── crossFormatConsistency.test.ts  # MODIFIED: parallel isInferred-pattern count check,
│                           #   independent of the existing far-edge pattern count
├── middleEarRegression.test.ts  # unchanged expected output (asserted-only fixture) — run as
│                           #   regression guard
└── (layout.ts, busLanes.ts, layerOrdering.ts, layerCoordinates.ts, dummyNodes.ts,
    depthNormalization.ts, branchColors.ts, drawioCli.ts — unchanged; geometry/lane assignment
    keys only on `edge.kind`, not `isInferred`)

src/commands/
├── generateUmlDiagram.ts       # extractAndLayout/buildDiagramMessage — unchanged call shape;
│                               #   passes model straight through to extractUmlDiagram
└── generateUmlDiagram.test.ts  # MODIFIED: classified-vs-unclassified scope + dashed-edge
                                #   assertions
```

**Structure Decision**: Single project (existing VS Code extension layout, `src/`). No new files,
packages, or bundles — this is a scoped modification to the existing `src/uml/` module and its
existing test files, consistent with the repo's other "ad-hoc fix" changes (e.g.
`cli-label-resolution`, `030-sync-labels-in-axioms`) rather than a new subsystem.

## Post-Design Constitution Re-Check

*Performed after Phase 1 (research.md, data-model.md, contracts/, quickstart.md).*

Phase 1 surfaced one design nuance not visible at the pre-research stage — `htmlRenderer.ts`'s
shared parent-stem/bus segment optimization (Decision 6, `research.md`) — but resolving it (dash
only per-child stems; leave shared segments solid) touches only rendering-layer test/code files
already listed in Project Structure and adds no new dependency, persistence, or cross-cutting
concern. All five gates re-checked above still PASS; no new entries needed in Complexity Tracking.

## Complexity Tracking

*No violations — Constitution Check gate passed with no entries required.*
