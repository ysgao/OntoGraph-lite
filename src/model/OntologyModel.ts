export type EntityType = 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';

export interface OWLEntity {
  iri: string;
  type: EntityType;
  labels: Record<string, string[]>; // lang → [label, ...]
  annotations: Record<string, string[]>; // annotation property IRI → [value, ...]
}

export interface OWLClass extends OWLEntity {
  type: 'class';
  superClassIris: string[];
  equivalentClassIris: string[];
  disjointClassIris: string[];
  /** Blank-node complex expressions encoded as Manchester Syntax strings */
  superClassExpressions: string[];
  equivalentClassExpressions: string[];
}

export interface OWLProperty extends OWLEntity {
  superPropertyIris: string[];
  domainIris: string[];
  rangeIris: string[];
  isTransitive?: boolean;
  isSymmetric?: boolean;
  isFunctional?: boolean;
}

export interface OWLObjectProperty extends OWLProperty {
  type: 'objectProperty';
  isInverseFunctional?: boolean;
  inverseOfIri?: string;
}

export interface OWLDataProperty extends OWLProperty {
  type: 'dataProperty';
}

export interface OWLAnnotationProperty extends OWLProperty {
  type: 'annotationProperty';
}

export interface OWLIndividual extends OWLEntity {
  type: 'individual';
  classIris: string[]; // rdf:type assertions
  objectPropertyAssertions: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions: { propertyIri: string; value: string; datatype?: string }[];
}

export type OWLEntityUnion =
  | OWLClass
  | OWLObjectProperty
  | OWLDataProperty
  | OWLAnnotationProperty
  | OWLIndividual;

export interface OntologyMetadata {
  iri?: string;
  versionIri?: string;
  imports: string[];
  annotations: Record<string, string[]>;
}

export interface OntologyModel {
  metadata: OntologyMetadata;
  classes: Map<string, OWLClass>;
  objectProperties: Map<string, OWLObjectProperty>;
  dataProperties: Map<string, OWLDataProperty>;
  annotationProperties: Map<string, OWLAnnotationProperty>;
  individuals: Map<string, OWLIndividual>;
  /** Source file URI this model was parsed from */
  sourceUri: string;
  /** Inferred class hierarchy populated after reasoning; parent IRI → Set of child IRIs */
  inferredSubClasses: Map<string, Set<string>>;
  /** Whether the ontology has been classified by a reasoner */
  isClassified: boolean;
}

export function createEmptyModel(sourceUri: string): OntologyModel {
  return {
    metadata: { imports: [], annotations: {} },
    classes: new Map(),
    objectProperties: new Map(),
    dataProperties: new Map(),
    annotationProperties: new Map(),
    individuals: new Map(),
    sourceUri,
    inferredSubClasses: new Map(),
    isClassified: false,
  };
}

export function getLabel(entity: OWLEntity, preferredLang = 'en'): string {
  const labels = entity.labels[preferredLang]
    ?? entity.labels['en']
    ?? entity.labels['']
    ?? Object.values(entity.labels)[0];
  if (labels?.length) {
    return labels[0];
  }
  // Fall back to local name from IRI
  const hash = entity.iri.lastIndexOf('#');
  const slash = entity.iri.lastIndexOf('/');
  const pos = Math.max(hash, slash);
  return pos >= 0 ? entity.iri.slice(pos + 1) : entity.iri;
}
