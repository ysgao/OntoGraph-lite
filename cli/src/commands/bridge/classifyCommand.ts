import { send } from '../../bridge/bridgeClient';
import { writeResult, writeError, exitCode } from '../../output';
import type { ClassificationResult } from '@core/api';

export async function runClassify(timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'classify';
  try {
    const resp = await send<ClassificationResult>({ id: String(Date.now()), method: 'classify', params: {} }, timeout);
    if (resp.success) {
      writeResult(resp.data, command, Date.now() - start);
      return 0;
    }
    writeError(resp.errorCode ?? 'BRIDGE_ERROR', resp.error ?? 'Bridge error', command, Date.now() - start);
    return exitCode(resp.errorCode ?? 'BRIDGE_ERROR');
  } catch (err: unknown) {
    const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
    const msg = err instanceof Error ? err.message : String(err);
    writeError(code, msg, command, Date.now() - start);
    return exitCode(code);
  }
}
