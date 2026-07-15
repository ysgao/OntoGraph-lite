# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OntoGraph is a VS Code extension for OWL ontology editing, reasoning, and visualization. It provides a Protégé-like interface for OWL ontologies, with SNOMED CT-scale support.

## Build Commands

### TypeScript Extension
```bash
npm run build           # Production build via esbuild (generates dist/)
npm run build:watch     # Watch mode
npm run compile         # Type-check extension (no emit)
npm run compile:webview # Type-check webview bundles (separate tsconfig)
npm run build:parser    # Regenerate Manchester syntax parser from Peggy grammar
npm run package         # Create .vsix for VS Code marketplace (--no-dependencies)
```
or 
```bash
npm run build-all && npm run package
```

### CLI Package (`cli/`)
```bash
pnpm --filter ontograph-cli build   # Bundle cli/dist/main.js via esbuild
pnpm --filter ontograph-cli test    # Run CLI unit + integration tests (Vitest)
node cli/dist/main.js --help        # Try the CLI locally
```

`cli/package.json` version and the `.version()` string in `cli/src/main.ts` should track the root `package.json` version (they are bumped together, not independently).

To publish: `cd cli && npm publish --access public`. The npm account's 2FA method is a security key (WebAuthn) — the CLI's `--otp` flow only accepts typed TOTP codes, so publishing from a terminal requires a granular access token (Read+write, "bypass 2FA for write actions" enabled) set as `//registry.npmjs.org/:_authToken` in `~/.npmrc`, not the token from `npm login`.

### Java Reasoner Server
```bash
cd java-server && mvn clean package   # Builds fat JAR via maven-shade-plugin
```

The built JAR at `java-server/target/onto-reasoner-server.jar` is used at runtime. Rebuild only needed when changing Java code.

## Running Tests

```bash
npm test                                                   # Run all tests (Vitest)
npm test -- src/parser/FunctionalParser.test.ts            # Single test file
npm test -- src/serializer/FunctionalSerializer.test.ts    # Serializer tests
npm run test:watch                                         # Watch mode
```

Test files: `src/parser/*.test.ts`, `src/parser/__tests__/*.test.ts`, and `src/serializer/*.test.ts`. There are no Java tests.

## Architecture

Three-tier design: TypeScript extension → Java reasoning server (JSON-RPC on stdin/stdout).

**1. Extension Layer** (`src/extension.ts`)
Activates the extension, registers commands and tree views (Classes, Properties, Individuals, Inferred Hierarchy), and holds the in-memory `OntologyModel` and `OntologyIndex` as module-level globals.

**2. Parser Layer** (`src/parser/`)
`ParserRegistry` detects format and dispatches to one of five parsers: `FunctionalParser` (.ofn), `ManchesterParser` (.omn), `TurtleParser` (.ttl/.n3), `OwlXmlParser` (.owl/.owx), `RdfXmlParser`. For large ontologies (above `ontograph.largeOntologyThreshold`, default 50k classes), parsing runs in a Worker Thread via `parserWorker.ts` to avoid blocking the extension host. The Manchester parser is generated from `src/parser/manchester/owl-manchester.peggy` via Peggy.

**3. Model** (`src/model/`)
`OntologyModel.ts` defines core types (OWLClass, ObjectProperty, DataProperty, Individual, axioms). `OntologyIndex.ts` provides fast lookup structures built post-parse. `AxiomDisplay.ts` handles how axioms are rendered in the UI.

**4. Serializer Layer** (`src/serializer/`)
`FunctionalSerializer.ts` round-trips the in-memory model back to OWL Functional Syntax. It uses a Protégé-style entity-cluster arrangement defined by the normative write spec [`ContentArrangementInOWLfunctionalSyntaxDocument.md`](ContentArrangementInOWLfunctionalSyntaxDocument.md):

```
Declarations → Object Property clusters → Data Property clusters →
Annotation Property clusters → Class clusters → GCI axioms → Property chains → )
```

Within each class cluster: annotations first (labels, then other), then `EquivalentClasses`, then `SubClassOf`, then `DisjointClasses`.

**5. Sync Layer** (`src/sync/`)
`AnnotationSync.ts` and `AxiomSync.ts` write changes back to the source file in-place without re-serializing the entire document. They parse prefix maps directly from the file text.

- For `.ofn`/`.omn`: annotation and axiom sync are separate operations.
- For `.ttl`: `AxiomSync` handles both structural and annotation segments in a **single atomic edit** to avoid VS Code document-version conflicts from two concurrent `applyEdit` calls.

**IRI abbreviation rule:** The four RDFS built-in annotation property IRIs are written as abbreviated tokens: `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy`. All other IRIs — including entity IRIs, other annotation property IRIs, and class expression IRIs — use the full `<IRI>` bracket form. This matches Protégé output.

> **⚠️ OWL write format is normative — always consult the format spec.**
> Any code that writes or modifies OWL Functional Syntax — the serializer
> (`FunctionalSerializer.ts`), the in-place sync writers (`AnnotationSync.ts`,
> `AxiomSync.ts`), and entity creation (`EntityCreationSync.ts`) — **MUST**
> conform to [`ContentArrangementInOWLfunctionalSyntaxDocument.md`](ContentArrangementInOWLfunctionalSyntaxDocument.md),
> the authoritative write specification (section & cluster ordering, blank-line
> separation, indentation matching, IRI abbreviation). **Before changing how OWL
> files are produced or edited, read that document; if the behaviour must change,
> update the document in the same commit so spec and code stay in lock-step.**

