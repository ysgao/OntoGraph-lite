// Extension → Webview
export interface LoadClassMessage {
  type: 'loadClass';
  iri: string;
  label: string;
  superClassExpressions: string[];
  equivalentClassExpressions: string[];
  prefixes: Record<string, string>;  // prefix → expansion, from ontology metadata
  displayStyle: 'label' | 'shortIri' | 'fullIri';
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
// Webview → Extension
export interface ClassEditorReadyMessage { type: 'ready' }
export interface RequestCompletionMessage { type: 'requestCompletion'; requestId: number; prefix: string }
export interface ValidateMessage { type: 'validate'; requestId: number; text: string }
export interface SaveExpressionsMessage { type: 'save'; iri: string; superClassExpressions: string[]; equivalentClassExpressions: string[] }

export type ClassEditorExtToWebview = LoadClassMessage | CompletionResultMessage | ValidationResultMessage;
export type ClassEditorWebviewToExt = ClassEditorReadyMessage | RequestCompletionMessage | ValidateMessage | SaveExpressionsMessage;
