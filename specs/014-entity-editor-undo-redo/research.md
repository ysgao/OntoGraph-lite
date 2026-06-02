# Research: Entity Editor Undo/Redo

**Feature**: 014-entity-editor-undo-redo  
**Date**: 2026-06-02

## Decision Log

### D-001: Checkpoint Storage Format

**Decision**: Store checkpoints as a typed `EntitySnapshot` object mirroring the shape of `LoadEntityMessage` (the data needed to restore the webview display). Snapshot is taken from model state _before_ each save is applied.

**Rationale**: `LoadEntityMessage` is the canonical format for rendering entity state in the webview. Storing in the same shape means undo/redo just re-sends a LoadEntityMessage with snapshot data — zero format conversion.

**Alternatives considered**:
- Store `SaveEntityMessage` payloads (rejected: different field shaping — SaveEntityMessage uses arrays for labels/annotations keyed differently than LoadEntityMessage; converting back to LoadEntityMessage format on every undo adds unnecessary complexity).
- Diff-based storage (rejected: overkill for session-scoped history with max 50 entries; full snapshots are simpler and more debuggable).

---

### D-002: Where History Lives

**Decision**: Extension host (`EntityEditorPanel.ts` + new `EntityEditHistory.ts`). The webview is stateless with respect to history.

**Rationale**: The extension holds the canonical model and mediates all persistence. Keeping history in the extension maintains a single source of truth. The webview is a sandboxed renderer that can be destroyed and recreated (e.g., when the panel is moved to another editor group) — history stored there would be lost.

**Alternatives considered**:
- Client-side (webview) history (rejected: panel destruction causes history loss; webview state is not trusted for authoritative data).
- Shared state in a separate module (rejected: premature abstraction — a `Map` on `EntityEditorPanel` is sufficient).

---

### D-003: Trigger for Initial Checkpoint

**Decision**: Capture the initial checkpoint immediately after the extension sends `LoadEntityMessage` to the webview (i.e., when the entity is first loaded into the editor in a session). This snapshot represents the "no prior saves" baseline.

**Rationale**: Ensures the user can always undo the very first save of a session, restoring to the state the entity was in when they opened it.

**Alternatives considered**:
- Capture on first save only (rejected: user cannot undo the first edit of a session).
- Capture when webview sends `'ready'` message (rejected: race condition — the ready message may arrive before LoadEntityMessage is constructed; simpler to capture at the point the extension already has the full entity snapshot ready).

---

### D-004: Undo/Redo on External File Change

**Decision**: When the file watcher detects an external modification and the panel reloads the entity, clear the entity's full undo/redo history before loading the new snapshot as the fresh initial checkpoint.

**Rationale**: External changes break checkpoint continuity — disk content no longer matches any prior checkpoint. Stale history would restore values that conflict with the externally-modified file, potentially losing the external changes silently.

**Alternatives considered**:
- Preserve history across external changes (rejected: checkpoints built from old model state are semantically invalid after an external edit).
- Warn user before clearing (rejected: adds UI complexity; clearing silently on reload is consistent with how editor reload works for other state).

---

### D-005: Undo/Redo Button Placement and Keyboard Shortcuts

**Decision**: Add Undo and Redo icon buttons to the entity editor toolbar alongside the existing Save button. Wire standard keyboard shortcuts: Ctrl+Z / ⌘Z for undo, Ctrl+Shift+Z / ⌘Shift+Z for redo. Disable buttons (greyed-out + `disabled` attribute) when no undo/redo history is available.

**Rationale**: Standard placement and key bindings minimize learning curve. Disable state visually communicates boundary conditions (FR-005, FR-006).

**Alternatives considered**:
- Keyboard shortcuts only, no buttons (rejected: discoverability; spec requires controls to be visible and labeled — SC-003).
- VS Code command palette entries (can be added later as enhancement; not required by spec).

---

### D-006: Stack Depth and Memory

**Decision**: Max 50 checkpoints per entity per session. When the limit is reached, the oldest checkpoint is dropped (circular buffer or shift). For a typical entity with ~20 annotation fields and a few axioms, one snapshot is roughly 2–5 KB; 50 checkpoints ≈ 100–250 KB per entity — negligible.

**Rationale**: FR-009 requires at least 50 checkpoints. No upper memory concern at this scale.

**Alternatives considered**:
- Unlimited history (rejected: minor unbounded growth risk for long sessions; a cap makes behavior predictable).
- Fewer checkpoints (rejected: spec floor is 50).

---

## Resolved Edge Cases

| Edge Case | Resolution |
|-----------|-----------|
| Undo with no prior saves | Undo button disabled; no action taken (FR-005) |
| Redo at most recent state | Redo button disabled; no action taken (FR-006) |
| Save after undo | Redo stack cleared; new save becomes top of undo stack (FR-007) |
| Close and reopen entity editor | History cleared on panel dispose; fresh initial checkpoint on reload |
| External file modification | History cleared; reloaded state becomes new initial checkpoint (D-004) |
| Switch between entities in same panel | Per-entity history preserved independently (FR-008); EntityEditHistory keyed by IRI |
| History depth exceeded | Oldest checkpoint dropped (D-006) |
