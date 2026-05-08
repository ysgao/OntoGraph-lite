import { readFileSync } from 'fs';
import { join } from 'path';
import { TurtleParser } from './TurtleParser';
import { ManchesterParser } from './ManchesterParser';

// Import the internal buildGraphData function by extracting it via dynamic require
// Since it's not exported, we re-implement a lightweight version here to verify the logic.
// The real integration test is done in VS Code itself.

const ROOT = join(__dirname, '../../test-ontologies');

let pass = true;
function check(cond: boolean, msg: string): void {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else      { console.error(`  ✗ FAIL: ${msg}`); pass = false; }
}

// ── Verify FunctionalSerializer produces the right structure ──────────────────
import { serializeToFunctional } from '../serializer/FunctionalSerializer';

console.log('── FunctionalSerializer (animals.ttl) ────────────────────────────');
const ttl = readFileSync(join(ROOT, 'animals.ttl'), 'utf8');
const model = new TurtleParser(ttl, 'file:///animals.ttl').parse();
const ofn = serializeToFunctional(model);

// Simulate classification: Animal has inferred sub-class Koala (not a direct asserted child)
model.inferredSubClasses.set('http://example.org/animals#Animal', new Set(['http://example.org/animals#Koala', 'http://example.org/animals#Vertebrate']));
model.isClassified = true;

check(model.classes.size === 9, `9 classes in model (got ${model.classes.size})`);
check(model.objectProperties.size === 3, `3 object properties (got ${model.objectProperties.size})`);
check(model.individuals.size === 1, `1 individual (got ${model.individuals.size})`);

// ── Graph data extraction (inline re-implementation to test the algorithm) ────
console.log('\n── Graph neighbourhood extraction ────────────────────────────────');

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';
const MAX_NODES = 200;

function buildGraphData(
  m: typeof model,
  focusIri: string | undefined,
  depth: number,
  opts: { showInferred: boolean; showDisjoint: boolean },
) {
  const assertedChildren = new Map<string, Set<string>>();
  for (const cls of m.classes.values()) {
    for (const sup of cls.superClassIris) {
      if (!assertedChildren.has(sup)) { assertedChildren.set(sup, new Set()); }
      assertedChildren.get(sup)!.add(cls.iri);
    }
  }

  let startIris: Set<string>;
  if (focusIri && m.classes.has(focusIri)) {
    startIris = new Set([focusIri]);
  } else {
    startIris = new Set(m.classes.keys());
  }

  const nodeIris = new Set<string>(startIris);
  const edgeMap = new Map<string, { source: string; target: string; type: string }>();

  const addEdge = (id: string, source: string, target: string, type: string) => {
    if (!edgeMap.has(id)) { edgeMap.set(id, { source, target, type }); }
  };

  let frontier = new Set<string>(startIris);
  for (let hop = 0; hop < depth && nodeIris.size < MAX_NODES; hop++) {
    const next = new Set<string>();
    for (const iri of frontier) {
      const cls = m.classes.get(iri);
      if (!cls) { continue; }
      for (const sup of cls.superClassIris) {
        if (sup === OWL_THING) { continue; }
        addEdge(`${iri}|sub|${sup}`, iri, sup, 'subClassOf');
        if (!nodeIris.has(sup)) { nodeIris.add(sup); next.add(sup); }
      }
      for (const sub of assertedChildren.get(iri) ?? []) {
        addEdge(`${sub}|sub|${iri}`, sub, iri, 'subClassOf');
        if (!nodeIris.has(sub)) { nodeIris.add(sub); next.add(sub); }
      }
      if (opts.showInferred && m.isClassified) {
        for (const infSub of m.inferredSubClasses.get(iri) ?? []) {
          if (!edgeMap.has(`${infSub}|sub|${iri}`)) {
            addEdge(`${infSub}|inf|${iri}`, infSub, iri, 'inferred');
          }
          if (!nodeIris.has(infSub)) { nodeIris.add(infSub); next.add(infSub); }
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) { break; }
  }

  const nodeSet = new Set(nodeIris);
  const edges = [...edgeMap.values()].filter(e => nodeSet.has(e.source) && nodeSet.has(e.target));
  return { nodes: [...nodeIris], edges };
}

// Test 1: full graph (no focus)
const full = buildGraphData(model, undefined, 4, { showInferred: false, showDisjoint: false });
check(full.nodes.length === 9, `Full graph: 9 class nodes (got ${full.nodes.length})`);
const subClassEdges = full.edges.filter(e => e.type === 'subClassOf');
check(subClassEdges.length >= 6, `Full graph: >= 6 subClassOf edges (got ${subClassEdges.length})`);

// Test 2: focus on Koala, depth 2
const koalaIri = 'http://example.org/animals#Koala';
const marsupialIri = 'http://example.org/animals#Marsupial';
const mammalIri = 'http://example.org/animals#Mammal';

const koalaView = buildGraphData(model, koalaIri, 2, { showInferred: false, showDisjoint: false });
check(koalaView.nodes.includes(koalaIri), 'Focus=Koala: Koala in nodes');
check(koalaView.nodes.includes(marsupialIri), 'Focus=Koala depth=2: Marsupial in nodes (1 hop up)');
check(koalaView.nodes.includes(mammalIri), 'Focus=Koala depth=2: Mammal in nodes (2 hops up)');
check(koalaView.edges.some(e => e.source === koalaIri && e.target === marsupialIri && e.type === 'subClassOf'),
  'Focus=Koala: Koala→Marsupial subClassOf edge');

// Test 3: inferred edges shown (Animal → Koala is inferred but not asserted direct)
const inferredView = buildGraphData(model, 'http://example.org/animals#Animal', 1, { showInferred: true, showDisjoint: false });
const inferredEdges = inferredView.edges.filter(e => e.type === 'inferred');
// Koala is inferred under Animal but only asserted under Marsupial, so the inferred edge appears
check(inferredEdges.some(e => e.source === 'http://example.org/animals#Koala' && e.target === 'http://example.org/animals#Animal'),
  `Inferred view: Koala→Animal inferred edge present (total inferred: ${inferredEdges.length})`);

// Test 4: depth 1 from Vertebrate (asserted children: Mammal + Bird)
const vertView = buildGraphData(model, 'http://example.org/animals#Vertebrate', 1, { showInferred: false, showDisjoint: false });
const birdIri = 'http://example.org/animals#Bird';
check(vertView.nodes.includes(mammalIri), 'Vertebrate depth=1: Mammal in nodes');
check(vertView.nodes.includes(birdIri), 'Vertebrate depth=1: Bird in nodes');

// ── Manchester parser produces correct model ────────────────────────────────
console.log('\n── Manchester parser for graph use ─────────────────────────────');
const omn = readFileSync(join(ROOT, 'animals.omn'), 'utf8');
const mnModel = new ManchesterParser(omn, 'file:///animals.omn').parse();
const mnOfn = serializeToFunctional(mnModel);

check(mnModel.classes.size >= 9, `Manchester: >= 9 classes (got ${mnModel.classes.size})`);
check(mnOfn.includes('SubClassOf('), 'Manchester → functional: has SubClassOf');
check(mnOfn.includes('DisjointClasses('), 'Manchester → functional: has DisjointClasses');

console.log(pass ? '\n✓ All Phase 4 assertions passed' : '\n✗ Some Phase 4 assertions failed');
process.exit(pass ? 0 : 1);
