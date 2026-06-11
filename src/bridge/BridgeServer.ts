import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OntoGraphApi } from '../api';

function defaultSocketPath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\ontograph-lite`;
  }
  return path.join(os.tmpdir(), `ontograph-lite-${process.pid}.sock`);
}

function defaultLockFilePath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'ontograph-lite', 'bridge.json');
  }
  return path.join(os.homedir(), '.ontograph-lite', 'bridge.json');
}

export class BridgeServer {
  private server: net.Server | null = null;
  private readonly socketPath: string;
  private readonly lockPath: string;

  constructor(
    socketPath: string = defaultSocketPath(),
    lockPath: string = defaultLockFilePath(),
  ) {
    this.socketPath = socketPath;
    this.lockPath = lockPath;
  }

  async start(api: OntoGraphApi): Promise<void> {
    try { fs.unlinkSync(this.socketPath); } catch { /* ignore */ }
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });

    return new Promise((resolve, reject) => {
      this.server = net.createServer(conn => {
        let buf = '';
        conn.on('data', async (chunk: Buffer) => {
          buf += chunk.toString();
          if (!buf.includes('\n')) { return; }
          const nl = buf.indexOf('\n');
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          try {
            const req = JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> };
            const data = await this.dispatch(api, req.method, req.params);
            conn.write(JSON.stringify({ id: req.id, success: true, data }) + '\n');
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            conn.write(JSON.stringify({ id: '?', success: false, error: msg, errorCode: 'BRIDGE_ERROR' }) + '\n');
          }
        });
        conn.on('error', () => { /* client disconnect, ignore */ });
      });

      this.server.on('error', reject);
      this.server.listen(this.socketPath, () => {
        fs.writeFileSync(this.lockPath, JSON.stringify({
          socketPath: this.socketPath,
          pid: process.pid,
          workspacePath: process.cwd(),
          startedAt: new Date().toISOString(),
        }), 'utf8');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    try { fs.unlinkSync(this.lockPath); } catch { /* ignore */ }
    try { fs.unlinkSync(this.socketPath); } catch { /* ignore */ }
    return new Promise(resolve => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  private async dispatch(api: OntoGraphApi, method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'classify': return api.classify();
      case 'checkConsistency': return api.checkConsistency();
      case 'dlQuery': return api.dlQuery(params.expression as string);
      default: throw new Error(`Unknown bridge method: ${method}`);
    }
  }
}
