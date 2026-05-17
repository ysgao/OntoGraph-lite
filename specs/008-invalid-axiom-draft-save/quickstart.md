# Quickstart: Manual Testing Guide

**Feature**: 008-invalid-axiom-draft-save

## Prerequisites

1. Build the extension: `npm run build`
2. Open VS Code with the extension in development mode (`F5` or `Run Extension` launch config).
3. Open a test ontology, e.g., `test-ontologies/animals.omn` or `animals.ofn`.

---

## Scenario 1: Save an Invalid Axiom Expression (Core Happy Path)

1. Click a class in the Classes tree view to open it in the Entity Editor.
2. In the **SubClassOf expressions** section, add a new expression with deliberately invalid syntax, e.g.: `SomeGibberish and`
3. Wait ~400 ms for the CodeMirror linter to show a red squiggle.
4. Click **Save**.

**Expected**:
- An error banner appears at the top of the Entity Editor panel: "1 invalid expression was not saved to the ontology."
- The invalid expression input is outlined with a **red border**.
- Other (valid) expressions on the same entity ARE saved to the OWL document.
- The OWL document does NOT contain the invalid expression text.

---

## Scenario 2: Correct a Draft and Save

1. Follow Scenario 1 to produce a draft invalid expression.
2. Edit the expression to make it valid, e.g., change it to `owl:Thing`.
3. Click **Save**.

**Expected**:
- The red border on that expression disappears.
- The error banner is dismissed.
- The corrected expression IS written to the OWL document.

---

## Scenario 3: Navigate Away and Return — Draft Persists

1. Follow Scenario 1 to produce a draft invalid expression on Class A.
2. Click a different class (Class B) in the tree view.
3. Click back on Class A.

**Expected**:
- Class A's entity editor shows the invalid expression with the red border already applied (draft restored from memory).

---

## Scenario 4: Classification Blocked by Draft — User Fixes

1. Follow Scenario 1 to produce a draft invalid expression.
2. Trigger **Classify Ontology** (command palette or toolbar).

**Expected**:
- A **modal blocking dialog** appears: "OntoGraph: 1 entity has unsaved invalid draft axioms that will be lost if you proceed. [entity label]"
- Dialog offers: **Fix in editor** | **Discard and proceed**
- Click **Fix in editor** → dialog closes, classification is aborted, entity editor navigates to the affected class with its red-bordered draft.

---

## Scenario 5: Classification with Draft — User Discards

1. Follow Scenario 1 to produce a draft invalid expression.
2. Trigger **Classify Ontology**.
3. In the blocking dialog, click **Discard and proceed**.

**Expected**:
- The draft expression is silently removed from the editor.
- Classification runs normally.
- After classification completes, the entity editor reloads and shows NO draft expression for that class.

---

## Scenario 6: Classification with Draft — User Cancels

1. Follow Scenario 1.
2. Trigger **Classify Ontology**.
3. Dismiss the dialog with **Cancel** (Escape key or × button).

**Expected**:
- Classification does NOT run.
- The entity editor is unchanged; the red-bordered draft expression is still present.

---

## Scenario 7: File Save/Reload Does Not Silently Discard Draft

1. Follow Scenario 1 to produce a draft invalid expression.
2. In a terminal, externally modify and save the OWL file (e.g., add a comment).
3. VS Code detects the change and triggers `handleDocument`.

**Expected**:
- The blocking dialog appears before the entity editor is refreshed.
- Same options as Scenario 4/5/6.

---

## Negative Test: Valid Expression is Always Synced

1. Open a class with multiple SubClassOf expressions.
2. Make one expression invalid and one expression valid (or add a new valid expression).
3. Click **Save**.

**Expected**:
- Only the invalid expression shows the red border.
- The valid expression IS written to the OWL document.
- The OWL document's content for this class reflects all valid expressions, unchanged for the invalid one.
