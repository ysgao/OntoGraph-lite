import { buildRequestDepthChangeMessage, DEPTH_MIN, DEPTH_MAX } from './depthControl';
import { buildRequestRegenerateMessage, buildResetExclusionsMessage } from './exclusionControl';
import type { ExclusionMode } from './exclusionControl';
import { buildRequestDirectionChangeMessage, DEFAULT_DIRECTION } from './directionControl';
import type { LayoutDirection } from './directionControl';
import { buildRequestToggleLateralizedMessage } from './lateralizedControl';
import { buildRequestSetViewModeMessage } from './viewModeControl';
import type { ViewMode } from './viewModeControl';

// ── Types (mirrored from UmlDiagramMessages.ts — can't import from src/ in IIFE bundle) ──

interface UpdateDiagramMessage {
  type: 'updateDiagram';
  nodes: Array<{ iri: string; label: string; isRoot: boolean }>;
  edges: unknown[];
  excludedRelations: unknown[];
  focusIri: string;
  depth: number;
  direction: LayoutDirection;
  nodeCapReached: boolean;
  svg: string;
  nodesHtml: string;
  canvasWidth: number;
  canvasHeight: number;
  includeLateralized: boolean;
  viewMode: ViewMode;
}
interface SelectNodeMessage { type: 'selectNode'; iri: string; }

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();

// ── State ────────────────────────────────────────────────────────────────────

let currentFocusIri: string | undefined;
let currentDepth = 1;
let currentDirection: LayoutDirection = DEFAULT_DIRECTION;
let zoom = 1;
let currentRootIri: string | undefined;

// Nodes the user has clicked to mark for removal (not yet regenerated) — purely client-side
// until "Regenerate" is pressed. Cleared on every fresh render, since a regenerate always
// re-extracts the diagram and the marked nodes either vanish (if removed) or no longer need
// marking (if the user re-marks a different subset next).
const markedIris = new Set<string>();
// Whether the diagram currently shown already reflects a non-empty exclusion set on the
// extension host — drives the "Reset exclusions" button, since there'd be nothing to reset
// otherwise. Reset to false on refocus (a different entity), matching the host's own
// session-only exclusion lifetime.
let exclusionsCurrentlyApplied = false;

// Whether lateralized classes (e.g. "Left kidney") are currently shown — false (hidden) by
// default for a fresh focus, mirrored from the host's own `includeLateralized` on every
// `updateDiagram` message so the "Show full subhierarchy" button's label/pressed-state can't
// drift out of sync with what's actually on screen.
let includeLateralized = false;

// Which of the two, mutually exclusive views is shown ("stated" vs "inferred", spec
// 032-uml-inferred-subtypes) — 'stated' by default for a fresh focus, mirrored from the host's
// own `viewMode` on every `updateDiagram` message so the switch control can't drift out of sync
// with what's on screen.
let viewMode: ViewMode = 'stated';

// ── DOM ──────────────────────────────────────────────────────────────────────
// The diagram itself (node divs + SVG edge overlay) is computed entirely on the extension host
// (src/uml/htmlRenderer.ts) and injected here as-is — this webview has no rendering/layout logic
// of its own beyond DOM injection, event delegation, and pan/zoom/toolbar wiring.

