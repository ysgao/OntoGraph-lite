# Implementation Plan: Sync Axiom Display After Entity Label Rename

**Branch**: `030-sync-labels-in-axioms` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-sync-labels-in-axioms/spec.md`

## Summary

When an entity's `rdfs:label` is renamed and saved, other entities' axiom text that references it by label must keep displaying the current label and must never be corrupted on a later save. Investigation found the model already stores axioms by IRI, not label — the actual defect is that `EntityEditHistory`'s per-entity cache (`entityHistoryMap`) holds already-label-rendered snapshot text that goes stale when a *different* entity's label changes, and that stale text can be silently mis-resolved if re-parsed on save. The fix: (1) reject any label rename that would create a duplicate label, reusing the existing `OntologyIndex.exactMatchByLabel` lookup and mirroring the existing `renameIri` rejection precedent; (2) after a successful label rename, scan all other entities (same scanning style as the existing `updateIriReferencesInModel` used for IRI renames) for references to the renamed entity's IRI, and invalidate only those entities' `entityHistoryMap` entries so their next load re-renders fresh with the current label.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), existing codebase — no new language/runtime introduced.

**Primary Dependencies**: None new. Reuses existing internal modules: `src/model/OntologyIndex.ts` (`exactMatchByLabel`), `src/model/AxiomDisplay.ts` (`renderExpression`/`renderExpressionWithEntityRefs`, `normalizeExpression`), `src/views/EntityEditorPanel.ts` (`save`/`renameIri` handlers, `updateIriReferencesInModel`, `sendLoadEntity`), `src/views/EntityEditHistory.ts` (`entityHistoryMap`), `src/views/EntityEditorMessages.ts` (message types).

**Storage**: N/A — in-memory model + existing `AnnotationSync.ts` file sync (already supports `.ofn`/`.omn`/`.ttl`); no schema or storage changes.

**Testing**: Vitest, matching existing suite conventions (`src/views/*.test.ts`, `src/model/*.test.ts`).

**Target Platform**: VS Code extension host (Node) + existing Entity Editor webview (browser/IIFE bundle).

**Project Type**: Single project (existing VS Code extension) — no new bundle, no new webview.

**Performance Goals**: Label-rename-time reverse scan (Decision 2 in `research.md`) must stay proportional to ontology size, consistent with the existing accepted cost of `updateIriReferencesInModel` for IRI renames on the same data (a deliberate, infrequent user action, not a hot path). No perceptible added latency on ordinary navigation, editing, or save of unrelated entities.

**Constraints**: Must not change how axioms are stored on disk or the OWL Functional Syntax write format (no changes to `FunctionalSerializer.ts`/`AnnotationSync.ts`/`AxiomSync.ts` write ordering). Must not regress existing undo/redo (`014-entity-editor-undo-redo`) or entity deletion (`029-delete-entity-subtypes`) behavior. Applies to every format the Entity Editor Panel already supports for label/annotation edits (`.ofn`, `.omn`, `.ttl`) — this fix touches only the format-agnostic label index and display cache, not the `.ofn`-only axiom-syntax writers `019-create-entity`/`029-delete-entity-subtypes` introduced.

**Scale/Scope**: Bug-fix-sized feature confined to the Entity Editor Panel's save/load/history path; no new commands, views, or bundles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`~/.specify/memory/constitution.md`) is written in terms of a multi-app host architecture (`apps/` directory, `VsCodeService` IPC bridge, Angular webview routing) that reflects a different/earlier repo shape than OntoGraph-lite's actual structure (a single VS Code extension with its own webview bundles built by `esbuild.mjs`). Evaluating this feature against the constitution's actual intent (not literal directory names):

- **I. Decoupled UI Core** — N/A literally (no `apps/` submodule structure in this repo), but the spirit — UI logic not directly coupled to extension internals — is respected: this feature only adds a rejection check and a cache-invalidation scan inside existing extension-host handlers; the webview only gains one new typed response message. ✅ No violation.
- **II. IPC-Only Communication (NON-NEGOTIABLE)** — Directly applicable and already how this codebase works: all extension↔webview communication goes through the existing typed `postMessage` protocol (`EntityEditorMessages.ts`). The new `LabelRenameResultMessage` follows this exactly, mirroring `IriRenameResultMessage`. ✅ No violation.
- **III. Webview Path Safety** — N/A; this feature introduces no new resources, assets, or routing.
- **IV. Test-First Integration** — Applicable via this repo's actual TDD workflow (`conductor/workflow.md`: red phase before green phase). The label-uniqueness check and history-invalidation scan are exactly the kind of "contract interface validated before implementation" this principle calls for. ✅ Plan honors this — tests-first for the uniqueness check and the invalidation scan (see `quickstart.md` Automated Coverage) before implementation.

**Result**: PASS. No violations requiring justification; no entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/030-sync-labels-in-axioms/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── label-rename-message-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

No new directories. This feature modifies existing files only:

```text
src/
├── model/
│   └── OntologyIndex.ts          # existing exactMatchByLabel — reused, not changed
├── views/
│   ├── EntityEditorPanel.ts      # save handler: add label-uniqueness check + invalidation scan call
│   ├── EntityEditorMessages.ts   # add LabelRenameResultMessage to EntityEditorExtToWebview
│   └── EntityEditHistory.ts      # possibly add a targeted delete/invalidate helper (or reuse existing map API from EntityEditorPanel.ts)
└── (webview-src/entity-editor/EntityEditorApp.ts)  # handle new labelRenameResult message, mirroring existing iriRenameResult handling

src/views/*.test.ts                # new/updated Vitest coverage per quickstart.md
```

**Structure Decision**: Single existing project, no structural changes. All work is contained within the existing `src/views/` (Entity Editor Panel + its message contract + its history cache) and reuses `src/model/OntologyIndex.ts` as-is. This matches the precedent set by `019-create-entity`/`029-delete-entity-subtypes`/the existing `renameIri` flow, all of which live in the same files.

## Complexity Tracking

*No entries — Constitution Check passed with no violations.*
