import { workerData, parentPort } from 'worker_threads';
import { ParserRegistry } from './ParserRegistry';
import { buildModelSegmentIndex } from '../model/SegmentIndex';

interface WorkerInput { text: string; languageId: string; uri: string; }

const { text, languageId, uri } = workerData as WorkerInput;
try {
  const model = ParserRegistry.parse(text, languageId, uri);
  // Build entity segment index in worker thread — avoids blocking the extension host
  // for large ontologies (SNOMED-scale 2.9M-line files where this takes 3-5 seconds).
  buildModelSegmentIndex(model);
  parentPort!.postMessage({ success: true, model });
} catch (err) {
  parentPort!.postMessage({ success: false, error: err instanceof Error ? err.message : String(err) });
}
