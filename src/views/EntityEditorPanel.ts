import * as vscode from 'vscode';
import type {
  OntologyModel,
  OWLEntity,
  OWLClass,
  OWLObjectProperty,
  OWLDataProperty,
  OWLAnnotationProperty,
  OWLIndividual,
} from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';
import { OntologyIndex } from '../model/OntologyIndex';
import { ManchesterParser } from '../parser/ManchesterParser';
import { normalizeExpression, renderExpressionWithEntityRefs, type AxiomDisplayStyle } from '../model/AxiomDisplay';
import { syncAnnotationsToDocument } from '../sync/AnnotationSync';
import { syncAxiomsToDocument } from '../sync/AxiomSync';
import type {
  EntityEditorExtToWebview,
  EntityEditorWebviewToExt,
  LoadEntityMessage,
  CompletionResultMessage,
  ValidationResultMessage,
} from './EntityEditorMessages';
import { parsedDocVersions } from '../extension';

// ── Singleton panel ───────────────────────────────────────────────────────────

let panel: vscode.WebviewPanel | undefined;
let lastIri = '';
const refreshCallbacks: Array<() => void> = [];

// Per-entity override cache: ensures edits made through the panel are always
// displayed when navigating back, even if activeModel was re-parsed from the
// old file before the applyEdit completed (race condition).
const savedEntityState = new Map<string, {
  labels: OWLEntity['labels'];
  annotations: OWLEntity['annotations'];
}>();

// True while syncAnnotationsToDocument's applyEdit is still in flight.
// Used by refreshEntityEditorIfOpen to decide whether to trust savedEntityState.
let _annotationSyncActive = false;

let _cachedIndexModel: OntologyModel | undefined;
let _cachedIndex: OntologyIndex | undefined;

function getIndex(model: OntologyModel): OntologyIndex {
  if (model !== _cachedIndexModel || !_cachedIndex) {
    _cachedIndexModel = model;
    _cachedIndex = new OntologyIndex(model);
  }
  return _cachedIndex;
}

export function registerEntityEditorRefreshCallback(cb: () => void): void {
  refreshCallbacks.push(cb);
}

function fireRefresh(): void {
  for (const cb of refreshCallbacks) { cb(); }
}

/**
 * Called by the extension whenever a new model is available (after re-parsing).
 * Pushes fresh entity data to the open panel so direct file edits are reflected.
 * If an applyEdit from the entity editor is still in flight, savedEntityState is
 * kept so its data wins over the potentially stale intermediate model.
 */
export function refreshEntityEditorIfOpen(model: OntologyModel): void {
  if (!panel || !lastIri) { return; }
  if (!_annotationSyncActive) {
    // External model refresh (e.g. user edited the file directly) — drop any
    // stale save cache so the panel shows what the file actually contains now.
    savedEntityState.delete(lastIri);
  }
  sendLoadEntity(panel, model, lastIri);
}

