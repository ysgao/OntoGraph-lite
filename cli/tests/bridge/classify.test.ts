import { describe, it, expect, vi, afterEach } from 'vitest';
import * as bridgeClient from '../../src/bridge/bridgeClient';
import { runClassify } from '../../src/commands/bridge/classifyCommand';

describe('classifyCommand', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls bridgeClient.send with method classify and writes ClassificationResult', async () => {
    const mockData = { ontologyIri: null, classCount: 10, inferredSubclassRelations: 3, reasoner: 'elk', hierarchy: [] };
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: mockData });

    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runClassify(5000);
    process.stdout.write = origWrite;

    expect(code).toBe(0);
    const r = captured as { success: boolean; data: typeof mockData };
    expect(r.success).toBe(true);
    expect(r.data.classCount).toBe(10);
    const call = (bridgeClient.send as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call[0].method).toBe('classify');
  });

  it('returns BRIDGE_UNAVAILABLE exit code when send rejects', async () => {
    vi.spyOn(bridgeClient, 'send').mockRejectedValue(Object.assign(new Error('unavailable'), { errorCode: 'BRIDGE_UNAVAILABLE' }));
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runClassify(5000);
    process.stdout.write = origWrite;
    expect(code).not.toBe(0);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
  });
});
