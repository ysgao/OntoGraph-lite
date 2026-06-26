# Tasks: Create New Ontology Entity

**Feature**: `019-create-entity` | **Branch**: `019-create-entity`

**Input**: [plan.md](plan.md) · [spec.md](spec.md) · [data-model.md](data-model.md) · [contracts/](contracts/)

**Note on TDD**: Tasks P1-2, P1-3, and P3-1 in the plan require tests to be written and confirmed **failing** before their implementation tasks run. This is captured in the Foundational and US3 phases below.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelisable — touches different files with no dependency on incomplete tasks
- **[Story]**: Maps to user story from spec.md (US1, US2, US3)
- Exact file paths required in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One-shot changes to `package.json` that unblock all subsequent phases.

- [x] T001 Update `package.json`: add `ontograph.entity.defaultNamespace` setting under `contributes.configuration.properties`; declare commands `ontograph.addClass`, `ontograph.addObjectProperty`, `ontograph.addDataProperty`, `ontograph.addAnnotationProperty`, `ontograph.addIndividual` under `contributes.commands`; add `$(add)` `view/title` menu entries for views `ontograph.classHierarchy`, `ontograph.inferredHierarchy`, `ontograph.objectProperties`, `ontograph.dataProperties`, `ontograph.annotationProperties`, `ontograph.individuals` per `contracts/settings-schema.md` and plan P1-5 table

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Utility and sync modules that US1, US2, and US3 all depend on. Phases 3–5 cannot start until this phase is complete. Tests are written first (TDD) and must fail before implementation.

- [x] T002 [P] Write failing unit tests for `resolveNamespace`, `validateLocalName`, `constructIri`, and `isValidAbsoluteIri` in `src/utils/namespaceUtils.test.ts` — confirm all fail before T004
- [x] T003 [P] Write failing unit tests for `insertNewEntity` in `src/sync/EntityCreationSync.test.ts` — cover: `OWLClass` with non-empty `superClassIris` → `SubClassOf` rendered; `OWLObjectProperty` with `superPropertyIris` → `SubObjectPropertyOf`; `OWLDataProperty` → `SubDataPropertyOf`; `OWLAnnotationProperty` → `SubAnnotationPropertyOf`; `OWLIndividual` → no parent axiom; all five types with empty parent fields (no axiom); empty `Ontology(...)` body; non-.ofn document returns unchanged text and fires warning; confirm all fail before T005
- [x] T004 [P] Implement `src/utils/namespaceUtils.ts` — export `resolveNamespace(model, config)`, `validateLocalName(name)`, `constructIri(namespace, localName)`, `isValidAbsoluteIri(iri)` per plan P1-2; all T002 tests must pass
- [x] T005 [P] Implement `src/sync/EntityCreationSync.ts` — export `insertNewEntity(documentText, entity, model)` handling all five entity types; render parent axiom from `entity.superClassIris[0]` (class) or `entity.superPropertyIris[0]` (properties); no parent axiom for `OWLIndividual`; for non-`.ofn` documents call `vscode.window.showWarningMessage('Entity creation is only supported for OWL Functional Syntax in this release.')` and return `documentText` unchanged (other formats are TODO); all T003 tests must pass

> **Checkpoint**: Run `npm test` — T002 and T003 suites green (T004 and T005 pass their tests). Both utilities importable with no type errors (`npm run compile`).

---

## Phase 3: User Story 1 — Create Entity via Panel Toolbar

**Story goal**: Clicking the "Add Entity" button in any entity panel creates the corresponding entity type. If an entity is focused in that panel, it becomes the parent via the appropriate sub-entity axiom. Entity Editor opens automatically.

**Independent test**: Open `test-ontologies/bfo-core.ofn`. In the Classes panel select any class, click the `$(add)` toolbar button, enter a local name. Confirm: (a) the new class IRI appears in the Classes panel, (b) a `SubClassOf` axiom exists in the file with the correct IRI pair, (c) the Entity Editor opens pre-populated. Repeat by selecting an object property in the Object Properties panel and confirming a `SubObjectPropertyOf` axiom.

