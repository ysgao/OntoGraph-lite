import type { OntologyModel, OWLEntityUnion } from './OntologyModel';

export class OntologyIndex {
  private iriToEntity = new Map<string, OWLEntityUnion>();
  private labelToIris = new Map<string, string[]>();

  constructor(private model: OntologyModel) {
    this.rebuild();
  }

  rebuild(): void {
    this.iriToEntity.clear();
    this.labelToIris.clear();
    for (const map of [
      this.model.classes,
      this.model.objectProperties,
      this.model.dataProperties,
      this.model.annotationProperties,
      this.model.individuals,
    ] as const) {
      for (const entity of map.values()) {
        this.iriToEntity.set(entity.iri, entity as OWLEntityUnion);
        for (const labels of Object.values(entity.labels)) {
          for (const label of labels) {
            const key = label.toLowerCase();
            const existing = this.labelToIris.get(key) ?? [];
            existing.push(entity.iri);
            this.labelToIris.set(key, existing);
          }
        }
      }
    }
  }

  getByIri(iri: string): OWLEntityUnion | undefined {
    return this.iriToEntity.get(iri);
  }

  searchByLabel(prefix: string, maxResults = 50): OWLEntityUnion[] {
    const lower = prefix.toLowerCase();
    const results: OWLEntityUnion[] = [];
    for (const [label, iris] of this.labelToIris) {
      if (label.startsWith(lower)) {
        for (const iri of iris) {
          const entity = this.iriToEntity.get(iri);
          if (entity) {
            results.push(entity);
          }
          if (results.length >= maxResults) {
            return results;
          }
        }
      }
    }
    return results;
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
