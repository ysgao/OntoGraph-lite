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
import { collectLogicalLines } from '../utils/ManchesterFormatting';
import type { ReasonerBridge } from '../reasoner/ReasonerBridge';
import { normalizeExpression, renderExpressionWithEntityRefs, type AxiomDisplayStyle } from '../model/AxiomDisplay';
import { syncAnnotationsToDocument } from '../sync/AnnotationSync';
import { syncAxiomsToDocument } from '../sync/AxiomSync';
import { queueSyncWrite } from '../sync/reloadGuard';
import { writeTextStreamed } from '../sync/streamWrite';
import type { EntitySegment } from '../model/OntologyModel';
import {
  buildModelSegmentIndexAsync,
  applyIncrementalSegmentUpdate,
  type EditSummary,
} from '../model/SegmentIndex';
import type {
  EntityEditorExtToWebview,
  EntityEditorWebviewToExt,
  LoadEntityMessage,
  CompletionResultMessage,
  ValidationResultMessage,
  SaveDraftErrorMessage,
} from './EntityEditorMessages';

// ── Singleton panel ───────────────────────────────────────────────────────────

let reasonerBridge: ReasonerBridge | undefined;

export function setReasonerBridge(bridge: ReasonerBridge | undefined): void {
  reasonerBridge = bridge;
}

let panel: vscode.WebviewPanel | undefined;
let lastIri = '';
// Always tracks the most recent model provided by showEntityInfo or
// refreshEntityEditorIfOpen. handleMessage uses this instead of the closure-
// captured model so that save mutations always target the current activeModel,
// even after handleDocument has re-parsed and replaced the original model object.
let currentPanelModel: OntologyModel | undefined;
const refreshCallbacks: Array<() => void> = [];

// Per-entity override cache: ensures edits made through the panel are always
// displayed when navigating back, even if activeModel was re-parsed from the
// old file before the applyEdit completed (race condition).
const savedEntityState = new Map<string, {
  labels: OWLEntity['labels'];
  annotations: OWLEntity['annotations'];
}>();

interface DraftExpression {
  text: string;
  sectionKey: 'superClassExpressions' | 'equivalentClassExpressions' | 'gciExpressions';
}

// Transient draft axiom expressions that failed syntax validation at save time.
// Never written to the OWL document. Keyed by entity IRI.
// Cleared when the user chooses "Discard and proceed" before a model reload.
const draftAxioms = new Map<string, DraftExpression[]>();

// True while syncAnnotationsToDocument's applyEdit is still in flight.
// Used by refreshEntityEditorIfOpen to decide whether to trust savedEntityState.
let _annotationSyncActive = false;

// Counter: number of incremental segment updates applied since the last full
// rebuild. Every Nth save we run a full `buildModelSegmentIndexAsync` as a
// safety anchor against any drift accumulated by the incremental updater.
let _incrementalSavesSinceRebuild = 0;
const FULL_REBUILD_EVERY_N_SAVES = 10;

let _cachedIndexModel: OntologyModel | undefined;
let _cachedIndex: OntologyIndex | undefined;

// Decoration applied to lines modified by the entity editor sync.
// Display-only: does not affect file content or OWL semantics.
// Styled like VS Code's "modified" gutter indicator (left border + overview ruler).
const syncHighlightDecoration = vscode.window.createTextEditorDecorationType({
  borderStyle: 'none none none solid',
  borderWidth: '0 0 0 3px',
  borderColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
  isWholeLine: true,
});

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

export function hasDraftAxioms(): boolean { return draftAxioms.size > 0; }

function discardAllDrafts(): void { draftAxioms.clear(); }

