import { createValueWidget, MULTILINE_IRIS } from './createValueWidget';
import { createAnnotationDisplayElement } from './annotationValueDisplay';
import { formatManchesterForDisplay, collectLogicalLines, findFormatBreaks, stripAndContinuations } from '../../src/utils/ManchesterFormatting';
import { EditorState, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
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

// ── Message types ─────────────────────────────────────────────────────────────

type EntityType = 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';

interface ExpressionEntityRef {
  from: number;
  to: number;
  iri: string;
  entityType: EntityType;
  label: string;
}

interface LoadEntityMessage {
  type: 'loadEntity';
  entityType: EntityType;
  iri: string;
  label: string;
  labels: Record<string, string[]>;
  annotations: Record<string, string[]>;
  displayStyle: string;
  superClassIris?: string[];
  superClassExpressions?: string[];
  equivalentClassIris?: string[];
  equivalentClassExpressions?: string[];
  disjointClassIris?: string[];
  superPropertyIris?: string[];
  domainIris?: string[];
  rangeIris?: string[];
  isTransitive?: boolean;
  isSymmetric?: boolean;
  isFunctional?: boolean;
  isInverseFunctional?: boolean;
  inverseOfIri?: string;
  classIris?: string[];
  objectPropertyAssertions?: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions?: { propertyIri: string; value: string; datatype?: string }[];
  gciExpressions?: string[];
  equivalentPropertyIris?: string[];
  disjointPropertyIris?: string[];
  propertyChains?: string[][];
  isReflexive?: boolean;
  isIrreflexive?: boolean;
  isAsymmetric?: boolean;
  iriLabels: Record<string, string>;
  expressionEntityRefs?: Record<string, ExpressionEntityRef[][]>;
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

// ── Global state ──────────────────────────────────────────────────────────────

let currentIri = '';
let currentEntityType: EntityType = 'class';
let localIriLabels: Record<string, string> = {};
let lastSavedStateString = '';

// IRI list state: sectionKey → IRI[]
const iriListState: Record<string, string[]> = {};

// Single IRI state: fieldKey → IRI
const singleIriState: Record<string, string> = {};

// Assertion state for individuals
let objAssertionState: { propertyIri: string; targetIri: string }[] = [];
let dataAssertionState: { propertyIri: string; value: string; datatype?: string }[] = [];

// Property chain state: list of chains, each chain is an ordered list of IRIs
let propertyChainState: string[][] = [];

// CodeMirror editors: sectionKey → EditorView[]
const editorMap: Record<string, EditorView[]> = {};

function destroySection(key: string): void {
  (editorMap[key] ?? []).forEach(ed => ed.destroy());
  delete editorMap[key];
}

// Completion/validation request tracking
let nextReqId = 0;
const pendingCompletions = new Map<number, (items: CompletionResultMessage['items']) => void>();
const pendingValidations = new Map<number, (errors: ValidationResultMessage['errors']) => void>();

// ── Annotation priority constants ─────────────────────────────────────────────

const RDFS_LABEL      = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_COMMENT    = 'http://www.w3.org/2000/01/rdf-schema#comment';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_ALT_LABEL  = 'http://www.w3.org/2004/02/skos/core#altLabel';
const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const PRIORITY_IRIS   = [RDFS_LABEL, SKOS_PREF_LABEL, SKOS_ALT_LABEL, SKOS_DEFINITION, RDFS_COMMENT];
const DEFAULT_EN_IRIS = [RDFS_LABEL, SKOS_PREF_LABEL, SKOS_ALT_LABEL, SKOS_DEFINITION, RDFS_COMMENT];

interface AnnotationEntry { propIri: string; value: string; lang?: string; }
let annotationState: AnnotationEntry[] = [];

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

async function manchesterCompletionSource(context: CompletionContext): Promise<CompletionResult | null> {
  const word = context.matchBefore(/'[^']*'?|[\w:_-]{2,}/);
  if (!word) { return null; }

  let prefix = word.text;
  if (prefix.startsWith("'")) {
    prefix = prefix.slice(1);
    if (prefix.endsWith("'")) {
      prefix = prefix.slice(0, -1);
    }
    // Closing quote of previous label was mistaken for opening quote; prefix has a leading space
    if (!/^[A-Za-z0-9]/.test(prefix)) { return null; }
  } else {
    // Unquoted Manchester keywords are not entity names
    if (/^(and|or|not|some|only|all|value|min|max|exactly|that|Self)$/.test(prefix)) { return null; }
  }

  const reqId = nextReqId++;

  const items = await new Promise<CompletionResultMessage['items']>((resolve) => {
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
      return {
        label: applyStr,
        displayLabel: item.label,
        info: item.iri,
      };
    }),
  };
}

async function manchesterLinter(view: EditorView): Promise<Diagnostic[]> {
  const text = view.state.doc.toString();
  const reqId = nextReqId++;

  const errors = await new Promise<ValidationResultMessage['errors']>((resolve) => {
    const timer = setTimeout(() => { pendingValidations.delete(reqId); resolve([]); }, 2000);
    pendingValidations.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
    vscode.postMessage({ type: 'validate', requestId: reqId, text });
  });

  return errors.map(e => ({ from: e.from, to: e.to, severity: e.severity, message: e.message }));
}

const vsCodeTheme = EditorView.theme({
  '&': {
    color: 'var(--vscode-editor-foreground)',
    backgroundColor: 'var(--vscode-editor-background)',
    fontFamily: 'var(--vscode-editor-font-family, var(--vscode-font-family))',
    fontSize: 'var(--vscode-editor-font-size, var(--vscode-font-size))',
  },
  '&.cm-focused': {
    backgroundColor: 'field',
  },
  '.cm-content': { caretColor: 'var(--vscode-editorCursor-foreground)' },
  '.cm-cursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--vscode-editor-selectionBackground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
    color: 'var(--vscode-editorLineNumber-foreground)',
    borderRight: '1px solid var(--vscode-editorGroup-border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--vscode-editor-lineHighlightBackground)' },
  '.cm-activeLine': { backgroundColor: 'var(--vscode-editor-lineHighlightBackground)' },
});

function clickableEntityExtension(refs: ExpressionEntityRef[]) {
  const initialDecorations = Decoration.set(
    refs
      .filter(ref => ref.from < ref.to)
      .map(ref => Decoration.mark({
        class: `cm-clickable-entity cm-clickable-entity-${ref.entityType}`,
        attributes: {
          'data-iri': ref.iri,
          title: `${ref.label}\n${ref.iri}`,
        },
      }).range(ref.from, ref.to)),
    true,
  );

  const decorationField = StateField.define<DecorationSet>({
    create() { return initialDecorations; },
    update(decorations, transaction) {
      return decorations.map(transaction.changes);
    },
    provide: field => EditorView.decorations.from(field),
  });

  return [
    decorationField,
    EditorView.domEventHandlers({
      click(event) {
        const target = event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('.cm-clickable-entity')
          : null;
        const iri = target?.dataset['iri'];
        if (!iri) { return false; }
        event.preventDefault();
        vscode.postMessage({ type: 'focusEntity', iri });
        return true;
      },
    }),
  ];
}