- [x] T006 [US1] Implement `createEntity(entityType, parentIri, context)` helper in `src/commands/addEntity.ts` — full flow: guard model loaded → resolve namespace (via `namespaceUtils.resolveNamespace`; prompt if undefined) → show local name `showInputBox` with `validateLocalName` and duplicate-IRI guard against `activeIndex` → `constructIri` → build minimal entity object (`OWLClass` with `superClassIris`, `OWLObjectProperty`/`OWLDataProperty`/`OWLAnnotationProperty` with `superPropertyIris`, `OWLIndividual` with no parent) → call `EntityCreationSync.insertNewEntity` → `vscode.workspace.applyEdit` → add entity to appropriate `activeModel` Map → rebuild `activeIndex` → call `refreshAllViews` → call `showEntityInfo`
- [x] T007 [US1] Register the five entity-creation commands in `src/extension.ts` — each command stores the `vscode.TreeView<T>` reference returned by `vscode.window.createTreeView`; on invocation reads `treeView.selection[0]?.iri` (the `iri: string` field present on all five tree-item types: `ClassTreeItem`, `PropertyTreeItem`, `DataPropertyItem`, `AnnotationPropertyItem`, `IndividualTreeItem`); passes the resolved IRI as `parentIri` to `createEntity(entityType, parentIri, context)`; note that `ontograph.addClass` is wired to both `ontograph.classHierarchy` and `ontograph.inferredHierarchy` — both panels share the same focused class, so whichever TreeView is active yields the same IRI

> **Checkpoint**: Manual smoke-test per independent test criteria above.

---

## Phase 4: User Story 2 — Namespace Configuration

**Story goal**: Users set `ontograph.entity.defaultNamespace` in VS Code settings; all entity creations use that namespace instead of the ontology-declared IRI.

**Delivered by**: T001 (setting declared) + T006 (`resolveNamespace` reads the setting with priority over `model.metadata.iri`). No new implementation tasks.

- [x] T008 [US2] Verify namespace configuration end-to-end: open Settings, set `ontograph.entity.defaultNamespace` to `https://test.org/ont#`, create a new class via the Classes panel button with local name `Foo`, confirm the created entity has IRI `https://test.org/ont#Foo` in both the panel and the source file; clear the setting and repeat to confirm fallback to ontology namespace

> **Checkpoint**: Both namespace sources produce correct IRIs; missing namespace triggers the `showInputBox` prompt.

---

## Phase 5: User Story 3 — IRI Editing in Entity Editor

**Story goal**: The Entity Editor shows the full entity IRI in an editable text field. Committing a changed IRI renames the entity throughout the ontology's source file.

**Independent test**: Open any entity in the Entity Editor. The IRI field is an editable input. Change the IRI to a valid new value and commit (blur or Enter). The panel tree updates to show the new IRI; the source file has `<newIri>` replacing all occurrences of `<oldIri>`. Attempting an invalid or duplicate IRI shows an inline error and reverts the field.

- [x] T009 [P] [US3] Write failing unit tests for `renameIri(documentText, oldIri, newIri)` in `src/sync/IriRenameSync.test.ts` — cover replacement in Declaration, SubClassOf, EquivalentClasses, AnnotationAssertion lines; verify unrelated IRIs are untouched; verify no-op when oldIri absent; confirm all fail before T011
- [x] T010 [P] [US3] Extend `src/views/EntityEditorMessages.ts` — add `RenameIriMessage` (`command: 'renameIri'; currentIri: string; newIri: string`) to the webview→extension union; add `IriRenameResultMessage` (`command: 'iriRenameResult'; success: boolean; newIri?: string; error?: string`) to the extension→webview union per `contracts/entity-editor-messages.md`
- [x] T011 [US3] Implement `src/sync/IriRenameSync.ts` — export `renameIri(documentText, oldIri, newIri)` using `replaceAll('<' + oldIri + '>', '<' + newIri + '>')` per plan P3-1; skip with warning for OWL/XML format (IRIs appear as XML attributes, not bracket form); all T009 tests must pass
- [x] T012 [US3] Handle `renameIri` message in `src/views/EntityEditorPanel.ts` — validate `newIri` (non-empty, `isValidAbsoluteIri`, not in `activeIndex`; post error result if invalid); call `IriRenameSync.renameIri`; apply edit; update `activeModel` Map (delete old key, insert new key with updated `entity.iri`); rebuild `activeIndex`; call `refreshAllViews`; post `IriRenameResultMessage({ success: true, newIri })`; for OWL/XML post error result per plan P3-3
- [x] T013 [US3] Replace IRI `<span id="entity-iri">` with `<input id="entity-iri" type="text" class="iri-input" aria-label="Entity IRI">` in `webview-src/entity-editor/EntityEditorApp.ts` — on `loadEntity` set `input.value = msg.iri` and store `currentIri`; on `blur` and Enter keydown post `RenameIriMessage` if value changed; on `iriRenameResult` update `currentIri` + input value on success, or revert input + show inline error element on failure

