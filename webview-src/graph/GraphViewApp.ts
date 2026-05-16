import cytoscape, { ElementDefinition } from 'cytoscape';
// @ts-ignore — no types for cytoscape-dagre
import cytoscapeDagre from 'cytoscape-dagre';

cytoscape.use(cytoscapeDagre);

// ── Types (mirrored from GraphViewMessages.ts — can't import from src/ in IIFE bundle) ──

interface GraphNode {
  id: string;
  label: string;
  type: 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';
  isRoot?: boolean;
  isInferred?: boolean;
}
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'subClassOf' | 'equivalentTo' | 'disjointWith' | 'subPropertyOf'
      | 'domain' | 'range' | 'type' | 'inverseOf' | 'inferred';
  label?: string;
  isInferred?: boolean;
}
interface UpdateGraphMessage { type: 'updateGraph'; nodes: GraphNode[]; edges: GraphEdge[]; focusIri?: string; }
interface SelectNodeMessage  { type: 'selectNode'; iri: string; }

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();

// ── State ────────────────────────────────────────────────────────────────────

let cy: cytoscape.Core | undefined;
let currentFocusIri: string | undefined;
let currentDepth = 1;
let showInferred = true;
let showDisjoint = false;
let layoutMode: 'dagre' | 'cose' = 'cose';

// ── DOM ──────────────────────────────────────────────────────────────────────

document.body.innerHTML = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { display: flex; flex-direction: column; height: 100vh; overflow: hidden;
         font-family: var(--vscode-font-family); font-size: 12px;
         background: var(--vscode-editor-background);
         color: var(--vscode-foreground); }

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
  #toolbar button.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }
  #stats { margin-left: auto; opacity: 0.7; white-space: nowrap; font-size: 11px; }
  #focus-info { opacity: 0.7; font-size: 11px; max-width: 200px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  #cy { flex: 1; width: 100%; }

  #hint { position: absolute; bottom: 8px; right: 10px; opacity: 0.5; font-size: 10px;
    pointer-events: none; }
</style>

<div id="toolbar">
  <span style="font-weight:600;white-space:nowrap">Graph View</span>
  <span id="focus-info">—</span>
  <label>Depth: <input type="range" id="depth-slider" min="1" max="5" value="1">
    <span id="depth-val">1</span>
  </label>
  <label><input type="checkbox" id="cb-inferred" checked> Inferred</label>
  <label><input type="checkbox" id="cb-disjoint"> Disjoint</label>
  <button id="btn-dagre" title="Top-down hierarchical layout">Hierarchical</button>
  <button id="btn-cose" class="active" title="Force-directed layout">Force</button>
  <span id="stats"></span>
