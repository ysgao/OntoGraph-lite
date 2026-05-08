import { OntologyModel } from '../model/OntologyModel';
import { FunctionalParser } from './FunctionalParser';
import { ManchesterParser } from './ManchesterParser';
import { TurtleParser } from './TurtleParser';
import { OwlXmlParser } from './OwlXmlParser';

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

    switch (languageId) {
      case 'owl-functional':
        return new FunctionalParser(text, uri).parse();

      case 'manchester':
        return new ManchesterParser(text, uri).parse();

      case 'turtle':
        return new TurtleParser(text, uri).parse();

      case 'owl-xml': {
        const fmt = detectOwlFormat(text);
        if (fmt === 'functional') { return new FunctionalParser(text, uri).parse(); }
        if (fmt === 'owlxml')     { return new OwlXmlParser(text, uri).parse(); }
        if (fmt === 'rdfxml') {
          // RDF/XML is an RDF serialisation — parse as Turtle-equivalent using N3.js
          // N3.js does not natively support RDF/XML; fall back to Turtle with a note.
          throw new Error(
            'RDF/XML (.owl) is not yet supported. ' +
            'Save the file as OWL Functional Syntax (.ofn), Turtle (.ttl), or OWL/XML using Protégé and reopen.'
          );
        }
        throw new Error(`Could not detect OWL serialisation format for: ${uri}`);
      }

      default:
        throw new Error(`No parser registered for language: ${languageId}`);
    }
  }
}
