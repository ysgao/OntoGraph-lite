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

// ── Message types ─────────────────────────────────────────────────────────────

type EntityType = 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';

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
  iriLabels: Record<string, string>;
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

// IRI list state: sectionKey → IRI[]
const iriListState: Record<string, string[]> = {};

// Single IRI state: fieldKey → IRI
const singleIriState: Record<string, string> = {};

// Assertion state for individuals
let objAssertionState: { propertyIri: string; targetIri: string }[] = [];
let dataAssertionState: { propertyIri: string; value: string; datatype?: string }[] = [];

// CodeMirror editors: sectionKey → EditorView
const editorMap: Record<string, EditorView> = {};

// Completion/validation request tracking
let nextReqId = 0;
const pendingCompletions = new Map<number, (items: CompletionResultMessage['items']) => void>();
const pendingValidations = new Map<number, (errors: ValidationResultMessage['errors']) => void>();

// ── Annotation priority constants ─────────────────────────────────────────────

const RDFS_LABEL      = 'http://www.w3.org/2000/01/rdf-schema#label';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_ALT_LABEL  = 'http://www.w3.org/2004/02/skos/core#altLabel';
const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const PRIORITY_IRIS   = [RDFS_LABEL, SKOS_PREF_LABEL, SKOS_ALT_LABEL, SKOS_DEFINITION];

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
  const word = context.matchBefore(/[\w:_-]{2,}/);
  if (!word) { return null; }

  const prefix = word.text;
  const reqId = nextReqId++;

  const items = await new Promise<CompletionResultMessage['items']>((resolve) => {
    const timer = setTimeout(() => { pendingCompletions.delete(reqId); resolve([]); }, 400);
    pendingCompletions.set(reqId, (result) => { clearTimeout(timer); resolve(result); });
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

function createEditor(parent: HTMLElement, initialDoc: string): EditorView {
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
        vsCodeTheme,
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
      const typeEl = document.createElement('span');
      typeEl.className = 'iri-dropdown-type';
      typeEl.textContent = item.entityType;
      row.appendChild(nameEl);
      row.appendChild(typeEl);
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

  function rerender(): void {
    body.innerHTML = '';
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

    // Add button
    const addContainer = document.createElement('div');
    addContainer.className = 'add-iri-container';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'add-iri-input-wrapper';
      addContainer.appendChild(inputWrapper);
      const inp = createIriInput(inputWrapper, 'Search for entity…', (iri, label) => {
        if (iri && !(iriListState[key] ?? []).includes(iri)) {
          localIriLabels[iri] = label;
          iriListState[key] = [...(iriListState[key] ?? []), iri];
        }
        rerender();
      }, () => { rerender(); });
      requestAnimationFrame(() => inp.focus());
    });

    addContainer.appendChild(addBtn);
    body.appendChild(chips);
    body.appendChild(addContainer);
  }

  rerender();
  container.appendChild(sec);
}

// ── Expression section ────────────────────────────────────────────────────────