export function showEntityInfo(
  context: vscode.ExtensionContext,
  model: OntologyModel,
  iri: string,
): void {
  lastIri = iri;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    sendLoadEntity(panel, model, iri);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'ontograph.entityInfo',
    'Entity Editor',
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
      void vscode.commands.executeCommand('ontograph.focusEntity', { iri: msg.iri });
      break;

    case 'focusEntity':
      void vscode.commands.executeCommand('ontograph.focusEntity', { iri: msg.iri });
      break;

    case 'requestCompletion': {
      const index = getIndex(model);
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
      const index = getIndex(model);

      switch (msg.entityType) {
        case 'class': {
          const cls = entity as OWLClass;
          cls.superClassIris = msg.superClassIris ?? [];
          cls.superClassExpressions = (msg.superClassExpressions ?? []).map(e => normalizeExpression(e, model, index));
          cls.equivalentClassIris = msg.equivalentClassIris ?? [];
          cls.equivalentClassExpressions = (msg.equivalentClassExpressions ?? []).map(e => normalizeExpression(e, model, index));
          cls.gciExpressions = (msg.gciExpressions ?? []).map(e => normalizeExpression(e, model, index));
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
          prop.isReflexive = msg.isReflexive;
          prop.isIrreflexive = msg.isIrreflexive;
          prop.isAsymmetric = msg.isAsymmetric;
          prop.equivalentPropertyIris = msg.equivalentPropertyIris ?? [];
          prop.disjointPropertyIris = msg.disjointPropertyIris ?? [];
          prop.propertyChains = msg.propertyChains ?? [];
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

      if (msg.labels !== undefined)      { entity.labels = msg.labels; }
      if (msg.annotations !== undefined) { entity.annotations = msg.annotations; }

      // Invalidate the index so label changes are reflected in autocomplete
      _cachedIndex = undefined;

      // Cache the saved state so sendLoadEntity always serves correct data
      // even if activeModel is re-parsed before applyEdit completes (race condition).
      savedEntityState.set(msg.iri, { labels: entity.labels, annotations: entity.annotations });

      // Sync to the source OWL document if it's open.
      // _annotationSyncActive guards refreshEntityEditorIfOpen so it knows not to
      // clear savedEntityState during the in-flight applyEdit window.
      //
      // For Turtle: axiom sync is a single combined operation that writes both
      // structural axioms and annotations atomically, producing one version
      // increment and one parsedDocVersions update.
      //
      // For Manchester and Functional: annotation sync and axiom sync touch
      // non-overlapping regions of the document (Annotations: section vs. other
      // sections / AnnotationAssertion lines vs. other axiom lines), so two
      // sequential edits are safe. parsedDocVersions is updated once at the end.
      _annotationSyncActive = true;
      void (async () => {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === model.sourceUri);
        if (doc) {
          const fmt = model.sourceFormat;
          if (fmt === 'turtle') {
            // Single combined operation: axiom sync handles both annotations and axioms
            await syncAxiomsToDocument(doc, entity, fmt);
          } else {
            // Two-pass for non-overlapping regions: annotation first, then axioms
            await syncAnnotationsToDocument(doc, entity, fmt);
            // Re-fetch so axiom sync reads the annotation-updated content
            const updatedDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === model.sourceUri);
            if (updatedDoc) {
              await syncAxiomsToDocument(updatedDoc, entity, fmt);
            }
          }
          // Single parsedDocVersions update after all edits are applied, so the
          // final doc.version is stored and no intermediate version triggers a reload.
          const finalDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === model.sourceUri);
          if (finalDoc) {
            parsedDocVersions.set(finalDoc.uri.toString(), finalDoc.version);
          }
        }
        _annotationSyncActive = false;
        // Safe to clear now: the file buffer has updated data, so the next
        // model re-parse (triggered by onDidSaveTextDocument) will have correct data.
        savedEntityState.delete(msg.iri);
      })();

      fireRefresh();
      void vscode.commands.executeCommand('ontograph.refresh');
      // Refresh the webview from the updated model to confirm the save
      sendLoadEntity(p, model, msg.iri);
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
    if (entity.type === 'objectProperty') {
      const op = entity as OWLObjectProperty;
      if (op.inverseOfIri) allIris.add(op.inverseOfIri);
      for (const i of (op.equivalentPropertyIris ?? [])) allIris.add(i);
      for (const i of (op.disjointPropertyIris ?? [])) allIris.add(i);
      for (const chain of (op.propertyChains ?? [])) for (const i of chain) allIris.add(i);
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

  // Prefer the in-panel saved state over the (possibly stale) model data.
  // This handles the race where activeModel is re-parsed before applyEdit completes.
  const saved = savedEntityState.get(iri);
  const effectiveLabels = saved?.labels ?? entity.labels;
  const effectiveAnnotations = saved?.annotations ?? entity.annotations;

  const msg: LoadEntityMessage = {
    type: 'loadEntity',
    entityType: entity.type,
    iri: entity.iri,
    label: getLabel({ ...entity, labels: effectiveLabels }, lang),
    labels: effectiveLabels,
    annotations: effectiveAnnotations,
    displayStyle: style,
    iriLabels,
    expressionEntityRefs: {},
  };

  if (entity.type === 'class') {
    const cls = entity as OWLClass;
    msg.superClassIris = cls.superClassIris;
    msg.superClassExpressions = renderExpressionsWithRefs(
      'superClassExpressions',
      cls.superClassExpressions ?? [],
      msg.expressionEntityRefs!,
      model,
      style,
      lang,
    );
    msg.equivalentClassIris = cls.equivalentClassIris;
    msg.equivalentClassExpressions = renderExpressionsWithRefs(
      'equivalentClassExpressions',
      cls.equivalentClassExpressions ?? [],
      msg.expressionEntityRefs!,
      model,
      style,
      lang,
    );
    msg.gciExpressions = renderExpressionsWithRefs(
      'gciExpressions',
      cls.gciExpressions ?? [],
      msg.expressionEntityRefs!,
      model,
      style,
      lang,
    );
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
    msg.isReflexive = prop.isReflexive;
    msg.isIrreflexive = prop.isIrreflexive;
    msg.isAsymmetric = prop.isAsymmetric;
    msg.inverseOfIri = prop.inverseOfIri;
    msg.equivalentPropertyIris = prop.equivalentPropertyIris ?? [];
    msg.disjointPropertyIris = prop.disjointPropertyIris ?? [];
    msg.propertyChains = prop.propertyChains ?? [];
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

function renderExpressionsWithRefs(
  sectionKey: string,
  expressions: string[],
  refsBySection: NonNullable<LoadEntityMessage['expressionEntityRefs']>,
  model: OntologyModel,
  style: AxiomDisplayStyle,
  lang: string,
): string[] {
  const renderedExpressions: string[] = [];
  const refs: NonNullable<LoadEntityMessage['expressionEntityRefs']>[string] = [];
  let offset = 0;

  for (const expr of expressions) {
    const rendered = renderExpressionWithEntityRefs(expr, model, style, lang, true);
    renderedExpressions.push(rendered.text);
    for (const ref of rendered.refs) {
      refs.push({ ...ref, from: ref.from + offset, to: ref.to + offset });
    }
    offset += rendered.text.length + 1;
  }

  refsBySection[sectionKey] = refs;
  return renderedExpressions;
}

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
