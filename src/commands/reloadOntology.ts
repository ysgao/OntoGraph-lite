import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { ParserRegistry } from '../parser/ParserRegistry';

function resolveLanguageIdFromPath(fsPath: string): string {
  const lower = fsPath.toLowerCase();
  if (lower.endsWith('.ofn')) { return 'owl-functional'; }
  if (lower.endsWith('.omn')) { return 'manchester'; }
  if (lower.endsWith('.owx')) { return 'owl-xml'; }
  if (lower.endsWith('.ttl') || lower.endsWith('.n3')) { return 'turtle'; }
  // .owl and unknown: pass 'owl-xml' to trigger content-based autodetect in ParserRegistry
  return 'owl-xml';
}

export async function reloadOntology(
  activeModel: OntologyModel,
  onReloaded: (model: OntologyModel) => void,
): Promise<void> {
  try {
    const uri = vscode.Uri.parse(activeModel.sourceUri);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    const langId = resolveLanguageIdFromPath(uri.fsPath);
    const model = await ParserRegistry.parseAsync(text, langId, activeModel.sourceUri);
    onReloaded(model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`OntoGraph: failed to reload ontology — ${msg}`);
  }
}
