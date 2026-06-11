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
- **DL Query**: Protégé-style DL Query panel — enter a Manchester Syntax class expression and browse results grouped by Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, and Instances.
- **SPARQL Editor**: Execute SPARQL queries against your loaded ontology.
- **SNOMED CT Scale**: Optimized for large-scale ontologies with tens of thousands of classes via Worker Thread parsing and ELK.
- **CLI for AI Tools**: `@ysgao/ontograph-cli` — a standalone command-line interface for AI coding assistants (Claude Code, Codex) and developers to parse, search, validate, and convert OWL files without opening VS Code.

## Language Support

OntoGraph provides rich language support for OWL files via the Language Server Protocol (LSP), including:
- **Auto-completion**: Intelligent suggestions for OWL keywords, entities, and IRIs.
- **Diagnostics**: Real-time syntax checking and error reporting for Manchester and Functional syntax.
- **Hover Information**: View entity details and labels by hovering over IRIs in the editor.
- **Go to Definition**: Jump directly to entity declarations.

---

## Installation

### Prerequisites

- **Visual Studio Code** 1.90.0 or newer (or a compatible VS Code fork such as Cursor, Windsurf, or Antigravity)
- **Java Runtime Environment (JRE) 21** or newer (required for the reasoning server)
- **Node.js 18** or newer

### Installing the VS Code Extension

#### From the Marketplace
Search for **OntoGraph** in the VS Code Extensions view (`Ctrl+Shift+X`).

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
ontograph --version   # 0.1.0
ontograph --help
```

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
3. Click **Execute** — requires classification to have run first.
4. Results group into: Direct superclasses, Superclasses, Equivalent classes, Direct subclasses, Subclasses, Instances.

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
```

### Bridge commands — requires OntoGraph running in VS Code

```bash
# Classify the active ontology
ontograph classify

# Check OWL 2 DL consistency
ontograph check-consistency

# Run a DL query
ontograph dl-query "Animal and hasHabitat some Ocean"
ontograph dl-query "pizza:Pizza and pizza:hasTopping some pizza:MozzarellaTopping"
```

### Output format

Every command outputs one JSON line to stdout:

```json
{"success":true,"command":"parse","durationMs":42,"data":{"classCount":9,"format":"manchester","ontologyIri":"http://example.org/animals",...}}
```

Errors:
```json
{"success":false,"command":"classify","durationMs":1500,"error":"OntoGraph extension not detected","errorCode":"BRIDGE_UNAVAILABLE"}
```

Error codes: `FILE_NOT_FOUND` (1), `PARSE_ERROR` (2), `UNSUPPORTED_FORMAT` (3), `BRIDGE_UNAVAILABLE` (10), `BRIDGE_TIMEOUT` (11), `BRIDGE_ERROR` (12).

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

---

## Configuration (VS Code)

Configure OntoGraph in VS Code Settings under `ontograph.*`:

| Setting | Default | Description |
|---------|---------|-------------|
| `ontograph.reasoner.engine` | `auto` | `hermit`, `elk`, or `auto` (ELK for >5k classes) |
| `ontograph.reasoner.javaPath` | `java` | Path to Java 21+ executable |
| `ontograph.reasoner.jvmArgs` | `["-Xmx4g"]` | Extra JVM arguments for the reasoner |
| `ontograph.reasoner.timeoutSeconds` | `600` | Reasoning timeout in seconds |
| `ontograph.display.preferredLabelLanguage` | `en` | Language tag for `rdfs:label` display |
| `ontograph.display.showIriOnHover` | `false` | Show full IRI as tooltip on hover |
| `ontograph.display.axiomEntityStyle` | `label` | `label`, `shortIri`, or `fullIri` in axiom expressions |
| `ontograph.graph.defaultDepth` | `1` | Default graph visualization depth (1–5) |
| `ontograph.largeOntologyThreshold` | `50000` | Class count above which large-ontology optimisations apply |

---

## Architecture

Three tiers: **VS Code extension** → **Java reasoning server** (JSON-RPC on stdin/stdout) → **CLI** (standalone npm package).

```
@ysgao/ontograph-cli (npm)
    ├── Core commands → imports src/parser, src/model, src/serializer directly
    └── Bridge commands → IPC socket → OntoGraph VS Code extension
                                            └── Java reasoner (HermiT / ELK)
```

The CLI uses an OS-native IPC socket (Unix domain socket on macOS/Linux, named pipe on Windows) to communicate with the extension. The extension's public API is exposed via `activate()` return value (`OntoGraphApi` interface in `src/api.ts`), enabling both CLI bridge access and direct extension-to-extension consumption.

---

## License

OntoGraph is licensed under the [Apache-2.0 License](LICENSE).
