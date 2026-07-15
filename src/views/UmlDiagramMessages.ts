import type { DiagramNode, DiagramEdge, ExcludedRelation, LayoutDirection } from '../uml/diagramModel';
import type { ExclusionMode } from '../uml/nodeExclusion';

export type { LayoutDirection };

// ── Extension → Webview ─────────────────────────────────────────────────────

export interface UpdateDiagramMessage {
  type: 'updateDiagram';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  excludedRelations: ExcludedRelation[];
  focusIri: string;
  depth: number;
  /** Layout flow direction used to compute `nodes[].x/y` (`src/uml/layout.ts`) — echoes the
   *  request so the webview can keep its direction toggle in sync, same convention as `depth`. */
  direction: LayoutDirection;
  nodeCapReached: boolean;
  /** Pre-rendered HTML/SVG fragment (`src/uml/htmlRenderer.ts`) — the webview injects this
   *  directly rather than computing any layout/routing of its own (see
   *  `src/commands/generateUmlDiagram.ts`'s `buildDiagramMessage`). */
  svg: string;
  nodesHtml: string;
  canvasWidth: number;
  canvasHeight: number;
  /** Echoes the host's current "show full subhierarchy" toggle state, same convention as
   *  `depth`/`direction` — lets the webview keep its toolbar button in sync. Lateralized classes
   *  (own a "Laterality some Left/Right" restriction, `src/uml/partOfGraph.ts`) are hidden by
   *  default at EVERY depth (recomputed fresh on every render, not seeded once) unless this is
   *  `true`. */
  includeLateralized: boolean;
}

export interface SelectNodeMessage {
  type: 'selectNode';
  iri: string;
}

export interface ExportCompleteMessage {
  type: 'exportComplete';
  format: 'drawio' | 'svg' | 'png';
}

// ── Webview → Extension ─────────────────────────────────────────────────────

export interface ReadyMessage { type: 'ready'; }

export interface RequestDiagramMessage {
  type: 'requestDiagram';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

export interface RequestDepthChangeMessage {
  type: 'requestDepthChange';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

/** Sent whenever the user toggles the layout-direction control (mirrors
 *  `RequestDepthChangeMessage`'s own control) — the extension host re-runs layout at the new
 *  direction (same depth) and responds with `updateDiagram`. */
export interface RequestDirectionChangeMessage {
  type: 'requestDirectionChange';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

export interface NodeClickedMessage { type: 'nodeClicked'; iri: string; }

export interface RequestExportMessage {
  type: 'requestExport';
  format: 'drawio' | 'svg' | 'png';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

/** Sent when the user clicks "Regenerate" after marking one or more nodes for removal
 *  (`src/uml/nodeExclusion.ts` applies `excludeIris` in the chosen `mode`). The extension host
 *  remembers this as the new current exclusion set for the focus entity — it stays applied
 *  across subsequent depth changes for the same entity, and resets only when a different entity
 *  becomes the focus. */
export interface RequestRegenerateMessage {
  type: 'requestRegenerate';
  iri: string;
  depth: number;
  direction: LayoutDirection;
  excludeIris: string[];
  mode: ExclusionMode;
}

/** Clears the current exclusion set for the focus entity and regenerates the full diagram. Does
 *  NOT affect the lateralized-classes toggle (`RequestToggleLateralizedMessage`) — that's an
 *  independent, dedicated control, not folded into the general exclusion set. */
export interface ResetExclusionsMessage {
  type: 'resetExclusions';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

/** Sent when the user clicks the "Show full subhierarchy" toolbar button — toggles whether
 *  lateralized classes (own a "Laterality some Left/Right" restriction) are included in the
 *  diagram. `include: true` reveals them; `include: false` (the default for a fresh focus
 *  session) hides them again at every depth. Independent of `RequestRegenerateMessage`'s
 *  user-marked exclusion set — clicking "Reset exclusions" does not change this. */
export interface RequestToggleLateralizedMessage {
  type: 'requestToggleLateralized';
  iri: string;
  depth: number;
  direction: LayoutDirection;
  include: boolean;
}

export type ExtToWebview = UpdateDiagramMessage | SelectNodeMessage | ExportCompleteMessage;
export type WebviewToExt  = ReadyMessage | RequestDiagramMessage
                           | RequestDepthChangeMessage | RequestDirectionChangeMessage
                           | NodeClickedMessage | RequestExportMessage
                           | RequestRegenerateMessage | ResetExclusionsMessage
                           | RequestToggleLateralizedMessage;
