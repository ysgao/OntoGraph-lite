import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

const mockCheckConsistency = vi.fn();
vi.mock('../src/reasonerRuntime', () => ({
  createReasonerProcess: vi.fn(() => ({ checkConsistency: mockCheckConsistency, dispose: vi.fn() })),
}));

import { runStandaloneConsistency } from '../src/commands/standaloneConsistencyCommand';

function captureStdout(fn: () => Promise<number>): Promise<{ code: number; captured: unknown }> {
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured: unknown;
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  return fn().then(code => {
    process.stdout.write = origWrite;
    return { code, captured };
  });
}

describe('runStandaloneConsistency', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('reports FILE_NOT_FOUND for a nonexistent file, without constructing a reasoner', async () => {
    const { code, captured } = await captureStdout(() => runStandaloneConsistency('/nonexistent/file.ofn', 5000));
    expect(code).toBe(1);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('FILE_NOT_FOUND');
    expect(mockCheckConsistency).not.toHaveBeenCalled();
  });

  it('reports PARSE_ERROR for an unparseable file', async () => {
    const { code, captured } = await captureStdout(() =>
      runStandaloneConsistency(path.join(__dirname, 'fixtures/invalid.ofn'), 5000));
    expect(code).toBe(2);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('PARSE_ERROR');
  });

  it('checks consistency for a valid file and returns the ConsistencyResult shape', async () => {
    mockCheckConsistency.mockResolvedValue({ consistent: true });

    const { code, captured } = await captureStdout(() => runStandaloneConsistency(ANIMALS_OMN, 5000));

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { consistent: boolean } };
    expect(r.success).toBe(true);
    expect(r.data.consistent).toBe(true);
  });
});