**6. Commands Layer** (`src/commands/`)
One file per VS Code command: `classifyOntology`, `checkConsistency`, `exportOntology`, `addEntity`, `openVisualization`, `openSparqlEditor`, `openDLQuery`. Commands read the shared `activeModel`/`activeIndex` from `extension.ts`.

**7. Reasoner Bridge** (`src/reasoner/ReasonerBridge.ts`)
Spawns the Java JAR as a child process and communicates via JSON-RPC. Sends requests (classify, checkConsistency, convertFormat, dlQuery) and returns inferred hierarchy/consistency/query results.

**8. Java Server** (`java-server/src/main/java/org/ihtsdo/ontoeditor/`)
`ReasonerServer.java` is the entry point (JSON-RPC on stdin/stdout). `OntologyService.java` wraps OWLAPI 5. Auto-selects HermiT (full OWL 2 DL) or ELK (scalable, for >5k classes) — threshold configurable via extension settings.

**9. Views & Webviews** (`src/views/`, `webview-src/`)
Tree providers populate the sidebar panels. Four webview bundles (graph, entity-editor, sparql-editor, dl-query) are built separately. Messages between extension and webviews are typed in `src/views/*Messages.ts`. `DLQueryPanel.ts` is a singleton panel for DL query execution; `DLQueryState.ts` exports the `temporaryClassIris` set used to inhibit sync-to-disk during in-flight queries.

**10. LSP Server** (`src/lsp/`)
A Language Server Protocol server (`server/server.ts`) provides completions and diagnostics for OWL files. Launched by `client.ts` as a separate Node process.

## Build Outputs (`dist/`)

`esbuild.mjs` produces seven bundles:

| Bundle | Entry | Target |
|--------|-------|--------|
| `extension.js` | `src/extension.ts` | Node/CJS (extension host) |
| `parserWorker.js` | `src/parser/parserWorker.ts` | Node/CJS (Worker Thread) |
| `server.js` | `src/lsp/server/server.ts` | Node/CJS (LSP process) |
| `graph-webview.js` | `webview-src/graph/GraphViewApp.ts` | Browser/IIFE |
| `entity-editor-webview.js` | `webview-src/entity-editor/EntityEditorApp.ts` | Browser/IIFE |
| `sparql-editor-webview.js` | `webview-src/sparql-editor/SparqlEditorApp.ts` | Browser/IIFE |
| `dl-query-webview.js` | `webview-src/dl-query/DLQueryApp.ts` | Browser/IIFE |

## Key Files

| File | Role |
|------|------|
| `src/extension.ts` | Extension activation; command + view registration; global model state |
| `src/model/OntologyModel.ts` | Core OWL data structures |
| `src/parser/ParserRegistry.ts` | Format detection and parser dispatch |
| `src/serializer/FunctionalSerializer.ts` | Model → OWL Functional Syntax |
| `src/sync/AxiomSync.ts` | In-place axiom writes back to source file |
| `src/sync/AnnotationSync.ts` | In-place annotation writes back to source file |
| `src/reasoner/ReasonerBridge.ts` | Java process lifecycle + JSON-RPC |
| `src/views/DLQueryPanel.ts` | Singleton DL query panel; TempClass lifecycle management |
| `src/views/DLQueryState.ts` | Exports `temporaryClassIris` set; inhibits sync during in-flight queries |
| `java-server/.../ReasonerServer.java` | Java entry point |
| `java-server/.../OntologyService.java` | OWLAPI 5 wrapper |
| `esbuild.mjs` | Build config — 7 output bundles |
| `ContentArrangementInOWLfunctionalSyntaxDocument.md` | **Normative** write spec for OWL Functional Syntax (ordering, blank lines, indentation, IRI abbreviation) — consult before any OWL-file write change |

## Code Style

This project follows the **Google TypeScript Style Guide** (enforced via `conductor/code_styleguides/typescript.md`). Key rules:

