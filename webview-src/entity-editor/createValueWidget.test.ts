// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createValueWidget, MULTILINE_IRIS } from './createValueWidget';

const SKOS            = 'http://www.w3.org/2004/02/skos/core#';
const SKOS_DEFINITION = `${SKOS}definition`;
const RDFS_COMMENT    = 'http://www.w3.org/2000/01/rdf-schema#comment';
const RDFS_LABEL      = 'http://www.w3.org/2000/01/rdf-schema#label';

describe('createValueWidget', () => {
  it('returns a textarea for skos:definition', () => {
    expect(createValueWidget(SKOS_DEFINITION, '', () => {}).tagName.toLowerCase()).toBe('textarea');
  });

  it('returns a textarea for rdfs:comment', () => {
    expect(createValueWidget(RDFS_COMMENT, '', () => {}).tagName.toLowerCase()).toBe('textarea');
  });

  it('returns a textarea for rdfs:label', () => {
    expect(createValueWidget(RDFS_LABEL, '', () => {}).tagName.toLowerCase()).toBe('textarea');
  });

  it('applies the annotation-value-input CSS class to all widgets', () => {
    expect(createValueWidget(SKOS_DEFINITION, '', () => {}).className).toBe('annotation-value-input');
    expect(createValueWidget(RDFS_LABEL, '', () => {}).className).toBe('annotation-value-input');
  });

  it('sets the initial value on the widget', () => {
    expect(createValueWidget(SKOS_DEFINITION, 'my definition', () => {}).value).toBe('my definition');
    expect(createValueWidget(RDFS_LABEL, 'my label', () => {}).value).toBe('my label');
  });

  it('calls onChange on input for multiline properties', () => {
    const onChange = vi.fn();
    const widget = createValueWidget(SKOS_DEFINITION, 'initial', onChange);
    widget.value = 'updated';
    widget.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('calls onChange on input for single-line properties', () => {
    const onChange = vi.fn();
    const widget = createValueWidget(RDFS_LABEL, 'initial', onChange);
    widget.value = 'updated';
    widget.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('strips newlines from single-line properties on input', () => {
    const onChange = vi.fn();
    const widget = createValueWidget(RDFS_LABEL, '', onChange);
    widget.value = 'foo\nbar';
    widget.dispatchEvent(new Event('input'));
    expect(widget.value).toBe('foo bar');
    expect(onChange).toHaveBeenCalledWith('foo bar');
  });

  it('preserves newlines in multiline properties', () => {
    const onChange = vi.fn();
    const widget = createValueWidget(SKOS_DEFINITION, '', onChange);
    widget.value = 'foo\nbar';
    widget.dispatchEvent(new Event('input'));
    expect(widget.value).toBe('foo\nbar');
    expect(onChange).toHaveBeenCalledWith('foo\nbar');
  });

  it('prevents Enter key on single-line properties', () => {
    const widget = createValueWidget(RDFS_LABEL, '', () => {});
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    widget.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent Enter key on multiline properties', () => {
    const widget = createValueWidget(SKOS_DEFINITION, '', () => {});
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    widget.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('MULTILINE_IRIS includes all prose note properties', () => {
    const expected = [
      RDFS_COMMENT,
      SKOS_DEFINITION,
      `${SKOS}note`,
      `${SKOS}changeNote`,
      `${SKOS}editorialNote`,
      `${SKOS}example`,
      `${SKOS}historyNote`,
      `${SKOS}scopeNote`,
    ];
    for (const iri of expected) {
      expect(MULTILINE_IRIS).toContain(iri);
    }
    expect(MULTILINE_IRIS).not.toContain(RDFS_LABEL);
  });
});
