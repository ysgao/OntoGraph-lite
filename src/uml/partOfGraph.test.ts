import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ParserRegistry } from '../parser/ParserRegistry';
import { createEmptyModel } from '../model/OntologyModel';
import type { OntologyModel, OWLClass } from '../model/OntologyModel';
import { extractUmlDiagram, extractInferredUmlDiagram, stripEntirePrefix, stripStructureLabel } from './partOfGraph';

const FIXTURE_PATH = path.join(__dirname, '..', '..', 'test-ontologies', 'uml-fixture.ofn');
const NS = 'http://example.org/uml-fixture#';

function loadFixture(): OntologyModel {
  const content = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return ParserRegistry.parse(content, 'owl-functional', 'file:///uml-fixture.ofn');
}

describe('stripEntirePrefix', () => {
  it('strips a leading "Entire " and re-capitalizes what remains', () => {
    expect(stripEntirePrefix('Entire liver')).toBe('Liver');
    expect(stripEntirePrefix('entire tympanic membrane')).toBe('Tympanic membrane');
  });

  it('leaves a label with no "Entire " prefix unchanged', () => {
    expect(stripEntirePrefix('Liver')).toBe('Liver');
    expect(stripEntirePrefix('Body structure')).toBe('Body structure');
  });

  it('does not strip "Entire" as part of a longer word (requires a following space)', () => {
    expect(stripEntirePrefix('Entirely different structure')).toBe('Entirely different structure');
  });

  it('does not strip "Entire" appearing mid-label, only at the start', () => {
    expect(stripEntirePrefix('Structure of entire liver')).toBe('Structure of entire liver');
  });
});

describe('stripStructureLabel', () => {
  it('strips a trailing " structure" and re-capitalizes what remains', () => {
    expect(stripStructureLabel('Kidney structure')).toBe('Kidney');
    expect(stripStructureLabel('bone structure')).toBe('Bone');
  });

  it('strips a leading "structure of " and re-capitalizes what remains', () => {
    expect(stripStructureLabel('Structure of liver')).toBe('Liver');
    expect(stripStructureLabel('structure of the eye')).toBe('The eye');
  });

  it('leaves a label matching neither pattern unchanged', () => {
    expect(stripStructureLabel('Kidney')).toBe('Kidney');
    expect(stripStructureLabel('Left kidney')).toBe('Left kidney');
  });

  it('prefers the "structure of " prefix check when a label could arguably match either pattern', () => {
    expect(stripStructureLabel('Structure of eye structure')).toBe('Eye structure');
  });
});

