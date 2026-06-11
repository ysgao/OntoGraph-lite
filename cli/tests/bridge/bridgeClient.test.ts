import { describe, it, expect, afterEach } from 'vitest';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { send } from '../../src/bridge/bridgeClient';
import type { BridgeLockFile } from '../../src/bridge/lockFile';

function lockFilePath(): string {
  return path.join(os.homedir(), '.ontograph-lite', 'bridge.json');
}

function writeLock(lock: BridgeLockFile): void {
  const dir = path.dirname(lockFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lockFilePath(), JSON.stringify(lock), 'utf8');
}

function removeLock(): void {
  try { fs.unlinkSync(lockFilePath()); } catch { /* ignore */ }
}

describe('bridgeClient', () => {
  let server: net.Server | undefined;
  afterEach(() => {
    removeLock();
    server?.close();
    server = undefined;
  });

  it('sends NDJSON request and receives typed response from mock server', async () => {
    const sockPath = path.join(os.tmpdir(), `test-bridge-${process.pid}.sock`);
    try { fs.unlinkSync(sockPath); } catch { /* ignore */ }

    await new Promise<void>(resolve => {
      server = net.createServer(conn => {
        let buf = '';
        conn.on('data', chunk => {
          buf += chunk.toString();
          if (buf.includes('\n')) {
            const req = JSON.parse(buf.trim());
            const resp = { id: req.id, success: true, data: { classCount: 42, inferredSubclassRelations: 5, hierarchy: [], reasoner: 'elk', ontologyIri: null } };
            conn.write(JSON.stringify(resp) + '\n');
          }
        });
      });
      server.listen(sockPath, resolve);
    });

    writeLock({ socketPath: sockPath, pid: process.pid, workspacePath: '/tmp', startedAt: new Date().toISOString() });

    const resp = await send<{ classCount: number }>({ id: '1', method: 'classify', params: {} }, 5000);
    expect(resp.success).toBe(true);
    expect(resp.data?.classCount).toBe(42);
  });

  it('returns BRIDGE_UNAVAILABLE when no lock file exists', async () => {
    removeLock();
    await expect(send({ id: '1', method: 'classify', params: {} }, 2000))
      .rejects.toMatchObject({ errorCode: 'BRIDGE_UNAVAILABLE' });
  });

  it('returns BRIDGE_TIMEOUT when server does not respond', async () => {
    const sockPath = path.join(os.tmpdir(), `test-bridge-timeout-${process.pid}.sock`);
    try { fs.unlinkSync(sockPath); } catch { /* ignore */ }

    await new Promise<void>(resolve => {
      server = net.createServer(_conn => { /* intentionally no response */ });
      server.listen(sockPath, resolve);
    });

    writeLock({ socketPath: sockPath, pid: process.pid, workspacePath: '/tmp', startedAt: new Date().toISOString() });

    await expect(send({ id: '1', method: 'classify', params: {} }, 500))
      .rejects.toMatchObject({ errorCode: 'BRIDGE_TIMEOUT' });
  });
});
