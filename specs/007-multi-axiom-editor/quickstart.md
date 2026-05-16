# Quickstart: Testing Multi-Axiom Expression Editor

**Feature**: 007-multi-axiom-editor

---

## Prerequisites

- VS Code extension running in development mode (`npm run build:watch` + F5).
- An ontology open that contains classes with multiple SubClassOf axioms (e.g. `test-ontologies/animals.omn` after adding a second SubClassOf to one class, or any biomedical ontology).

---

## Manual Test Steps

### US1 — Visual Separation of Multiple Axioms

1. Open the Entity Editor for a class that has two or more SubClassOf expressions.
2. Confirm: each expression is displayed in its own editor block, visually separated from the next. A border, gap, or rule between entries makes the boundary clear.
3. If each expression contains `and`, confirm the multi-line formatting (feature 006) still applies within each entry.
4. Confirm: a class with only one SubClassOf expression shows no separator (nothing to separate).

### US2 — Add a New Axiom Expression

1. Open the Entity Editor for any class.
2. In the SubClassOf section, click the "Add SubClassOf expression" button.
3. Confirm: a new empty editor appears below the existing expression(s), with focus placed in the new editor.
4. Type `hasAge min 18` in the new editor.
5. Click Save.
6. Confirm: the OWL document now contains a new `SubClassOf` axiom `hasAge min 18` for that class.
7. Close and re-open the entity. Confirm: both the original and the new SubClassOf axiom are shown.

### US3 — Remove an Axiom Expression

1. Open the Entity Editor for a class with two SubClassOf expressions.
2. Click the delete button (×) on one of the expression entries.
3. Confirm: that entry's editor is removed from the section. The remaining expression stays unchanged.
4. Click Save.
5. Confirm: the OWL document contains exactly one SubClassOf axiom for that class.

### Round-trip Integrity

```bash
# Record hash before editing
md5 test-ontologies/animals.omn

# Open a class, add a SubClassOf expression, save, remove it, save again
# Hash must match the original
md5 test-ontologies/animals.omn
```

### Edge Cases

- **Add then leave blank**: Click "Add expression", type nothing, click Save. Confirm: no new axiom appears in the document and no error is shown.
- **Remove all expressions**: Remove all SubClassOf expressions from a class. Click Save. Confirm: the OWL document has no SubClassOf axiom for that class, and the section shows only the "Add expression" button.
- **Paste multi-expression block**: In a new expression editor, paste:
  ```
  hasRole some Doctor and hasLocation some Lung
  hasAge min 18
  ```
  Confirm: the two lines are joined (since the second line is not a continuation line and not a blank-line separator), or handled predictably. Verify no crash.

---

## Running Automated Tests

```bash
npm test -- src/views/EntityEditorPanel.test.ts
npm test
npm run compile
npm run compile:webview
npm run build
```

All tests must pass before marking any task complete.
