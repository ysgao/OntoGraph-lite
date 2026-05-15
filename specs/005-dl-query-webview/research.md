# Research: DL Query Webview

**Feature**: 005-dl-query-webview  
**Phase**: 0 — Research  
**Date**: 2026-05-15

---

## Decision 1: DL Query Support in the Java Reasoner

**Decision**: Add a new `dlQuery` JSON-RPC method to both `OntologyService.java` and `ReasonerServer.java`.

**Rationale**: DL query (query by class expression) is **not currently supported** in the Java reasoner. The existing JSON-RPC methods are `ping`, `classify`, `checkConsistency`, and `convertFormat`. OWLAPI 5 natively supports all six required relationship-type queries via `OWLReasoner`:
- `reasoner.getSuperClasses(expr, direct)`
- `reasoner.getSubClasses(expr, direct)`
- `reasoner.getEquivalentClasses(expr)`
- `reasoner.getInstances(expr, direct)`

These can be wired into a new `dlQuery` operation following the existing per-request fresh-manager pattern in `OntologyService`.

**Alternatives considered**:
- *Reuse classify results client-side*: Cannot support arbitrary class expressions, only named entities — rejected.
- *Pre-cache the reasoner between requests*: Would reduce latency for repeat queries but adds stateful complexity prohibited by Constitution II (YAGNI). The per-request pattern is the existing standard; defer caching to a future optimisation.

---

## Decision 2: Class Expression Parsing for Syntax Validation

**Decision**: Use `omnParser.parse(text, { startRule: 'ClassExpression' })` directly for immediate syntax pre-validation in the extension host, before sending to Java.

**Rationale**: `ManchesterParser` only exposes a full-ontology `parse()` method; `parseClassExpr()` is private. The Peggy-generated `omnParser.js` already supports `ClassExpression` as an allowed start rule (verified in `package.json` build script). Calling it with `{ startRule: 'ClassExpression' }` gives lightweight, fast syntax feedback. Full semantic validation (IRI resolution, unknown entity detection) is performed by OWLAPI on the Java side.

**Alternatives considered**:
- *Add a public `parseClassExpression()` method to ManchesterParser*: Viable but creates more surface area than needed for DL Query (Constitution II). Deferred.
- *Rely solely on Java error responses for syntax errors*: Adds a round-trip latency cost and is slower to display error feedback — rejected.

---

## Decision 3: Webview Implementation Pattern

**Decision**: Follow the `EntityEditorPanel.ts` singleton panel pattern with typed discriminated-union messages (`DLQueryMessages.ts`) and a browser IIFE bundle (`webview-src/dl-query/DLQueryApp.ts` → `dist/dl-query-webview.js`).

**Rationale**: This pattern is already established for entity-editor, graph, and SPARQL-editor webviews. Consistent architecture reduces cognitive overhead and reuses the nonce/CSP/HTML-builder approach already present. `retainContextWhenHidden: true` preserves the current expression and results when the panel is temporarily hidden.

**Alternatives considered**:
- *VS Code TreeView + QuickPick instead of webview*: Cannot reproduce the two-panel Protégé layout (query input + results alongside checkboxes) — rejected.
- *Custom editor instead of webview panel*: Appropriate only when the file itself is the primary artifact — not applicable here.

---

## Decision 4: Entity Navigation (Click-to-Focus)

**Decision**: Reuse the existing `revealInTreeView(iri, entityType)` function in `extension.ts`. The DL Query panel sends a `'navigate'` message to the extension host; the message handler calls `revealInTreeView`.

**Rationale**: `revealInTreeView` already handles all entity types (class → Classes tree, individual → Individuals tree) and catches reveal errors silently. Zero new infrastructure needed.

**Entity type detection**: The Java `dlQuery` response will tag each returned entity's IRI with its type (class or individual). Query types "Instances" → individuals; all other types → classes.

---

## Decision 5: Request Shape for `dlQuery`

**Decision**: New JSON-RPC request:

```json
{
  "id": <number>,
  "method": "dlQuery",
  "params": {
    "format": "<format-string>",
    "content": "<ontology-string> | null",
    "filePath": "<path> | null",
    "engine": "auto | elk | hermit",
    "classExpression": "<Manchester-syntax-string>",
    "queryTypes": ["directSuperClasses","superClasses","equivalentClasses","directSubClasses","subClasses","instances"]
  }
}
```

Response:
```json
{
  "id": <number>,
  "result": {
    "directSuperClasses": ["<iri>", ...],
    "superClasses":       ["<iri>", ...],
    "equivalentClasses":  ["<iri>", ...],
    "directSubClasses":   ["<iri>", ...],
    "subClasses":         ["<iri>", ...],
    "instances":          ["<iri>", ...]
  }
}
```

Only the requested `queryTypes` keys are populated; unselected types are absent or empty. This avoids running unnecessary reasoner operations.

---

## Decision 6: Manchester Syntax Parsing in Java (OntologyService)

**Decision**: Use OWLAPI's `ManchesterOWLSyntaxParser` (from `org.semanticweb.owlapi.manchestersyntax.parser`) to parse the class expression string within the context of the loaded ontology, ensuring IRI resolution from the ontology's prefix map.

**Rationale**: OWLAPI's built-in Manchester parser correctly resolves prefixed names (e.g., `Animal`, `owl:Thing`) against the ontology's declared prefix map and entity declarations. This is the canonical OWLAPI approach and requires no additional library.

---

## Unresolved Items

None — all NEEDS CLARIFICATION items from the spec were resolved above.
