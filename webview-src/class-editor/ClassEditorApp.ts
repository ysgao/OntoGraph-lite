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
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { StringStream } from '@codemirror/language';

// ── VS Code API ───────────────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ── Message types (mirror of ClassEditorMessages.ts) ─────────────────────────

interface LoadClassMessage {
  type: 'loadClass';
  iri: string;
  label: string;
  superClassExpressions: string[];
  equivalentClassExpressions: string[];
  prefixes: Record<string, string>;
}
interface CompletionResultMessage {
  type: 'completionResult';
  requestId: number;
  items: { label: string; iri: string; entityType: string }[];
}
interface ValidationResultMessage {
  type: 'validationResult';
  requestId: number;
  errors: { from: number; to: number; severity: 'error' | 'warning'; message: string }[];
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentIri = '';
let nextReqId = 0;
const pendingCompletions = new Map<number, (items: CompletionResultMessage['items']) => void>();
const pendingValidations = new Map<number, (errors: ValidationResultMessage['errors']) => void>();

// ── Manchester Syntax tokenizer ───────────────────────────────────────────────

const MANCHESTER_KEYWORDS = new Set([
  'some', 'all', 'value', 'min', 'max', 'exactly', 'only',
  'and', 'or', 'not', 'that', 'Self',
]);

const manchesterLanguage = StreamLanguage.define({
  token(stream: StringStream): string | null {
    // Whitespace
    if (stream.eatSpace()) { return null; }

    // Comments
    if (stream.match(/^#.*/)) { return 'comment'; }

    // IRI <...>
    if (stream.peek() === '<') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '>') { stream.next(); }
      if (stream.peek() === '>') { stream.next(); }
      return 'string';
    }

    // String literals
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === '\\') { stream.next(); }
        stream.next();
      }
      if (stream.peek() === '"') { stream.next(); }
      return 'string';
    }

    // Numbers
    if (stream.match(/^\d+(\.\d+)?/)) { return 'number'; }

    // Words (keywords or prefixed names)
    const word = stream.match(/^[A-Za-z_][\w-]*/);
    if (word) {
      const w = typeof word === 'object' ? (word as RegExpMatchArray)[0] : '';
      if (MANCHESTER_KEYWORDS.has(w)) { return 'keyword'; }
      // Check for prefixed name: word followed by ':'
      if (stream.peek() === ':') {
        stream.next();
        stream.match(/^[\w-]*/);
        return 'variableName';
      }
      return 'variableName';
    }

    // Operators and misc
    stream.next();
    return 'operator';
  },
});

// ── Completion source ─────────────────────────────────────────────────────────

async function manchesterCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  const word = context.matchBefore(/[\w:_-]{2,}/);
  if (!word) { return null; }

  const prefix = word.text;
  const reqId = nextReqId++;

  const items = await new Promise<CompletionResultMessage['items']>((resolve) => {
    const timer = setTimeout(() => {
      pendingCompletions.delete(reqId);
      resolve([]);
    }, 400);

    pendingCompletions.set(reqId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    vscode.postMessage({ type: 'requestCompletion', requestId: reqId, prefix });
  });

  if (items.length === 0) { return null; }

  return {
    from: word.from,
    options: items.map(item => ({
      label: item.label,
      detail: item.entityType,
      info: item.iri,
      apply: item.label,
    })),
  };
}

// ── Linter ────────────────────────────────────────────────────────────────────