function createEditor(parent: HTMLElement, initialDoc: string, entityRefs: ExpressionEntityRef[] = []): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        manchesterLanguage,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lineNumbers(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        autocompletion({ override: [manchesterCompletionSource] }),
        linter(manchesterLinter, { delay: 400 }),
        clickableEntityExtension(entityRefs),
        vsCodeTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const raw = update.state.doc.toString();
            const reformatted = formatManchesterForDisplay(stripAndContinuations(raw));
            if (reformatted !== raw && raw.trimEnd() !== reformatted) {
              update.view.dispatch({
                changes: { from: 0, to: raw.length, insert: reformatted },
              });
            } else {
              checkForChanges();
            }
          }
        }),
      ],
    }),
    parent,
  });
}

// ── Autocomplete input widget ─────────────────────────────────────────────────

function createIriInput(
  parent: HTMLElement,
  placeholder: string,
  onSelect: (iri: string, label: string) => void,
  onCancel?: () => void,
  typeFilter?: string,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.className = 'iri-input';

  const dropdown = document.createElement('div');
  dropdown.className = 'iri-dropdown';
  dropdown.style.display = 'none';
  parent.appendChild(input);
  parent.appendChild(dropdown);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentItems: { label: string; iri: string; entityType: string }[] = [];
  let selectedIndex = -1;

  function showDropdown(items: typeof currentItems): void {
    currentItems = items;
    selectedIndex = -1;
    dropdown.innerHTML = '';
    if (items.length === 0) { dropdown.style.display = 'none'; return; }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = document.createElement('div');
      row.className = 'iri-dropdown-item';
      row.dataset['index'] = String(i);
      const nameEl = document.createElement('span');
      nameEl.textContent = item.label;
      row.appendChild(nameEl);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onSelect(item.iri, item.label);
        input.value = '';
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(row);
    }
    dropdown.style.display = 'block';
  }

  function updateHighlight(): void {
    const rows = dropdown.querySelectorAll('.iri-dropdown-item');
    rows.forEach((r, i) => r.classList.toggle('selected', i === selectedIndex));
  }

  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (val.length < 2) { dropdown.style.display = 'none'; return; }
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(() => {
      const reqId = nextReqId++;
      const timer = setTimeout(() => { pendingCompletions.delete(reqId); }, 400);
      pendingCompletions.set(reqId, (items) => {
        clearTimeout(timer);
        const filtered = typeFilter ? items.filter(i => i.entityType === typeFilter) : items;
        showDropdown(filtered.slice(0, 8));
      });
      vscode.postMessage({ type: 'requestCompletion', requestId: reqId, prefix: val });
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && currentItems[selectedIndex]) {
        const item = currentItems[selectedIndex];
        onSelect(item.iri, item.label);
        input.value = '';
        dropdown.style.display = 'none';
      } else if (input.value.trim()) {
        // Treat raw input as IRI if it looks like one
        const val = input.value.trim();
        if (val.startsWith('http://') || val.startsWith('https://')) {
          const lbl = localNameFromIri(val);
          onSelect(val, lbl);
          input.value = '';
          dropdown.style.display = 'none';
        }
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      input.value = '';
      onCancel?.();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  return input;
}

// ── Chip rendering ─────────────────────────────────────────────────────────────

function makeChip(label: string, iri: string, onRemove: () => void): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'chip';

  const link = document.createElement('a');
  link.className = 'chip-label';
  link.href = '#';
  link.textContent = label;
  link.title = iri;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'navigate', iri });
  });

  const btn = document.createElement('button');
  btn.className = 'chip-remove';
  btn.textContent = '×';
  btn.title = 'Remove';
  btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });

  chip.appendChild(link);
  chip.appendChild(btn);
  return chip;
}

// ── IRI list section ──────────────────────────────────────────────────────────

function renderIriListSection(container: HTMLElement, title: string, key: string): void {
  const sec = makeSectionEl(title);
  const body = sec.querySelector('.section-body') as HTMLElement;
  const actions = sec.querySelector('.section-actions') as HTMLElement;

  function rerender(): void {
    body.innerHTML = '';
    actions.innerHTML = '';

    const chips = document.createElement('div');
    chips.className = 'chip-list';

    const iris = iriListState[key] ?? [];
    for (const iri of iris) {
      const label = localIriLabels[iri] ?? localNameFromIri(iri);
      chips.appendChild(makeChip(label, iri, () => {
        iriListState[key] = (iriListState[key] ?? []).filter(i => i !== iri);
        rerender();
      }));
    }

    // Add button in header
    const addBtn = document.createElement('button');
    addBtn.className = 'header-action-btn';
    addBtn.innerHTML = '<span>+</span>';
    addBtn.title = 'Add';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'add-iri-input-wrapper';
      chips.appendChild(inputWrapper);
      const inp = createIriInput(inputWrapper, 'Search...', (iri, label) => {
        if (iri && !(iriListState[key] ?? []).includes(iri)) {
          localIriLabels[iri] = label;
          iriListState[key] = [...(iriListState[key] ?? []), iri];
        }
        rerender();
      }, () => { rerender(); });
      requestAnimationFrame(() => inp.focus());
    });

    actions.appendChild(addBtn);
    body.appendChild(chips);
    checkForChanges();
  }

  rerender();
  container.appendChild(sec);
}

// ── Property chain section ────────────────────────────────────────────────────

function renderPropertyChainSection(container: HTMLElement): void {
  const sec = makeSectionEl('SuperPropertyOf (Chain)');
  const body = sec.querySelector('.section-body') as HTMLElement;

  function rerender(): void {
    body.innerHTML = '';

    for (let i = 0; i < propertyChainState.length; i++) {
      const chain = propertyChainState[i];
      const row = document.createElement('div');
      row.className = 'chain-row';

      const membersEl = document.createElement('div');
      membersEl.className = 'chain-members';

      for (let j = 0; j < chain.length; j++) {
        if (j > 0) {
          const sep = document.createElement('span');
          sep.className = 'chain-sep';
          sep.textContent = ' ∘ ';
          membersEl.appendChild(sep);
        }
        const memberIri = chain[j];
        const label = localIriLabels[memberIri] ?? localNameFromIri(memberIri);
        const ci = j;
        membersEl.appendChild(makeChip(label, memberIri, () => {
          propertyChainState[i] = chain.filter((_, k) => k !== ci);
          if (propertyChainState[i].length === 0) propertyChainState.splice(i, 1);
          rerender();
        }));
      }

      const addMemberContainer = document.createElement('div');
      addMemberContainer.className = 'add-item-footer';
      const addMemberBtn = document.createElement('button');
      addMemberBtn.className = 'add-btn ghost-btn';
      addMemberBtn.innerHTML = '<span>+</span>';
      addMemberBtn.title = 'Add member to chain';
      addMemberBtn.addEventListener('click', () => {
        addMemberBtn.style.display = 'none';
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'add-iri-input-wrapper';
        addMemberContainer.appendChild(inputWrapper);
        const inp = createIriInput(inputWrapper, 'Add property…', (iri, label) => {
          if (iri) { localIriLabels[iri] = label; propertyChainState[i] = [...chain, iri]; }
          rerender();
        }, () => { rerender(); });
        requestAnimationFrame(() => inp.focus());
      });
      addMemberContainer.appendChild(addMemberBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.title = 'Remove chain';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => { propertyChainState.splice(i, 1); rerender(); });

      row.appendChild(membersEl);
      row.appendChild(addMemberContainer);
      row.appendChild(removeBtn);
      body.appendChild(row);
    }

    const addChainContainer = document.createElement('div');
    addChainContainer.className = 'add-item-footer';
    const addChainBtn = document.createElement('button');
    addChainBtn.className = 'add-btn ghost-btn';
    addChainBtn.innerHTML = '<span>+</span> Add Chain';
    addChainBtn.addEventListener('click', () => { propertyChainState.push([]); rerender(); });
    addChainContainer.appendChild(addChainBtn);
    body.appendChild(addChainContainer);
    checkForChanges();
  }

  rerender();
  container.appendChild(sec);
}

