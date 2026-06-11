import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { serializeToFunctional } from '@core/serializer/FunctionalSerializer';
import { writeResult, writeError, exitCode } from '../../output';

export interface ConvertResult {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  entityCount: number;
}

const FORMAT_EXT: Record<string, string> = {
  functional: '.ofn',
  manchester: '.omn',
  turtle: '.ttl',
  owlxml: '.owl',
};

export async function runConvert(
  file: string,
  to: string,
  outPath: string | undefined,
  _timeout: number,
): Promise<number> {
  const start = Date.now();
  const command = 'convert';
  const absInput = path.resolve(file);

  if (!FORMAT_EXT[to]) {
    writeError('UNSUPPORTED_FORMAT', `Unsupported target format: ${to}. Supported: ${Object.keys(FORMAT_EXT).join(', ')}`, command, Date.now() - start);
    return exitCode('UNSUPPORTED_FORMAT');
  }

  if (!fs.existsSync(absInput)) {
    writeError('FILE_NOT_FOUND', `File not found: ${absInput}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let text: string;
  try { text = fs.readFileSync(absInput, 'utf8'); }
  catch (err: unknown) {
    writeError('FILE_NOT_FOUND', `Cannot read file: ${err instanceof Error ? err.message : String(err)}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let model;
  try { model = ParserRegistry.parse(text, 'auto', absInput); }
  catch (err: unknown) {
    writeError('PARSE_ERROR', `Parse failed: ${err instanceof Error ? err.message : String(err)}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  const ext = FORMAT_EXT[to];
  const defaultOut = path.join(path.dirname(absInput), path.basename(absInput, path.extname(absInput)) + ext);
  const absOutput = outPath ? path.resolve(outPath) : defaultOut;

  let serialized: string;
  try {
    if (to === 'functional') {
      serialized = serializeToFunctional(model);
    } else if (to === 'turtle') {
      serialized = await serializeToTurtle(model);
    } else {
      writeError('UNSUPPORTED_FORMAT', `Format '${to}' is recognized but not yet serializable. Use 'functional' or 'turtle'.`, command, Date.now() - start);
      return exitCode('UNSUPPORTED_FORMAT');
    }
  } catch (err: unknown) {
    writeError('PARSE_ERROR', `Serialization failed: ${err instanceof Error ? err.message : String(err)}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  fs.writeFileSync(absOutput, serialized, 'utf8');

  const entityCount = model.classes.size + model.objectProperties.size + model.dataProperties.size +
    model.annotationProperties.size + model.individuals.size;

  writeResult<ConvertResult>({
    inputPath: absInput,
    outputPath: absOutput,
    inputFormat: model.sourceFormat,
    outputFormat: to,
    entityCount,
  }, command, Date.now() - start);
  return 0;
}

async function serializeToTurtle(model: import('@core/model/OntologyModel').OntologyModel): Promise<string> {
  const { Writer, DataFactory } = await import('n3');
  const { namedNode, literal, quad } = DataFactory;
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'Turtle' });

    // Ontology declaration
    if (model.metadata.iri) {
      writer.addQuad(quad(namedNode(model.metadata.iri), namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)));
    }

    for (const cls of model.classes.values()) {
      const subj = namedNode(cls.iri);
      writer.addQuad(quad(subj, namedNode(`${RDF}type`), namedNode(`${OWL}Class`)));
      for (const [lang, vals] of Object.entries(cls.labels)) {
        for (const val of vals) {
          writer.addQuad(quad(subj, namedNode(`${RDFS}label`), literal(val, lang || undefined)));
        }
      }
      for (const superIri of cls.superClassIris) {
        writer.addQuad(quad(subj, namedNode(`${RDFS}subClassOf`), namedNode(superIri)));
      }
    }

    writer.end((err, result) => {
      if (err) { reject(err); } else { resolve(result); }
    });
  });
}
