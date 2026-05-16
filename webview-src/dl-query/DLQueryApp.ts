import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { StringStream } from '@codemirror/language';
import type {
  DLQueryExtToWebview,
  DLQueryWebviewToExt,
  DLQueryType,
  ResultGroup,
  EntityRef,
  CompletionItem,
  ValidationError,
} from '../../src/views/DLQueryMessages.js';
import { DL_QUERY_TYPE_LABELS, DEFAULT_QUERY_TYPES } from '../../src/views/DLQueryMessages.js';
import { filterGroups } from './DLQueryFilters.js';
import { formatManchesterForDisplay, stripAndContinuations } from '../../src/utils/ManchesterFormatting';

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

let nextReqId = 0;
const pendingCompletions = new Map<number, (items: CompletionItem[]) => void>();
const pendingValidations = new Map<number, (errors: ValidationError[]) => void>();

// ── Manchester syntax ─────────────────────────────────────────────────────────

const MANCHESTER_KEYWORDS = new Set([
  'some', 'all', 'value', 'min', 'max', 'exactly', 'only',
  'and', 'or', 'not', 'that', 'Self',
]);

const manchesterLanguage = StreamLanguage.define({
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) { return null; }
    if (stream.match(/^#.*/)) { return 'comment'; }
    if (stream.peek() === '<') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '>') { stream.next(); }
      if (stream.peek() === '>') { stream.next(); }
      return 'string';
    }
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === '\\') { stream.next(); }
        stream.next();
      }
      if (stream.peek() === '"') { stream.next(); }
      return 'string';
    }
    if (stream.peek() === "'") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "'") {
        if (stream.peek() === '\\') { stream.next(); }
        stream.next();
      }
      if (stream.peek() === "'") { stream.next(); }
      return 'variableName';
    }
    if (stream.match(/^\d+(\.\d+)?/)) { return 'number'; }
    const word = stream.match(/^[A-Za-z_][\w-]*/);
    const w = typeof word === 'object' ? (word as RegExpMatchArray)[0] : '';
    if (MANCHESTER_KEYWORDS.has(w)) { return 'keyword'; }
    if (stream.peek() === ':') {
      stream.next();
      stream.match(/^[\w-]*/);
      return 'variableName';
    }
    return 'variableName';
  },
});

// ── Autocompletion ────────────────────────────────────────────────────────────

async function manchesterCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  const word = context.matchBefore(/'[^']*'?|[\w:_-]{2,}/);
  if (!word) { return null; }

  let prefix = word.text;
  if (prefix.startsWith("'")) {
    prefix = prefix.slice(1);
    if (prefix.endsWith("'")) { prefix = prefix.slice(0, -1); }
    // Closing quote of previous label was mistaken for opening quote; prefix has a leading space
    if (!/^[A-Za-z0-9]/.test(prefix)) { return null; }
  } else {
    // Unquoted Manchester keywords are not entity names
    if (MANCHESTER_KEYWORDS.has(prefix)) { return null; }
  }

  const reqId = nextReqId++;
  const items = await new Promise<CompletionItem[]>((resolve) => {
    const timer = setTimeout(() => { pendingCompletions.delete(reqId); resolve([]); }, 400);
    pendingCompletions.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
    vscode.postMessage({ type: 'requestCompletion', requestId: reqId, prefix });
  });

  if (items.length === 0) { return null; }

  const userQuoted = word.text.startsWith("'");
  return {
    from: word.from,
    validFor: /^'[^']*'?$|^[\w:_-]+$/,
    options: items.map(item => {
      const needsQuotes = userQuoted || /\s/.test(item.label);
      const applyStr = needsQuotes ? `'${item.label}'` : item.label;
      return { label: applyStr, displayLabel: item.label, info: item.iri };
    }),
  };
}

// ── Linting ───────────────────────────────────────────────────────────────────

async function manchesterLinter(view: EditorView): Promise<Diagnostic[]> {
  const text = view.state.doc.toString();
  if (!text.trim()) { return []; }

  const reqId = nextReqId++;
  const errors = await new Promise<ValidationError[]>((resolve) => {
    const timer = setTimeout(() => { pendingValidations.delete(reqId); resolve([]); }, 2000);
    pendingValidations.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
    vscode.postMessage({ type: 'validate', requestId: reqId, text });
  });

  return errors.map(e => ({ from: e.from, to: e.to, severity: e.severity, message: e.message }));
}

// ── VS Code theme ─────────────────────────────────────────────────────────────

const vsCodeTheme = EditorView.theme({
  '&': {
    color: 'var(--vscode-editor-foreground)',
    backgroundColor: 'var(--vscode-input-background)',
    fontFamily: 'var(--vscode-editor-font-family, var(--vscode-font-family))',
    fontSize: 'var(--vscode-editor-font-size, var(--vscode-font-size))',
  },
  '.cm-content': {
    caretColor: 'var(--vscode-editorCursor-foreground)',
    padding: '4px 6px',
    minHeight: '2em',
  },
  '.cm-cursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--vscode-editor-selectionBackground)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    background: 'var(--vscode-editorSuggestWidget-background)',
    border: '1px solid var(--vscode-editorSuggestWidget-border)',
    color: 'var(--vscode-editorSuggestWidget-foreground)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--vscode-editorSuggestWidget-selectedBackground)',
    color: 'var(--vscode-editorSuggestWidget-selectedForeground)',
  },
});

// ── Editor creation ───────────────────────────────────────────────────────────

function createExpressionEditor(parent: HTMLElement): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        manchesterLanguage,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        autocompletion({ override: [manchesterCompletionSource] }),
        linter(manchesterLinter, { delay: 400 }),
        vsCodeTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const raw = update.state.doc.toString();
            const logical = stripAndContinuations(raw);
            const reformatted = formatManchesterForDisplay(logical);
            if (reformatted !== raw && raw.trimEnd() !== reformatted) {
              update.view.dispatch({
                changes: { from: 0, to: raw.length, insert: reformatted },
              });
            }
          }
        }),
      ],
    }),
    parent,
  });
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const editorContainer = document.getElementById('expression-editor') as HTMLDivElement;
const executeBtn      = document.getElementById('execute')           as HTMLButtonElement;
const resultsList     = document.getElementById('results-list')      as HTMLDivElement;
const nameFilterEl    = document.getElementById('name-filter')       as HTMLInputElement;
const owlThingCb      = document.getElementById('show-owl-thing')    as HTMLInputElement;
const owlNothingCb    = document.getElementById('show-owl-nothing')  as HTMLInputElement;

const checkboxes = new Map<DLQueryType, HTMLInputElement>();
for (const qt of ALL_QUERY_TYPES) {
  const el = document.getElementById(`qt-${qt}`) as HTMLInputElement;
  if (el) { checkboxes.set(qt, el); }
}

const editor = createExpressionEditor(editorContainer);

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
  const expression = stripAndContinuations(editor.state.doc.toString()).trim();
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
    case 'completionResult': {
      const cb = pendingCompletions.get(msg.requestId);
      if (cb) { pendingCompletions.delete(msg.requestId); cb(msg.items); }
      break;
    }
    case 'validationResult': {
      const cb = pendingValidations.get(msg.requestId);
      if (cb) { pendingValidations.delete(msg.requestId); cb(msg.errors); }
      break;
    }
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
