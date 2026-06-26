# Research: Create New Ontology Entity

**Phase**: 0 | **Branch**: `019-create-entity` | **Date**: 2026-06-26

## 1. Existing addEntity Command

**Decision**: Implement as a full replacement of the existing stub at `src/commands/addEntity.ts`.

**Rationale**: The stub already receives the `OntologyModel` parameter and is registered in `extension.ts:426` under `ontograph.addEntity`. No scaffolding changes needed — only the stub body needs to be replaced.

**Existing entry point**: `extension.ts:426` — `vscode.commands.registerCommand('ontograph.addEntity', () => addEntity(activeModel))`

**Alternatives considered**: Creating a new command; rejected because the stub already exists and is wired to the palette.

---

## 2. Entity Editor IRI Display

**Decision**: The Entity Editor currently displays the full IRI in a read-only `<span id="entity-iri">` in the toolbar (EntityEditorApp.ts:1375). To support P3 (IRI editing), this span must be replaced with an editable `<input>` field. A new `RenameIriMessage` webview→extension message must be added.

**Rationale**: Replacing the span with an input is minimal; the existing `SaveEntityMessage` protocol is the model to follow for the new `RenameIriMessage`.

**Alternatives considered**: Inline editing of the IRI via a double-click context; rejected as less discoverable.

---

## 3. Namespace Resolution

**Decision**: Resolve namespace in this priority order:
1. `vscode.workspace.getConfiguration('ontograph').get<string>('entity.defaultNamespace')` if non-empty
2. `model.metadata.iri` if set (all five parsers populate this from the ontology header)
3. Prompt user via `vscode.window.showInputBox()` with a placeholder like `http://example.org/ontology#`

**Rationale**: `model.metadata.iri` is reliably populated by all five parsers. Using a VS Code configuration setting as override covers multi-ontology workflows.

**Namespace separator**: The setting/metadata IRI is used verbatim — the namespace is expected to already end with `#` or `/`. The local name is appended directly (no inserted separator).

---

## 4. IRI Construction and Validation

**Decision**: `IRI = namespace + localName`. Validation rules:
- Local name must be non-empty.
- Local name must match `^[A-Za-z_][A-Za-z0-9_\-\.]*$` (safe subset; rejects spaces and shell-unsafe characters).
- The resulting IRI must not already exist in `OntologyIndex.getByIri()`.

**Rationale**: This subset is sufficient for practical ontology work and gives a clear error message. More permissive IRI local-name specs allow percent-encoding but that complexity is out of scope for v1.

**Alternatives considered**: Accepting any RFC 3987 IRI segment; rejected as too complex for a validation error UX.

---

## 5. Entity Type Selection

**Decision**: Use `vscode.window.showQuickPick()` with options: `Class`, `Object Property`, `Data Property`, `Annotation Property`, `Named Individual`. The picked label maps to the `EntityType` discriminant.

**Rationale**: QuickPick is the standard VS Code pattern for selecting from a small fixed list without a modal dialog.

---

## 6. Writing New Entity to Source File

**Decision**: Implement a new `EntityCreationSync` module (`src/sync/EntityCreationSync.ts`) that inserts the Declaration axiom and entity cluster at the correct location in the source file. For `.ofn` files, the new Declaration goes at the end of the existing Declarations block; the entity cluster appends immediately before the closing `)` of the `Ontology(...)` block or after the last entity cluster of the same type. For other formats (`.omn`, `.ttl`, `.owl`), only `.ofn` is required for the initial implementation — other formats fall back to full re-serialization via `FunctionalSerializer` after format conversion.

**Actually revised decision**: For this feature, entity creation writes to the in-memory model first and then calls `vscode.workspace.applyEdit()` to insert the Declaration and cluster text at the end of the Declarations section (before the first non-Declaration logical axiom line). This avoids reimplementing per-format parsing.

**Rationale**: The FunctionalSerializer already generates the correct entity cluster text via `generateEntityCluster()` (used in tests). Insertion rather than full re-serialization preserves unrelated comments and formatting in the file.

**Alternatives considered**: Full re-serialization on new entity; rejected because it would alter formatting for the rest of the file and discard comments.

---

## 7. IRI Rename in Source File

**Decision**: Implement `IriRenameSync` (`src/sync/IriRenameSync.ts`) that performs a text-level replacement of `<oldIri>` with `<newIri>` throughout the document. Because all entity IRIs use the `<IRI>` bracket form (per the IRI abbreviation rule), a simple `replaceAll` with angle brackets is safe and unambiguous.

**Rationale**: The IRI abbreviation rule (CLAUDE.md) guarantees that entity IRIs appear as `<...>` throughout the file. A targeted string replacement is both correct and fast even for large files.

**Alternatives considered**: AST-level rename; not justified given the text-level IRI abbreviation rule.

---

## 8. Tree Provider Refresh

**Decision**: After in-memory entity creation, call the existing `refreshAllViews(model, index)` helper in `extension.ts` which calls `setModel()` on all six tree providers. No new refresh logic needed.

**Rationale**: The existing pattern is used after every save; reusing it ensures consistent behavior.

---

## 9. OntologyIndex Update

**Decision**: After creating a new entity, rebuild the `OntologyIndex` from scratch using `new OntologyIndex(model)` (same approach used after every save). Assign the result to the `activeIndex` global and pass it to `refreshAllViews`.

**Rationale**: The index has no incremental update API; full rebuild is the established pattern and is fast enough for ontologies up to 50k entities.

---

## Resolved Clarifications

All specification items had clear implementations. No NEEDS CLARIFICATION items carried over. Key defaults assumed:
- Entity types: all 5 OWL entity types
- Namespace: settings → ontology IRI → prompt
- IRI editing: full replacement via text-level rename
- Formats: `.ofn` targeted insertion; other formats via full re-serialization after detection
