import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

const mockClassifyFile = vi.fn();
vi.mock('../src/reasonerRuntime', () => ({
  createReasonerProcess: vi.fn(() => ({ classifyFile: mockClassifyFile, dispose: vi.fn() })),
}));

import { runStandaloneClassify } from '../src/commands/standaloneClassifyCommand';

function captureStdout(fn: () => Promise<number>): Promise<{ code: number; captured: unknown }> {
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured: unknown;
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  return fn().then(code => {
    process.stdout.write = origWrite;
    return { code, captured };
  });
}

describe('runStandaloneClassify', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('reports FILE_NOT_FOUND for a nonexistent file, without constructing a reasoner', async () => {
    const { code, captured } = await captureStdout(() => runStandaloneClassify('/nonexistent/file.ofn', 5000));
    expect(code).toBe(1);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('FILE_NOT_FOUND');
    expect(mockClassifyFile).not.toHaveBeenCalled();
  });

  it('reports PARSE_ERROR for an unparseable file', async () => {
    const { code, captured } = await captureStdout(() => runStandaloneClassify(path.join(__dirname, 'fixtures/invalid.ofn'), 5000));
    expect(code).toBe(2);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('PARSE_ERROR');
  });

  it('classifies a valid file and returns the ClassificationResult shape', async () => {
    mockClassifyFile.mockResolvedValue({
      consistent: true,
      incoherentClasses: [],
      hierarchy: [['http://www.w3.org/2002/07/owl#Thing', 'http://example.org/animals#Animal']],
      equivalentClasses: [],
    });

    const { code, captured } = await captureStdout(() => runStandaloneClassify(ANIMALS_OMN, 5000));

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { consistent: boolean; hierarchy: unknown[] } };
    expect(r.success).toBe(true);
    expect(r.data.consistent).toBe(true);
    expect(r.data.hierarchy).toHaveLength(1);
  });

  it('defaults to the "elk" reasoner when --reasoner is omitted', async () => {
    mockClassifyFile.mockResolvedValue({ consistent: true, incoherentClasses: [], hierarchy: [], equivalentClasses: [] });

    await captureStdout(() => runStandaloneClassify(ANIMALS_OMN, 5000));

    expect(mockClassifyFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'elk');
  });

  it('passes an explicit --reasoner value through unchanged', async () => {
    mockClassifyFile.mockResolvedValue({ consistent: true, incoherentClasses: [], hierarchy: [], equivalentClasses: [] });

    await captureStdout(() => runStandaloneClassify(ANIMALS_OMN, 5000, { reasoner: 'hermit' }));
    expect(mockClassifyFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'hermit');

    await captureStdout(() => runStandaloneClassify(ANIMALS_OMN, 5000, { reasoner: 'auto' }));
    expect(mockClassifyFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'auto');
  });
});
