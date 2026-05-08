import type { OntologyModel } from '../model/OntologyModel';

const OWL = 'http://www.w3.org/2002/07/owl#';
const OWL_THING = `${OWL}Thing`;
const OWL_NOTHING = `${OWL}Nothing`;

function iri(s: string): string { return `<${s}>`; }

function literal(value: string, lang?: string, datatype?: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (lang) { return `"${escaped}"@${lang}`; }
  if (datatype) { return `"${escaped}"^^<${datatype}>`; }
  return `"${escaped}"`;
}

/**
 * Serialize an OntologyModel to OWL Functional Syntax (.ofn).
 * Complex class expressions stored as Manchester strings are omitted — the
 * asserted named-class hierarchy is sufficient for reasoner classification.
 */
export function serializeToFunctional(model: OntologyModel): string {
  const out: string[] = [];

  // Prefixes
  const ontIri = model.metadata.iri ?? 'http://example.org/ontology';
  out.push(`Prefix(:=<${ontIri}#>)`);
  out.push(`Prefix(owl:=<${OWL}>)`);
  out.push(`Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)`);
  out.push(`Prefix(rdf:=<http://www.w3.org/1999/02/22-rdf-syntax-ns#>)`);
  out.push(`Prefix(xsd:=<http://www.w3.org/2001/XMLSchema#>)`);
  out.push('');

  // Ontology header
  const header = model.metadata.versionIri
    ? `${iri(ontIri)}\n  ${iri(model.metadata.versionIri)}`
    : iri(ontIri);
  out.push(`Ontology(${header}`);

  // Imports
  for (const imp of model.metadata.imports) {
    out.push(`  Import(${iri(imp)})`);
  }

  // Declarations
  for (const cls of model.classes.values()) {
    out.push(`  Declaration(Class(${iri(cls.iri)}))`);
  }
  for (const p of model.objectProperties.values()) {
    out.push(`  Declaration(ObjectProperty(${iri(p.iri)}))`);
  }
  for (const p of model.dataProperties.values()) {
    out.push(`  Declaration(DataProperty(${iri(p.iri)}))`);
  }
  for (const p of model.annotationProperties.values()) {
    out.push(`  Declaration(AnnotationProperty(${iri(p.iri)}))`);
  }
  for (const ind of model.individuals.values()) {
    out.push(`  Declaration(NamedIndividual(${iri(ind.iri)}))`);
  }

  // Class axioms
  for (const cls of model.classes.values()) {
    for (const sup of cls.superClassIris) {
      if (sup === OWL_THING) { continue; }
      out.push(`  SubClassOf(${iri(cls.iri)} ${iri(sup)})`);
    }
    if (cls.equivalentClassIris.length > 0) {
      out.push(`  EquivalentClasses(${[cls.iri, ...cls.equivalentClassIris].map(iri).join(' ')})`);
    }
    for (const dis of cls.disjointClassIris) {
      // Emit only when iri < dis to avoid duplicate pairs
      if (cls.iri < dis) {
        out.push(`  DisjointClasses(${iri(cls.iri)} ${iri(dis)})`);
      }
    }
  }

  // Object property axioms
  for (const p of model.objectProperties.values()) {
    for (const sup of p.superPropertyIris) {
      out.push(`  SubObjectPropertyOf(${iri(p.iri)} ${iri(sup)})`);
    }
    for (const d of p.domainIris) {
      out.push(`  ObjectPropertyDomain(${iri(p.iri)} ${iri(d)})`);
    }
    for (const r of p.rangeIris) {
      out.push(`  ObjectPropertyRange(${iri(p.iri)} ${iri(r)})`);
    }
    if (p.isTransitive)          { out.push(`  TransitiveObjectProperty(${iri(p.iri)})`); }
    if (p.isSymmetric)           { out.push(`  SymmetricObjectProperty(${iri(p.iri)})`); }
    if (p.isFunctional)          { out.push(`  FunctionalObjectProperty(${iri(p.iri)})`); }
    if (p.isInverseFunctional)   { out.push(`  InverseFunctionalObjectProperty(${iri(p.iri)})`); }
    if (p.inverseOfIri)          { out.push(`  InverseObjectProperties(${iri(p.iri)} ${iri(p.inverseOfIri)})`); }
  }

  // Data property axioms
  for (const p of model.dataProperties.values()) {
    for (const sup of p.superPropertyIris) {
      out.push(`  SubDataPropertyOf(${iri(p.iri)} ${iri(sup)})`);
    }
    for (const d of p.domainIris) {
      out.push(`  DataPropertyDomain(${iri(p.iri)} ${iri(d)})`);
    }
    for (const r of p.rangeIris) {
      out.push(`  DataPropertyRange(${iri(p.iri)} ${iri(r)})`);
    }
    if (p.isFunctional) { out.push(`  FunctionalDataProperty(${iri(p.iri)})`); }
  }

  // Individual axioms
  for (const ind of model.individuals.values()) {
    for (const cls of ind.classIris) {
      out.push(`  ClassAssertion(${iri(cls)} ${iri(ind.iri)})`);
    }
    for (const a of ind.objectPropertyAssertions) {
      out.push(`  ObjectPropertyAssertion(${iri(a.propertyIri)} ${iri(ind.iri)} ${iri(a.targetIri)})`);
    }
    for (const a of ind.dataPropertyAssertions) {
      out.push(`  DataPropertyAssertion(${iri(a.propertyIri)} ${iri(ind.iri)} ${literal(a.value, undefined, a.datatype)})`);
    }
  }

  // Annotation assertions (rdfs:label)
  const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
  for (const entity of [
    ...model.classes.values(),
    ...model.objectProperties.values(),
    ...model.dataProperties.values(),
    ...model.annotationProperties.values(),
    ...model.individuals.values(),
  ]) {
    for (const [lang, values] of Object.entries(entity.labels)) {
      for (const val of values) {
        out.push(`  AnnotationAssertion(${iri(RDFS_LABEL)} ${iri(entity.iri)} ${literal(val, lang || undefined)})`);
      }
    }
  }

  // Suppress owl:Nothing and owl:Thing declarations (OWLAPI adds them implicitly)
  out.push(')');
  return out.join('\n');
}

/** Detect the source format from sourceUri for the bridge format parameter */
export function detectFormat(sourceUri: string): string {
  const lower = sourceUri.toLowerCase();
  if (lower.endsWith('.ofn') || lower.endsWith('.owf')) { return 'functional'; }
  if (lower.endsWith('.omn')) { return 'manchester'; }
  if (lower.endsWith('.ttl')) { return 'turtle'; }
  if (lower.endsWith('.rdf')) { return 'rdf-xml'; }
  return 'functional'; // default: send as functional syntax
}
