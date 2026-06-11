import { describe, it, expect, vi, afterEach } from 'vitest';
import * as bridgeClient from '../../src/bridge/bridgeClient';
import { runCheckConsistency } from '../../src/commands/bridge/consistencyCommand';

describe('consistencyCommand', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls bridgeClient.send with method checkConsistency and writes ConsistencyResult', async () => {
    const mockData = { ontologyIri: null, consistent: true, reasoner: 'elk', explanation: null };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runCheckConsistency(5000);
    process.stdout.write = origWrite;

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: typeof mockData };
    expect(r.success).toBe(true);
    expect(r.data.consistent).toBe(true);
    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].method).toBe('checkConsistency');
  });
});
