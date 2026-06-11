import os from 'os';
import path from 'path';
import fs from 'fs';

export interface BridgeLockFile {
  socketPath: string;
  pid: number;
  workspacePath: string;
  startedAt: string;
}

export function lockFilePath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? os.homedir(), 'ontograph-lite', 'bridge.json');
  }
  return path.join(os.homedir(), '.ontograph-lite', 'bridge.json');
}

export function readLockFile(): BridgeLockFile | null {
  const p = lockFilePath();
  if (!fs.existsSync(p)) { return null; }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as BridgeLockFile;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
