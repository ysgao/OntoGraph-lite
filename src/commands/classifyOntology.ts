import * as vscode from 'vscode';
import type { ReasonerBridge } from '../reasoner/ReasonerBridge';
import type { OntologyModel } from '../model/OntologyModel';
import type { InferredHierarchyProvider } from '../views/InferredHierarchyProvider';
import { serializeToFunctional } from '../serializer/FunctionalSerializer';

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

export async function classifyOntology(
  model: OntologyModel | undefined,
  bridge: ReasonerBridge,
  inferredProvider: InferredHierarchyProvider,
): Promise<void> {
  if (!model) {
    void vscode.window.showWarningMessage('OntoGraph: No ontology loaded. Open an .ofn, .omn, or .owl file first.');
    return;
  }

  const config = vscode.workspace.getConfiguration('ontograph');
  const threshold: number = config.get('largeOntologyThreshold') ?? 50000;
  const engineSetting: string = config.get('reasoner.engine') ?? 'auto';
  const resolvedEngine = engineSetting === 'auto'
    ? (model.classes.size > threshold ? 'elk' : 'hermit')
    : engineSetting;

  // Use the original file content so complex class expressions (restrictions,
  // equivalences) reach the reasoner intact. Fall back to functional
  // serialization only for programmatically-constructed models that have no
  // stored raw content.
  const { content, format } = model.rawContent
    ? { content: model.rawContent, format: model.sourceFormat }
    : { content: serializeToFunctional(model), format: 'functional' };

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `OntoGraph: Classifying with ${resolvedEngine.toUpperCase()}…`,
    cancellable: false,
  }, async () => {
    try {
      const result = await bridge.classify(format, content, resolvedEngine);

      // Populate inferred sub-class map on the model
      model.inferredSubClasses.clear();
      for (const [parentIri, childIri] of result.hierarchy) {
        let children = model.inferredSubClasses.get(parentIri);
        if (!children) {
          children = new Set<string>();
          model.inferredSubClasses.set(parentIri, children);
        }
        children.add(childIri);
      }

      if (!model.inferredSubClasses.has(OWL_THING)) {
        model.inferredSubClasses.set(OWL_THING, new Set());
      }

      model.isClassified = true;
      inferredProvider.setModel(model);

      const incoherent = result.incoherentClasses.length;
      if (!result.consistent) {
        void vscode.window.showErrorMessage('OntoGraph: Ontology is INCONSISTENT.');
      } else if (incoherent > 0) {
        void vscode.window.showWarningMessage(
          `OntoGraph: Consistent but ${incoherent} unsatisfiable class${incoherent > 1 ? 'es' : ''}. See Inferred Classes tree.`
        );
      } else {
        void vscode.window.showInformationMessage(
          `OntoGraph: Classification complete — consistent. ${result.hierarchy.length} inferred edges.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`OntoGraph: Classification failed — ${msg}`);
    }
  });
}
