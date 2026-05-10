import * as vscode from 'vscode';
import { ClassHierarchyProvider } from './views/ClassHierarchyProvider';
import { InferredHierarchyProvider } from './views/InferredHierarchyProvider';
import { ObjectPropertyProvider } from './views/ObjectPropertyProvider';
import { DataPropertyProvider } from './views/DataPropertyProvider';
import { AnnotationPropertyProvider } from './views/AnnotationPropertyProvider';
import { IndividualBrowserProvider } from './views/IndividualBrowserProvider';
import { getLabel } from './model/OntologyModel';
import { ReasonerBridge } from './reasoner/ReasonerBridge';
import { classifyOntology } from './commands/classifyOntology';
import { checkConsistency } from './commands/checkConsistency';
import { exportOntology } from './commands/exportOntology';
import { addEntity } from './commands/addEntity';
import { openGraphView } from './commands/openVisualization';
import { showEntityInfo, refreshEntityEditorIfOpen } from './views/EntityEditorPanel';
import { openSparqlEditor } from './commands/openSparqlEditor';
import type { OntologyModel, EntityType } from './model/OntologyModel';
import { OntologyIndex } from './model/OntologyIndex';
import { ParserRegistry } from './parser/ParserRegistry';

export let outputChannel: vscode.OutputChannel;

let activeModel: OntologyModel | undefined;
let activeIndex: OntologyIndex | undefined;
let lspStarted = false;