document.body.innerHTML = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    font-family: var(--vscode-font-family); font-size: 12px;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    --uml-composition-color: #8A9990;
    --uml-composition-stroke: #6E7D74;
    --uml-generalization-color: #3A3F3B;
    --uml-generalization-fill: #F7F9F7;
  }

  #toolbar {
    display: flex; align-items: center; gap: 10px; padding: 6px 10px; flex-shrink: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    flex-wrap: wrap;
  }
  #toolbar label { display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
  #toolbar input[type=range] { width: 80px; cursor: pointer; }
  #toolbar button {
    padding: 2px 8px; cursor: pointer; border: 1px solid var(--vscode-button-border, #555);
    background: var(--vscode-button-secondaryBackground, #3a3a3a);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border-radius: 3px; font-size: 11px;
  }
  #focus-info { opacity: 0.7; font-size: 11px; max-width: 240px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #cap-banner {
    display: none; padding: 2px 8px; border-radius: 3px; font-size: 11px;
    background: #e8a80033; color: var(--vscode-foreground);
  }
  #stats { margin-left: auto; opacity: 0.7; white-space: nowrap; font-size: 11px; }

  #viewport { flex: 1; width: 100%; overflow: auto; position: relative; }
  #canvas { position: relative; transform-origin: top left; }

  .dnode {
    position: absolute; border-radius: 8px; border: 1.5px solid #4C6B7A;
    background: #DDE6EA; color: #4C6B7A;
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-size: 12px; font-weight: 600; font-family: Helvetica, Arial, sans-serif;
    padding: 4px 8px; cursor: pointer; user-select: none;
  }
  .dnode-root { background: #CFE8FA; border-color: #1F6FA0; color: #1F6FA0; }
  /* !important: this semantic indicator must show through the inline branch-color border-color
     set per node (src/uml/branchColors.ts) — inline styles otherwise always win over a class. */
  .dnode-hidden { border-style: dashed; border-color: #E8A800 !important; border-width: 2.5px; }
  .dnode-marked { outline: 3px solid #CC3333; outline-offset: 1px; opacity: 0.55; }
  .dnode .dlabel { pointer-events: none; }
  .dnode:hover { outline: 2px solid var(--vscode-focusBorder, #4090d0); }

  /* Excluded-relationship notes (src/uml/htmlRenderer.ts's renderExcludedNotes) — plain text
     below the diagram content, never attached to any class box (FR-010: surfaced, not dropped,
     but also not implying the relationship is part of the class's own shape). */
  .dnote-header { font-weight: 600; font-size: 12px; white-space: nowrap; }
  .dnote-line { font-size: 11px; opacity: 0.85; white-space: nowrap; }

  .edge-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
</style>

<div id="toolbar">
  <span style="font-weight:600;white-space:nowrap">UML Diagram</span>
  <span id="focus-info">—</span>
  <label>Depth: <input type="range" id="depth-slider" min="${DEPTH_MIN}" max="${DEPTH_MAX}" value="1">
    <span id="depth-val">1</span>
  </label>
  <label>Layout:
    <select id="direction-select">
      <option value="TB">Top → Bottom</option>
      <option value="LR" selected>Left → Right</option>
    </select>
  </label>
  <button id="btn-zoom-out" title="Zoom out">−</button>
  <button id="btn-zoom-reset" title="Reset zoom">100%</button>
  <button id="btn-zoom-in" title="Zoom in">+</button>
  <button id="btn-export-drawio" title="Export to draw.io">Export draw.io</button>
  <button id="btn-export-svg" title="Export to SVG">Export SVG</button>
  <button id="btn-export-png" title="Export to PNG (editable — requires draw.io desktop)">Export PNG</button>
  <label title="Click nodes in the diagram to mark them, then Regenerate">Remove:
    <select id="exclude-mode">
      <option value="subtree" selected>Remove subtree</option>
      <option value="splice">Keep children</option>
    </select>
  </label>
  <button id="btn-regenerate" title="Regenerate diagram without the marked nodes" disabled>Regenerate (0 marked)</button>
  <button id="btn-reset-exclusions" title="Restore all previously removed nodes" disabled>Reset exclusions</button>
  <button id="btn-toggle-lateralized" title="Lateralized classes (e.g. Left/Right variants) are hidden by default — click to show the full subhierarchy" aria-pressed="false">Show full subhierarchy</button>
  <label title="Stated: subtypes from directly-written axioms only (default). Inferred: a SEPARATE diagram built entirely from the reasoner's classified hierarchy — generalization only, no part-of, lateralized/&quot;Entire X&quot; classes hidden by default.">
    View:
    <select id="view-mode-select">
      <option value="stated" selected>Stated</option>
      <option value="inferred">Inferred</option>
    </select>
  </label>
  <span id="cap-banner">⚠ Node limit reached — some relationships are not shown</span>
  <span id="stats"></span>
</div>
<div id="viewport"><div id="canvas"></div></div>
`;

const focusInfoEl = document.getElementById('focus-info')!;
const capBannerEl = document.getElementById('cap-banner')!;
const statsEl = document.getElementById('stats')!;
const depthSlider = document.getElementById('depth-slider') as HTMLInputElement;
const depthValEl = document.getElementById('depth-val')!;
const directionSelect = document.getElementById('direction-select') as HTMLSelectElement;
const canvasEl = document.getElementById('canvas')!;
const zoomResetEl = document.getElementById('btn-zoom-reset')!;
const excludeModeEl = document.getElementById('exclude-mode') as HTMLSelectElement;
const regenerateBtn = document.getElementById('btn-regenerate') as HTMLButtonElement;
const resetExclusionsBtn = document.getElementById('btn-reset-exclusions') as HTMLButtonElement;
const toggleLateralizedBtn = document.getElementById('btn-toggle-lateralized') as HTMLButtonElement;
const viewModeSelect = document.getElementById('view-mode-select') as HTMLSelectElement;

function updateRegenerateButton(): void {
  regenerateBtn.disabled = markedIris.size === 0;
  regenerateBtn.textContent = `Regenerate (${markedIris.size} marked)`;
}

function updateToggleLateralizedButton(): void {
  toggleLateralizedBtn.setAttribute('aria-pressed', String(includeLateralized));
  toggleLateralizedBtn.textContent = includeLateralized ? 'Hide lateralized classes' : 'Show full subhierarchy';
}

// ── Diagram rendering ──────────────────────────────────────────────────────

function render(msg: UpdateDiagramMessage): void {
  canvasEl.style.width = `${msg.canvasWidth}px`;
  canvasEl.style.height = `${msg.canvasHeight}px`;
  canvasEl.innerHTML = msg.svg + msg.nodesHtml;

  currentRootIri = msg.nodes.find(n => n.isRoot)?.iri;
  focusInfoEl.textContent = msg.nodes.find(n => n.isRoot)?.label ?? msg.focusIri;
  capBannerEl.style.display = msg.nodeCapReached ? 'inline-block' : 'none';
  statsEl.textContent = `${msg.nodes.length} nodes · ${msg.edges.length} edges`;
  depthSlider.value = String(msg.depth);
  depthValEl.textContent = String(msg.depth);
  directionSelect.value = msg.direction;
  includeLateralized = msg.includeLateralized;
  updateToggleLateralizedButton();
  viewMode = msg.viewMode;
  viewModeSelect.value = viewMode;

  // Every fresh render is a new extraction — previously-marked nodes are gone from the DOM
  // already (either removed or promoted), so any stale marking state is meaningless.
  markedIris.clear();
  updateRegenerateButton();
  resetExclusionsBtn.disabled = !exclusionsCurrentlyApplied;
}

function setZoom(z: number): void {
  zoom = Math.min(3, Math.max(0.25, z));
  canvasEl.style.transform = `scale(${zoom})`;
  zoomResetEl.textContent = `${Math.round(zoom * 100)}%`;
}

// ── Click delegation ─────────────────────────────────────────────────────────
// Nodes are static HTML (no per-node listeners attached) — one delegated listener on the
// canvas handles clicks for the whole diagram, including after a re-render.

// Clicking a node toggles it as "marked for removal" — the focus entity itself can never be
// marked, since the diagram has nothing to be "about" without it (mirrors the host-side guard
// in src/uml/nodeExclusion.ts). Marking is purely client-side until "Regenerate" is pressed.
canvasEl.addEventListener('click', (evt: MouseEvent) => {
  const target = (evt.target as HTMLElement).closest('[data-iri]');
  if (!target) { return; }
  const iri = target.getAttribute('data-iri');
  if (!iri || iri === currentRootIri) { return; }

  if (markedIris.has(iri)) {
    markedIris.delete(iri);
    target.classList.remove('dnode-marked');
  } else {
    markedIris.add(iri);
    target.classList.add('dnode-marked');
  }
  updateRegenerateButton();
});

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as UpdateDiagramMessage | SelectNodeMessage;
  if (msg.type === 'updateDiagram') {
    if (msg.focusIri !== currentFocusIri) {
      // A different entity becoming the focus resets exclusions on the host side too
      // (src/commands/generateUmlDiagram.ts's `isNewFocus` check) — mirror that here so the
      // "Reset exclusions" button doesn't stay enabled for an entity that has nothing to reset.
      exclusionsCurrentlyApplied = false;
    }
    currentFocusIri = msg.focusIri;
    currentDepth = msg.depth;
    currentDirection = msg.direction;
    render(msg);
  } else if (msg.type === 'selectNode') {
    const el = canvasEl.querySelector(`[data-iri="${CSS.escape(msg.iri)}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); }
  }
});

// ── Toolbar wiring ─────────────────────────────────────────────────────────────

depthSlider.addEventListener('input', () => {
  depthValEl.textContent = depthSlider.value;
  if (currentFocusIri) {
    currentDepth = +depthSlider.value;
    vscode.postMessage(buildRequestDepthChangeMessage(currentFocusIri, currentDepth, currentDirection));
  }
});

directionSelect.addEventListener('change', () => {
  if (currentFocusIri) {
    currentDirection = directionSelect.value as LayoutDirection;
    vscode.postMessage(buildRequestDirectionChangeMessage(currentFocusIri, currentDepth, currentDirection));
  }
});

document.getElementById('btn-zoom-in')!.addEventListener('click', () => setZoom(zoom + 0.1));
document.getElementById('btn-zoom-out')!.addEventListener('click', () => setZoom(zoom - 0.1));
zoomResetEl.addEventListener('click', () => setZoom(1));

document.getElementById('btn-export-drawio')!.addEventListener('click', () => {
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestExport', format: 'drawio', iri: currentFocusIri, depth: currentDepth, direction: currentDirection });
  }
});
document.getElementById('btn-export-svg')!.addEventListener('click', () => {
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestExport', format: 'svg', iri: currentFocusIri, depth: currentDepth, direction: currentDirection });
  }
});
document.getElementById('btn-export-png')!.addEventListener('click', () => {
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestExport', format: 'png', iri: currentFocusIri, depth: currentDepth, direction: currentDirection });
  }
});

