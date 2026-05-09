import { readFileSync } from 'fs';
import { join } from 'path';
import { test, expect } from 'vitest';
import { ManchesterParser } from './ManchesterParser';
import { OwlXmlParser } from './OwlXmlParser';
import { TurtleParser } from './TurtleParser';

const ROOT = join(__dirname, '../../test-ontologies');

function check(cond: boolean, msg: string): void {
  expect(cond, msg).toBe(true);
}

// ── Manchester Syntax ────────────────────────────────────────────────────────

test('Phase2: Manchester Syntax (animals.omn)', () => {
  const omn = readFileSync(join(ROOT, 'animals.omn'), 'utf8');
  const mn = new ManchesterParser(omn, 'file:///animals.omn').parse();

  console.log('── Manchester Syntax (animals.omn) ─────────────────────────────');
  console.log(`  Classes: ${mn.classes.size}  ObjProps: ${mn.objectProperties.size}  Individuals: ${mn.individuals.size}`);

  const label = (m: typeof mn, name: string) =>
    [...m.classes.values(), ...m.objectProperties.values()]
      .find(e => Object.values(e.labels).flat().includes(name));

  check(mn.classes.size >= 7, `>= 7 classes (got ${mn.classes.size})`);
  check(mn.objectProperties.size >= 2, `>= 2 object properties (got ${mn.objectProperties.size})`);
  check(mn.metadata.iri === 'http://example.org/animals', `ontology IRI = ${mn.metadata.iri}`);

  const koala = label(mn, 'Koala');
  const marsupial = [...mn.classes.values()].find(c => Object.values(c.labels).flat().includes('Marsupial'));
  check(!!koala, 'Koala class exists');
  check(!!(koala && marsupial && (koala as typeof marsupial).superClassIris?.includes(marsupial.iri)),
    'Koala SubClassOf Marsupial');

  const hasPart = [...mn.objectProperties.values()].find(p => Object.values(p.labels).flat().includes('has part'));
  check(hasPart?.isTransitive === true, 'hasPart Transitive');

  const forest = [...mn.classes.values()].find(c => Object.values(c.labels).flat().includes('Forest'));
  const ocean  = [...mn.classes.values()].find(c => Object.values(c.labels).flat().includes('Ocean'));
  check(!!(forest && ocean && forest.disjointClassIris.includes(ocean.iri)), 'Forest DisjointWith Ocean');

  const mammal = [...mn.classes.values()].find(c => Object.values(c.labels).flat().includes('Mammal'));
  check((mammal?.superClassExpressions.length ?? 0) > 0, 'Mammal has superClassExpression (some restriction)');
  if (mammal?.superClassExpressions[0]) {
    console.log(`    expression: ${mammal.superClassExpressions[0]}`);
  }

  check(mn.individuals.size >= 1, `>= 1 individual (got ${mn.individuals.size})`);
});

// ── OWL/XML ─────────────────────────────────────────────────────────────────

test('Phase2: OWL/XML (animals.owx)', () => {
  const owx = readFileSync(join(ROOT, 'animals.owx'), 'utf8');
  const ox = new OwlXmlParser(owx, 'file:///animals.owx').parse();

  console.log('── OWL/XML (animals.owx) ──────────────────────────────────────');
  console.log(`  Classes: ${ox.classes.size}  ObjProps: ${ox.objectProperties.size}  Individuals: ${ox.individuals.size}`);

  check(ox.metadata.iri === 'http://example.org/animals', `ontology IRI = ${ox.metadata.iri}`);
  check(ox.classes.size >= 6, `>= 6 classes (got ${ox.classes.size})`);

  const oxKoala = ox.classes.get('http://example.org/animals#Koala');
  check(!!oxKoala, 'Koala class exists');
  check(oxKoala?.superClassIris.includes('http://example.org/animals#Marsupial') ?? false,
    'Koala SubClassOf Marsupial');
  check(oxKoala?.labels['en']?.[0] === 'Koala', `Koala label = "${oxKoala?.labels['en']?.[0]}"`);

  const oxHH = ox.objectProperties.get('http://example.org/animals#hasHabitat');
  check((oxHH?.domainIris.length ?? 0) > 0 && (oxHH?.rangeIris.length ?? 0) > 0,
    'hasHabitat has domain+range');
  check(oxHH?.labels['en']?.[0] === 'has habitat', `hasHabitat label = "${oxHH?.labels['en']?.[0]}"`);

  check(ox.individuals.get('http://example.org/animals#koko')
    ?.classIris.includes('http://example.org/animals#Koala') ?? false,
    'koko rdf:type Koala');

  const oxHasParent = ox.objectProperties.get('http://example.org/animals#hasParent');
  check(oxHasParent?.isTransitive === true, 'hasParent Transitive');
});

// ── Turtle ───────────────────────────────────────────────────────────────────

test('Phase2: Turtle (animals.ttl)', () => {
  const ttl = readFileSync(join(ROOT, 'animals.ttl'), 'utf8');
  const tt = new TurtleParser(ttl, 'file:///animals.ttl').parse();

  console.log('── Turtle (animals.ttl) ────────────────────────────────────────');
  console.log(`  Classes: ${tt.classes.size}  ObjProps: ${tt.objectProperties.size}  Individuals: ${tt.individuals.size}`);

  check(tt.metadata.iri === 'http://example.org/animals', `ontology IRI = ${tt.metadata.iri}`);
  check(tt.classes.size >= 7, `>= 7 classes (got ${tt.classes.size})`);
  check(tt.objectProperties.size >= 2, `>= 2 object properties (got ${tt.objectProperties.size})`);

  const ttKoala = tt.classes.get('http://example.org/animals#Koala');
  check(ttKoala?.labels['en']?.[0] === 'Koala', `Koala label = "${ttKoala?.labels['en']?.[0]}"`);
  check(ttKoala?.superClassIris.includes('http://example.org/animals#Marsupial') ?? false,
    'Koala SubClassOf Marsupial');

  const ttHasPart = tt.objectProperties.get('http://example.org/animals#hasPart');
  check(ttHasPart?.isTransitive === true, 'hasPart Transitive');

  const ttKoko = tt.individuals.get('http://example.org/animals#koko');
  check(ttKoko?.classIris.includes('http://example.org/animals#Koala') ?? false, 'koko rdf:type Koala');
  check(ttKoko?.labels['en']?.[0] === 'Koko', `koko label = "${ttKoko?.labels['en']?.[0]}"`);
});
