import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { ParserRegistry } from '../parser/ParserRegistry';

const SUPPORTED_LANGUAGE_IDS = new Set(['owl-functional', 'manchester', 'owl-xml', 'turtle']);

function resolveLanguageId(doc: vscode.TextDocument): string {
  if (SUPPORTED_LANGUAGE_IDS.has(doc.languageId)) { return doc.languageId; }
  const fsPath = doc.uri.fsPath.toLowerCase();
  if (fsPath.endsWith('.ofn')) { return 'owl-functional'; }
  if (fsPath.endsWith('.omn')) { return 'manchester'; }
  if (fsPath.endsWith('.owx')) { return 'owl-xml'; }
  if (fsPath.endsWith('.ttl') || fsPath.endsWith('.n3')) { return 'turtle'; }
  return doc.languageId;
}

export async function reloadOntology(
  activeModel: OntologyModel,
  onReloaded: (model: OntologyModel) => void,
): Promise<void> {
  try {
    const uri = vscode.Uri.parse(activeModel.sourceUri);
    const doc = await vscode.workspace.openTextDocument(uri);
    const langId = resolveLanguageId(doc);
    const model = await ParserRegistry.parseAsync(doc.getText(), langId, activeModel.sourceUri);
    onReloaded(model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`OntoGraph: failed to reload ontology — ${msg}`);
  }
}
