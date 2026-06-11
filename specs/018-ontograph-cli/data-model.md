# Data Model: OntoGraph CLI

**Branch**: `018-ontograph-cli` | **Date**: 2026-06-11

All JSON shapes described here are the canonical output contracts for the CLI. Implementation MUST conform to these schemas.

---

## Common Envelope

Every CLI response is wrapped in this envelope:

```typescript
interface CliResponse<T> {
  success: boolean;       // true on success, false on error
  command: string;        // the command that was invoked, e.g. "parse"
  durationMs: number;     // wall-clock time for the operation
  data?: T;               // present only when success === true
  error?: string;         // human-readable error message (success === false)
  errorCode?: string;     // machine-readable error code (success === false)
}
```

**Error codes**:

| Code | Meaning |
|------|---------|
| `FILE_NOT_FOUND` | The provided file path does not exist |
| `PARSE_ERROR` | File exists but could not be parsed as valid OWL |
| `UNSUPPORTED_FORMAT` | Target format not in supported set |
| `BRIDGE_UNAVAILABLE` | No running OntoGraph extension detected |
| `BRIDGE_TIMEOUT` | Extension did not respond within the timeout |
| `BRIDGE_ERROR` | Extension returned an error for the operation |
| `INVALID_ARGS` | Required argument missing or invalid |

---

## Core Command Payloads

### ParseResult

Returned by `ontograph parse <file>`.

```typescript
interface ParseResult {
  filePath: string;
  format: 'functional' | 'manchester' | 'turtle' | 'owlxml';
  ontologyIri: string | null;
  classeCount: number;
  objectPropertyCount: number;
  dataPropertyCount: number;
  annotationPropertyCount: number;
  individualCount: number;
  axiomCount: number;
}
```

### SearchResult

Returned by `ontograph search <file> <query>`.

```typescript
interface SearchResult {
  filePath: string;
  query: string;
  totalMatches: number;
  results: EntityMatch[];
}

interface EntityMatch {
  iri: string;
  type: 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual';
  label: string | null;       // rdfs:label or skos:prefLabel
  score: number;              // relevance score, higher is better
  matchedFields: string[];    // which fields matched the query
}
```

### ValidateResult

Returned by `ontograph validate <file>`.

```typescript
interface ValidateResult {
  filePath: string;
  valid: boolean;
  issues: ValidationIssue[];
}

interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  location?: string;           // file:line reference if determinable
}
```

### ConvertResult

Returned by `ontograph convert <file> --to <format> [--out <path>]`.

```typescript
interface ConvertResult {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  entityCount: number;
}
```

---

## Extension-Bridged Command Payloads

### ClassificationResult

Returned by `ontograph classify`.

```typescript
interface ClassificationResult {
  ontologyIri: string | null;
  classeCount: number;
  inferredSubclassRelations: number;  // count of new inferred subsumptions
  reasoner: 'hermit' | 'elk';
  hierarchy: ClassHierarchyNode[];    // top-level nodes only (children nested)
}

interface ClassHierarchyNode {
  iri: string;
  label: string | null;
  children: ClassHierarchyNode[];
}
```

### ConsistencyResult

Returned by `ontograph check-consistency`.

```typescript
interface ConsistencyResult {
  ontologyIri: string | null;
  consistent: boolean;
  reasoner: 'hermit' | 'elk';
  explanation: string | null;   // non-null when consistent === false
}
```

### DLQueryResult

Returned by `ontograph dl-query <expression>`.

```typescript
interface DLQueryResult {
  expression: string;
  superClasses: ClassRef[];
  equivalentClasses: ClassRef[];
  subClasses: ClassRef[];
  instances: IndividualRef[];
}

interface ClassRef {
  iri: string;
  label: string | null;
}

interface IndividualRef {
  iri: string;
  label: string | null;
}
```

---

## OntoGraphApi (Extension Export)

Returned by `activate()` in `src/extension.ts`. Also the interface that `BridgeServer` delegates all socket requests to.

```typescript
interface OntoGraphApi {
  classify(): Promise<ClassificationResult>;
  checkConsistency(): Promise<ConsistencyResult>;
  dlQuery(expression: string): Promise<DLQueryResult>;
  getActiveModel(): OntologyModel | null;
  getActiveIndex(): OntologyIndex | null;
}
```

Other VS Code extensions access this via:
```typescript
const ext = vscode.extensions.getExtension<OntoGraphApi>('publisher.ontograph-lite');
const api = await ext?.activate();
const result = await api?.classify();
```

---

## Bridge Lock File

Written by the extension to `~/.ontograph-lite/bridge.json` (macOS/Linux) or `%APPDATA%\ontograph-lite\bridge.json` (Windows).

```typescript
interface BridgeLockFile {
  socketPath: string;      // Unix socket path or Windows named pipe path
  pid: number;             // extension host PID (for stale lock detection)
  workspacePath: string;   // absolute path of the active workspace root
  startedAt: string;       // ISO 8601 timestamp
}
```

`socketPath` examples:
- macOS/Linux: `/tmp/ontograph-lite-12345.sock` (where `12345` is the extension host PID)
- Windows: `\\.\pipe\ontograph-lite`

---

## Bridge IPC Request/Response

Transport: `net.Socket` connected to `socketPath`. Framing: newline-delimited JSON (NDJSON) — each message is a single JSON object terminated by `\n`.

**Request** (CLI → Extension):

```typescript
interface BridgeRequest {
  id: string;                                          // UUID, for matching async responses
  method: 'classify' | 'checkConsistency' | 'dlQuery';
  params: Record<string, unknown>;                     // method-specific params
}
```

**Response** (Extension → CLI):

```typescript
interface BridgeResponse<T> {
  id: string;              // matches request id
  success: boolean;
  data?: T;                // present when success === true
  error?: string;          // present when success === false
  errorCode?: string;
}
```

The CLI wraps the bridge response in the standard `CliResponse<T>` envelope before writing to stdout.