</div>
<div id="cy"></div>
<div id="hint">Click to select · Double-click to expand · Scroll to zoom</div>
`;

const depthSlider   = document.getElementById('depth-slider') as HTMLInputElement;
const depthVal      = document.getElementById('depth-val')!;
const cbInferred    = document.getElementById('cb-inferred') as HTMLInputElement;
const cbDisjoint    = document.getElementById('cb-disjoint') as HTMLInputElement;
const btnDagre      = document.getElementById('btn-dagre')!;
const btnCose       = document.getElementById('btn-cose')!;
const statsEl       = document.getElementById('stats')!;
const focusInfoEl   = document.getElementById('focus-info')!;

// ── Cytoscape styles ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CY_STYLES: any[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': 11,
      'text-wrap': 'wrap',
      'text-max-width': 130,
      'text-valign': 'center',
      'text-halign': 'center',
      color: '#fff',
      'min-zoomed-font-size': 6,
    },
  },
  {
    selector: 'node[type="class"]',
    style: {
      shape: 'roundrectangle',
      'background-color': '#2a7de1',
      width: 'label', height: 'label',
      'padding-top': '8px', 'padding-bottom': '8px',
      'padding-left': '10px', 'padding-right': '10px',
    },
  },
  {
    selector: 'node[type="class"][?isRoot]',
    style: { 'background-color': '#e05c2a', 'border-width': 3, 'border-color': '#ff9966' },
  },
  {
    selector: 'node[type="class"][?isInferred]',
    style: { 'background-color': '#5a9fe8', 'border-style': 'dashed', 'border-color': '#aac8f0', 'border-width': 2 },
  },
  {
    selector: 'node[type="objectProperty"]',
    style: { shape: 'diamond', 'background-color': '#c97820', color: '#fff', width: 110, height: 40 },
  },
  {
    selector: 'node[type="dataProperty"]',
    style: { shape: 'ellipse', 'background-color': '#2a9e5a', color: '#fff', width: 100, height: 36 },
  },
  {
    selector: 'node[type="annotationProperty"]',
    style: { shape: 'ellipse', 'background-color': '#7e4ca8', color: '#fff', width: 100, height: 36 },
  },
  {
    selector: 'node[type="individual"]',
    style: { shape: 'ellipse', 'background-color': '#b8a800', color: '#fff', width: 90, height: 36 },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#fff', 'border-opacity': 0.9 },
  },
  // Edges
  {
    selector: 'edge',
    style: { 'curve-style': 'bezier', 'font-size': 9, color: '#aaa', 'text-rotation': 'autorotate' },
  },
  {
    selector: 'edge[type="subClassOf"]',
    style: {
      'line-color': '#888', 'target-arrow-color': '#888',
      'target-arrow-shape': 'triangle', width: 1.5,
    },
  },
  {
    selector: 'edge[type="inferred"]',
    style: {
      'line-color': '#5a9fe8', 'target-arrow-color': '#5a9fe8',
      'target-arrow-shape': 'triangle', width: 1.5, 'line-style': 'dashed',
    },
  },
  {
    selector: 'edge[type="equivalentTo"]',
    style: {
      'line-color': '#e8a800', 'target-arrow-color': '#e8a800',
      'source-arrow-color': '#e8a800', 'source-arrow-shape': 'circle',
      'target-arrow-shape': 'circle', width: 2, 'line-style': 'dashed',
    },
  },
  {
    selector: 'edge[type="disjointWith"]',
    style: {
      'line-color': '#cc3333', 'target-arrow-color': '#cc3333',
      'target-arrow-shape': 'tee', width: 1.5, 'line-style': 'dotted',
    },
  },
  {
    selector: 'edge[type="domain"],[type="range"]',
    style: {
      'line-color': '#c97820', 'target-arrow-color': '#c97820',
      'target-arrow-shape': 'vee', width: 1.2, 'line-style': 'dotted',
      label: 'data(label)',
    },
  },
  {
    selector: 'edge[type="type"]',
    style: {
      'line-color': '#b8a800', 'target-arrow-color': '#b8a800',
      'target-arrow-shape': 'triangle', width: 1, 'line-style': 'dotted',
    },
  },
  {
    selector: 'edge:selected',
    style: { 'line-color': '#fff', 'target-arrow-color': '#fff', width: 3 },
  },
];

// ── Graph initialization / update ─────────────────────────────────────────────

function initCy(nodes: GraphNode[], edges: GraphEdge[]): void {
  if (cy) { cy.destroy(); }

  const elements: ElementDefinition[] = [
    ...nodes.map(n => ({
      data: {
        id: n.id, label: n.label, type: n.type,
        isRoot: n.isRoot || undefined,
        isInferred: n.isInferred || undefined,
      },
    })),
    ...edges.map(e => ({
      data: {
        id: e.id, source: e.source, target: e.target,
        type: e.type, label: e.label ?? '',
        isInferred: e.isInferred || undefined,
      },
    })),
  ];

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    style: CY_STYLES,
    layout: buildLayout(),
    minZoom: 0.05,
    maxZoom: 4,
    wheelSensitivity: 0.3,
  });

  cy.on('tap', 'node', evt => {
    const iri: string = evt.target.id();
    vscode.postMessage({ type: 'nodeClicked', iri });
  });

  cy.on('dblclick dbltap', 'node', evt => {
    const iri: string = evt.target.id();
    vscode.postMessage({
      type: 'requestNeighborhood', iri,
      depth: currentDepth,
      showInferred,
      showDisjoint,
    });
  });

  statsEl.textContent = `${nodes.length} nodes · ${edges.length} edges`;
}

function buildLayout(): cytoscape.LayoutOptions {
  if (layoutMode === 'dagre') {
    return {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 60,
      rankSep: 80,
      animate: true,
      animationDuration: 250,
      fit: true,
      padding: 30,
    } as cytoscape.LayoutOptions;
  }
  return {
    name: 'cose',
    animate: true,
    animationDuration: 400,
    fit: true,
    padding: 30,
    nodeRepulsion: () => 8000,
    idealEdgeLength: () => 100,
    nodeOverlap: 10,
  } as cytoscape.LayoutOptions;
}

function runLayout(): void {
  if (!cy) { return; }
  cy.layout(buildLayout()).run();
}

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as UpdateGraphMessage | SelectNodeMessage;
  if (msg.type === 'updateGraph') {
    currentFocusIri = msg.focusIri;
    focusInfoEl.textContent = msg.focusIri
      ? labelOf(msg.nodes, msg.focusIri)
      : `${msg.nodes.length} entities`;
    initCy(msg.nodes, msg.edges);
  } else if (msg.type === 'selectNode') {
    if (!cy) { return; }
    const node = cy.$(`#${CSS.escape(msg.iri)}`);
    if (node.length > 0) {
      cy.animate({ fit: { eles: node, padding: 60 }, duration: 300 });
      cy.$(':selected').unselect();
      node.select();
    }
  }
});

function labelOf(nodes: GraphNode[], iri: string): string {
  return nodes.find(n => n.id === iri)?.label ?? iri.split(/[#/]/).pop() ?? iri;
}

// ── Toolbar wiring ─────────────────────────────────────────────────────────────

depthSlider.addEventListener('input', () => {
  currentDepth = +depthSlider.value;
  depthVal.textContent = String(currentDepth);
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestNeighborhood', iri: currentFocusIri, depth: currentDepth, showInferred, showDisjoint });
  }
});

cbInferred.addEventListener('change', () => {
  showInferred = cbInferred.checked;
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestNeighborhood', iri: currentFocusIri, depth: currentDepth, showInferred, showDisjoint });
  }
});

cbDisjoint.addEventListener('change', () => {
  showDisjoint = cbDisjoint.checked;
  if (currentFocusIri) {
    vscode.postMessage({ type: 'requestNeighborhood', iri: currentFocusIri, depth: currentDepth, showInferred, showDisjoint });
  }
});

btnDagre.addEventListener('click', () => {
  layoutMode = 'dagre';
  btnDagre.classList.add('active');
  btnCose.classList.remove('active');
  runLayout();
});

btnCose.addEventListener('click', () => {
  layoutMode = 'cose';
  btnCose.classList.add('active');
  btnDagre.classList.remove('active');
  runLayout();
});

// ── Signal ready ──────────────────────────────────────────────────────────────

vscode.postMessage({ type: 'ready' });
