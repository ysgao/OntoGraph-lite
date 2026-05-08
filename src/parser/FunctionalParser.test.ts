import { readFileSync } from 'fs';
import { join } from 'path';
import { FunctionalParser } from './FunctionalParser';

const ofnPath = join(__dirname, '../../test-ontologies/bfo-core.ofn');
const text = readFileSync(ofnPath, 'utf8');

const model = new FunctionalParser(text, 'file:///bfo-core.ofn').parse();

console.log('── Ontology metadata ──────────────────────────');
console.log('IRI:        ', model.metadata.iri);
console.log('Version:    ', model.metadata.versionIri);
console.log('Imports:    ', model.metadata.imports.length);

console.log('\n── Entities ────────────────────────────────────');
console.log('Classes:    ', model.classes.size);
console.log('Obj props:  ', model.objectProperties.size);
console.log('Data props: ', model.dataProperties.size);
console.log('Ann props:  ', model.annotationProperties.size);
console.log('Individuals:', model.individuals.size);

// Sample: first 5 classes with labels and parents
console.log('\n── Sample classes ──────────────────────────────');
let shown = 0;
for (const cls of model.classes.values()) {
  if (shown++ >= 5) break;
  const label = Object.values(cls.labels)[0]?.[0] ?? '(no label)';
  const parents = cls.superClassIris.length
    ? cls.superClassIris.map(p => model.classes.get(p)
        ? (Object.values(model.classes.get(p)!.labels)[0]?.[0] ?? p.split(/[#/]/).pop()!)
        : p.split(/[#/]/).pop()!).join(', ')
    : '(root)';
  console.log(`  ${label.padEnd(35)} parent: ${parents}`);
  if (cls.superClassExpressions.length) {
    console.log(`    expressions: ${cls.superClassExpressions[0]}`);
  }
}

// Sample: first 5 object properties with labels
console.log('\n── Sample object properties ────────────────────');
shown = 0;
for (const prop of model.objectProperties.values()) {
  if (shown++ >= 5) break;
  const label = Object.values(prop.labels)[0]?.[0] ?? '(no label)';
  const flags = [
    prop.isTransitive ? 'transitive' : '',
    prop.isFunctional ? 'functional' : '',
    prop.isInverseFunctional ? 'inv-functional' : '',
    prop.inverseOfIri ? `inverse of ${prop.inverseOfIri.split(/[#/]/).pop()}` : '',
  ].filter(Boolean).join(', ');
  console.log(`  ${label.padEnd(35)} ${flags}`);
}

// Verify counts expected for BFO 2020
const EXPECTED_CLASSES = 35;
const EXPECTED_OBJ_PROPS = 30;
let pass = true;
if (model.classes.size < EXPECTED_CLASSES) {
  console.error(`\nFAIL: expected >= ${EXPECTED_CLASSES} classes, got ${model.classes.size}`);
  pass = false;
}
if (model.objectProperties.size < EXPECTED_OBJ_PROPS) {
  console.error(`FAIL: expected >= ${EXPECTED_OBJ_PROPS} object properties, got ${model.objectProperties.size}`);
  pass = false;
}
// All classes should have labels
const noLabel = [...model.classes.values()].filter(c => Object.keys(c.labels).length === 0);
if (noLabel.length > 0) {
  console.error(`FAIL: ${noLabel.length} classes have no rdfs:label`);
  pass = false;
}

console.log(pass ? '\n✓ All assertions passed' : '\n✗ Some assertions failed');
process.exit(pass ? 0 : 1);