describe('extractUmlDiagram', () => {
  it('renders a bare pairwise SubClassOf as a generalization edge', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}GenSuper`, 1, { compositionProperties: [] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}GenSuper`, childIri: `${NS}GenSub`, kind: 'generalization',
    }));
    expect(result.nodes.map(n => n.iri)).toContain(`${NS}GenSub`);
  });

  it('renders a "some" restriction as composition only when the property is configured', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Whole`, 1, {
      compositionProperties: [`${NS}partOf`],
    });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}Whole`, childIri: `${NS}Part`, kind: 'composition', propertyIri: `${NS}partOf`,
    }));
  });

  it('renders a "some" restriction on an UNCONFIGURED property as an excluded relation, not a composition edge', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Whole`, 1, {
      compositionProperties: [`${NS}partOf`],
    });

    expect(result.excludedRelations).toContainEqual(expect.objectContaining({
      fromIri: `${NS}Whole`, propertyIri: `${NS}vasculatureOf`, targetIri: `${NS}VascOfWhole`,
    }));
    expect(result.edges.some(e => e.childIri === `${NS}VascOfWhole`)).toBe(false);
    expect(result.nodes.map(n => n.iri)).not.toContain(`${NS}VascOfWhole`);
  });

  it('populates human-readable labels on an excluded relation so it can render as a standalone note without a further model lookup', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Whole`, 1, { compositionProperties: [`${NS}partOf`] });

    const excluded = result.excludedRelations.find(r => r.targetIri === `${NS}VascOfWhole`);
    expect(excluded).toEqual(expect.objectContaining({
      fromLabel: 'Whole', propertyLabel: 'vasculature of', targetLabel: 'Vasculature of whole',
    }));
  });

  it('still renders successfully with an empty Composition Property Selection (FR-009) — every would-be composition relationship becomes excluded instead of crashing', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Whole`, 1, { compositionProperties: [] });

    // The bare generalization edge (Whole's own genus term) never needed composition config
    // in the first place, so it still renders.
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}GenericMaterial`, childIri: `${NS}Whole`, kind: 'generalization',
    }));
    // Every restriction-based relationship touching Whole — its own "part of Root", and the
    // things that declare themselves part of Whole — becomes excluded, not composition.
    expect(result.excludedRelations).toContainEqual(expect.objectContaining({ fromIri: `${NS}Whole`, propertyIri: `${NS}partOf`, targetIri: `${NS}Root` }));
    expect(result.excludedRelations).toContainEqual(expect.objectContaining({ fromIri: `${NS}Whole`, propertyIri: `${NS}partOf`, targetIri: `${NS}Part` }));
    expect(result.excludedRelations).toContainEqual(expect.objectContaining({ fromIri: `${NS}Whole`, propertyIri: `${NS}vasculatureOf`, targetIri: `${NS}VascOfWhole` }));
    expect(result.edges.some(e => e.kind === 'composition')).toBe(false);
  });

  it('regression: shows a class\'s own ancestors even when nothing else declares itself a descendant of it (the reported "only focus class shown" bug)', () => {
    const model = loadFixture();
    // Part has no descendants of its own (nothing points at Part) but DOES have its own
    // superclass/part-of declarations — a downward-only search would show Part alone.
    const result = extractUmlDiagram(model, `${NS}Part`, 1, { compositionProperties: [`${NS}partOf`] });

    expect(result.nodes.length).toBeGreaterThan(1);
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}GenericMaterial`, childIri: `${NS}Part`, kind: 'generalization',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}Whole`, childIri: `${NS}Part`, kind: 'composition', propertyIri: `${NS}partOf`,
    }));
  });

  it('renders an isolated entity (no relationships of either kind) as a single node with no error', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Isolated`, 3, { compositionProperties: [`${NS}partOf`] });

    expect(result.nodes).toEqual([
      expect.objectContaining({ iri: `${NS}Isolated`, isRoot: true, depth: 0, hasHiddenRelations: false }),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.excludedRelations).toEqual([]);
  });

  it('keeps BOTH edges for a node with a composition parent and a generalization parent at once (FR-011, general graph not a strict tree)', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Root`, 2, { compositionProperties: [`${NS}partOf`] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}Bone`, childIri: `${NS}DualNode`, kind: 'generalization',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}Whole`, childIri: `${NS}DualNode`, kind: 'composition', propertyIri: `${NS}partOf`,
    }));
    // exactly one DualNode entry in the node list — a shared child, not duplicated
    expect(result.nodes.filter(n => n.iri === `${NS}DualNode`)).toHaveLength(1);
  });

  it('terminates on a part-of cycle while keeping both cyclical edges visible', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}CycleA`, 4, { compositionProperties: [`${NS}partOf`] });

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CycleA`, childIri: `${NS}CycleB`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CycleB`, childIri: `${NS}CycleA`, kind: 'composition',
    }));
  });

  it('enforces the node cap and flags nodeCapReached / hasHiddenRelations, independent of depth', () => {
    const model = loadFixture();
    // GenSuper has 3 bare-subclass children in the fixture; cap to 2 total nodes (root + 1 child)
    // to prove the cap without needing hundreds of fixture entities.
    const result = extractUmlDiagram(model, `${NS}GenSuper`, 1, {
      compositionProperties: [],
      maxNodes: 2,
    });

    expect(result.nodeCapReached).toBe(true);
    expect(result.nodes).toHaveLength(2);
    const root = result.nodes.find(n => n.iri === `${NS}GenSuper`);
    expect(root?.hasHiddenRelations).toBe(true);
  });

  it('flags hasHiddenRelations on a node whose further relationships exist beyond the requested depth', () => {
    const model = loadFixture();
    // depth=1 from Root reaches Bone/Whole but not DualNode — Bone/Whole's own further
    // relationships (to DualNode) exist but are not shown at this depth.
    const result = extractUmlDiagram(model, `${NS}Root`, 1, { compositionProperties: [`${NS}partOf`] });

    const bone = result.nodes.find(n => n.iri === `${NS}Bone`);
    expect(bone?.hasHiddenRelations).toBe(true);
    expect(result.nodes.map(n => n.iri)).not.toContain(`${NS}DualNode`);
  });

  it('reveals more of the diagram as depth increases (spec FR-005 / User Story 2)', () => {
    const model = loadFixture();
    const opts = { compositionProperties: [`${NS}partOf`] };

    const shallow = extractUmlDiagram(model, `${NS}Root`, 1, opts);
    expect(shallow.nodes.map(n => n.iri).sort()).toEqual([`${NS}Bone`, `${NS}Root`, `${NS}Whole`].sort());

    const deeper = extractUmlDiagram(model, `${NS}Root`, 2, opts);
    expect(deeper.nodes.map(n => n.iri)).toContain(`${NS}DualNode`);
    expect(deeper.nodes.length).toBeGreaterThan(shallow.nodes.length);
  });

  it('does not confuse depth truncation with the node-count cap — nodeCapReached stays false when only depth-limited', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}Root`, 1, { compositionProperties: [`${NS}partOf`] });
    expect(result.nodeCapReached).toBe(false);
  });

  it('is deterministic — two consecutive calls with the same inputs produce deep-equal output (spec SC-003)', () => {
    const model = loadFixture();
    const opts = { compositionProperties: [`${NS}partOf`] };
    const first = extractUmlDiagram(model, `${NS}Root`, 3, opts);
    const second = extractUmlDiagram(model, `${NS}Root`, 3, opts);

    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
    expect(second.excludedRelations).toEqual(first.excludedRelations);
    expect(second.nodeCapReached).toBe(first.nodeCapReached);
  });

  it('drops a generalization edge that is transitively implied by a chain of the same kind (A->B->C makes a direct A->C edge redundant)', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}TransA`, 2, { compositionProperties: [] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}TransA`, childIri: `${NS}TransB`, kind: 'generalization',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}TransB`, childIri: `${NS}TransC`, kind: 'generalization',
    }));
    expect(result.edges.some(e => e.parentIri === `${NS}TransA` && e.childIri === `${NS}TransC`)).toBe(false);
  });

  it('drops a composition edge that is transitively implied by a chain of the same kind', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}CompTransA`, 2, { compositionProperties: [`${NS}partOf`] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CompTransA`, childIri: `${NS}CompTransB`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CompTransB`, childIri: `${NS}CompTransC`, kind: 'composition',
    }));
    expect(result.edges.some(e => e.parentIri === `${NS}CompTransA` && e.childIri === `${NS}CompTransC`)).toBe(false);
  });

  it('keeps both edges of a 2-node cycle — there is no OTHER path between them to make either edge redundant', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}CycleA`, 4, { compositionProperties: [`${NS}partOf`] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CycleA`, childIri: `${NS}CycleB`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}CycleB`, childIri: `${NS}CycleA`, kind: 'composition',
    }));
  });

  it('drops a direct edge redundant against a MIXED-kind chain (A is-a B, B part-of C makes a direct A part-of C edge redundant even though the chain and the direct edge differ in kind)', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}MixedC`, 2, { compositionProperties: [`${NS}partOf`] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}MixedC`, childIri: `${NS}MixedB`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}MixedB`, childIri: `${NS}MixedA`, kind: 'generalization',
    }));
    expect(result.edges.some(e => e.parentIri === `${NS}MixedC` && e.childIri === `${NS}MixedA`)).toBe(false);
  });

  it('drops a redundant direct edge implied by a mixed-kind chain regardless of how many hops separate the two nodes', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}ChainD`, 3, { compositionProperties: [`${NS}partOf`] });

    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}ChainD`, childIri: `${NS}ChainC`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}ChainC`, childIri: `${NS}ChainB`, kind: 'composition',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}ChainB`, childIri: `${NS}ChainA`, kind: 'generalization',
    }));
    expect(result.edges.some(e => e.parentIri === `${NS}ChainD` && e.childIri === `${NS}ChainA`)).toBe(false);
  });

  it('flags a class with its own "Laterality some Left/Right" restriction as lateralized (spec §12)', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}LateralParent`, 1, { compositionProperties: [] });

    expect(result.nodes.map(n => n.iri)).toEqual(expect.arrayContaining([
      `${NS}LateralLeft`, `${NS}LateralRight`, `${NS}LateralSide`,
    ]));
    expect(result.lateralizedIris.sort()).toEqual([`${NS}LateralLeft`, `${NS}LateralRight`].sort());
    // The reference concept itself (LateralParent, the root) is not lateralized.
    expect(result.lateralizedIris).not.toContain(`${NS}LateralParent`);
    // "Laterality some Side" is SNOMED's generic, unspecified-side qualifier (e.g. on "Entire
    // middle ear") — it is NOT a lateralized variant, unlike "Laterality some Left/Right".
    expect(result.lateralizedIris).not.toContain(`${NS}LateralSide`);
  });

  it('regression: resolves the SNOMED "All or part of" anchor hop (spec §3) so a clinical structure concept discovers the continuant\'s part-of children', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}ClinicalStructure`, 1, { compositionProperties: [`${NS}partOf`] });

    // The diagram's actual root is the resolved anchor (AnchorWhole), not the clicked clinical
    // concept — all traversal happens entirely in "Entire X" terms (spec §3, resolved design).
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}AnchorWhole`, childIri: `${NS}AnchorChild`, kind: 'composition', propertyIri: `${NS}partOf`,
    }));
    const root = result.nodes.find(n => n.isRoot);
    expect(root?.iri).toBe(`${NS}AnchorWhole`);
    // "Entire " is stripped from the displayed label (the fixture's real label is
    // "Entire anchor whole") — the diagram operates in "Entire X" terms but displays "X",
    // re-capitalized.
    expect(root?.label).toBe('Anchor whole');
    // The clicked clinical concept itself is never drawn as a node — only the anchor is.
    expect(result.nodes.map(n => n.iri)).not.toContain(`${NS}ClinicalStructure`);
  });

  it('regression: a dual-relationship node discovered via a shallower parent first gets the LONGEST-path depth, not the shortest — otherwise it lands above its own deeper parent, which routes that edge as an uncollision-checked bridge free to cross arbitrary other edges (reported against real anatomy.owl data)', () => {
    const model = loadFixture();
    const result = extractUmlDiagram(model, `${NS}DepthFixRoot`, 10, { compositionProperties: [] });

    const depthOf = (iri: string) => result.nodes.find(n => n.iri === iri)?.depth;
    expect(depthOf(`${NS}DepthFixShallow`)).toBe(1);
    expect(depthOf(`${NS}DepthFixChainA`)).toBe(1);
    expect(depthOf(`${NS}DepthFixChainB`)).toBe(2);
    expect(depthOf(`${NS}DepthFixChainC`)).toBe(3);
    // Longest path: max(DepthFixShallow=1, DepthFixChainC=3) + 1 = 4 — strictly below BOTH parents,
    // not the shortest-path 2 (which would tie it with DepthFixChainB and put it above DepthFixChainC).
    expect(depthOf(`${NS}DepthFixShared`)).toBe(4);

    // Both real parent edges survive (this is a genuine FR-011 dual relationship, not a redundant
    // chain — DepthFixShallow and DepthFixChainC are otherwise unrelated).
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}DepthFixShallow`, childIri: `${NS}DepthFixShared`, kind: 'generalization',
    }));
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: `${NS}DepthFixChainC`, childIri: `${NS}DepthFixShared`, kind: 'generalization',
    }));
  });
});

