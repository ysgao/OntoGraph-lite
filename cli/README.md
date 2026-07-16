# @ysgao/ontograph-cli

Standalone CLI for [OntoGraph](https://github.com/ysgao/OntoGraph-lite) OWL ontology operations. Designed for AI coding assistants (Claude Code, Codex) and developers.

All commands print one JSON object to stdout and exit with a standard code. No interactive prompts.

> Need `classify`/`check-consistency`/`dl-query` without a running VS Code instance at all? See the
> separate [`@ysgao/ontograph-cli-standalone`](../cli-standalone/README.md) package (macOS Apple
> Silicon only) — it bundles its own Java runtime and reasoner. It shares this package's core
> commands (`parse`/`search`/`validate`/`convert`/`stats`/`entity-info`) exactly.

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
  ontograph search [file] <query>           # find entities by label or IRI substring
  ontograph validate <file>                 # structural error check
  ontograph convert <file> --to functional  # normalize to OWL Functional Syntax
  ontograph stats <file>                    # ontology-wide statistics summary
  ontograph entity-info [file] <iri>        # detailed lookup for one entity
`search`/`entity-info` resolve an omitted [file] from whatever ontology is open in VS Code.
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

### `ontograph search [file] <query>`

Search entities by label or IRI substring. `<file>` is optional — if omitted, the CLI resolves it
from the ontology file currently open in the running OntoGraph VS Code extension (via the bridge
socket, same mechanism as `classify`/`check-consistency`/`dl-query`).

```bash
ontograph search ./ontology.omn "Finding site"
ontograph search ./snomed.owl "Body structure" --type class --limit 10
ontograph search ./ontology.ofn "hasTopping" --type objectProperty
ontograph search "Finding site"    # uses the file currently open in VS Code
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
    "exactMatches": [
      { "iri": "http://snomed.info/id/363698007", "type": "class", "label": "Finding site", "score": 1, "matchedFields": ["label"] }
    ],
    "results": [
      { "iri": "http://snomed.info/id/363698007", "type": "class", "label": "Finding site", "score": 1, "matchedFields": ["label"] }
    ]
  }
}
```

`exactMatches` holds entities whose label/prefLabel/altLabel equals `query` exactly (case-insensitive)
— the same resolution `entity-info` uses to convert a typed label straight to an IRI. More than one
entry means the label is ambiguous as an identifier; `results` is the full fuzzy-ranked list.

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

### `ontograph stats <file>`

Analyze ontology structure and return comprehensive statistics: entity counts, class hierarchy
depth/breadth, orphan classes, equivalent-class groups, property/axiom/annotation counts.

```bash
ontograph stats ./ontology.ofn
ontograph stats ./snomed.owl
```

Output (abridged):
```json
{
  "success": true,
  "command": "stats",
  "durationMs": 61,
  "data": {
    "filePath": "...",
    "format": "functional",
    "ontologyIri": "http://example.org/my-ontology",
    "classCount": 350412,
    "classHierarchyDepth": 14,
    "orphanClassCount": 2,
    "equivalentClassGroups": 5,
    "subClassOfAxioms": 350401,
    "annotationCount": 700000
  }
}
```

---

### `ontograph entity-info [file] <iri-or-label>`

Detailed lookup for one entity: labels, annotations, asserted axioms, superconcepts, and direct
subconcepts. Handles SNOMED CT–scale ontologies. `<file>` is optional — if omitted, the CLI
resolves it from the ontology file currently open in the running OntoGraph VS Code extension (same
bridge fallback as `search`).

```bash
ontograph entity-info ./ontology.ofn "http://example.org/animals#Koala"
ontograph entity-info ./snomed.owl Koala
ontograph entity-info ./snomed.owl "Middle ear structure"
ontograph entity-info Koala    # uses the file currently open in VS Code
```

Accepts a full IRI, a bare local name (e.g. `Koala` for `...#Koala`), or an exact entity label
(case-insensitive) — resolved in that order via a reverse local-name/label index. If the label
matches more than one entity, the command exits non-zero with `errorCode: "AMBIGUOUS_MATCH"` and a
`candidates` list of matching IRIs to re-run with; if nothing matches, it exits with `NOT_FOUND` and
a `suggestions` list of the closest labels.

Output (abridged, for a class):
```json
{
  "success": true,
  "command": "entity-info",
  "data": {
    "iri": "http://example.org/animals#Koala",
    "type": "class",
    "localName": "Koala",
    "labels": { "en": ["Koala"] },
    "superClasses": [{ "iri": "http://example.org/animals#Marsupial", "label": "Marsupial" }],
    "superClassExpressions": ["has habitat some Forest"]
  }
}
```

`superClasses`/`equivalentClasses`/`disjointClasses`/`directSubClasses` are `{iri, label}` refs
(`label` is `null` if the entity has none) — never bare local names, so numeric-ID ontologies like
SNOMED CT stay readable. `superClassExpressions`/`equivalentClassExpressions`/`gciExpressions` are
Manchester-syntax strings with every embedded IRI already rendered as its label (falling back to a
short IRI when unlabeled). Output shape varies by entity type (`class`, `objectProperty`,
`dataProperty`, `annotationProperty`, `individual`) — see `EntityInfoResult` in
`cli/src/commands/core/entityInfoCommand.ts` for the full field list.

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

Run a DL query against the active ontology. Auto-classifies first if the ontology hasn't been
classified yet (or is stale) — no need to run `ontograph classify` beforehand.

```bash
ontograph dl-query "Animal and hasHabitat some Ocean"
ontograph dl-query "pizza:Pizza and pizza:hasTopping some pizza:MozzarellaTopping"
ontograph dl-query "ClinicalFinding and findingSite some (BodyStructure and partOf some Heart)"
ontograph dl-query "'Middle ear structure' and 'part of' some 'Body structure'"

# Restrict which categories come back, and filter results by label/IRI substring
ontograph dl-query "Body structure" --types directSubClasses,subClasses --filter "liver"
```

Entity references can be a full IRI (`<...>` or bare `http://...`), a `prefix:local` CURIE, a bare
local name, or an exact label/prefLabel/altLabel — multi-word labels normally need `'...'` quotes so
the parser treats them as one label instead of separate words (e.g. `'Body structure'`). If the
**entire** expression is just a bare multi-word phrase with no Manchester keywords or punctuation —
`ontograph dl-query "Body structure"` — the quotes are added for you automatically, since there's
nothing else the expression could mean. Once real Manchester syntax is involved (`and`/`or`/`some`/
etc.), quoting stays manual and required, since the tool can no longer tell where a bare label ends
and an operator begins; an unquoted multi-word label there fails with a hint suggesting the `'...'`
fix. Labels are resolved to IRIs client-side before the expression reaches the reasoner, so
`prefLabel`/`altLabel` work even though the underlying Java parser only recognizes `rdfs:label` and
local names natively.

Flags:
- `--types <list>` — comma-separated result categories: `directSuperClasses`, `superClasses`,
  `equivalentClasses`, `directSubClasses`, `subClasses`, `instances`. Default: `subClasses` only.
  Only the requested categories appear in `data`. An unrecognized value returns `INVALID_ARGS`
  before any bridge call is made.
- `--filter <substring>` — case-insensitive label/IRI substring match, applied client-side to
  every returned category.

Output (default `--types`):
```json
{
  "success": true,
  "command": "dl-query",
  "durationMs": 540,
  "data": {
    "expression": "Animal and hasHabitat some Ocean",
    "subClasses": [{ "iri": "http://example.org/animals#Dolphin", "label": "Dolphin" }]
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
| 13 | `NO_ACTIVE_FILE` | `[file]` omitted from `search`/`entity-info` and no ontology is open in the extension |

---

## Using from AI tools

### Claude Code / Codex

Add to your `CLAUDE.md` or `AGENTS.md`:

```markdown
## OWL Ontology Operations
Use `ontograph` CLI when working with OWL files (.ofn, .omn, .ttl, .owl):
  ontograph parse <file>                    # inspect structure and counts
  ontograph search [file] <query>           # find entities by label or IRI
  ontograph validate <file>                 # check for errors
  ontograph convert <file> --to functional  # normalize to Functional Syntax
  ontograph stats <file>                    # ontology-wide statistics summary
  ontograph entity-info [file] <iri>        # detailed lookup for one entity
`search`/`entity-info` resolve an omitted [file] from whatever ontology is open in VS Code.
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
