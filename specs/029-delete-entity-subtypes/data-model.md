# Phase 1 Data Model: Delete Entity with Subtype Choice

No new persisted entity types are introduced — this feature operates entirely on the existing in-memory `OntologyModel` (`src/model/OntologyModel.ts`) and the source `.ofn`/`.omn`/`.ttl`/`.owl` file it mirrors. This document describes the conceptual entities from the spec in terms of the existing model, plus the transient (non-persisted) shapes the delete command introduces.

## Existing model fields this feature reads/writes

| Model type | Hierarchy field | Notes |
|---|---|---|
| `OWLClass` | `superClassIris: string[]` | Direct declared superclasses. Also consulted: `equivalentClassExpressions`, `superClassExpressions` (named-conjunct subclass detection per `entityInfoCommand.ts`), `equivalentClassIris`, `disjointClassIris` (removed if they reference a deleted class). |
| `OWLObjectProperty` / `OWLDataProperty` / `OWLAnnotationProperty` | `superPropertyIris: string[]` (via shared `OWLProperty`) | Direct declared super-properties. `OWLObjectProperty` additionally has `equivalentPropertyIris`/`disjointPropertyIris` (removed if they reference a deleted property). |
| `OWLIndividual` | — | No hierarchy field; not in scope for subtype/reparenting logic. |

## Transient shapes (not persisted, exist only during a delete operation)

### `DeletionPlan`
Computed once the user selects "Delete Entity" and before the confirmation dialog is shown.

- `targetIri: string` — the selected entity's IRI.
- `targetType: 'class' | 'objectProperty' | 'dataProperty' | 'annotationProperty' | 'individual'`
- `directSubtypeIris: string[]` — direct subclasses/sub-properties of the target (empty for individuals, or for any entity with none), computed via the shared "direct subtype" helper extracted per research.md D1.
- `transitiveSubtypeIris: string[]` — full descendant closure below `targetIri`, computed by repeated application of the direct-subtype helper. Only needed/computed when a mode choice is actually offered (`directSubtypeIris.length > 0`).
- `externalReferenceWarnings: string[]` — human-readable notes surfaced when the target (or, in cascade mode, any transitive subtype) is referenced outside the hierarchy relationship being handled (property domain/range, individual type assertion, another entity's complex class expression) — feeds FR-011.

### `DeletionMode`
- `'entityOnly'` (default) — reparent `directSubtypeIris`, remove only `targetIri`.
- `'entityAndSubtypes'` — remove `targetIri` and every IRI in `transitiveSubtypeIris`.

### Reparenting rule (applied per direct subtype, `entityOnly` mode only)
For each `subtypeIri` in `directSubtypeIris`:
1. Read the target's own super-IRIs (`superClassIris` or `superPropertyIris` depending on `targetType`).
2. In the subtype's corresponding array, replace the occurrence of `targetIri` with the target's super-IRIs, de-duplicating against any super-IRIs the subtype already had directly.
3. If the target had no super-IRIs of its own, the subtype simply loses that one entry (becomes root-level if it had no other parent).

## Validation rules (from Functional Requirements)

- A `DeletionPlan` MUST NOT be computable for a protected root entity (`owl:Thing`, `owl:Nothing`) — the delete action is disabled/not offered for these (FR-009).
- The confirmation step MUST display `directSubtypeIris.length + 1` for `entityOnly` mode's "how many entities change" framing (1 removed, N reparented) and `transitiveSubtypeIris.length + 1` for `entityAndSubtypes` mode's removal count (FR-007).
- If `targetIri` no longer resolves in the live model at execution time (concurrent external edit), the operation MUST abort before any file write (FR-012).