async function promptForDraftDiscard(
  context: vscode.ExtensionContext,
  model: OntologyModel,
): Promise<'proceed' | 'cancel'> {
  const entityIris = [...draftAxioms.keys()];
  const entityLabels = entityIris.map(iri => {
    const e = findEntity(model, iri);
    return e ? getLabel(e) : iri;
  });

  const message =
    `OntoGraph: The following entities have unsaved invalid draft axioms that will be lost: ${entityLabels.join(', ')}. ` +
    'Fix them before proceeding, or discard them.';

  const choice = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    'Discard and proceed',
    ...entityLabels,
  );

  if (choice === 'Discard and proceed') {
    discardAllDrafts();
    return 'proceed';
  }

  const labelIndex = entityLabels.indexOf(choice ?? '');
  if (labelIndex !== -1 && panel) {
    showEntityInfo(context, model, entityIris[labelIndex]);
  }

  return 'cancel';
}

/**
 * Called by the extension whenever a new model is available (after re-parsing).
 * Pushes fresh entity data to the open panel so direct file edits are reflected.
 * If an applyEdit from the entity editor is still in flight, savedEntityState is
 * kept so its data wins over the potentially stale intermediate model.
 *
 * If draft invalid axioms are present and context is provided, shows a blocking
 * dialog before reloading. Returns without refreshing if the user cancels.
 */
export async function refreshEntityEditorIfOpen(
  model: OntologyModel,
  context?: vscode.ExtensionContext,
): Promise<void> {
  if (!panel || !lastIri) { return; }

  if (hasDraftAxioms() && context) {
    const decision = await promptForDraftDiscard(context, model);
    if (decision === 'cancel') { return; }
  }

  currentPanelModel = model;
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
  if (lastIri !== iri) { clearSyncHighlight(); }
  currentPanelModel = model;
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
  panel.onDidDispose(() => { panel = undefined; clearSyncHighlight(); }, null, context.subscriptions);

  panel.webview.onDidReceiveMessage(
    (msg: EntityEditorWebviewToExt) => {
      if (!panel || !currentPanelModel) { return; }
      handleMessage(msg, panel, currentPanelModel, context);
    },
    undefined,
    context.subscriptions,
  );
}

// ── Persistence helper ───────────────────────────────────────────────────────

/**
 * Run the annotation + axiom sync phases and return ONLY the final text plus
 * combined ranges and lineDelta.
 *
 * Scoping the sync calls inside a helper lets V8 release the intermediate
 * `annot.updatedText` (~200MB for SNOMED) when the helper returns — only the
 * winning `text` survives. Caller still drops `baseContent` before the write,
 * so memory peak at write time is one final-text copy + the stream's 1MB
 * chunk buffer (not three copies + a 200MB encode buffer).
 */
