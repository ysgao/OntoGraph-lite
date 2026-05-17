# Implementation Plan: Allow Saving Invalid Axiom Expressions as Drafts

**Branch**: `008-invalid-axiom-draft-save` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-invalid-axiom-draft-save/spec.md`

## Summary

Allow the entity editor to save syntactically invalid Manchester expression drafts without writing them to the OWL document. Invalid drafts are held in a module-level `Map<string, DraftExpression[]>` in `EntityEditorPanel.ts`, visually flagged with a red border and error banner in the webview, and protected by a modal blocking dialog when any model-reload operation (classify, consistency check, file change) would discard them.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode); Node.js extension host + browser IIFE webview bundle  
**Primary Dependencies**: VS Code Extension API, CodeMirror 6 (`@codemirror/lint ^6.9.6` — already installed), Vitest 1.6.0  
**Storage**: N/A — draft state is in-process memory only (transient `Map`; no file or database)  
**Testing**: Vitest 1.6.0 (`npm test`)  
**Target Platform**: VS Code extension host + webview (browser)  
**Project Type**: VS Code extension feature  
**Performance Goals**: Error banner appears within 1 s of save (SC-003); blocking dialog is synchronous (VS Code modal)  
**Constraints**: Draft state is intentionally transient — lost on process restart, model reload with user discard, or explicit "Discard and proceed"  
**Scale/Scope**: Per-entity draft state; no iteration over the class hierarchy — no SNOMED CT benchmark required

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ PASS | Test tasks T004, T008, T012, T014, T021 written and confirmed failing before paired impl tasks |
| II. Simplicity | ✅ PASS | Single `Map<string, DraftExpression[]>`; no new abstraction layers or persistence mechanism |
| III. OWL Standards | ✅ PASS | Invalid expressions are never written to the OWL document (Invariant 1 in data-model.md) |
| IV. Scale-Aware | ✅ PASS | No class hierarchy traversal — no benchmark needed |
| V. Security | ✅ PASS | No new shell commands; no new injection surfaces; draft text stays in memory |

No violations. Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/008-invalid-axiom-draft-save/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — decisions on storage, dialog API, expression scope
├── data-model.md        # Phase 1 — DraftExpression type, draftAxioms Map, message changes
├── quickstart.md        # Phase 1 — manual testing scenarios 1–7
├── contracts/
│   └── entity-editor-messages.md   # Phase 1 — message protocol changes
└── tasks.md             # Phase 2 — all tasks T001–T022, all [X] complete
```

### Source Code (modified by this feature)

```text
src/views/
├── EntityEditorMessages.ts          # SaveEntityMessage extended; SaveDraftErrorMessage added; LoadEntityMessage extended
├── EntityEditorPanel.ts             # DraftExpression, draftAxioms Map, filtering in save handler,
│                                    # sendLoadEntity draft merge, promptForDraftDiscard, refreshEntityEditorIfOpen async
├── __tests__/
│   ├── EntityEditorDraft.test.ts    # T004, T008, T012 — save filtering, message posting, data contract
│   └── EntityEditorDraftDialog.test.ts  # T014, T021 — hasDraftAxioms, blocking dialog, per-entity routing

webview-src/entity-editor/
└── EntityEditorApp.ts               # collectInvalidExpressionIndices in handleSave; saveDraftError handler;
                                     # loadEntity handler; draft-invalid CSS class and error banner

src/
└── extension.ts                     # 3 refreshEntityEditorIfOpen call sites updated to pass context + await
```

## Complexity Tracking

> No constitution violations — table is empty.