function makeClass(iri: string, superClassIris: string[] = []): OWLClass {
  return {
    iri,
    type: 'class',
    labels: { en: [iri.split('#').pop() ?? iri] },
    annotations: {},
    superClassIris,
    equivalentClassIris: [],
    disjointClassIris: [],
    superClassExpressions: [],
    equivalentClassExpressions: [],
    gciExpressions: [],
  };
}

describe('extractUmlDiagram (Stated view) — unaffected by the reasoner-inferred hierarchy (spec 032-uml-inferred-subtypes, second refinement)', () => {
  it('never includes a subtype that exists only in model.inferredSubClasses, even when the model is classified — Stated and Inferred are never mixed', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A');
    const b = makeClass('http://ex.org#B'); // no asserted superClassIris — inferred-only
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);
    model.isClassified = true;
    model.inferredSubClasses.set(a.iri, new Set([b.iri]));

    const result = extractUmlDiagram(model, a.iri, 1, { compositionProperties: [] });

    expect(result.nodes.map(n => n.iri)).not.toContain(b.iri);
    expect(result.edges.some(e => e.childIri === b.iri)).toBe(false);
    // extractUmlDiagram (Stated) never sets isInferred/entireIris at all — those only exist on
    // extractInferredUmlDiagram's output.
    expect(result.entireIris).toBeUndefined();
  });
});