async function computeUpdatedText(
  uri: vscode.Uri,
  entity: OWLEntity,
  fmt: string,
  baseContent: string | undefined,
  seg: EntitySegment | undefined,
  gciSeg: EntitySegment | undefined,
  cpLine: number | undefined,
  giLine: number | undefined,
): Promise<{
  text?: string;
  ranges: vscode.Range[];
  lineDelta: number;
  /** Edit summaries from AnnotationSync (positions in baseContent frame). */
  annotEditSummaries: EditSummary[];
  /** Edit summaries from AxiomSync. Positions are in `annot?.updatedText`
   *  frame when annot ran; in baseContent frame otherwise. Callers should
   *  apply annotEditSummaries FIRST then axiomEditSummaries to keep the
   *  coordinate frame consistent. */
  axiomEditSummaries: EditSummary[];
}> {
  const ranges: vscode.Range[] = [];
  let lineDelta = 0;

  if (fmt === 'turtle') {
    const r = await syncAxiomsToDocument(
      uri, entity, fmt, baseContent,
      undefined, undefined, undefined, undefined, true,
    );
    if (!r) { return { ranges, lineDelta, annotEditSummaries: [], axiomEditSummaries: [] }; }
    ranges.push(...r.changedRanges);
    lineDelta += r.lineDelta;
    return {
      text: r.updatedText, ranges, lineDelta,
      annotEditSummaries: [],
      axiomEditSummaries: r.editSummaries,
    };
  }

  const annot = await syncAnnotationsToDocument(uri, entity, fmt, baseContent, seg, true);
  if (annot) { ranges.push(...annot.changedRanges); lineDelta += annot.lineDelta; }

  const axiom = await syncAxiomsToDocument(
    uri, entity, fmt, annot?.updatedText ?? baseContent,
    seg, gciSeg, cpLine, giLine, true,
  );
  if (axiom) { ranges.push(...axiom.changedRanges); lineDelta += axiom.lineDelta; }

  return {
    text: axiom?.updatedText ?? annot?.updatedText,
    ranges, lineDelta,
    annotEditSummaries: annot?.editSummaries ?? [],
    axiomEditSummaries: axiom?.editSummaries ?? [],
  };
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

    case 'openExternal':
      void vscode.env.openExternal(vscode.Uri.parse(msg.url));
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
      const { requestId, text } = msg;
      const vModel = currentPanelModel ?? model;
      const vIndex = getIndex(vModel);
      const errors = validateManchesterText(text, vModel, vIndex);
      const response: ValidationResultMessage = {
        type: 'validationResult',
        requestId,
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
      const classificationAffectingChange = hasClassificationAffectingChange(entity, msg);
      const index = getIndex(model);

      // Collect draft expressions that failed validation (either flagged by the
      // webview linter OR rejected by server-side parse at save time).  Server-side
      // validation is the authoritative gate; the webview hint is a belt-and-suspenders
      // fallback for the timing window before the async linter completes.
      const newDrafts: DraftExpression[] = [];
      const invalidIdx = msg.invalidExpressionIndices;

      function filterSection(
        expressions: string[] | undefined,
        sectionKey: DraftExpression['sectionKey'],
      ): string[] {
        const all = expressions ?? [];
        const webviewBad = new Set(invalidIdx?.[sectionKey] ?? []);
        return all.filter((text, i) => {
          const isInvalid = webviewBad.has(i);
          if (isInvalid) { newDrafts.push({ text, sectionKey }); }
          return !isInvalid;
        });
      }

      switch (msg.entityType) {
        case 'class': {
          const cls = entity as OWLClass;
          const validSuper = filterSection(msg.superClassExpressions, 'superClassExpressions');
          const splitSuper = splitNormalizedExpressions(validSuper.map(e => normalizeExpression(e, model, index)));
          cls.superClassIris = splitSuper.namedClassIris;
          cls.superClassExpressions = splitSuper.complexExpressions;
          const validEquiv = filterSection(msg.equivalentClassExpressions, 'equivalentClassExpressions');
          const splitEquiv = splitNormalizedExpressions(validEquiv.map(e => normalizeExpression(e, model, index)));
          cls.equivalentClassIris = splitEquiv.namedClassIris;
          cls.equivalentClassExpressions = splitEquiv.complexExpressions;
          const validGci = filterSection(msg.gciExpressions, 'gciExpressions');
          cls.gciExpressions = validGci.map(e => normalizeExpression(e, model, index));
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

      // Update draft map: store new invalid drafts, or clear if all valid.
      if (newDrafts.length > 0) {
        draftAxioms.set(msg.iri, newDrafts);
        const errMsg: SaveDraftErrorMessage = {
          type: 'saveDraftError',
          invalidExpressions: newDrafts.map((d, originalIndex) => {
            // Reconstruct the original index within the full (pre-filter) expression array.
            const allForSection = msg[d.sectionKey] ?? [];
            const idx = (allForSection as string[]).indexOf(d.text);
            return { sectionKey: d.sectionKey, index: idx === -1 ? originalIndex : idx, text: d.text };
          }),
        };
        void p.webview.postMessage(errMsg as EntityEditorExtToWebview);
      } else {
        draftAxioms.delete(msg.iri);
      }

      // Invalidate the index so label changes are reflected in autocomplete
      _cachedIndex = undefined;
      if (classificationAffectingChange && model.isClassified && hasInferredHierarchy(model)) {
        model.classificationNeedsUpdate = true;
        // Flip the `classificationNeedsUpdate` context so the toolbar button
        // switches from "Classify" to the stale variant. Cheap setContext —
        // no tree-view refresh, no model re-scan.
        void vscode.commands.executeCommand('setContext', 'ontograph.classificationNeedsUpdate', true);
      }

      // Cache the saved state so sendLoadEntity always serves correct data
      // even if activeModel is re-parsed before applyEdit completes (race condition).
      savedEntityState.set(msg.iri, { labels: entity.labels, annotations: entity.annotations });

      // Persistence pipeline:
      //   1. queueSyncWrite serializes saves per URI so concurrent saves never
      //      race on baseContent or segment positions.
      //   2. Inside the queued task: compute updatedText (skipWrite=true on both
      //      sync funcs), update model.rawContent and segment offsets
      //      synchronously, then write to disk.
      //   3. While the queue task runs, isReloadSuppressed(uri) is true so the
      //      file watcher and handleDocument both skip re-parse — protects the
      //      in-memory model regardless of how long the write takes.
      _annotationSyncActive = true;
      const uri = vscode.Uri.parse(model.sourceUri);
      const fmt = model.sourceFormat;
      void queueSyncWrite(uri.toString(), async () => {
        try {
          // baseContent is a `let` so we can release the alias before the
          // disk write — once `model.rawContent` is overwritten with the new
          // text and this local reference is cleared, the ~200MB old string
          // is unreachable and can be reclaimed during the streamed write.
          let baseContent: string | undefined = model.rawContent || undefined;

          // Segment hints: scan only the entity's cluster (O(cluster) vs O(N)).
          const seg = model.entitySegments?.get(entity.iri);
          const gciSeg = entity.type === 'class' ? model.gciSegments?.get(entity.iri) : undefined;
          const cpLine = model.closingParenLine;
          const giLine = model.gciInsertLine;

          const {
            text: updatedText,
            ranges: changedRanges,
            lineDelta,
            annotEditSummaries,
            axiomEditSummaries,
          } = await computeUpdatedText(uri, entity, fmt, baseContent, seg, gciSeg, cpLine, giLine);

          if (updatedText !== undefined) {
            // Update model state SYNCHRONOUSLY before the writeFile await.
            model.rawContent = updatedText;
            baseContent = undefined;

            // Incremental segment-index update. Apply annot summaries first
            // (positions in original baseContent frame), then axiom summaries
            // (positions in annot's post-edit frame). Each is O(N entities +
            // sum of lineIndices); typical save = ~50-200ms total vs ~2s for
            // a full rebuild.
            if (annotEditSummaries.length > 0) {
              applyIncrementalSegmentUpdate(model, entity.iri, annotEditSummaries);
            }
            if (axiomEditSummaries.length > 0) {
              applyIncrementalSegmentUpdate(model, entity.iri, axiomEditSummaries);
            }
            _incrementalSavesSinceRebuild++;

            let writeOk = false;
            try {
              await writeTextStreamed(uri, updatedText);
              writeOk = true;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`[OntoGraph save] writeFile FAILED: ${errMsg}`);
              void vscode.window.showErrorMessage(`OntoGraph: cannot write file — ${errMsg}.`);
            }

            // Refresh fingerprint only if the write succeeded — otherwise the
            // file on disk no longer matches the in-memory model and we don't
            // want reload to skip a re-parse.
            if (writeOk) {
              try {
                const stat = await vscode.workspace.fs.stat(uri);
                model.sourceMtimeMs = stat.mtime;
                model.sourceSize = stat.size;
              } catch { /* non-fatal */ }
            }

            // Periodic safety-anchor: every N incremental saves, do a full
            // segment rebuild from rawContent. Catches any drift accumulated
            // by the incremental updater (off-by-one shifts, missed edges,
            // etc). Runs AFTER writeFile + status messages so the user-visible
            // save latency is unaffected.
            if (_incrementalSavesSinceRebuild >= FULL_REBUILD_EVERY_N_SAVES) {
              _incrementalSavesSinceRebuild = 0;
              await buildModelSegmentIndexAsync(model);
            }
          }
          highlightSyncedRanges(uri, changedRanges);
        } finally {
          _annotationSyncActive = false;
          savedEntityState.delete(msg.iri);
        }
      });

      // No tree-view refresh after save. Tree providers cache hierarchy and
      // labels; rebuilding the index on every save is O(N) per provider × 6
      // providers (~2-3s on SNOMED-scale) and would freeze the UI for a
      // single-entity edit. Tree stays as a navigation cache — when the user
      // clicks an entity, sendLoadEntity reads fresh data from the runtime
      // model. Full refresh happens only on explicit reload of the ontology.
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

  const drafts = draftAxioms.get(iri);
  if (drafts && drafts.length > 0) {
    msg.draftExpressions = drafts.map(d => ({ sectionKey: d.sectionKey, text: d.text }));
  }

  void p.webview.postMessage(msg as EntityEditorExtToWebview);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SINGLE_IRI_RE = /^https?:\/\/\S+$/;

/**
 * Splits a list of normalized expressions (bare full-IRI strings or Manchester
 * keyword strings) into named-class IRIs vs complex class expressions.
 * A normalized expression is a "named class" when it is a single bare IRI
 * with no spaces (e.g. "http://example.org/Animal"). Everything else
 * (containing spaces or Manchester operators) is a complex expression.
 */
export function splitNormalizedExpressions(normalized: string[]): {
  namedClassIris: string[];
  complexExpressions: string[];
} {
  return {
    namedClassIris: normalized.filter(e => SINGLE_IRI_RE.test(e)),
    complexExpressions: normalized.filter(e => !SINGLE_IRI_RE.test(e)),
  };
}

export function renderExpressionsWithRefs(
  sectionKey: string,
  expressions: string[],
  refsBySection: NonNullable<LoadEntityMessage['expressionEntityRefs']>,
  model: OntologyModel,
  style: AxiomDisplayStyle,
  lang: string,
): string[] {
  const renderedExpressions: string[] = [];
  const perExprRefs: NonNullable<LoadEntityMessage['expressionEntityRefs']>[string] = [];

  for (const expr of expressions) {
    const rendered = renderExpressionWithEntityRefs(expr, model, style, lang, true);
    renderedExpressions.push(rendered.text);
    perExprRefs.push(rendered.refs);
  }

  refsBySection[sectionKey] = perExprRefs;
  return renderedExpressions;
}

function findEntity(model: OntologyModel, iri: string) {
  return model.classes.get(iri)
    ?? model.objectProperties.get(iri)
    ?? model.dataProperties.get(iri)
    ?? model.annotationProperties.get(iri)
    ?? model.individuals.get(iri);
}

// Track the URI whose lines are currently decorated so we can clear them on the
// next sync or when the entity editor panel is closed.
let _decoratedUri: string | undefined;

function highlightSyncedRanges(uri: vscode.Uri, ranges: vscode.Range[]): void {
  // Clear any decoration from a previous sync (possibly on a different document).
  clearSyncHighlight();

  if (ranges.length === 0) { return; }
  _decoratedUri = uri.toString();
  const editors = vscode.window.visibleTextEditors.filter(
    editor => editor.document.uri.toString() === uri.toString()
  );
  for (const editor of editors) {
    editor.setDecorations(syncHighlightDecoration, ranges);
  }
}

function clearSyncHighlight(): void {
  if (!_decoratedUri) { return; }
  const target = _decoratedUri;
  _decoratedUri = undefined;
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.toString() === target) {
      editor.setDecorations(syncHighlightDecoration, []);
    }
  }
}


function hasInferredHierarchy(model: OntologyModel): boolean {
  for (const children of model.inferredSubClasses.values()) {
    if (children.size > 0) { return true; }
  }
  return false;
}

function hasClassificationAffectingChange(
  entity: NonNullable<ReturnType<typeof findEntity>>,
  msg: Extract<EntityEditorWebviewToExt, { type: 'save' }>,
): boolean {
  const sameStringArray = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
    JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const sameChains = (a: readonly string[][] | undefined, b: readonly string[][] | undefined) =>
    JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const sameObjAssertions = (
    a: readonly { propertyIri: string; targetIri: string }[] | undefined,
    b: readonly { propertyIri: string; targetIri: string }[] | undefined,
  ) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const sameDataAssertions = (
    a: readonly { propertyIri: string; value: string; datatype?: string }[] | undefined,
    b: readonly { propertyIri: string; value: string; datatype?: string }[] | undefined,
  ) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

  switch (entity.type) {
    case 'class': {
      const cls = entity as OWLClass;
      return !sameStringArray(cls.superClassIris, msg.superClassIris)
        || !sameStringArray(cls.superClassExpressions, msg.superClassExpressions)
        || !sameStringArray(cls.equivalentClassIris, msg.equivalentClassIris)
        || !sameStringArray(cls.equivalentClassExpressions, msg.equivalentClassExpressions)
        || !sameStringArray(cls.gciExpressions, msg.gciExpressions)
        || !sameStringArray(cls.disjointClassIris, msg.disjointClassIris);
    }
    case 'objectProperty': {
      const prop = entity as OWLObjectProperty;
      return !sameStringArray(prop.superPropertyIris, msg.superPropertyIris)
        || !sameStringArray(prop.domainIris, msg.domainIris)
        || !sameStringArray(prop.rangeIris, msg.rangeIris)
        || (prop.inverseOfIri ?? undefined) !== (msg.inverseOfIri || undefined)
        || !!prop.isTransitive !== !!msg.isTransitive
        || !!prop.isSymmetric !== !!msg.isSymmetric
        || !!prop.isFunctional !== !!msg.isFunctional
        || !!prop.isInverseFunctional !== !!msg.isInverseFunctional
        || !!prop.isReflexive !== !!msg.isReflexive
        || !!prop.isIrreflexive !== !!msg.isIrreflexive
        || !!prop.isAsymmetric !== !!msg.isAsymmetric
        || !sameStringArray(prop.equivalentPropertyIris, msg.equivalentPropertyIris)
        || !sameStringArray(prop.disjointPropertyIris, msg.disjointPropertyIris)
        || !sameChains(prop.propertyChains, msg.propertyChains);
    }
    case 'dataProperty': {
      const prop = entity as OWLDataProperty;
      return !sameStringArray(prop.superPropertyIris, msg.superPropertyIris)
        || !sameStringArray(prop.domainIris, msg.domainIris)
        || !sameStringArray(prop.rangeIris, msg.rangeIris)
        || !!prop.isFunctional !== !!msg.isFunctional;
    }
    case 'annotationProperty': {
      const prop = entity as OWLAnnotationProperty;
      return !sameStringArray(prop.superPropertyIris, msg.superPropertyIris)
        || !sameStringArray(prop.domainIris, msg.domainIris)
        || !sameStringArray(prop.rangeIris, msg.rangeIris);
    }
    case 'individual': {
      const ind = entity as OWLIndividual;
      return !sameStringArray(ind.classIris, msg.classIris)
        || !sameObjAssertions(ind.objectPropertyAssertions, msg.objectPropertyAssertions)
        || !sameDataAssertions(ind.dataPropertyAssertions, msg.dataPropertyAssertions);
    }
  }
}

function localName(iri: string): string {
  const h = iri.lastIndexOf('#');
  const s = iri.lastIndexOf('/');
  const pos = Math.max(h, s);
  return pos >= 0 ? iri.slice(pos + 1) : iri;
}

type ValidationError = { from: number; to: number; severity: 'error' | 'warning'; message: string };

// Wraps bare HTTP(S) IRIs with angle brackets so the Manchester parser sees
// the <IRI> token form it expects.  Mirrors the helper in DLQueryPanel.ts.
function wrapIrisInAngleBrackets(expr: string): string {
  return expr.replace(/https?:\/\/[^\s(),{}<>]+/g, u => `<${u}>`);
}

// Normalises display-format text to a single-line <IRI>-form Manchester
// expression.  Steps:
//   1. collectLogicalLines  — join visual line-continuations ("    and …")
//   2. normalizeExpression  — resolve label tokens to bare IRIs (requires model)
//   3. wrapIrisInAngleBrackets — wrap bare IRIs in < >
// Returns the normalised lines (usually one per editor).
function toNormalisedLines(text: string, model: OntologyModel, index: OntologyIndex): string[] {
  return collectLogicalLines(text)
    .map(line => wrapIrisInAngleBrackets(normalizeExpression(line, model, index)));
}

const DANGLING_KW = new Set([
  'some', 'only', 'and', 'or', 'not', 'min', 'max', 'exactly', 'value',
]);

// Manchester logical/restriction keywords (lowercase) used in entity-ref scan.
const MANCHESTER_KW_LC = new Set([
  'some', 'only', 'value', 'min', 'max', 'exactly', 'and', 'or', 'not', 'that', 'self',
]);

// Returns true when a Manchester expression is structurally incomplete —
// ends with a keyword that requires an argument, or has unbalanced parens.
function isIncomplete(expr: string): boolean {
  const parts = expr.trimEnd().split(/\s+/);
  const last = parts[parts.length - 1]?.toLowerCase() ?? '';
  if (DANGLING_KW.has(last)) { return true; }
  let depth = 0;
  for (const c of expr) {
    if (c === '(') { depth++; }
    else if (c === ')') { depth--; if (depth < 0) { return true; } }
  }
  return depth !== 0;
}

// After toNormalisedLines, resolved entity references become <IRI> tokens.
// Any remaining bare word (not a keyword or number) or single-quoted string
// is an entity reference that could not be resolved to a model entity.
function hasUnresolvedEntityRef(normalizedLine: string): boolean {
  let i = 0;
  const n = normalizedLine.length;
  while (i < n) {
    const c = normalizedLine[i];
    if (' \t\n\r(),{}'.includes(c)) { i++; continue; }

    // Angle-bracket IRI — resolved entity reference
    if (c === '<') {
      const end = normalizedLine.indexOf('>', i + 1);
      i = end > i ? end + 1 : i + 1;
      continue;
    }

    // Single-quoted string — label that failed to resolve to any entity IRI
    if (c === "'") { return true; }

    // Double-quoted string literal — not an entity ref
    if (c === '"') {
      let j = i + 1;
      while (j < n && normalizedLine[j] !== '"') {
        if (normalizedLine[j] === '\\') { j++; }
        j++;
      }
      i = j + 1;
      continue;
    }

    // Read bare token
    const start = i;
    while (i < n && !' \t\n\r(),{}"\'<>'.includes(normalizedLine[i])) { i++; }
    const token = normalizedLine.slice(start, i);
    if (!token) { i++; continue; }

    // Pure number — shortIri display mode uses numeric SNOMED codes; skip
    if (/^\d+(\.\d+)?$/.test(token)) { continue; }

    // Manchester keyword
    if (MANCHESTER_KW_LC.has(token.toLowerCase())) { continue; }

    // Bare IRI without angle brackets (should not occur after wrapIrisInAngleBrackets)
    if (token.startsWith('http://') || token.startsWith('https://')) { continue; }

    // Anything else is an unresolved entity reference
    return true;
  }
  return false;
}

export function validateManchesterText(
  text: string,
  model?: OntologyModel,
  index?: OntologyIndex,
): { from: number; to: number; severity: 'error' | 'warning'; message: string }[] {
  const errors: { from: number; to: number; severity: 'error' | 'warning'; message: string }[] = [];

  // When model and index are available, normalise to <IRI> form so that:
  // (a) label tokens (e.g. 'Body structure') are not mistaken for dangling keywords
  // (b) unresolved entity references (unknown labels/names) can be detected
  const lines = (model && index)
    ? toNormalisedLines(text, model, index)
    : collectLogicalLines(text);

  for (const line of lines) {
    if (isIncomplete(line)) {
      errors.push({ from: 0, to: text.length, severity: 'error', message: 'Incomplete expression' });
    } else if (model && index && hasUnresolvedEntityRef(line)) {
      errors.push({ from: 0, to: text.length, severity: 'error', message: 'Unknown entity reference' });
    }
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
             img-src ${webview.cspSource} data: https:;">
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
