import * as vscode from 'vscode';
import type { OntologyModel } from '../model/OntologyModel';
import { ParserRegistry } from '../parser/ParserRegistry';

const ONTOLOGY_EXTENSIONS = ['owl', 'ofn', 'omn', 'ttl', 'owx', 'n3'];

let isLoading = false;

/**
 * Returns the loaded file's URI on success, undefined on cancel or error.
 *
 * @param onUriResolved  Optional hook called immediately after the file URI is
 *   resolved (dialog pick or prefill), before the file is read. Extension.ts
 *   uses this to set the workspace folder. If the call triggers an extension-host
 *   restart, the read/parse below is simply abandoned — the auto-reload path in
 *   activate() handles the actual load after restart.
 */
export async function loadOntologyFile(
  onLoaded: (model: OntologyModel) => void,
  prefillUri?: vscode.Uri,
  onUriResolved?: (uri: vscode.Uri) => void | Promise<void>,
): Promise<vscode.Uri | undefined> {
  if (isLoading) {
    void vscode.window.showInformationMessage('OntoGraph: a load is already in progress.');
    return undefined;
  }

  isLoading = true;
  try {
    let uri: vscode.Uri | undefined;
    const isValidOntologyUri = (u: vscode.Uri) =>
      !!u.fsPath && ONTOLOGY_EXTENSIONS.some(ext => u.fsPath.toLowerCase().endsWith('.' + ext));
    if (prefillUri && isValidOntologyUri(prefillUri)) {
      uri = prefillUri;
    } else {
      const result = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Ontology Files': ONTOLOGY_EXTENSIONS },
        title: 'Load Ontology File',
      });
      if (!result || result.length === 0) { return undefined; }
      uri = result[0];
    }

    // Await workspace setup before starting the load.
    // If this triggers a workspace restart, the code below is abandoned.
    await onUriResolved?.(uri);

    const filename = uri.fsPath.split(/[\\/]/).pop() ?? uri.fsPath;
    let loadSucceeded = false;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `OntoGraph: loading ${filename}…`,
        cancellable: false,
      },
      async () => {
        let text: string;
        let stat: vscode.FileStat;
        try {
          const [bytes, fileStat] = await Promise.all([
            vscode.workspace.fs.readFile(uri!),
            vscode.workspace.fs.stat(uri!),
          ]);
          text = new TextDecoder().decode(bytes);
          stat = fileStat;
        } catch (readErr) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          void vscode.window.showErrorMessage(`OntoGraph: failed to read '${filename}' — ${msg}.`);
          return;
        }

        const langId = 'auto';
        try {
          const model = await ParserRegistry.parseAsync(text, langId, uri!.toString());
          model.sourceMtimeMs = stat.mtime;
          model.sourceSize = stat.size;
          onLoaded(model);
          loadSucceeded = true;
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          if (msg.toLowerCase().includes('could not detect') || msg.toLowerCase().includes('no parser registered')) {
            void vscode.window.showErrorMessage(`OntoGraph: cannot detect ontology format for '${filename}'.`);
          } else {
            void vscode.window.showErrorMessage(`OntoGraph: failed to parse '${filename}' — ${msg}.`);
          }
        }
      },
    );

    return loadSucceeded ? uri : undefined;
  } finally {
    isLoading = false;
  }
}
