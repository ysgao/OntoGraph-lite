// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createReadOnlyExpressionEntry } from './readOnlyExpressionEntry';

describe('createReadOnlyExpressionEntry', () => {
  it('renders the expression text with Manchester-syntax highlighting', () => {
    const body = document.createElement('div');
    const editor = createReadOnlyExpressionEntry(body, "'A' and 'B'", [], () => {});
    expect(body.textContent).toContain('A');
    expect(body.textContent).toContain('and');
    expect(editor.dom.querySelector('.cm-keyword, [class*="ͼ"]')).toBeTruthy();
  });

  it('does not include an add ("+") or delete ("×") button', () => {
    const body = document.createElement('div');
    createReadOnlyExpressionEntry(body, "'A'", [], () => {});
    expect(body.querySelector('.expression-delete-btn')).toBeNull();
    expect(body.querySelector('.header-action-btn')).toBeNull();
  });

  it('marks the underlying CodeMirror editor as non-editable', () => {
    const body = document.createElement('div');
    const editor = createReadOnlyExpressionEntry(body, "'A'", [], () => {});
    expect(editor.state.readOnly).toBe(true);
    expect(editor.contentDOM.getAttribute('contenteditable')).toBe('false');
  });

  it('renders clickable entity decorations for provided refs and invokes the click callback', () => {
    const body = document.createElement('div');
    const onEntityClick = vi.fn();
    const refs = [{ from: 0, to: 3, iri: 'http://example.org/B', entityType: 'class' as const, label: 'B' }];
    const editor = createReadOnlyExpressionEntry(body, "'B'", refs, onEntityClick);

    const clickable = editor.dom.querySelector<HTMLElement>('.cm-clickable-entity');
    expect(clickable).toBeTruthy();
    expect(clickable?.dataset['iri']).toBe('http://example.org/B');

    clickable?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onEntityClick).toHaveBeenCalledWith('http://example.org/B');
  });
});
