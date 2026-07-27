# Contract Delta: Extension ↔ UML Diagram Webview messages

Updates `specs/026-generate-uml-diagram/contracts/uml-diagram-messages.md`. This document
reflects the SECOND implementation refinement (Stated/Inferred are two separate views, switched
via a control, never merged) — it supersedes an earlier version of this file that assumed
inferred-subtype inclusion was an additive tick-box. See `spec.md`'s Assumptions for the history.

## `updateDiagram` (existing message — delta on `edges` item shape and one new field)

| Field | Type | Notes |
|---|---|---|
| `edges` | `DiagramEdge[]` | See `data-model.md` — each edge now optionally carries `isInferred?: boolean`, meaningful only when `viewMode === 'inferred'`. Optional, not required: every pre-existing edge-construction call site and test fixture never sets it. |
| `viewMode` | `'stated' \| 'inferred'` | **New.** Echoes the host's current Stated/Inferred switch state, same convention as `includeLateralized`. `'stated'` for a fresh focus session. |

## `requestSetViewMode` (new webview → extension message, replaces the first refinement's `requestToggleInferred`)

Sent when the user changes the Stated/Inferred switch control.

| Field | Type | Notes |
|---|---|---|
| `type` | `'requestSetViewMode'` | |
| `iri` | `string` | Focus entity (unchanged) |
| `depth` | `number` | Current depth-control value |
| `direction` | `LayoutDirection` | Current layout direction |
| `mode` | `'stated' \| 'inferred'` | The view to switch to |

## Backward compatibility

The webview bundle and extension host are versioned and shipped together (single VSIX), so there is
no cross-version compatibility concern — both sides of this message channel are rebuilt from the
same commit.

## No other contract changes

- `requestDiagram`, `requestDepthChange`, `requestDirectionChange`, `requestExport`,
  `requestRegenerate`, `resetExclusions`, `requestToggleLateralized`, `ready`, `selectNode` — all
  unchanged, per `specs/026-generate-uml-diagram/contracts/uml-diagram-messages.md`. Note
  `requestToggleLateralized` now ALSO reveals "Entire X" classes when the current view is
  Inferred (spec FR-006/FR-013) — same message, same field shape, contextual meaning per view.
- `specs/026-generate-uml-diagram/contracts/uml-diagram-settings.md` (workspace settings contract)
  — unchanged; the view-mode switch is per-focus-session UI state
  (`currentViewMode` in `generateUmlDiagram.ts`), not a persisted workspace setting, same as
  the existing lateralized toggle.
