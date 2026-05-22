# Tech Stack: OntoGraph

## Core Technologies
- **Extension Layer:** TypeScript (Node.js 18+) - used for VS Code extension logic, command registration, and view management.
- **Reasoning Backend:** Java 21 (minimum) - provides the heavy lifting for OWL reasoning via a JSON-RPC server.
- **UI Components:** Webviews (HTML/CSS/JS) - used for complex editors and visualizations.

## Frameworks & Libraries
- **VS Code Extension API:** Core framework for integrating with the editor.
- **OWLAPI 5:** Standard Java library for working with OWL ontologies.
- **HermiT:** Full OWL 2 DL reasoner.
- **ELK:** High-performance EL reasoner for large-scale ontologies (e.g., SNOMED CT).
- **CodeMirror 6:** Advanced text editor component for axiom editing with syntax highlighting and autocompletion.
- **Cytoscape.js:** Graph theory library for visualizing ontology neighborhoods.
- **Peggy:** Parser generator for custom Manchester and Functional syntax processing.

## Tooling
- **esbuild:** High-performance bundler for compiling TypeScript and bundling webview assets.
- **Maven:** Build automation and dependency management for the Java reasoning server.
- **Vitest:** Unit testing framework for the TypeScript extension.
- **npm:** Package management for Node.js dependencies.

## Communication
- **JSON-RPC over StdIn/StdOut:** Communication protocol between the TypeScript extension and the Java reasoning server.
- **Message Passing:** Asynchronous communication between the extension and webviews.
