import { describe, it, expect, vi, afterEach } from 'vitest';
import * as bridgeClient from '../../src/bridge/bridgeClient';
import { resolveActiveFilePath } from '../../src/bridge/activeFile';

describe('resolveActiveFilePath', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the file path when the bridge reports an active file', async () => {
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: { filePath: '/tmp/active.omn' } });
    await expect(resolveActiveFilePath(5000)).resolves.toBe('/tmp/active.omn');
  });

  it('throws NO_ACTIVE_FILE when no ontology file is open', async () => {
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: true, data: { filePath: null } });
    await expect(resolveActiveFilePath(5000)).rejects.toMatchObject({ errorCode: 'NO_ACTIVE_FILE' });
  });

  it('propagates bridge-level errors from a failed response', async () => {
    vi.spyOn(bridgeClient, 'send').mockResolvedValue({ id: '1', success: false, error: 'boom', errorCode: 'BRIDGE_ERROR' });
    await expect(resolveActiveFilePath(5000)).rejects.toMatchObject({ errorCode: 'BRIDGE_ERROR' });
  });

  it('propagates connection-level errors thrown by send', async () => {
    vi.spyOn(bridgeClient, 'send').mockRejectedValue(Object.assign(new Error('unavailable'), { errorCode: 'BRIDGE_UNAVAILABLE' }));
    await expect(resolveActiveFilePath(5000)).rejects.toMatchObject({ errorCode: 'BRIDGE_UNAVAILABLE' });
  });
});
