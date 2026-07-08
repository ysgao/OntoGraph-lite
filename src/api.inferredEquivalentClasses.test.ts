import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { test, expect } from 'vitest';

// buildInferredEquivalentClasses() (in ./api) imports from ./reasoner/ReasonerBridge, which
// imports 'vscode' at module scope — mock it so this file can run standalone under Vitest,
// outside the extension host, like ReasonerBridge.test.ts does.
import { vi } from 'vitest';
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({ text: '', show: vi.fn(), dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
  },
  StatusBarAlignment: { Left: 1 },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
}));

import { FunctionalParser } from './parser/FunctionalParser';
import { OntologyIndex } from './model/OntologyIndex';
import { buildInferredEquivalentClasses } from './api';
import type { EquivalentClassEntry } from './reasoner/ReasonerBridge';

const ROOT = join(__dirname, '../test-ontologies');
const JAR = join(__dirname, '../java-server/target/onto-reasoner-server.jar');
const JAVA = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
const ANATOMY_PATH = join(ROOT, 'anatomy.owl');

function rpc(requests: object[]): unknown[] {
  const input = requests.map(r => JSON.stringify(r)).join('\n') + '\n';
  // anatomy.owl's classify response includes ~73k hierarchy edges — well past spawnSync's
  // default maxBuffer, which surfaces as ENOBUFS rather than a clear "buffer exceeded" error.
  const result = spawnSync(JAVA, ['-jar', JAR], { input, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 * 200 });
  if (result.error) { throw result.error; }
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

// ── Real end-to-end check: `ontograph classify`'s inferredEquivalentClasses field ──────────
// against anatomy.owl (~75k SNOMED-derived classes). Exercises the exact production code
// path (buildInferredEquivalentClasses + groupEquivalentClasses) against a real reasoner
// run, not a mock — the same shape the CLI bridge command (`ontograph classify`) returns.

test.skipIf(!existsSync(ANATOMY_PATH))(
  'api.classify pipeline: inferredEquivalentClasses is non-empty for anatomy.owl, with resolved labels',
  { timeout: 60_000 },
  () => {
    console.log('── inferredEquivalentClasses (anatomy.owl) ───────────────────────');

    const start = Date.now();
    const [r] = rpc([{
      id: 40,
      method: 'classify',
      params: { format: 'functional', filePath: ANATOMY_PATH, engine: 'elk' },
    }]) as { id: number; result?: { equivalentClasses: EquivalentClassEntry[] }; error?: { message: string } }[];
    const elapsed = Date.now() - start;
    console.log(`  classify elapsed: ${elapsed}ms`);

    expect(r.error, 'classify completes without error').toBeUndefined();
    const entries = r.result!.equivalentClasses;
    expect(entries.length, 'reasoner reports at least one raw equivalentClasses entry').toBeGreaterThan(0);

    const model = new FunctionalParser(readFileSync(ANATOMY_PATH, 'utf8'), 'file:///anatomy.owl').parse();
    const index = new OntologyIndex(model);
    const getLabel = (iri: string): string | null => {
      const entity = index.getByIri(iri);
      const labels = entity?.labels['en'] ?? entity?.labels[''] ?? Object.values(entity?.labels ?? {})[0];
      return labels?.[0] ?? null;
    };

    const inferredEquivalentClasses = buildInferredEquivalentClasses(entries, getLabel);

    console.log(`  unique classes with an inferred equivalence: ${inferredEquivalentClasses.length}`);
    console.log('  sample:', JSON.stringify(inferredEquivalentClasses.slice(0, 3), null, 2));

    expect(inferredEquivalentClasses.length, 'CLI-facing inferredEquivalentClasses is non-empty for anatomy.owl').toBeGreaterThan(0);

    // Shape + label resolution sanity checks
    for (const entry of inferredEquivalentClasses) {
      expect(typeof entry.iri).toBe('string');
      expect(Array.isArray(entry.equivalentClasses)).toBe(true);
      expect(Array.isArray(entry.equivalentExpressions)).toBe(true);
      for (const ref of entry.equivalentClasses) {
        expect(typeof ref.iri).toBe('string');
      }
    }

    const withResolvedLabel = inferredEquivalentClasses.find(e => e.label !== null);
    expect(withResolvedLabel, 'at least one entry has a resolved rdfs:label (anatomy.owl has labels)').toBeDefined();
  },
);
