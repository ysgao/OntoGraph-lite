import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { TurtleParser } from './TurtleParser';
import { serializeToFunctional } from '../serializer/FunctionalSerializer';

const ROOT = join(__dirname, '../../test-ontologies');
const JAR = join(__dirname, '../../resources/java/onto-reasoner-server.jar');
const JAVA = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', 'java')
  : 'java';

let pass = true;
function check(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else      { console.error(`  ✗ FAIL: ${msg}`); pass = false; }
}

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

// ── Functional Serializer ────────────────────────────────────────────────────
console.log('── Functional Serializer ─────────────────────────────────────────');
const ttl = readFileSync(join(ROOT, 'animals.ttl'), 'utf8');
const model = new TurtleParser(ttl, 'file:///animals.ttl').parse();
const ofn = serializeToFunctional(model);

check(ofn.includes('Prefix(:='), 'Has base prefix declaration');
check(ofn.includes('Ontology(<http://example.org/animals>'), 'Has ontology IRI');
check(ofn.includes('Declaration(Class('), 'Has class declarations');
check(ofn.includes('SubClassOf(<http://example.org/animals#Koala>'), 'Has SubClassOf for Koala');
check(ofn.includes('DisjointClasses('), 'Has DisjointClasses');
check(ofn.includes('TransitiveObjectProperty('), 'Has TransitiveObjectProperty');
check(ofn.includes('ClassAssertion('), 'Has ClassAssertion for individual');

// ── Reasoner ping ────────────────────────────────────────────────────────────
console.log('\n── Reasoner server ──────────────────────────────────────────────');
let pingResult: { id: number; result: { pong: boolean } } | undefined;
try {
  const [r] = rpc([{ id: 1, method: 'ping', params: {} }]) as typeof pingResult[];
  pingResult = r;
  check(pingResult?.result?.pong === true, 'ping returns pong');
} catch (e) {
  check(false, `ping failed: ${e}`);
}

// ── HermiT classify ──────────────────────────────────────────────────────────
console.log('\n── HermiT classify (animals.ttl) ────────────────────────────────');
try {
  const [r] = rpc([{ id: 2, method: 'classify', params: { format: 'functional', content: ofn, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean; incoherentClasses: string[]; hierarchy: string[][] };
  }[];

  check(r.result.consistent === true, 'HermiT: ontology is consistent');
  check(r.result.incoherentClasses.length === 0, 'HermiT: no incoherent classes');
  check(r.result.hierarchy.length >= 9, `HermiT: >= 9 inferred edges (got ${r.result.hierarchy.length})`);

  const koalaIri = 'http://example.org/animals#Koala';
  const marsupialIri = 'http://example.org/animals#Marsupial';
  const koalaEdge = r.result.hierarchy.find(([, c]) => c === koalaIri);
  check(koalaEdge?.[0] === marsupialIri, `HermiT: Koala inferred under Marsupial`);

  const thingChildren = r.result.hierarchy
    .filter(([p]) => p === 'http://www.w3.org/2002/07/owl#Thing')
    .map(([, c]) => c);
  check(thingChildren.includes('http://example.org/animals#Animal'), 'HermiT: Animal under owl:Thing');
} catch (e) {
  check(false, `HermiT classify failed: ${e}`);
}

// ── ELK classify ─────────────────────────────────────────────────────────────
console.log('\n── ELK classify (animals.ttl) ────────────────────────────────────');
try {
  const [r] = rpc([{ id: 3, method: 'classify', params: { format: 'functional', content: ofn, engine: 'elk' } }]) as {
    id: number;
    result: { consistent: boolean; hierarchy: string[][] };
  }[];

  check(r.result.consistent === true, 'ELK: ontology is consistent');
  check(r.result.hierarchy.length >= 9, `ELK: >= 9 inferred edges (got ${r.result.hierarchy.length})`);
} catch (e) {
  check(false, `ELK classify failed: ${e}`);
}

// ── checkConsistency ──────────────────────────────────────────────────────────
console.log('\n── checkConsistency ─────────────────────────────────────────────');
try {
  const [r] = rpc([{ id: 4, method: 'checkConsistency', params: { format: 'functional', content: ofn, engine: 'hermit' } }]) as {
    id: number;
    result: { consistent: boolean };
  }[];
  check(r.result.consistent === true, 'checkConsistency: animals is consistent');
} catch (e) {
  check(false, `checkConsistency failed: ${e}`);
}

// ── convertFormat ─────────────────────────────────────────────────────────────
console.log('\n── convertFormat ────────────────────────────────────────────────');
try {
  const [r] = rpc([{ id: 5, method: 'convertFormat', params: { content: ofn, fromFormat: 'functional', toFormat: 'owl-xml' } }]) as {
    id: number;
    result: { output: string };
  }[];
  check(typeof r.result.output === 'string' && r.result.output.length > 100, 'convertFormat: returns OWL/XML string');
  check(r.result.output.includes('<Ontology'), 'convertFormat: output contains <Ontology>');
} catch (e) {
  check(false, `convertFormat failed: ${e}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(pass ? '\n✓ All Phase 3 assertions passed' : '\n✗ Some Phase 3 assertions failed');
process.exit(pass ? 0 : 1);
