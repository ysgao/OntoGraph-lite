# Quickstart: Testing Axiom Expression Display Formatting

**Feature**: 006-axiom-display-formatting

## Manual Test Steps

### Entity Editor

1. Open VS Code with the extension running (`npm run build:watch` + F5).
2. Open `test-ontologies/animals.omn`.
3. In the Class Hierarchy tree, click a class that has a conjunctive SubClassOf or EquivalentTo expression (e.g. any class with `and` in its definition).
4. The Entity Editor panel should open and display the expression with each `and` on a new indented line.
5. **Edit test**: modify the expression (e.g. remove or add a conjunct), then click Save. Confirm the `.omn` file on disk shows the expression as a single line with no injected newlines.
6. **Typing test**: In the SubClassOf (expressions) editor, type a new expression containing `and` (e.g. `hasAge some Integer and hasName some String`). Confirm `and` triggers an automatic line break after ` and ` is completed.

### DL Query

1. Open the DL Query panel (`Ctrl+Shift+P` → "OntoGraph: Open DL Query").
2. Type `hasRole some Doctor and hasLocation some Hospital` in the query input.
3. Confirm the display breaks at `and` automatically while typing.
4. Click Execute and verify results are returned (reasoner must be running).
5. Confirm the results are consistent with the logical query.

### Round-trip file integrity

```bash
# Before any edits, record the file hash
md5 test-ontologies/animals.omn

# Open a class, view in Entity Editor, Save without changes
# Then re-check the hash — must be identical
md5 test-ontologies/animals.omn
```

### Guard test (no break inside IRIs)

In the DL Query input, type:
```
<http://example.org/standard> and <http://example.org/land>
```
Confirm that `and` inside the IRIs does NOT cause a line break, only the bare ` and ` between them does.

## Running Automated Tests

```bash
npm test -- webview-src/manchesterFormat.test.ts
npm test
```

All tests must pass before marking any task complete.
