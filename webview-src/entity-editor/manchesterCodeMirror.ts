import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { StreamLanguage, type StringStream, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { findFormatBreaks } from '../../src/utils/ManchesterFormatting';

export type EntityType = 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';

export interface ExpressionEntityRef {
  from: number;
  to: number;
  iri: string;
  entityType: EntityType;
  label: string;
}

const MANCHESTER_KEYWORDS = new Set([
  'some', 'all', 'value', 'min', 'max', 'exactly', 'only',
  'and', 'or', 'not', 'that', 'Self',
]);

export const manchesterLanguage = StreamLanguage.define({
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

export const manchesterHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--keyword-fg, #9e0000)' },
]);

export const vsCodeTheme = EditorView.theme({
  '&': {
    color: 'var(--vscode-editor-foreground)',
    backgroundColor: 'var(--vscode-editor-background)',
    fontFamily: 'var(--vscode-editor-font-family, var(--vscode-font-family))',
    fontSize: 'var(--vscode-editor-font-size, var(--vscode-font-size))',
  },
  '&.cm-focused': {
    backgroundColor: 'var(--vscode-input-background)',
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
  '.cm-tooltip': {
    backgroundColor: 'var(--vscode-editorSuggestWidget-background, var(--vscode-editor-background))',
    border: '1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.2)))',
    color: 'var(--vscode-editorSuggestWidget-foreground, var(--vscode-editor-foreground))',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-activeSelectionBackground, #094771)) !important',
    color: 'var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-list-activeSelectionForeground, #fff)) !important',
  },
});

/** Clickable entity decorations. `onEntityClick` is injected so this module has no vscode dependency. */
export function clickableEntityExtension(refs: ExpressionEntityRef[], onEntityClick: (iri: string) => void) {
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
        onEntityClick(iri);
        return true;
      },
    }),
  ];
}

/**
 * The server computes entity-ref offsets against the original single-line
 * expressions. After formatting, each expression expands by 4 chars per
 * 'and' break. Remap every ref so it points at the correct position in the
 * formatted initialDoc.
 */
export function shiftRefsForFormat(
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
