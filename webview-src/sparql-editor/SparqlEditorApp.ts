import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import type { StringStream } from '@codemirror/language';

// ── VS Code API ───────────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ── Message types ─────────────────────────────────────────────────────────────

interface QueryResultMessage {
  type: 'queryResult';
  columns: string[];
  rows: Record<string, string>[];
  elapsed: number;
  total: number;
}
interface QueryErrorMessage { type: 'queryError'; message: string }

// ── SPARQL tokenizer ──────────────────────────────────────────────────────────

const SPARQL_KEYWORDS = new Set([
  'SELECT', 'CONSTRUCT', 'ASK', 'DESCRIBE', 'WHERE', 'FROM', 'OPTIONAL', 'FILTER',
  'UNION', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET', 'DISTINCT', 'REDUCED',
  'PREFIX', 'BASE', 'GRAPH', 'SERVICE', 'BIND', 'VALUES', 'HAVING', 'AS',
  'INSERT', 'DELETE', 'WITH', 'CLEAR', 'DROP',
  'select', 'construct', 'ask', 'describe', 'where', 'from', 'optional', 'filter',
  'union', 'group', 'by', 'order', 'limit', 'offset', 'distinct', 'reduced',
  'prefix', 'base', 'graph', 'service', 'bind', 'values', 'having', 'as',
  'insert', 'delete', 'with', 'clear', 'drop',
  'a',
]);

const sparqlLanguage = StreamLanguage.define({
  token(stream: StringStream): string | null {
    // Whitespace
    if (stream.eatSpace()) { return null; }

    // Comments
    if (stream.match(/^#.*/)) { return 'comment'; }

    // Variables ?var or $var
    if (stream.peek() === '?' || stream.peek() === '$') {
      stream.next();
      stream.match(/^[A-Za-z_][\w]*/);
      return 'variableName';
    }

    // IRI <...>
    if (stream.peek() === '<') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '>') { stream.next(); }
      if (stream.peek() === '>') { stream.next(); }
      return 'string';
    }

    // String literals "..."
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === '\\') { stream.next(); }
        stream.next();
      }
      if (stream.peek() === '"') { stream.next(); }
      return 'string';
    }

    // String literals '...'
    if (stream.peek() === "'") {
      stream.next();
      while (!stream.eol() && stream.peek() !== "'") {
        if (stream.peek() === '\\') { stream.next(); }
        stream.next();
      }
      if (stream.peek() === "'") { stream.next(); }
      return 'string';
    }

    // Numbers
    if (stream.match(/^\d+(\.\d+)?/)) { return 'number'; }

    // Words: keywords or prefixed names
    const word = stream.match(/^[A-Za-z_][\w]*/);
    if (word) {
      const w = typeof word === 'object' ? (word as RegExpMatchArray)[0] : '';
      if (SPARQL_KEYWORDS.has(w)) { return 'keyword'; }
      // Check for prefixed name: word followed by ':'
      if (stream.peek() === ':') {
        stream.next();
        stream.match(/^[\w]*/);
        return 'variableName';
      }
      return null;
    }

    stream.next();
    return null;
  },
});

// ── VS Code theme ─────────────────────────────────────────────────────────────

const vsCodeTheme = EditorView.theme({
  '&': {
    color: 'var(--vscode-editor-foreground)',
    backgroundColor: 'var(--vscode-editor-background)',
    fontFamily: 'var(--vscode-editor-font-family, var(--vscode-font-family))',
    fontSize: 'var(--vscode-editor-font-size, var(--vscode-font-size))',
    height: '100%',
  },
  '.cm-content': {
    caretColor: 'var(--vscode-editorCursor-foreground)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--vscode-editorCursor-foreground)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--vscode-editor-selectionBackground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
    color: 'var(--vscode-editorLineNumber-foreground)',
    borderRight: '1px solid var(--vscode-editorGroup-border)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
  },
});

// ── Default example query ─────────────────────────────────────────────────────

