import * as vscode from 'vscode';
import type {
  OntologyModel,
  OWLClass,
  OWLObjectProperty,
  OWLDataProperty,
  OWLAnnotationProperty,
  OWLIndividual,
} from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';
import { OntologyIndex } from '../model/OntologyIndex';
import { ManchesterParser } from '../parser/ManchesterParser';
import { renderExpression, normalizeExpression, type AxiomDisplayStyle } from '../model/AxiomDisplay';
import type {
  EntityEditorExtToWebview,
  EntityEditorWebviewToExt,
  LoadEntityMessage,
  CompletionResultMessage,
  ValidationResultMessage,
} from './EntityEditorMessages';

// ── Singleton panel ───────────────────────────────────────────────────────────

let panel: vscode.WebviewPanel | undefined;
let lastIri = '';
const refreshCallbacks: Array<() => void> = [];

export function registerEntityEditorRefreshCallback(cb: () => void): void {
  refreshCallbacks.push(cb);
}

function fireRefresh(): void {
  for (const cb of refreshCallbacks) { cb(); }
}

export function showEntityInfo(
  context: vscode.ExtensionContext,
  model: OntologyModel,
  iri: string,
): void {
  lastIri = iri;

  const entity = findEntity(model, iri);
  const label = entity ? getLabel(entity) : iri;

  if (panel) {
    panel.title = `ℹ ${label}`;
    panel.reveal(vscode.ViewColumn.Beside);
    sendLoadEntity(panel, model, iri);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'ontograph.entityInfo',
    `ℹ ${label}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  );

  panel.webview.html = buildHtml(panel.webview, context.extensionUri);
  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);

  panel.webview.onDidReceiveMessage(
    (msg: EntityEditorWebviewToExt) => {
      if (!panel) { return; }
      handleMessage(msg, panel, model, context);
    },
    undefined,
    context.subscriptions,
  );
}

// ── Message handler ───────────────────────────────────────────────────────────

function handleMessage(
  msg: EntityEditorWebviewToExt,
  p: vscode.WebviewPanel,
  model: OntologyModel,
  context: vscode.ExtensionContext,
): void {
  switch (msg.type) {
    case 'ready':
      sendLoadEntity(p, model, lastIri);
      break;

    case 'navigate':
      showEntityInfo(context, model, msg.iri);
      break;

    case 'requestCompletion': {
      const index = new OntologyIndex(model);
      const entities = index.searchByLabel(msg.prefix, 50);
      const response: CompletionResultMessage = {
        type: 'completionResult',
        requestId: msg.requestId,
        items: entities.map(e => ({ label: getLabel(e), iri: e.iri, entityType: e.type })),
      };
      void p.webview.postMessage(response as EntityEditorExtToWebview);
      break;
    }

    case 'validate': {
      const errors = validateManchesterText(msg.text);
      const response: ValidationResultMessage = {
        type: 'validationResult',
        requestId: msg.requestId,
        errors,
      };
      void p.webview.postMessage(response as EntityEditorExtToWebview);
      break;
    }

    case 'save': {
      const entity = findEntity(model, msg.iri);
      if (!entity) {
        void vscode.window.showWarningMessage(`OntoGraph: Entity not found: ${msg.iri}`);
        return;
      }
      const index = new OntologyIndex(model);

      switch (msg.entityType) {
        case 'class': {
          const cls = entity as OWLClass;
          cls.superClassIris = msg.superClassIris ?? [];
          cls.superClassExpressions = (msg.superClassExpressions ?? []).map(e => normalizeExpression(e, model, index));
          cls.equivalentClassIris = msg.equivalentClassIris ?? [];
          cls.equivalentClassExpressions = (msg.equivalentClassExpressions ?? []).map(e => normalizeExpression(e, model, index));
          cls.disjointClassIris = msg.disjointClassIris ?? [];
          break;
        }
        case 'objectProperty': {
          const prop = entity as OWLObjectProperty;
          prop.superPropertyIris = msg.superPropertyIris ?? [];
          prop.domainIris = msg.domainIris ?? [];
          prop.rangeIris = msg.rangeIris ?? [];
          prop.inverseOfIri = msg.inverseOfIri || undefined;
          prop.isTransitive = msg.isTransitive;
          prop.isSymmetric = msg.isSymmetric;
          prop.isFunctional = msg.isFunctional;
          prop.isInverseFunctional = msg.isInverseFunctional;
          break;
        }
        case 'dataProperty': {
          const prop = entity as OWLDataProperty;
          prop.superPropertyIris = msg.superPropertyIris ?? [];
          prop.domainIris = msg.domainIris ?? [];
          prop.rangeIris = msg.rangeIris ?? [];
          prop.isFunctional = msg.isFunctional;
          break;
        }
        case 'annotationProperty': {
          const prop = entity as OWLAnnotationProperty;
          prop.superPropertyIris = msg.superPropertyIris ?? [];
          prop.domainIris = msg.domainIris ?? [];
          prop.rangeIris = msg.rangeIris ?? [];
          break;
        }
        case 'individual': {
          const ind = entity as OWLIndividual;
          ind.classIris = msg.classIris ?? [];
          ind.objectPropertyAssertions = msg.objectPropertyAssertions ?? [];
          ind.dataPropertyAssertions = msg.dataPropertyAssertions ?? [];
          break;
        }
      }

      fireRefresh();
      vscode.window.setStatusBarMessage(`$(check) OntoGraph: Saved ${getLabel(entity)}`, 4000);
      break;
    }
  }
}

// ── Load entity message builder ───────────────────────────────────────────────

function sendLoadEntity(p: vscode.WebviewPanel, model: OntologyModel, iri: string): void {
  const entity = findEntity(model, iri);
  if (!entity) { return; }

  const cfg = vscode.workspace.getConfiguration('ontograph');
  const lang = cfg.get<string>('display.preferredLabelLanguage') ?? 'en';
  const style = (cfg.get<string>('display.axiomEntityStyle') ?? 'label') as AxiomDisplayStyle;

  // Collect all IRIs that need display labels
  const allIris = new Set<string>();

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    for (const i of [...cls.superClassIris, ...cls.equivalentClassIris, ...cls.disjointClassIris]) {
      allIris.add(i);
    }
  } else if (
    entity.type === 'objectProperty' ||
    entity.type === 'dataProperty' ||
    entity.type === 'annotationProperty'
  ) {
    const prop = entity as OWLObjectProperty;
    for (const i of [...(prop.superPropertyIris ?? []), ...(prop.domainIris ?? []), ...(prop.rangeIris ?? [])]) {
      allIris.add(i);
    }
    if (entity.type === 'objectProperty' && (entity as OWLObjectProperty).inverseOfIri) {
      allIris.add((entity as OWLObjectProperty).inverseOfIri!);
    }
  } else if (entity.type === 'individual') {
    const ind = entity as OWLIndividual;
    for (const i of ind.classIris) { allIris.add(i); }
    for (const a of ind.objectPropertyAssertions) {
      allIris.add(a.propertyIri);
      allIris.add(a.targetIri);
    }
    for (const a of ind.dataPropertyAssertions) { allIris.add(a.propertyIri); }
  }

  const iriLabels: Record<string, string> = {};
  for (const i of allIris) {
    const e = findEntity(model, i);
    iriLabels[i] = e ? getLabel(e, lang) : localName(i);
  }

  const msg: LoadEntityMessage = {
    type: 'loadEntity',
    entityType: entity.type,
    iri: entity.iri,
    label: getLabel(entity, lang),
    labels: entity.labels,
    annotations: entity.annotations,
    displayStyle: style,
    iriLabels,
  };

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    msg.superClassIris = cls.superClassIris;
    msg.superClassExpressions = (cls.superClassExpressions ?? []).map(e => renderExpression(e, model, style, lang, true));
    msg.equivalentClassIris = cls.equivalentClassIris;
    msg.equivalentClassExpressions = (cls.equivalentClassExpressions ?? []).map(e => renderExpression(e, model, style, lang, true));
    msg.disjointClassIris = cls.disjointClassIris;
  } else if (entity.type === 'objectProperty') {
    const prop = entity as OWLObjectProperty;
    msg.superPropertyIris = prop.superPropertyIris;
    msg.domainIris = prop.domainIris;
    msg.rangeIris = prop.rangeIris;
    msg.isTransitive = prop.isTransitive;
    msg.isSymmetric = prop.isSymmetric;
    msg.isFunctional = prop.isFunctional;
    msg.isInverseFunctional = prop.isInverseFunctional;
    msg.inverseOfIri = prop.inverseOfIri;
  } else if (entity.type === 'dataProperty') {
    const prop = entity as OWLDataProperty;
    msg.superPropertyIris = prop.superPropertyIris;
    msg.domainIris = prop.domainIris;
    msg.rangeIris = prop.rangeIris;
    msg.isFunctional = prop.isFunctional;
  } else if (entity.type === 'annotationProperty') {
    const prop = entity as OWLAnnotationProperty;
    msg.superPropertyIris = prop.superPropertyIris;
    msg.domainIris = prop.domainIris;
    msg.rangeIris = prop.rangeIris;
  } else if (entity.type === 'individual') {
    const ind = entity as OWLIndividual;
    msg.classIris = ind.classIris;
    msg.objectPropertyAssertions = ind.objectPropertyAssertions;
    msg.dataPropertyAssertions = ind.dataPropertyAssertions;
  }

  void p.webview.postMessage(msg as EntityEditorExtToWebview);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findEntity(model: OntologyModel, iri: string) {
  return model.classes.get(iri)
    ?? model.objectProperties.get(iri)
    ?? model.dataProperties.get(iri)
    ?? model.annotationProperties.get(iri)
    ?? model.individuals.get(iri);
}

function localName(iri: string): string {
  const h = iri.lastIndexOf('#');
  const s = iri.lastIndexOf('/');
  const pos = Math.max(h, s);
  return pos >= 0 ? iri.slice(pos + 1) : iri;
}

function validateManchesterText(
  text: string,
): { from: number; to: number; severity: 'error' | 'warning'; message: string }[] {
  const errors: { from: number; to: number; severity: 'error' | 'warning'; message: string }[] = [];
  const lines = text.split('\n');
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const lineLen = line.length + 1;

    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      const wrappedDoc = `Prefix: : <http://example.org/>\nClass: :_TmpClass\n  SubClassOf: ${trimmed}\n`;
      try {
        new ManchesterParser(wrappedDoc, '').parse();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ from: offset, to: offset + line.length, severity: 'error', message });
      }
    }
    offset += lineLen;
  }

  return errors;
}

// ── HTML wrapper ──────────────────────────────────────────────────────────────

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'entity-editor-webview.js'),
  );
  const nonce = getNonce();

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OntoGraph: Entity Info</title>
  <style>
    html, body { height: 100%; margin: 0; overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
  </style>
</head>
<body>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
