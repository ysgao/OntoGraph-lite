import { send } from '../../bridge/bridgeClient';
import { writeResult, writeError, exitCode } from '../../output';
import type { ConsistencyResult } from '@core/api';

export async function runCheckConsistency(timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'check-consistency';
  try {
    const resp = await send<ConsistencyResult>({ id: String(Date.now()), method: 'checkConsistency', params: {} }, timeout);
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
