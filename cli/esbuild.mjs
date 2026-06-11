import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(__dirname, 'dist/main.js'),
  alias: {
    '@core': path.join(__dirname, '../src'),
  },
  external: ['vscode'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  minify: false,
  sourcemap: false,
}).catch(() => process.exit(1));
