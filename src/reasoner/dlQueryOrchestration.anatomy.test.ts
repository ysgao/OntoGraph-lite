/**
 * Real, non-mocked end-to-end verification of the 027-cli-dlquery-filters feature against
 * SNOMED CT-derived anatomy.owl — spawns the actual Java reasoner JAR and exercises the actual
 * production functions (`needsClassificationBeforeQuery`, `runDlQueryWithClassifyFirst`,
 * `matchesLabelFilter`) rather than mocks, closing the gap the mocked unit tests elsewhere in
 * this feature (T007/T008/T016) can't cover on their own: does the classify-first/skip-redundant
 * logic, category selection, and label filter actually behave correctly against a real,
 * SNOMED-scale ontology and a real reasoner process — not just synthetic fixtures?
 *
 * Uses `classifyFile`/`dlQuery(..., filePath, ...)` (not the content-string variant
 * `api.classify()`/`api.dlQuery()` use in `src/extension.ts`) to avoid an unnecessary ~30MB
 * read+re-serialize round trip in this test — this feature's new logic (the three functions
 * above) doesn't touch serialization at all, so the substitution doesn't weaken what's verified.
 *
 * Skipped automatically when anatomy.owl is absent (it is not committed to the repo).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({ text: '', show: vi.fn(), dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
  },
  StatusBarAlignment: { Left: 1 },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })),
  },
}));

import { ReasonerBridge } from './ReasonerBridge';
import { ParserRegistry } from '../parser/ParserRegistry';
import { needsClassificationBeforeQuery } from '../model/OntologyModel';
import { runDlQueryWithClassifyFirst } from './dlQueryOrchestration';
import { matchesLabelFilter } from '../utils/dlQueryLabelFilter';

const REPO_ROOT = path.resolve(__dirname, '../..');
const ANATOMY_PATH = path.join(REPO_ROOT, 'test-ontologies/anatomy.owl');
const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);

// "Body structure" — a broad, high-fan-out SNOMED anatomy concept (also used in
// src/uml/partOfGraph.bench.test.ts for the same reason: real many-child scale).
const BODY_STRUCTURE_IRI = 'http://snomed.info/id/123037004';
// A leaf class used in src/parser/Phase3Reasoner.test.ts's own anatomy.owl benchmark.
const LEAF_CLASS_IRI = 'http://snomed.info/id/10013000';

describe.skipIf(!ANATOMY_EXISTS)('027-cli-dlquery-filters — real end-to-end against anatomy.owl', () => {
  it(
    'classify-first orchestration, category selection, and label filter all hold against real SNOMED data',
    async () => {
      const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
      const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');
      expect(model.classes.size, 'anatomy.owl parses to a real, large class set').toBeGreaterThan(10_000);

      const bridge = new ReasonerBridge(REPO_ROOT);
      try {
        // ── US1: classify only when needed, never redundantly ──────────────────
        expect(needsClassificationBeforeQuery(model), 'a freshly parsed model needs classification').toBe(true);

        let classifyCallCount = 0;
        const classify = async (): Promise<void> => {
          classifyCallCount++;
          await bridge.classifyFile('functional', ANATOMY_PATH, 'auto');
          // Mirrors the fix applied to api.classify() in src/extension.ts — without this,
          // needsClassificationBeforeQuery would never see the model as classified.
          model.isClassified = true;
          model.classificationNeedsUpdate = false;
        };

        // ── US2: category selection ─────────────────────────────────────────────
        // "Body structure" has a modest number of DIRECT children (SNOMED's hierarchy fans out
        // gradually over several levels) but a very large number of TRANSITIVE descendants —
        // requesting both categories in one call also proves multi-category selection reaches the
        // real reasoner correctly. (The "only requested keys present" partial-shape behavior is
        // built by `api.dlQuery()` in src/extension.ts, one layer up from `ReasonerBridge.dlQuery`
        // called directly here, and is already covered by T002/T004/T013's tests.)
        const firstResult = await runDlQueryWithClassifyFirst(model, classify, () =>
          bridge.dlQuery('functional', null, ANATOMY_PATH, `<${BODY_STRUCTURE_IRI}>`, ['directSubClasses', 'subClasses'], 'auto'));

        expect(classifyCallCount, 'classify runs exactly once on the first, never-classified call').toBe(1);
        expect(firstResult.directSubClasses.length, 'Body structure has at least one direct subclass').toBeGreaterThan(0);
        expect(firstResult.subClasses.length, 'Body structure has a large real fan-out of transitive subclasses').toBeGreaterThan(1000);

        const secondResult = await runDlQueryWithClassifyFirst(model, classify, () =>
          bridge.dlQuery('functional', null, ANATOMY_PATH, `<${LEAF_CLASS_IRI}>`, ['directSuperClasses'], 'auto'));

        expect(classifyCallCount, 'a second call against the same, now-classified model skips reclassification (FR-002/SC-004)').toBe(1);
        expect(secondResult.directSuperClasses.length, 'a real leaf class has at least one direct superclass').toBeGreaterThan(0);

        // ── US3: label filter narrows a real result set by real SNOMED labels ──
        // Uses the large transitive `subClasses` set (not the 1-entry `directSubClasses` set) so
        // there's a meaningful population to narrow.
        const getLabel = (iri: string): string | null => model.classes.get(iri)?.labels['en']?.[0] ?? null;
        const allSubclasses = firstResult.subClasses.map(iri => ({ iri, label: getLabel(iri) }));
        const knownLabel = allSubclasses.find(e => e.label)?.label;
        expect(knownLabel, 'at least one real direct subclass has a resolvable label').toBeTruthy();

        const filterTerm = knownLabel!.slice(0, 4);
        const filtered = allSubclasses.filter(e => matchesLabelFilter(e, filterTerm));
        expect(filtered.length, 'the label filter narrows the real result set').toBeGreaterThan(0);
        expect(filtered.length, 'the label filter actually excludes some real entities').toBeLessThan(allSubclasses.length);
        for (const e of filtered) {
          expect(matchesLabelFilter(e, filterTerm), `${e.iri} (${e.label}) should match filter "${filterTerm}"`).toBe(true);
        }
      } finally {
        bridge.dispose();
      }
    },
    { timeout: 180_000 },
  );
});
