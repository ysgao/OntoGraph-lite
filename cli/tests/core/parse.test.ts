import { describe, it, expect } from 'vitest';
import path from 'path';
import { runParse } from '../../src/commands/core/parseCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');
const MISSING = path.join(ROOT, 'test-ontologies/does-not-exist.ofn');

describe('parseCommand', () => {
  it('returns ParseResult with correct counts for animals.omn', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runParse(ANIMALS_OMN, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { classCount: number; format: string; ontologyIri: string | null } };
    expect(r.success).toBe(true);
    expect(r.data.classCount).toBeGreaterThan(0);
    expect(['functional', 'manchester', 'turtle', 'owlxml']).toContain(r.data.format);
  });

  it('returns FILE_NOT_FOUND for missing path', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runParse(MISSING, 5000);
    process.stdout.write = origWrite;
    expect(code).not.toBe(0);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('FILE_NOT_FOUND');
  });
});
