# CLI Command Contract

**Package**: `ontograph-cli` | **Bin**: `ontograph` | **Date**: 2026-06-11

This contract defines the stable public interface for the OntoGraph CLI. All commands print exactly one JSON object to stdout and exit with code 0 (success) or non-zero (failure).

---

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Print command help and exit |
| `--version`, `-v` | Print package version and exit |
| `--timeout <ms>` | Override default operation timeout (default: 30000 for bridge commands, 5000 for core) |

---

## Core Commands (no VS Code required)

### `ontograph parse <file>`

Parse an OWL file and return a structural summary.

**Arguments**:
- `<file>` — path to an OWL ontology file (`.ofn`, `.omn`, `.ttl`, `.owl`, `.owx`, `.n3`)

**Output**: `CliResponse<ParseResult>`

**Exit codes**:
- `0` — parsed successfully
- `1` — file not found (`FILE_NOT_FOUND`)
- `2` — parse error (`PARSE_ERROR`)

**Example**:
```bash
ontograph parse ./test-ontologies/animals.omn
# → {"success":true,"command":"parse","durationMs":42,"data":{"filePath":"...","format":"manchester","classeCount":8,...}}
```

---

### `ontograph search <file> <query>`

Search entities in an OWL file by label or IRI substring.

**Arguments**:
- `<file>` — path to an OWL ontology file
- `<query>` — search term (matched against labels and IRI local names)

**Flags**:
- `--limit <n>` — maximum results to return (default: 20)
- `--type <type>` — filter by entity type: `class`, `objectProperty`, `dataProperty`, `annotationProperty`, `individual`

**Output**: `CliResponse<SearchResult>`

**Example**:
```bash
ontograph search ./pizza.owl "Mozzarella" --type class --limit 5
```

---

### `ontograph validate <file>`

Check an OWL file for structural errors and warnings.

**Arguments**:
- `<file>` — path to an OWL ontology file

**Output**: `CliResponse<ValidateResult>`

**Exit codes**:
- `0` — file is valid (may include warnings)
- `1` — file has errors (`PARSE_ERROR`)

---

### `ontograph convert <file> --to <format>`

Convert an OWL file to a different format.

**Arguments**:
- `<file>` — path to the source OWL file

**Flags**:
- `--to <format>` — *(required)* target format: `functional`, `manchester`, `turtle`, `owlxml`
- `--out <path>` — output file path (default: `<basename>.<ext>` next to source)

**Output**: `CliResponse<ConvertResult>`

**Exit codes**:
- `0` — conversion successful
- `1` — file not found
- `2` — parse error on input
- `3` — unsupported target format (`UNSUPPORTED_FORMAT`)

---

## Extension-Bridged Commands (requires running OntoGraph in VS Code)

All bridged commands require the OntoGraph VS Code extension to be active with an ontology loaded. They discover the extension via `~/.ontograph-lite/bridge.json` (macOS/Linux) or `%APPDATA%\ontograph-lite\bridge.json` (Windows), which contains the IPC socket path. Communication uses newline-delimited JSON over a `net.Socket` (Unix domain socket on macOS/Linux, named pipe on Windows).

### `ontograph classify`

Run OWL reasoner classification on the active ontology.

**Output**: `CliResponse<ClassificationResult>`

**Exit codes**:
- `0` — classification complete
- `10` — no running extension detected (`BRIDGE_UNAVAILABLE`)
- `11` — extension did not respond in time (`BRIDGE_TIMEOUT`)
- `12` — extension reported an error (`BRIDGE_ERROR`)

---

### `ontograph check-consistency`

Check whether the active ontology is OWL 2 DL consistent.

**Output**: `CliResponse<ConsistencyResult>`

**Exit codes**: same as `classify`

---

### `ontograph dl-query <expression>`

Run a DL query against the active ontology and return matching classes.

**Arguments**:
- `<expression>` — a Manchester Syntax class expression (e.g., `"Pizza and hasTopping some MozzarellaTopping"`)

**Output**: `CliResponse<DLQueryResult>`

**Exit codes**: same as `classify`

---

## Error Response Shape

All error responses conform to:

```json
{
  "success": false,
  "command": "parse",
  "durationMs": 3,
  "error": "File not found: /path/to/file.ofn",
  "errorCode": "FILE_NOT_FOUND"
}
```

---

## Versioning

The CLI follows semantic versioning independent of the extension. The bridge protocol version is included in the lock file; incompatible bridge versions result in `BRIDGE_ERROR` with an explanation.
