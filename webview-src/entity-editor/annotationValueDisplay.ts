export interface AnnotationValueSegment {
  type: 'text' | 'url' | 'imageUrl';
  content: string;
}

const URL_REGEX = /https?:\/\/[^\s"<>[\]()]+/g;
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|svg|webp)(?:[?#]|$)/i;
const TRAILING_PUNCT = /[.,;:!?)]+$/;

function classifyUrl(url: string): 'url' | 'imageUrl' {
  const withoutQuery = url.split('?')[0].split('#')[0];
  return IMAGE_EXT_REGEX.test(withoutQuery) ? 'imageUrl' : 'url';
}

export function segmentAnnotationValue(value: string): AnnotationValueSegment[] {
  if (value === '') {
    return [{ type: 'text', content: '' }];
  }

  const segments: AnnotationValueSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    let url = match[0].replace(TRAILING_PUNCT, '');
    const start = match.index;
    const end = start + url.length;

    if (start > lastIndex) {
      segments.push({ type: 'text', content: value.slice(lastIndex, start) });
    }
    segments.push({ type: classifyUrl(url), content: url });
    lastIndex = end;
    regex.lastIndex = end;
  }

  if (lastIndex < value.length) {
    segments.push({ type: 'text', content: value.slice(lastIndex) });
  }

  return segments;
}

export function createAnnotationDisplayElement(
  value: string,
  onOpen: (url: string) => void,
): HTMLElement {
  const div = document.createElement('div');
  div.className = 'annotation-value-display';

  for (const seg of segmentAnnotationValue(value)) {
    if (seg.type === 'text') {
      div.appendChild(document.createTextNode(seg.content));
    } else {
      const url = seg.content;
      const a = document.createElement('a');
      a.className = 'annotation-link';
      a.href = '#';
      a.textContent = url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        onOpen(url);
      });
      div.appendChild(a);

      if (seg.type === 'imageUrl') {
        const img = document.createElement('img');
        img.className = 'annotation-image-preview';
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => { img.style.display = 'none'; });
        img.addEventListener('click', (e) => {
          e.preventDefault();
          onOpen(url);
        });
        div.appendChild(img);
      }
    }
  }

  return div;
}