regenerateBtn.addEventListener('click', () => {
  if (!currentFocusIri || markedIris.size === 0) { return; }
  const mode = excludeModeEl.value as ExclusionMode;
  vscode.postMessage(buildRequestRegenerateMessage(currentFocusIri, currentDepth, currentDirection, [...markedIris], mode));
  exclusionsCurrentlyApplied = true;
});

resetExclusionsBtn.addEventListener('click', () => {
  if (!currentFocusIri) { return; }
  vscode.postMessage(buildResetExclusionsMessage(currentFocusIri, currentDepth, currentDirection));
  exclusionsCurrentlyApplied = false;
});

toggleLateralizedBtn.addEventListener('click', () => {
  if (!currentFocusIri) { return; }
  includeLateralized = !includeLateralized;
  updateToggleLateralizedButton();
  vscode.postMessage(buildRequestToggleLateralizedMessage(currentFocusIri, currentDepth, currentDirection, includeLateralized));
});

viewModeSelect.addEventListener('change', () => {
  if (!currentFocusIri) { return; }
  viewMode = viewModeSelect.value as ViewMode;
  vscode.postMessage(buildRequestSetViewModeMessage(currentFocusIri, currentDepth, currentDirection, viewMode));
});

// ── Signal ready ──────────────────────────────────────────────────────────────
// The extension host already knows the focus IRI from the command invocation and sends
// the initial diagram directly in response to 'ready' (see src/commands/generateUmlDiagram.ts) —
// mirrors the existing Graph view's webview, which likewise only signals readiness here.

vscode.postMessage({ type: 'ready' });
