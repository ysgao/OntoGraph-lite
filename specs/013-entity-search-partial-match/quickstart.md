# Quickstart: Manual Verification — Entity Search

## Prerequisites

- VS Code with OntoGraph extension loaded from source (`npm run build`)
- `test-ontologies/animals.omn` available

## Test 1 — Cross-Field Match (US1)

1. Add a test class to `test-ontologies/animals.omn`:
   ```manchester
   Class: TestCrossField
     Annotations:
       rdfs:label "Flying"@en,
       skos:prefLabel "Mammal"@en
   ```
2. Open `animals.omn` in VS Code → OntoGraph loads.
3. Type `Flying Mammal` in the search bar.
4. **Expected**: `TestCrossField` appears in results.
5. Type `Mammal Flying` — same entity appears (word order irrelevant).
6. Type `flying mammal` (lowercase) — same entity appears.

## Test 2 — Substring Token (US2)

1. Using the same `TestCrossField` class.
2. Type `flyi` — entity appears (substring of "Flying").
3. Type `Mamm fly` — entity appears (cross-field + partial).
4. Type `xyz` — entity does NOT appear.

## Test 3 — Entity-Name Exact Match (US4)

1. Add a class with a numeric IRI (e.g., edit `animals.omn` to declare `<http://example.org/123037004>`).
2. Type `123037004` → entity appears at top of results.
3. Type `12303` → entity does NOT appear.
4. Type `1230370040` → entity does NOT appear.

## Test 4 — No Regression (FR-007)

1. Open `test-ontologies/pizza.owl`.
2. Search `MeatyPizza` — appears.
3. Search `pizza` — multiple results appear.
4. Search `meaty` — `MeatyPizza` (or equivalent) appears.

## Test 5 — SNOMED Scale (SC-003, optional)

1. Load a SNOMED-scale ontology via "Load Ontology File…".
2. Type any 9-digit SNOMED concept ID.
3. Results appear within 1 second.
