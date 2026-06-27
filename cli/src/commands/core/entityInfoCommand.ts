import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { OntologyIndex } from '@core/model/OntologyIndex';
import { OWLEntityUnion } from '@core/model/OntologyModel';
import { writeResult, writeError, exitCode } from '../../output';

export interface EntityInfoResult {
  iri: string;
  type: 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';
  localName: string;
  labels: Record<string, string[]>;
  annotations: Record<string, string[]>;

  // Class-specific
  superClassIris?: string[];
  equivalentClassIris?: string[];
  disjointClassIris?: string[];
  superClassExpressions?: string[];
  equivalentClassExpressions?: string[];
  gciExpressions?: string[];

  // Property-specific
  superPropertyIris?: string[];
  domainIris?: string[];
  rangeIris?: string[];
  isTransitive?: boolean;
  isSymmetric?: boolean;
  isFunctional?: boolean;

  // ObjectProperty-specific
  isInverseFunctional?: boolean;
  isReflexive?: boolean;
  isIrreflexive?: boolean;
  isAsymmetric?: boolean;
  inverseOfIri?: string;
  equivalentPropertyIris?: string[];
  disjointPropertyIris?: string[];

  // Individual-specific
  classIris?: string[];
  objectPropertyAssertions?: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions?: { propertyIri: string; value: string; datatype?: string }[];
}

function getLocalName(iri: string): string {
  let sep = -1;
  for (let j = iri.length - 1; j >= 0; j--) {
    const c = iri.charCodeAt(j);
    if (c === 35 /* # */ || c === 47 /* / */) {
      sep = j;
      break;
    }
  }
  return sep >= 0 ? iri.slice(sep + 1) : iri;
}

export async function runEntityInfo(file: string, entityIri: string, _timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'entity-info';
  const absPath = path.resolve(file);

  if (!fs.existsSync(absPath)) {
    writeError('FILE_NOT_FOUND', `File not found: ${absPath}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let text: string;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeError('FILE_NOT_FOUND', `Cannot read file: ${msg}`, command, Date.now() - start);
    return exitCode('FILE_NOT_FOUND');
  }

  let model;
  try {
    model = ParserRegistry.parse(text, 'auto', absPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeError('PARSE_ERROR', `Parse failed: ${msg}`, command, Date.now() - start);
    return exitCode('PARSE_ERROR');
  }

  // Find entity by IRI (exact match)
  let entity: OWLEntityUnion | undefined = model.classes.get(entityIri) ||
    model.objectProperties.get(entityIri) ||
    model.dataProperties.get(entityIri) ||
    model.annotationProperties.get(entityIri) ||
    model.individuals.get(entityIri);

  if (!entity) {
    writeError('NOT_FOUND', `Entity not found: ${entityIri}`, command, Date.now() - start);
    return exitCode('NOT_FOUND');
  }

  const result: EntityInfoResult = {
    iri: entity.iri,
    type: entity.type,
    localName: getLocalName(entity.iri),
    labels: entity.labels,
    annotations: entity.annotations,
  };

  // Add type-specific fields
  if ('superClassIris' in entity) {
    result.superClassIris = entity.superClassIris;
    result.equivalentClassIris = entity.equivalentClassIris;
    result.disjointClassIris = entity.disjointClassIris;
    result.superClassExpressions = entity.superClassExpressions;
    result.equivalentClassExpressions = entity.equivalentClassExpressions;
    if ('gciExpressions' in entity) {
      result.gciExpressions = entity.gciExpressions;
    }
  }

  if ('superPropertyIris' in entity) {
    result.superPropertyIris = entity.superPropertyIris;
    result.domainIris = entity.domainIris;
    result.rangeIris = entity.rangeIris;
    result.isTransitive = entity.isTransitive;
    result.isSymmetric = entity.isSymmetric;
    result.isFunctional = entity.isFunctional;

    if ('isInverseFunctional' in entity) {
      result.isInverseFunctional = entity.isInverseFunctional;
      result.isReflexive = entity.isReflexive;
      result.isIrreflexive = entity.isIrreflexive;
      result.isAsymmetric = entity.isAsymmetric;
      result.inverseOfIri = entity.inverseOfIri;
      result.equivalentPropertyIris = entity.equivalentPropertyIris;
      result.disjointPropertyIris = entity.disjointPropertyIris;
    }
  }

  if ('classIris' in entity) {
    result.classIris = entity.classIris;
    result.objectPropertyAssertions = entity.objectPropertyAssertions;
    result.dataPropertyAssertions = entity.dataPropertyAssertions;
  }

  writeResult(result, command, Date.now() - start);
  return 0;
}
