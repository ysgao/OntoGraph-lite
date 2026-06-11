import { describe, it, expect, afterEach } from 'vitest';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';

const SOCK_PATH = path.join(os.tmpdir(), `test-bserver-${process.pid}.sock`);

const mockApi = {
  classify: async () => ({ ontologyIri: null, classCount: 5, inferredSubclassRelations: 2, reasoner: 'elk' as const, hierarchy: [] }),
  checkConsistency: async () => ({ ontologyIri: null, consistent: true, reasoner: 'elk' as const, explanation: null }),
  dlQuery: async (expression: string) => ({ expression, superClasses: [], equivalentClasses: [], subClasses: [], instances: [] }),
  getActiveModel: () => null,
  getActiveIndex: () => null,
};

function sendRequest(sockPath: string, req: object, timeoutMs = 3000): Promise<object> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath);
    let buf = '';
    const timer = setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, timeoutMs);
    client.on('data', chunk => {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        clearTimeout(timer);
        client.destroy();
        resolve(JSON.parse(buf.trim()));
      }
    });
    client.on('error', reject);
    client.on('connect', () => { client.write(JSON.stringify(req) + '\n'); });
  });
}

describe('BridgeServer', () => {
  afterEach(() => {
    try { fs.unlinkSync(SOCK_PATH); } catch { /* ignore */ }
  });

  it('accepts NDJSON classify request and returns ClassificationResult', async () => {
    const { BridgeServer } = await import('../../src/bridge/BridgeServer');
    const server = new BridgeServer(SOCK_PATH);
    await server.start(mockApi as never);

    const resp = await sendRequest(SOCK_PATH, { id: 'req1', method: 'classify', params: {} }) as { id: string; success: boolean; data: { classCount: number } };
    expect(resp.id).toBe('req1');
    expect(resp.success).toBe(true);
    expect(resp.data.classCount).toBe(5);

    await server.stop();
  });

  it('start() creates lock file; stop() deletes it', async () => {
    const { BridgeServer } = await import('../../src/bridge/BridgeServer');
    const lockPath = path.join(os.tmpdir(), `test-lock-${process.pid}.json`);
    const server = new BridgeServer(SOCK_PATH, lockPath);
    await server.start(mockApi as never);
    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(lock.socketPath).toBe(SOCK_PATH);
    expect(typeof lock.pid).toBe('number');
    await server.stop();
    expect(fs.existsSync(lockPath)).toBe(false);
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  });
});
