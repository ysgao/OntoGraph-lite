# Quickstart: DL Query Webview

**Feature**: 005-dl-query-webview  
**Date**: 2026-05-15

## Summary

This guide covers how to build, run, and manually verify the DL Query webview feature end-to-end.

---

## Build

```bash
# Build everything (TypeScript extension + all webview bundles + Java JAR)
npm run build
cd java-server && mvn clean package && cd ..
```

The new DL Query bundle is at `dist/dl-query-webview.js` after `npm run build`.

---

## Run Tests

```bash
# All tests (Vitest)
npm test

# Watch mode during development
npm run test:watch

# Type-check extension and webviews
npm run compile
npm run compile:webview
```

---

## Manual Verification Steps

1. Open VS Code with this extension installed (`F5` in the repo to launch Extension Development Host).
2. Open any `.ofn`, `.omn`, `.ttl`, or `.owl` file from `test-ontologies/`.
3. Run command **`OntoGraph: Open DL Query`** (Command Palette `Ctrl+Shift+P` / `Cmd+Shift+P`).
4. The DL Query panel opens. Verify:
   - Textarea labelled "Query (class expression)" is visible and editable.
   - "Direct superclasses", "Direct subclasses", and "Subclasses" checkboxes are checked by default.
   - "Display owl:Thing" and "Display owl:Nothing" checkboxes are checked by default.
   - No "Add to ontology" button is present.

5. Enter a class expression (e.g., `Animal` for `animals.omn`) and click **Execute**.
   - Results appear grouped by query type under "Query results".
   - Each group is labelled (e.g., "Direct subclasses").

6. Type a substring in the "Name contains" field.
   - Results filter in real time without re-querying.

7. Click an entity in the results list.
   - The left sidebar Classes tree (or Individuals tree for instances) scrolls to and highlights that entity.

8. Enter a malformed expression (e.g., `Animal and and`).
   - An error message appears in the results area.

9. Close the ontology file.
   - The Execute button becomes disabled.

10. **Concurrent Execute guard** — Click Execute twice in rapid succession before the first result appears.
    - Only one query fires (visible from the Java process log or by watching the loading spinner not duplicating).
    - The second click is silently ignored while the first is in flight.

11. **rdfs:label resolution (anatomy.owl)** — Open `test-ontologies/anatomy.owl` (requires the file to be present; skip if absent).
    - Enter `'Body structure' and some 'Entire liver'` in the Query (class expression) field.
    - Click Execute.
    - Results appear without a "class name not found" error, confirming that quoted rdfs:label names resolve correctly via `AnnotationValueShortFormProvider`.

---

## Key File Locations

| File | Purpose |
|------|---------|
| `src/views/DLQueryPanel.ts` | Panel lifecycle and message routing |
| `src/views/DLQueryMessages.ts` | Typed message contracts |
| `src/commands/openDLQuery.ts` | VS Code command handler |
| `webview-src/dl-query/DLQueryApp.ts` | Webview UI entry point |
| `src/reasoner/ReasonerBridge.ts` | `dlQuery()` method added here |
| `java-server/.../OntologyService.java` | `dlQuery()` method added here |
| `java-server/.../ReasonerServer.java` | `dlQuery` JSON-RPC case added here |
| `esbuild.mjs` | New `dl-query-webview.js` bundle entry |
| `package.json` | Command registration under `contributes.commands` |
