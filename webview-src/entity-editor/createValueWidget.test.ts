// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createValueWidget, MULTILINE_IRIS } from './createValueWidget';

const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

describe('createValueWidget', () => {
  it('returns a textarea for skos:definition', () => {
    const widget = createValueWidget(SKOS_DEFINITION, 'hello', () => {});
    expect(widget.tagName.toLowerCase()).toBe('textarea');
  });

  it('returns a textarea for rdfs:comment', () => {
    const widget = createValueWidget(RDFS_COMMENT, 'hello', () => {});
    expect(widget.tagName.toLowerCase()).toBe('textarea');
  });

  it('returns an input[type=text] for rdfs:label', () => {
    const widget = createValueWidget(RDFS_LABEL, 'hello', () => {});
    expect(widget.tagName.toLowerCase()).toBe('input');
    expect((widget as HTMLInputElement).type).toBe('text');
  });

  it('calls onChange with the current value on input event', () => {
    const onChange = vi.fn();
    const widget = createValueWidget(SKOS_DEFINITION, 'initial', onChange);
    (widget as HTMLTextAreaElement).value = 'updated';
    widget.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('sets the initial value on the widget', () => {
    const widget = createValueWidget(SKOS_DEFINITION, 'my definition', () => {});
    expect(widget.value).toBe('my definition');
  });

  it('applies the annotation-value-input CSS class', () => {
    const ta = createValueWidget(SKOS_DEFINITION, '', () => {});
    const inp = createValueWidget(RDFS_LABEL, '', () => {});
    expect(ta.className).toBe('annotation-value-input');
    expect(inp.className).toBe('annotation-value-input');
  });

  it('MULTILINE_IRIS contains exactly skos:definition and rdfs:comment', () => {
    expect(MULTILINE_IRIS).toContain(SKOS_DEFINITION);
    expect(MULTILINE_IRIS).toContain(RDFS_COMMENT);
    expect(MULTILINE_IRIS).not.toContain(RDFS_LABEL);
  });
});