async function manchesterLinter(view: EditorView): Promise<Diagnostic[]> {
  const text = view.state.doc.toString();
  const reqId = nextReqId++;

  const errors = await new Promise<ValidationResultMessage['errors']>((resolve) => {
    const timer = setTimeout(() => {
      pendingValidations.delete(reqId);
      resolve([]);
    }, 2000);

    pendingValidations.set(reqId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    vscode.postMessage({ type: 'validate', requestId: reqId, text });
  });

  return errors.map(e => ({
    from: e.from,
    to: e.to,
    severity: e.severity,
    message: e.message,
  }));
}

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

// ── Editor factory ────────────────────────────────────────────────────────────

function createEditor(parent: HTMLElement, initialDoc: string): EditorView {
  const extensions = [
    manchesterLanguage,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    lineNumbers(),
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    autocompletion({ override: [manchesterCompletionSource] }),
    linter(manchesterLinter, { delay: 400 }),
    vsCodeTheme,
  ];

  return new EditorView({
    state: EditorState.create({ doc: initialDoc, extensions }),
    parent,
  });
}

// ── Build UI ──────────────────────────────────────────────────────────────────

function buildUI(): { subView: EditorView; eqView: EditorView } {
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

  const entityLabel = document.createElement('span');
  entityLabel.id = 'entity-label';
  entityLabel.style.cssText = 'font-weight: 600;';
  entityLabel.textContent = 'Loading...';

  const entityIri = document.createElement('span');
  entityIri.id = 'entity-iri';
  entityIri.style.cssText = 'opacity: 0.6; font-size: 11px;';

  const spacer = document.createElement('div');
  spacer.style.cssText = 'margin-left: auto; display: flex; gap: 8px; align-items: center;';

  const btnSave = document.createElement('button');
  btnSave.id = 'btn-save';
  btnSave.textContent = 'Save';
  btnSave.style.cssText = `
    padding: 4px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; cursor: pointer; border-radius: 2px;
    font-family: inherit; font-size: inherit;
  `;

  const status = document.createElement('span');
  status.id = 'status';
  status.style.cssText = 'font-size: 11px; opacity: 0.7;';

  spacer.appendChild(btnSave);
  spacer.appendChild(status);
  toolbar.appendChild(entityLabel);
  toolbar.appendChild(entityIri);
  toolbar.appendChild(spacer);
  document.body.appendChild(toolbar);

  // SubClassOf section
  const sectionSub = document.createElement('div');
  sectionSub.style.cssText = `
    padding: 4px 12px 2px;
    font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    opacity: 0.7; flex-shrink: 0;
    border-bottom: 1px solid var(--vscode-editorGroup-border);
  `;
  sectionSub.textContent = 'SubClassOf Expressions';
  document.body.appendChild(sectionSub);

  const editorSubEl = document.createElement('div');
  editorSubEl.id = 'editor-sub';
  editorSubEl.style.cssText = 'flex: 1; overflow: auto; min-height: 120px;';
  document.body.appendChild(editorSubEl);

  // EquivalentTo section
  const sectionEq = document.createElement('div');
  sectionEq.style.cssText = `
    padding: 4px 12px 2px;
    font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    opacity: 0.7; flex-shrink: 0;
    border-top: 1px solid var(--vscode-editorGroup-border);
    border-bottom: 1px solid var(--vscode-editorGroup-border);
  `;
  sectionEq.textContent = 'EquivalentTo Expressions';
  document.body.appendChild(sectionEq);

  const editorEqEl = document.createElement('div');
  editorEqEl.id = 'editor-eq';
  editorEqEl.style.cssText = 'flex: 1; overflow: auto; min-height: 120px;';
  document.body.appendChild(editorEqEl);

  // Create editors
  const subView = createEditor(editorSubEl, '');
  const eqView  = createEditor(editorEqEl,  '');

  // Save handler
  btnSave.addEventListener('click', () => {
    if (!currentIri) { return; }
    const subText = subView.state.doc.toString();
    const eqText  = eqView.state.doc.toString();

    const filterLines = (text: string): string[] =>
      text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('#'));

    vscode.postMessage({
      type: 'save',
      iri: currentIri,
      superClassExpressions: filterLines(subText),
      equivalentClassExpressions: filterLines(eqText),
    });

    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });

  return { subView, eqView };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { subView, eqView } = buildUI();

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as LoadClassMessage | CompletionResultMessage | ValidationResultMessage;

  if (msg.type === 'completionResult') {
    pendingCompletions.get(msg.requestId)?.(msg.items);
    pendingCompletions.delete(msg.requestId);
    return;
  }

  if (msg.type === 'validationResult') {
    pendingValidations.get(msg.requestId)?.(msg.errors);
    pendingValidations.delete(msg.requestId);
    return;
  }

  if (msg.type === 'loadClass') {
    currentIri = msg.iri;

    // Update toolbar
    const labelEl = document.getElementById('entity-label');
    const iriEl   = document.getElementById('entity-iri');
    if (labelEl) { labelEl.textContent = msg.label; }
    if (iriEl)   { iriEl.textContent   = msg.iri; }

    // Populate sub editor
    const subText = msg.superClassExpressions.join('\n');
    subView.dispatch({
      changes: { from: 0, to: subView.state.doc.length, insert: subText },
    });

    // Populate eq editor
    const eqText = msg.equivalentClassExpressions.join('\n');
    eqView.dispatch({
      changes: { from: 0, to: eqView.state.doc.length, insert: eqText },
    });
  }
});

// Notify extension that webview is ready
vscode.postMessage({ type: 'ready' });
