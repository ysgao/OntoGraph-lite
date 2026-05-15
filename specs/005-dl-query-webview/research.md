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

## Decision 7: Reasoning Invocation Pattern — EquivalentClasses + Classify

**Decision**: Wrap the user's class expression as `EquivalentClasses(TempQueryClass, <expression>)`, add it to the in-memory ontology alongside a declaration axiom for `TempQueryClass`, run full `precomputeInferences(CLASS_HIERARCHY, CLASS_ASSERTIONS)`, then query the **named** `TempQueryClass` via `getSuperClasses(tempClass, ...)`, `getSubClasses(tempClass, ...)`, `getEquivalentClasses(tempClass)`, and `getInstances(tempClass, ...)`.

**Rationale**: ELK (the scalable reasoner used for ontologies > 5 000 classes) only supports hierarchy queries against **named** OWL classes after a full classification; it does not support ad-hoc expression queries (`getSuperClasses(OWLClassExpression, ...)`) with anonymous expressions. HermiT supports both, but using the named-class approach is engine-agnostic. Protégé uses this same EquivalentClasses + classify pattern in its DL Query tab. A fresh `OWLOntologyManager` is used per request, so the temp class and its axiom are discarded automatically when the manager goes out of scope — they are never written to the user's source file.

**Alternatives considered**:
- *Ad-hoc expression query (`reasoner.getSuperClasses(expr, direct)` with anonymous expr)*: Works with HermiT only; ELK rejects it or returns incomplete results — rejected.
- *SubClassOf axiom instead of EquivalentClasses*: Would capture superclasses but not allow symmetric subclass/equivalent inference. EquivalentClasses gives TempQueryClass a complete position in the hierarchy — preferred.

**Filter note**: `getEquivalentClasses(tempClass)` includes `TempQueryClass` itself in the result set. The implementation must filter out the `urn:ontograph:dlquery#TempQuery` IRI before returning equivalent class results to the caller.

---

---

## Decision 8: TypeScript-Owned TempClass Lifecycle with Java Expression Parsing

**Decision**: TempClass **lifecycle ownership** moves to TypeScript (`DLQueryPanel.ts`): a module-level `executing` flag and `Set<string>` of temporary class IRIs are maintained by the panel closure. TempClass is tracked in the set before `bridge.dlQuery()` is called and removed in a `try/finally` block after (even on error). The Java `dlQuery()` method continues to own Manchester expression **parsing** (via `AnnotationValueShortFormProvider` + `BidirectionalShortFormProviderAdapter`) and EquivalentClasses axiom construction. Wire format is unchanged.

**Rationale**: The spec (FR-002, FR-016, clarification 2026-05-15) requires TypeScript to own TempClass lifetime — so that sync-to-disk is inhibited, cleanup is guaranteed, and concurrent Execute clicks are rejected. Full Manchester expression parsing with rdfs:label resolution (required for SNOMED expressions like `'Body structure' and 'All or part of' some 'Entire liver'`) depends on OWLAPI's `AnnotationValueShortFormProvider` and entity index — there is no equivalent in TypeScript today. Delegating expression semantics to Java while TypeScript manages the lifecycle window is the minimal compliant implementation (Constitution II).

**Sync inhibition detail**: In practice, `AnnotationSync` and `AxiomSync` are triggered by explicit user actions (entity edits), not automatically. The `temporaryClassIris` guard in those functions is defensive — required for correctness by construction (FR-016) — but unlikely to fire in normal usage.

**Alternatives considered**:
- *Full TypeScript EquivalentClasses construction*: Requires a Manchester expression → OWL AST transpiler in TypeScript with OWLAPI-equivalent rdfs:label resolution; not available without significant new infrastructure — deferred.
- *Reuse classify() endpoint (no dlQuery() method)*: classify() returns the full hierarchy of all classes; extracting TempClass's position and instances would require additional RPC calls; the existing dlQuery() method returns targeted results more efficiently — retained.

---

## Unresolved Items

None — all NEEDS CLARIFICATION items from the spec were resolved above.
