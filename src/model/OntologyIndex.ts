import type { OntologyModel, OWLEntityUnion } from './OntologyModel';

const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_ALT_LABEL = 'http://www.w3.org/2004/02/skos/core#altLabel';

export class OntologyIndex {
  private iriToEntity = new Map<string, OWLEntityUnion>();
  private labelToIris = new Map<string, string[]>();
  /** IRI → array of individual labels (lowercase), used for token search and scoring */
  private searchText = new Map<string, string[]>();

  constructor(private model: OntologyModel) {
    this.rebuild();
  }

  private static stripLangTag(value: string): string {
    return value.includes('@') ? value.slice(0, value.lastIndexOf('@')) : value;
  }

  private indexLabel(iri: string, rawValue: string): void {
    const clean = OntologyIndex.stripLangTag(rawValue);
    const key = clean.toLowerCase();
    const existing = this.labelToIris.get(key) ?? [];
    if (!existing.includes(iri)) { existing.push(iri); }
    this.labelToIris.set(key, existing);
  }

  rebuild(): void {
    this.iriToEntity.clear();
    this.labelToIris.clear();
    this.searchText.clear();
    for (const map of [
      this.model.classes,
      this.model.objectProperties,
      this.model.dataProperties,
      this.model.annotationProperties,
      this.model.individuals,
    ] as const) {
      for (const entity of map.values()) {
        this.iriToEntity.set(entity.iri, entity as OWLEntityUnion);

        const allValues: string[] = [];
        for (const labels of Object.values(entity.labels)) {
          for (const label of labels) {
            this.indexLabel(entity.iri, label);
            allValues.push(OntologyIndex.stripLangTag(label).toLowerCase());
          }
        }
        for (const annotIri of [SKOS_PREF_LABEL, SKOS_ALT_LABEL]) {
          const values = entity.annotations[annotIri];
          if (values) {
            for (const val of values) {
              this.indexLabel(entity.iri, val);
              allValues.push(OntologyIndex.stripLangTag(val).toLowerCase());
            }
          }
        }
        const pos = Math.max(entity.iri.lastIndexOf('#'), entity.iri.lastIndexOf('/'));
        if (pos >= 0) { allValues.push(entity.iri.slice(pos + 1).toLowerCase()); }
        this.searchText.set(entity.iri, allValues);
      }
    }
  }

  getByIri(iri: string): OWLEntityUnion | undefined {
    return this.iriToEntity.get(iri);
  }

  searchByLabel(query: string, maxResults = 50): OWLEntityUnion[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) { return []; }
    const matches: { entity: OWLEntityUnion; score: number }[] = [];
    const queryLower = query.toLowerCase().trim();
    
    for (const [iri, labels] of this.searchText) {
      let bestScore = -1;
      for (const text of labels) {
        if (tokens.every(t => text.includes(t))) {
          let score = 0;
          if (text === queryLower) {
            score = 100;
          } else if (text.startsWith(queryLower)) {
            score = 50 - text.length * 0.1;
          } else {
            score = 10 - text.length * 0.1;
          }
          if (score > bestScore) { bestScore = score; }
        }
      }
      if (bestScore > -1) {
        const entity = this.iriToEntity.get(iri);
        if (entity) { matches.push({ entity, score: bestScore }); }
      }
    }
    
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, maxResults).map(m => m.entity);
  }

  /** Return all entities whose label exactly equals the given string (case-insensitive). */
  exactMatchByLabel(label: string): OWLEntityUnion[] {
    const iris = this.labelToIris.get(label.toLowerCase()) ?? [];
    return iris.map(iri => this.iriToEntity.get(iri)).filter((e): e is OWLEntityUnion => e !== undefined);
  }

  get classCount(): number { return this.model.classes.size; }
  get objectPropertyCount(): number { return this.model.objectProperties.size; }
  get dataPropertyCount(): number { return this.model.dataProperties.size; }
  get individualCount(): number { return this.model.individuals.size; }
}
