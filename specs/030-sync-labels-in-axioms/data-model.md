# Data Model: Sync Axiom Display After Entity Label Rename

This feature does not introduce new persisted data structures — it corrects the consistency of existing in-memory structures. The entities below are the existing concepts this feature touches, plus the invariant each one must uphold once this feature ships.

## Entity

Existing concept (`OWLClass` / `ObjectProperty` / `DataProperty` / `AnnotationProperty` / `Individual` in `src/model/OntologyModel.ts`).

- **iri**: stable identifier, unaffected by label renames.
- **labels**: `Record<lang, string[]>` — human-readable name(s), independently renameable.
- Axiom-bearing fields (`superClassExpressions`, `equivalentClassExpressions`, `gciExpressions`, `domainIris`, `rangeIris`, `propertyChains`, etc.) store **IRIs**, never labels. Unaffected by a label rename on any entity, including entities they reference. *(No change required to this layer — confirmed by research Decision 1/2.)*

**Invariant (unchanged by this feature, but foundational)**: An axiom-bearing field never contains a label — only IRIs and literals. This feature does not violate or need to change this invariant; it exists to make sure the *display* layer built on top of it stays honest.

## Axiom Expression (display value)

The rendered string a user sees/edits in the Entity Editor Panel for one axiom (e.g. `"Creature and hasPart some Wing"`), produced by `AxiomDisplay.ts`'s `renderExpression`/`renderExpressionWithEntityRefs` from the entity's IRI-based expression plus the current `OntologyIndex`.

**Invariant (new, this feature)**: Any Axiom Expression shown to the user MUST be rendered using the *current* label of every entity it references, at the moment it is displayed — never a label frozen at an earlier point in the session, unless it represents the user's own in-progress unsaved edit to that specific expression's text.

## Entity Snapshot / Entity Edit History

Existing concept (`EntitySnapshot` type in `EntityEditorMessages.ts`; `EntityEditHistory` class and `entityHistoryMap` in `src/views/EntityEditHistory.ts`). A per-entity cache of previously rendered editor state (labels, all expression fields, annotations), used to preserve undo/redo stacks and in-progress drafts across navigation within a session.

**Invariant (new, this feature)**: A cached `EntitySnapshot` for entity X MUST NOT be served to the UI (via `sendLoadEntity`) if it was captured before a label rename of some *other* entity Y that X's own axioms reference by IRI — doing so would present stale rendered text for Y's mention inside X's axioms. Concretely: whenever an entity's label rename is saved, every *other* entity's history entry that references the renamed entity's IRI anywhere in its axiom-bearing fields MUST be removed from `entityHistoryMap`, so the next load of that entity re-renders fresh from the current model + index. History entries for entities that do **not** reference the renamed entity are left untouched (their in-progress drafts/undo stacks are preserved).

## Label Uniqueness Check (new, lightweight)

Not a new persisted structure — a validation step performed against the existing `OntologyIndex.exactMatchByLabel(label)` lookup at the moment a label change is about to be committed.

- **Input**: the entity being renamed (its IRI, to exclude self-matches) and the new label value being set.
- **Output**: accept (no other entity currently holds that label) or reject with the conflicting entity's IRI/label for the error message.

**Invariant (new, this feature)**: A label rename that would make two distinct entities share the same label (per the existing case-insensitive `exactMatchByLabel` domain) MUST be rejected before it is applied to the model or written to disk. The entity keeps its previous label.

## Relationships / flow summary

```
User edits label in Entity Editor Panel
        │
        ▼
save handler receives msg.labels
        │
        ▼
Label Uniqueness Check (exactMatchByLabel, excluding self)
        │
   ┌────┴─────┐
 reject      accept
   │            │
   ▼            ▼
IriRenameResultMessage-style   entity.labels updated,
error response; entity.labels  written to disk (existing
left unchanged                 AnnotationSync path, unchanged)
                                │
                                ▼
                  Scan all other entities' axiom-bearing
                  fields for references to this entity's IRI
                  (same scan style as updateIriReferencesInModel)
                                │
                                ▼
                  Remove matching entities' entries from
                  entityHistoryMap (entityHistoryMap.delete(iri))
                                │
                                ▼
                  Next sendLoadEntity for any affected entity
                  re-renders fresh via buildEntityPayload,
                  showing the current label
```
