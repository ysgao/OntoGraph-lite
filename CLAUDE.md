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
npm run package         # Create .vsix for VS Code marketplace
```

### Java Reasoner Server
```bash
cd java-server && mvn clean package   # Builds fat JAR via maven-shade-plugin
```

The pre-built JAR at `resources/java/onto-reasoner-server.jar` is used at runtime. Rebuild only needed when changing Java code.

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
`FunctionalSerializer.ts` round-trips the in-memory model back to OWL Functional Syntax. It uses a Protégé-style entity-cluster arrangement (see `ContentArrangementInOWLfunctionalSyntaxDocument.md`):

```
Declarations → Object Property clusters → Data Property clusters →
Annotation Property clusters → Class clusters → GCI axioms → Property chains → )
```

Within each class cluster: annotations first (labels, then other), then `EquivalentClasses`, then `SubClassOf`, then `DisjointClasses`.

**5. Sync Layer** (`src/sync/`)
`AnnotationSync.ts` and `AxiomSync.ts` write changes back to the source file in-place without re-serializing the entire document. They parse prefix maps directly from the file text.

- For `.ofn`/`.omn`: annotation and axiom sync are separate operations.
- For `.ttl`: `AxiomSync` handles both structural and annotation segments in a **single atomic edit** to avoid VS Code document-version conflicts from two concurrent `applyEdit` calls.

**IRI abbreviation rule:** Only `rdfs:label` is written as `rdfs:label`. All other IRIs — including entity IRIs, annotation property IRIs, and class expression IRIs — use the full `<IRI>` bracket form. This matches Protégé output.

**6. Commands Layer** (`src/commands/`)
One file per VS Code command: `classifyOntology`, `checkConsistency`, `exportOntology`, `addEntity`, `openVisualization`, `openSparqlEditor`. Commands read the shared `activeModel`/`activeIndex` from `extension.ts`.

**7. Reasoner Bridge** (`src/reasoner/ReasonerBridge.ts`)
Spawns the Java JAR as a child process and communicates via JSON-RPC. Sends requests (classify, checkConsistency, convertFormat) and returns inferred hierarchy/consistency results.

**8. Java Server** (`java-server/src/main/java/org/ihtsdo/ontoeditor/`)
`ReasonerServer.java` is the entry point (JSON-RPC on stdin/stdout). `OntologyService.java` wraps OWLAPI 5. Auto-selects HermiT (full OWL 2 DL) or ELK (scalable, for >5k classes) — threshold configurable via extension settings.

**9. Views & Webviews** (`src/views/`, `webview-src/`)
Tree providers populate the sidebar panels. Three webview bundles (graph, entity-editor, sparql-editor) are built separately. Messages between extension and webviews are typed in `src/views/*Messages.ts`.

**10. LSP Server** (`src/lsp/`)
A Language Server Protocol server (`server/server.ts`) provides completions and diagnostics for OWL files. Launched by `client.ts` as a separate Node process.

## Build Outputs (`dist/`)

`esbuild.mjs` produces six bundles:

| Bundle | Entry | Target |
|--------|-------|--------|
| `extension.js` | `src/extension.ts` | Node/CJS (extension host) |
| `parserWorker.js` | `src/parser/parserWorker.ts` | Node/CJS (Worker Thread) |
| `server.js` | `src/lsp/server/server.ts` | Node/CJS (LSP process) |
| `graph-webview.js` | `webview-src/graph/GraphViewApp.ts` | Browser/IIFE |
| `entity-editor-webview.js` | `webview-src/entity-editor/EntityEditorApp.ts` | Browser/IIFE |
| `sparql-editor-webview.js` | `webview-src/sparql-editor/SparqlEditorApp.ts` | Browser/IIFE |

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
| `java-server/.../ReasonerServer.java` | Java entry point |
| `java-server/.../OntologyService.java` | OWLAPI 5 wrapper |
| `esbuild.mjs` | Build config — 6 output bundles |
| `ContentArrangementInOWLfunctionalSyntaxDocument.md` | Reference for OWL Functional Syntax ordering conventions |

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

**Quality gates before marking a task complete:** all tests pass, coverage >80%, no type errors (`npm run compile`), OWL Functional Syntax ordering preserved, large ontology benchmark passes (`test-ontologies/anatomy.owl`).

Commit convention: `<type>(<scope>): <description>` where type is `feat`, `fix`, `refactor`, `test`, `docs`, or `chore`. Conductor commits use `conductor(plan):` scope.

## Supported Formats

OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`/`.owx`), Turtle/N-Triples (`.ttl`/`.n3`).

## Test Ontologies

`test-ontologies/` contains sample files for manual testing:
- `animals.omn` / `animals.owx` / `animals.ttl` — small examples for all formats
- `bfo-core.ofn` — large (~1.3 MB) BFO ontology for performance testing

## Recent Changes
- 001-fix-sync-data-loss: Added TypeScript 5+, Node.js (extension host) + VS Code Extension API (`vscode.WorkspaceEdit`, `vscode.TextDocument`), Vites
- 001-fix-sync-data-loss: Added [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

## Active Technologies
- TypeScript 5+, Node.js (extension host) + VS Code Extension API (`vscode.WorkspaceEdit`, `vscode.TextDocument`), Vites (001-fix-sync-data-loss)
- OWL files on disk (`.ofn`, `.omn`, `.ttl`) — read via `vscode.TextDocument`, written via `vscode.workspace.applyEdit` (001-fix-sync-data-loss)
