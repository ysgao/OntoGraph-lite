import { workerData, parentPort } from 'worker_threads';
import { ParserRegistry } from './ParserRegistry';

interface WorkerInput { text: string; languageId: string; uri: string; }

const { text, languageId, uri } = workerData as WorkerInput;
try {
  const model = ParserRegistry.parse(text, languageId, uri);
  parentPort!.postMessage({ success: true, model });
} catch (err) {
  parentPort!.postMessage({ success: false, error: err instanceof Error ? err.message : String(err) });
}
