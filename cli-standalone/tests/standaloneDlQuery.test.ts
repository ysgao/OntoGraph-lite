import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

const mockDlQuery = vi.fn();
vi.mock('../src/reasonerRuntime', () => ({
  createReasonerProcess: vi.fn(() => ({ dlQuery: mockDlQuery, dispose: vi.fn() })),
}));

import { runStandaloneDlQuery } from '../src/commands/standaloneDlQueryCommand';

function captureStdout(fn: () => Promise<number>): Promise<{ code: number; captured: unknown }> {
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured: unknown;
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  return fn().then(code => {
    process.stdout.write = origWrite;
    return { code, captured };
  });
}

describe('runStandaloneDlQuery', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('reports FILE_NOT_FOUND for a nonexistent file, without constructing a reasoner', async () => {
    const { code, captured } = await captureStdout(() => runStandaloneDlQuery('/nonexistent/file.ofn', 'Animal', 5000));
    expect(code).toBe(1);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.errorCode).toBe('FILE_NOT_FOUND');
    expect(mockDlQuery).not.toHaveBeenCalled();
  });

  it('sends the default queryTypes (subClasses only) and writes the partial-keys result with resolved labels', async () => {
    mockDlQuery.mockResolvedValue({
      directSuperClasses: [], superClasses: [], equivalentClasses: [],
      directSubClasses: [], subClasses: ['http://example.org/animals#Koala'], instances: [],
    });

    const { code, captured } = await captureStdout(() => runStandaloneDlQuery(ANIMALS_OMN, 'Animal', 5000));

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: Record<string, { iri: string; label: string | null }[]> };
    expect(r.success).toBe(true);
    expect(r.data.subClasses).toHaveLength(1);
    expect(r.data.subClasses[0]!.iri).toBe('http://example.org/animals#Koala');
    expect(r.data).not.toHaveProperty('superClasses');
    const call = mockDlQuery.mock.calls[0];
    expect(call[4]).toEqual(['subClasses']); // queryTypes is the 5th positional arg
  });

  it('rejects an unrecognized --types value with INVALID_ARGS and never calls the reasoner', async () => {
    const { code, captured } = await captureStdout(() =>
      runStandaloneDlQuery(ANIMALS_OMN, 'Animal', 5000, { types: 'bogusCategory' }));

    expect(code).toBe(4); // INVALID_ARGS
    const r = captured as { success: boolean; errorCode: string };
    expect(r.errorCode).toBe('INVALID_ARGS');
    expect(mockDlQuery).not.toHaveBeenCalled();
  });

  it('applies the label filter client-side to the reasoner result', async () => {
    mockDlQuery.mockResolvedValue({
      directSubClasses: ['http://example.org/animals#Koala', 'http://example.org/animals#Wombat'],
    });

    const { captured } = await captureStdout(() =>
      runStandaloneDlQuery(ANIMALS_OMN, 'Animal', 5000, { types: 'directSubClasses', filter: 'koala' }));

    const r = captured as { data: { directSubClasses: { iri: string; label: string | null }[] } };
    expect(r.data.directSubClasses).toHaveLength(1);
    expect(r.data.directSubClasses[0]!.iri).toBe('http://example.org/animals#Koala');
  });
});
