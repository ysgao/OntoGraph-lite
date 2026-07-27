# Quickstart: Include Inferred Subtypes in UML Diagram Scope

Manual end-to-end verification steps once the feature is implemented. These map directly onto the
spec's acceptance scenarios and success criteria. Reflects the second implementation refinement:
Stated and Inferred are two completely separate views, switched via a control — never merged.

## Setup

1. `npm run build-all` and launch the Extension Development Host (F5), or install the built
   `.vsix`.
2. Open an ontology containing at least one class whose subtype relationship to another class is
   established ONLY via reasoning — e.g. two classes A and B where B is defined with
   `EquivalentClasses` such that the reasoner concludes `B SubClassOf A`, but no direct
   `SubClassOf(B A)` axiom is written. Also include, under the same root:
   - A class C that is BOTH directly asserted as a subtype of A AND separately reasoner-confirmed.
   - A lateralized class (a `Laterality some Left`/`Right` restriction) reachable only via
     inference.
   - A class labeled "Entire X" reachable only via inference.
   - A class labeled "X structure" or "Structure of X" reachable only via inference.
   Construct a minimal hand-built test ontology for this walkthrough if none of the bundled
   test ontologies already has this shape.

## Story 1 — Stated and Inferred are two separate views, switched via a control (P1)

1. Run "OntoGraph: Classify Ontology" and confirm it completes (Inferred Hierarchy view populates).
2. Right-click class A (the parent in the inferred-only relationship) → "Generate UML Diagram."
3. Confirm the toolbar's view switch shows "Stated" by default, and that class B does NOT appear —
   identical to pre-feature behavior.
4. Switch the control to "Inferred". Confirm class B now appears as a subtype of A, connected by a
   generalization connector — even though B has no direct `SubClassOf(B A)` axiom.
5. Confirm C appears exactly once in the Inferred view (no duplicate node/line).
6. Switch back to "Stated". Confirm B disappears and the diagram matches step 3 exactly again —
   the two views are never mixed.
7. Close the diagram, reload the ontology fresh (so `isClassified` resets to false), and switch to
   "Inferred" without reclassifying. Confirm the diagram shows only the focus entity (no error, no
   subtypes) and that switching itself does not trigger a classify run (no "Classifying…" progress
   notification appears).

## Story 2 — Inferred-only relationships are visually distinguished within the Inferred view (P2)

1. In the Inferred view from Story 1, confirm the connector line from A to B (inferred-only) is
   dashed, while the connector from A to C (also asserted) is solid.
2. Export the Inferred-view diagram to draw.io (`.drawio`), SVG, and PNG in turn. Open each
   exported file and confirm the same visual distinction (dashed vs. solid) is present.
3. Confirm the inferred-only dash pattern is visually distinct from the existing "further
   relationships exist beyond the depth/node cap" dashed indicator and from the existing far-edge
   (multi-layer routing) dashed lanes.

## Story 3 — The Inferred view excludes lateralized and "Entire X" noise by default, and simplifies structure labels (P1)

1. Switch to the Inferred view for the root containing the lateralized-only-via-inference class
   and the "Entire X"-only-via-inference class from Setup. Confirm BOTH are excluded by default.
2. Use the existing "show full subhierarchy" control. Confirm BOTH previously-hidden classes now
   appear.
3. Confirm the class labeled "X structure" or "Structure of X" displays as just "X" in the
   Inferred view.
4. Switch to the Stated view for a root that has an "All or part of" ("Entire X") anchor
   relationship. Confirm it still resolves to the same anchor and displays the same
   "Entire "-stripped label as before this feature existed — completely unaffected by anything in
   the Inferred view.

## Edge cases to spot-check

- Generate the Inferred view at the existing node cap (`DEFAULT_MAX_NODES`) for a root with many
  inferred subtypes. Confirm the cap and "more relationships exist" indicator apply.
- Configure `ontograph.umlDiagram.compositionProperties` with a real object property IRI from the
  test ontology, then view the Inferred diagram for a root with a matching restriction. Confirm NO
  composition (diamond) connector ever appears in the Inferred view, regardless of this setting.
- Generate the same Inferred-view diagram twice in a row without any ontology edit in between.
  Confirm the two results are identical (same nodes, edges, `isInferred` flags, and layout).
- Regression check: re-run `src/uml/middleEarRegression.test.ts` and confirm its expected output is
  unchanged — `extractUmlDiagram` (Stated) was reverted to its exact pre-feature behavior.
