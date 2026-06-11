import { describe, it, expect, vi, afterEach } from 'vitest';
import * as bridgeClient from '../../src/bridge/bridgeClient';
import { runDlQuery } from '../../src/commands/bridge/dlQueryCommand';

describe('dlQueryCommand', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('passes expression param and writes DLQueryResult', async () => {
    const mockData = { expression: 'Animal', superClasses: [], equivalentClasses: [], subClasses: [{ iri: 'ex:Dog', label: 'Dog' }], instances: [] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runDlQuery('Animal', 5000);
    process.stdout.write = origWrite;

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: typeof mockData };
    expect(r.success).toBe(true);
    expect(r.data.subClasses).toHaveLength(1);
    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].method).toBe('dlQuery');
    expect(call[0].params.expression).toBe('Animal');
  });
});
