# Implementation Plan: Entity Editor Undo/Redo

**Branch**: `014-entity-editor-undo-redo` | **Date**: 2026-06-02 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/014-entity-editor-undo-redo/spec.md`

## Summary

Add save-checkpoint-based undo/redo to the entity editor. Each explicit save captures a snapshot of the entity's pre-save state on the extension host. Undo/redo messages from the webview cause the extension to replay snapshots back into the editor via the existing `LoadEntityMessage` channel. Nothing is written to disk on undo/redo — disk writes happen only on explicit save.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js (extension host), Browser (webview iframe)  
**Primary Dependencies**: VS Code Extension API (existing), existing webview message bus (`postMessage`)  
**Storage**: In-memory only — `Map<entityIri, EntityEditHistory>` on the extension host; no persistence  
**Testing**: Vitest 1.6.0 (`npm test`)  
**Target Platform**: VS Code desktop extension host + sandboxed webview iframe  
**Project Type**: VS Code extension feature addition  
**Performance Goals**: Undo/redo round-trip (message → webview restore) < 1 s; stack operations O(1)  
**Constraints**: Session-scoped only (history discarded on extension deactivation or panel close); max 50 checkpoints per entity  
**Scale/Scope**: Per-entity history; no class-hierarchy iteration; no Worker Thread or Java interaction

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | PASS | `EntityEditHistory.ts` unit tests written before implementation; EntityEditorPanel integration tests extended |
| II. Simplicity & YAGNI | PASS | Plain in-memory undo/redo stack — no abstraction beyond a class with `push/undo/redo` and a `Map` in the panel |
| III. OWL Standards Compliance | PASS | No serializer changes; undo/redo never writes to disk until explicit save |
| IV. Scale-Aware Architecture | PASS | No hierarchy iteration; no benchmark required |
| V. Security & Safety | PASS | No new IRI parsing, shell strings, or external inputs; message payloads are validated by existing handler |

No violations — Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/014-entity-editor-undo-redo/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── entity-editor-messages.md   # Phase 1 output — new message types
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code

```text
src/views/
├── EntityEditHistory.ts        # NEW — EntityEditHistory class + SaveCheckpoint type
├── EntityEditHistory.test.ts   # NEW — unit tests (red-green before implementation)
├── EntityEditorMessages.ts     # MODIFY — add UndoRequestMessage, RedoRequestMessage, UndoRedoStateMessage
└── EntityEditorPanel.ts        # MODIFY — integrate EntityEditHistory; handle undo/redo messages; capture snapshots on load + save

webview-src/entity-editor/
└── EntityEditorApp.ts          # MODIFY — add Undo/Redo toolbar buttons; disable/enable per UndoRedoStateMessage; send undo/redo messages on click/keyboard shortcut
```

**Structure Decision**: Single-project layout; all changes within existing `src/views/` and `webview-src/entity-editor/` directories. No new top-level directories required.
