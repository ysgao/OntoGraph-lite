# OntoGraph-lite: OWL Ontology Editor for VS Code

OntoGraph is a Protégé-like OWL 2 ontology editing, reasoning, and visualization extension for Visual Studio Code. It handles everything from small toy ontologies to SNOMED CT-scale knowledge bases.

![OntoGraph Icon](resources/icons/ontology.png)

## Key Features

- **Multi-format Support**: Parse and edit OWL Functional Syntax (`.ofn`), Manchester Syntax (`.omn`), OWL/XML (`.owl`), and Turtle (`.ttl`).
- **Integrated Reasoning**: Built-in support for **HermiT** (full OWL 2 DL) and **ELK** (high-performance EL reasoning, recommended for SNOMED CT scale).
- **Hierarchical Views**: Navigate your ontology through dedicated tree views for Classes, Object Properties, Data Properties, Annotation Properties, and Individuals.
- **Inferred Hierarchy**: View classification results side-by-side with your asserted hierarchy.
- **Entity Editor**: Edit axioms and annotations with a structured interface and Manchester Syntax support, including undo/redo.
- **Graph Visualization**: Explore entity relationships visually with interactive neighborhood graphs.
- **UML Diagram**: Right-click any class and choose "Generate UML Diagram" for a Protégé-independent, UML-style view rooted at that class — composition (part-of, filled diamond) and generalization (subtype, hollow triangle) connectors derived purely from the ontology's own axioms, with no AI/LLM involvement. Adjustable depth, layout direction, and node exclusion; export to draw.io, SVG, or PNG.
- **DL Query**: Protégé-style DL Query panel — enter a Manchester Syntax class expression and browse results grouped by Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, and Instances. Classification runs automatically the first time it's needed.
- **SPARQL Editor**: Execute SPARQL queries against your loaded ontology.
- **SNOMED CT Scale**: Optimized for large-scale ontologies with tens of thousands of classes via Worker Thread parsing and ELK.
- **CLI for AI Tools**: `@ysgao/ontograph-cli` — a command-line interface for AI coding assistants (Claude Code, Codex) and developers to parse, search, validate, convert, and reason over OWL files. Core commands (`parse`, `search`, `validate`, `convert`, `stats`, `entity-info`) run standalone; `classify`/`check-consistency`/`dl-query` attach to a running VS Code instance.
- **Standalone CLI**: `@ysgao/ontograph-cli-standalone` — a separate, zero-dependency package (macOS Apple Silicon only) that bundles its own Java runtime and reasoner, so `classify`/`check-consistency`/`dl-query` run against a local file with no VS Code and no system Java installed at all.

## Language Support

OntoGraph provides rich language support for OWL files via the Language Server Protocol (LSP), including:
- **Auto-completion**: Intelligent suggestions for OWL keywords, entities, and IRIs.
- **Diagnostics**: Real-time syntax checking and error reporting for Manchester and Functional syntax.
- **Hover Information**: View entity details and labels by hovering over IRIs in the editor.

---

## Installation

### Prerequisites

- **Visual Studio Code** 1.90.0 or newer (or a compatible VS Code fork such as Cursor, Windsurf, or Antigravity)
- **Java Runtime Environment (JRE) 21** or newer (required for the reasoning server)
- **Node.js 18** or newer

### Installing the VS Code Extension

#### From the Marketplace
Install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ysgao.ontograph-lite), or search for **OntoGraph** in the VS Code Extensions view (`Ctrl+Shift+X`).