// ── Expression section ────────────────────────────────────────────────────────

/**
 * The server computes entity-ref offsets against the original single-line
 * expressions.  After T005 formatting each expression expands by 4 chars per
 * 'and' break.  Remap every ref so it points at the correct position in the
 * formatted initialDoc.
 */
function shiftRefsForFormat(
  expr: string,
  refs: ExpressionEntityRef[],
): ExpressionEntityRef[] {
  const breaks = findFormatBreaks(expr);
  if (breaks.length === 0) { return refs; }
  return refs.map(ref => {
    const shift = breaks.filter(b => b < ref.from).length * 4;
    return { ...ref, from: ref.from + shift, to: ref.to + shift };
  });
}

function createExpressionEntry(
  body: HTMLElement,
  key: string,
  expr: string,
  refs: ExpressionEntityRef[],
): void {
  if (!editorMap[key]) { editorMap[key] = []; }

  const entry = document.createElement('div');
  entry.className = 'expression-entry';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'expression-delete-btn';
  deleteBtn.title = 'Remove expression';
  deleteBtn.textContent = '×';
  entry.appendChild(deleteBtn);

  const editorEl = document.createElement('div');
  editorEl.className = 'expression-editor';
  entry.appendChild(editorEl);

  body.appendChild(entry);

  const editor = createEditor(editorEl, formatManchesterForDisplay(expr), shiftRefsForFormat(expr, refs));
  editorMap[key].push(editor);

  deleteBtn.addEventListener('click', () => {
    editor.destroy();
    const idx = editorMap[key].indexOf(editor);
    if (idx !== -1) { editorMap[key].splice(idx, 1); }
    entry.remove();
    checkForChanges();
  });
}

