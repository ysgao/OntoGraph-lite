import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { test, expect } from 'vitest';
import { TurtleParser } from './TurtleParser';
import { RdfXmlParser } from './RdfXmlParser';
import { ManchesterParser } from './ManchesterParser';
import { FunctionalParser } from './FunctionalParser';
import { serializeToFunctional } from '../serializer/FunctionalSerializer';
import { createEmptyModel } from '../model/OntologyModel';

const ROOT = join(__dirname, '../../test-ontologies');
const JAR = join(__dirname, '../../resources/java/onto-reasoner-server.jar');
const JAVA = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', 'java')
  : 'java';

function rpc(requests: object[]): unknown[] {
  const input = requests.map(r => JSON.stringify(r)).join('\n') + '\n';
  const result = spawnSync(JAVA, ['-jar', JAR], {
    input,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error) { throw result.error; }
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return lines.map(l => JSON.parse(l));
}

function getOfn(): string {
  const ttl = readFileSync(join(ROOT, 'animals.ttl'), 'utf8');
  const model = new TurtleParser(ttl, 'file:///animals.ttl').parse();
  return serializeToFunctional(model);
}

// ── Functional Serializer ────────────────────────────────────────────────────

test('Phase3: FunctionalSerializer output', () => {
  const ofn = getOfn();
  console.log('── Functional Serializer ─────────────────────────────────────────');
  expect(ofn, 'Has base prefix declaration').toContain('Prefix(:=');
  expect(ofn, 'Has ontology IRI').toContain('Ontology(<http://example.org/animals>');
  expect(ofn, 'Has class declarations').toContain('Declaration(Class(');
  expect(ofn, 'Has SubClassOf for Koala').toContain('SubClassOf(<http://example.org/animals#Koala>');
  expect(ofn, 'Has DisjointClasses').toContain('DisjointClasses(');
  expect(ofn, 'Has TransitiveObjectProperty').toContain('TransitiveObjectProperty(');
  expect(ofn, 'Has ClassAssertion for individual').toContain('ClassAssertion(');
});

// ── Reasoner ping ────────────────────────────────────────────────────────────

test('Phase3: reasoner server ping', { timeout: 30_000 }, () => {
  console.log('── Reasoner server ──────────────────────────────────────────────');
  const [r] = rpc([{ id: 1, method: 'ping', params: {} }]) as { id: number; result: { pong: boolean } }[];
  expect(r?.result?.pong, 'ping returns pong').toBe(true);
});

// ── HermiT classify ──────────────────────────────────────────────────────────

test('Phase3: HermiT classify (animals.ttl)', { timeout: 60_000 }, () => {
  const ofn = getOfn();
  console.log('── HermiT classify (animals.ttl) ────────────────────────────────');
  const [r] = rpc([{ id: 2, method: 'classify', params: { format: 'functional', content: ofn, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean; incoherentClasses: string[]; hierarchy: string[][] };
  }[];

  expect(r.result.consistent, 'HermiT: ontology is consistent').toBe(true);
  expect(r.result.incoherentClasses.length, 'HermiT: no incoherent classes').toBe(0);
  expect(r.result.hierarchy.length, `HermiT: >= 9 inferred edges (got ${r.result.hierarchy.length})`).toBeGreaterThanOrEqual(9);

  const koalaIri = 'http://example.org/animals#Koala';
  const marsupialIri = 'http://example.org/animals#Marsupial';
  const koalaEdge = r.result.hierarchy.find(([, c]) => c === koalaIri);
  expect(koalaEdge?.[0], 'HermiT: Koala inferred under Marsupial').toBe(marsupialIri);

  const thingChildren = r.result.hierarchy
    .filter(([p]) => p === 'http://www.w3.org/2002/07/owl#Thing')
    .map(([, c]) => c);
  expect(thingChildren, 'HermiT: Animal under owl:Thing').toContain('http://example.org/animals#Animal');
});

// ── ELK classify ─────────────────────────────────────────────────────────────

test('Phase3: ELK classify (animals.ttl)', { timeout: 60_000 }, () => {
  const ofn = getOfn();
  console.log('── ELK classify (animals.ttl) ────────────────────────────────────');
  const [r] = rpc([{ id: 3, method: 'classify', params: { format: 'functional', content: ofn, engine: 'elk' } }]) as {
    id: number;
    result: { consistent: boolean; hierarchy: string[][] };
  }[];

  expect(r.result.consistent, 'ELK: ontology is consistent').toBe(true);
  expect(r.result.hierarchy.length, `ELK: >= 9 inferred edges (got ${r.result.hierarchy.length})`).toBeGreaterThanOrEqual(9);
});

// ── checkConsistency ──────────────────────────────────────────────────────────

test('Phase3: checkConsistency', { timeout: 30_000 }, () => {
  const ofn = getOfn();
  console.log('── checkConsistency ─────────────────────────────────────────────');
  const [r] = rpc([{ id: 4, method: 'checkConsistency', params: { format: 'functional', content: ofn, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean };
  }[];
  expect(r.result.consistent, 'checkConsistency: animals is consistent').toBe(true);
});

// ── convertFormat ─────────────────────────────────────────────────────────────

test('Phase3: convertFormat', { timeout: 30_000 }, () => {
  const ofn = getOfn();
  console.log('── convertFormat ────────────────────────────────────────────────');
  const [r] = rpc([{ id: 5, method: 'convertFormat', params: { content: ofn, fromFormat: 'functional', toFormat: 'owl-xml' } }]) as {
    id: number;
    result: { output: string };
  }[];
  expect(typeof r.result.output === 'string' && r.result.output.length > 100, 'convertFormat: returns OWL/XML string').toBe(true);
  expect(r.result.output, 'convertFormat: output contains <Ontology>').toContain('<Ontology');
});

// ── HermiT classify pizza.owl — MeatyPizza inferred hierarchy ─────────────────

const PIZZA_NS = 'http://www.co-ode.org/ontologies/pizza/pizza.owl#';

const EXPECTED_MEATY_SUBCONCEPTS = [
  'American',
  'AmericanHot',
  'Capricciosa',
  'FourSeasons',
  'LaReine',
  'Parmense',
  'PolloAdAstra',
  'Siciliana',
  'SloppyGiuseppe',
].map(name => `${PIZZA_NS}${name}`);

test('Phase3: HermiT classify pizza.owl — MeatyPizza has 9 inferred subconcepts', { timeout: 120_000 }, () => {
  const owl = readFileSync(join(ROOT, 'pizza.owl'), 'utf8');

  console.log('── HermiT classify pizza.owl ─────────────────────────────────────');

  const [r] = rpc([{ id: 6, method: 'classify', params: { format: 'rdf-xml', content: owl, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean; incoherentClasses: string[]; hierarchy: string[][] };
  }[];

  expect(r.result.consistent, 'pizza ontology is consistent').toBe(true);
  // IceCream and CheeseyVegetableTopping are intentionally incoherent in the pizza ontology
  const incoherentNames = r.result.incoherentClasses.map((c: string) => c.split('#')[1]).sort();
  expect(incoherentNames, 'pizza has 2 known incoherent classes').toEqual(['CheeseyVegetableTopping', 'IceCream']);

  const meatyPizzaIri = `${PIZZA_NS}MeatyPizza`;
  const meatySubconcepts = r.result.hierarchy
    .filter(([parent]) => parent === meatyPizzaIri)
    .map(([, child]) => child);

  expect(meatySubconcepts.length, `MeatyPizza has 9 inferred subconcepts (got ${meatySubconcepts.length})`).toBe(9);

  for (const iri of EXPECTED_MEATY_SUBCONCEPTS) {
    expect(meatySubconcepts, `${iri.split('#')[1]} inferred under MeatyPizza`).toContain(iri);
  }
});

// ── inferredSubClasses model population ──────────────────────────────────────

test('Phase3: inferred hierarchy populates model.inferredSubClasses — MeatyPizza has 9 subconcepts', { timeout: 120_000 }, () => {
  const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

  // Parse pizza.owl into an OntologyModel
  const owl = readFileSync(join(ROOT, 'pizza.owl'), 'utf8');
  const model = new RdfXmlParser(owl, 'file:///pizza.owl').parse();

  console.log('── model.inferredSubClasses (pizza.owl) ──────────────────────────');

  // Classify via the Java reasoner
  const [r] = rpc([{ id: 7, method: 'classify', params: { format: 'rdf-xml', content: owl, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean; incoherentClasses: string[]; hierarchy: string[][] };
  }[];

  // Populate inferredSubClasses the same way classifyOntology.ts does
  model.inferredSubClasses.clear();
  for (const [parentIri, childIri] of r.result.hierarchy) {
    let children = model.inferredSubClasses.get(parentIri);
    if (!children) {
      children = new Set<string>();
      model.inferredSubClasses.set(parentIri, children);
    }
    children.add(childIri);
  }
  if (!model.inferredSubClasses.has(OWL_THING)) {
    model.inferredSubClasses.set(OWL_THING, new Set());
  }
  model.isClassified = true;

  expect(model.isClassified, 'model is marked classified').toBe(true);

  const meatyPizzaIri = `${PIZZA_NS}MeatyPizza`;
  const meatyChildren = model.inferredSubClasses.get(meatyPizzaIri);

  expect(meatyChildren, 'MeatyPizza entry exists in inferredSubClasses').toBeDefined();
  expect(meatyChildren!.size, `MeatyPizza has 9 inferred subconcepts (got ${meatyChildren!.size})`).toBe(9);

  for (const iri of EXPECTED_MEATY_SUBCONCEPTS) {
    expect([...meatyChildren!], `${iri.split('#')[1]} is a subconcept of MeatyPizza`).toContain(iri);
  }
});

// ── ELK classify pizza.owl — MeatyPizza inferred hierarchy ───────────────────

test('Phase3: ELK classify pizza.owl — MeatyPizza has 9 inferred subconcepts', { timeout: 120_000 }, () => {
  const owl = readFileSync(join(ROOT, 'pizza.owl'), 'utf8');

  console.log('── ELK classify pizza.owl ────────────────────────────────────────');

  const [r] = rpc([{ id: 8, method: 'classify', params: { format: 'rdf-xml', content: owl, engine: 'elk' } }]) as {
    id: number;
    result: { consistent: boolean; incoherentClasses: string[]; hierarchy: string[][] };
  }[];

  expect(r.result.consistent, 'ELK: pizza ontology is consistent').toBe(true);

  const meatyPizzaIri = `${PIZZA_NS}MeatyPizza`;
  const meatySubconcepts = r.result.hierarchy
    .filter(([parent]) => parent === meatyPizzaIri)
    .map(([, child]) => child);

  expect(meatySubconcepts.length, `ELK: MeatyPizza has 9 inferred subconcepts (got ${meatySubconcepts.length})`).toBe(9);

  for (const iri of EXPECTED_MEATY_SUBCONCEPTS) {
    expect(meatySubconcepts, `ELK: ${iri.split('#')[1]} inferred under MeatyPizza`).toContain(iri);
  }
});

// ── Manchester syntax — raw passes complex expressions to the reasoner ────────

test('Phase3: HermiT classify animals.omn — raw Manchester preserves complex expressions', { timeout: 60_000 }, () => {
  const omn = readFileSync(join(ROOT, 'animals.omn'), 'utf8');

  console.log('── HermiT classify animals.omn (raw Manchester) ──────────────────');

  const [raw] = rpc([{ id: 9,  method: 'classify', params: { format: 'manchester', content: omn,                                        engine: 'hermit' } }]) as { id: number; result: { consistent: boolean; hierarchy: string[][] } }[];
  const [ser] = rpc([{ id: 10, method: 'classify', params: { format: 'functional', content: serializeToFunctional(new ManchesterParser(omn, 'file:///animals.omn').parse()), engine: 'hermit' } }]) as { id: number; result: { consistent: boolean; hierarchy: string[][] } }[];

  expect(raw.result.consistent, 'animals.omn is consistent').toBe(true);

  // Raw Manchester must produce at least as many inferred edges as re-serialized
  // functional (which drops complex expressions like hasHabitat some Forest).
  expect(raw.result.hierarchy.length, `raw Manchester edges (${raw.result.hierarchy.length}) >= re-serialized (${ser.result.hierarchy.length})`).toBeGreaterThanOrEqual(ser.result.hierarchy.length);

  const koalaIri    = 'http://example.org/animals#Koala';
  const marsupialIri = 'http://example.org/animals#Marsupial';
  const koalaEdge = raw.result.hierarchy.find(([, c]) => c === koalaIri);
  expect(koalaEdge?.[0], 'Koala inferred under Marsupial').toBe(marsupialIri);
});

// ── Functional syntax — raw preserves complex expressions ────────────────────

test('Phase3: HermiT classify bfo-core.ofn — raw functional preserves complex expressions', { timeout: 60_000 }, () => {
  const ofn = readFileSync(join(ROOT, 'bfo-core.ofn'), 'utf8');

  console.log('── HermiT classify bfo-core.ofn (raw functional) ────────────────');

  const [raw] = rpc([{ id: 11, method: 'classify', params: { format: 'functional', content: ofn,                                       engine: 'hermit' } }]) as { id: number; result: { consistent: boolean; hierarchy: string[][] } }[];
  const [ser] = rpc([{ id: 12, method: 'classify', params: { format: 'functional', content: serializeToFunctional(new FunctionalParser(ofn, 'file:///bfo-core.ofn').parse()), engine: 'hermit' } }]) as { id: number; result: { consistent: boolean; hierarchy: string[][] } }[];

  expect(raw.result.consistent, 'bfo-core.ofn is consistent').toBe(true);

  // Raw functional must produce at least as many edges as re-serialized.
  expect(raw.result.hierarchy.length, `raw functional edges (${raw.result.hierarchy.length}) >= re-serialized (${ser.result.hierarchy.length})`).toBeGreaterThanOrEqual(ser.result.hierarchy.length);

  // Spot-check a known BFO hierarchy edge
  const continuantIri        = 'http://purl.obolibrary.org/obo/BFO_0000002';
  const indContinuantIri     = 'http://purl.obolibrary.org/obo/BFO_0000004';
  const edge = raw.result.hierarchy.find(([p, c]) => p === continuantIri && c === indContinuantIri);
  expect(edge, 'independent continuant inferred under continuant').toBeDefined();
});
