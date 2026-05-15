# Developer Quickstart: Abbreviate RDFS Annotation Property IRIs

**Branch**: `002-abbreviate-rdfs-iris` | **Date**: 2026-05-15

This guide verifies that the feature works end-to-end in a live VS Code session.

## Prerequisites

- VS Code with the OntoGraph extension built and active (`npm run build` first)
- The extension is pointing at the repo's `test-ontologies/` directory
- Git working tree is clean (`git status` shows no changes)

---

## Scenario 1 — No-op save on OWL Functional Syntax (`.ofn`)

1. Open `test-ontologies/bfo-core.ofn` in VS Code.
2. Navigate to any class that has an `rdfs:comment` annotation visible in the entity editor (if none, use a class with `rdfs:label` as a regression guard).
3. Click into the entity editor panel without making any changes.
4. Save (`Cmd+S` or `Ctrl+S`).
5. Run `git diff` in the terminal.

**Expected**: `git diff` output is empty. No file changes.

---

## Scenario 2 — Add `rdfs:comment` annotation in `.ofn`

1. Open `test-ontologies/animals.ofn` (or `bfo-core.ofn`) and pick any class.
2. In the entity editor, add a new annotation with property `rdfs:comment` and value `"A test comment"`.
3. Save.
4. Run `git diff`.

**Expected**:
- Exactly one new line added: `  AnnotationAssertion(rdfs:comment <http://...#ClassName> "A test comment")`
- The token `rdfs:comment` (abbreviated) appears — **not** `<http://www.w3.org/2000/01/rdf-schema#comment>`.
- No other lines are deleted or modified.

---

## Scenario 3 — No-op save on Manchester Syntax (`.omn`)

1. Open `test-ontologies/animals.omn`.
2. Navigate to `Cat` (or any class with annotations).
3. Open the entity editor — do not make changes.
4. Save.
5. Run `git diff`.

**Expected**: empty diff.

---

## Scenario 4 — Add `rdfs:comment` annotation in `.omn`

1. Open `test-ontologies/animals.omn` and select `Cat`.
2. In the entity editor, add an `rdfs:comment "Test comment"` annotation.
3. Save.
4. Run `git diff`.

**Expected**:
- One new item line added inside the `Annotations:` block.
- The line reads `        rdfs:comment "Test comment"` (abbreviated token).
- Existing annotation lines (e.g., `rdfs:label "Cat"@en`) are not reordered or modified.

---

## Scenario 5 — No-op save on Turtle (`.ttl`)

1. Open `test-ontologies/animals.ttl`.
2. Select any class in the entity editor — do not change anything.
3. Save.
4. Run `git diff`.

**Expected**: empty diff.

---

## Scenario 6 — Add `rdfs:comment` annotation in `.ttl`

1. Open `test-ontologies/animals.ttl` and select a class.
2. Add `rdfs:comment "Test comment"`.
3. Save.
4. Run `git diff`.

**Expected**:
- One new predicate segment added inside the entity's Turtle block.
- The segment reads `rdfs:comment "Test comment"` (abbreviated token).
- Existing segments are untouched.

---

## Scenario 7 — `rdfs:seeAlso` and `rdfs:isDefinedBy` (spot check)

Repeat Scenario 2 using `rdfs:seeAlso` and Scenario 4 using `rdfs:isDefinedBy`.

**Expected**: abbreviated tokens `rdfs:seeAlso` and `rdfs:isDefinedBy` appear in the diff, not full bracketed IRIs.

---

## Regression Guard — `rdfs:label` still works

1. In any format, add an `rdfs:label` annotation.
2. Save and inspect `git diff`.

**Expected**: `rdfs:label` token appears (not the full IRI). No regression.

---

## Cleanup

After verification, revert all test changes:

```bash
git checkout -- test-ontologies/
```
