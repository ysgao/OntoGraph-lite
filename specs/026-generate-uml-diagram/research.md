# Phase 0 Research: Generate UML Diagram

All items below were unknowns in the Technical Context, resolved by reading the existing codebase
directly (no external research needed — this is an established codebase with clear precedent for
every unknown).

## 1. Can the existing webview rendering library express UML notation?

**Decision**: Reuse Cytoscape.js (already the rendering library for `webview-src/graph/GraphViewApp.ts`)
for the new UML webview, styled with its built-in `diamond` and `triangle`/`triangle-tee` edge-arrow
shapes.

**Rationale**: Cytoscape.js edge style supports `source-arrow-shape`/`target-arrow-shape` values
including `diamond` and `triangle`, which map directly onto UML composition (filled diamond at the
whole) and generalization (hollow triangle at the supertype) notation — no new rendering library or
custom SVG path math is needed, unlike the original CLI-prototype design (`uml-diagram-cli-plan/`)
which hand-rolled marker/path generation because it had no existing graph-rendering dependency to
build on. Reusing Cytoscape also means the new webview inherits the existing pan/zoom/click-to-focus
interaction model users already know from "Generate Graph," rather than introducing a second
interaction paradigm.

**Alternatives considered**:
- Hand-rolled HTML/SVG renderer (the original CLI plan's `htmlRenderer.ts` approach) — rejected;
  it duplicates capability Cytoscape already provides and was only chosen originally because the
  CLI prototype had no webview/graph-library dependency at all.
- A dedicated diagram library (e.g., mxGraph/draw.io embed) — rejected; adds a new runtime
  dependency for a capability the existing dependency already covers, and the constitution/style
  guide default is no new dependency without documented rationale — here the rationale for *not*
  adding one is that none is needed.

## 2. How should the Composition Property Selection (FR-004a) be represented?

**Decision**: A new VS Code workspace setting, `ontograph.umlDiagram.compositionProperties`
(array of strings — object property IRIs), following the existing `ontograph.*` settings
convention (e.g., `ontograph.entity.defaultNamespace`, `ontograph.graph.defaultDepth`, both declared
in `package.json`'s `contributes.configuration`). Default: empty array, so a freshly-installed
extension renders generalization-only diagrams until the user configures at least one property —
matching the spec's FR-009 requirement that the diagram still work with zero composition
relationships configured.

**Rationale**: This is a persistent, cross-session, cross-diagram setting (per the spec's
"configured once, not re-decided per diagram" language in FR-004a), which is exactly what VS Code
workspace settings are for; it also requires no new UI surface (settings.json / Settings UI is
already how users configure everything else in this extension, e.g. `ontograph.largeOntologyThreshold`).

**Alternatives considered**:
- A picker UI shown at diagram-generation time — rejected; the spec (FR-004a) explicitly says this
  selection must not be a per-diagram decision.
- Storing the selection in workspace state instead of a user setting — rejected; settings are
  visible/editable through the standard Settings UI and sync with the user's existing VS Code
  settings sync, consistent with how every other `ontograph.*` preference already behaves.

## 3. How should composition relationships be extracted given the existing data model?

**Decision**: Extend `src/utils/ManchesterFormatting.ts` with a new `parseConjuncts(expr): Conjunct[]`
helper (`{kind: 'bare', targetIri}` | `{kind: 'restriction', propertyIri, targetIri}`), reusing the
file's existing paren-depth-aware top-level-token splitting (`hasTopLevelToken`, confirmed present
today) rather than writing a new parser. `src/uml/partOfGraph.ts` runs one pass over
`OntologyModel.classes`, merging each class's `superClassIris`/`equivalentClassIris` (already
structured, no parsing needed) with `parseConjuncts()` applied to `superClassExpressions`/
`equivalentClassExpressions`, to build one `Map<classIri, Conjunct[]>` used for the whole BFS.

**Rationale**: This is a direct carry-over from the original CLI-prototype design
(`uml-diagram-cli-plan/plan.md`, "New shared utility: `parseConjuncts`"), which already did the
codebase research to confirm `superClassIris` and `superClassExpressions` are the two places a
composition-relevant conjunct can live, and that plain `SubClassOf(<A> <B>)` axioms already land in
the structured `superClassIris` array without needing expression parsing at all. Only the
destination module changes (`src/uml/` instead of `cli/src/uml/`) — the shared `@core/*` alias
(confirmed present in `cli/tsconfig.json`) is exactly what makes that relocation transparent to the
CLI's eventual reuse.

**Alternatives considered**:
- Parsing raw file text directly (regex over the `.ofn`/`.omn` source, as the original hand-built
  Python prototypes did) — rejected; the project's own architecture rule is "use the parsed
  `OntologyModel`, not raw text," and doing so here would duplicate work the parser layer already did.

## 4. How should traversal depth, node caps, and cycles be handled?

**Decision**: Mirror `buildGraphData()`'s existing BFS shape in `src/commands/openVisualization.ts`
— a `for (let hop = 0; hop < depth && nodeIris.size < MAX_NODES; hop++)` frontier expansion, with
a visited-set guard (so a cycle stops expanding once every member is already visited, rather than
looping) and the same "cap reached → surface it" pattern already used for the Graph view's node cap
message, applied here to the UML diagram instead.

**Rationale**: The spec's edge cases (cycle handling, large-relationship-count capping, explicit
cap indication) describe exactly the failure modes `buildGraphData()` was already hardened against;
reusing the same shape means the new code inherits already-proven behavior instead of re-deriving
it, and keeps the two "generate a diagram from a focus entity" features in this codebase
consistent with each other.

**Alternatives considered**: A recursive (non-BFS) traversal — rejected; recursion without an
explicit visited-set is exactly what would fail on the cycle edge case the spec calls out, and BFS
with a frontier/visited-set is the existing, tested pattern in this codebase.

## 5. Where does the extraction/classification/layout module need to live so the CLI can reuse it later without rework?

**Decision**: `src/uml/` (root `src/`, not `cli/src/`), with zero VS Code API imports anywhere in
that folder — it only depends on `OntologyModel` types and plain data in, plain data out.

**Rationale**: Confirmed via direct inspection that `cli/tsconfig.json` and `cli/esbuild.mjs` both
already alias `@core/*` to root `src/*`, and multiple existing CLI commands
(`cli/src/commands/core/entityInfoCommand.ts`, `parseCommand.ts`, `convertCommand.ts`) already
import root `src/model`/`src/parser`/`src/serializer` modules this way with no extra build step.
Placing the new module under `src/uml/` means a future CLI command imports
`@core/uml/partOfGraph` etc. directly — satisfying spec FR-012 ("structured so it can later be
exposed through the ... CLI without re-implementing") for free, with no new package, no publish
step, and no code motion required when that later work happens.

**Alternatives considered**:
- Building it under `cli/src/uml/` first (the original prototype's plan) and having the extension
  import it — rejected; the extension command needs this logic today, the CLI does not (CLI
  exposure is explicitly deferred), so the dependency direction must run from `cli/` toward `src/`,
  not the reverse, to avoid coupling the in-scope feature to the deferred one.
- A new standalone published package — rejected; unnecessary given the `@core/*` alias already
  solves cross-package reuse inside this monorepo with no publish/version-sync overhead.