#### From VSIX
1. Download `ontograph-lite-x.x.x.vsix` from the [releases page](https://github.com/ysgao/OntoGraph-lite/releases).
2. Open VS Code → Extensions view → **...** menu → **Install from VSIX...**
3. Select the downloaded file.

Works with any VS Code fork. Install via the VSIX method if the editor's marketplace differs from the official VS Code Marketplace.

### Installing the CLI

The CLI (`@ysgao/ontograph-cli`) is a separate npm package. It does **not** require the VS Code extension for core operations.

```bash
# Global install (recommended — puts `ontograph` on PATH)
npm install -g @ysgao/ontograph-cli

# Or with pnpm
pnpm add -g @ysgao/ontograph-cli

# Or run without installing via npx
npx @ysgao/ontograph-cli parse ./ontology.ofn
```

Verify install:
```bash
ontograph --version   # 0.3.0
ontograph --help
```

### Installing the Standalone CLI (no VS Code, no system Java)

`@ysgao/ontograph-cli-standalone` is a **separate** npm package (not a mode of the CLI above) that
bundles its own Java 21 runtime and the reasoner JAR, so `classify`/`check-consistency`/`dl-query`
work against a local ontology file with zero external dependencies. Currently macOS Apple Silicon
(arm64) only.

```bash
npm install -g @ysgao/ontograph-cli-standalone

ontograph classify ./ontology.ofn
ontograph dl-query ./ontology.ofn "Animal and hasHabitat some Ocean" --types directSubClasses
```

See [`cli-standalone/README.md`](cli-standalone/README.md) for full command reference. Install
whichever CLI package fits your use case — the two are not designed to coexist under the same
global `ontograph` binary.

---

## Usage Guide

### Loading an Ontology (VS Code)

Open any supported OWL file in VS Code. OntoGraph automatically detects the format, parses the content, and populates the sidebar views.

Supported extensions: `.ofn`, `.omn`, `.owl`, `.owx`, `.ttl`, `.n3`

### Navigating and Searching (VS Code)

- Use the **OntoGraph Activity Bar** icon to access the ontology tree views.
- **Search**: Click the magnifying glass icon or use `OntoGraph: Search Entity` to find entities by name or label.
- **Selection**: Selecting an entity opens its details in the **Entity Editor**.

### Reasoning and Classification (VS Code)

1. Click **Classify Ontology** (play icon) in the Class Hierarchy or Inferred Hierarchy view title bar.
2. The extension invokes the appropriate reasoner (ELK for large EL ontologies, HermiT for full DL).
3. The **Inferred Hierarchy** view updates with computed subclass relationships.
4. **Consistency Check**: Use `OntoGraph: Check Consistency` to verify consistency.

### Editing Entities (VS Code)

- Click any entity in the tree views to open the Entity Editor.
- Manage annotations, class expressions, and property characteristics.
- Changes sync back to the source file in-place.
- Full undo/redo support per entity.

### DL Query (VS Code)

1. Open the Command Palette (`Ctrl+Shift+P`) and run `OntoGraph: Open DL Query`.
2. Enter a Manchester Syntax class expression (e.g., `Animal and hasHabitat some Ocean`).
3. Click **Execute** — classification runs automatically first if the ontology hasn't been classified yet (or is stale).
4. Results group into: Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, Instances.

### UML Diagram (VS Code)

1. Right-click a class in the Classes panel and choose **Generate UML Diagram**.
2. A panel opens rooted at that class: subclasses connect via generalization (hollow triangle) connectors, part-of relationships via composition (filled diamond) connectors — both derived directly from the ontology's axioms, no AI involved.
3. Use the in-panel controls to adjust depth, flip layout direction (top-to-bottom / left-to-right), or click nodes to mark them for exclusion and **Regenerate**.
4. Export the current diagram to draw.io, SVG, or PNG via the panel's toolbar buttons.

Configurable via `ontograph.umlDiagram.*` settings — see [Configuration](#configuration-vs-code).

### Exporting (VS Code)

Use `OntoGraph: Export Ontology As...` to save your ontology in a different format.

---

## CLI Reference (`@ysgao/ontograph-cli`)

The CLI gives AI tools and scripts direct access to OntoGraph's ontology operations. All commands output a single JSON object to stdout.

### Core commands — no VS Code required

```bash
# Parse an OWL file and return structural summary
ontograph parse ./ontology.ofn
ontograph parse ./snomed.owl

# Search entities by label or IRI substring
ontograph search ./ontology.omn "Finding site"
ontograph search ./ontology.ofn "Body structure" --type class --limit 10

# Validate OWL structure
ontograph validate ./ontology.ttl

# Convert between formats
ontograph convert ./ontology.omn --to functional
ontograph convert ./ontology.omn --to turtle --out ./ontology.ttl

# Ontology-wide statistics (class/property/axiom counts, hierarchy depth, etc.)
ontograph stats ./ontology.ofn

# Full details for a single entity (labels, axioms, superconcepts, subconcepts)
ontograph entity-info ./ontology.ofn "http://example.org/animals#Koala"
ontograph entity-info ./snomed.owl Koala
```

### Bridge commands — requires OntoGraph running in VS Code

```bash
# Classify the active ontology
ontograph classify

# Check OWL 2 DL consistency
ontograph check-consistency

# Run a DL query — auto-classifies first if needed
ontograph dl-query "Animal and hasHabitat some Ocean"
ontograph dl-query "pizza:Pizza and pizza:hasTopping some pizza:MozzarellaTopping"

# Restrict which result categories come back, filter by label/IRI substring
ontograph dl-query "Body structure" --types directSubClasses,subClasses --filter "liver"
```

`--types` accepts a comma-separated list of `directSuperClasses`, `superClasses`,
`equivalentClasses`, `directSubClasses`, `subClasses`, `instances` (default: `subClasses` only).
`--filter` is a case-insensitive label/IRI substring match applied client-side to every returned category.

### Output format

Every command outputs one JSON line to stdout:

```json
{"success":true,"command":"parse","durationMs":42,"data":{"classCount":9,"format":"manchester","ontologyIri":"http://example.org/animals",...}}
```

Errors:
```json
{"success":false,"command":"classify","durationMs":1500,"error":"OntoGraph extension not detected","errorCode":"BRIDGE_UNAVAILABLE"}
```

Error codes: `FILE_NOT_FOUND` (1), `PARSE_ERROR` (2), `UNSUPPORTED_FORMAT` (3), `INVALID_ARGS` (4), `BRIDGE_UNAVAILABLE` (10), `BRIDGE_TIMEOUT` (11), `BRIDGE_ERROR` (12).

### Global flags

```bash
--timeout <ms>    Override operation timeout (default: 30000ms for bridge, 5000ms for core)
--version         Print version
--help            Print help
```

### Using from AI tools (Claude Code, Codex)

The CLI is designed to be called by AI coding assistants. Parse stdout as JSON:

```bash
# In a shell script or AI tool invocation
result=$(ontograph parse ./ontology.ofn)
# Check success
echo "$result" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['data']['classCount'])"

# Non-zero exit code signals failure — errorCode identifies the type
ontograph search ./snomed.owl "Finding site" --limit 5
```

### How bridge discovery works

When OntoGraph is active in VS Code, it writes a lock file:
```
~/.ontograph-lite/bridge.json   (macOS / Linux)
%APPDATA%\ontograph-lite\bridge.json   (Windows)
```

The CLI reads this file automatically. No configuration needed. If the file is absent or the extension process is dead, bridge commands return `BRIDGE_UNAVAILABLE` within 2 seconds.

### Supported serialization formats

| Format | Read | Write |
|--------|------|-------|
| OWL Functional Syntax (`.ofn`) | ✅ | ✅ |
| Manchester Syntax (`.omn`) | ✅ | — |
| OWL/XML (`.owl`) | ✅ | — |
| Turtle (`.ttl`) | ✅ | ✅ |

### Need `classify`/`check-consistency`/`dl-query` without VS Code at all?

Install [`@ysgao/ontograph-cli-standalone`](cli-standalone/README.md) instead (macOS Apple Silicon
only) — it bundles its own Java runtime and reasoner, so those three commands take a `<file>`
argument directly instead of attaching to a running VS Code bridge. The core commands above are
identical between both packages.

---

## Configuration (VS Code)

Configure OntoGraph in VS Code Settings under `ontograph.*`:

| Setting | Default | Description |
|---------|---------|-------------|
| `ontograph.reasoner.engine` | `elk` | `hermit`, `elk`, or `auto` (ELK for >5k classes) |
| `ontograph.reasoner.javaPath` | `java` | Path to Java 21+ executable |
| `ontograph.reasoner.jvmArgs` | `["-Xmx4g"]` | Extra JVM arguments for the reasoner |
| `ontograph.reasoner.timeoutSeconds` | `600` | Reasoning timeout in seconds |
| `ontograph.display.preferredLabelLanguage` | `en` | Language tag for `rdfs:label` display |
| `ontograph.display.showIriOnHover` | `false` | Show full IRI as tooltip on hover |
| `ontograph.display.axiomEntityStyle` | `label` | `label`, `shortIri`, or `fullIri` in axiom expressions |
| `ontograph.graph.defaultDepth` | `1` | Default graph visualization depth (1–5) |
| `ontograph.umlDiagram.defaultDepth` | `1` | Default relationship depth for a newly generated UML diagram (1–5) |
| `ontograph.umlDiagram.defaultDirection` | `LR` | Default layout flow for a newly generated UML diagram: `TB` (top-to-bottom) or `LR` (left-to-right) |
| `ontograph.umlDiagram.compositionProperties` | SNOMED's 4 part-of IRIs | Object property IRIs rendered as composition (part-of) connectors in UML diagrams; others appear as an excluded-relation note |
| `ontograph.largeOntologyThreshold` | `50000` | Class count above which large-ontology optimisations apply |
| `ontograph.entity.defaultNamespace` | `""` | Base IRI prefix for new entities (must end with `#` or `/`); leave empty to derive from the ontology IRI |

---

## Architecture

Three tiers: **VS Code extension** → **Java reasoning server** (JSON-RPC on stdin/stdout) → **two sibling CLI packages**, each a standalone npm package.

```
@ysgao/ontograph-cli (npm)                    @ysgao/ontograph-cli-standalone (npm)
    ├── Core commands ─┐                          ├── Core commands ─┐  (same registration
    │  (parse/search/  │                          │  (identical)     │   module — cli/src/
    │  validate/       ├─→ src/parser, src/model,  │                  ├─→  registerCoreCommands.ts)
    │  convert/stats/  │   src/serializer directly │                  │
    │  entity-info)   ─┘                          │                  ─┘
    └── Bridge commands → IPC socket → OntoGraph   └── Reasoning commands → bundled Java 21 JRE
                          VS Code extension            + reasoner JAR, spawned directly
                          └── Java reasoner              (no VS Code, no system Java)
                              (HermiT / ELK)
```

The minimal CLI (`cli/`) uses an OS-native IPC socket (Unix domain socket on macOS/Linux, named
pipe on Windows) to talk to a running VS Code extension. The standalone CLI (`cli-standalone/`,
macOS Apple Silicon only for now) instead spawns its own bundled JRE running the same reasoner JAR
directly — no extension, no IPC, no system Java. Both packages register their file-based core
commands (`parse`, `search`, `validate`, `convert`, `stats`, `entity-info`) from the same shared
module, so new commands land in both automatically.

The extension's public API is exposed via `activate()`'s return value (`OntoGraphApi` interface in
`src/api.ts`), enabling both CLI bridge access and direct extension-to-extension consumption.

---

## License

OntoGraph is licensed under the [Apache-2.0 License](LICENSE).
