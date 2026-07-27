# Changelog

All notable changes to OntoGraph Lite are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.3.8] — 2026-07-27

### Added
- **UML diagrams gain a "Stated / Inferred" view switch.** The Stated view behaves exactly as before — subtypes from directly-written axioms only. The new Inferred view shows a completely separate diagram built entirely from the reasoner's classified hierarchy (run "OntoGraph: Classify Ontology" first): every subtype the reasoner concluded, including ones with no direct axiom stating them, connected by generalization lines only — no part-of relationships appear in this view. A relationship that exists only because of reasoning renders as a dashed line; one that's also directly asserted renders solid. Lateralized (Left/Right) variants and "Entire X" concepts are hidden by default in the Inferred view, revealable via the same control already used to reveal lateralized classes, and labels like "Kidney structure" or "Structure of kidney" display simply as "Kidney". Switching views — or generating a diagram at all — never triggers a background classification run.

## [0.3.7] — 2026-07-25

### Changed
- **UML diagrams now use a proper layered graph layout algorithm**, replacing the old flat/reactive layout whose node overlaps and heavy edge crossings became obvious once a diagram's hierarchy went beyond two or three levels:
  - Each parent is centered exactly over the span of its own subtypes/compositions (tidy-tree placement); sibling parents are spaced *unevenly*, according to how wide each one's own subtree is, rather than an even fixed pitch.
  - Bus lines (a parent fanning out to several children, or several parents converging on one shared child) only get a dedicated horizontal lane when they would otherwise visually merge with another bus of the *same* relationship kind — disjoint buses of the same kind now share a lane, compacting the vertical space between levels.
  - Composition and generalization buses are never placed at the same height, so subtype and part-of relationships always read as visually distinct levels.
  - Multi-layer ("far") edges render dashed and route through their own uniformly-spaced lanes below the ordinary buses, instead of cutting across them.
  - Each edge is colored to match the node it connects to — the target's color for a single destination, the source's color when a bus fans out to several — making it easier to trace where a line goes.
  - A node entered by two or more edges assigns each edge its own connection point, ordered by the cross-position of the edge's source, so incoming lines no longer swap sides and cross each other.

## [0.3.6] — 2026-07-23

### Added
- **Delete Entity** — right-click "Delete Entity" (or the new `$(remove)` "-" toolbar button) on any class/object-property/data-property/annotation-property/individual tree item removes it from the ontology. Entities with direct subtypes prompt a choice between "delete entity only" (default — reparents direct subclasses/sub-properties to the deleted entity's own superclasses/super-properties) and "delete entity and all subtypes" (cascade — removes the full transitive closure). A confirmation dialog always states the affected-entity count before any change is made, and warns if the entity is still referenced elsewhere (e.g. as a property's domain/range). Functional syntax (`.ofn`) only in this release.
- UML diagrams now render distant ("far") child-class edges with dashed styling in both the HTML view and the Draw.io export, visually distinguishing them from direct child relationships.

### Fixed
- **Entity label renames now stay in sync across all axioms.** Renaming an entity's label in the Entity Editor Panel could leave *other* entities' cached axiom displays showing the old label — and, in rare cases, saving that stale display could fail to resolve the reference or silently attach it to the wrong entity. A rename now invalidates the cached editor history of every other entity whose axioms reference the renamed entity, so the next time they're viewed they always show the current label and always save back to the correct underlying entity. Renaming an entity to a label already used by a different entity is now rejected outright with a clear error, so two entities can never share a label. Applies to every format the Entity Editor Panel already supports for label edits (`.ofn`, `.omn`, `.ttl`).

## [0.3.0] — 2026-07-15

### Added
- **`@ysgao/ontograph-cli` v0.3.0** — `dl-query` now auto-classifies the ontology before querying, and accepts `--types` (restrict which relationship categories are returned) and `--filter` (label substring filter on results).
- **`@ysgao/ontograph-cli-standalone` v0.3.0** (new package) — zero-dependency CLI bundling a Java 21 runtime and the reasoner JAR directly in the npm tarball, so `classify`, `check-consistency`, and `dl-query` run against a local ontology file with no VS Code and no system Java required (macOS arm64 only for now). Shares its command set with `@ysgao/ontograph-cli` via a common registration module, so future commands land in both packages together.

## [0.2.2] — 2026-07-06

### Added
- Loading or syncing an OWL file that contains git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) is now blocked — the extension logs an error and skips the file rather than attempting to parse a corrupt ontology.

## [0.2.0] — 2026-07-03

### Added
- Graph view now renders the direct supertypes of the focused entity as upward-linked nodes, giving immediate superclass context without requiring a full inferred hierarchy.
- **`@ysgao/ontograph-cli` v0.1.14** adds two new commands:
  - `ontograph entity-info <file> <iri-or-local-name>` — detailed entity lookup: labels, axioms, superconcepts, and direct subconcepts; handles SNOMED CT–scale ontologies.
  - `ontograph stats <file>` — ontology statistics summary (class count, property counts, axiom counts).

### Fixed
- Manchester Syntax parser now accepts plain local names (e.g. `Koala`, `hasHabitat`) in class expressions, not just prefixed names or full IRIs.

## [0.1.17] — 2026-07-01