> **Checkpoint**: Manual test per independent test criteria above. Run `npm run compile:webview` — no type errors.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T014 Run full type-check — `npm run compile` (extension host) and `npm run compile:webview` (webview bundles); fix all TypeScript errors across modified files
- [x] T015 [P] Smoke-test with `test-ontologies/bfo-core.ofn` — create one new class as a child of an existing class; create one new object property as a child of an existing object property; open Entity Editor for each; edit the IRI of each; verify the source file contains correct Declaration, SubClassOf / SubObjectPropertyOf, and IRI-rename text after each operation; note start and end wall-clock times for both operations and confirm entity creation completes in < 3 s (SC-001) and IRI rename completes in < 5 s (SC-004)
- [x] T016 [P] Update `CLAUDE.md` "Recent Changes" section and "Active Technologies" section to reflect feature 019-create-entity

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks all story phases
- **Phase 3 (US1)**: Depends on Phase 2 — can start once T004 and T005 pass
- **Phase 4 (US2)**: Depends on Phase 3 — verification only
- **Phase 5 (US3)**: Depends on Phase 2 — can start in parallel with Phase 3 after Phase 2 completes
- **Phase 6 (Polish)**: Depends on Phases 3–5 all complete

### User Story Dependencies

- **US1**: Depends on Foundational (T004, T005). Independently completable.
- **US2**: Depends on US1 (namespace resolution lives in `createEntity`). Verification only.
- **US3**: Depends on Foundational only (T004 for `isValidAbsoluteIri`). Can develop in parallel with US1 after Phase 2.

### Within Each Phase

- **Phase 2**: T002 and T003 are parallel (different files). T004 depends on T002; T005 depends on T003. T004 and T005 can run in parallel.
- **Phase 5**: T009 and T010 are parallel (different files). T011 depends on T009. T012 depends on T010 + T011. T013 depends on T010.

---

## Parallel Opportunities

### Phase 2 — Foundational

```
Start together [P]:
  T002  Write namespaceUtils tests       (src/utils/namespaceUtils.test.ts)
  T003  Write EntityCreationSync tests   (src/sync/EntityCreationSync.test.ts)

Then in parallel [P] (T004 needs T002 green; T005 needs T003 green):
  T004  Implement namespaceUtils         (src/utils/namespaceUtils.ts)
  T005  Implement EntityCreationSync     (src/sync/EntityCreationSync.ts)
```

### Phase 5 — US3 (once Phase 2 is complete)

```
Start together (while Phase 3/US1 may also be running):
  T009  Write IriRenameSync tests        (src/sync/IriRenameSync.test.ts)
  T010  Extend EntityEditorMessages      (src/views/EntityEditorMessages.ts)

Then:
  T011  Implement IriRenameSync          (src/sync/IriRenameSync.ts)       ← depends on T009
  T013  Edit IRI input in webview        (webview-src/entity-editor/...)   ← depends on T010

Then:
  T012  Handle renameIri in Panel        (src/views/EntityEditorPanel.ts)  ← depends on T010 + T011
```

### Phase 6 — Polish

```
  T015  [P] Smoke-test bfo-core.ofn
  T016  [P] Update CLAUDE.md
(both after T014 type-check passes)
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T005) — foundational utilities
3. Complete Phase 3 (T006–T007) — entity creation from panel
4. **Validate**: Create a class and object property in `test-ontologies/bfo-core.ofn` — panel shows new entities, file has correct axioms, Entity Editor opens
5. Ship US1 independently; US2 and US3 add on top

### Incremental Delivery

| Increment | Tasks | User value delivered |
|-----------|-------|---------------------|
| Foundation | T001–T005 | No UI; utilities testable |
| MVP | T006–T008 | Full entity creation + namespace config |
| IRI editing | T009–T013 | IRI visible + editable in Entity Editor |
| Complete | T014–T016 | Polished, type-clean, smoke-tested |

---

## Notes

- [P] tasks touch different files and have no dependency on incomplete tasks in the same phase
- TDD applies to T002→T004, T003→T005, and T009→T011: tests must fail before implementation
- `npm test` is the validation gate after each foundational or US3 sync task
- The five entity-creation commands share a single `createEntity` helper — keep all logic there, keep command registrations thin
- IRI rename skips OWL/XML format (post error to webview); this is documented in the risk notes in plan.md