export const parsedDocVersions = new Map<string, number>();

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

  function onEntitySelected(item: unknown): void {
    const iri = (item as { iri?: string } | undefined)?.iri;
    if (!iri || !activeModel) { return; }
    showEntityInfo(context, activeModel, iri);
  }

  const classView = vscode.window.createTreeView('ontograph.classes', { treeDataProvider: classProvider });
  const inferredView = vscode.window.createTreeView('ontograph.inferredClasses', { treeDataProvider: inferredProvider });
  const objectPropView = vscode.window.createTreeView('ontograph.objectProperties', { treeDataProvider: objectPropProvider });
  const dataPropView = vscode.window.createTreeView('ontograph.dataProperties', { treeDataProvider: dataPropProvider });
  const annotationPropView = vscode.window.createTreeView('ontograph.annotationProperties', { treeDataProvider: annotationPropProvider });
  const individualView = vscode.window.createTreeView('ontograph.individuals', { treeDataProvider: individualProvider });

  context.subscriptions.push(
    classView,
    inferredView,
    objectPropView,
    dataPropView,
    annotationPropView,
    individualView,
    classView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
    inferredView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
    objectPropView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
    dataPropView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
    annotationPropView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
    individualView.onDidChangeSelection(e => onEntitySelected(e.selection[0])),
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
    activeIndex = new OntologyIndex(model);
    classProvider.setModel(model, preferredLang);
    inferredProvider.setModel(model, preferredLang);
    objectPropProvider.setModel(model, preferredLang);
    dataPropProvider.setModel(model, preferredLang);
    annotationPropProvider.setModel(model, preferredLang);
    individualProvider.setModel(model, preferredLang);
  }

  function revealInTreeView(iri: string, entityType: EntityType): void {
    const opts = { select: true, focus: false, expand: true };
    try {
      switch (entityType) {
        case 'class': {
          const item = classProvider.makeItem(iri);
          if (item) { void classView.reveal(item, opts); }
          if (activeModel?.isClassified) {
            const inferredItem = inferredProvider.makeItem(iri);
            if (inferredItem) { void inferredView.reveal(inferredItem, opts); }
          }
          break;
        }
        case 'objectProperty': {
          const item = objectPropProvider.makeItem(iri);
          if (item) { void objectPropView.reveal(item, opts); }
          break;
        }
        case 'dataProperty': {
          const item = dataPropProvider.makeItem(iri);
          if (item) { void dataPropView.reveal(item, opts); }
          break;
        }
        case 'annotationProperty': {
          const item = annotationPropProvider.makeItem(iri);
          if (item) { void annotationPropView.reveal(item, opts); }
          break;
        }
        case 'individual': {
          const item = individualProvider.makeItem(iri);
          if (item) { void individualView.reveal(item, opts); }
          break;
        }
      }
    } catch {
      // reveal() may fail if the view is not visible; ignore silently
    }
  }

  interface SearchQuickPickItem extends vscode.QuickPickItem {
    iri: string;
    entityType: EntityType;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('ontograph.searchEntity', () => {
      if (!activeModel || !activeIndex) {
        void vscode.window.showWarningMessage('OntoGraph: No ontology loaded.');
        return;
      }
      const qp = vscode.window.createQuickPick<SearchQuickPickItem>();
      qp.placeholder = 'Search by label, prefLabel, altLabel, or short IRI…';
      qp.matchOnDescription = true;
      qp.onDidChangeValue(value => {
        if (!value.trim()) { qp.items = []; return; }
        const entities = activeIndex!.searchByLabel(value.trim(), 100);
        qp.items = entities.map(e => ({
          label: getLabel(e, preferredLang),
          description: e.type,
          iri: e.iri,
          entityType: e.type,
        }));
      });
      qp.onDidAccept(() => {
        const sel = qp.selectedItems[0];
        if (sel && activeModel) {
          showEntityInfo(context, activeModel, sel.iri);
          revealInTreeView(sel.iri, sel.entityType);
        }
        qp.hide();
        qp.dispose();
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
    }),

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

    vscode.commands.registerCommand('ontograph.entityEditor', (item?: { iri?: string }) => {
      const iri = item?.iri;
      if (!iri) { void vscode.window.showWarningMessage('OntoGraph: Right-click an entity to open the editor.'); return; }
      if (!activeModel) { void vscode.window.showWarningMessage('OntoGraph: No ontology loaded.'); return; }
      showEntityInfo(context, activeModel, iri);
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
      const msg = `[diagnose] Model loaded: ${activeModel.classes.size} classes, ${activeModel.objectProperties.size} obj props, ${activeModel.dataProperties.size} data props, ${activeModel.individuals.size} individuals — source: ${activeModel.sourceUri}`;
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

  // Track the last-parsed version of each document URI so we skip redundant parses.
  // doc.version increments on every edit; switching tabs with no edits keeps it the same.
  // Exported so programmatic edits (like annotation sync) can update this to prevent reloads.

  async function handleDocument(doc: vscode.TextDocument): Promise<void> {
    const langId = resolveLanguageId(doc);
    if (!langId) { return; }

    // Skip if the document content hasn't changed since the last parse.
    const key = doc.uri.toString();
    const version = doc.version;
    if (parsedDocVersions.get(key) === version) { return; }
    parsedDocVersions.set(key, version);

    outputChannel.appendLine(`[handleDocument] lang=${langId} uri=${doc.uri.fsPath.split(/[\\/]/).pop()} v${version}`);

    const statusMsg = vscode.window.setStatusBarMessage(`$(loading~spin) OntoGraph: parsing…`);

    try {
      const model = await ParserRegistry.parseAsync(doc.getText(), langId, key);
      activeModel = model;
      refreshAllViews(model);
      refreshEntityEditorIfOpen(model);

      const { classes, objectProperties, dataProperties, individuals } = model;
      const stats = `${classes.size} classes, ${objectProperties.size} obj props, ${individuals.size} individuals`;
      outputChannel.appendLine(`  → parsed OK: ${stats}`);
      statusMsg.dispose();
      vscode.window.setStatusBarMessage(`$(check) OntoGraph: ${stats}`, 8000);

      statsBar.text = `$(type-hierarchy) ${classes.size} cls · ${objectProperties.size} prop · ${individuals.size} ind`;
      statsBar.tooltip = `OntoGraph: ${classes.size} classes · ${objectProperties.size} object properties · ${dataProperties.size} data properties · ${individuals.size} individuals\nClick for details`;
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
    vscode.workspace.onDidOpenTextDocument(doc => { void handleDocument(doc); }),
    vscode.workspace.onDidSaveTextDocument(doc => { void handleDocument(doc); }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      // Only parse if the document has actually changed — switching focus between
      // the entity editor panel and the OWL file must not re-parse the same content.
      if (editor) { void handleDocument(editor.document); }
    }),
  );

  // Process any already-open documents
  for (const doc of vscode.workspace.textDocuments) {
    void handleDocument(doc);
  }

  outputChannel.appendLine('OntoGraph ready. Open an .ofn, .omn, or .owl file to begin.');
}

export function deactivate(): void {
  // ReasonerBridge and outputChannel disposed via context.subscriptions
}