function renderExpressionSection(
  container: HTMLElement,
  title: string,
  key: string,
  expressions: string[],
  perExprRefs: ExpressionEntityRef[][] = [],
): void {
  destroySection(key);
  editorMap[key] = [];

  const sec = makeSectionEl(title);
  const body = sec.querySelector('.section-body') as HTMLElement;
  const actions = sec.querySelector('.section-actions') as HTMLElement;

  for (let i = 0; i < expressions.length; i++) {
    createExpressionEntry(body, key, expressions[i], perExprRefs[i] ?? []);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'header-action-btn';
  addBtn.innerHTML = '<span>+</span>';
  addBtn.title = 'Add expression';
  addBtn.addEventListener('click', () => {
    createExpressionEntry(body, key, '', []);
    const editors = editorMap[key];
    if (editors && editors.length > 0) {
      editors[editors.length - 1].focus();
    }
  });
  actions.appendChild(addBtn);

  container.appendChild(sec);
}

// ── Checkbox section ──────────────────────────────────────────────────────────

function renderCheckboxSection(
  container: HTMLElement,
  title: string,
  fields: { id: string; label: string; checked: boolean }[],
): void {
  const sec = makeSectionEl(title);
  const body = sec.querySelector('.section-body') as HTMLElement;

  const row = document.createElement('div');
  row.className = 'checkbox-row';
  for (const f of fields) {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `cb-${f.id}`;
    cb.checked = f.checked;
    cb.addEventListener('change', () => checkForChanges());
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${f.label}`));
    row.appendChild(label);
  }
  body.appendChild(row);
  container.appendChild(sec);
}

// ── Single IRI section ────────────────────────────────────────────────────────

function renderSingleIriSection(container: HTMLElement, title: string, key: string, currentVal: string): void {
  singleIriState[key] = currentVal;

  const sec = makeSectionEl(title);
  const body = sec.querySelector('.section-body') as HTMLElement;

  const wrapper = document.createElement('div');
  wrapper.className = 'single-iri-wrapper';

  function rerender(): void {
    wrapper.innerHTML = '';
    const iri = singleIriState[key] ?? '';
    if (iri) {
      const label = localIriLabels[iri] ?? localNameFromIri(iri);
      wrapper.appendChild(makeChip(label, iri, () => {
        singleIriState[key] = '';
        rerender();
      }));
    } else {
      const inp = createIriInput(wrapper, 'Search for entity…', (newIri, newLabel) => {
        localIriLabels[newIri] = newLabel;
        singleIriState[key] = newIri;
        rerender();
      });
      requestAnimationFrame(() => inp.focus());
    }
  }

  rerender();
  body.appendChild(wrapper);
  checkForChanges();
  container.appendChild(sec);
}

// ── Object assertion section ──────────────────────────────────────────────────

function renderObjAssertionSection(container: HTMLElement): void {
  const sec = makeSectionEl('Object Property Assertions');
  const body = sec.querySelector('.section-body') as HTMLElement;

  function rerender(): void {
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'assertion-table';

    for (let i = 0; i < objAssertionState.length; i++) {
      const a = objAssertionState[i];
      const tr = document.createElement('tr');

      const tdProp = document.createElement('td');
      const propLabel = localIriLabels[a.propertyIri] ?? localNameFromIri(a.propertyIri);
      tdProp.appendChild(makeChip(propLabel, a.propertyIri, () => {
        objAssertionState.splice(i, 1);
        rerender();
      }));

      const tdArrow = document.createElement('td');
      tdArrow.textContent = '→';
      tdArrow.className = 'assertion-arrow';

      const tdTarget = document.createElement('td');
      const targetLabel = localIriLabels[a.targetIri] ?? localNameFromIri(a.targetIri);
      tdTarget.appendChild(makeChip(targetLabel, a.targetIri, () => {
        objAssertionState.splice(i, 1);
        rerender();
      }));

      tr.appendChild(tdProp);
      tr.appendChild(tdArrow);
      tr.appendChild(tdTarget);
      table.appendChild(tr);
    }
    body.appendChild(table);

    // Add row
    const addDiv = document.createElement('div');
    addDiv.className = 'add-item-footer';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn ghost-btn';
    addBtn.innerHTML = '<span>+</span> Add assertion';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      let newPropIri = '';

      const row = document.createElement('div');
      row.className = 'new-assertion-inputs';
      const w1 = document.createElement('div');
      w1.className = 'add-iri-input-wrapper';
      const w2 = document.createElement('div');
      w2.className = 'add-iri-input-wrapper';
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      arrow.className = 'assertion-arrow';

      const inp1 = createIriInput(w1, 'Property…', (iri, lbl) => {
        newPropIri = iri;
        localIriLabels[iri] = lbl;

        // Display selected property as a chip
        inp1.style.display = 'none';
        const chip = makeChip(lbl, iri, () => {
          newPropIri = '';
          chip.remove();
          inp1.style.display = '';
          requestAnimationFrame(() => inp1.focus());
        });
        w1.insertBefore(chip, inp1);

        requestAnimationFrame(() => inp2.focus());
      });
      const inp2 = createIriInput(w2, 'Target…', (iri, lbl) => {
        if (newPropIri) {
          localIriLabels[iri] = lbl;
          objAssertionState.push({ propertyIri: newPropIri, targetIri: iri });
        }
        rerender();
      }, () => { rerender(); });

      row.appendChild(w1);
      row.appendChild(arrow);
      row.appendChild(w2);
      addDiv.appendChild(row);
      requestAnimationFrame(() => inp1.focus());
    });
    addDiv.appendChild(addBtn);
    body.appendChild(addDiv);
    checkForChanges();
  }

  rerender();
  container.appendChild(sec);
}

// ── Data assertion section ────────────────────────────────────────────────────

function renderDataAssertionSection(container: HTMLElement): void {
  const sec = makeSectionEl('Data Property Assertions');
  const body = sec.querySelector('.section-body') as HTMLElement;

  function rerender(): void {
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'assertion-table';

    for (let i = 0; i < dataAssertionState.length; i++) {
      const a = dataAssertionState[i];
      const tr = document.createElement('tr');

      const tdProp = document.createElement('td');
      const propLabel = localIriLabels[a.propertyIri] ?? localNameFromIri(a.propertyIri);
      tdProp.appendChild(makeChip(propLabel, a.propertyIri, () => {
        dataAssertionState.splice(i, 1);
        rerender();
      }));

      const tdArrow = document.createElement('td');
      tdArrow.textContent = '→';
      tdArrow.className = 'assertion-arrow';

      const tdVal = document.createElement('td');
      const valEl = document.createElement('code');
      valEl.className = 'data-value';
      valEl.textContent = a.value + (a.datatype ? ` ^^${a.datatype}` : '');
      const removeBtn = document.createElement('button');
      removeBtn.className = 'chip-remove inline-remove';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => {
        dataAssertionState.splice(i, 1);
        rerender();
      });
      tdVal.appendChild(valEl);
      tdVal.appendChild(removeBtn);

      tr.appendChild(tdProp);
      tr.appendChild(tdArrow);
      tr.appendChild(tdVal);
      table.appendChild(tr);
    }
    body.appendChild(table);

    const addDiv = document.createElement('div');
    addDiv.className = 'add-item-footer';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn ghost-btn';
    addBtn.innerHTML = '<span>+</span> Add assertion';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      let newPropIri = '';

      const row = document.createElement('div');
      row.className = 'new-assertion-inputs';
      const w1 = document.createElement('div');
      w1.className = 'add-iri-input-wrapper';
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      arrow.className = 'assertion-arrow';
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'iri-input';
      valueInput.placeholder = 'Value…';
      const okBtn = document.createElement('button');
      okBtn.className = 'add-btn';
      okBtn.textContent = 'Add';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'add-btn cancel-btn';
      cancelBtn.textContent = 'Cancel';

      const inp1 = createIriInput(w1, 'Property…', (iri, lbl) => {
        newPropIri = iri;
        localIriLabels[iri] = lbl;

        // Display selected property as a chip
        inp1.style.display = 'none';
        const chip = makeChip(lbl, iri, () => {
          newPropIri = '';
          chip.remove();
          inp1.style.display = '';
          requestAnimationFrame(() => inp1.focus());
        });
        w1.insertBefore(chip, inp1);

        requestAnimationFrame(() => valueInput.focus());
      });

      okBtn.addEventListener('click', () => {
        if (newPropIri && valueInput.value.trim()) {
          dataAssertionState.push({ propertyIri: newPropIri, value: valueInput.value.trim() });
        }
        rerender();
      });
      cancelBtn.addEventListener('click', () => { rerender(); });
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { okBtn.click(); }
        if (e.key === 'Escape') { cancelBtn.click(); }
      });

      row.appendChild(w1);
      row.appendChild(arrow);
      row.appendChild(valueInput);
      row.appendChild(okBtn);
      row.appendChild(cancelBtn);
      addDiv.appendChild(row);
      requestAnimationFrame(() => inp1.focus());
    });
    addDiv.appendChild(addBtn);
    body.appendChild(addDiv);
    checkForChanges();
  }

  rerender();
  container.appendChild(sec);
}

// ── Annotations section (editable) ───────────────────────────────────────────

function renderAnnotationsSection(container: HTMLElement): void {
  const sec = makeSectionEl('Annotations');
  const body = sec.querySelector('.section-body') as HTMLElement;

  function rerender(): void {
    body.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'annotation-table';

    for (let i = 0; i < annotationState.length; i++) {
      const entry = annotationState[i];
      const tr = document.createElement('tr');

      // Col 1: property name + lang tag
      const tdProp = document.createElement('td');
      tdProp.className = 'prop-iri-cell';
      tdProp.title = entry.propIri;
      
      const propLabel = document.createElement('span');
      propLabel.className = 'prop-label';
      propLabel.textContent = localNameFromIri(entry.propIri);
      tdProp.appendChild(propLabel);

      if (DEFAULT_EN_IRIS.includes(entry.propIri) || entry.lang !== undefined) {
        const langInput = document.createElement('input');
        langInput.type = 'text';
        langInput.className = 'lang-tag-input';
        langInput.value = entry.lang ?? '';
        langInput.placeholder = 'en';
        langInput.title = 'Language tag';
        langInput.addEventListener('input', () => {
          annotationState[i] = { ...annotationState[i], lang: langInput.value.trim() || undefined };
          checkForChanges();
        });
        tdProp.appendChild(langInput);
      }

      // Col 2: display/edit value
      const tdValue = document.createElement('td');
      tdValue.className = 'annotation-value-cell';
      const valueWidget = createValueWidget(entry.propIri, entry.value, (v) => {
        annotationState[i] = { ...annotationState[i], value: v };
        checkForChanges();
      });
      valueWidget.style.display = 'none';

      let currentDisplay = createAnnotationDisplayElement(
        entry.value,
        (url) => { vscode.postMessage({ type: 'openExternal', url }); },
      );

      function attachRowHandlers(displayDiv: HTMLElement): void {
        displayDiv.addEventListener('click', (e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'A' || t.tagName === 'IMG') { return; }
          displayDiv.style.display = 'none';
          valueWidget.style.display = '';
          (valueWidget as HTMLElement).focus();
        });
      }
      attachRowHandlers(currentDisplay);

      (valueWidget as HTMLElement).addEventListener('blur', () => {
        valueWidget.style.display = 'none';
        const fresh = createAnnotationDisplayElement(
          annotationState[i].value,
          (url) => { vscode.postMessage({ type: 'openExternal', url }); },
        );
        attachRowHandlers(fresh);
        currentDisplay.replaceWith(fresh);
        currentDisplay = fresh;
        currentDisplay.style.display = '';
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'expression-delete-btn annotation-delete-btn';
      delBtn.innerHTML = '×';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        annotationState.splice(i, 1);
        rerender();
      });

      tdValue.appendChild(delBtn);
      tdValue.appendChild(currentDisplay);
      tdValue.appendChild(valueWidget);

      tr.appendChild(tdProp);
      tr.appendChild(tdValue);
      table.appendChild(tr);
    }
    body.appendChild(table);

    // Add annotation row
    const addDiv = document.createElement('div');
    addDiv.className = 'add-item-footer';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn ghost-btn';
    addBtn.innerHTML = '<span>+</span> Add annotation';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      let newPropIri = '';

      const row = document.createElement('div');
      row.className = 'new-assertion-inputs';

      const w1 = document.createElement('div');
      w1.className = 'add-iri-input-wrapper';

      const initialInput = document.createElement('input');
      initialInput.type = 'text';
      initialInput.className = 'annotation-value-input';
      initialInput.placeholder = 'Value…';
      let valueWidget: HTMLInputElement | HTMLTextAreaElement = initialInput;

      const attachKeydown = (el: HTMLInputElement | HTMLTextAreaElement): void => {
        el.addEventListener('keydown', (ev) => {
          const e = ev as KeyboardEvent;
          if (e.key === 'Enter' && (el.tagName !== 'TEXTAREA' || e.ctrlKey)) { okBtn.click(); }
          if (e.key === 'Escape') { cancelBtn.click(); }
        });
      };

      const langInput = document.createElement('input');
      langInput.type = 'text';
      langInput.className = 'lang-tag-input';
      langInput.placeholder = 'en';
      langInput.title = 'Language tag (optional)';

      const okBtn = document.createElement('button');
      okBtn.className = 'add-btn';
      okBtn.textContent = 'Add';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'add-btn cancel-btn';
      cancelBtn.textContent = 'Cancel';

      const propInput = createIriInput(w1, 'Annotation property…', (iri, lbl) => {
        newPropIri = iri;
        localIriLabels[iri] = lbl;

        // Display selected property as a chip
        propInput.style.display = 'none';
        const chip = makeChip(lbl, iri, () => {
          newPropIri = '';
          chip.remove();
          propInput.style.display = '';
          requestAnimationFrame(() => propInput.focus());
        });
        w1.insertBefore(chip, propInput);

        if (DEFAULT_EN_IRIS.includes(iri) && !langInput.value.trim()) {
          langInput.value = 'en';
        }
        if (MULTILINE_IRIS.includes(iri) && valueWidget.tagName !== 'TEXTAREA') {
          const newWidget = createValueWidget(iri, valueWidget.value, () => {});
          attachKeydown(newWidget);
          valueWidget.replaceWith(newWidget);
          valueWidget = newWidget;
        }
        requestAnimationFrame(() => valueWidget.focus());
      }, () => { rerender(); }, 'annotationProperty');

      okBtn.addEventListener('click', () => {
        const val = valueWidget.value.trim();
        // Allow raw IRI entry if autocomplete was not used
        if (!newPropIri) {
          const raw = propInput.value.trim();
          if (raw.startsWith('http://') || raw.startsWith('https://')) { newPropIri = raw; }
        }
        if (newPropIri && val) {
          const lang = langInput.value.trim() || undefined;
          annotationState.push({ propIri: newPropIri, value: val, lang });
        }
        rerender();
      });
      cancelBtn.addEventListener('click', () => { rerender(); });
      attachKeydown(initialInput);

      row.appendChild(w1);
      row.appendChild(langInput);
      row.appendChild(valueWidget);
      row.appendChild(okBtn);
      row.appendChild(cancelBtn);
      addDiv.appendChild(row);
      requestAnimationFrame(() => propInput.focus());
    });

    addDiv.appendChild(addBtn);
    body.appendChild(addDiv);
    checkForChanges();
  }

  rerender();
  container.appendChild(sec);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSectionEl(title: string): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'section';
  const h = document.createElement('h2');
  h.className = 'section-header';
  
  const titleSpan = document.createElement('span');
  titleSpan.className = 'section-title';
  titleSpan.textContent = title;
  h.appendChild(titleSpan);

  const actions = document.createElement('div');
  actions.className = 'section-actions';
  h.appendChild(actions);

  const body = document.createElement('div');
  body.className = 'section-body';
  sec.appendChild(h);
  sec.appendChild(body);
  return sec;
}

function localNameFromIri(iri: string): string {
  const h = iri.lastIndexOf('#');
  const s = iri.lastIndexOf('/');
  const pos = Math.max(h, s);
  return pos >= 0 ? iri.slice(pos + 1) : iri;
}

function typeLabel(t: EntityType): string {
  switch (t) {
    case 'class': return 'Class';
    case 'objectProperty': return 'Object Property';
    case 'dataProperty': return 'Data Property';
    case 'annotationProperty': return 'Annotation Property';
    case 'individual': return 'Named Individual';
  }
}

function collectEditorLines(key: string): string[] {
  return (editorMap[key] ?? [])
    .flatMap(ed => collectLogicalLines(ed.state.doc.toString()))
    .filter(s => s.length > 0);
}

// ── Annotation state helpers ──────────────────────────────────────────────────

function buildAnnotationState(msg: LoadEntityMessage): AnnotationEntry[] {
  const entries: AnnotationEntry[] = [];

  for (const [lang, vals] of Object.entries(msg.labels)) {
    for (const v of vals) {
      entries.push({ propIri: RDFS_LABEL, value: v, lang: lang || undefined });
    }
  }

  for (const [propIri, vals] of Object.entries(msg.annotations)) {
    if (propIri === RDFS_LABEL) { continue; }
    for (const v of vals) {
      const parsed = parseStoredAnnotationValue(v);
      entries.push({
        propIri,
        value: parsed.value,
        lang: parsed.lang,
      });
    }
  }

  entries.sort((a, b) => {
    const ai = PRIORITY_IRIS.indexOf(a.propIri);
    const bi = PRIORITY_IRIS.indexOf(b.propIri);
    if (ai !== -1 && bi !== -1) { return ai - bi; }
    if (ai !== -1) { return -1; }
    if (bi !== -1) { return 1; }
    return localNameFromIri(a.propIri).localeCompare(localNameFromIri(b.propIri));
  });

  return entries;
}

function parseStoredAnnotationValue(raw: string): { value: string; lang?: string } {
  const quoted = /^"((?:\\.|[^"\\])*)"@([A-Za-z][A-Za-z0-9-]*)$/.exec(raw);
  if (quoted) {
    return {
      value: quoted[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\'),
      lang: quoted[2],
    };
  }

  const atIdx = raw.lastIndexOf('@');
  const hasLang = atIdx > 0 && /^[A-Za-z][A-Za-z0-9-]*$/.test(raw.slice(atIdx + 1));
  return {
    value: hasLang ? raw.slice(0, atIdx) : raw,
    lang: hasLang ? raw.slice(atIdx + 1) : undefined,
  };
}

function collectAnnotationsForSave(): { labels: Record<string, string[]>; annotations: Record<string, string[]> } {
  const labels: Record<string, string[]> = {};
  const annotations: Record<string, string[]> = {};
  for (const e of annotationState) {
    if (e.propIri === RDFS_LABEL) {
      (labels[e.lang ?? ''] ??= []).push(e.value);
    } else {
      const raw = e.lang ? `${e.value}@${e.lang}` : e.value;
      (annotations[e.propIri] ??= []).push(raw);
    }
  }
  return { labels, annotations };
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function buildToolbar(): void {
  const toolbar = document.createElement('div');
  toolbar.id = 'toolbar';

  const badge = document.createElement('span');
  badge.id = 'type-badge';
  badge.className = 'type-badge';

  const iriEl = document.createElement('span');
  iriEl.id = 'entity-iri';


  const spacer = document.createElement('div');
  spacer.style.cssText = 'margin-left: auto; display: flex; gap: 8px; align-items: center;';

  const saveBtn = document.createElement('button');
  saveBtn.id = 'btn-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', handleSave);

  const status = document.createElement('span');
  status.id = 'status';

  spacer.appendChild(saveBtn);
  spacer.appendChild(status);
  toolbar.appendChild(badge);
  toolbar.appendChild(iriEl);
  toolbar.appendChild(spacer);
  document.body.appendChild(toolbar);
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderEntity(msg: LoadEntityMessage): void {
  currentIri = msg.iri;
  currentEntityType = msg.entityType;
  localIriLabels = { ...msg.iriLabels };

  // Update toolbar
  const badge = document.getElementById('type-badge')!;
  badge.textContent = typeLabel(msg.entityType);
  badge.className = `type-badge ${msg.entityType}`;
  document.getElementById('entity-iri')!.textContent = msg.iri;

  // Clear old editors and entity sections
  Object.keys(editorMap).forEach(k => destroySection(k));
  const content = document.getElementById('content')!;
  content.innerHTML = '';

  // Unified editable annotations section (rdfs:label, skos:prefLabel, skos:altLabel, skos:definition, then rest)
  annotationState = buildAnnotationState(msg);
  renderAnnotationsSection(content);

  // Entity-type-specific sections
  switch (msg.entityType) {
    case 'class':
      iriListState['superClassIris'] = msg.superClassIris ?? [];
      iriListState['equivalentClassIris'] = msg.equivalentClassIris ?? [];
      iriListState['disjointClassIris'] = msg.disjointClassIris ?? [];
      renderIriListSection(content, 'SubClassOf', 'superClassIris');
      renderExpressionSection(content, 'SubClassOf (expressions)', 'superClassExpressions',
        msg.superClassExpressions ?? [],
        msg.expressionEntityRefs?.['superClassExpressions'] ?? []);
      renderIriListSection(content, 'EquivalentTo', 'equivalentClassIris');
      renderExpressionSection(content, 'EquivalentTo (expressions)', 'equivalentClassExpressions',
        msg.equivalentClassExpressions ?? [],
        msg.expressionEntityRefs?.['equivalentClassExpressions'] ?? []);
      renderExpressionSection(content, 'GCI (General Concept Inclusions)', 'gciExpressions',
        msg.gciExpressions ?? [],
        msg.expressionEntityRefs?.['gciExpressions'] ?? []);
      renderIriListSection(content, 'DisjointWith', 'disjointClassIris');
      break;

    case 'objectProperty':
      iriListState['domainIris'] = msg.domainIris ?? [];
      iriListState['rangeIris'] = msg.rangeIris ?? [];
      iriListState['superPropertyIris'] = msg.superPropertyIris ?? [];
      iriListState['equivalentPropertyIris'] = msg.equivalentPropertyIris ?? [];
      iriListState['disjointPropertyIris'] = msg.disjointPropertyIris ?? [];
      propertyChainState = (msg.propertyChains ?? []).map((c: string[]) => [...c]);
      singleIriState['inverseOfIri'] = msg.inverseOfIri ?? '';
      renderCheckboxSection(content, 'Characteristics', [
        { id: 'isTransitive', label: 'Transitive', checked: msg.isTransitive ?? false },
        { id: 'isSymmetric', label: 'Symmetric', checked: msg.isSymmetric ?? false },
        { id: 'isReflexive', label: 'Reflexive', checked: msg.isReflexive ?? false },
        { id: 'isIrreflexive', label: 'Irreflexive', checked: msg.isIrreflexive ?? false },
        { id: 'isAsymmetric', label: 'Asymmetric', checked: msg.isAsymmetric ?? false },
        { id: 'isFunctional', label: 'Functional', checked: msg.isFunctional ?? false },
        { id: 'isInverseFunctional', label: 'InverseFunctional', checked: msg.isInverseFunctional ?? false },
      ]);
      renderIriListSection(content, 'Domain', 'domainIris');
      renderIriListSection(content, 'Range', 'rangeIris');
      renderSingleIriSection(content, 'InverseOf', 'inverseOfIri', msg.inverseOfIri ?? '');
      renderIriListSection(content, 'SubPropertyOf', 'superPropertyIris');
      renderIriListSection(content, 'Equivalent To', 'equivalentPropertyIris');
      renderIriListSection(content, 'Disjoint With', 'disjointPropertyIris');
      renderPropertyChainSection(content);
      break;

    case 'dataProperty':
      iriListState['domainIris'] = msg.domainIris ?? [];
      iriListState['rangeIris'] = msg.rangeIris ?? [];
      iriListState['superPropertyIris'] = msg.superPropertyIris ?? [];
      renderCheckboxSection(content, 'Characteristics', [
        { id: 'isFunctional', label: 'Functional', checked: msg.isFunctional ?? false },
      ]);
      renderIriListSection(content, 'Domain', 'domainIris');
      renderIriListSection(content, 'Range', 'rangeIris');
      renderIriListSection(content, 'SubPropertyOf', 'superPropertyIris');
      break;

    case 'annotationProperty':
      iriListState['superPropertyIris'] = msg.superPropertyIris ?? [];
      renderIriListSection(content, 'SubPropertyOf', 'superPropertyIris');
      break;

    case 'individual':
      iriListState['classIris'] = msg.classIris ?? [];
      objAssertionState = (msg.objectPropertyAssertions ?? []).map(a => ({ ...a }));
      dataAssertionState = (msg.dataPropertyAssertions ?? []).map(a => ({ ...a }));
      renderIriListSection(content, 'Types', 'classIris');
      renderObjAssertionSection(content);
      renderDataAssertionSection(content);
      break;
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

function getCurrentState(): any {
  if (!currentIri) { return {}; }

  const base = { type: 'save' as const, iri: currentIri, entityType: currentEntityType };
  const annotData = collectAnnotationsForSave();
  let payload: Record<string, unknown> = { ...base };

  switch (currentEntityType) {
    case 'class':
      payload = {
        ...base, ...annotData,
        superClassIris: iriListState['superClassIris'] ?? [],
        superClassExpressions: collectEditorLines('superClassExpressions'),
        equivalentClassIris: iriListState['equivalentClassIris'] ?? [],
        equivalentClassExpressions: collectEditorLines('equivalentClassExpressions'),
        gciExpressions: collectEditorLines('gciExpressions'),
        disjointClassIris: iriListState['disjointClassIris'] ?? [],
      };
      break;

    case 'objectProperty':
      payload = {
        ...base, ...annotData,
        superPropertyIris: iriListState['superPropertyIris'] ?? [],
        domainIris: iriListState['domainIris'] ?? [],
        rangeIris: iriListState['rangeIris'] ?? [],
        equivalentPropertyIris: iriListState['equivalentPropertyIris'] ?? [],
        disjointPropertyIris: iriListState['disjointPropertyIris'] ?? [],
        propertyChains: propertyChainState,
        inverseOfIri: singleIriState['inverseOfIri'] || undefined,
        isTransitive: (document.getElementById('cb-isTransitive') as HTMLInputElement | null)?.checked ?? false,
        isSymmetric: (document.getElementById('cb-isSymmetric') as HTMLInputElement | null)?.checked ?? false,
        isReflexive: (document.getElementById('cb-isReflexive') as HTMLInputElement | null)?.checked ?? false,
        isIrreflexive: (document.getElementById('cb-isIrreflexive') as HTMLInputElement | null)?.checked ?? false,
        isAsymmetric: (document.getElementById('cb-isAsymmetric') as HTMLInputElement | null)?.checked ?? false,
        isFunctional: (document.getElementById('cb-isFunctional') as HTMLInputElement | null)?.checked ?? false,
        isInverseFunctional: (document.getElementById('cb-isInverseFunctional') as HTMLInputElement | null)?.checked ?? false,
      };
      break;

    case 'dataProperty':
      payload = {
        ...base, ...annotData,
        superPropertyIris: iriListState['superPropertyIris'] ?? [],
        domainIris: iriListState['domainIris'] ?? [],
        rangeIris: iriListState['rangeIris'] ?? [],
        isFunctional: (document.getElementById('cb-isFunctional') as HTMLInputElement | null)?.checked ?? false,
      };
      break;

    case 'annotationProperty':
      payload = {
        ...base, ...annotData,
        superPropertyIris: iriListState['superPropertyIris'] ?? [],
      };
      break;

    case 'individual':
      payload = {
        ...base, ...annotData,
        classIris: iriListState['classIris'] ?? [],
        objectPropertyAssertions: objAssertionState,
        dataPropertyAssertions: dataAssertionState,
      };
      break;
  }
  return payload;
}

function checkForChanges(): void {
  const currentStateString = JSON.stringify(getCurrentState());
  const saveBtn = document.getElementById('btn-save') as HTMLButtonElement | null;
  if (saveBtn) {
    const hasChanged = currentStateString !== lastSavedStateString;
    saveBtn.disabled = !hasChanged;
  }
}

function handleSave(): void {
  const payload = getCurrentState();
  if (!payload.iri) { return; }

  vscode.postMessage(payload);

  lastSavedStateString = JSON.stringify(payload);
  checkForChanges();

  const status = document.getElementById('status');
  if (status) {
    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --bg:      var(--vscode-editor-background, #1e1e1e);
      --fg:      var(--vscode-editor-foreground, #d4d4d4);
      --link:    var(--vscode-textLink-foreground, #4fc1ff);
      --border:  var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      --code-bg: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.1));
      --h2-fg:   var(--vscode-sideBarSectionHeader-foreground, #bbb);
      --badge-bg:var(--vscode-badge-background, rgba(128, 128, 128, 0.15));
      --badge-fg:var(--vscode-badge-foreground, #fff);
      --btn-bg:  var(--vscode-button-background, #0e639c);
      --btn-fg:  var(--vscode-button-foreground, #fff);
      --input-bg:var(--vscode-input-background, #3c3c3c);
      --input-border:var(--vscode-input-border, #555);
      --surface: var(--vscode-editor-background);
      --row-hover: rgba(128, 128, 128, 0.08);
      --accent:  var(--vscode-button-background);
      
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      
      --radius-sm: 3px;
      --radius-md: 6px;
      --radius-pill: 20px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      display: flex; flex-direction: column; height: 100vh;
      background: var(--bg); color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.4;
      overflow: hidden;
    }

    #toolbar {
      display: flex; align-items: center; gap: 12px; padding: 8px 16px;
      background: var(--vscode-titleBar-activeBackground, var(--bg));
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      z-index: 10;
    }
    #entity-label { font-weight: 600; font-size: 1.1em; }
    #entity-iri { opacity: 0.45; font-size: 0.85em; margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 350px; font-family: var(--vscode-editor-font-family, monospace); }
    #status { font-size: 11px; opacity: 0.7; font-style: italic; }

    #content {
      flex: 1; overflow-y: auto;
      padding: 24px 32px;
      max-width: 1000px;
      margin: 0 auto;
      width: 100%;
    }

    .type-badge {
      display: inline-flex; align-items: center; padding: 2px 10px; border-radius: var(--radius-pill); flex-shrink: 0;
      font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      background: var(--badge-bg); color: var(--badge-fg);
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .type-badge.class               { background: rgba(26, 94, 168, 0.2); border: 1px solid rgba(26, 94, 168, 0.3); }
    .type-badge.objectProperty      { background: rgba(122, 72, 0, 0.2);  border: 1px solid rgba(122, 72, 0, 0.3); }
    .type-badge.dataProperty        { background: rgba(26, 110, 58, 0.2); border: 1px solid rgba(26, 110, 58, 0.3); }
    .type-badge.annotationProperty  { background: rgba(90, 42, 136, 0.2); border: 1px solid rgba(90, 42, 136, 0.3); }
    .type-badge.individual          { background: rgba(122, 122, 0, 0.2); border: 1px solid rgba(122, 122, 0, 0.3); }

    button {
      padding: 4px 10px; cursor: pointer; border: 1px solid var(--border);
      background: var(--badge-bg); color: var(--fg);
      border-radius: var(--radius-sm); font-size: 0.85em; font-family: inherit;
      transition: all 0.15s ease;
      display: inline-flex; align-items: center; gap: 4px;
    }
    button:hover { background: rgba(128, 128, 128, 0.25); border-color: rgba(128, 128, 128, 0.4); }
    button:active { transform: translateY(1px); }
    
    .ghost-btn { background: transparent; border: 1px dashed var(--border); opacity: 0.7; }
    .ghost-btn:hover { opacity: 1; border-style: solid; }

    #btn-save {
      background: var(--btn-bg); color: var(--btn-fg); border: none;
      padding: 6px 16px; font-size: 13px; font-weight: 600;
      border-radius: var(--radius-md);
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    #btn-save:hover { opacity: 0.95; box-shadow: 0 3px 6px rgba(0,0,0,0.25); }
    #btn-save:disabled {
      opacity: 0.3;
      cursor: default;
      box-shadow: none;
      filter: grayscale(0.5);
    }

    .section { margin-bottom: 32px; }
    .section-header {
      font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--h2-fg); margin-bottom: 12px; font-weight: 700;
      display: flex; align-items: center; gap: 8px;
    }
    .section-actions { display: flex; align-items: center; gap: 4px; }
    .section-body { padding-left: 0; }

    .header-action-btn {
      padding: 0; width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid transparent; border-radius: 4px;
      color: var(--fg); opacity: 0.6; cursor: pointer; transition: all 0.1s;
      font-size: 16px; font-weight: 400;
    }
    .header-action-btn:hover { opacity: 1; background: rgba(128,128,128,0.1); border-color: var(--border); }

    table { border-collapse: separate; border-spacing: 0; width: 100%; margin-top: 4px; }
    td { padding: 8px 12px; vertical-align: middle; transition: background 0.1s; }
    tr:hover td { background: var(--row-hover); }

    .lang-tag { 
      font-size: 0.7em; 
      color: var(--fg);
      opacity: 0.6;
      background: rgba(128, 128, 128, 0.1); 
      padding: 1px 4px; 
      border-radius: 2px; 
      font-weight: 600;
    }
    .prop-iri-cell { 
      font-size: 0.85em; opacity: 0.6; width: 130px; font-weight: 500;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 12px 12px !important;
    }
    .prop-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .annotation-value-cell { position: relative; width: 100%; padding: 4px 0 !important; }
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; min-height: 4px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; border-radius: var(--radius-pill);
      padding: 2px 4px 2px 10px; font-size: 0.85em;
      border: 1px solid var(--border);
      transition: all 0.1s;
    }
    .chip:hover { border-color: var(--link); }
    .chip-label {
      color: var(--link); text-decoration: none; cursor: pointer; font-weight: 500;
    }
    .chip-label:hover { text-decoration: underline; }
    .chip-remove {
      border: none; background: transparent; color: var(--vscode-errorForeground, #f48771); opacity: 0.5;
      cursor: pointer; padding: 0 4px; font-size: 1.2em; line-height: 1; border-radius: 50%;
    }
    .chip-remove:hover { opacity: 1; background: rgba(244, 135, 113, 0.15); }

    .add-item-footer { margin-top: 4px; }
    .add-iri-input-wrapper { position: relative; display: inline-flex; flex-direction: column; margin-top: 4px; }
    .iri-input {
      background: var(--input-bg); color: var(--fg); border: 1px solid var(--input-border);
      padding: 4px 10px; border-radius: var(--radius-md); font-family: inherit; font-size: 13px;
      width: 280px; transition: all 0.1s;
    }
    .iri-input:focus { outline: none; border-color: var(--link); box-shadow: 0 0 0 2px rgba(79, 193, 255, 0.2); }
    
    .iri-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; z-index: 100;
      background: var(--vscode-dropdown-background, #2d2d2d);
      border: 1px solid var(--border); border-radius: var(--radius-md);
      min-width: 300px; max-height: 250px; overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .iri-dropdown-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; cursor: pointer; font-size: 0.9em;
      border-bottom: 1px solid rgba(128,128,128,0.1);
    }
    .iri-dropdown-item:last-child { border-bottom: none; }
    .iri-dropdown-item:hover, .iri-dropdown-item.selected {
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff);
    }
    .iri-dropdown-type { opacity: 0.5; font-size: 0.75em; margin-left: 8px; font-weight: 600; text-transform: uppercase; }

    .checkbox-row { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 0; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500; }
    .checkbox-label input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }

    .expression-entry { margin-bottom: 16px; position: relative; }
    .expression-editor { 
      min-height: 30px; max-height: 400px; overflow: auto; 
      border: 1px solid var(--border); border-radius: var(--radius-md); 
      background: rgba(128, 128, 128, 0.04);
      transition: all 0.1s;
    }
    .expression-editor:hover { border-color: var(--link); background: rgba(128, 128, 128, 0.08); }
    .expression-editor:focus-within { border-color: var(--link); background: field; }
    .expression-add-btn { 
      background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); 
      border: none; border-radius: var(--radius-sm); padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer; 
    }
    .expression-add-btn:hover { opacity: 0.9; }
    .expression-delete-btn { 
      position: absolute; top: -10px; right: -10px; z-index: 5;
      background: var(--bg); border: 1px solid var(--border); border-radius: 50%;
      color: var(--vscode-errorForeground, #f48771); opacity: 0.8; 
      font-size: 16px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.1s;
    }
    .expression-delete-btn:hover { opacity: 1; transform: scale(1.1); box-shadow: 0 1px 4px rgba(0,0,0,0.2); }

    .annotation-delete-btn { position: absolute; top: 50%; right: -12px; transform: translateY(-50%); opacity: 0; z-index: 10; }
    tr:hover .annotation-delete-btn { opacity: 0.8; }
    tr:hover .annotation-delete-btn:hover { opacity: 1; transform: translateY(-50%) scale(1.1); }

    .cm-clickable-entity {
      color: var(--link); text-decoration: none; border-bottom: 1px dashed var(--link);
      cursor: pointer; transition: all 0.1s;
    }
    .cm-clickable-entity:hover {
      background: rgba(79, 193, 255, 0.1); border-bottom-style: solid;
    }

    .assertion-arrow { padding: 0 12px; opacity: 0.3; font-weight: bold; }
    .data-value {
      background: var(--code-bg); padding: 2px 6px; border-radius: var(--radius-sm);
      font-family: var(--vscode-editor-font-family, monospace); font-size: 0.95em; color: #ce9178;
    }
    .inline-remove { margin-left: 8px; vertical-align: middle; }
    
    .chain-row { 
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; 
      padding: 6px 10px; background: rgba(128,128,128,0.05); border-radius: var(--radius-md); 
      border: 1px solid var(--border);
    }
    .chain-members { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; flex: 1; }
    .chain-sep { opacity: 0.4; font-weight: bold; padding: 0 4px; }

    .new-assertion-inputs {
      display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;
      background: rgba(128, 128, 128, 0.05); padding: 12px; border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }

    .annotation-value-input {
      color: var(--fg);
      border: 1px solid var(--input-border);
      padding: 8px 14px; border-radius: var(--radius-md);
      font-family: inherit; font-size: inherit;
      width: 100%; box-sizing: border-box;
      transition: all 0.1s;
      line-height: 1.4;
    }
    .annotation-value-input:focus { outline: none; border-color: var(--link); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    textarea.annotation-value-input { min-height: 6em; resize: vertical; width: 100%; flex: none; }
    .annotation-value-display { 
      cursor: text; padding: 8px 14px; min-height: 1.5em; white-space: pre-wrap; word-break: break-all;
      border-radius: var(--radius-md); border: 1px solid var(--border);
      
      transition: all 0.1s;
      line-height: 1.4;
    }
    .annotation-value-display:hover { border-color: var(--link); }
    .annotation-link { color: var(--link); text-decoration: underline; cursor: pointer; }
    .annotation-image-preview { display: block; max-width: 100%; max-height: 300px; margin-top: 8px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 1px solid var(--border); }
    
    .lang-tag-input {
      background: rgba(128, 128, 128, 0.1);
      color: var(--fg);
      opacity: 0.65;
      border: 1px solid transparent;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: inherit;
      font-size: 0.75em;
      width: 44px;
      text-align: center;
      font-weight: 600;
    }
    .lang-tag-input:focus { outline: none; opacity: 1; border-color: var(--link); background: var(--input-bg); }
    
    @font-face {
      font-family: 'codicon';
      src: url(https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.32/dist/codicon.ttf) format('truetype');
    }
    .icon { font-family: 'codicon'; vertical-align: middle; }
  `;
  document.head.appendChild(style);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

injectStyles();

document.body.style.cssText = `
  display: flex; flex-direction: column; height: 100vh; margin: 0; padding: 0;
  overflow: hidden;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
`;

buildToolbar();

const contentEl = document.createElement('div');
contentEl.id = 'content';
document.body.appendChild(contentEl);

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as LoadEntityMessage | CompletionResultMessage | ValidationResultMessage;

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

  if (msg.type === 'loadEntity') {
    renderEntity(msg);
    lastSavedStateString = JSON.stringify(getCurrentState());
    checkForChanges();
  }
});

vscode.postMessage({ type: 'ready' });
