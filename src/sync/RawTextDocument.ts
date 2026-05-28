import * as vscode from 'vscode';

/**
 * Minimal TextDocument-like wrapper around a raw text string.
 * Implements only the subset of vscode.TextDocument used by AnnotationSync and AxiomSync:
 * getText(), uri, lineAt(). Cast to vscode.TextDocument with `as unknown` for sync functions.
 */
export class RawTextDocument {
  private readonly _lines: string[];

  constructor(readonly uri: vscode.Uri, private readonly _text: string) {
    this._lines = _text.split('\n');
  }

  getText(): string { return this._text; }

  lineAt(line: number) {
    const text = this._lines[line] ?? '';
    const isLast = line >= this._lines.length - 1;
    return {
      text,
      range: new vscode.Range(line, 0, line, text.length),
      rangeIncludingLineBreak: isLast
        ? new vscode.Range(line, 0, line, text.length)
        : new vscode.Range(line, 0, line + 1, 0),
    };
  }
}

/**
 * Apply all TextEdits from a WorkspaceEdit to a text string without using VS Code's
 * document synchronization API. Edits are applied in reverse document order so
 * character offsets stay valid across iterations.
 */
export function applyWorkspaceEditsToText(text: string, edit: vscode.WorkspaceEdit): string {
  const allEdits = edit.entries().flatMap(([, edits]) => edits);
  if (allEdits.length === 0) { return text; }

  const lines = text.split('\n');
  const offsets: number[] = new Array(lines.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i + 1] = offsets[i] + lines[i].length + 1;
  }

  const pos = (l: number, c: number): number =>
    (offsets[l] ?? offsets[offsets.length - 1]) + c;

  const sorted = [...allEdits].sort(
    (a, b) =>
      pos(b.range.start.line, b.range.start.character) -
      pos(a.range.start.line, a.range.start.character),
  );

  let result = text;
  for (const e of sorted) {
    const start = pos(e.range.start.line, e.range.start.character);
    const end = pos(e.range.end.line, e.range.end.character);
    result = result.slice(0, start) + e.newText + result.slice(end);
  }
  return result;
}
