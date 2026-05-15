export type DLQueryType =
  | 'directSuperClasses'
  | 'superClasses'
  | 'equivalentClasses'
  | 'directSubClasses'
  | 'subClasses'
  | 'instances';

export const DL_QUERY_TYPE_LABELS: Record<DLQueryType, string> = {
  directSuperClasses: 'Direct superclasses',
  superClasses:       'Superclasses',
  equivalentClasses:  'Equivalent classes',
  directSubClasses:   'Direct subclasses',
  subClasses:         'Subclasses',
  instances:          'Instances',
};

export const DEFAULT_QUERY_TYPES: DLQueryType[] = [
  'directSuperClasses',
  'directSubClasses',
  'subClasses',
];

export interface EntityRef {
  iri: string;
  label: string;
  entityType: 'class' | 'individual';
}

export interface ResultGroup {
  queryType: DLQueryType;
  label: string;
  entities: EntityRef[];
}

// Extension → Webview
export type DLQueryExtToWebview =
  | { type: 'dlQueryResult'; groups: ResultGroup[] }
  | { type: 'dlQueryError';  message: string }
  | { type: 'dlQueryLoading' }
  | { type: 'ontologyStatus'; hasOntology: boolean };

// Webview → Extension
export type DLQueryWebviewToExt =
  | { type: 'execute'; classExpression: string; queryTypes: DLQueryType[] }
  | { type: 'navigate'; iri: string; entityType: 'class' | 'individual' }
  | { type: 'ready' };
