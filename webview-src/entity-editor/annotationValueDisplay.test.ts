// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { segmentAnnotationValue, createAnnotationDisplayElement } from './annotationValueDisplay';

describe('segmentAnnotationValue — basic URL detection', () => {
  it('bare URL → single url segment', () => {
    expect(segmentAnnotationValue('http://example.org')).toEqual([
      { type: 'url', content: 'http://example.org' },
    ]);
  });

  it('URL in prose → text + url + text segments', () => {
    expect(segmentAnnotationValue('See http://example.org more')).toEqual([
      { type: 'text', content: 'See ' },
      { type: 'url', content: 'http://example.org' },
      { type: 'text', content: ' more' },
    ]);
  });

  it('plain text with no URL → single text segment', () => {
    expect(segmentAnnotationValue('plain text')).toEqual([
      { type: 'text', content: 'plain text' },
    ]);
  });

  it('empty string → single empty text segment', () => {
    expect(segmentAnnotationValue('')).toEqual([
      { type: 'text', content: '' },
    ]);
  });

  it('two URLs in prose → text+url+text+url+text', () => {
    const segs = segmentAnnotationValue('http://a.org and http://b.org');
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ type: 'url', content: 'http://a.org' });
    expect(segs[1]).toEqual({ type: 'text', content: ' and ' });
    expect(segs[2]).toEqual({ type: 'url', content: 'http://b.org' });
  });

  it('https URL is detected', () => {
    const segs = segmentAnnotationValue('https://example.org/path');
    expect(segs).toEqual([{ type: 'url', content: 'https://example.org/path' }]);
  });
});

describe('segmentAnnotationValue — image URL detection', () => {
  it('.png URL → imageUrl segment', () => {
    expect(segmentAnnotationValue('http://example.org/img.png')).toEqual([
      { type: 'imageUrl', content: 'http://example.org/img.png' },
    ]);
  });

  it('.PNG URL → imageUrl (case-insensitive)', () => {
    const segs = segmentAnnotationValue('http://example.org/img.PNG');
    expect(segs[0].type).toBe('imageUrl');
  });

  it('.jpg URL → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.jpg')[0].type).toBe('imageUrl');
  });

  it('.jpeg URL → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.jpeg')[0].type).toBe('imageUrl');
  });

  it('.gif URL → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.gif')[0].type).toBe('imageUrl');
  });

  it('.svg URL → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.svg')[0].type).toBe('imageUrl');
  });

  it('.webp URL → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.webp')[0].type).toBe('imageUrl');
  });

  it('.jpg with query string → imageUrl', () => {
    expect(segmentAnnotationValue('http://example.org/img.jpg?size=100')[0].type).toBe('imageUrl');
  });

  it('.html URL → url (not imageUrl)', () => {
    expect(segmentAnnotationValue('http://example.org/page.html')[0].type).toBe('url');
  });
});

describe('createAnnotationDisplayElement', () => {
  it('url segment produces <a class="annotation-link">', () => {
    const el = createAnnotationDisplayElement('http://example.org', () => {});
    const a = el.querySelector('a.annotation-link');
    expect(a).not.toBeNull();
    expect(a!.textContent).toBe('http://example.org');
  });

  it('clicking <a> calls onOpen with the URL and prevents default', () => {
    const onOpen = vi.fn();
    const el = createAnnotationDisplayElement('http://example.org', onOpen);
    const a = el.querySelector('a.annotation-link') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    expect(onOpen).toHaveBeenCalledWith('http://example.org');
    expect(event.defaultPrevented).toBe(true);
  });

  it('text segment produces a Text node (no <a>)', () => {
    const el = createAnnotationDisplayElement('plain text', () => {});
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toBe('plain text');
  });

  it('imageUrl segment produces <a> and <img class="annotation-image-preview">', () => {
    const el = createAnnotationDisplayElement('http://example.org/img.png', () => {});
    expect(el.querySelector('a.annotation-link')).not.toBeNull();
    const img = el.querySelector('img.annotation-image-preview') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('http://example.org/img.png');
  });

  it('clicking image calls onOpen', () => {
    const onOpen = vi.fn();
    const el = createAnnotationDisplayElement('http://example.org/img.png', onOpen);
    const img = el.querySelector('img.annotation-image-preview') as HTMLImageElement;
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onOpen).toHaveBeenCalledWith('http://example.org/img.png');
  });
});
