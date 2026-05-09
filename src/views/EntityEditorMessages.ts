import type { EntityType } from '../model/OntologyModel';

// ── Extension → Webview ───────────────────────────────────────────────────────

export interface LoadEntityMessage {
  type: 'loadEntity';
  entityType: EntityType;
  iri: string;
  label: string;
  labels: Record<string, string[]>;
  annotations: Record<string, string[]>;
  displayStyle: 'label' | 'shortIri' | 'fullIri';

  // Class
  superClassIris?: string[];
  superClassExpressions?: string[];
  equivalentClassIris?: string[];
  equivalentClassExpressions?: string[];
  disjointClassIris?: string[];

  // Object/Data/Annotation property
  superPropertyIris?: string[];
  domainIris?: string[];
  rangeIris?: string[];
  isTransitive?: boolean;
  isSymmetric?: boolean;
  isFunctional?: boolean;
  isInverseFunctional?: boolean;
  inverseOfIri?: string;

  // Individual
  classIris?: string[];
  objectPropertyAssertions?: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions?: { propertyIri: string; value: string; datatype?: string }[];

  /** IRI → human-readable label for all IRIs in the list fields */
  iriLabels: Record<string, string>;
}

export interface CompletionResultMessage {
  type: 'completionResult';
  requestId: number;
  items: { label: string; iri: string; entityType: string }[];
}

export interface ValidationResultMessage {
  type: 'validationResult';
  requestId: number;
  errors: { from: number; to: number; severity: 'error' | 'warning'; message: string }[];
}

// ── Webview → Extension ───────────────────────────────────────────────────────

export interface EntityEditorReadyMessage { type: 'ready' }
export interface RequestCompletionMessage { type: 'requestCompletion'; requestId: number; prefix: string }
export interface ValidateMessage { type: 'validate'; requestId: number; text: string }
export interface NavigateMessage { type: 'navigate'; iri: string }

export interface SaveEntityMessage {
  type: 'save';
  iri: string;
  entityType: EntityType;
  superClassIris?: string[];
  superClassExpressions?: string[];
  equivalentClassIris?: string[];
  equivalentClassExpressions?: string[];
  disjointClassIris?: string[];
  superPropertyIris?: string[];
  domainIris?: string[];
  rangeIris?: string[];
  isTransitive?: boolean;
  isSymmetric?: boolean;
  isFunctional?: boolean;
  isInverseFunctional?: boolean;
  inverseOfIri?: string;
  classIris?: string[];
  objectPropertyAssertions?: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions?: { propertyIri: string; value: string; datatype?: string }[];
}

export type EntityEditorExtToWebview = LoadEntityMessage | CompletionResultMessage | ValidationResultMessage;
export type EntityEditorWebviewToExt =
  | EntityEditorReadyMessage
  | RequestCompletionMessage
  | ValidateMessage
  | NavigateMessage
  | SaveEntityMessage;
