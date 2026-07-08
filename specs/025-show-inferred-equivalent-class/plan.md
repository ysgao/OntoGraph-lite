# Implementation Plan: Show Inferred Equivalent Class in Entity Editor

**Branch**: `025-show-inferred-equivalent-class` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-show-inferred-equivalent-class/spec.md`

## Summary

After reasoner classification, a named OWL class can end up logically equivalent to another class (named or complex) that the ontology author never intended — a modeling error. This feature surfaces those *unintended* inferred equivalences in the Entity Editor, in a new read-only "Inferred Equivalent Class" section between the existing GCI and DisjointWith sections, styled in red, and rendered identically to (and reusing the display machinery of) the existing EquivalentTo Axioms section. The section is entirely omitted when there is nothing to show.

The equivalence set is computed once, as part of the existing Java-side classification pass (`OntologyService.buildClassificationResult`), using `OWLReasoner.getEquivalentClasses(...)` scoped to (a) each named class and (b) the complex expressions already recorded per-class today (`equivalentClassExpressions`, `gciExpressions`), then filtered to drop anything already explicitly asserted. Results flow through the existing JSON-RPC classify response → `ReasonerBridge.ClassificationResult` → a new `OntologyModel` field (populated in `classifyOntology.ts`, mirroring `inferredSubClasses`) → `EntityEditorPanel`'s payload builder → a new `LoadEntityMessage` field → a new, read-only render branch in `EntityEditorApp.ts`. No OWL-file write path is touched.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode) for extension host + webview; Java 11+ (Maven, OWLAPI 5) for the reasoner server.

**Primary Dependencies**: VS Code Extension API, existing `postMessage` webview message bus, CodeMirror 6 (already used for Manchester-syntax expression editors), OWLAPI 5 with HermiT/ELK (already used for classification). No new runtime dependencies.

**Storage**: N/A — inferred data is transient, held in the in-memory `OntologyModel` only (never persisted to the `.ofn`/`.omn`/`.ttl`/`.owl` source file).

**Testing**: Vitest for TypeScript (`*.test.ts` colocated with source, per repo convention — e.g. `src/reasoner/ReasonerBridge.test.ts`, `src/views/EntityEditorPanel.test.ts`); no Java unit tests exist in this repo today (per CLAUDE.md), so the Java-side classification change is verified via the existing manual/CLI classify workflow against `test-ontologies/`.

**Target Platform**: VS Code extension (desktop, cross-platform), unchanged.

**Project Type**: VS Code extension with a Node/CJS extension host, browser-based webviews, and a Java sidecar reasoning process communicating over JSON-RPC (stdin/stdout) — existing three-tier architecture, no structural change.

**Performance Goals**: Adding equivalence computation to the classify pass must not materially change classification time at SNOMED CT scale (the project's existing large-ontology benchmark, `test-ontologies/bfo-core.ofn`, must still pass). Bounding the complex-expression check to expressions already computed per-class (rather than an ontology-wide scan of all anonymous class expressions) keeps the added cost roughly linear in existing per-class axiom counts, not quadratic in ontology size.

**Constraints**: Must preserve IPC-only (`postMessage`) communication between extension host and webview (Constitution II); the new section must be strictly read-only and excluded from the webview's dirty-check/save payload (`getCurrentState()` in `EntityEditorApp.ts`), since it is derived reasoning output, never an axiom the user authors (spec FR-009); must not alter `FunctionalSerializer`/`AxiomSync`/`AnnotationSync` (no new write path).

**Scale/Scope**: One feature slice touching: `OntologyService.java` (classification), `ReasonerServer.java` (JSON-RPC schema), `ReasonerBridge.ts` (result type), `OntologyModel.ts` (new field), `classifyOntology.ts` (population), `EntityEditorPanel.ts` (payload), `EntityEditorMessages.ts` (message field), `EntityEditorApp.ts` + its CSS (rendering).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Decoupled UI Core | **N/A** — OntoGraph-lite's webview-src is the repo's existing embedded webview layer, not a standalone `apps/` submodule; this feature adds no new frontend application and does not change that structure. |
| II. IPC-Only Communication (NON-NEGOTIABLE) | **PASS** — the new inferred-equivalence data travels extension→webview exclusively through the existing `postMessage`-based `LoadEntityMessage`, the same channel already used for `equivalentClassIris`/`gciExpressions`. No direct network or out-of-band calls are introduced. |
| III. Webview Path Safety | **N/A** — no new webview assets/bundles/resource URIs are introduced; this is new render logic and a CSS rule inside the existing `entity-editor-webview.js` bundle. |
| IV. Test-First Integration | **PASS (must be honored during implementation)** — Vitest tests for the new `OntologyModel` field, `ReasonerBridge.ClassificationResult` shape, and `EntityEditorPanel` payload construction must be written and confirmed failing before implementation, per `conductor/workflow.md`'s red/green cycle. The new JSON-RPC field is a contract between Java and TypeScript and must be defined (see `contracts/`) before either side implements it. |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/025-show-inferred-equivalent-class/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── inferred-equivalent-classes.md   # JSON-RPC + webview message contract
└── tasks.md              # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

This feature only touches existing files in the established three-tier layout (see root `CLAUDE.md`); no new directories or projects are introduced.

```text
java-server/src/main/java/org/ihtsdo/ontoeditor/
├── OntologyService.java        # buildClassificationResult(): add per-class equivalent-class computation
├── ClassificationResult.java   # add equivalentClasses field (or equivalent constructor param)
└── ReasonerServer.java         # classify handler: include new field in JSON-RPC response

src/
├── reasoner/
│   ├── ReasonerBridge.ts       # ClassificationResult interface: add equivalentClasses
│   └── ReasonerBridge.test.ts  # new/updated tests for the extended shape
├── model/
│   ├── OntologyModel.ts        # add inferredEquivalentClasses model field
│   └── OntologyModel.test.ts   # (or nearest existing test) cover new field defaults
├── commands/
│   └── classifyOntology.ts     # populate inferredEquivalentClasses from classify result, gated by isClassified/classificationNeedsUpdate
└── views/
    ├── EntityEditorPanel.ts       # build inferredEquivalentClassIris/Expressions into LoadEntityMessage
    ├── EntityEditorPanel.test.ts  # cover the new payload fields
    └── EntityEditorMessages.ts    # add the two new optional LoadEntityMessage fields

webview-src/entity-editor/
└── EntityEditorApp.ts           # new read-only render branch between GCI and DisjointWith; red error styling (CSS is inline in this bundle per existing convention)
```

**Structure Decision**: Single VS Code extension project (existing layout). No new package, app, or bundle — every change lands inside the existing extension host (`src/`), the existing Java reasoner server, and the existing `entity-editor-webview.js` bundle's source (`webview-src/entity-editor/`). This matches Constitution I (no new standalone frontend) and keeps the change a vertical slice through the established three-tier architecture rather than a new structural option.

## Complexity Tracking

*No entries — Constitution Check has no unjustified violations.*
