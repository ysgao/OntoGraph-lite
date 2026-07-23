# Research: Sync Axiom Display After Entity Label Rename

## Context recap

Two research passes over the existing codebase (see conversation history) established:

- Axiom expressions are stored in the model by **IRI**, never by label. Label text only appears at display time, produced by `AxiomDisplay.ts`'s `renderExpression`/`renderExpressionWithEntityRefs` (via `renderIri`/`getLabel`), and parsed back to IRIs on save by `normalizeExpression` (same file), which calls `OntologyIndex.exactMatchByLabel`.
- The rename-of-label flow is NOT a distinct message — it arrives as part of the generic `case 'save':` handler in `EntityEditorPanel.ts` (~line 813: `if (msg.labels !== undefined) { entity.labels = msg.labels; }`), scoped purely to that one entity's own annotation segment via `AnnotationSync.ts`. No duplicate-label check exists today, and nothing touches other entities' cached state.
- By contrast, the **IRI**-rename flow (`case 'renameIri':`, ~line 550-655) already does a duplicate check (`renameIndex.getByIri(newIri) !== undefined`) and explicitly fans out via `updateIriReferencesInModel` (~line 1208), which does a full scan of every entity map to patch IRI references anywhere they appear. This is the established precedent for "propagate a rename across the whole model" — it has just never been applied to label renames.
- `EntityEditHistory`'s `entityHistoryMap` (`src/views/EntityEditHistory.ts`) caches, per entity IRI, a fully label-rendered `EntitySnapshot` (`buildEntityPayload` output). `sendLoadEntity` prefers this cached snapshot over a fresh render whenever `bypassHistory` is false (ordinary navigation). The map is only ever cleared wholesale (`entityHistoryMap.clear()`), at two call sites: opening a different source file, and panel disposal. Nothing invalidates one entity's cached snapshot when a *different* entity's label changes — this is the root cause of the staleness bug.
- The Entity Editor Panel is a **module-level singleton** (`let panel: vscode.WebviewPanel | undefined`) — only one entity is ever being edited/displayed at a time. There is no scenario where two entities' axiom text are simultaneously visible and need live, in-place patching; the staleness only surfaces on *navigation back* to a previously-viewed entity.
- No reverse/"referenced by" index exists anywhere in `OntologyIndex.ts` or `OntologyModel.ts`. The only place a rename fans out today (`updateIriReferencesInModel`) does so via a full linear scan of every entity map, not a precomputed reverse index.

## Decision 1: Duplicate-label rejection

**Decision**: Before committing a label change in the `save` handler, check the new label against the model's existing label index (`OntologyIndex.exactMatchByLabel`, the same case-insensitive lookup already used for search/entity-info/`normalizeExpression`) for any match belonging to an entity other than the one being renamed. If found, reject the label portion of the save with a clear error identifying the conflicting entity, leave the entity's label unchanged, and still apply any other valid changes in the same save (consistent with how `saveDraftError` already lets valid parts of a save proceed while flagging invalid parts).

**Rationale**: `exactMatchByLabel` already exists, is already the uniqueness domain the rest of the app relies on (it doesn't distinguish rdfs:label from skos:prefLabel/altLabel — using the same domain avoids introducing a second, inconsistent notion of "duplicate"), and mirrors the existing `renameIri` duplicate-check precedent (`renameIndex.getByIri(newIri) !== undefined`) rather than inventing a new pattern.

**Alternatives considered**:
- *Silent allow + resolve by IRI internally* — rejected per user clarification (spec Clarifications section): would leave axiom text ambiguous to a human reader even if the system never actually mis-resolves internally.
- *Allow with a warning* — rejected per the same clarification; the user chose "block outright."
- *New bespoke label-uniqueness index scoped only to rdfs:label* — rejected as unnecessary scope increase; `exactMatchByLabel`'s existing domain is good enough and keeps behavior consistent with existing search/lookup semantics.

## Decision 2: Cache invalidation strategy for `entityHistoryMap`

**Decision**: On a successful label-change save, perform a full scan of the model's entity maps (the same style of scan `updateIriReferencesInModel` already performs for IRI renames) to find every OTHER entity whose axiom-expression fields (superClassExpressions, equivalentClassExpressions, gciExpressions, domain/range IRIs, property chains, etc.) reference the renamed entity's IRI. For each entity found, remove its entry from `entityHistoryMap` (if present) so the next time that entity is loaded, `sendLoadEntity` falls back to a fresh `buildEntityPayload` render using the current label — rather than serving stale cached text.

**Rationale**: Selective invalidation preserves legitimate in-progress drafts/undo history for entities *unrelated* to the rename, which a blanket `entityHistoryMap.clear()` would needlessly destroy. The scan itself is bounded to a single rename-time operation (a deliberate, infrequent user action, not a hot path), and reuses a scanning approach the codebase has already accepted as performant enough for the sibling IRI-rename operation on the same data structures.

**Alternatives considered**:
- *Full `entityHistoryMap.clear()` on every label save* — simpler to implement, matches the existing document-reload precedent exactly, but has a larger blast radius: it would discard every other entity's undo/redo stack and in-progress unsaved drafts even when they don't reference the renamed entity at all. Rejected as unnecessarily destructive when a bounded, targeted scan is affordable and a precedent already exists for it.
- *Precompute and maintain a reverse ("referenced by") index incrementally* — would make invalidation O(1) instead of O(N) per rename, but requires introducing and maintaining a new index structure across every axiom mutation path (create, delete, edit), which is a much larger surface of change than this bug fix warrants. Rejected as disproportionate; can be revisited later if rename-time scan cost becomes a measured problem on very large ontologies.
- *Re-render fresh on every navigation, discarding the cache concept entirely* — would also discard legitimate draft/undo state on ordinary navigation, defeating the purpose of `014-entity-editor-undo-redo`. Rejected.

## Decision 3: Where the error surfaces to the user

**Decision**: Extend the existing `EntityEditorExtToWebview` message union with a small, dedicated result message for label-rename rejection, following the same shape as the existing `IriRenameResultMessage` (`{ type: 'iriRenameResult'; success: boolean; newIri?: string; error?: string }`), so the webview UI has a consistent, precedented way to surface "your rename was rejected and why" for both the IRI and label rename cases.

**Rationale**: Reusing an established message shape (rather than folding the rejection into the more general `saveDraftError`, which is about invalid *axiom expression text*, not label conflicts) keeps the two conceptually distinct kinds of rejection (bad expression syntax vs. duplicate identity) visible as separate, self-documenting contracts.

**Alternatives considered**: Piggybacking on `SaveDraftErrorMessage` — rejected because a duplicate-label rejection is not an "invalid draft expression," and conflating the two would make the webview's error-handling logic branch on message *content* instead of message *type*.

## Outstanding NEEDS CLARIFICATION

None — the spec's single clarification (duplicate-label handling policy) was resolved during `/speckit-specify`.
