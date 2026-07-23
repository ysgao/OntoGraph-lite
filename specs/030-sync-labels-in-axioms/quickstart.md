# Quickstart: Verifying Label Rename Axiom Sync

Manual verification steps mirroring the spec's acceptance scenarios. Uses `test-ontologies/animals.omn` or `.ofn` (or any small ontology with at least two related classes, e.g. `Animal` and a `Wing`-referencing subclass).

## Setup

1. `pnpm --filter ontograph-cli build` (if verifying via CLI as well) — not required for the UI-only steps below.
2. Press F5 to launch the Extension Development Host (full stop/relaunch if a session is already running — see `feedback_extension_host_reload` memory).
3. Open `test-ontologies/animals.omn` (or `.ofn` equivalent) in the Dev Host window.

## Scenario 1 — rename propagates to a referencing entity (US1)

1. In the Classes tree, open entity **B** that has an axiom referencing entity **A** by label (e.g. `SubClassOf: Animal and hasPart some Wing`). Confirm the axiom text is visible.
2. Navigate to entity **A**, rename its label (e.g. `Animal` → `Creature`), save.
3. Navigate back to entity **B**. Confirm the axiom now reads `...Creature and hasPart some Wing...`.
4. Make an unrelated edit to B (e.g. add an annotation) and save.
5. Reload the ontology file (or restart the Dev Host) and reopen B. Confirm the axiom still correctly references A's IRI (round-trips through the reasoner/CLI `entity-info` as pointing to A, not lost or blank).

## Scenario 2 — no manual refresh required (US2)

1. Navigate through several entities to build up navigation/undo history (view B, view another entity C, view B again).
2. Rename A's label (referenced by B), save.
3. Without closing the file or manually refreshing, navigate back to B via the editor's back/undo navigation. Confirm B's axiom text already shows A's new label.

## Scenario 3 — duplicate label rejected (US3)

1. Note the label of an existing entity **C** (e.g. `Wing`).
2. Open a different entity **A** and attempt to rename its label to `Wing`.
3. Confirm the rename is rejected: A's label is unchanged, and an error is shown identifying that `Wing` is already used by C.
4. Confirm any other unrelated edit made in the same save attempt (e.g. an annotation change) was still applied.

## Automated coverage (for implementation phase)

- Unit test for the label-uniqueness check against `OntologyIndex.exactMatchByLabel` (accept/reject cases, including case-insensitivity and self-exclusion).
- Unit test for the `entityHistoryMap` selective-invalidation scan: rename entity A referenced by B and D but not C → confirm B and D's history entries are removed, C's is untouched.
- Regression test: repeated renames (A → B → C label chain) leave every dependent entity's next-loaded display showing "C", never an intermediate value.
- Regression test: undoing a rename (reverting the label) propagates the same way a forward rename does.
