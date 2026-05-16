const RDFS_COMMENT    = 'http://www.w3.org/2000/01/rdf-schema#comment';
const SKOS            = 'http://www.w3.org/2004/02/skos/core#';

// Properties whose values are free-form prose and should allow newlines.
// Add ontology-specific IRIs (e.g. default-namespace "reference") here.
export const MULTILINE_IRIS: readonly string[] = [
  RDFS_COMMENT,
  `${SKOS}definition`,
  `${SKOS}note`,
  `${SKOS}changeNote`,
  `${SKOS}editorialNote`,
  `${SKOS}example`,
  `${SKOS}historyNote`,
  `${SKOS}scopeNote`,
];

function autoGrow(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}

export function createValueWidget(
  propIri: string,
  value: string,
  onChange: (v: string) => void,
): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.className = 'annotation-value-input';
  ta.value = value;

  if (MULTILINE_IRIS.includes(propIri)) {
    ta.addEventListener('input', () => { autoGrow(ta); onChange(ta.value); });
  } else {
    // Single-line property: block Enter and strip any newlines that arrive via paste
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); }
    });
    ta.addEventListener('input', () => {
      if (ta.value.includes('\n')) {
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.replace(/\n/g, ' ');
        ta.selectionStart = ta.selectionEnd = pos;
      }
      autoGrow(ta);
      onChange(ta.value);
    });
  }

  requestAnimationFrame(() => autoGrow(ta));
  return ta;
}
