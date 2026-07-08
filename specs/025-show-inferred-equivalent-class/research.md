# Phase 0 Research: Show Inferred Equivalent Class in Entity Editor

No `[NEEDS CLARIFICATION]` markers remained in the Technical Context, but the feature has one genuinely open engineering question — *how* to compute "inferred equivalent class" correctly and efficiently — which is resolved here before design.

## Decision 1: Where and how to compute inferred equivalent classes

**Decision**: Compute equivalence data inside the existing classification pass, `OntologyService.buildClassificationResult`, immediately after the existing unsatisfiable-class and hierarchy-BFS computation, reusing the same `OWLReasoner` instance. For each named class `C` in the ontology's signature:

1. Query `reasoner.getEquivalentClasses(C)` → a `Node<OWLClass>` of named classes reasoner-entailed equivalent to `C`. This is iterated over `ontology.getClassesInSignature()`, not just the hierarchy BFS's visited set — a class that collapses into `owl:Thing`'s equivalence node never appears as a hierarchy edge (it *is* Thing, not a subclass of it), so it would otherwise be silently skipped (this is exactly the `owl:Thing`-equivalence edge case the spec calls out).
2. Drop `C` itself from the node's members.
3. Drop any member `D` where `ontology.getEquivalentClassesAxioms(C)` already asserts `EquivalentClasses(C, D)` — i.e., drop equivalences the author explicitly declared, since those are intentional and already shown in the existing EquivalentTo Axioms section.
4. For complex-expression equivalence, build two syntactic sets per class using cheap axiom-index accessors (no reasoner calls): `subSide` = anonymous expressions `E` where `SubClassOf(C, E)` is asserted, and `superSide` = anonymous expressions `E` where `SubClassOf(E, C)` is asserted. Intersect them — only expressions appearing on **both** sides (a genuine two-way GCI cycle) become candidates. For each surviving candidate not already asserted equivalent, call `reasoner.getEquivalentClasses(candidate)` and check whether `C` is a member; if so, record it (rendered as OWL Functional Syntax text via `FunctionalSyntaxObjectRenderer`).
5. Whatever survives steps 2–4 becomes the "inferred equivalent classes" set for `C`.

