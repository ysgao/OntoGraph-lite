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

**Global `ontograph` command vs local `cli/dist/main.js` — these are two separate files.** If `@ysgao/ontograph-cli` was installed globally (`npm install -g @ysgao/ontograph-cli`), the `ontograph` binary on `PATH` resolves to a real copy under npm's global `node_modules` (e.g. `~/.npm-packages/lib/node_modules/@ysgao/ontograph-cli/dist/main.js`), **not** this repo's `cli/dist/main.js` — they are unrelated unless explicitly linked. Rebuilding this repo (`pnpm --filter ontograph-cli build`) never changes what the global `ontograph` command runs.
- If the CLI is installed globally and the user is just using it normally (not testing local code changes), tell them to run the plain `ontograph <command>` — don't have them invoke `node cli/dist/main.js` instead; that only proves the local build works, not what their installed binary does.
- To verify a local code change without publishing: either invoke the local build directly — `node cli/dist/main.js <command>` — or run `cd cli && npm link` once so the global `ontograph` command is symlinked to this repo's build; after that, every `pnpm --filter ontograph-cli build` takes effect immediately under the global command too.
- To ship a local fix to everyone's global install for real: bump the version (see above), publish (see below), then the user runs `npm install -g @ysgao/ontograph-cli@latest`.

