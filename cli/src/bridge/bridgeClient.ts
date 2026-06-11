import net from 'net';
import { randomUUID } from 'crypto';
import { readLockFile, isAlive } from './lockFile';

export interface BridgeRequest {
  id: string;
  method: 'classify' | 'checkConsistency' | 'dlQuery';
  params: Record<string, unknown>;
}

export interface BridgeResponse<T> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

class BridgeError extends Error {
  errorCode: string;
  constructor(code: string, message: string) {
    super(message);
    this.errorCode = code;
  }
}

export async function send<T>(
  request: BridgeRequest,
  timeoutMs: number,
): Promise<BridgeResponse<T>> {
  const lock = readLockFile();
  if (!lock) {
    throw new BridgeError('BRIDGE_UNAVAILABLE', 'OntoGraph extension not detected. Open VS Code with OntoGraph active.');
  }
  if (!isAlive(lock.pid)) {
    throw new BridgeError('BRIDGE_UNAVAILABLE', 'OntoGraph extension process is not running (stale lock file).');
  }

  const id = request.id || randomUUID();
  const msg = JSON.stringify({ ...request, id }) + '\n';

  return new Promise<BridgeResponse<T>>((resolve, reject) => {
    const client = net.createConnection(lock.socketPath);
    let buf = '';
    let settled = false;

    const fail = (err: BridgeError) => {
      if (settled) { return; }
      settled = true;
      client.destroy();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new BridgeError('BRIDGE_TIMEOUT', `Bridge did not respond within ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('data', chunk => {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        clearTimeout(timer);
        if (settled) { return; }
        settled = true;
        client.destroy();
        try {
          const parsed = JSON.parse(buf.trim()) as BridgeResponse<T>;
          resolve(parsed);
        } catch {
          reject(new BridgeError('BRIDGE_ERROR', 'Malformed JSON response from bridge'));
        }
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      fail(new BridgeError('BRIDGE_UNAVAILABLE', `Cannot connect to bridge socket: ${err.message}`));
    });

    client.on('connect', () => { client.write(msg); });
  });
}
