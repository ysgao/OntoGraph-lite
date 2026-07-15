import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Guards spec FR-008 ("MUST NOT require any AI/LLM call, external network service...") as a
// regression check, not just a one-time code-review observation: if a future change to the
// diagram-generation path pulls in a network/HTTP/AI-client module, this test fails the build.
const GUARDED_FILES = [
  path.join(__dirname, 'partOfGraph.ts'),
  path.join(__dirname, 'layout.ts'),
  path.join(__dirname, 'diagramModel.ts'),
  path.join(__dirname, '..', 'commands', 'generateUmlDiagram.ts'),
];

const FORBIDDEN_IMPORT_PATTERN = /from\s+['"](fetch|node-fetch|http|https|axios|@anthropic-ai\/|openai|undici)['"]/;
const FORBIDDEN_CALL_PATTERN = /\b(fetch|XMLHttpRequest)\s*\(/;

describe('UML diagram generation has no AI/LLM or network dependency (FR-008)', () => {
  it.each(GUARDED_FILES)('%s imports and calls no network/HTTP/AI-client API', (filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).not.toMatch(FORBIDDEN_IMPORT_PATTERN);
    expect(source).not.toMatch(FORBIDDEN_CALL_PATTERN);
  });

  it('every guarded file actually exists (so this test cannot silently pass on a typo'
    + ' in GUARDED_FILES)', () => {
    for (const filePath of GUARDED_FILES) {
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});
