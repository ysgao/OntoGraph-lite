# Quickstart: Delete Entity with Subtype Choice

Manual verification against `test-ontologies/animals.omn` (small hierarchy, fast to reason about) via the Extension Development Host (F5).

## Setup
1. `pnpm install` / `npm install` if not already done; `npm run build` (or rely on F5's `preLaunchTask`).
2. Press F5 to launch the Extension Development Host.
3. Open `test-ontologies/animals.omn` in the Dev Host window.

## Scenario 1 — delete a leaf class (US1)
1. In the Classes tree view, find a class with no subclasses (e.g. a terminal species).
2. Right-click it → "Delete Entity".
3. Confirm the single-entity deletion.
4. **Expect**: the class disappears from the Classes and Inferred Hierarchy views; the file no longer contains its `Declaration`/`SubClassOf`/annotation lines; `ontograph validate test-ontologies/animals.omn` still reports 0 structural errors.

## Scenario 2 — delete-only, reparent subtypes (US2)
1. Pick a mid-hierarchy class with a superclass and at least two direct subclasses.
2. Right-click → "Delete Entity" → leave the default mode ("delete entity only") selected → confirm.
3. **Expect**: the class is gone; its former direct subclasses now appear as direct children of its former superclass in the Classes tree; their own children (grandchildren) are unchanged; re-running `ontograph entity-info` on a reparented subclass shows the new superclass.

## Scenario 3 — cascade delete (US3)
1. Pick a class with a two-level chain of subclasses beneath it.
2. Right-click → "Delete Entity" → switch to "delete entity and all subtypes" → confirm (dialog should show the correct total count of entities about to be removed).
3. **Expect**: the class and every descendant are gone from every tree view and from the file.

## Scenario 4 — protected entity
1. Attempt to invoke delete on the ontology root class (`owl:Thing`, shown as the tree root).
2. **Expect**: no delete action is offered/it is disabled — nothing is deletable at the root.

## Scenario 5 — property hierarchy parity
1. Repeat Scenario 2 against the Object Properties (or Data/Annotation Properties) tree view using a property with sub-properties.
2. **Expect**: identical reparenting behavior, scoped to `superPropertyIris` instead of `superClassIris`.

## Automated coverage
Equivalent assertions belong in Vitest unit/integration tests under `src/commands/deleteEntity.test.ts` (or similar), covering: leaf deletion, direct-subtype reparenting (including multiple inheritance), cascade deletion, protected-entity rejection, and the concurrent-external-edit abort path — run via `npm test -- src/commands/deleteEntity.test.ts`.