**Rationale**:
- Reuses the reasoner instance and the BFS traversal already being paid for in `buildClassificationResult`, so no second classification pass is needed.
- `getEquivalentClasses` is the reasoner API OWLAPI already exposes for exactly this entailment (it is already used elsewhere in the codebase for a different purpose — the DL-query temp-class path — confirming it behaves as expected against the project's existing reasoners, HermiT and ELK).
- **The two-sided intersection in step 4 is load-bearing for performance, not just a simplification.** An earlier version of this design tested *every* anonymous expression touching `C` in either direction (e.g. every `ObjectSomeValuesFrom` restriction used in a definitional axiom) via `reasoner.getEquivalentClasses(candidate)`. Verified against `test-ontologies/anatomy.owl` (~75k classes, SNOMED-scale, hundreds of thousands of restriction axioms), that approach took 141 seconds and then crashed with `OutOfMemoryError` — `getEquivalentClasses` on a fresh/ad-hoc class expression is not O(1) the way a named-class query is; it requires the reasoner to reason about that expression each time, and doing so for every one-directional restriction axiom at SNOMED scale is infeasible. A one-directional restriction can never be entailed equivalent to `C` without some other axiom making the relationship two-way, so requiring both `SubClassOf(C, E)` and `SubClassOf(E, C)` to already be asserted before invoking the reasoner discards exactly the candidates that could never resolve to equivalence anyway, while catching the actual failure mode (an accidental/copy-paste two-way `SubClassOf` cycle). Re-verified after the fix: anatomy.owl classifies in ~7 seconds total (load + reasoner-init + precompute + equivalence pass), consistent with the reasoner's own precompute cost, with 142 genuine equivalences found.
- Filtering out already-asserted equivalences directly encodes the spec's core distinction (Assumption in spec.md): only *unintended* equivalences are shown as errors; intentional ones stay in the existing EquivalentTo section, never duplicated.

**Alternatives considered**:
- *Test every anonymous expression touching `C` in either direction* (the original design): rejected after benchmarking — causes an `OutOfMemoryError` at SNOMED-CT scale (see Rationale above).
- *Ontology-wide scan of every anonymous class expression in the signature, tested against every class*: rejected — even more expensive than the above; O(classes × expressions) is infeasible at SNOMED CT scale.
- *Only support named-class equivalence, skip complex expressions*: rejected — contradicts the spec's explicit requirement (FR-004) and the user's explicit request that the display "could be complex expression." The two-sided intersection narrowing keeps this requirement while staying safe at scale.
- *Compute this lazily on-demand when a class is opened in the Entity Editor, calling the reasoner from the extension host per open*: rejected — the extension host does not hold a live `OWLReasoner`; it would require spawning/maintaining a second reasoner session outside the classify JSON-RPC call, adding process/latency overhead and duplicating state that classification already computes once for the whole ontology.

## Decision 2: Wire format for the new equivalence data (JSON-RPC + `postMessage`)

**Decision**: Add a flat array field to the classify response and to `ClassificationResult`, mirroring the existing `hierarchy: [string, string][]` tuple-array convention rather than introducing a new IRI-keyed object:

```
equivalentClasses: Array<{
  classIri: string;
  equivalentClassIri?: string;         // present when the equivalent target is a named class
  equivalentClassExpression?: string;  // present when the equivalent target is a complex expression (Manchester syntax text)
}>
```

Multiple equivalences for the same class are represented as multiple entries sharing the same `classIri`, exactly as multiple hierarchy edges share the same parent.

**Rationale**: Matches the established, simplest-possible wire-format convention already used by `hierarchy` and avoids inventing a second shape (map keyed by IRI) for what is structurally the same kind of data (a relation between a class and something else). Keeps the JSON-RPC schema change minimal and easy to review against the existing `ClassificationResult` type.

**Alternatives considered**: A `Record<string, {...}>` keyed by class IRI — rejected as inconsistent with the existing tuple/array convention and no easier to consume, since the TypeScript side already builds a `Map` from the flat `hierarchy` array today (`classifyOntology.ts`) and can do the same here.

## Decision 3: Read-only rendering in the webview without disturbing dirty-tracking

**Decision**: The webview's save/dirty-check logic (`getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts:1581-1599`, diffed by `checkForChanges()`) only includes fields it explicitly lists per entity type — it does not iterate `editorMap` wholesale. Therefore the new section can safely reuse the existing CodeMirror-based expression-rendering machinery (`createExpressionEntry`/`createEditor`, which gives Manchester-syntax highlighting and clickable entity references, satisfying FR-005) as long as:
- Its section key (e.g. `inferredEquivalentClassExpressions`) is never added to `getCurrentState()`'s per-type payload, so it can never be picked up as a pending change.
- The per-entry "+" add button and "×" delete button (present in the existing editable `renderExpressionSection`/`createExpressionEntry`) are suppressed for this section, and the underlying CodeMirror editor is configured read-only, since this content is derived reasoning output the user cannot edit (FR-009).

This requires a small, additive variant of the existing render helpers (e.g., a `readOnly` flag threaded through `renderExpressionSection`/`createExpressionEntry`, or a dedicated read-only counterpart) rather than a change to the existing editable sections' behavior.

**Rationale**: Minimizes risk to the existing, already-tested editable sections while reusing their visual/interactive design (satisfying user story 3's consistency goal) and naturally satisfying the "excluded from save" and "read-only" requirements without new dirty-tracking logic.

**Alternatives considered**: Rendering the section as plain (non-CodeMirror) text — rejected because it would lose clickable entity references and Manchester-syntax formatting that the spec explicitly requires to match the EquivalentTo section's behavior (FR-005, user story 3).

## Decision 4: Staleness / gating

**Decision**: Gate population of `OntologyModel.inferredEquivalentClasses` identically to the existing `inferredSubClasses` field: populated only in `classifyOntology.ts` right after a successful classify call, alongside `model.isClassified = true` / `model.classificationNeedsUpdate = false`. When classification has never run, or `classificationNeedsUpdate` is true (ontology edited since last classify), `EntityEditorPanel` omits the new `LoadEntityMessage` fields entirely (as if empty), so the webview naturally renders nothing (FR-008).

**Rationale**: Reuses an existing, already-understood staleness convention instead of introducing a second one, per the spec's Assumptions section.

**Alternatives considered**: A separate "stale" visual indicator instead of hiding — explicitly out of scope per the spec's Assumptions (reuse existing behavior, no new staleness UX).
