import { OntologyModel } from '../model/OntologyModel';
import { FunctionalParser } from './FunctionalParser';
import { ManchesterParser } from './ManchesterParser';
import { TurtleParser } from './TurtleParser';
import { OwlXmlParser } from './OwlXmlParser';
import { RdfXmlParser } from './RdfXmlParser';

const LARGE_FILE_BYTES = 5 * 1024 * 1024;

function detectOwlFormat(text: string): 'functional' | 'owlxml' | 'rdfxml' | 'unknown' {
  const t = text.trimStart();
  if (t.startsWith('Prefix(') || t.startsWith('Ontology(')) { return 'functional'; }
  if (!t.startsWith('<')) { return 'unknown'; }
  const head = t.slice(0, 2000);
  if (/<Ontology[\s>]/.test(head)) { return 'owlxml'; }
  if (/<rdf:RDF[\s>]/.test(head) || /xmlns:rdf=/.test(head)) { return 'rdfxml'; }
  return 'unknown';
}

export class ParserRegistry {
  static parse(text: string, languageId: string, uri: string): OntologyModel {
    if (text.length > LARGE_FILE_BYTES) {
      // TODO Phase 1.5: offload to Worker Thread for files > 5 MB
    }

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

      case 'owl-xml': {
        const fmt = detectOwlFormat(text);
        if (fmt === 'functional') { model = new FunctionalParser(text, uri).parse(); sourceFormat = 'functional'; break; }
        if (fmt === 'owlxml')     { model = new OwlXmlParser(text, uri).parse();     sourceFormat = 'owl-xml';    break; }
        if (fmt === 'rdfxml')     { model = new RdfXmlParser(text, uri).parse();     sourceFormat = 'rdf-xml';    break; }
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
