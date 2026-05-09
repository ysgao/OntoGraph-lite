import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { test, expect } from 'vitest';
import { TurtleParser } from './TurtleParser';
import { serializeToFunctional } from '../serializer/FunctionalSerializer';

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
