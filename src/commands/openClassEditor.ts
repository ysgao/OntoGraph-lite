import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { getLabel } from '../model/OntologyModel';
import { OntologyIndex } from '../model/OntologyIndex';
import { ManchesterParser } from '../parser/ManchesterParser';
import { renderExpression, normalizeExpression, type AxiomDisplayStyle } from '../model/AxiomDisplay';
import type {
  ClassEditorExtToWebview,
  ClassEditorWebviewToExt,
  LoadClassMessage,
  CompletionResultMessage,
  ValidationResultMessage,
} from '../views/ClassEditorMessages';

// Singleton panel
let panel: vscode.WebviewPanel | undefined;

// Refresh callbacks
const refreshCallbacks: Array<() => void> = [];

export function registerClassEditorRefreshCallback(cb: () => void): void {
  refreshCallbacks.push(cb);
}

function fireRefresh(): void {
  for (const cb of refreshCallbacks) { cb(); }
}

export function openClassEditor(
  context: vscode.ExtensionContext,
  model: OntologyModel,
  iri: string,
): void {
  const cls = model.classes.get(iri);
  if (!cls) {
    void vscode.window.showWarningMessage(`OntoGraph: Class not found: ${iri}`);
    return;
  }

  const label = getLabel(cls);

  if (panel) {
    panel.title = `Edit: ${label}`;
    panel.reveal(vscode.ViewColumn.Beside);
    sendLoadClass(panel, model, iri);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'ontograph.classEditor',
    `Edit: ${label}`,
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
    (msg: ClassEditorWebviewToExt) => {
      if (!panel) { return; }
      handleMessage(msg, panel, model, iri, context);
    },
    undefined,
    context.subscriptions,
  );
}

function handleMessage(
  msg: ClassEditorWebviewToExt,
  p: vscode.WebviewPanel,
  model: OntologyModel,
  currentIri: string,
  _context: vscode.ExtensionContext,
): void {
  switch (msg.type) {
    case 'ready': {
      sendLoadClass(p, model, currentIri);
      break;
    }

    case 'requestCompletion': {
      const index = new OntologyIndex(model);
      const entities = index.searchByLabel(msg.prefix, 50);
      const items = entities.map(e => ({
        label: getLabel(e),
        iri: e.iri,
        entityType: e.type,
      }));
      const response: CompletionResultMessage = {
        type: 'completionResult',
        requestId: msg.requestId,
        items,
      };
      void p.webview.postMessage(response as ClassEditorExtToWebview);
      break;
    }

    case 'validate': {
      const errors = validateManchesterText(msg.text);
      const response: ValidationResultMessage = {
        type: 'validationResult',
        requestId: msg.requestId,
        errors,
      };
      void p.webview.postMessage(response as ClassEditorExtToWebview);
      break;
    }

    case 'save': {
      const cls = model.classes.get(msg.iri);
      if (!cls) {
        void vscode.window.showWarningMessage(`OntoGraph: Class not found for save: ${msg.iri}`);
        return;
      }
      const index = new OntologyIndex(model);
      cls.superClassExpressions = msg.superClassExpressions.map(
        e => normalizeExpression(e, model, index),
      );
      cls.equivalentClassExpressions = msg.equivalentClassExpressions.map(
        e => normalizeExpression(e, model, index),
      );
      fireRefresh();
      vscode.window.setStatusBarMessage(`$(check) OntoGraph: Saved class expressions for ${getLabel(cls)}`, 4000);
      break;
    }

    default:
      break;
  }
}

function sendLoadClass(p: vscode.WebviewPanel, model: OntologyModel, iri: string): void {
  const cls = model.classes.get(iri);
  if (!cls) { return; }

  const cfg = vscode.workspace.getConfiguration('ontograph');
  const lang = cfg.get<string>('display.preferredLabelLanguage') ?? 'en';
  const style = (cfg.get<string>('display.axiomEntityStyle') ?? 'label') as AxiomDisplayStyle;

  const msg: LoadClassMessage = {
    type: 'loadClass',
    iri,
    label: getLabel(cls),
    superClassExpressions: (cls.superClassExpressions ?? []).map(
      e => renderExpression(e, model, style, lang, true),
    ),
    equivalentClassExpressions: (cls.equivalentClassExpressions ?? []).map(
      e => renderExpression(e, model, style, lang, true),
    ),
    prefixes: {},
    displayStyle: style,
  };
  void p.webview.postMessage(msg as ClassEditorExtToWebview);
}

function validateManchesterText(
  text: string,
): { from: number; to: number; severity: 'error' | 'warning'; message: string }[] {
  const errors: { from: number; to: number; severity: 'error' | 'warning'; message: string }[] = [];
  const lines = text.split('\n');
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const lineLen = line.length + 1; // +1 for newline

    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      // Wrap in a minimal Manchester document for parsing
      const wrappedDoc = `Prefix: : <http://example.org/>\nClass: :_TmpClass\n  SubClassOf: ${trimmed}\n`;
      try {
        new ManchesterParser(wrappedDoc, '').parse();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({
          from: offset,
          to: offset + line.length,
          severity: 'error',
          message,
        });
      }
    }

    offset += lineLen;
  }

  return errors;
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'class-editor-webview.js'),
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
  <title>OntoGraph: Edit Class</title>
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
