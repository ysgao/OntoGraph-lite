# Quickstart: Generate UML Diagram

Manual end-to-end verification steps once the feature is implemented. These map directly onto the
spec's acceptance scenarios and success criteria.

## Setup

1. `npm run build-all` (or `npm run build` for the extension alone) and launch the Extension
   Development Host (F5 in VS Code), or install the built `.vsix`.
2. Open a test ontology with known structure, e.g. `test-ontologies/animals.omn` for a quick check,
   or `test-ontologies/bfo-core.ofn` / `anatomy.owl` for the large-ontology performance check
   (spec SC-001, SC-005).
3. (Optional, to exercise composition connectors) Set
   `ontograph.umlDiagram.compositionProperties` in Settings to one or more object property IRIs
   present in the loaded ontology that express a part-of style relationship.

## Story 1 — Generate a diagram

1. In the Classes panel, right-click a class with known subclasses (and, if configured, a known
   part-of relationship). Confirm "Generate UML Diagram" appears in the context menu next to
   "Open Graph."
2. Click it. Confirm a new webview panel opens within ~5 seconds showing the selected class as the
   root node.
3. Confirm subclasses render connected by a hollow-triangle (generalization) connector pointing at
   the root.
4. If composition properties are configured, confirm part-of-related classes render connected by a
   filled-diamond (composition) connector at the whole.
5. Right-click a leaf class with no subclasses and no configured part-of relationships. Confirm the
   diagram opens showing just that one node, no error.

## Story 2 — Adjust depth

1. With a diagram open for an entity with at least two levels of descendants, move the depth
   control up. Confirm additional levels appear within ~3 seconds, without the panel closing/reopening.
2. Move the depth control down. Confirm the diagram narrows, and the root entity remains visible
   throughout.
3. Set the depth control to its maximum against an entity whose relationships extend deeper.
   Confirm a visible indicator (not silent truncation) shows that further relationships exist.

## Story 3 — No AI/network dependency

1. Disconnect from the network (or otherwise ensure no AI/LLM service is reachable).
2. Repeat Story 1 end to end. Confirm the diagram generates with no degradation and no error
   referencing an unreachable service.
3. Generate the same diagram for the same entity twice in a row. Confirm the two results are
   identical in nodes, edges, connector classification, and layout (spec SC-003).

## Edge cases to spot-check

- A class involved in a part-of cycle (if one exists in the loaded ontology, or construct a small
  fixture with one): confirm the diagram renders without hanging and the cyclical relationship
  remains visible.
- A class with a very large number of relationships (e.g., a high-fan-out SNOMED concept in
  `anatomy.owl`): confirm the view stays responsive and clearly indicates the cap was reached.
- A relationship using an object property that is neither a subclass axiom nor in
  `ontograph.umlDiagram.compositionProperties`: confirm it is excluded from the diagram but its
  exclusion is visibly noted, not silently dropped.
