import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard (T021/FR-009): the Inferred Equivalent Class section's data must
 * never be picked up by getCurrentState()'s save/dirty-check payload — it is derived
 * reasoning output, not an axiom the user authors. getCurrentState() builds its class
 * payload as an explicit object literal (not a wholesale editorMap iteration), so this
 * is verified by asserting the literal never references the inferred-equivalent keys.
 *
 * A static source check (rather than executing EntityEditorApp.ts, which calls
 * acquireVsCodeApi() at module scope) keeps this guard independent of the webview
 * runtime environment.
 */
describe('EntityEditorApp getCurrentState — inferred equivalent class exclusion', () => {
  const source = readFileSync(join(__dirname, 'EntityEditorApp.ts'), 'utf8');

  function extractFunctionBody(fnName: string): string {
    const marker = `function ${fnName}(`;
    const start = source.indexOf(marker);
    if (start === -1) { throw new Error(`function ${fnName} not found in EntityEditorApp.ts`); }
    let depth = 0;
    let i = source.indexOf('{', start);
    const bodyStart = i;
    for (; i < source.length; i++) {
      if (source[i] === '{') { depth++; }
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { break; }
      }
    }
    return source.slice(bodyStart, i + 1);
  }

  it('never references inferredEquivalentClassIris/Expressions inside getCurrentState', () => {
    const body = extractFunctionBody('getCurrentState');
    expect(body).not.toContain('inferredEquivalentClassIris');
    expect(body).not.toContain('inferredEquivalentClassExpressions');
  });

  it('LoadEntityMessage still declares the read-only fields (sanity check the guard is meaningful)', () => {
    expect(source).toContain('inferredEquivalentClassIris?: string[]');
    expect(source).toContain('inferredEquivalentClassExpressions?: string[]');
  });
});
