# Phase 1 Data Model: Show Inferred Equivalent Class in Entity Editor

## Entity: Inferred Equivalent Class Entry

Represents one reasoner-derived, not-explicitly-asserted equivalence between a given OWL class and either a named class or a complex class expression.

| Field | Type | Notes |
|---|---|---|
| `classIri` | string (IRI) | The class this entry is attached to. |
| `equivalentClassIri` | string (IRI), optional | Set when the equivalent target is a single named class. Mutually exclusive with `equivalentClassExpression`. |
| `equivalentClassExpression` | string (Manchester syntax text), optional | Set when the equivalent target is a complex class expression. Mutually exclusive with `equivalentClassIri`. |

**Cardinality**: A class has zero, one, or many entries (e.g., equivalent to two distinct named classes produces two entries sharing the same `classIri`).

**Validation / invariants**:
- Exactly one of `equivalentClassIri` / `equivalentClassExpression` is present per entry (never both, never neither).
- An entry MUST NOT exist for a pair `(classIri, equivalentClassIri)` that is already covered by an asserted `EquivalentClasses` axiom between those two classes (see research.md Decision 1, step 3) — this is what distinguishes an entry as "unintended."
- Entries are symmetric in meaning but not necessarily mirrored in both directions in the wire payload; `classIri` is scoped to whichever class the Entity Editor is currently displaying (see propagation below).
- Only produced for named OWL classes; never for object/data/annotation properties or individuals.
- Only produced while classification is current (`OntologyModel.isClassified === true && OntologyModel.classificationNeedsUpdate === false`); otherwise treated as absent.

## Propagation across layers

| Layer | Representation |
|---|---|
| Java: `OntologyService.buildClassificationResult` | Computed as `List<EquivalentClassEntry>`-equivalent (a small record/tuple type or reused list-of-lists, following existing `hierarchy` conventions) inside the classify pass. |
| JSON-RPC classify response (`ReasonerServer.classify`) | New field `equivalentClasses: Array<{classIri, equivalentClassIri?, equivalentClassExpression?}>` alongside existing `consistent`, `incoherentClasses`, `hierarchy`. |
| TypeScript: `ReasonerBridge.ClassificationResult` | New field `equivalentClasses: EquivalentClassEntry[]` (same shape as the wire format). |
| TypeScript: `OntologyModel` | New field `inferredEquivalentClasses: Map<string, { iris: string[]; expressions: string[] }>` — keyed by class IRI, built once in `classifyOntology.ts` by grouping `result.equivalentClasses` entries by `classIri` and splitting named vs. complex targets. Mirrors the existing `inferredSubClasses: Map<string, Set<string>>` field's shape/lifecycle. |
| TypeScript: `EntityEditorPanel` → `LoadEntityMessage` | New optional fields `inferredEquivalentClassIris?: string[]` and `inferredEquivalentClassExpressions?: string[]`, populated only for `entityType: 'class'`, only when `model.isClassified && !model.classificationNeedsUpdate`, and only non-empty (otherwise omitted, per FR-007/FR-008). Complex expressions pass through `renderExpressionsWithRefs(...)` exactly as `equivalentClassExpressions`/`gciExpressions` already do, so entity references remain clickable. |
| Webview: `EntityEditorApp.ts` | Rendered read-only, styled red, in a section titled "Inferred Equivalent Class," positioned between the "GCI (General Concept Inclusions)" and "DisjointWith" sections; entirely absent from the DOM when both arrays are empty/absent. Excluded from `getCurrentState()`/dirty-check and never included in any save payload. |

## State transitions

There is no independent lifecycle for this entity beyond the ontology's existing classification lifecycle:

1. **Unclassified** (`isClassified === false`): no entries exist anywhere; section never renders.
2. **Classified, current** (`isClassified === true`, `classificationNeedsUpdate === false`): entries reflect the most recent classify run; section renders if and only if the current class has ≥1 entry.
3. **Classified, stale** (`isClassified === true`, `classificationNeedsUpdate === true`, e.g. after an ontology edit): treated identically to Unclassified for display purposes — section does not render — until the user re-runs classification, which recomputes and replaces `inferredEquivalentClasses` in full (no incremental/partial update).

No new persistence, migration, or versioning concerns — this data is entirely derived and transient, discarded/recomputed on every classify run and never written to the ontology source file.
