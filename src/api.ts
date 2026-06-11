import type { OntologyModel } from './model/OntologyModel';
import { OntologyIndex } from './model/OntologyIndex';

export interface ClassificationResult {
  ontologyIri: string | null;
  classCount: number;
  inferredSubclassRelations: number;
  reasoner: 'hermit' | 'elk';
  hierarchy: ClassHierarchyNode[];
}

export interface ClassHierarchyNode {
  iri: string;
  label: string | null;
  children: string[];
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

export interface OntoGraphApi {
  classify(): Promise<ClassificationResult>;
  checkConsistency(): Promise<ConsistencyResult>;
  dlQuery(expression: string): Promise<ApiDLQueryResult>;
  getActiveModel(): OntologyModel | null;
  getActiveIndex(): OntologyIndex | null;
}
