import { describe, it, expect, vi, afterEach } from 'vitest';
import * as bridgeClient from '../../src/bridge/bridgeClient';
import { runDlQuery } from '../../src/commands/bridge/dlQueryCommand';

function captureStdout(fn: () => Promise<number>): Promise<{ code: number; captured: unknown }> {
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured: unknown;
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  return fn().then(code => {
    process.stdout.write = origWrite;
    return { code, captured };
  });
}

describe('dlQueryCommand', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends the default queryTypes (subClasses only) and writes the partial-keys result', async () => {
    const mockData = { expression: 'Animal', subClasses: [{ iri: 'ex:Dog', label: 'Dog' }] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    const { code, captured } = await captureStdout(() => runDlQuery('Animal', 5000));

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: typeof mockData };
    expect(r.success).toBe(true);
    expect(r.data.subClasses).toHaveLength(1);
    expect(r.data).not.toHaveProperty('superClasses');
    expect(r.data).not.toHaveProperty('equivalentClasses');
    expect(r.data).not.toHaveProperty('instances');
    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].method).toBe('dlQuery');
    expect(call[0].params.expression).toBe('Animal');
    expect(call[0].params.queryTypes).toEqual(['subClasses']);
  });

  it('sends the parsed queryTypes when --types is provided', async () => {
    const mockData = { expression: 'Animal', directSubClasses: [], instances: [] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    const { code } = await captureStdout(() => runDlQuery('Animal', 5000, { types: 'directSubClasses,instances' }));

    expect(code).toBe(0);
    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].params.queryTypes).toEqual(['directSubClasses', 'instances']);
  });

  it('auto-quotes a bare multi-word expression before sending it to the bridge', async () => {
    const mockData = { expression: "'middle ear structure'", subClasses: [] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    await captureStdout(() => runDlQuery('middle ear structure', 5000));

    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].params.expression).toBe("'middle ear structure'");
  });

  it('appends a single-quote hint to a Manchester parse error on a bare multi-word expression', async () => {
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({
      id: '1',
      success: false,
      errorCode: 'BRIDGE_ERROR',
      error: 'Encountered middle at line 1 column 1. Expected one of:\n\tClass name\n',
    });

    const { captured } = await captureStdout(() => runDlQuery('Animal and middle ear structure', 5000));

    const r = captured as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain("Hint: wrap multi-word entity names in single quotes, e.g. 'Animal and middle ear structure'.");
  });

  it('rejects an unrecognized --types value with INVALID_ARGS and never calls the bridge', async () => {
    const sendSpy = vi.spyOn(bridgeClient, 'send');

    const { code, captured } = await captureStdout(() => runDlQuery('Animal', 5000, { types: 'bogusCategory' }));

    expect(code).toBe(4); // INVALID_ARGS
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_ARGS');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('narrows entities within each returned category via --filter', async () => {
    const mockData = {
      expression: 'Animal',
      directSubClasses: [{ iri: 'ex:Dog', label: 'Dog' }, { iri: 'ex:Cat', label: 'Cat' }],
      instances: [{ iri: 'ex:Rex', label: 'Rex the dog' }, { iri: 'ex:Tom', label: 'Tom the cat' }],
    };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    const { captured } = await captureStdout(() =>
      runDlQuery('Animal', 5000, { types: 'directSubClasses,instances', filter: 'dog' }));

    const r = captured as { data: typeof mockData };
    expect(r.data.directSubClasses).toEqual([{ iri: 'ex:Dog', label: 'Dog' }]);
    expect(r.data.instances).toEqual([{ iri: 'ex:Rex', label: 'Rex the dog' }]);
  });

  it('returns an empty array (not an error) when the filter matches nothing', async () => {
    const mockData = { expression: 'Animal', subClasses: [{ iri: 'ex:Dog', label: 'Dog' }] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    const { code, captured } = await captureStdout(() => runDlQuery('Animal', 5000, { filter: 'no-such-match' }));

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: typeof mockData };
    expect(r.success).toBe(true);
    expect(r.data.subClasses).toEqual([]);
  });

  it('returns all entities unchanged when --filter is omitted or empty', async () => {
    const mockData = { expression: 'Animal', subClasses: [{ iri: 'ex:Dog', label: 'Dog' }, { iri: 'ex:Cat', label: 'Cat' }] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    const omitted = await captureStdout(() => runDlQuery('Animal', 5000));
    expect((omitted.captured as { data: typeof mockData }).data.subClasses).toHaveLength(2);

    const empty = await captureStdout(() => runDlQuery('Animal', 5000, { filter: '' }));
    expect((empty.captured as { data: typeof mockData }).data.subClasses).toHaveLength(2);
  });
});
