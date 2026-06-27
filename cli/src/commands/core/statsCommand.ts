import fs from 'fs';
import path from 'path';
import { ParserRegistry } from '@core/parser/ParserRegistry';
import { OntologyIndex } from '@core/model/OntologyIndex';
import { writeResult, writeError, exitCode } from '../../output';

export interface StatsResult {
  filePath: string;
  format: string;
  ontologyIri: string | null;
  versionIri: string | null;
  imports: string[];

  // Entity counts
  classCount: number;
  objectPropertyCount: number;
  dataPropertyCount: number;
  annotationPropertyCount: number;
  individualCount: number;
  totalEntities: number;

  // Class hierarchy stats
  classHierarchyDepth: number;
  classHierarchyBreadth: number;
  orphanClassCount: number;
  equivalentClassGroups: number;

  // Property stats
  objectPropertiesWithDomain: number;
  objectPropertiesWithRange: number;
  objectPropertiesWithCharacteristics: number;
  dataPropertiesWithDomain: number;
  dataPropertiesWithRange: number;

  // Individual stats
  individualsWithTypes: number;
  individualsWithObjectAssertions: number;
  individualsWithDataAssertions: number;

  // Axiom counts
  subClassOfAxioms: number;
  equivalentClassAxioms: number;
  disjointClassAxioms: number;
  subPropertyOfAxioms: number;
  propertyDomainAxioms: number;
  propertyRangeAxioms: number;
  inverseOfAxioms: number;

  // Annotation stats
  annotationCount: number;
  labelCount: number;
  commentCount: number;
  uniqueAnnotationProperties: number;
}

function calculateClassHierarchyStats(model: any): {
  depth: number;
  breadth: number;
  orphans: number;
  equivalentGroups: number;
} {
  const classes = model.classes;
  const classIris = new Set(classes.keys());

  // Calculate depth: longest path from root to leaf
  let maxDepth = 0;
  const depthCache = new Map<string, number>();

  const getDepth = (iri: string, visited = new Set<string>()): number => {
    if (depthCache.has(iri)) return depthCache.get(iri)!;
    if (visited.has(iri)) return 0; // cycle detection

    const cls = classes.get(iri);
    if (!cls || cls.superClassIris.length === 0) {
      depthCache.set(iri, 0);
      return 0;
    }

    visited.add(iri);
    let depth = 0;
    for (const superIri of cls.superClassIris) {
      if (classIris.has(superIri)) {
        depth = Math.max(depth, 1 + getDepth(superIri, new Set(visited)));
      }
    }
    visited.delete(iri);
    depthCache.set(iri, depth);
    return depth;
  };

  for (const iri of classIris) {
    maxDepth = Math.max(maxDepth, getDepth(iri));
  }

  // Calculate breadth: max number of direct children for any class
  const childCount = new Map<string, number>();
  for (const cls of classes.values()) {
    for (const superIri of cls.superClassIris) {
      childCount.set(superIri, (childCount.get(superIri) || 0) + 1);
    }
  }
  const maxBreadth = childCount.size > 0 ? Math.max(...childCount.values()) : 0;

  // Count orphan classes (no superclasses and no subclasses)
  let orphans = 0;
  for (const cls of classes.values()) {
    const hasSuper = cls.superClassIris.length > 0;
    const hasSub = childCount.get(cls.iri) !== undefined;
    if (!hasSuper && !hasSub) orphans++;
  }

  // Count equivalent class groups (sets of mutually equivalent classes)
  const visited = new Set<string>();
  let equivalentGroups = 0;
  for (const cls of classes.values()) {
    if (!visited.has(cls.iri) && cls.equivalentClassIris.length > 0) {
      equivalentGroups++;
      visited.add(cls.iri);
      for (const eqIri of cls.equivalentClassIris) {
        visited.add(eqIri);
      }
    }
  }

  return { depth: maxDepth, breadth: maxBreadth, orphans, equivalentGroups };
}

function calculateAnnotationStats(model: any): {
  count: number;
  labels: number;
  comments: number;
  uniqueProperties: number;
} {
  const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
  const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

  let count = 0;
  let labels = 0;
  let comments = 0;
  const annotationProps = new Set<string>();

  for (const entity of [
    ...model.classes.values(),
    ...model.objectProperties.values(),
    ...model.dataProperties.values(),
    ...model.annotationProperties.values(),
    ...model.individuals.values(),
  ]) {
    // Count labels
    if (entity.labels) {
      for (const labelArray of Object.values(entity.labels)) {
        labels += (labelArray as string[]).length;
      }
    }

    // Count annotations
    if (entity.annotations) {
      for (const [propIri, values] of Object.entries(entity.annotations)) {
        const valueArray = values as string[];
        count += valueArray.length;
        annotationProps.add(propIri);

        if (propIri === RDFS_COMMENT) {
          comments += valueArray.length;
        }
      }
    }
  }

  return { count, labels, comments, uniqueProperties: annotationProps.size };
}