function renderExpressionSection(container: HTMLElement, title: string, key: string, initialDoc: string): void {
  if (editorMap[key]) { editorMap[key].destroy(); delete editorMap[key]; }

  const sec = makeSectionEl(title);
  const body = sec.querySelector('.section-body') as HTMLElement;
  const editorEl = document.createElement('div');
  editorEl.className = 'expression-editor';
  body.appendChild(editorEl);
  container.appendChild(sec);

  editorMap[key] = createEditor(editorEl, initialDoc);
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
    addDiv.className = 'add-assertion-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add assertion';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      let newPropIri = '';
      let newPropLabel = '';

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
        newPropLabel = lbl;
        localIriLabels[iri] = lbl;
        requestAnimationFrame(() => inp2.focus());
      });
      const inp2 = createIriInput(w2, 'Target…', (iri, lbl) => {
        if (newPropIri) {
          localIriLabels[iri] = lbl;
          objAssertionState.push({ propertyIri: newPropIri, targetIri: iri });
          void newPropLabel;
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
      removeBtn.textContent = '×';
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
    addDiv.className = 'add-assertion-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add assertion';
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

      // Col 1: property local name
      const tdProp = document.createElement('td');
      tdProp.className = 'prop-iri-cell';
      tdProp.title = entry.propIri;
      tdProp.textContent = localNameFromIri(entry.propIri);

      // Col 2: lang tag (only for rdfs:label or entries that already carry one)
      const tdLang = document.createElement('td');
      tdLang.className = 'lang-tag-cell';
      if (entry.propIri === RDFS_LABEL || entry.lang !== undefined) {
        const langInput = document.createElement('input');
        langInput.type = 'text';
        langInput.className = 'lang-tag-input';
        langInput.value = entry.lang ?? '';
        langInput.placeholder = 'lang';
        langInput.title = 'Language tag';
        langInput.addEventListener('input', () => {
          annotationState[i] = { ...annotationState[i], lang: langInput.value.trim() || undefined };
        });
        tdLang.appendChild(langInput);
      }

      // Col 3: editable value
      const tdValue = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'annotation-value-input';
      valueInput.value = entry.value;
      valueInput.addEventListener('input', () => {
        annotationState[i] = { ...annotationState[i], value: valueInput.value };
      });
      tdValue.appendChild(valueInput);

      // Col 4: delete button
      const tdDel = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'chip-remove inline-remove';
      delBtn.textContent = '×';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', () => {
        annotationState.splice(i, 1);
        rerender();
      });
      tdDel.appendChild(delBtn);

      tr.appendChild(tdProp);
      tr.appendChild(tdLang);
      tr.appendChild(tdValue);
      tr.appendChild(tdDel);
      table.appendChild(tr);
    }
    body.appendChild(table);

    // Add annotation row
    const addDiv = document.createElement('div');
    addDiv.className = 'add-assertion-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add annotation';
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      let newPropIri = '';

      const row = document.createElement('div');
      row.className = 'new-assertion-inputs';

      const w1 = document.createElement('div');
      w1.className = 'add-iri-input-wrapper';

      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'iri-input';
      valueInput.placeholder = 'Value…';

      const langInput = document.createElement('input');
      langInput.type = 'text';
      langInput.className = 'lang-tag-input';
      langInput.placeholder = 'lang';
      langInput.title = 'Language tag (optional)';

      const okBtn = document.createElement('button');
      okBtn.className = 'add-btn';
      okBtn.textContent = 'Add';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'add-btn cancel-btn';
      cancelBtn.textContent = 'Cancel';

      const propInput = createIriInput(w1, 'Annotation property…', (iri, _lbl) => {
        newPropIri = iri;
        requestAnimationFrame(() => valueInput.focus());
      }, () => { rerender(); }, 'annotationProperty');

      okBtn.addEventListener('click', () => {
        const val = valueInput.value.trim();
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
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { okBtn.click(); }
        if (e.key === 'Escape') { cancelBtn.click(); }
      });

      row.appendChild(w1);
      row.appendChild(valueInput);
      row.appendChild(langInput);
      row.appendChild(okBtn);
      row.appendChild(cancelBtn);
      addDiv.appendChild(row);
      requestAnimationFrame(() => propInput.focus());
    });

    addDiv.appendChild(addBtn);
    body.appendChild(addDiv);
  }

  rerender();
  container.appendChild(sec);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSectionEl(title: string): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'section';
  const h = document.createElement('h2');
  h.textContent = title;
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
  const editor = editorMap[key];
  if (!editor) { return []; }
  return editor.state.doc.toString()
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
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
      const atIdx = v.lastIndexOf('@');
      const haslang = atIdx > 0 && /^[A-Za-z][A-Za-z0-9\-]*$/.test(v.slice(atIdx + 1));
      entries.push({
        propIri,
        value: haslang ? v.slice(0, atIdx) : v,
        lang:  haslang ? v.slice(atIdx + 1) : undefined,
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

  const labelEl = document.createElement('span');
  labelEl.id = 'entity-label';

  const iriEl = document.createElement('span');
  iriEl.id = 'entity-iri';

  const copyBtn = document.createElement('button');
  copyBtn.id = 'btn-copy-iri';
  copyBtn.textContent = '⎘ Copy IRI';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentIri).then(() => {
      const old = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = old; }, 1200);
    });
  });

  const spacer = document.createElement('div');
  spacer.style.cssText = 'margin-left: auto; display: flex; gap: 8px; align-items: center;';

  const saveBtn = document.createElement('button');
  saveBtn.id = 'btn-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', handleSave);

  const status = document.createElement('span');
  status.id = 'status';

  spacer.appendChild(copyBtn);
  spacer.appendChild(saveBtn);
  spacer.appendChild(status);
  toolbar.appendChild(badge);
  toolbar.appendChild(labelEl);
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
  document.getElementById('entity-label')!.textContent = msg.label;
  document.getElementById('entity-iri')!.textContent = msg.iri;

  // Clear old editors and entity sections
  for (const key of Object.keys(editorMap)) {
    editorMap[key].destroy();
    delete editorMap[key];
  }
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
        (msg.superClassExpressions ?? []).join('\n'));
      renderIriListSection(content, 'EquivalentTo', 'equivalentClassIris');
      renderExpressionSection(content, 'EquivalentTo (expressions)', 'equivalentClassExpressions',
        (msg.equivalentClassExpressions ?? []).join('\n'));
      renderIriListSection(content, 'DisjointWith', 'disjointClassIris');
      break;

    case 'objectProperty':
      iriListState['domainIris'] = msg.domainIris ?? [];
      iriListState['rangeIris'] = msg.rangeIris ?? [];
      iriListState['superPropertyIris'] = msg.superPropertyIris ?? [];
      singleIriState['inverseOfIri'] = msg.inverseOfIri ?? '';
      renderCheckboxSection(content, 'Characteristics', [
        { id: 'isTransitive', label: 'Transitive', checked: msg.isTransitive ?? false },
        { id: 'isSymmetric', label: 'Symmetric', checked: msg.isSymmetric ?? false },
        { id: 'isFunctional', label: 'Functional', checked: msg.isFunctional ?? false },
        { id: 'isInverseFunctional', label: 'InverseFunctional', checked: msg.isInverseFunctional ?? false },
      ]);
      renderIriListSection(content, 'Domain', 'domainIris');
      renderIriListSection(content, 'Range', 'rangeIris');
      renderSingleIriSection(content, 'InverseOf', 'inverseOfIri', msg.inverseOfIri ?? '');
      renderIriListSection(content, 'SubPropertyOf', 'superPropertyIris');
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

