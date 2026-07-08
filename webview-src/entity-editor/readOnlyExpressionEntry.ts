import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { formatManchesterForDisplay } from '../../src/utils/ManchesterFormatting';
import {
  manchesterLanguage,
  vsCodeTheme,
  clickableEntityExtension,
  shiftRefsForFormat,
  type ExpressionEntityRef,
} from './manchesterCodeMirror';

/**
 * Renders one read-only expression entry: Manchester-syntax-highlighted text with
 * clickable entity references, matching the editable EquivalentTo/GCI sections'
 * visual style — but with no "+" add button, no "×" delete button, and an
 * uneditable CodeMirror instance, since this content is derived reasoning output
 * (FR-009: never authored or synced back to the source file).
 */
export function createReadOnlyExpressionEntry(
  body: HTMLElement,
  expr: string,
  refs: ExpressionEntityRef[],
  onEntityClick: (iri: string) => void,
): EditorView {
  const entry = document.createElement('div');
  entry.className = 'expression-entry expression-entry-readonly';

  const editorEl = document.createElement('div');
  editorEl.className = 'expression-editor';
  entry.appendChild(editorEl);

  body.appendChild(entry);

  return new EditorView({
    state: EditorState.create({
      doc: formatManchesterForDisplay(expr),
      extensions: [
        manchesterLanguage,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        clickableEntityExtension(shiftRefsForFormat(expr, refs), onEntityClick),
        vsCodeTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    }),
    parent: editorEl,
  });
}
