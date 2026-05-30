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

  /** Strip lang tag and lowercase in one pass — avoids two separate string allocations per label. */
  private static stripAndLower(value: string): string {
    const at = value.lastIndexOf('@');
    return (at > 0 ? value.slice(0, at) : value).toLowerCase();
  }

  private addToIndex(iri: string, key: string): void {
    const existing = this.labelToIris.get(key);
    if (!existing) { this.labelToIris.set(key, [iri]); return; }
    if (!existing.includes(iri)) { existing.push(iri); }
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
            const key = OntologyIndex.stripAndLower(label);
            this.addToIndex(entity.iri, key);
            allValues.push(key);
          }
        }
        for (const annotIri of [SKOS_PREF_LABEL, SKOS_ALT_LABEL]) {
          const values = entity.annotations[annotIri];
          if (values) {
            for (const val of values) {
              const key = OntologyIndex.stripAndLower(val);
              this.addToIndex(entity.iri, key);
              allValues.push(key);
            }
          }
        }
        // Single backward scan — avoids two lastIndexOf calls per entity
        const iri = entity.iri;
        let sep = -1;
        for (let j = iri.length - 1; j >= 0; j--) {
          const c = iri.charCodeAt(j);
          if (c === 35 /* # */ || c === 47 /* / */) { sep = j; break; }
        }
        const localName = sep >= 0 ? iri.slice(sep + 1) : iri;
        if (localName) {
          const localKey = localName.toLowerCase();
          this.addToIndex(entity.iri, localKey);
          allValues.push(localKey);
        }
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
