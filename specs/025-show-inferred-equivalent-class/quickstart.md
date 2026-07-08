# Quickstart: Verifying Inferred Equivalent Class Display

Manual verification steps once the feature is implemented (mirrors spec.md's acceptance scenarios).

## Setup

1. Build the Java reasoner server: `cd java-server && mvn clean package`.
2. Build the extension: `npm run build-all`.
3. Use (or recreate) the fixture ontology `test-ontologies/inferred-equivalent-fixture.ofn` (tasks.md T002), which contains:
   - Classes `A`/`B` related so that after reasoning they become equivalent without an explicit `EquivalentClasses(A B)` assertion:
     ```
     SubClassOf(A B)
     SubClassOf(B A)
     ```
   - A class `C` inferred equivalent to a complex expression via a GCI cycle, and separately inferred equivalent to two distinct named classes `F`/`G` (used in Scenario 2).
   - A pair `X`/`Y` with an **asserted** `EquivalentClasses(X Y)` axiom *plus* an independent `SubClassOf(X Y)` + `SubClassOf(Y X)` cycle (used in Scenario 6).
   - A class `Z` related to `owl:Thing` only via `SubClassOf(owl:Thing Z)`, so `Z` becomes inferred equivalent to `owl:Thing` (used in Scenario 7).

## Scenario 1 — Unintended equivalence is flagged (User Story 1)

1. Open the ontology in the extension (Extension Development Host).
2. Run "Classify Ontology."
3. Open class `A` in the Entity Editor.
4. **Expect**: a red "Inferred Equivalent Class" section appears between "GCI (General Concept Inclusions)" and "DisjointWith," showing `B`.
5. Open class `B`. **Expect**: the same section appears showing `A`.

## Scenario 2 — Complex expression and multiple classes (User Story 1)

1. Using the fixture's class `C` (inferred equivalent to a complex expression, e.g. `ObjectIntersectionOf(D E)`, via a GCI cycle, and separately inferred equivalent to both named classes `F` and `G`), open `C`.
2. **Expect**: the section lists all three: the complex expression (rendered with Manchester-syntax highlighting, matching the EquivalentTo section's style) and both `F` and `G`, all in red.

## Scenario 3 — No clutter when nothing is wrong (User Story 2)

1. Open any class with no unintended inferred equivalence.
2. **Expect**: no "Inferred Equivalent Class" heading appears anywhere in the Entity Editor — not even empty.
3. Reload the extension without ever running "Classify Ontology," open any class.
4. **Expect**: same — no section appears.

## Scenario 4 — Read-only, no dirty-state impact (FR-009)

1. With the Scenario 1 ontology open and classified, open class `A`.
2. Attempt to click into or edit the red "Inferred Equivalent Class" text.
3. **Expect**: the field does not accept edits (no cursor / no delete or add controls), unlike the EquivalentTo section immediately above it.
4. Confirm the "unsaved changes" indicator does not activate merely from viewing this section.

## Scenario 5 — Staleness hides the section

1. With Scenario 1 classified and the section visible, edit the ontology source file to remove the `SubClassOf(B A)` axiom (breaking the equivalence), without reclassifying.
2. **Expect**: the section either still shows the old (now stale) result or is hidden, matching whatever behavior the existing Inferred Hierarchy sidebar view exhibits under the same staleness condition — the two must be consistent with each other.
3. Reclassify.
4. **Expect**: the section disappears (equivalence no longer holds).

## Scenario 6 — Asserted equivalence is not duplicated as an error (FR-003, edge case)

1. Using the fixture's classes `X`/`Y` (an asserted `EquivalentClasses(X Y)` axiom, plus an independent `SubClassOf(X Y)` + `SubClassOf(Y X)` cycle that would separately entail the same equivalence), classify and open `X`.
2. **Expect**: `Y` appears in the existing "EquivalentTo Axioms" section (the asserted axiom), and does **not** also appear in the "Inferred Equivalent Class" section — the exclusion filter must recognize that this equivalence is already intentional, even though the reasoner would derive it a second, independent way.
3. Open `Y`. **Expect**: same result, symmetric.

## Scenario 7 — Equivalence to owl:Thing is flagged like any other case (edge case)

1. Using the fixture's class `Z` (related to `owl:Thing` only via `SubClassOf(owl:Thing Z)`), classify and open `Z`.
2. **Expect**: the "Inferred Equivalent Class" section appears showing `owl:Thing` (or its displayed label/IRI) in red, treated the same as any other inferred equivalence — no special-casing or suppression.

## Automated coverage

Automated tests should cover the data-flow layers (not full end-to-end UI), per `conductor/workflow.md`'s TDD requirement:
- `src/reasoner/ReasonerBridge.test.ts`: parses a mock classify response including `equivalentClasses` into the extended `ClassificationResult`.
- `src/commands/classifyOntology.test.ts` (new or existing): groups `equivalentClasses` entries into `model.inferredEquivalentClasses` correctly, including the multi-entry-per-class case.
- `src/views/EntityEditorPanel.test.ts`: given a model with `inferredEquivalentClasses` populated, asserts `LoadEntityMessage.inferredEquivalentClassIris`/`inferredEquivalentClassExpressions` are populated correctly, and asserts they are omitted when classification is absent/stale or the class has no entries.
