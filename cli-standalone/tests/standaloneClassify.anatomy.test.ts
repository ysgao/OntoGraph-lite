/**
 * Real, non-mocked SNOMED-scale benchmark against the actual built standalone binary
 * (dist/main.js) — closes the gap where spec FR-011/SC-505 (performance parity for large
 * ontologies) previously relied only on the manual quickstart.md check. Mirrors
 * src/reasoner/dlQueryOrchestration.anatomy.test.ts's precedent from feature 027: skipped
 * automatically when anatomy.owl (not committed to the repo) or the built runtime are absent.
 *
 * Uses async `spawn` (not `spawnSync`/`execFileSync`) — the synchronous child_process APIs were
 * observed to hang/ETIMEDOUT in this environment when the child process takes more than a few
 * seconds (reproduced identically under both vitest's `threads` and `forks` pools), even though
 * the exact same command completes in ~7s from a plain terminal. Async `spawn` is also what
 * feature 027's own real anatomy.owl test (src/reasoner/dlQueryOrchestration.anatomy.test.ts)
 * already uses successfully — this follows that proven pattern instead of introducing a new one.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const ROOT = path.resolve(__dirname, '..', '..');
const ANATOMY_PATH = path.join(ROOT, 'test-ontologies', 'anatomy.owl');
const MAIN = path.join(__dirname, '..', 'dist', 'main.js');
const JAVA_MARKER = path.join(__dirname, '..', 'dist', 'runtime', 'jre', 'Contents', 'Home', 'bin', 'java');

const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);
const RUNTIME_BUILT = fs.existsSync(MAIN) && fs.existsSync(JAVA_MARKER);

function runStandaloneClassifyAsync(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MAIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe.skipIf(!ANATOMY_EXISTS || !RUNTIME_BUILT)(
  'standalone classify — real end-to-end against anatomy.owl (built binary, bundled runtime)',
  () => {
    it(
      'classifies anatomy.owl via the built dist/main.js in a comparable time budget to feature 027\'s own anatomy.owl benchmark',
      { timeout: 60_000 },
      async () => {
        const start = Date.now();
        const { status, stdout, stderr } = await runStandaloneClassifyAsync(['classify', ANATOMY_PATH, '--reasoner', 'elk']);
        const elapsed = Date.now() - start;

        expect(status, `classify exited non-zero — stderr: ${stderr}`).toBe(0);
        const response = JSON.parse(stdout) as { success: boolean; data?: { consistent: boolean; hierarchy: unknown[] } };

        console.log(`[standalone anatomy.owl classify] elapsed: ${elapsed}ms`);
        expect(response.success, 'classify completes without error against real SNOMED-scale data').toBe(true);
        expect(response.data!.consistent, 'anatomy.owl is consistent').toBe(true);
        expect(response.data!.hierarchy.length, 'a real, large inferred hierarchy is returned').toBeGreaterThan(1000);
        // Feature 027's own anatomy.owl dlQuery benchmark completed well under 20s; classification
        // is more expensive than a single dlQuery, so this allows a wider (but still bounded)
        // margin rather than asserting an equally tight budget.
        expect(elapsed, `completes within the same order of magnitude as feature 027's benchmark (actual: ${elapsed}ms)`).toBeLessThan(45_000);
      },
    );
  },
);
