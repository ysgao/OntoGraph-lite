import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');

describe('cli-standalone packaging contract', () => {
  it('package.json "files" field includes dist/ (which contains runtime/ once built)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('dist/');
  });

  it('package.json declares darwin/arm64 as the only supported platform for this release', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.os).toEqual(['darwin']);
    expect(pkg.cpu).toEqual(['arm64']);
  });

  it('bin points at dist/main.js', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.bin.ontograph).toBe('dist/main.js');
  });

  it('npm run build fails loudly (non-zero exit) when the reasoner JAR is missing', () => {
    const jarPath = path.join(ROOT, '..', 'java-server', 'target', 'onto-reasoner-server.jar');
    const backupPath = `${jarPath}.build-test-backup`;
    const hadJar = fs.existsSync(jarPath);
    if (hadJar) { fs.renameSync(jarPath, backupPath); }

    try {
      expect(() => execFileSync('node', ['esbuild.mjs'], { cwd: ROOT, stdio: 'pipe' })).toThrow();
    } finally {
      if (hadJar) { fs.renameSync(backupPath, jarPath); }
    }
  });

  it('npm run build fails loudly (non-zero exit) when the bundled JRE is missing', () => {
    const jreDir = path.join(ROOT, 'dist', 'runtime', 'jre');
    const backupDir = path.join(ROOT, 'dist', 'runtime', 'jre.build-test-backup');
    const hadJre = fs.existsSync(jreDir);
    if (hadJre) { fs.renameSync(jreDir, backupDir); }

    try {
      expect(() => execFileSync('node', ['esbuild.mjs'], { cwd: ROOT, stdio: 'pipe' })).toThrow();
    } finally {
      if (hadJre) {
        fs.rmSync(jreDir, { recursive: true, force: true });
        fs.renameSync(backupDir, jreDir);
      }
    }
  });
});
