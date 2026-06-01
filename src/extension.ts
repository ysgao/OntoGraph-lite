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
import { showEntityInfo, refreshEntityEditorIfOpen, setReasonerBridge } from './views/EntityEditorPanel';
import { openSparqlEditor } from './commands/openSparqlEditor';
import { openDLQuery } from './commands/openDLQuery';
import { updateDLQueryModel } from './views/DLQueryPanel';
import { reloadOntology } from './commands/reloadOntology';
import { loadOntologyFile } from './commands/loadOntologyFile';

import { isReloadSuppressed, isOwnRecentWrite, registerWatcherSuspendHandler } from './sync/reloadGuard';
import { computeLineDiff, canApplyIncremental } from './sync/lineDiff';
import { applyIncrementalReload } from './sync/incrementalReload';
import { buildModelSegmentIndexAsync } from './model/SegmentIndex';
import type { OntologyModel, EntityType } from './model/OntologyModel';
import { OntologyIndex } from './model/OntologyIndex';
import { ParserRegistry } from './parser/ParserRegistry';
import { buildModelSegmentIndex } from './model/SegmentIndex';

export let outputChannel: vscode.OutputChannel;

let activeModel: OntologyModel | undefined;
let activeIndex: OntologyIndex | undefined;
let activeFileWatcher: vscode.FileSystemWatcher | undefined;
let reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;

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
    if (activeModel.classes.has(iri)) {
      classProvider.setFocus(iri);
      inferredProvider.setFocus(iri);
    }
  }

  function entityTypeForIri(iri: string): EntityType | undefined {
    if (!activeModel) { return undefined; }
    if (activeModel.classes.has(iri)) { return 'class'; }
    if (activeModel.objectProperties.has(iri)) { return 'objectProperty'; }
    if (activeModel.dataProperties.has(iri)) { return 'dataProperty'; }
    if (activeModel.annotationProperties.has(iri)) { return 'annotationProperty'; }
    if (activeModel.individuals.has(iri)) { return 'individual'; }
    return undefined;
  }

  const classView = vscode.window.createTreeView('ontograph.classes', { treeDataProvider: classProvider });
  const inferredView = vscode.window.createTreeView('ontograph.inferredClasses', { treeDataProvider: inferredProvider });
  const objectPropView = vscode.window.createTreeView('ontograph.objectProperties', { treeDataProvider: objectPropProvider });
  const dataPropView = vscode.window.createTreeView('ontograph.dataProperties', { treeDataProvider: dataPropProvider });
  const annotationPropView = vscode.window.createTreeView('ontograph.annotationProperties', { treeDataProvider: annotationPropProvider });
  const individualView = vscode.window.createTreeView('ontograph.individuals', { treeDataProvider: individualProvider });

  function updateClassificationViewState(model: OntologyModel | undefined): void {
    const needsUpdate = !!model?.classificationNeedsUpdate;
    inferredView.title = 'Inferred Hierarchy';
    inferredView.description = undefined;
    inferredView.badge = undefined;
    inferredView.message = undefined;
    void vscode.commands.executeCommand('setContext', 'ontograph.classificationNeedsUpdate', needsUpdate);
  }
  updateClassificationViewState(undefined);

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
  setReasonerBridge(reasonerBridge);

  // --- Persistent stats status bar item ---
  const statsBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statsBar.command = 'ontograph.diagnose';
  statsBar.tooltip = 'OntoGraph ontology statistics — click for details';
  context.subscriptions.push(statsBar);

  // --- Commands ---
  const config = vscode.workspace.getConfiguration('ontograph');
  const preferredLang: string = config.get('display.preferredLabelLanguage') ?? 'en';

  function refreshAllViews(model: OntologyModel): void {
    const tRefresh = Date.now();
    activeIndex = new OntologyIndex(model);
    console.log(`[perf:refresh] OntologyIndex: ${Date.now() - tRefresh}ms`);
    // Large functional files have entitySegments pre-built in the parser Worker Thread.
    // Small functional files (< largeOntologyThreshold) need it built here — fast for small files.
    // Saves maintain the index incrementally (shiftSegmentsAfter), so skip on re-refresh.
    if (model.sourceFormat === 'functional' && !model.entitySegments) {
      const tSeg = Date.now();
      buildModelSegmentIndex(model);
      console.log(`[perf:refresh] buildSegmentIndex (small file): ${Date.now() - tSeg}ms`);
    }
    const tProviders = Date.now();
    classProvider.setModel(model, preferredLang);
    inferredProvider.setModel(model, preferredLang);
    objectPropProvider.setModel(model, preferredLang);
    dataPropProvider.setModel(model, preferredLang);
    annotationPropProvider.setModel(model, preferredLang);
    individualProvider.setModel(model, preferredLang);
    updateClassificationViewState(model);
    console.log(`[perf:refresh] tree providers: ${Date.now() - tProviders}ms`);
    console.log(`[perf:refresh] total: ${Date.now() - tRefresh}ms`);
  }

  async function executeReload(): Promise<void> {
    if (!activeModel) { return; }
    const uri = vscode.Uri.parse(activeModel.sourceUri);
    const filename = uri.fsPath.split(/[\\/]/).pop() ?? 'ontology';

    // Phase 1 — disk fingerprint short-circuit. If mtime + size haven't moved
    // since we last parsed, the file is byte-identical to our in-memory model
    // and a re-parse would just rebuild what we already have. Skip the whole
    // pipeline (read + decode + worker postMessage + parse + view rebuild),
    // which on a 200MB ontology is ~15s of work for zero gain.
    if (activeModel.sourceMtimeMs !== undefined && activeModel.sourceSize !== undefined) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.mtime === activeModel.sourceMtimeMs && stat.size === activeModel.sourceSize) {
          // File on disk hasn't changed. The in-memory model is authoritative,
          // but the SEGMENT INDEX might have drifted from rawContent (e.g. if
          // a past buggy save inserted duplicate axiom lines without
          // registering them in segment.lineIndices). A reload click is the
          // user's signal to refresh things, so rebuild segments from
          // rawContent — cheap (~2s) and fixes any drift without re-parsing.
          outputChannel.appendLine(`[reload] file unchanged; rebuilding segment index to clear any drift`);
          const t0 = Date.now();
          await buildModelSegmentIndexAsync(activeModel);
          outputChannel.appendLine(`[reload] segment rebuild took ${Date.now() - t0}ms`);
          refreshAllViews(activeModel);
          vscode.window.setStatusBarMessage('$(check) OntoGraph: views refreshed', 4000);
          return;
        }
      } catch { /* stat failed — fall through to defensive full reload */ }
    }

    await vscode.commands.executeCommand('setContext', 'ontograph.reloading', true);
    try {
      // Phase 2 — try incremental patch first. For typical external edits
      // (one or a few entity clusters changed in a multi-hundred-MB
      // ontology) this finishes in ~1s instead of ~15s. Falls back to a
      // full re-parse on any condition the incremental path can't handle.
      const tryIncremental = activeModel
        && activeModel.sourceFormat === 'functional'
        && activeModel.rawContent
        && activeModel.entitySegments;

      if (tryIncremental) {
        const incrementalOk = await tryIncrementalReload(uri, filename);
        if (incrementalOk) {
          vscode.window.setStatusBarMessage('$(check) Ontology reloaded (incremental)', 8000);
          return;
        }
        outputChannel.appendLine('[reload] incremental skipped — falling back to full re-parse');
      }

      // Full re-parse path. Same pipeline as loadOntologyFile.
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `OntoGraph: reloading ${filename}…`,
          cancellable: false,
        },
        async () => {
          // Drop heavy fields BEFORE reading + parsing the new copy. See
          // streamWrite.ts memory notes — old rawContent + segments alone
          // hold ~450MB on a 200MB SNOMED.
          if (activeModel) {
            activeModel.rawContent = '';
            activeModel.entitySegments = undefined;
            activeModel.gciSegments = undefined;
          }
          await reloadOntology(activeModel!, async (model) => {
            await onLoadedCallback(model);
          });
        },
      );
      vscode.window.setStatusBarMessage('$(check) Ontology reloaded from disk', 8000);
    } finally {
      await vscode.commands.executeCommand('setContext', 'ontograph.reloading', false);
    }
  }

  /**
   * Phase 2 incremental reload. Reads the file, computes a line-level diff
   * vs `activeModel.rawContent`, and patches the in-memory model in place
   * (replacing only affected entity clusters). Returns true on success;
   * false means caller should fall back to the full re-parse pipeline.
   */
  async function tryIncrementalReload(uri: vscode.Uri, filename: string): Promise<boolean> {
    if (!activeModel || !activeModel.rawContent) return false;
    let newText: string;
    let stat: vscode.FileStat;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      newText = new TextDecoder().decode(bytes);
      stat = await vscode.workspace.fs.stat(uri);
    } catch (err) {
      outputChannel.appendLine(`[reload incremental] read failed: ${String(err)}`);
      return false;
    }
    const oldText = activeModel.rawContent;
    const oldTextLength = oldText.length;
    const diff = computeLineDiff(oldText, newText);
    if (!canApplyIncremental(oldText, newText, diff)) {
      outputChannel.appendLine(`[reload incremental] diff classification rejected for ${filename}`);
      return false;
    }
    let ok: boolean;
    try {
      ok = applyIncrementalReload(activeModel, oldTextLength, newText, diff, { mtime: stat.mtime, size: stat.size });
    } catch (err) {
      // Any throw (parser error, OOM during mini-parse, etc.) is non-fatal:
      // fall back to full re-parse which drops old rawContent first.
      outputChannel.appendLine(`[reload incremental] applyIncrementalReload threw: ${String(err)}`);
      return false;
    }
    if (!ok) {
      outputChannel.appendLine(`[reload incremental] applyIncrementalReload returned false for ${filename}`);
      return false;
    }
    outputChannel.appendLine(`[reload incremental] OK — diff lines ${diff.oldStartLine}-${diff.oldEndLine} → ${diff.newStartLine}-${diff.newEndLine}`);
    // Refresh UI against the patched model (same hooks the full path uses,
    // but the model object identity is preserved so we don't need to rerun
    // setupFileWatcher — watcher is already on the right URI).
    refreshAllViews(activeModel);
    await refreshEntityEditorIfOpen(activeModel, context);
    updateDLQueryModel(activeModel, activeIndex);
    return true;
  }

  function hasInferredHierarchy(model: OntologyModel | undefined): model is OntologyModel {
    if (!model?.isClassified) { return false; }
    for (const children of model.inferredSubClasses.values()) {
      if (children.size > 0) { return true; }
    }
    return false;
  }

  function revealInTreeView(iri: string, entityType: EntityType): void {
    const opts = { select: true, focus: false, expand: false };
    try {
      switch (entityType) {
        case 'class': {
          classProvider.setFocus(iri);
          inferredProvider.setFocus(iri);
          if (hasInferredHierarchy(activeModel)) {
            const inferredItem = inferredProvider.makeItem(iri);
            if (inferredItem) {
              void vscode.commands.executeCommand('ontograph.inferredClasses.focus');
              void inferredView.reveal(inferredItem, opts);
              break;
            }
          }
          const item = classProvider.makeItem(iri);
          if (item) { void classView.reveal(item, opts); }
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
      qp.placeholder = 'Search by name or label…';
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
      if (activeModel) { void executeReload(); }
    }),

    vscode.commands.registerCommand('ontograph.focusEntity', (item?: { iri?: string }) => {
      const iri = item?.iri;
      if (!iri || !activeModel) { return; }
      const entityType = entityTypeForIri(iri);
      if (!entityType) {
        void vscode.window.showWarningMessage(`OntoGraph: Entity not found: ${iri}`);
        return;
      }
      showEntityInfo(context, activeModel, iri);
      revealInTreeView(iri, entityType);
    }),

    vscode.commands.registerCommand('ontograph.loadOntologyFile', (prefillUri?: vscode.Uri) => {
      void loadOntologyFile(onLoadedCallback, prefillUri);
    }),

    vscode.commands.registerCommand('ontograph.classifyOntology', async () => {
      await classifyOntology(activeModel, reasonerBridge, inferredProvider);
      updateClassificationViewState(activeModel);
      if (activeModel) { await refreshEntityEditorIfOpen(activeModel, context); }
    }),

    vscode.commands.registerCommand('ontograph.classifyOntologyStale', async () => {
      // No re-parse here. EntityEditorPanel's save flow mutates activeModel in
      // place and keeps model.rawContent + segments in sync with disk, so the
      // in-memory state IS the latest. `openTextDocument` also fails for
      // ontologies >50MB ("Files above 50MB cannot be synchronized with
      // extensions"), which would block classify-stale on SNOMED.
      await classifyOntology(activeModel, reasonerBridge, inferredProvider);
      updateClassificationViewState(activeModel);
      if (activeModel) { await refreshEntityEditorIfOpen(activeModel, context); }
    }),

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

    vscode.commands.registerCommand('ontograph.openDLQuery', () =>
      openDLQuery(context, reasonerBridge, activeModel, activeIndex, revealInTreeView)),

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

  function setupFileWatcher(model: OntologyModel): void {
    activeFileWatcher?.dispose();
    const watchedUri = vscode.Uri.parse(model.sourceUri);
    const filename = watchedUri.path.slice(watchedUri.path.lastIndexOf('/') + 1);
    activeFileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(watchedUri, '..'), filename),
    );
    const watchedKey = watchedUri.toString();
    activeFileWatcher.onDidChange(async () => {
      if (isReloadSuppressed(watchedKey)) { return; }
      // macOS fsevents can deliver the change from our own writeFile
      // milliseconds after the watcher is recreated. Stat the file and skip
      // reload when it matches the fingerprint recorded by writeTextStreamed.
      try {
        const stat = await vscode.workspace.fs.stat(watchedUri);
        if (isOwnRecentWrite(watchedKey, stat.mtime, stat.size)) { return; }
      } catch { /* stat failure → fall through to defensive reload */ }
      clearTimeout(reloadDebounceTimer);
      reloadDebounceTimer = setTimeout(async () => {
        if (isReloadSuppressed(watchedKey)) { return; }
        try {
          const stat = await vscode.workspace.fs.stat(watchedUri);
          if (isOwnRecentWrite(watchedKey, stat.mtime, stat.size)) { return; }
        } catch { /* */ }
        void executeReload();
      }, 500);
    });
  }

  // While a programmatic write is in progress, dispose the watcher so OS change
  // events from our own writeFile are never delivered to onDidChange. Recreate
  // it as soon as the write finishes. Bounded by the actual write window — no
  // fixed cooldown.
  registerWatcherSuspendHandler((uri, suspend) => {
    if (!activeModel || activeModel.sourceUri !== uri) { return; }
    if (suspend) {
      activeFileWatcher?.dispose();
      activeFileWatcher = undefined;
      clearTimeout(reloadDebounceTimer);
    } else {
      setupFileWatcher(activeModel);
    }
  });

  // Ontology parsing is triggered ONLY by the explicit "Load Ontology File"
  // command. Opening a `.owl`/`.ofn`/etc. file in VS Code via the file
  // explorer, double-click, or any other native document-open path no longer
  // auto-parses — that path would block the extension host on multi-hundred-MB
  // ontologies and conflicts with the 50 MB TextDocument synchronization
  // limit. Users must invoke OntoGraph's load command to bring an ontology
  // into the editor.
  const onLoadedCallback = async (model: OntologyModel): Promise<void> => {
    activeModel = model;
    refreshAllViews(model);
    await refreshEntityEditorIfOpen(model, context);
    updateDLQueryModel(model, activeIndex);
    setupFileWatcher(model);

    const { classes, objectProperties, dataProperties, individuals } = model;
    const stats = `${classes.size} classes, ${objectProperties.size} obj props, ${individuals.size} individuals`;
    outputChannel.appendLine(`[loaded] ${stats}`);
    vscode.window.setStatusBarMessage(`$(check) OntoGraph: ${stats}`, 8000);

    statsBar.text = `$(type-hierarchy) ${classes.size} cls · ${objectProperties.size} prop · ${individuals.size} ind`;
    statsBar.tooltip = `OntoGraph: ${classes.size} classes · ${objectProperties.size} object properties · ${dataProperties.size} data properties · ${individuals.size} individuals\nClick for details`;
    statsBar.show();
  };

  // Start LSP eagerly so completions/diagnostics work in any ontology file the
  // user opens via VS Code's native document path — independent of whether
  // they've invoked OntoGraph's load command.
  void import('./lsp/client').then(({ startLanguageClient }) => {
    startLanguageClient(context);
    outputChannel.appendLine('Language server started.');
  });

  context.subscriptions.push(
    { dispose: () => { activeFileWatcher?.dispose(); clearTimeout(reloadDebounceTimer); } },
  );

  outputChannel.appendLine('OntoGraph ready. Open an .ofn, .omn, or .owl file to begin.');
}

export function deactivate(): void {
  // ReasonerBridge and outputChannel disposed via context.subscriptions
}
