import esbuild from 'esbuild';
import path from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const JAR_SRC = path.join(REPO_ROOT, 'java-server', 'target', 'onto-reasoner-server.jar');
const JAR_DEST_DIR = path.join(__dirname, 'dist', 'runtime');
const JAR_DEST = path.join(JAR_DEST_DIR, 'onto-reasoner-server.jar');
const JRE_MARKER = path.join(__dirname, 'dist', 'runtime', 'jre', 'Contents', 'Home', 'bin', 'java');

// A missing runtime must never silently ship an empty/broken package (packaging contract,
// contracts/reasoner-process-extraction.md) — fail loudly at build time instead.
if (!existsSync(JAR_SRC)) {
  console.error(
    `[build] Reasoner JAR not found at ${JAR_SRC}.\n` +
    `        Run "mvn clean package" in java-server/ first.`,
  );
  process.exit(1);
}
if (!existsSync(JRE_MARKER)) {
  console.error(
    `[build] Bundled JRE not found at ${JRE_MARKER}.\n` +
    `        Run "npm run fetch-runtime" first.`,
  );
  process.exit(1);
}

mkdirSync(JAR_DEST_DIR, { recursive: true });
copyFileSync(JAR_SRC, JAR_DEST);
console.log(`[build] Copied reasoner JAR → ${JAR_DEST}`);

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(__dirname, 'dist/main.js'),
  alias: {
    '@core': path.join(__dirname, '../src'),
    '@cli': path.join(__dirname, '../cli/src'),
  },
  external: ['vscode'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  minify: false,
  sourcemap: false,
}).catch(() => process.exit(1));

console.log('[build] Bundle complete.');
