const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

export const MULTILINE_IRIS: readonly string[] = [SKOS_DEFINITION, RDFS_COMMENT];

export function createValueWidget(
  propIri: string,
  value: string,
  onChange: (v: string) => void,
): HTMLInputElement | HTMLTextAreaElement {
  if (MULTILINE_IRIS.includes(propIri)) {
    const ta = document.createElement('textarea');
    ta.className = 'annotation-value-input';
    ta.value = value;
    ta.addEventListener('input', () => onChange(ta.value));
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'annotation-value-input';
  inp.value = value;
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}
