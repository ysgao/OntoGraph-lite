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
  superClasses?: string[];
  directSubClasses?: string[];
  equivalentClasses?: string[];
  disjointClasses?: string[];
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
  inverseOfIri?: string | undefined;
  equivalentPropertyIris?: string[];
  disjointPropertyIris?: string[];

  // Individual-specific
  classIris?: string[];
  objectPropertyAssertions?: { propertyIri: string; targetIri: string }[];
  dataPropertyAssertions?: { propertyIri: string; value: string; datatype?: string | undefined }[];
}

// Returns top-level named-class IRIs from a flat and-conjunction expression.
// A named-class conjunct is a bare IRI (no spaces); restrictions like
// "propIri some fillerIri" contain spaces and are excluded.
function extractNamedConjuncts(expr: string): string[] {
  let depth = 0;
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') { depth++; continue; }
    if (expr[i] === ')') { depth--; continue; }
    if (depth === 0 && expr.slice(i, i + 5) === ' and ') {
      parts.push(expr.slice(start, i).trim());
      start = i + 5;
      i += 4;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts.filter(p => p.startsWith('http') && !p.includes(' '));
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
    // Superconcepts: explicit SubClassOf axioms + named conjuncts in EquivalentClasses expressions
    const superIriSet = new Set<string>(entity.superClassIris);
    for (const expr of entity.equivalentClassExpressions) {
      for (const iri of extractNamedConjuncts(expr)) {
        superIriSet.add(iri);
      }
    }
    if (superIriSet.size > 0) {
      result.superClasses = [...superIriSet].map(getLocalName);
    }

    if (entity.equivalentClassIris.length > 0) {
      result.equivalentClasses = entity.equivalentClassIris.map(getLocalName);
    }
    if (entity.disjointClassIris.length > 0) {
      result.disjointClasses = entity.disjointClassIris.map(getLocalName);
    }
    if (entity.superClassExpressions.length > 0) {
      result.superClassExpressions = entity.superClassExpressions;
    }
    if (entity.equivalentClassExpressions.length > 0) {
      result.equivalentClassExpressions = entity.equivalentClassExpressions;
    }
    if ('gciExpressions' in entity && entity.gciExpressions.length > 0) {
      result.gciExpressions = entity.gciExpressions;
    }

    // Direct subconcepts: explicit SubClassOf axioms + named conjuncts in EquivalentClasses expressions
    const directSubClasses: string[] = [];
    for (const potentialSub of model.classes.values()) {
      if (potentialSub.iri === entity.iri) continue;
      const viaSubClassOf = potentialSub.superClassIris.includes(entity.iri);
      const viaEquivalent = potentialSub.equivalentClassExpressions.some(
        expr => extractNamedConjuncts(expr).includes(entity.iri)
      );
      if (viaSubClassOf || viaEquivalent) {
        directSubClasses.push(getLocalName(potentialSub.iri));
      }
    }
    if (directSubClasses.length > 0) {
      result.directSubClasses = directSubClasses;
    }
  }

  if ('superPropertyIris' in entity) {
    if (entity.superPropertyIris.length > 0) {
      result.superPropertyIris = entity.superPropertyIris.map(getLocalName);
    }
    if (entity.domainIris.length > 0) {
      result.domainIris = entity.domainIris.map(getLocalName);
    }
    if (entity.rangeIris.length > 0) {
      result.rangeIris = entity.rangeIris.map(getLocalName);
    }
    if (entity.isTransitive) result.isTransitive = entity.isTransitive;
    if (entity.isSymmetric) result.isSymmetric = entity.isSymmetric;
    if (entity.isFunctional) result.isFunctional = entity.isFunctional;

    if (entity.type === 'objectProperty') {
      if (entity.isInverseFunctional) result.isInverseFunctional = entity.isInverseFunctional;
      if (entity.isReflexive) result.isReflexive = entity.isReflexive;
      if (entity.isIrreflexive) result.isIrreflexive = entity.isIrreflexive;
      if (entity.isAsymmetric) result.isAsymmetric = entity.isAsymmetric;
      if (entity.inverseOfIri) {
        result.inverseOfIri = getLocalName(entity.inverseOfIri);
      }
      if (entity.equivalentPropertyIris && entity.equivalentPropertyIris.length > 0) {
        result.equivalentPropertyIris = entity.equivalentPropertyIris.map(getLocalName);
      }
      if (entity.disjointPropertyIris && entity.disjointPropertyIris.length > 0) {
        result.disjointPropertyIris = entity.disjointPropertyIris.map(getLocalName);
      }
    }
  }

  if ('classIris' in entity) {
    result.classIris = entity.classIris.map(getLocalName);
    result.objectPropertyAssertions = entity.objectPropertyAssertions.map(a => ({
      propertyIri: getLocalName(a.propertyIri),
      targetIri: getLocalName(a.targetIri),
    }));
    result.dataPropertyAssertions = entity.dataPropertyAssertions.map(a => ({
      propertyIri: getLocalName(a.propertyIri),
      value: a.value,
      datatype: a.datatype ? getLocalName(a.datatype) : undefined,
    }));
  }

  writeResult(result, command, Date.now() - start);
  return 0;
}
