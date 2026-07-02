# Changelog

All notable changes to OntoGraph Lite are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