const DEFAULT_QUERY = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?class ?label WHERE {
  ?class a owl:Class ;
         rdfs:label ?label .
}
ORDER BY ?label
LIMIT 100`;

// ── Build UI ──────────────────────────────────────────────────────────────────

function buildUI(): EditorView {
  document.body.style.cssText = `
    display: flex; flex-direction: column; height: 100vh; margin: 0; padding: 0;
    overflow: hidden;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
  `;

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'toolbar';
  toolbar.style.cssText = `
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    flex-shrink: 0;
  `;

  const titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'font-weight: 600;';
  titleSpan.textContent = 'SPARQL Query';

  const endpointInput = document.createElement('input');
  endpointInput.id = 'endpoint-url';
  endpointInput.placeholder = 'Remote endpoint URL (optional)';
  endpointInput.style.cssText = `
    flex: 1; padding: 3px 8px; max-width: 360px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    font-family: inherit; font-size: inherit;
    border-radius: 2px;
  `;

  const btnRun = document.createElement('button');
  btnRun.id = 'btn-run';
  btnRun.textContent = '▶ Run';
  btnRun.style.cssText = `
    padding: 4px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; cursor: pointer; border-radius: 2px;
    font-family: inherit; font-size: inherit;
  `;

  const status = document.createElement('span');
  status.id = 'status';
  status.style.cssText = 'font-size: 11px; opacity: 0.7;';

  toolbar.appendChild(titleSpan);
  toolbar.appendChild(endpointInput);
  toolbar.appendChild(btnRun);
  toolbar.appendChild(status);
  document.body.appendChild(toolbar);

  // Editor container
  const editorEl = document.createElement('div');
  editorEl.id = 'editor';
  editorEl.style.cssText = 'flex: 1; overflow: auto; min-height: 200px; max-height: 50vh;';
  document.body.appendChild(editorEl);

  // Results container
  const resultsEl = document.createElement('div');
  resultsEl.id = 'results';
  resultsEl.style.cssText = `
    flex: 1; overflow: auto; padding: 8px 12px;
    border-top: 1px solid var(--vscode-editorGroup-border);
    font-size: 12px;
  `;
  document.body.appendChild(resultsEl);

  // Create editor
  const extensions = [
    sparqlLanguage,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    lineNumbers(),
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    vsCodeTheme,
  ];

  const editorView = new EditorView({
    state: EditorState.create({ doc: DEFAULT_QUERY, extensions }),
    parent: editorEl,
  });

  // Run button
  btnRun.addEventListener('click', () => {
    const sparql = editorView.state.doc.toString();
    const endpoint = endpointInput.value.trim() || undefined;
    status.textContent = 'Running...';
    resultsEl.innerHTML = '';
    vscode.postMessage({ type: 'executeQuery', sparql, endpoint });
  });

  // Ctrl+Enter / Cmd+Enter to run
  editorEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      btnRun.click();
    }
  });

  return editorView;
}

// ── Results rendering ─────────────────────────────────────────────────────────

function renderResults(msg: QueryResultMessage): void {
  const resultsEl = document.getElementById('results');
  const statusEl  = document.getElementById('status');
  if (!resultsEl || !statusEl) { return; }

  const { columns, rows, elapsed, total } = msg;

  statusEl.textContent = `${total} result${total !== 1 ? 's' : ''} in ${elapsed}ms`;

  if (rows.length === 0) {
    resultsEl.innerHTML = '<p style="opacity:0.6">No results.</p>';
    return;
  }

  const tableStyle = `
    border-collapse: collapse; width: 100%;
    font-size: 12px;
  `;
  const thStyle = `
    text-align: left; padding: 4px 8px;
    background: var(--vscode-editor-background);
    border-bottom: 2px solid var(--vscode-editorGroup-border);
    white-space: nowrap;
  `;
  const tdStyle = `
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  `;

  let html = `<table style="${tableStyle}"><thead><tr>`;
  for (const col of columns) {
    html += `<th style="${thStyle}">${escapeHtml(col)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    html += '<tr>';
    for (const col of columns) {
      const val = row[col] ?? '';
      let cellContent: string;
      // IRI values: display as clickable link showing local name
      if (val.startsWith('<') && val.endsWith('>')) {
        const iri = val.slice(1, -1);
        const localName = iri.split(/[#/]/).pop() ?? iri;
        cellContent = `<a href="#" title="${escapeHtml(iri)}" onclick="navigator.clipboard&&navigator.clipboard.writeText('${escapeHtml(iri)}');return false;" style="color:var(--vscode-textLink-foreground)">${escapeHtml(localName)}</a>`;
      } else {
        cellContent = escapeHtml(val);
      }
      html += `<td style="${tdStyle}" title="${escapeHtml(val)}">${cellContent}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';

  if (total > rows.length) {
    html += `<p style="opacity:0.6;font-size:11px">Showing ${rows.length} of ${total} results (limit 1000).</p>`;
  }

  resultsEl.innerHTML = html;
}

function renderError(msg: QueryErrorMessage): void {
  const resultsEl = document.getElementById('results');
  const statusEl  = document.getElementById('status');
  if (!resultsEl || !statusEl) { return; }

  statusEl.textContent = 'Error';
  resultsEl.innerHTML = `
    <div style="
      padding: 8px 12px; margin: 4px 0;
      background: var(--vscode-inputValidation-errorBackground, rgba(200,0,0,0.1));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f00);
      border-radius: 3px; color: var(--vscode-errorForeground, #f88);
      white-space: pre-wrap; font-family: var(--vscode-editor-font-family);
    ">${escapeHtml(msg.message)}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Main ──────────────────────────────────────────────────────────────────────

buildUI();

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as QueryResultMessage | QueryErrorMessage;
  const statusEl = document.getElementById('status');

  if (msg.type === 'queryResult') {
    renderResults(msg);
    return;
  }

  if (msg.type === 'queryError') {
    renderError(msg);
    if (statusEl) { statusEl.textContent = 'Error'; }
    return;
  }
});

// Notify extension that webview is ready
vscode.postMessage({ type: 'ready' });