export async function runStats(file: string, _timeout: number): Promise<number> {
  const start = Date.now();
  const command = 'stats';
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

  // Calculate class hierarchy stats
  const hierarchyStats = calculateClassHierarchyStats(model);

  // Calculate annotation stats
  const annotationStats = calculateAnnotationStats(model);

  // Count axioms
  let subClassOfAxioms = 0;
  let equivalentClassAxioms = 0;
  let disjointClassAxioms = 0;
  let propertyDomainAxioms = 0;
  let propertyRangeAxioms = 0;
  let subPropertyOfAxioms = 0;
  let inverseOfAxioms = 0;

  for (const cls of model.classes.values()) {
    subClassOfAxioms += cls.superClassIris.length;
    equivalentClassAxioms += cls.equivalentClassIris.length;
    disjointClassAxioms += cls.disjointClassIris.length;
  }

  for (const prop of [
    ...model.objectProperties.values(),
    ...model.dataProperties.values(),
  ]) {
    propertyDomainAxioms += prop.domainIris.length;
    propertyRangeAxioms += prop.rangeIris.length;
    subPropertyOfAxioms += prop.superPropertyIris.length;
  }

  for (const prop of model.objectProperties.values()) {
    if (prop.inverseOfIri) inverseOfAxioms++;
  }

  // Count individuals with assertions
  let individualsWithTypes = 0;
  let individualsWithObjectAssertions = 0;
  let individualsWithDataAssertions = 0;
  for (const ind of model.individuals.values()) {
    if (ind.classIris.length > 0) individualsWithTypes++;
    if (ind.objectPropertyAssertions.length > 0) individualsWithObjectAssertions++;
    if (ind.dataPropertyAssertions.length > 0) individualsWithDataAssertions++;
  }

  // Count properties with characteristics
  let objectPropertiesWithCharacteristics = 0;
  for (const prop of model.objectProperties.values()) {
    if (
      prop.isTransitive ||
      prop.isSymmetric ||
      prop.isFunctional ||
      prop.isInverseFunctional ||
      prop.isReflexive ||
      prop.isIrreflexive ||
      prop.isAsymmetric
    ) {
      objectPropertiesWithCharacteristics++;
    }
  }

  const result: StatsResult = {
    filePath: absPath,
    format: model.sourceFormat as string,
    ontologyIri: model.metadata.iri ?? null,
    versionIri: model.metadata.versionIri ?? null,
    imports: model.metadata.imports,

    classCount: model.classes.size,
    objectPropertyCount: model.objectProperties.size,
    dataPropertyCount: model.dataProperties.size,
    annotationPropertyCount: model.annotationProperties.size,
    individualCount: model.individuals.size,
    totalEntities:
      model.classes.size +
      model.objectProperties.size +
      model.dataProperties.size +
      model.annotationProperties.size +
      model.individuals.size,

    classHierarchyDepth: hierarchyStats.depth,
    classHierarchyBreadth: hierarchyStats.breadth,
    orphanClassCount: hierarchyStats.orphans,
    equivalentClassGroups: hierarchyStats.equivalentGroups,

    objectPropertiesWithDomain: [
      ...model.objectProperties.values(),
    ].filter((p: any) => p.domainIris.length > 0).length,
    objectPropertiesWithRange: [
      ...model.objectProperties.values(),
    ].filter((p: any) => p.rangeIris.length > 0).length,
    objectPropertiesWithCharacteristics,
    dataPropertiesWithDomain: [
      ...model.dataProperties.values(),
    ].filter((p: any) => p.domainIris.length > 0).length,
    dataPropertiesWithRange: [
      ...model.dataProperties.values(),
    ].filter((p: any) => p.rangeIris.length > 0).length,

    individualsWithTypes,
    individualsWithObjectAssertions,
    individualsWithDataAssertions,

    subClassOfAxioms,
    equivalentClassAxioms,
    disjointClassAxioms,
    subPropertyOfAxioms,
    propertyDomainAxioms,
    propertyRangeAxioms,
    inverseOfAxioms,

    annotationCount: annotationStats.count,
    labelCount: annotationStats.labels,
    commentCount: annotationStats.comments,
    uniqueAnnotationProperties: annotationStats.uniqueProperties,
  };

  writeResult(result, command, Date.now() - start);
  return 0;
}