describe('extractInferredUmlDiagram (Inferred view, spec 032-uml-inferred-subtypes second refinement)', () => {
  it('includes a subtype that has no asserted axiom but IS in model.inferredSubClasses, when the model is classified', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A');
    const b = makeClass('http://ex.org#B'); // no asserted superClassIris — inferred-only
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);
    model.isClassified = true;
    model.inferredSubClasses.set(a.iri, new Set([b.iri]));

    const result = extractInferredUmlDiagram(model, a.iri, 1);

    expect(result.nodes.map(n => n.iri)).toContain(b.iri);
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: a.iri, childIri: b.iri, kind: 'generalization', isInferred: true,
    }));
  });

  it('renders a relationship that is BOTH asserted AND reasoner-confirmed as isInferred falsy (still confirmed by reasoning, but not reasoner-ONLY)', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A');
    const c = makeClass('http://ex.org#C', [a.iri]); // asserted subtype of A
    model.classes.set(a.iri, a);
    model.classes.set(c.iri, c);
    model.isClassified = true;
    model.inferredSubClasses.set(a.iri, new Set([c.iri])); // reasoner also confirms it

    const result = extractInferredUmlDiagram(model, a.iri, 1);

    const edgesToC = result.edges.filter(e => e.parentIri === a.iri && e.childIri === c.iri);
    expect(edgesToC).toHaveLength(1);
    expect(edgesToC[0].isInferred).toBeFalsy();
  });

  it('is a no-op (single root node) when the model is not classified, even though inferredSubClasses has stale/leftover data', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A');
    const b = makeClass('http://ex.org#B');
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);
    // isClassified remains false
    model.inferredSubClasses.set(a.iri, new Set([b.iri]));

    const result = extractInferredUmlDiagram(model, a.iri, 1);

    expect(result.nodes.map(n => n.iri)).toEqual([a.iri]);
  });

  it('never produces a composition edge — this view is generalization-only, no "part of" concept exists here', () => {
    const model = createEmptyModel('test.ofn');
    const a = makeClass('http://ex.org#A');
    const b = makeClass('http://ex.org#B');
    model.classes.set(a.iri, a);
    model.classes.set(b.iri, b);
    model.isClassified = true;
    model.inferredSubClasses.set(a.iri, new Set([b.iri]));

    const result = extractInferredUmlDiagram(model, a.iri, 1);

    expect(result.edges.every(e => e.kind === 'generalization')).toBe(true);
    expect(result.excludedRelations).toEqual([]);
  });

  it('does not anchor-hop to an "All or part of" target — the focus entity itself is always the root, unlike the Stated view', () => {
    const model = loadFixture();
    model.isClassified = true;
    model.inferredSubClasses.set(`${NS}ClinicalStructure`, new Set([`${NS}Isolated`]));

    const result = extractInferredUmlDiagram(model, `${NS}ClinicalStructure`, 1);

    const root = result.nodes.find(n => n.isRoot);
    expect(root?.iri).toBe(`${NS}ClinicalStructure`);
  });

  it('shows the root\'s own direct inferred parent(s) as a one-hop ancestor pre-pass, same rationale as the Stated view', () => {
    const model = createEmptyModel('test.ofn');
    const parent = makeClass('http://ex.org#Parent');
    const child = makeClass('http://ex.org#Child');
    model.classes.set(parent.iri, parent);
    model.classes.set(child.iri, child);
    model.isClassified = true;
    model.inferredSubClasses.set(parent.iri, new Set([child.iri]));

    const result = extractInferredUmlDiagram(model, child.iri, 1);

    expect(result.nodes.map(n => n.iri)).toContain(parent.iri);
    expect(result.edges).toContainEqual(expect.objectContaining({
      parentIri: parent.iri, childIri: child.iri, kind: 'generalization',
    }));
  });

  it('flags a reasoner-inferred-only subtype as lateralized, exactly like the Stated view would (own conjuncts check, FR-006)', () => {
    const model = createEmptyModel('test.ofn');
    const root = makeClass('http://ex.org#Root');
    const lateralLeft: OWLClass = {
      ...makeClass('http://ex.org#LateralLeft'),
      superClassExpressions: ['http://snomed.info/id/272741003 some http://snomed.info/id/7771000'],
    };
    model.classes.set(root.iri, root);
    model.classes.set(lateralLeft.iri, lateralLeft);
    model.isClassified = true;
    model.inferredSubClasses.set(root.iri, new Set([lateralLeft.iri]));

    const result = extractInferredUmlDiagram(model, root.iri, 1);

    // extractInferredUmlDiagram always includes the node itself — default EXCLUSION from the
    // rendered diagram is applied one layer up by generateUmlDiagram.ts (see
    // src/commands/generateUmlDiagram.test.ts for the end-to-end exclusion assertion).
    expect(result.nodes.map(n => n.iri)).toContain(lateralLeft.iri);
    expect(result.lateralizedIris).toContain(lateralLeft.iri);
  });

  it('flags a class whose label starts with "Entire " as an entire-concept, for default exclusion', () => {
    const model = createEmptyModel('test.ofn');
    const root = makeClass('http://ex.org#Root');
    const entireKidney: OWLClass = { ...makeClass('http://ex.org#EntireKidney'), labels: { en: ['Entire kidney'] } };
    model.classes.set(root.iri, root);
    model.classes.set(entireKidney.iri, entireKidney);
    model.isClassified = true;
    model.inferredSubClasses.set(root.iri, new Set([entireKidney.iri]));

    const result = extractInferredUmlDiagram(model, root.iri, 1);

    expect(result.entireIris).toContain(entireKidney.iri);
    // Label is NOT stripped in the Inferred view (no anchor-substitution mechanism here) — shown
    // verbatim if ever revealed.
    expect(result.nodes.find(n => n.iri === entireKidney.iri)?.label).toBe('Entire kidney');
  });

  it('simplifies a "X structure" or "Structure of X" label down to just "X"', () => {
    const model = createEmptyModel('test.ofn');
    const root = makeClass('http://ex.org#Root');
    const kidneyStructure: OWLClass = { ...makeClass('http://ex.org#KidneyStructure'), labels: { en: ['Kidney structure'] } };
    const structureOfLiver: OWLClass = { ...makeClass('http://ex.org#StructureOfLiver'), labels: { en: ['Structure of liver'] } };
    model.classes.set(root.iri, root);
    model.classes.set(kidneyStructure.iri, kidneyStructure);
    model.classes.set(structureOfLiver.iri, structureOfLiver);
    model.isClassified = true;
    model.inferredSubClasses.set(root.iri, new Set([kidneyStructure.iri, structureOfLiver.iri]));

    const result = extractInferredUmlDiagram(model, root.iri, 1);

    expect(result.nodes.find(n => n.iri === kidneyStructure.iri)?.label).toBe('Kidney');
    expect(result.nodes.find(n => n.iri === structureOfLiver.iri)?.label).toBe('Liver');
  });
});
