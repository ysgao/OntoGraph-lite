import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SHARED_COMMAND_NAMES = ['parse', 'search', 'validate', 'convert', 'stats', 'entity-info'];

describe('cli-standalone main.ts does not re-implement shared commands (spec FR-012/US4)', () => {
  it('calls registerCoreCommands() and contains no literal registration of any shared command name', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');

    expect(source).toMatch(/registerCoreCommands\s*\(\s*program\s*\)/);

    for (const name of SHARED_COMMAND_NAMES) {
      // A literal `.command('parse ...')`-style registration would match this pattern; the only
      // place these names may legitimately appear is inside a string like 'parse <file>' passed
      // to `.command(...)` — which registerCoreCommands.ts owns, not main.ts.
      const literalRegistration = new RegExp(`\\.command\\(\\s*['"\`]${name}\\b`);
      expect(source, `main.ts must not literally register "${name}" — it should only come from registerCoreCommands()`).not.toMatch(literalRegistration);
    }
  });
});
