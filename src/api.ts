import type { OntologyModel } from './model/OntologyModel';
import { OntologyIndex } from './model/OntologyIndex';
import { groupEquivalentClasses, type EquivalentClassEntry } from './reasoner/ReasonerBridge';

export interface ClassificationResult {
  ontologyIri: string | null;
  classCount: number;
  inferredSubclassRelations: number;
  reasoner: 'hermit' | 'elk';
  hierarchy: ClassHierarchyNode[];
  /** Classes with a reasoner-derived equivalence that isn't already asserted — a modeling error. */
  inferredEquivalentClasses: InferredEquivalentClass[];
}

export interface ClassHierarchyNode {
  iri: string;
  label: string | null;
  children: string[];
}

export interface InferredEquivalentClass {
  iri: string;
  label: string | null;
  /** Named classes the reasoner found equivalent to this class (not explicitly asserted). */
  equivalentClasses: ClassRef[];
  /** Complex class expressions (OWL Functional Syntax text) equivalent to this class. */
  equivalentExpressions: string[];
}

export interface ConsistencyResult {
  ontologyIri: string | null;
  consistent: boolean;
  reasoner: 'hermit' | 'elk';
  explanation: string | null;
}

export interface ApiDLQueryResult {
  expression: string;
  superClasses: ClassRef[];
  equivalentClasses: ClassRef[];
  subClasses: ClassRef[];
  instances: IndividualRef[];
}

export interface ClassRef {
  iri: string;
  label: string | null;
}

export interface IndividualRef {
  iri: string;
  label: string | null;
}

/** Groups raw classify equivalentClasses entries into the CLI/API-facing shape, resolving labels. */
export function buildInferredEquivalentClasses(
  entries: EquivalentClassEntry[],
  getLabel: (iri: string) => string | null,
): InferredEquivalentClass[] {
  return [...groupEquivalentClasses(entries)].map(([iri, group]) => ({
    iri,
    label: getLabel(iri),
    equivalentClasses: group.iris.map(equivIri => ({ iri: equivIri, label: getLabel(equivIri) })),
    equivalentExpressions: group.expressions,
  }));
}

export interface OntoGraphApi {
  classify(): Promise<ClassificationResult>;
  checkConsistency(): Promise<ConsistencyResult>;
  dlQuery(expression: string): Promise<ApiDLQueryResult>;
  getActiveModel(): OntologyModel | null;
  getActiveIndex(): OntologyIndex | null;
}
