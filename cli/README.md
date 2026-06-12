# @ysgao/ontograph-cli

Standalone CLI for [OntoGraph](https://github.com/ysgao/OntoGraph-lite) OWL ontology operations. Designed for AI coding assistants (Claude Code, Codex) and developers.

All commands print one JSON object to stdout and exit with a standard code. No interactive prompts.

## Install

```bash
# Global — puts `ontograph` on PATH
npm install -g @ysgao/ontograph-cli

# pnpm
pnpm add -g @ysgao/ontograph-cli

# Without installing
npx @ysgao/ontograph-cli parse ./ontology.ofn
```

**Requirements**: Node.js 18+. No VS Code required for core commands.

**Claude Code**: installing globally automatically registers the `/ontograph` skill in `~/.claude/skills/ontograph/`. Restart Claude Code after install to activate it.

**Codex**: add to your `AGENTS.md` or `~/.codex/instructions.md`:

```markdown
## OWL Ontology Operations
Use the `ontograph` CLI when working with OWL files (.ofn, .omn, .ttl, .owl, .owx):
  ontograph parse <file>                    # entity counts, format, ontology IRI
  ontograph search <file> <query>           # find entities by label or IRI substring
  ontograph validate <file>                 # structural error check
  ontograph convert <file> --to functional  # normalize to OWL Functional Syntax
All output is JSON on stdout. Exit 0 = success, non-zero = error (errorCode field identifies type).
```

## Quick start

```bash
ontograph --help
ontograph parse ./ontology.ofn
ontograph search ./snomed.owl "Liver structure" --limit 5
```

---

## Core commands — no VS Code required

### `ontograph parse <file>`

Parse an OWL file and return a structural summary.

```bash
ontograph parse ./ontology.ofn
ontograph parse ./snomed.owl
```

Output:
```json
{
  "success": true,
  "command": "parse",
  "durationMs": 42,
  "data": {
    "filePath": "/abs/path/ontology.ofn",
    "format": "functional",
    "ontologyIri": "http://example.org/my-ontology",
    "classCount": 350412,
    "objectPropertyCount": 60,
    "dataPropertyCount": 5,
    "annotationPropertyCount": 18,
    "individualCount": 0,
    "axiomCount": 720000
  }
}
```

Exit codes: `0` success, `1` file not found, `2` parse error.

---

### `ontograph search <file> <query>`

Search entities by label or IRI substring.

```bash
ontograph search ./ontology.omn "Finding site"
ontograph search ./snomed.owl "Body structure" --type class --limit 10
ontograph search ./ontology.ofn "hasTopping" --type objectProperty
```

Flags:
- `--limit <n>` — max results (default: 20)
- `--type <type>` — filter: `class`, `objectProperty`, `dataProperty`, `annotationProperty`, `individual`

Output:
```json
{
  "success": true,
  "command": "search",
  "durationMs": 18,
  "data": {
    "filePath": "...",
    "query": "Finding site",
    "totalMatches": 3,
    "results": [
      { "iri": "http://snomed.info/id/363698007", "type": "class", "label": "Finding site", "score": 1, "matchedFields": ["label"] }
    ]
  }
}
```

---

### `ontograph validate <file>`

Check OWL file for structural errors and warnings.

```bash
ontograph validate ./ontology.ttl
ontograph validate ./ontology.ofn
```

Output (valid file):
```json
{ "success": true, "command": "validate", "durationMs": 3, "data": { "filePath": "...", "valid": true, "issues": [] } }
```

Output (invalid file):
```json
{ "success": true, "command": "validate", "durationMs": 2, "data": { "valid": false, "issues": [{ "severity": "error", "message": "..." }] } }
```

---

### `ontograph convert <file> --to <format>`

Convert an OWL file to a different format.

```bash
# Manchester → OWL Functional Syntax
ontograph convert ./ontology.omn --to functional

# Any format → Turtle, specify output path
ontograph convert ./ontology.ofn --to turtle --out ./ontology.ttl

# OWL/XML → Functional Syntax
ontograph convert ./ontology.owl --to functional --out ./ontology.ofn
```

Flags:
- `--to <format>` *(required)*: `functional` or `turtle`
- `--out <path>`: output path (default: same directory as source with new extension)

Supported targets: `functional` (OWL Functional Syntax), `turtle`. Manchester and OWL/XML write targets are not yet implemented.

---

## Bridge commands — requires OntoGraph running in VS Code

These commands connect to a running OntoGraph VS Code extension via a local IPC socket. They require:
1. VS Code (or compatible fork: Cursor, Windsurf, Antigravity, etc.) open
2. OntoGraph extension installed and activated
3. An ontology file loaded in the editor

No configuration needed — the extension writes a lock file automatically at:
- macOS/Linux: `~/.ontograph-lite/bridge.json`
- Windows: `%APPDATA%\ontograph-lite\bridge.json`

### `ontograph classify`

Run OWL reasoner classification on the active ontology.

```bash
ontograph classify
ontograph classify --timeout 120000   # 2 min timeout for large ontologies
```

Output:
```json
{
  "success": true,
  "command": "classify",
  "durationMs": 8420,
  "data": {
    "ontologyIri": "http://example.org/ontology",
    "classCount": 9,
    "inferredSubclassRelations": 12,
    "reasoner": "elk",
    "hierarchy": [{ "iri": "owl:Thing", "label": null, "children": [...] }]
  }
}
```

### `ontograph check-consistency`

Check whether the active ontology is OWL 2 DL consistent.

```bash
ontograph check-consistency
```

Output:
```json
{ "success": true, "command": "check-consistency", "durationMs": 310, "data": { "consistent": true, "reasoner": "elk", "explanation": null } }
```

### `ontograph dl-query <expression>`

Run a DL query against the active ontology.

```bash
ontograph dl-query "Animal and hasHabitat some Ocean"
ontograph dl-query "pizza:Pizza and pizza:hasTopping some pizza:MozzarellaTopping"
ontograph dl-query "ClinicalFinding and findingSite some (BodyStructure and partOf some Heart)"
```

Output:
```json
{
  "success": true,
  "command": "dl-query",
  "durationMs": 540,
  "data": {
    "expression": "Animal and hasHabitat some Ocean",
    "superClasses": [{ "iri": "http://example.org/animals#Animal", "label": "Animal" }],
    "equivalentClasses": [],
    "subClasses": [{ "iri": "http://example.org/animals#Dolphin", "label": "Dolphin" }],
    "instances": []
  }
}
```

---

## Error handling

When a command fails, stdout still contains valid JSON:

```json
{ "success": false, "command": "classify", "durationMs": 1420, "error": "OntoGraph extension not detected. Open VS Code with OntoGraph active.", "errorCode": "BRIDGE_UNAVAILABLE" }
```

| Exit code | Error code | Meaning |
|-----------|-----------|---------|
| 0 | — | Success |
| 1 | `FILE_NOT_FOUND` | File path does not exist |
| 2 | `PARSE_ERROR` | File cannot be parsed as valid OWL |
| 3 | `UNSUPPORTED_FORMAT` | Target format not supported for writing |
| 4 | `INVALID_ARGS` | Missing or invalid argument |
| 10 | `BRIDGE_UNAVAILABLE` | No running OntoGraph extension detected |
| 11 | `BRIDGE_TIMEOUT` | Extension did not respond in time |
| 12 | `BRIDGE_ERROR` | Extension returned an error |

---

## Using from AI tools

### Claude Code / Codex

Add to your `CLAUDE.md` or `AGENTS.md`:

```markdown
## OWL Ontology Operations
Use `ontograph` CLI when working with OWL files (.ofn, .omn, .ttl, .owl):
  ontograph parse <file>                    # inspect structure and counts
  ontograph search <file> <query>           # find entities by label or IRI
  ontograph validate <file>                 # check for errors
  ontograph convert <file> --to functional  # normalize to Functional Syntax
All output is JSON on stdout. Exit 0 = success, non-zero = error.
```

### Shell script example

```bash
#!/bin/bash
FILE="./snomed.owl"

# Parse and extract class count
COUNT=$(ontograph parse "$FILE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['classCount'])")
echo "Classes: $COUNT"

# Search for a concept
ontograph search "$FILE" "Finding site" --type class --limit 3 | python3 -m json.tool

# Validate before processing
RESULT=$(ontograph validate "$FILE")
VALID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['valid'])")
if [ "$VALID" = "False" ]; then
  echo "Ontology has errors — aborting"
  exit 1
fi
```

---

## Formats supported

| Format | Extension | Read | Write |
|--------|-----------|------|-------|
| OWL Functional Syntax | `.ofn` | ✅ | ✅ |
| Manchester Syntax | `.omn` | ✅ | — |
| OWL/XML | `.owl`, `.owx` | ✅ | — |
| Turtle | `.ttl`, `.n3` | ✅ | ✅ |

---

## VS Code fork compatibility

The bridge uses OS-native IPC sockets, not VS Code internals. It works with any VS Code fork that supports the VSIX extension format:

- **Cursor** ✅
- **Windsurf** ✅
- **Antigravity (Google)** ✅
- **VSCodium** ✅

Install the OntoGraph `.vsix` via the editor's "Install from VSIX" option. Once the extension activates and an ontology is open, `ontograph classify` and other bridge commands work normally.

---

## License

Apache-2.0 — same as [OntoGraph-lite](https://github.com/ysgao/OntoGraph-lite).