**Testing bridge commands (`classify`/`check-consistency`/`dl-query`) against a debug extension via F5:**
1. Rebuild the CLI locally first — F5's `preLaunchTask` only builds the extension, not `cli/`: `pnpm --filter ontograph-cli build`.
2. Press F5 ("Run Extension" in `.vscode/launch.json`) to launch the Extension Development Host. If a debug session is already running, fully stop it (Shift+F5) and relaunch rather than using the in-place "Restart" button — restart can serve stale `dist/`.
3. In the Extension Development Host window, open a supported ontology file (e.g. `test-ontologies/animals.omn`) to activate OntoGraph and populate the in-memory model.
4. Confirm the bridge is up: check the "OntoGraph" output channel for `OntoGraph ready...`, and that `~/.ontograph-lite/bridge.json` (macOS/Linux) shows a `pid` matching the Dev Host process. This lock file is global, not per-window — if another VS Code window also has OntoGraph active, whichever instance started most recently owns it.
5. In a normal terminal (not inside the Dev Host), run the locally-built binary directly (not the global `ontograph` command, unless it's `npm link`ed — see above): `node cli/dist/main.js classify` / `check-consistency` / `dl-query "<expr>"`. File-based commands (`parse`/`search`/`validate`/`convert`/`stats`/`entity-info`) don't need the extension running at all.
6. `BRIDGE_UNAVAILABLE` usually means the Dev Host window closed, no file is open in it, or the lock file's `pid` is dead (`ps -p <pid>`).

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
ontograph search [file] <query>           # find entities by label or IRI substring
ontograph validate <file>                 # structural error check
ontograph convert <file> --to functional  # normalize to OWL Functional Syntax
ontograph stats <file>                    # ontology-wide statistics summary
ontograph entity-info [file] <iri-or-label> # detailed lookup for one entity
```

`search` and `entity-info` accept an optional `[file]` — if omitted, the CLI asks the running OntoGraph extension (via the bridge socket) for the file currently open in VS Code and uses that. All other commands still require `<file>` explicitly.

All output is JSON on stdout. Parse it directly. Exit 0 = success, non-zero = error (`errorCode` field identifies type).

Bridge commands (`classify`, `check-consistency`, `dl-query`) run a reasoner classification, consistency check, or DL query — which reasoner backend they use depends on which package is installed:

```bash
ontograph classify             # run reasoner classification
ontograph check-consistency    # OWL 2 DL consistency check
ontograph dl-query "<expr>"    # Manchester Syntax DL query
```

Two separate npm packages both install a binary named `ontograph`; install only one:
- `@ysgao/ontograph-cli` (`cli/`) — bridge commands require OntoGraph **active in VS Code**; talks to the running extension. Install: `npm install -g @ysgao/ontograph-cli`
- `@ysgao/ontograph-cli-standalone` (`cli-standalone/`) — bundles its own Temurin JRE + reasoner JAR; bridge commands run against a local file with **zero VS Code and zero system Java** (macOS arm64 only). Install: `npm install -g @ysgao/ontograph-cli-standalone`

## Recent Changes
Full detail for each lives under `specs/<id>/` (spec.md/plan.md/tasks.md) — entries below are pointers only.
- cli-help-text (no spec dir — ad-hoc fix): option descriptions for `search --type`, `dl-query`/standalone `dl-query --types`, `convert --to`, and `classify --reasoner` (cli-standalone) now use comma-separated (not `|`-joined) value lists so Commander's help formatter can word-wrap them, plus each command gets an `.addHelpText('after', ...)` block with concrete syntax and examples. `search`/`entity-info`'s top-level `.description()` was shortened back to one line (detail moved into their own `--help`) so the main `ontograph --help` command table isn't a wall of prose.
- cli-optional-active-file (no spec dir — ad-hoc fix): `search` and `entity-info`'s `<file>` argument is now optional (`registerCoreCommands.ts` declares them as `<args...>` and resolves 1-vs-2-arg forms manually, since Commander can't express "optional-then-required" positionals); when omitted, the CLI calls a new `getActiveFile` bridge RPC method (`OntoGraphApi.getActiveFilePath()`, dispatched in `src/bridge/BridgeServer.ts`) to ask the running extension for its currently open file, via `cli/src/bridge/activeFile.ts#resolveActiveFilePath`. Errors as `NO_ACTIVE_FILE` if the extension has no ontology open, or the usual `BRIDGE_UNAVAILABLE`/`BRIDGE_TIMEOUT` if the extension isn't reachable. `parse`/`validate`/`convert`/`stats` still require `<file>` explicitly.
- cli-label-resolution (no spec dir — ad-hoc fix): `entity-info` resolves its argument as IRI → local name → exact label/prefLabel/altLabel (via `OntologyIndex`), erroring `AMBIGUOUS_MATCH`/`NOT_FOUND` with candidate/suggestion lists rather than silently guessing; `search` adds an `exactMatches` field alongside the fuzzy-ranked `results`; `dl-query` (both `cli/` and `cli-standalone/`) resolves label/prefLabel/altLabel entity references in the expression to IRIs client-side before it reaches the reasoner (mirrors `DLQueryPanel`'s `normalizeExpression` pipeline); `entity-info`'s `superClassExpressions`/`equivalentClassExpressions`/`gciExpressions` now render entity labels instead of raw IRIs.
- 028-standalone-cli-reasoner: new sibling package `cli-standalone/` (`@ysgao/ontograph-cli-standalone`) bundles a Temurin 21 JRE (macOS arm64 only) + the reasoner JAR so `classify`/`check-consistency`/`dl-query` run against a local file with zero VS Code and zero system Java; `cli/` unaffected — both packages share command registration via `cli/src/registerCoreCommands.ts`. → `specs/028-standalone-cli-reasoner/`
- 027-cli-dlquery-filters: `ontograph dl-query` auto-classifies (only when needed) before querying, accepts `--types` (any of the 6 `DLQueryType` categories, default `subClasses`), and `--filter` (case-insensitive label/IRI substring, client-side). → `specs/027-cli-dlquery-filters/`
- 026-generate-uml-diagram: right-click UML diagram (composition/generalization) + draw.io/SVG/PNG export, no AI/LLM. → `specs/026-generate-uml-diagram/`
- 025-show-inferred-equivalent-class: Entity Editor shows reasoner-derived unasserted equivalent classes, read-only. → `specs/025-show-inferred-equivalent-class/`
- 019-create-entity: per-panel toolbar buttons create OWL entities; editable/rename-propagating IRI field. → `specs/019-create-entity/`
- 014-entity-editor-undo-redo: in-memory per-entity undo/redo history in the Entity Editor. → `specs/014-entity-editor-undo-redo/`
- 013-entity-search-partial-match: cross-field token search (label/prefLabel/altLabel) with exact-name ranking. → `specs/013-entity-search-partial-match/`
- 012-load-large-ontology: load/reload any-sized ontology via `workspace.fs.readFile`. → `specs/012-load-large-ontology/`

## Active Technologies
- TypeScript 5 (strict mode), Node.js (extension host), Browser (webview iframe) + VS Code Extension API (existing), existing webview message bus (`postMessage`) (019-create-entity)
- `queueSyncWrite` + `writeTextStreamed` for all file mutations; `OntologyIndex.getByIri` for duplicate-IRI guard; `buildModelSegmentIndex` forced after entity insert/rename; `setRefreshAllViews` callback registered from `activate()` so EntityEditorPanel can trigger tree-view refresh (019-create-entity)
- In-memory only — `Map<entityIri, EntityEditHistory>` on the extension host; no persistence (014-entity-editor-undo-redo)

<!-- SPECKIT START -->
Plan: specs/028-standalone-cli-reasoner/plan.md
<!-- SPECKIT END -->
