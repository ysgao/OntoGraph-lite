import { describe, it, expect } from 'vitest';
import path from 'path';
import { runSearch } from '../../src/commands/core/searchCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

describe('searchCommand', () => {
  it('returns matching entities for query "Animal"', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runSearch(ANIMALS_OMN, 'Animal', 20, undefined, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { totalMatches: number; results: { iri: string }[] } };
    expect(r.success).toBe(true);
    expect(r.data.totalMatches).toBeGreaterThan(0);
    expect(r.data.results.length).toBeGreaterThan(0);
  });

  it('returns empty results for unmatched query', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runSearch(ANIMALS_OMN, 'xyzzy__no_match_999', 20, undefined, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { totalMatches: number } };
    expect(r.success).toBe(true);
    expect(r.data.totalMatches).toBe(0);
  });
});