### Added
- Manchester Syntax `and`-conjuncts are now automatically sorted into a canonical order on save — bare named classes appear before role-based expressions (e.g. `hasHabitat some Ocean`), making round-trips deterministic and diffs clean.

### Fixed
- Entity Editor preserves cursor position when Manchester auto-format fires, preventing unexpected jumps mid-edit.

## [0.1.16] — 2026-07-01

### Added
- Unsaved-changes guard: navigating away from an entity with unsaved edits now prompts the user to save or discard before the editor switches focus.

## [0.1.15] — 2026-06-30

### Added
- Back / Forward navigation history for entities: `Alt+Left` / `Alt+Right` (macOS: `Ctrl+-` / `Ctrl+Shift+-`) traverse the entity selection history within OntoGraph views.

## [0.1.14] — 2026-06-30

### Added
- Per-panel **Add** buttons in every OntoGraph sidebar view (Classes, Object Properties, Data Properties, Annotation Properties, Individuals) create new entities with the focused entity as parent.
- IRI field in the Entity Editor is now editable; renaming an IRI propagates all references throughout the file.
- `ontograph.entity.defaultNamespace` setting controls the IRI prefix for new entities.
- Search query is retained across QuickPick open/close sessions — reopening the search box restores the last query.

## [0.1.12] — 2026-06-12

### Added
- **`@ysgao/ontograph-cli` v0.1.12** — standalone npm CLI (`npm install -g @ysgao/ontograph-cli`) for AI coding assistants and scripts. Core commands (`parse`, `search`, `validate`, `convert`) work without VS Code; bridge commands (`classify`, `check-consistency`, `dl-query`) delegate to the running extension.
- Loading an ontology file from outside the current workspace now opens the containing folder as a VS Code workspace automatically.

## [0.1.10] — 2026-06-10

### Fixed
- Entity Editor no longer shows stale content after saving changes or performing an undo.

## [0.1.9] — 2026-06-02

### Added
- Undo / Redo in the Entity Editor operates on save-checkpoints: each save creates a checkpoint, and Undo/Redo steps between them.

### Fixed
- Undo correctly restores deleted GCI, annotation, and axiom entries to their original file positions.

## [0.1.8] — 2026-06-01

### Changed
- Entity search now performs **cross-field token matching** across `rdfs:label`, `skos:prefLabel`, and `skos:altLabel`. Tokens may match across multiple fields.
- Exact entity local-name matches rank first (score 200), ensuring e.g. "Koala" returns the `Koala` class at the top even in large ontologies.

## [0.1.7] — 2026-05-30

### Added
- **Load Ontology File** toolbar button (`$(folder-opened)`) and `OntoGraph: Load Ontology File…` command open any OWL file regardless of size — suitable for SNOMED CT-scale ontologies.

### Changed
- ELK reasoner now uses multi-threading and caches the loaded ontology between queries, reducing re-classify time.
- 200 MB ontology load time reduced by ~28% (12.5 s → 9 s).

### Fixed
- DL Query results now emit valid OWL Functional Syntax class expressions.
- SNOMED CT-scale save / reload no longer causes out-of-memory errors.

## [0.1.6] — 2026-05-26

### Added
- `.owl` files are auto-detected as OWL/XML or RDF/XML by inspecting file content, removing the need to rename files.

## [0.1.5] — 2026-05-26

### Added
- `OntoGraph: Reload Ontology` command re-parses the current file from disk without reopening the document.

### Changed
- ELK is now the default reasoner (previously HermiT). Switch to HermiT or `auto` via `ontograph.reasoner.engine` for full OWL 2 DL support.

## [0.1.4] — 2026-05-15

### Added
- **DL Query panel**: enter a Manchester Syntax class expression and browse results grouped into Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, and Instances — matching the Protégé DL Query tab.
- CodeMirror editor with Manchester Syntax autocompletion inside the DL Query panel.

## [0.1.3] — 2026-05-15

### Added
- Annotation values that are URLs render as clickable links; image URLs show an inline preview.
- `skos:definition` and `rdfs:comment` fields use auto-growing multiline textareas and round-trip real newlines through the OWL file.

### Changed
- RDFS annotation property IRIs (`rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy`) are now written as abbreviated tokens in OWL Functional Syntax output, matching Protégé style.

## [0.1.2] — 2026-05-15

### Changed
- OWL Functional Syntax serializer now writes entity clusters in Protégé-style order: Declarations → Object Property clusters → Data Property clusters → Annotation Property clusters → Class clusters → GCI axioms → Property chains.
- In-place sync (AxiomSync, AnnotationSync) uses diff-based patching, preserving existing file order and producing minimal diffs.

## [0.1.1] — 2026-05-11

### Added
- Initial release of **OntoGraph Lite**.
- Multi-format parsing: OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`/`.owx`), Turtle (`.ttl`/`.n3`).
- Sidebar tree views: Classes, Object Properties, Data Properties, Annotation Properties, Individuals, Inferred Hierarchy.
- Entity Editor with structured axiom and annotation editing; changes sync back to file in-place.
- Integrated OWL 2 reasoning via HermiT and ELK (auto-selected by ontology size).
- Graph visualization of entity neighborhoods.
- SPARQL query editor.
- Language Server Protocol support: completions, diagnostics, hover, and go-to-definition for OWL files.
- Worker Thread parsing for large ontologies to avoid blocking the extension host.
