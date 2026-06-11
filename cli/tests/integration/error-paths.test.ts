import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const MAIN = path.resolve(__dirname, '../../dist/main.js');

function runRaw(args: string): { stdout: string; status: number | null } {
  const r = spawnSync('node', [MAIN, ...args.split(' ')], { encoding: 'utf8' });
  return { stdout: r.stdout, status: r.status };
}

describe('error paths', () => {
  it('FILE_NOT_FOUND: parse non-existent file', () => {
    const r = runRaw('parse /nonexistent/file.ofn');
    expect(r.status).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.success).toBe(false);
    expect(j.errorCode).toBe('FILE_NOT_FOUND');
  });

  it('UNSUPPORTED_FORMAT: convert to unknown format', () => {
    const animals = path.resolve(__dirname, '../../../test-ontologies/animals.omn');
    const r = runRaw(`convert ${animals} --to jsonld`);
    expect(r.status).not.toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.success).toBe(false);
    expect(j.errorCode).toBe('UNSUPPORTED_FORMAT');
  });

  it('BRIDGE_UNAVAILABLE: classify with no extension running (clean lock)', () => {
    const lockPath = path.join(os.homedir(), '.ontograph-lite', 'bridge.json');
    const backup = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : null;
    try {
      if (fs.existsSync(lockPath)) { fs.unlinkSync(lockPath); }
      const r = runRaw('classify');
      expect(r.status).toBe(10);
      const j = JSON.parse(r.stdout);
      expect(j.success).toBe(false);
      expect(j.errorCode).toBe('BRIDGE_UNAVAILABLE');
    } finally {
      if (backup) { fs.writeFileSync(lockPath, backup, 'utf8'); }
    }
  });

  it('all stdout is valid JSON for all error cases', () => {
    const r = runRaw('parse /nonexistent/file.ofn');
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });
});
