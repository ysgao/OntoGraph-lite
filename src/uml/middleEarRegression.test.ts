/**
 * Regression check against the real anatomy.owl reference case: "Middle ear structure"
 * (25342003) should produce roughly the same node set as the hand-built
 * uml-diagram-cli-plan/middle-ear-structure.drawio reference diagram. The diagram is generated
 * ENTIRELY in "Entire X" terms (spec §3, resolved design) — the clicked clinical concept resolves
 * once to its anchor ("Entire middle ear", 181185000), which becomes the actual root (displayed
 * as "Middle ear" — see stripEntirePrefix in partOfGraph.ts), and every discovered node is also
 * an "Entire X" concept, never a clinical alias. This is a deliberate trade-off: a concept that
 * only relates to the CLINICAL hierarchy (e.g. "Secondary tympanic membrane", which subclasses
 * the clinical "Structure of secondary tympanic membrane", not the entire concept directly) is no
 * longer discovered — accepted in exchange for never mixing clinical and continuant concepts in
 * the same diagram, which is what caused incorrect/overlapping edges in an earlier design.
 * Skipped automatically when anatomy.owl is absent (not committed to the repo).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { ParserRegistry } from '../parser/ParserRegistry';
import { extractUmlDiagram } from './partOfGraph';

const ANATOMY_PATH = path.resolve(process.cwd(), 'test-ontologies/anatomy.owl');
const ANATOMY_EXISTS = fs.existsSync(ANATOMY_PATH);

const MIDDLE_EAR_IRI = 'http://snomed.info/id/25342003'; // "Middle ear structure"
const SNOMED_PART_OF = [
  'http://snomed.info/id/733931002', // Constitutional part of
  'http://snomed.info/id/733930001', // Regional part of
  'http://snomed.info/id/733932009', // Systemic part of
  'http://snomed.info/id/774081006', // Proper part of
];

describe.skipIf(!ANATOMY_EXISTS)('Middle ear structure — real anatomy.owl regression', () => {
  it('discovers the reference diagram\'s direct children via anchor resolution, at depth 1', () => {
    const raw = fs.readFileSync(ANATOMY_PATH, 'utf8');
    const model = ParserRegistry.parse(raw, 'owl-functional', 'file:///anatomy.owl');

    const result = extractUmlDiagram(model, MIDDLE_EAR_IRI, 2, { compositionProperties: SNOMED_PART_OF });

    // Print the generated class/relationship list for manual comparison against
    // uml-diagram-cli-plan/middle-ear-structure.drawio.
    console.log('\n--- Middle ear structure: generated nodes ---');
    for (const n of result.nodes) {
      console.log(`  ${n.iri.split('/').pop()}  ${n.label}${n.isRoot ? '  [ROOT]' : ''}${n.hasHiddenRelations ? '  [more...]' : ''}`);
    }
    console.log('--- edges ---');
    for (const e of result.edges) {
      console.log(`  ${e.parentIri.split('/').pop()} <-${e.kind}- ${e.childIri.split('/').pop()}${e.propertyIri ? ` (${e.propertyIri.split('/').pop()})` : ''}`);
    }
    console.log('--- excluded relations ---');
    for (const r of result.excludedRelations) {
      console.log(`  ${r.fromIri.split('/').pop()} -[excluded:${r.propertyIri.split('/').pop()}]-> ${r.targetIri.split('/').pop()}`);
    }

    // The anchor IS the root now (by design) — displayed with "Entire " stripped.
    const root = result.nodes.find(n => n.isRoot);
    expect(root?.iri).toBe('http://snomed.info/id/181185000');
    expect(root?.label).toBe('Middle ear');

    // No node's label leaks the raw "Entire " prefix — every node is an "Entire X" concept
    // internally, but every displayed label reads as the natural "X".
    for (const n of result.nodes) {
      expect(n.label.toLowerCase().startsWith('entire ')).toBe(false);
    }

    // Empirically-confirmed-reachable subset of the reference diagram's concepts (verified
    // directly against this anatomy.owl snapshot's actual axioms via grep before writing this
    // list — some reference-diagram placements, e.g. "Articulation of auditory ossicles", turned
    // out to be a hand-curated pedagogical override per spec §10, not the concept's literal
    // axiom position, so they're intentionally not asserted here; a mechanical tool isn't
    // expected to reproduce those, per the spec's own "not a byte-exact golden file" caveat).
    const discoveredIris = new Set(result.nodes.map(n => n.iri));
    const expectedDirectComposition = [
      'http://snomed.info/id/181180005', // Tympanic membrane — depth 1, regional part of
      'http://snomed.info/id/362551002', // Tympanic cavity — depth 1, constitutional part of
      'http://snomed.info/id/244778009', // Ossicular muscle — depth 1, constitutional part of
      'http://snomed.info/id/728093006', // Tendon of tensor tympani — depth 1
      'http://snomed.info/id/728094000', // Tendon of stapedius — depth 1
    ];
    const expectedNestedComposition = [
      'http://snomed.info/id/181184001', // Ossicle of ear — depth 2, under tympanic cavity
      'http://snomed.info/id/264090005', // Malleus — depth 2
      'http://snomed.info/id/272649008', // Incus — depth 2
      'http://snomed.info/id/264199009', // Stapes — depth 2
    ];
    for (const iri of [...expectedDirectComposition, ...expectedNestedComposition]) {
      expect(discoveredIris.has(iri), `expected ${iri} to be discovered`).toBe(true);
    }

    // The diagram must show more than just the root — this is the bug being regression-tested.
    expect(result.nodes.length).toBeGreaterThan(1);
  });
});
