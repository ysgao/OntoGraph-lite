import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const CLI_PKG_DIR = path.resolve(__dirname, '../../');
const ANIMALS_OMN = path.resolve(__dirname, '../../../test-ontologies/animals.omn');

describe('standalone install (US3)', () => {
  it('dist/main.js runs parse without VS Code', () => {
    const result = execSync(
      `node ${path.join(CLI_PKG_DIR, 'dist/main.js')} parse ${ANIMALS_OMN}`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.classCount).toBeGreaterThan(0);
  });

  it('dist/main.js exits non-zero for missing file', () => {
    try {
      execSync(
        `node ${path.join(CLI_PKG_DIR, 'dist/main.js')} parse /nonexistent/file.ofn`,
        { encoding: 'utf8' }
      );
      throw new Error('Expected non-zero exit');
    } catch (err: unknown) {
      const e = err as { stdout?: string; status?: number };
      if (e.stdout) {
        const r = JSON.parse(e.stdout);
        expect(r.errorCode).toBe('FILE_NOT_FOUND');
      }
      expect(e.status).not.toBe(0);
    }
  });

  it('cli package has no vscode dependency in dist/main.js', () => {
    const dist = fs.readFileSync(path.join(CLI_PKG_DIR, 'dist/main.js'), 'utf8');
    expect(dist).not.toContain('require("vscode")');
    expect(dist).not.toContain("require('vscode')");
  });

  it('VSIX build artifacts do not include cli/', () => {
    const vscodeignore = fs.readFileSync(
      path.resolve(CLI_PKG_DIR, '../.vscodeignore'), 'utf8'
    );
    expect(vscodeignore).toContain('cli/**');
  });
});
