# Quickstart: Fix Spurious OWL File Changes on Sync

**Branch**: `001-fix-sync-data-loss` | **Date**: 2026-05-15

## What Was Fixed

Two sync functions rewrote annotation blocks in model iteration order instead of preserving file order:

- `AnnotationSync.syncManchester` — live path for `.omn` files
- `AxiomSync.syncAxiomsTurtle` — live path for `.ttl` files

The fix applies the same key-based diff already used by `syncFunctional` (`.ofn`): compute `toAdd`/`toRemove` as set differences, skip write if both are empty, and preserve existing annotation order in the file.

## Run the Tests

```bash
# All sync tests
npm test -- src/sync/__tests__/AnnotationSync.test.ts
npm test -- src/sync/__tests__/AxiomSync.test.ts

# Anatomy.owl benchmark (scale gate)
npm test -- src/sync/__tests__/sync-anatomy-bench.test.ts

# Full suite
npm test
npm run compile
```

## Verify the Fix Manually

**Setup**: Open the project in VS Code with the OntoGraph extension active.

### Scenario 1 — No spurious diff on open/inspect (`.omn`)

1. Open `test-ontologies/animals.omn`.
2. Click a class that has at least two annotations.
3. Make no changes in the editor, click Save.
4. Run `git diff test-ontologies/animals.omn` — output must be empty.

### Scenario 2 — Adding one annotation produces minimal diff (`.omn`)

1. Open a class in `animals.omn`.
2. Add one new annotation (e.g., a `skos:definition`).
3. Save.
4. Run `git diff test-ontologies/animals.omn`.
5. Expected: exactly one `+` line for the new annotation, zero `-` lines.

### Scenario 3 — Same scenarios for Turtle (`.ttl`)

Repeat Scenarios 1 and 2 with `test-ontologies/animals.ttl`.

### Scenario 4 — Functional syntax unaffected (`.ofn`)

Open `test-ontologies/animals.ofn` (or `bfo-core.ofn`). Repeat Scenario 1. Must still be empty diff (functional was already correct; regression guard only).