- `const`/`let` only — `var` is forbidden
- Named exports only — no default exports
- Single quotes for strings; template literals for interpolation
- No `any` type — prefer `unknown` or a specific type
- No type assertions (`as SomeType`) unless unavoidable with justification
- `UpperCamelCase` for types/interfaces/enums, `lowerCamelCase` for variables/functions
- No `_` prefix or suffix on identifiers (including private fields)
- No `public` modifier (it's the default); use `private`/`protected` to restrict
- `===` and `!==` for equality; always explicit semicolons
- No new runtime dependencies without documented rationale and explicit approval

## Governance & Workflow

All development in this repository is governed by the **[OntoGraph Constitution](file:///.specify/memory/constitution.md)**, which supersedes other practices in case of conflict.

### Conductor Workflow (`conductor/`)

The `conductor/` directory contains project management documents:

- `tracks.md` — top-level index of major work tracks
- `product.md` / `product-guidelines.md` — product vision and constraints
- `workflow.md` — full TDD workflow specification
- `code_styleguides/` — language-specific style rules
- Per-track plan files in `conductor/tracks/<track>/plan.md`

**Task lifecycle** (see `conductor/workflow.md` for full detail):

1. Mark task `[~]` in `plan.md` before starting
2. **Red phase:** write failing tests first; confirm they fail before implementing
3. **Green phase:** implement minimum code to pass tests
4. Commit code; attach summary via `git notes add -m "<summary>" <sha>`
5. Update task to `[x] <7-char-sha>` in `plan.md`; commit with `conductor(plan):` scope

**Quality gates before marking a task complete:** all tests pass, coverage >80%, no type errors (`npm run compile`), OWL Functional Syntax ordering preserved, large ontology benchmark passes (`test-ontologies/bfo-core.ofn`).

Commit convention: `<type>(<scope>): <description>` where type is `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Conductor commits use `conductor(plan):` scope.

## Supported Formats

OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`/`.owx`), Turtle/N-Triples (`.ttl`/`.n3`).

## Test Ontologies

`test-ontologies/` contains sample files for manual testing:
- `animals.omn` / `animals.owx` / `animals.ttl` — small examples for all formats
- `bfo-core.ofn` — large (~94 KB) BFO ontology for performance testing
- `pizza.owl` — OWL/XML format example (~163 KB)
- `bfo-classes-only.ofn` — minimal BFO classes

## OWL File Operations — Use the CLI

When working with `.ofn`, `.omn`, `.ttl`, `.owl`, `.owx` files, use `ontograph` rather than reading raw text:

```bash
ontograph parse <file>                    # entity counts, format, ontology IRI
ontograph search <file> <query>           # find entities by label or IRI substring
ontograph validate <file>                 # structural error check
ontograph convert <file> --to functional  # normalize to OWL Functional Syntax
```

All output is JSON on stdout. Parse it directly. Exit 0 = success, non-zero = error (`errorCode` field identifies type).

Bridge commands (require OntoGraph active in VS Code):
```bash
ontograph classify             # run reasoner classification
ontograph check-consistency    # OWL 2 DL consistency check
ontograph dl-query "<expr>"    # Manchester Syntax DL query
```

Install: `npm install -g @ysgao/ontograph-cli`

## Recent Changes
- 026-generate-uml-diagram: Right-click "Generate UML Diagram" context-menu entry (`ontograph.generateUmlDiagram`, same `view/item/context` availability as "Open Graph") opens a webview showing a UML-style diagram rooted at the selected class — composition (part-of, filled diamond) and generalization (subtype, hollow triangle) connectors derived purely from the ontology's own axioms, with no AI/LLM involvement of any kind; `src/uml/partOfGraph.ts` extracts and classifies relationships via TWO distinct traversals, not a single bidirectional BFS (an earlier version that expanded ancestors recursively caused a combinatorial explosion the moment a hop reached a generic hub concept, e.g. SNOMED's "Body structure" with tens of thousands of subtypes — going up to the hub then back down floods the diagram and starves out genuinely relevant nodes before the node cap even triggers): (1) direct ancestors of the focus entity only, one hop via its own conjuncts, never expanded further (mirrors `buildGraphData`'s "direct supertype pre-pass" in `src/commands/openVisualization.ts` — always shown, not part of the depth-based BFS) — this is what makes the diagram show *something* for whichever class the user clicks, not just pre-selected "whole" concepts, since most classes only ever declare their own superclass; (2) multi-hop downward BFS via a reverse index (who declares itself a subtype/part of the current frontier), `depth` hops, mirroring `buildGraphData`'s frontier/visited-set/node-cap shape; `resolveAnchor()` implements `uml-diagram-generation-spec.md` §3's clinical-structure/continuant-split resolution (SNOMED models e.g. "Middle ear structure" as `EquivalentClasses(Body structure ⊓ Laterality ⊓ AllOrPartOf(Entire middle ear))` — the real part-of children attach to the separate "Entire middle ear" concept, not to "Middle ear structure" itself) applied lazily at every level of the downward expansion (`getDownwardEntries`, memoized) since the duplicate pattern recurs throughout the hierarchy, not just at the root — the anchor concept is never itself rendered as a node; conjuncts are parsed by the new `parseConjuncts()` helper in `src/utils/ManchesterFormatting.ts`; `ontograph.umlDiagram.compositionProperties` setting lets the user designate which object properties count as composition — not limited to a fixed vocabulary — defaulting to SNOMED's four part-of properties (Constitutional/Regional/Systemic/Proper part of) since anatomy.owl is this project's reference ontology; `ontograph.umlDiagram.defaultDepth` controls the initial depth, with an in-webview depth slider (`requestDepthChange` message) re-rendering in place; new `src/uml/layout.ts` computes a deterministic tidy-tree layout consumed by the webview as fixed Cytoscape `preset` positions; a relationship using an unconfigured property is excluded from the diagram but surfaced as a visible per-node badge (`excludedRelationsBadge.ts`), never silently dropped; `src/uml/` has zero VS Code API imports so a future CLI command can reuse it via the existing `@core/*` alias without reimplementation — CLI exposure itself is deferred; `test-ontologies/uml-fixture.ofn` fixture covers bare-subclass, configured/unconfigured-property restrictions, an isolated node, a dual-relationship node, a part-of cycle, and a synthetic clinical/continuant anchor pair; `src/uml/middleEarRegression.test.ts` validates against the real anatomy.owl "Middle ear structure" case (skipped when anatomy.owl, not committed to the repo, is absent), printing the generated node/edge/excluded-relation list for manual comparison against the hand-built `uml-diagram-cli-plan/middle-ear-structure.drawio` reference (an exact match isn't expected — that reference used several hand-curated pedagogical re-nestings a mechanical tool intentionally doesn't replicate, per the spec's own "not a byte-exact golden file" caveat). New right-click "Export UML Diagram to draw.io..." command (`ontograph.exportUmlDiagramDrawio`, same context-menu availability) via new `src/uml/drawioRenderer.ts`: renders the same extraction+layout data as native mxGraph XML (matching `uml-diagram-cli-plan/gen_drawio.py`'s conventions — composition = filled diamond at the parent/whole end, generalization = hollow triangle at the parent/supertype end), added as an independent, directly-testable verification path (no live VS Code needed) after the webview's Cytoscape rendering couldn't be confirmed working from data alone; `pickConnectionPoints()` computes the mxGraph `exitX/exitY/entryX/entryY` connector points from each edge's ACTUAL relative node position (unlike the hand-built script's fixed "parent always above child" assumption) since an ancestor edge can have its "parent" positioned below its "child" in the tidy layout — unit-tested against all four quadrants plus the straight-vertical case, per spec §8.1's own requirement. SVG/PNG export (also requested) is not yet implemented — draw.io's own desktop/CLI export (`--export --embed-diagram`) is the documented manual path per spec §8.1 in the interim. **Follow-up**: the Cytoscape webview turned out to still be broken (showed only one node); replaced entirely with a server-computed HTML/SVG fragment (new `src/uml/diagramGeometry.ts` — shared-bus edge routing matching `gen_html_diagram.py`/`gen_html_diagram_liver.py`'s conventions, generalized for computed positions; new `src/uml/htmlRenderer.ts` — `renderDiagramFragment()` for the webview, `renderStandaloneSvg()` for SVG export) that the webview now just injects via `innerHTML` with one delegated click listener — no rendering logic left client-side, Cytoscape dropped from this bundle (437KB → 5.3KB). `UpdateDiagramMessage` gained `svg`/`nodesHtml`/`canvasWidth`/`canvasHeight`; new `RequestExportMessage` backs three toolbar export buttons (draw.io/SVG/PNG) plus matching `ontograph.exportUmlDiagramSvg`/`...Png` commands, all funneled through one `exportUmlDiagram()` so command-palette and webview-button paths can't drift apart. PNG export shells out to the local draw.io desktop CLI (`src/uml/drawioCli.ts`, `--embed-diagram` for an editable PNG per spec §8.1, with the scale-1 fallback spec §8.1 documents for wide diagrams) and falls back to a clear error + "export as draw.io instead" offer if the CLI isn't found. Verified against the real anatomy.owl liver structure (43 nodes/46 edges at depth 2, zero position overlaps) as well as middle ear. **Second follow-up**: user reported the exported diagrams still had overlapping edges, mismatched box styling, and incorrect class/relationship selection, traced to mixing SNOMED's clinical concepts with their separate "Entire X" continuant concepts (only the latter carry the real part-of axioms) in the same graph via lazy per-node anchor splicing; `partOfGraph.ts` redesigned so `resolveAnchor()` runs once up front and ALL traversal (ancestor pass + downward BFS) happens purely in "Entire X" space (`rootIri`, not `focusIri`, is the diagram root) — the lazy splicing mechanism is removed entirely; new `stripEntirePrefix()` strips the leading "Entire " at display time only, so labels read "Liver" not "Entire liver"; `layout.ts` now clusters a parent's children by edge kind (composition before generalization) to stop their bus lines interleaving; `diagramGeometry.ts` gained `PARENT_STEM_SPREAD` — the actual root cause of reported marker overlap, where a parent with both composition and generalization children previously had both bus groups exit at the identical x-coordinate, landing the diamond and triangle on top of each other; new `src/uml/branchColors.ts` assigns each of the root's direct descendant branches a distinct color via BFS propagation (mechanical/structural, not semantic, per the "no AI/LLM judgment" principle) for the reference diagrams' category-style look. Verified programmatically against real anatomy.owl (middle ear + liver): no label contains "entire", no two nodes share layout coordinates, no two marker-carrying edge segments share an anchor point. **Third follow-up**: user reported the exported draw.io diagram still had edges drawn through class boxes, traced to two causes — (1) `drawioRenderer.ts` supplied only fixed connection points plus `edgeStyle=orthogonalEdgeStyle` and left the actual path to mxGraph's own automatic router, which has no notion of sibling boxes and can route straight through one; fixed via new `computeEdgeRoutes()` in `diagramGeometry.ts` (a per-edge-id counterpart to the existing segment-based `computeEdgeSegments()`) that supplies the exact elbow via-points as an explicit `<Array as="points">`, with `edgeStyle` left unset so mxGraph draws straight lines through them instead of auto-routing — draw.io export can no longer diverge from the webview's own routing. (2) The deeper bug, affecting the webview too: `partOfGraph.ts`'s one-hop ancestor pre-pass assigned the ancestor the same `depth: 1` as the root's own children, so `layout.ts` placed it on the identical row, and the ancestor's off-axis bridge edge swept a straight horizontal segment across that shared row, straight through whichever children sat between; fixed by giving ancestors `depth: -1` (their own row, always above the root) with `layout.ts`'s `computeLayout()` now normalizing so `y` stays non-negative (`shift = -min(0, minDepth) * ROW_HEIGHT`). A new programmatic box-intersection check (walking every edge's full waypoint chain against every other node's box) found 13 violations (middle ear) / 26 (liver) before the fix, 0 after. **Fourth follow-up (node exclusion feature)**: per user request, users can now click a node in the diagram (any node but the root) to mark it, then press "Regenerate" to redraw without marked nodes — new `src/uml/nodeExclusion.ts` (`applyNodeExclusions`, 18 tests) offers two user-selectable modes: `'subtree'` (remove the node and everything reachable only through it, via reachability-from-root recomputation) and `'splice'` (remove just the node, reconnecting its children to the nearest surviving ancestor, cycle-safe). Both modes finish with a cycle-safe LONGEST-path-from-root depth renumbering (not shortest-path BFS) — a shortest-path assignment can leave a dual-relationship node (FR-011) level-with or above a farther surviving parent, resurrecting the box-crossing bug in general form; verified via an exhaustive per-node/per-mode sweep against real anatomy.owl (0 violations, versus 11 before the fix). Exclusions accumulate ACROSS repeated Regenerate clicks (never silently replaced) for the current focus entity, and reset only via an explicit "Reset exclusions" click, refocusing a different entity, or closing the panel — never via Regenerate itself. New `webview-src/uml/exclusionControl.ts` mirrors `depthControl.ts`'s message-builder convention. **Fifth follow-up**: per further direction, excluded-relationship info moved OUT of the class box entirely into a plain-text "Excluded relationships" notes section below the diagram in the HTML webview only (`ExcludedRelation` gained `fromLabel`/`propertyLabel`/`targetLabel`, resolved once in `partOfGraph.ts`) — `renderDrawio()`/`renderStandaloneSvg()` deliberately never render it, since an exported file should contain only the diagram. The three export commands (`ontograph.exportUmlDiagramDrawio`/`...Svg`/`...Png`) were removed from the class right-click context menu (redundant with the UML panel's own toolbar export buttons) while the commands themselves stay registered. Also found and fixed a real rendering bug in the drawio export: `computeEdgeRoutes()` could emit two IDENTICAL waypoints for the common single-child case, a degenerate zero-length segment that made the connecting line into the diamond/triangle marker appear disconnected — fixed via a new `dedupeConsecutive()` helper; and a related bus-line placement bug where a multi-row-spanning edge (from splice-mode level-collapsing) placed its horizontal bus sweep at the midpoint of the gap, which could fall inside an intermediate row and cross other boxes — fixed by anchoring the bus a small fixed distance below the parent instead of at a proportional midpoint. **Sixth follow-up (left-to-right layout)**: per user request, the diagram can now lay out left-to-right (depth → columns, siblings → rows) as an alternative to the long-standing top-to-bottom default (still the default everywhere — a new `LayoutDirection = 'TB' | 'LR'` type in `diagramModel.ts`, `ontograph.umlDiagram.defaultDirection` setting default `'TB'`, and a new in-webview "Layout" toolbar `<select>` mirroring the depth slider's `requestDepthChange` pattern via a new `requestDirectionChange` message / `webview-src/uml/directionControl.ts`). Rather than duplicating the tidy-tree/bus-routing math per direction, `layout.ts` computes the same flow(depth)/cross(sibling) quantities as before and only swaps which screen axis each maps to at the very end (plus direction-specific spacing constants — `COLUMN_WIDTH`/`SLOT_HEIGHT` alongside the existing `ROW_HEIGHT`/`SLOT_WIDTH`, since a column's spacing must clear `NODE_WIDTH` while a TB row only needs to clear `NODE_HEIGHT`, and vice versa for cross-axis spacing); `diagramGeometry.ts`'s `computeEdgeSegments`/`computeEdgeRoutes` gained a `direction` param implemented as a transpose-in/run-existing-TB-logic/transpose-out wrapper (swap x/y on input positions and node dimensions, run the unchanged bus/off-axis routing, swap the output path coordinates — or `exitX/exitY`+`entryX/entryY` fraction pairs for routes — back) rather than rewriting the routing logic per axis, since both directions store the identical flow/cross quantities just assigned to opposite screen axes. New shared `boxRect()` helper in `diagramGeometry.ts` centralizes the direction-dependent box-position convention (TB: `x` is horizontal center/`y` is top edge; LR: `x` is left edge/`y` is vertical center — the mirror image) so `htmlRenderer.ts`/`drawioRenderer.ts`/`renderStandaloneSvg` can't compute node-box placement inconsistently with each other. `direction` threads through every webview↔host message alongside `depth` (`RequestDiagramMessage`/`RequestDepthChangeMessage`/`RequestRegenerateMessage`/`ResetExclusionsMessage`/`RequestExportMessage` all gained a `direction` field; new `RequestDirectionChangeMessage`) rather than being a separate persistent setting, matching how `depth` itself is session-adjustable per open panel. `buildDiagramMessage`'s public signature is unchanged (`direction` folded into the existing `ExtractOptions` bag, defaulting to `'TB'`) so no pre-existing call site needed updating. **Seventh follow-up (far-child bus routing)**: user reported a specific real-anatomy.owl crossing (via the draw.io export) between "Tympanic cavity"'s composition edge to "Tympanic ostium of eustachian tube" and "Ostium of eustachian tube"'s own incoming stem — the same root cause as an earlier, since-reverted attempt (a dual-relationship child, FR-011, dragging its parent's shared bus far enough sideways to sweep through an unrelated sibling's stem sitting in the row directly below), but fixed this time via the user's own more targeted proposal: rather than notching the shared bus's line around the obstacle (the earlier attempt's approach, which visibly broke other cases), a "far" child — one that does NOT sit at its bus group's own shallowest row — is excluded from the shared bus entirely and routed independently by new `computeSafeJogY()` in `diagramGeometry.ts`: descend straight down the PARENT's own exit column (not the child's) past whatever's in the way, THEN jog sideways only once safely below it. `computeBusGroupPlacements`'s existing vertical bus-push pass couldn't fix this on its own (the blocking stem's span covered the entire row-to-row gap, leaving no push-to height clearing it), and pushing the WHOLE shared bus down would have dragged the near child (sharing the same bus) down with it for no reason — keeping the far child's routing independent means the near child's rendering is completely untouched. `computeSafeJogY` is a NEW, separate, deliberately simpler function (straight-down push only, no left/right exploration) rather than a generalization of the existing `computeStemDetour` — the earlier reverted attempt tried reusing/rotating that function for the bus line and introduced subtle regressions elsewhere; keeping this fix additive and narrowly scoped (only "far" children — same-row children are entirely unaffected, confirmed by all 147 pre-existing UML tests passing unchanged) avoided repeating that mistake. Applied in both `computeEdgeSegmentsCore` (webview) and `computeEdgeRoutesCore` (draw.io/SVG export) so neither can drift from the other. Verified via a hand-built fixture using the exact node/edge coordinates from the user's own draw.io export (not the real anatomy.owl file itself, per standing instruction to let the user verify visually) checked against both an edge-vs-edge crossing detector AND an edge-vs-node-box detector — zero violations on both the webview segment output and the draw.io route output; a permanent regression test pair (`diagramGeometry.test.ts`'s "far-child (dual-relationship) bus routing" describe block) locks in the exact expected path for both renderers. **Eighth follow-up (shared-children sibling reordering)**: per user request (citing `Middle-ear-structure-uml.drawio` where node4/node6 both break down into a shared subnode8 while node5 doesn't), same-depth siblings that share a child are now regrouped adjacent to one another rather than left in raw edge-declaration order — `layout.ts`'s `childrenByParent` construction is now two-pass: a `rawChildrenByParentByKind` map (declaration-order, deduped, kind-separated) is built first so every node's own child SET is known before any node's final child ORDER is decided, then a new `reorderBySharedChildren()` groups each parent's same-kind children via union-find on "shares ≥1 direct child" (transitively, so a 3-way share still forms one cluster), preserving first-occurrence order for both the group sequence and each group's internal member order — a minimal, order-preserving reorder rather than a full sort, so an unrelated sibling never jumps position for no reason. Reordering is scoped within each kind bucket (composition/generalization), never across, so it can't undo the existing kind-clustering invariant (`ROW_HEIGHT`/`COLUMN_WIDTH`'s bus-separation guarantee from the second follow-up). Applies recursively at every depth (it runs once per parent while building the shared `childrenByParent` map that `assignLeafSlots` then recurses over), not just the top level, since the sharing pattern recurs throughout the hierarchy the same way the clinical/continuant split did. 3 new tests in `layout.test.ts` (the literal node4/node5/node6/subnode8 case, a no-sharing no-op check, and a 3-way shared-child cluster check) plus all 236 pre-existing UML/command tests pass unchanged. **Ninth follow-up (shared-node color blending)**: per user request, a node shared between two branches (subtype/part of two parents, FR-011) now gets a visually distinct BLENDED color instead of silently inheriting whichever parent's branch color happened to be assigned first — `branchColors.ts`'s `computeBranchColors()` is redesigned from a single first-visited-wins BFS into a direct-parent color resolver: a node with exactly one distinct direct-parent color simply inherits it (unchanged branch-wide propagation), while a node with two or more distinct direct-parent colors gets `blendColors()` — a new plain RGB-channel average across `fill`/`stroke`/`font` — producing an in-between color found in neither parent's own palette entry, so it reads as visually different from an ordinary non-shared sibling sitting next to it (the immediately preceding sibling-reordering follow-up already places such nodes adjacent to their sharing parents; color is the complementary signal for the same relationship). Resolution runs as a fixed-point relaxation (bounded to `nodes.length + 1` passes) rather than a single topological pass, specifically because a part-of cycle can put a node's "parent" at an arbitrary distance from the root — an external distance/depth-based processing order isn't safe here (a dual-relationship node's second, deeper-branch parent might not be resolved yet when the shallower-branch parent's turn comes up); each pass recomputes every node's color from whichever direct parents are CURRENTLY resolved, and since the resolved set only grows monotonically pass over pass, it converges within the longest parent-chain's length. A node that never gains a resolvable parent (a cycle-only island with no branch entry point) is deliberately left uncolored — both renderers (`htmlRenderer.ts`, `drawioRenderer.ts`) already fall back to `DEFAULT_COLOR` for any node missing from the map, so this isn't a new fallback path. 4 new tests in `branchColors.test.ts` (literal two-parent blend with the exact RGB-average assertion, same-color-parents no-op-blend check, blend propagating to a shared node's own descendants, and a part-of-cycle termination/no-throw check) plus all 5 pre-existing `branchColors.test.ts` tests and all other UML/command tests (243 total) pass unchanged. **Tenth follow-up (warm/cool contrast for sharing branches)**: per user request — two branch roots that share a descendant should get contrasting temperature schemes (one warm, one cool), not just "any two different hues," while non-sharing neighbors need no special treatment — each `PALETTE` entry gained a curated `scheme: 'cool' | 'warm'` tag (by eye, against this specific fixed 8-color set; split into `COOL_PALETTE`/`WARM_PALETTE`), and `computeBranchColors()`'s branch-root assignment is no longer a flat `PALETTE[idx % length]` cycle: it first computes each branch root's reachable-descendant set (BFS, cycle-safe) and flags any pair whose sets overlap as "sharing," then greedily assigns schemes — a branch root takes the OPPOSITE scheme of an already-decided sharing neighbor where that's unambiguous, or alternates for baseline variety when it has no sharing neighbor yet (or neighbors already disagree, e.g. a 3-way mutual share, which can't be properly 2-colored — deliberately best-effort there, not a hard guarantee, since it's a rarer structural case) — only then are concrete colors assigned by cycling each scheme's own 4-entry sub-palette independently. This sits upstream of the existing direct-parent color-merge/blend logic (Ninth follow-up) unchanged: the blend still runs on whatever concrete colors the branch roots ended up with, so a shared node descending from a now-contrasting warm/cool pair blends into a correspondingly more distinct in-between color too. 3 new tests in `branchColors.test.ts` (two sharing roots land in opposite schemes, non-sharing roots get no scheme assertion — just distinctness, and a non-adjacent-pair share, e.g. root order a/b/c where only a and c share, still pulls those two to opposite schemes) plus all 243 pre-existing tests (246 total) pass unchanged. **Eleventh follow-up (LR is now the default layout)**: per user request, `ontograph.umlDiagram.defaultDirection`'s package.json default changed from `'TB'` to `'LR'` — every other `'TB'` fallback that exists purely to mirror this same product default was updated alongside it so none of them silently disagree: `generateUmlDiagram.ts`'s `currentDefaultDirection` initial value and its two `cfg.get(...) ?? 'TB'` config-read fallbacks, `buildDiagramMessage`/`extractAndLayout`'s own `options.direction ?? 'TB'` internal defaults (exercised when a caller, e.g. a test, omits `direction` entirely), and the webview's `directionControl.ts` `DEFAULT_DIRECTION` constant plus the toolbar `<select>`'s hardcoded `selected` attribute in `UmlDiagramApp.ts` (covers the brief window before the host's first `updateDiagram` response arrives over the `'ready'` handshake — without this the toolbar would flash "Top → Bottom" before flipping to "Left → Right"). Deliberately NOT changed: the low-level pure functions' own parameter defaults (`layout.ts`'s `computeLayout`, `diagramGeometry.ts`'s `computeEdgeSegments`/`computeEdgeRoutes`, `htmlRenderer.ts`, `drawioRenderer.ts` — all still default to `'TB'`), since production code always resolves and passes an explicit `direction` before calling them; changing those defaults would touch several more test files' own "defaults to TB when omitted" assertions for a default value genuinely never hit in practice. Updated the two tests whose expectations were pinned to the old default (`generateUmlDiagram.test.ts`'s direction-default test, `directionControl.test.ts`'s `DEFAULT_DIRECTION` test) to assert `'LR'` instead — both now additionally exercise the non-default `'TB'` path explicitly, so 'TB' stays covered too. All 246 tests pass. **Twelfth follow-up (lateralized-classes toggle + shared depth renumbering)**: per user request, SNOMED's Left/Right lateralized variant classes (e.g. "Left kidney", asserted as `SubClassOf(Kidney and (Laterality some Left))`) are now hidden from the diagram by default, since they roughly double the sibling count of any bilateral anatomical structure without adding structural information — `partOfGraph.ts` gained `isLateralized()`, matching a class's OWN conjuncts against SNOMED's Laterality property (`272741003`) with a target of Left (`7771000`) or Right (`24028007`) specifically (the generic, unspecified-side qualifier `Side` does NOT count — a class asserting `Laterality some Side` is the bilateral reference concept itself, not a lateralized variant of it); `extractUmlDiagram()`'s return value gained `lateralizedIris: string[]`, and a new "Show full subhierarchy" / "Hide lateralized classes" toolbar toggle button in `UmlDiagramApp.ts` (backed by `webview-src/uml/lateralizedControl.ts`'s `buildRequestToggleLateralizedMessage()`, mirroring `depthControl.ts`/`exclusionControl.ts`'s pure-helper convention) lets the user reveal them per session. Implemented as a session-only toggle (`generateUmlDiagram.ts`'s `currentIncludeLateralized`, default `false`), independent of the node-exclusion feature: it resets when a different entity becomes the focus or the panel closes (same as `currentExcludeIris`), but is deliberately NOT cleared by "Reset exclusions" — a dedicated `RequestToggleLateralizedMessage`/`includeLateralized` field (`UmlDiagramMessages.ts`) keeps the two controls independent. Unlike the exclusion set, which is seeded once and then held fixed, `includeLateralized` is consulted fresh on every `extractAndLayout()` call (folded into the effective exclusion set only at extraction time, never persisted into `currentExcludeIris` itself), so a lateralized node that only becomes reachable after the user later increases the depth slider is still filtered correctly rather than only catching what was visible at toggle time. While building this, found and fixed a real, independent bug in `partOfGraph.ts`'s initial extraction: a dual-relationship node (FR-011) discovered via one parent during BFS kept that parent's shortest-path depth even when a second, much deeper parent also pointed at it — reproducing the Fourth follow-up's box-crossing bug, but during ordinary diagram generation rather than only after node exclusion (reported case: "Tympanic ostium of eustachian tube" rendered above its own generalization parent "Ostium of eustachian tube" because a shallower composition parent, "Tympanic cavity," discovered it first). Fixed by extracting `nodeExclusion.ts`'s existing longest-path-from-root renumbering into a shared `src/uml/depthNormalization.ts` (`renumberDepthsLongestPath()`, unchanged logic — cycle-safe, ancestors seeded at depth `-1`) and applying it directly inside `extractUmlDiagram()` as well, not just after exclusion. No new settings added — the toggle is UI/session state only.
- 025-show-inferred-equivalent-class: Entity Editor shows a read-only, red "Inferred Equivalent Class" section between GCI and DisjointWith for classes with reasoner-derived, unasserted equivalences (named class, complex expression, or multiple classes); `OntologyService.buildClassificationResult` (Java) computes per-class equivalences via `reasoner.getEquivalentClasses`, narrowing complex-expression candidates to two-way `SubClassOf` cycles only (avoids `OutOfMemoryError` at SNOMED-CT scale — verified against `anatomy.owl`, ~75k classes); new `equivalentClasses` field flows through the classify JSON-RPC response → `ReasonerBridge.ClassificationResult` → `OntologyModel.inferredEquivalentClasses` (populated in `classifyOntology.ts`) → `LoadEntityMessage.inferredEquivalentClassIris`/`inferredEquivalentClassExpressions` (only when classified and non-stale) → webview; `webview-src/entity-editor/manchesterCodeMirror.ts` extracted (Manchester language/theme/clickable-entity decorations, shared with a new read-only renderer) and `readOnlyExpressionEntry.ts` added for the section's non-editable, clickable-reference rendering; section key is never read by `getCurrentState()`, so it never appears in the save/dirty-check payload; `vitest.config.ts` `include` extended to `webview-src/**/*.test.ts` (previously silently excluded from `npm test`)
- 019-create-entity: Per-panel toolbar buttons create new OWL entities (Class/ObjectProperty/DataProperty/AnnotationProperty/Individual); focused entity becomes parent via SubClassOf/SubObjectPropertyOf/SubDataPropertyOf/SubAnnotationPropertyOf; `ontograph.entity.defaultNamespace` setting controls IRI prefix; `src/utils/namespaceUtils.ts` + `src/sync/EntityCreationSync.ts` + `src/sync/IriRenameSync.ts` added; IRI field in Entity Editor upgraded from read-only span to editable input with rename-propagation; `FunctionalSerializer.generateEntityCluster` extended to emit SubAnnotationPropertyOf axioms; `EntityEditorPanel` wires `renameIri` message → `IriRenameSync` → file write → tree refresh
- 014-entity-editor-undo-redo: Added TypeScript 5 (strict mode), Node.js (extension host), Browser (webview iframe) + VS Code Extension API (existing), existing webview message bus (`postMessage`)
- 013-entity-search-partial-match: Cross-field token matching across `rdfs:label`/`skos:prefLabel`/`skos:altLabel` (tokens may span multiple fields); entity-name exact match via `localNameToIri` index (score 200, ranks first); local name removed from substring search (prevents partial SNOMED ID matches); anatomy.owl benchmark added
- 012-load-large-ontology: `loadOntologyFile` command + toolbar button (`$(folder-opened)`) loads any-sized ontology via `vscode.workspace.fs.readFile`; `createLargeFileListener` shows notification for VS Code large-file conditions; `reloadOntology` refactored from `openTextDocument` to `workspace.fs.readFile`; `setupFileWatcher` extracted from `handleDocument` to shared helper

## Active Technologies
- TypeScript 5 (strict mode), Node.js (extension host), Browser (webview iframe) + VS Code Extension API (existing), existing webview message bus (`postMessage`) (019-create-entity)
- `queueSyncWrite` + `writeTextStreamed` for all file mutations; `OntologyIndex.getByIri` for duplicate-IRI guard; `buildModelSegmentIndex` forced after entity insert/rename; `setRefreshAllViews` callback registered from `activate()` so EntityEditorPanel can trigger tree-view refresh (019-create-entity)
- In-memory only — `Map<entityIri, EntityEditHistory>` on the extension host; no persistence (014-entity-editor-undo-redo)

<!-- SPECKIT START -->
Plan: specs/026-generate-uml-diagram/plan.md
<!-- SPECKIT END -->
