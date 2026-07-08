# Contract: Inferred Equivalent Classes

This feature crosses two existing internal boundaries. Both are additive, optional-field extensions — no existing field changes shape or meaning.

## 1. JSON-RPC: `classify` response (Java reasoner server → extension host)

**Existing response shape** (`ReasonerServer.classify`, `java-server/.../ReasonerServer.java:124-126`):

```json
{
  "consistent": true,
  "incoherentClasses": ["http://example.org/A"],
  "hierarchy": [["http://example.org/Thing", "http://example.org/A"]]
}
```

**Extended response shape**:

```json
{
  "consistent": true,
  "incoherentClasses": ["http://example.org/A"],
  "hierarchy": [["http://example.org/Thing", "http://example.org/A"]],
  "equivalentClasses": [
    {
      "classIri": "http://example.org/A",
      "equivalentClassIri": "http://example.org/B"
    },
    {
      "classIri": "http://example.org/A",
      "equivalentClassExpression": "ObjectIntersectionOf(<http://example.org/C> <http://example.org/D>)"
    }
  ]
}
```

**Rules**:
- `equivalentClasses` is always present (an empty array when there are no unintended equivalences, or when the ontology is inconsistent — equivalence data is only meaningful for a consistent ontology, matching the existing pattern where `hierarchy` is also only populated `if (consistent)`).
- Each entry has exactly one of `equivalentClassIri` or `equivalentClassExpression`.
- An entry is present only when the equivalence is reasoner-entailed and **not** already covered by an asserted `EquivalentClasses` axiom between the same two named classes (named-class case), or already asserted at all for the complex-expression case.
- `equivalentClassExpression`, when present, is serialized as OWL Functional Syntax text (consistent with how `gciExpressions` values are already produced elsewhere in the pipeline), to be parsed/rendered by the same Manchester-syntax display path already used for GCI/EquivalentTo expressions.

**Consumer**: `ReasonerBridge.classify(...)` / `ReasonerBridge.classifyFile(...)` (`src/reasoner/ReasonerBridge.ts`) parses this JSON and returns it as part of `ClassificationResult`.

## 2. TypeScript: `ClassificationResult` (ReasonerBridge → command layer)

**Existing** (`src/reasoner/ReasonerBridge.ts:9-14`):

```ts
export interface ClassificationResult {
  consistent: boolean;
  incoherentClasses: string[];
  hierarchy: [string, string][];
}
```

**Extended**:

```ts
export interface EquivalentClassEntry {
  classIri: string;
  equivalentClassIri?: string;
  equivalentClassExpression?: string;
}

export interface ClassificationResult {
  consistent: boolean;
  incoherentClasses: string[];
  hierarchy: [string, string][];
  equivalentClasses: EquivalentClassEntry[];
}
```

**Consumer**: `src/commands/classifyOntology.ts`, which groups `result.equivalentClasses` by `classIri` into `model.inferredEquivalentClasses: Map<string, { iris: string[]; expressions: string[] }>` at the same point it currently builds `model.inferredSubClasses` from `result.hierarchy`.

## 3. Webview message: `LoadEntityMessage` (extension host → Entity Editor webview)

**Existing relevant fields** (`src/views/EntityEditorMessages.ts`):

```ts
equivalentClassIris?: string[];
equivalentClassExpressions?: string[];
gciExpressions?: string[];
disjointClassIris?: string[];
```

**Added fields** (same message, class-entity payload only):

```ts
inferredEquivalentClassIris?: string[];
inferredEquivalentClassExpressions?: string[];
```

**Rules**:
- Populated by `EntityEditorPanel` only for `entityType: 'class'`, and only when `model.isClassified && !model.classificationNeedsUpdate` and `model.inferredEquivalentClasses.get(iri)` yields a non-empty result; otherwise both fields are omitted (`undefined`), matching how other optional class-only fields already behave when not applicable.
- `inferredEquivalentClassIris` entries are plain IRIs (webview resolves display labels itself, exactly as it already does for `equivalentClassIris`).
- `inferredEquivalentClassExpressions` entries are pre-rendered display text produced via the existing `renderExpressionsWithRefs(...)` helper, with accompanying entries in `expressionEntityRefs['inferredEquivalentClassExpressions']` for clickable entity references — same mechanism already used for `equivalentClassExpressions` and `gciExpressions`.
- These two fields are never read by the webview's `getCurrentState()`/save-diff logic and are never sent back to the extension host in any outbound message — the relationship is one-way (host → webview) and read-only.

**Consumer**: `webview-src/entity-editor/EntityEditorApp.ts`'s class-rendering branch, which renders a new "Inferred Equivalent Class" section (read-only, red-styled) between the "GCI (General Concept Inclusions)" and "DisjointWith" sections when either field is non-empty, and renders nothing when both are empty/absent.
