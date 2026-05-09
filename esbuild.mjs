import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

// Extension host bundle (Node.js, CommonJS)
const extensionBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  target: 'node18',
});

// Language server bundle (Node.js, CommonJS)
const serverBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['src/lsp/server/server.ts'],
  outfile: 'dist/server.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  target: 'node18',
});

// Graph webview bundle (browser)
const graphWebviewBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['webview-src/graph/GraphViewApp.ts'],
  outfile: 'dist/graph-webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
});

// Entity editor webview bundle (browser)
const classEditorBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['webview-src/entity-editor/EntityEditorApp.ts'],
  outfile: 'dist/entity-editor-webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
});

// SPARQL editor webview bundle (browser)
const sparqlEditorBuild = esbuild.build({
  ...baseConfig,
  entryPoints: ['webview-src/sparql-editor/SparqlEditorApp.ts'],
  outfile: 'dist/sparql-editor-webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
});

await Promise.all([
  extensionBuild,
  serverBuild,
  graphWebviewBuild,
  classEditorBuild,
  sparqlEditorBuild,
]).catch(() => process.exit(1));
