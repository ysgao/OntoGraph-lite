import * as vscode from 'vscode';
import { ClassHierarchyProvider } from './views/ClassHierarchyProvider';
import { InferredHierarchyProvider } from './views/InferredHierarchyProvider';
import { ObjectPropertyProvider } from './views/ObjectPropertyProvider';
import { DataPropertyProvider } from './views/DataPropertyProvider';
import { AnnotationPropertyProvider } from './views/AnnotationPropertyProvider';
import { IndividualBrowserProvider } from './views/IndividualBrowserProvider';
import { ReasonerBridge } from './reasoner/ReasonerBridge';
import { classifyOntology } from './commands/classifyOntology';
import { checkConsistency } from './commands/checkConsistency';
import { exportOntology } from './commands/exportOntology';
import { addEntity } from './commands/addEntity';
import { openGraphView } from './commands/openVisualization';
import { showEntityInfo } from './views/EntityInfoPanel';
import { openClassEditor } from './commands/openClassEditor';
import { openSparqlEditor } from './commands/openSparqlEditor';
import type { OntologyModel } from './model/OntologyModel';
import { ParserRegistry } from './parser/ParserRegistry';
import { OntologyIndex } from './model/OntologyIndex';

export let outputChannel: vscode.OutputChannel;

let activeModel: OntologyModel | undefined;
let lspStarted = false;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('OntoGraph');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('OntoGraph activating…');

  // --- Tree data providers ---
  const classProvider = new ClassHierarchyProvider();
  const inferredProvider = new InferredHierarchyProvider();
  const objectPropProvider = new ObjectPropertyProvider();
  const dataPropProvider = new DataPropertyProvider();
  const annotationPropProvider = new AnnotationPropertyProvider();
  const individualProvider = new IndividualBrowserProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ontograph.classes', classProvider),
    vscode.window.registerTreeDataProvider('ontograph.inferredClasses', inferredProvider),
    vscode.window.registerTreeDataProvider('ontograph.objectProperties', objectPropProvider),
    vscode.window.registerTreeDataProvider('ontograph.dataProperties', dataPropProvider),
    vscode.window.registerTreeDataProvider('ontograph.annotationProperties', annotationPropProvider),
    vscode.window.registerTreeDataProvider('ontograph.individuals', individualProvider),
  );

  // --- Reasoner bridge ---
  const reasonerBridge = new ReasonerBridge(context.extensionPath);
  context.subscriptions.push(reasonerBridge);

  // --- Persistent stats status bar item ---
  const statsBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statsBar.command = 'ontograph.diagnose';
  statsBar.tooltip = 'OntoGraph ontology statistics — click for details';
  context.subscriptions.push(statsBar);

  // --- Commands ---
  const config = vscode.workspace.getConfiguration('ontograph');
  const preferredLang: string = config.get('display.preferredLabelLanguage') ?? 'en';

  function refreshAllViews(model: OntologyModel): void {
    classProvider.setModel(model, preferredLang);
    inferredProvider.setModel(model, preferredLang);
    objectPropProvider.setModel(model, preferredLang);
    dataPropProvider.setModel(model, preferredLang);
    annotationPropProvider.setModel(model, preferredLang);
    individualProvider.setModel(model, preferredLang);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('ontograph.refresh', () => {
      if (activeModel) { refreshAllViews(activeModel); }
    }),

    vscode.commands.registerCommand('ontograph.classifyOntology', () =>
      classifyOntology(activeModel, reasonerBridge, inferredProvider)),

    vscode.commands.registerCommand('ontograph.checkConsistency', () =>
      checkConsistency(activeModel, reasonerBridge, context)),

    vscode.commands.registerCommand('ontograph.exportOntology', () =>
      exportOntology(activeModel, reasonerBridge)),

    vscode.commands.registerCommand('ontograph.addEntity', () =>
      addEntity(activeModel)),

    vscode.commands.registerCommand('ontograph.openGraph', (item?: { iri?: string }) =>
      openGraphView(context, activeModel, item?.iri)),

    vscode.commands.registerCommand('ontograph.openSparqlEditor', () =>
      openSparqlEditor(context, activeModel)),

    vscode.commands.registerCommand('ontograph.editClassDescription', (item?: { iri?: string }) => {
      const iri = item?.iri;
      if (!iri) { void vscode.window.showWarningMessage('OntoGraph: Right-click a class to edit its description.'); return; }
      if (!activeModel) { void vscode.window.showWarningMessage('OntoGraph: No ontology loaded.'); return; }
      openClassEditor(context, activeModel, iri);
    }),

    vscode.commands.registerCommand('ontograph.copyIri', (item?: { iri?: string }) => {
      const iri = item?.iri;
      if (iri) {
        vscode.env.clipboard.writeText(iri);
        vscode.window.setStatusBarMessage(`Copied: ${iri}`, 3000);
      }
    }),

    vscode.commands.registerCommand('ontograph.showEntityInfo', (item?: { iri?: string }) => {
      const iri = item?.iri;
      if (!iri) {
        void vscode.window.showWarningMessage('OntoGraph: Right-click a class, property, or individual to view its info.');
        return;
      }
      if (!activeModel) {
        void vscode.window.showWarningMessage('OntoGraph: No ontology loaded.');
        return;
      }
      showEntityInfo(context, activeModel, iri);
    }),

    vscode.commands.registerCommand('ontograph.diagnose', () => {
      outputChannel.show(true);
      if (!activeModel) {
        outputChannel.appendLine('[diagnose] No model loaded. Open a .ofn/.omn/.owl file.');
        void vscode.window.showWarningMessage('OntoGraph: No ontology loaded yet.');
        return;
      }
      const index = new OntologyIndex(activeModel);
      const msg = `[diagnose] Model loaded: ${index.classCount} classes, ${index.objectPropertyCount} obj props, ${index.dataPropertyCount} data props, ${index.individualCount} individuals — source: ${activeModel.sourceUri}`;
      outputChannel.appendLine(msg);
      void vscode.window.showInformationMessage(msg.replace('[diagnose] ', ''));
    }),
  );

  // --- Document listener: parse on open/save ---
  const supportedLanguages = new Set(['owl-functional', 'manchester', 'owl-xml', 'turtle']);

  /** Resolve effective language ID — falls back to file extension if VS Code assigns wrong ID */
  function resolveLanguageId(doc: vscode.TextDocument): string | null {
    if (supportedLanguages.has(doc.languageId)) { return doc.languageId; }
    const fsPath = doc.uri.fsPath.toLowerCase();
    if (fsPath.endsWith('.ofn')) { return 'owl-functional'; }
    if (fsPath.endsWith('.omn')) { return 'manchester'; }
    if (fsPath.endsWith('.owl')) { return 'owl-xml'; }
    if (fsPath.endsWith('.ttl')) { return 'turtle'; }
    return null;
  }

  const parsedUris = new Set<string>();

  function handleDocument(doc: vscode.TextDocument): void {
    const isOwlExt = /\.(ofn|omn|owl|ttl)$/i.test(doc.uri.fsPath);
    if (isOwlExt || supportedLanguages.has(doc.languageId)) {
      outputChannel.appendLine(`[event] docOpened lang=${doc.languageId} file=${doc.uri.fsPath.split(/[\\/]/).pop()}`);
    }

    const langId = resolveLanguageId(doc);
    if (!langId) { return; }

    // Skip re-parsing the same URI unless it was explicitly saved
    const isRepeat = parsedUris.has(doc.uri.toString());

    outputChannel.show(true);
    outputChannel.appendLine(`[handleDocument] lang=${langId} (reported: ${doc.languageId}) repeat=${isRepeat} uri=${doc.uri.fsPath}`);
    parsedUris.add(doc.uri.toString());

    const statusMsg = vscode.window.setStatusBarMessage(`$(loading~spin) OntoGraph: parsing…`);

    try {
      const model = ParserRegistry.parse(doc.getText(), langId, doc.uri.toString());
      activeModel = model;
      const index = new OntologyIndex(model);
      refreshAllViews(model);

      const stats = `${index.classCount} classes, ${index.objectPropertyCount} obj props, ${index.individualCount} individuals`;
      outputChannel.appendLine(`  → parsed OK: ${stats}`);
      statusMsg.dispose();
      vscode.window.setStatusBarMessage(`$(check) OntoGraph: ${stats}`, 8000);
      void vscode.window.showInformationMessage(`OntoGraph loaded: ${stats}`);

      statsBar.text = `$(type-hierarchy) ${index.classCount} cls · ${index.objectPropertyCount} prop · ${index.individualCount} ind`;
      statsBar.tooltip = `OntoGraph: ${index.classCount} classes · ${index.objectPropertyCount} object properties · ${index.dataPropertyCount} data properties · ${index.individualCount} individuals\nClick for details`;
      statsBar.show();
    } catch (err) {
      statusMsg.dispose();
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`  → ERROR: ${msg}`);
      vscode.window.showErrorMessage(`OntoGraph parse error: ${msg}`);
    }

    // Start LSP client lazily (fire-and-forget, non-blocking)
    if (!lspStarted) {
      lspStarted = true;
      void import('./lsp/client').then(({ startLanguageClient }) => {
        startLanguageClient(context);
        outputChannel.appendLine('Language server started.');
      });
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(handleDocument),
    vscode.workspace.onDidSaveTextDocument(handleDocument),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { handleDocument(editor.document); }
    }),
  );

  // Process any already-open documents (including the active one)
  for (const doc of vscode.workspace.textDocuments) {
    handleDocument(doc);
  }
  if (vscode.window.activeTextEditor) {
    handleDocument(vscode.window.activeTextEditor.document);
  }

  outputChannel.appendLine('OntoGraph ready. Open an .ofn, .omn, or .owl file to begin.');
}

export function deactivate(): void {
  // ReasonerBridge and outputChannel disposed via context.subscriptions
}
