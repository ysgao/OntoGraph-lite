# Implementation Plan: Delete Entity with Subtype Choice

**Branch**: `029-delete-entity-subtypes` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-delete-entity-subtypes/spec.md`

## Summary

Add a "Delete Entity" command reachable from the Classes/Object Properties/Data Properties/Annotation Properties/Individuals tree views. For entity types with a hierarchy (classes, object/data/annotation properties), if the target has direct subtypes, prompt the user to choose between the default "delete entity only" (reparent direct subtypes to the target's own former super-IRIs) and "delete entity and all subtypes" (cascade-remove the whole descendant closure). Individuals, and any entity with no subtypes, skip the mode choice and delete directly. All modes require an explicit confirmation showing the affected-entity count, then rewrite the source file in place via the existing `AxiomSync`/`AnnotationSync` machinery and refresh all tree views.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js (VS Code extension host)

**Primary Dependencies**: VS Code Extension API (`vscode.window.showQuickPick`/`showWarningMessage` for the mode-choice + confirmation UI, `vscode.TreeItem` context menu contribution); existing in-repo modules only — `src/model/OntologyModel.ts`, `src/model/OntologyIndex.ts`, `src/sync/AxiomSync.ts`, `src/sync/AnnotationSync.ts`, `src/views/*Provider.ts`. No new npm dependency.

**Storage**: The ontology source file on disk (`.ofn`/`.omn`/`.ttl`/`.owl`/`.owx`, whichever the user has open), mutated in place via `queueSyncWrite`/`writeTextStreamed`, mirroring how `019-create-entity` and annotation/axiom edits already persist changes.

**Testing**: Vitest (`npm test`), matching existing `src/**/*.test.ts` conventions. No new test framework.

**Target Platform**: VS Code extension host (desktop), cross-platform (macOS/Windows/Linux) like the rest of the extension.

**Project Type**: Single project — VS Code extension (existing `src/` tree); no new app, service, or package. (The OntoGraph Editor constitution's "Decoupled UI Core" principle, which references an `apps/` multi-frontend layout, does not apply here — this repo has no `apps/` directory and this feature adds no new frontend, only a new command + tree-view menu entry using existing native VS Code UI.)

**Performance Goals**: Delete/reparent/cascade operations on ontologies up to the existing large-ontology threshold (`ontograph.largeOntologyThreshold`, default 50k classes) MUST complete without noticeably blocking the UI — reuse the existing in-place sync writers rather than a full re-serialization, which is the main cost driver at scale.

**Constraints**: Must not alter the normative OWL Functional Syntax write ordering/formatting (`ContentArrangementInOWLfunctionalSyntaxDocument.md`) for any axiom/declaration line that is added, moved, or removed as a side effect of delete/reparent.

**Scale/Scope**: One new command (`ontograph.deleteEntity`), one new shared "direct/transitive subtype" model helper, extensions to `AxiomSync`/`AnnotationSync` (or a thin wrapper over them) for full-entity removal, five tree-view `package.json` context-menu contributions (Classes, Object Properties, Data Properties, Annotation Properties, Individuals).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Decoupled UI Core | No | This repo has no `apps/` multi-frontend layout; the feature adds no new frontend app, only a VS Code-native command + context menu. Principle presumes a project shape (`apps/OntoGraph-lite`, `apps/AuthoringUI`) that doesn't exist in this repository — treated as not applicable rather than violated. |
| II. IPC-Only Communication | Yes (vacuously) | No webview involvement in this feature's MVP scope (native VS Code dialogs only); if a future iteration adds a delete affordance inside the Entity Editor webview, it MUST go through the existing typed `postMessage` protocol (`EntityEditorMessages.ts`), never a direct network/API call. No violation. |
| III. Webview Path Safety | N/A | No new webview assets introduced. |
| IV. Test-First Integration | Yes | No new cross-boundary contract type is introduced (no new webview message type in this scope), so there's no new `IVsCodeService`-style contract to write tests against first; ordinary TDD (per `conductor/workflow.md`: failing tests before implementation) still applies to the new command/model-helper/sync logic. |

**Result**: PASS, no violations requiring Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/029-delete-entity-subtypes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

(No `contracts/` directory: this feature adds no new external interface, webview message type, or CLI-facing contract — it is entirely internal command + sync-layer logic reachable through existing tree views.)

### Source Code (repository root)

Single project — existing VS Code extension layout, no new top-level directories:

**Implementation note (post-hoc)**: The tree below is the original plan. What actually shipped did not extend `AxiomSync.ts`/`AnnotationSync.ts` — deletion instead reuses `computeUpdatedText` (`src/views/EntityEditorPanel.ts`), with the one remaining gap (Declaration/header-line removal, reparenting-rule mutation) covered by a new `src/sync/EntityDeletionSync.ts` not listed below. See `research.md` D3 and `tasks.md`'s Phase 2 note for the full rationale.

```text
src/
├── commands/
│   └── deleteEntity.ts          # NEW — ontograph.deleteEntity command: mode choice, confirmation, orchestration
├── model/
│   ├── OntologyModel.ts         # unchanged (existing hierarchy fields reused)
│   └── OntologyIndex.ts         # extended — shared getDirectSubtypes()/getTransitiveSubtypes() helper
├── sync/
│   ├── AxiomSync.ts             # extended — full-entity axiom removal + reparented SubClassOf/SubPropertyOf rewrite
│   └── AnnotationSync.ts        # extended — full-entity annotation removal
├── views/
│   ├── ClassHierarchyProvider.ts        # consumer of delete (context menu wiring; refresh already via setRefreshAllViews)
│   ├── ObjectPropertyProvider.ts
│   ├── DataPropertyProvider.ts
│   ├── AnnotationPropertyProvider.ts
│   └── IndividualsProvider.ts   # (name per existing tree; direct delete only, no mode choice)
└── extension.ts                 # register ontograph.deleteEntity, reuse activeModel/activeIndex + refreshAllViews

package.json                     # add ontograph.deleteEntity command + view/item/context menu entries per tree view

cli/src/commands/core/entityInfoCommand.ts  # refactored to call the extracted shared subtype helper instead of its inline loop (no behavior change)

tests/ (co-located, per project convention)
├── src/model/OntologyIndex.test.ts       # new cases for getDirectSubtypes/getTransitiveSubtypes
├── src/commands/deleteEntity.test.ts     # new — leaf delete, reparent (incl. multiple inheritance), cascade, protected-entity rejection, concurrent-edit abort
└── src/sync/AxiomSync.test.ts            # new cases for full-entity removal + reparented axiom rewrite
```

**Structure Decision**: Follows the existing single-project VS Code extension layout exactly (no Option 2/3 from the template — this is neither a web app nor mobile+API split). All new logic lives in the existing `src/commands/`, `src/model/`, `src/sync/` directories; the only cross-cutting change is extracting `entityInfoCommand.ts`'s inline direct-subclass loop into the shared model helper so the CLI and the new delete command stay consistent (per research.md D1).

## Complexity Tracking

*No entries — Constitution Check passed with no violations requiring justification.*
