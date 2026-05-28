import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { loadOntologyFile } from './loadOntologyFile';

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB
const ONTOLOGY_EXTENSIONS = new Set(['.owl', '.ofn', '.omn', '.ttl', '.owx', '.n3']);

export function createLargeFileListener(
  onLoaded: (model: OntologyModel) => void,
): (editor: vscode.TextEditor | undefined) => void {
  const notifiedUris = new Set<string>();
  return async (editor) => {
    if (!editor) { return; }
    const { document } = editor;
    if (document.getText().length !== 0) { return; }

    const fsPath = document.uri.fsPath.toLowerCase();
    const hasOntologyExt = [...ONTOLOGY_EXTENSIONS].some(ext => fsPath.endsWith(ext));
    if (!hasOntologyExt) { return; }

    const uriKey = document.uri.toString();
    if (notifiedUris.has(uriKey)) { return; }

    let stat: { size: number };
    try {
      stat = await vscode.workspace.fs.stat(document.uri);
    } catch {
      return;
    }
    if (stat.size <= LARGE_FILE_THRESHOLD) { return; }

    notifiedUris.add(uriKey);

    const answer = await vscode.window.showInformationMessage(
      "This file is too large for VS Code's text editor. Load it in OntoGraph?",
      'Load',
    );
    if (answer === 'Load') {
      void loadOntologyFile(onLoaded, document.uri);
    }
  };
}
