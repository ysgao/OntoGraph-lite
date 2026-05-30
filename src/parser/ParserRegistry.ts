import { Worker } from 'worker_threads';
import * as path from 'path';
import { OntologyModel } from '../model/OntologyModel';
import { FunctionalParser } from './FunctionalParser';
import { ManchesterParser } from './ManchesterParser';
import { TurtleParser } from './TurtleParser';
import { OwlXmlParser } from './OwlXmlParser';
import { RdfXmlParser } from './RdfXmlParser';

export const LARGE_FILE_BYTES = 5 * 1024 * 1024;

function detectOwlFormat(text: string): 'functional' | 'manchester' | 'owlxml' | 'rdfxml' | 'turtle' | 'unknown' {
  const t = text.trimStart();
  if (t.startsWith('<')) {
    const head = t.slice(0, 2000);
    if (/<Ontology[\s>]/.test(head)) { return 'owlxml'; }
    if (/<rdf:RDF[\s>]/.test(head) || /xmlns:rdf=/.test(head)) { return 'rdfxml'; }
    return 'unknown';
  }
  if (t.slice(0, 16384).includes('Ontology(')) { return 'functional'; }
  if (t.slice(0, 16384).includes('Ontology:')) { return 'manchester'; }
  if (/(?:@prefix|@base|PREFIX\s|BASE\s)/.test(t.slice(0, 1024))) { return 'turtle'; }
  return 'unknown';
}

export class ParserRegistry {
  static parseAsync(text: string, languageId: string, uri: string): Promise<OntologyModel> {
    if (text.length <= LARGE_FILE_BYTES) {
      try {
        return Promise.resolve(ParserRegistry.parse(text, languageId, uri));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
    return new Promise<OntologyModel>((resolve, reject) => {
      const workerPath = path.join(__dirname, 'parserWorker.js');
      const worker = new Worker(workerPath, { workerData: { text, languageId, uri } });
      worker.once('message', (msg: { success: boolean; model?: OntologyModel; error?: string }) => {
        if (msg.success && msg.model) { resolve(msg.model); }
        else { reject(new Error(msg.error ?? 'Parser worker returned no model')); }
      });
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) { reject(new Error(`Parser worker exited with code ${code}`)); }
      });
    });
  }

  static parse(text: string, languageId: string, uri: string): OntologyModel {

    let model: OntologyModel;
    let sourceFormat: string;

    switch (languageId) {
      case 'owl-functional':
        model = new FunctionalParser(text, uri).parse();
        sourceFormat = 'functional';
        break;

      case 'manchester':
        model = new ManchesterParser(text, uri).parse();
        sourceFormat = 'manchester';
        break;

      case 'turtle':
        model = new TurtleParser(text, uri).parse();
        sourceFormat = 'turtle';
        break;

      case 'auto':
      case 'owl-xml': {
        const fmt = detectOwlFormat(text);
        if (fmt === 'functional') { model = new FunctionalParser(text, uri).parse();  sourceFormat = 'functional'; break; }
        if (fmt === 'owlxml')     { model = new OwlXmlParser(text, uri).parse();      sourceFormat = 'owl-xml';    break; }
        if (fmt === 'rdfxml')     { model = new RdfXmlParser(text, uri).parse();      sourceFormat = 'rdf-xml';    break; }
        if (fmt === 'manchester') { model = new ManchesterParser(text, uri).parse();  sourceFormat = 'manchester'; break; }
        if (fmt === 'turtle')     { model = new TurtleParser(text, uri).parse();      sourceFormat = 'turtle';     break; }
        throw new Error(`Could not detect OWL serialisation format for: ${uri}`);
      }

      default:
        throw new Error(`No parser registered for language: ${languageId}`);
    }

    model.rawContent = text;
    model.sourceFormat = sourceFormat;
    return model;
  }
}
