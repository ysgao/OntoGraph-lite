import type {
  DLQueryExtToWebview,
  DLQueryWebviewToExt,
  DLQueryType,
  ResultGroup,
  EntityRef,
} from '../../src/views/DLQueryMessages.js';
import { DL_QUERY_TYPE_LABELS, DEFAULT_QUERY_TYPES } from '../../src/views/DLQueryMessages.js';
import { filterGroups } from './DLQueryFilters.js';

declare function acquireVsCodeApi(): {
  postMessage(msg: DLQueryWebviewToExt): void;
};

const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────

const ALL_QUERY_TYPES: DLQueryType[] = [
  'directSuperClasses',
  'superClasses',
  'equivalentClasses',
  'directSubClasses',
  'subClasses',
  'instances',
];

let rawGroups: ResultGroup[] = [];
let showOwlThing   = true;
let showOwlNothing = true;
let nameFilter     = '';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const textarea      = document.getElementById('expression')      as HTMLTextAreaElement;
const executeBtn    = document.getElementById('execute')         as HTMLButtonElement;
const resultsList   = document.getElementById('results-list')    as HTMLDivElement;
const nameFilterEl  = document.getElementById('name-filter')     as HTMLInputElement;
const owlThingCb    = document.getElementById('show-owl-thing')  as HTMLInputElement;
const owlNothingCb  = document.getElementById('show-owl-nothing')as HTMLInputElement;

const checkboxes = new Map<DLQueryType, HTMLInputElement>();
for (const qt of ALL_QUERY_TYPES) {
  const el = document.getElementById(`qt-${qt}`) as HTMLInputElement;
  if (el) { checkboxes.set(qt, el); }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render(): void {
  resultsList.innerHTML = '';

  const filtered = filterGroups(rawGroups, nameFilter, showOwlThing, showOwlNothing);

  if (filtered.length === 0 && rawGroups.length > 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No results match the current filters.';
    resultsList.appendChild(empty);
    return;
  }

  for (const group of filtered) {
    const section = document.createElement('div');
    section.className = 'result-group';

    const heading = document.createElement('div');
    heading.className = 'result-group-label';
    heading.textContent = group.label;
    section.appendChild(heading);

    const ul = document.createElement('ul');
    for (const entity of group.entities) {
      const li = renderEntityItem(entity);
      ul.appendChild(li);
    }
    section.appendChild(ul);
    resultsList.appendChild(section);
  }
}

function renderEntityItem(entity: EntityRef): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'entity-item';
  li.textContent = entity.label;
  li.title = entity.iri;
  li.addEventListener('click', () => {
    vscode.postMessage({ type: 'navigate', iri: entity.iri, entityType: entity.entityType });
  });
  return li;
}

function showLoading(): void {
  resultsList.innerHTML = '<div class="loading">Querying…</div>';
}

function showError(message: string): void {
  const div = document.createElement('div');
  div.className = 'error-state';
  div.textContent = message;
  resultsList.innerHTML = '';
  resultsList.appendChild(div);
}

function showEmpty(): void {
  resultsList.innerHTML = '<div class="empty-state">No results.</div>';
}

function setExecuteEnabled(enabled: boolean): void {
  executeBtn.disabled = !enabled;
}

// ── Event handlers ─────────────────────────────────────────────────────────────

executeBtn.addEventListener('click', () => {
  const expression = textarea.value.trim();
  if (!expression) {
    showError('Enter a class expression.');
    return;
  }
  const queryTypes = ALL_QUERY_TYPES.filter(qt => checkboxes.get(qt)?.checked);
  if (queryTypes.length === 0) {
    showError('Select at least one query type.');
    return;
  }
  vscode.postMessage({ type: 'execute', classExpression: expression, queryTypes });
});

nameFilterEl.addEventListener('input', () => {
  nameFilter = nameFilterEl.value;
  render();
});

owlThingCb.addEventListener('change', () => {
  showOwlThing = owlThingCb.checked;
  render();
});

owlNothingCb.addEventListener('change', () => {
  showOwlNothing = owlNothingCb.checked;
  render();
});

// ── Message handling ──────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as DLQueryExtToWebview;
  switch (msg.type) {
    case 'ontologyStatus':
      setExecuteEnabled(msg.hasOntology);
      break;
    case 'dlQueryLoading':
      rawGroups = [];
      showLoading();
      break;
    case 'dlQueryResult':
      rawGroups = msg.groups;
      if (rawGroups.length === 0) {
        showEmpty();
      } else {
        render();
      }
      break;
    case 'dlQueryError':
      rawGroups = [];
      showError(msg.message);
      break;
  }
});

// ── Init ───────────────────────────────────────────────────────────────────────

for (const qt of ALL_QUERY_TYPES) {
  const el = checkboxes.get(qt);
  if (el) { el.checked = DEFAULT_QUERY_TYPES.includes(qt); }
}
owlThingCb.checked   = true;
owlNothingCb.checked = true;
setExecuteEnabled(false);

vscode.postMessage({ type: 'ready' });
