# Quickstart: Verifying the Layered Graph Layout Fix

## Automated

```bash
npm test -- src/uml/layout.test.ts
npm test -- src/uml/diagramGeometry.test.ts
npm test -- src/uml/middleEarRegression.test.ts   # skips automatically without test-ontologies/anatomy.owl
npm test -- src/uml                               # full uml/ suite, including the new overlap/crossing test file
```

The new overlap/crossing test file (added by this feature) should show **zero** node-node and
node-edge overlaps and a crossing count no higher than before, for:
- the middle-ear-structure sample (existing regression fixture)
- at least one synthetic fixture with 4+ levels and a node reachable from two parents at
  different depths

## Manual, in the running extension

1. `npm run build` (or `npm run build:watch`), then F5 to launch the Extension Development Host
   (see CLAUDE.md's F5 workflow notes — fully stop/relaunch rather than using in-place Restart).
2. Open `test-ontologies/animals.omn` or another loaded ontology with a multi-level part-of/
   subtype hierarchy (4+ levels), right-click an entity with that depth of structure, choose
   "Generate UML Diagram."
3. Increase the depth control until the diagram spans 4+ levels; visually confirm no box overlaps
   another box and no connector line cuts through an unrelated box.
4. Export the same diagram to draw.io, SVG, and PNG (existing export commands); open each and
   confirm the same non-overlapping arrangement as the editor panel.

## Manual, against the reported reference case

Regenerate the middle-ear-structure UML diagram from `test-ontologies/anatomy.owl` (if present
locally; not committed to the repo) via the in-editor command described above, and compare the
result against the pre-fix `uml-diagram-cli-plan/Middle-ear-structure-uml.drawio` — the file that
originally demonstrated the overlap/crossing defect — to confirm those overlaps and crossings are
gone in the regenerated version.