function handleSave(): void {
  if (!currentIri) { return; }

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
        disjointClassIris: iriListState['disjointClassIris'] ?? [],
      };
      break;

    case 'objectProperty':
      payload = {
        ...base, ...annotData,
        superPropertyIris: iriListState['superPropertyIris'] ?? [],
        domainIris: iriListState['domainIris'] ?? [],
        rangeIris: iriListState['rangeIris'] ?? [],
        inverseOfIri: singleIriState['inverseOfIri'] || undefined,
        isTransitive: (document.getElementById('cb-isTransitive') as HTMLInputElement | null)?.checked,
        isSymmetric: (document.getElementById('cb-isSymmetric') as HTMLInputElement | null)?.checked,
        isFunctional: (document.getElementById('cb-isFunctional') as HTMLInputElement | null)?.checked,
        isInverseFunctional: (document.getElementById('cb-isInverseFunctional') as HTMLInputElement | null)?.checked,
      };
      break;

    case 'dataProperty':
      payload = {
        ...base, ...annotData,
        superPropertyIris: iriListState['superPropertyIris'] ?? [],
        domainIris: iriListState['domainIris'] ?? [],
        rangeIris: iriListState['rangeIris'] ?? [],
        isFunctional: (document.getElementById('cb-isFunctional') as HTMLInputElement | null)?.checked,
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

  vscode.postMessage(payload);

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
      --border:  var(--vscode-panel-border, #444);
      --code-bg: var(--vscode-textCodeBlock-background, #2d2d2d);
      --h2-fg:   var(--vscode-sideBarSectionHeader-foreground, #bbb);
      --badge-bg:var(--vscode-badge-background, #4d4d4d);
      --badge-fg:var(--vscode-badge-foreground, #fff);
      --btn-bg:  var(--vscode-button-background, #0e639c);
      --btn-fg:  var(--vscode-button-foreground, #fff);
      --input-bg:var(--vscode-input-background, #3c3c3c);
      --input-border:var(--vscode-input-border, #555);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex; flex-direction: column; height: 100vh;
      background: var(--bg); color: var(--fg);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      overflow: hidden;
    }

    #toolbar {
      display: flex; align-items: center; gap: 8px; padding: 6px 12px;
      background: var(--vscode-titleBar-activeBackground, var(--bg));
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    #entity-label { font-weight: 600; }
    #entity-iri { opacity: 0.55; font-size: 11px; margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
    #status { font-size: 11px; opacity: 0.7; }

    #content {
      flex: 1; overflow-y: auto;
      padding: 12px 16px;
      max-width: 900px;
    }

    .type-badge {
      display: inline-block; padding: 2px 8px; border-radius: 3px; flex-shrink: 0;
      font-size: 0.78em; font-weight: 600; letter-spacing: 0.04em;
      background: var(--badge-bg); color: var(--badge-fg);
    }
    .type-badge.class               { background: #1a5ea8; color: #d0e8ff; }
    .type-badge.objectProperty      { background: #7a4800; color: #ffd9a0; }
    .type-badge.dataProperty        { background: #1a6e3a; color: #a8ffc4; }
    .type-badge.annotationProperty  { background: #5a2a88; color: #e0c4ff; }
    .type-badge.individual          { background: #7a7a00; color: #ffffa0; }

    button {
      padding: 2px 8px; cursor: pointer; border: 1px solid var(--border);
      background: var(--badge-bg); color: var(--fg);
      border-radius: 3px; font-size: 0.78em; font-family: inherit;
    }
    button:hover { opacity: 0.8; }
    #btn-save {
      background: var(--btn-bg); color: var(--btn-fg); border-color: transparent;
      padding: 4px 12px; font-size: inherit;
    }

    .section { margin-bottom: 18px; border-top: 1px solid var(--border); padding-top: 12px; }
    h2 {
      font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--h2-fg); margin-bottom: 8px;
    }
    .section-body { padding-left: 2px; }

    table { border-collapse: collapse; width: 100%; }
    td { padding: 3px 6px; vertical-align: middle; }
    tr:hover td { background: rgba(255,255,255,0.04); }
    .lang-tag { font-size: 0.78em; opacity: 0.7; background: var(--code-bg); padding: 1px 4px; border-radius: 2px; }
    .lang-tag-cell { white-space: nowrap; }
    .prop-iri-cell { font-size: 0.82em; opacity: 0.75; white-space: nowrap; }

    .chip-list { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; min-height: 4px; }
    .chip {
      display: inline-flex; align-items: center; gap: 3px;
      background: var(--badge-bg); border-radius: 3px;
      padding: 1px 4px 1px 6px; font-size: 0.82em;
    }
    .chip-label {
      color: var(--link); text-decoration: none; cursor: pointer;
    }
    .chip-label:hover { text-decoration: underline; }
    .chip-remove {
      border: none; background: transparent; color: var(--fg); opacity: 0.6;
      cursor: pointer; padding: 0 2px; font-size: 1em; line-height: 1;
    }
    .chip-remove:hover { opacity: 1; background: transparent; border: none; }

    .add-iri-container { display: flex; align-items: center; gap: 4px; }
    .add-btn { font-size: 0.78em; padding: 2px 8px; }
    .cancel-btn { opacity: 0.7; }
    .add-iri-input-wrapper { position: relative; display: inline-flex; flex-direction: column; }
    .iri-input {
      background: var(--input-bg); color: var(--fg); border: 1px solid var(--input-border);
      padding: 2px 6px; border-radius: 3px; font-family: inherit; font-size: inherit;
      width: 220px;
    }
    .iri-input:focus { outline: 1px solid var(--link); }
    .iri-dropdown {
      position: absolute; top: 100%; left: 0; z-index: 100;
      background: var(--vscode-dropdown-background, #2d2d2d);
      border: 1px solid var(--border); border-radius: 3px;
      min-width: 220px; max-height: 200px; overflow-y: auto;
    }
    .iri-dropdown-item {
      display: flex; justify-content: space-between;
      padding: 4px 8px; cursor: pointer; font-size: 0.9em;
    }
    .iri-dropdown-item:hover, .iri-dropdown-item.selected {
      background: var(--vscode-list-activeSelectionBackground, #094771);
    }
    .iri-dropdown-type { opacity: 0.5; font-size: 0.85em; margin-left: 8px; }

    .single-iri-wrapper { display: flex; align-items: center; gap: 4px; }

    .checkbox-row { display: flex; flex-wrap: wrap; gap: 12px; }
    .checkbox-label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    .checkbox-label input { cursor: pointer; }

    .expression-editor { min-height: 80px; max-height: 200px; overflow: auto; border: 1px solid var(--border); border-radius: 3px; }

    .assertion-table { border-collapse: separate; border-spacing: 0 2px; }
    .assertion-arrow { padding: 0 8px; opacity: 0.5; }
    .data-value {
      background: var(--code-bg); padding: 1px 4px; border-radius: 2px;
      font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em;
    }
    .inline-remove { margin-left: 4px; vertical-align: middle; }
    .add-assertion-row { margin-top: 4px; }
    .new-assertion-inputs {
      display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap;
    }

    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: var(--code-bg); padding: 1px 4px; border-radius: 2px; font-family: var(--vscode-editor-font-family, monospace); }

    /* Annotation editing */
    .annotation-value-input {
      background: var(--input-bg); color: var(--fg);
      border: 1px solid transparent;
      padding: 2px 6px; border-radius: 3px;
      font-family: inherit; font-size: inherit; width: 100%;
    }
    .annotation-value-input:focus { outline: none; border-color: var(--input-border); }
    .lang-tag-input {
      background: var(--input-bg); color: var(--fg);
      border: 1px solid var(--input-border);
      padding: 2px 3px; border-radius: 3px;
      font-family: inherit; font-size: 0.78em; width: 46px;
    }
    .lang-tag-input:focus { outline: 1px solid var(--link); }
    .annotation-table .prop-iri-cell { width: 130px; white-space: nowrap; }
    .annotation-table .lang-tag-cell { width: 52px; }
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
  }
});

vscode.postMessage({ type: 'ready' });
