# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OntoGraph is a VS Code extension for OWL ontology editing, reasoning, and visualization. It provides a Protégé-like interface for OWL ontologies, with SNOMED CT-scale support.

## Build Commands

### TypeScript Extension
```bash
npm run build           # Production build via esbuild (generates dist/)
npm run build:watch     # Watch mode
npm run compile         # Type-check only (no emit)
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
npm test                                              # Run all tests (Vitest)
npm test -- src/parser/FunctionalParser.test.ts       # Single test file
npm run test:watch                                    # Watch mode
```

Tests live in `src/parser/*.test.ts`. There are no Java tests.

## Architecture

Three-tier design with TypeScript extension → Java reasoning server (via JSON-RPC on stdin/stdout):

**1. Extension Layer** (`src/extension.ts`)
Activates the extension, registers commands and tree views (Classes, Properties, Individuals, Inferred Hierarchy), and manages the in-memory `OntologyModel`.

**2. Parser Layer** (`src/parser/`)
`ParserRegistry` detects format and dispatches to one of four parsers: `FunctionalParser` (.ofn), `ManchesterParser` (.omn), `TurtleParser` (.ttl/.n3), `OwlXmlParser` (.owl/.owx). Each parser populates `OntologyModel` with entities and axioms.

**3. Model** (`src/model/`)
`OntologyModel.ts` defines core types (OWLClass, ObjectProperty, DataProperty, Individual, axioms). `OntologyIndex.ts` provides fast lookup structures built after parsing.

**4. Reasoner Bridge** (`src/reasoner/ReasonerBridge.ts`)
Spawns the Java JAR as a child process and communicates via JSON-RPC. Sends requests (classify, checkConsistency, convertFormat) and returns inferred hierarchy/consistency results.

**5. Java Server** (`java-server/src/main/java/org/ihtsdo/ontoeditor/`)
`ReasonerServer.java` is the entry point (JSON-RPC on stdin/stdout). `OntologyService.java` wraps OWLAPI 5. Auto-selects HermiT (full OWL 2 DL) or ELK (scalable, for >5k classes) reasoner — threshold configurable via extension settings.

**6. Views & Webviews** (`src/views/`, `webview-src/`)
Tree providers populate the sidebar panels. Three webview bundles (graph, class-editor, sparql-editor) are built separately via `tsconfig.webview.json`. Messages between extension and webviews are typed in `src/views/*Messages.ts`.

**7. LSP Server** (`src/lsp/`)
A separate Language Server Protocol server (`server.ts`) provides completions and diagnostics for OWL files. Launched by `client.ts` as a separate Node process.

## Key Files

| File | Role |
|------|------|
| `src/extension.ts` | Extension activation; command + view registration |
| `src/model/OntologyModel.ts` | Core OWL data structures |
| `src/parser/ParserRegistry.ts` | Format detection and parser dispatch |
| `src/reasoner/ReasonerBridge.ts` | Java process lifecycle + JSON-RPC |
| `java-server/.../ReasonerServer.java` | Java entry point |
| `java-server/.../OntologyService.java` | OWLAPI 5 wrapper |
| `esbuild.mjs` | Build config — 5 output bundles |

## Supported Formats

OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`/`.owx`), Turtle/N-Triples (`.ttl`/`.n3`).

## Test Ontologies

`test-ontologies/` contains sample files for manual testing:
- `animals.omn` / `animals.owx` / `animals.ttl` — small examples for all formats
- `bfo-core.ofn` — large (~1.3 MB) BFO ontology for performance testing
