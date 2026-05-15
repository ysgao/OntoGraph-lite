# Implementation Plan: DL Query Webview

**Branch**: `005-dl-query-webview` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/005-dl-query-webview/spec.md`

## Summary

The DL Query webview is substantially complete (T001–T025 shipped). This plan documents the **revised architecture** required by the clarification session of 2026-05-15: moving TempQueryClass lifecycle ownership from the Java layer to the TypeScript runtime `OntologyModel`, and adding sync-inhibition and concurrent-Execute guards as mandated by FR-002 and FR-016.

The Java `dlQuery()` method continues to own Manchester expression parsing (via `AnnotationValueShortFormProvider` + `BidirectionalShortFormProviderAdapter`) and the EquivalentClasses axiom construction. TypeScript owns: when TempClass is considered "in scope", when it is considered "cleaned up", sync inhibition during that window, and concurrent-Execute prevention.

No wire-format changes. No new Java behaviour. All changes are in TypeScript.

## Technical Context

**Language/Version**: TypeScript 5+ (strict), Java 21+  
**Primary Dependencies**: OWLAPI 5, HermiT, ELK, CodeMirror 6, VS Code Extension API  
**Storage**: N/A (in-memory ontology; temp class never persisted)  
**Testing**: Vitest 1.6.0  
**Target Platform**: VS Code extension host (Node.js) + browser IIFE webview  
**Project Type**: VS Code extension feature (revision)  
**Performance Goals**: DL query results within 3 s for ontologies < 50 000 classes (SC-001)  
**Constraints**: TempClass MUST NOT be written to source file; sync-to-disk MUST be inhibited during Execute; concurrent Execute clicks MUST be ignored

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-First | ✅ Pass | New tests (concurrent Execute, cleanup-on-error) written before implementation |
| II. Simplicity | ✅ Pass | A module-level `executing` flag + `Set<string>` registry is the minimum needed; no new abstraction layers |
| III. OWL Standards | ✅ Pass | TempClass lifecycle is in-memory only; serializer never called with TempClass in its output |
| IV. Scale-Aware | ✅ Pass | No new iteration over class hierarchy |
| V. Security | ✅ Pass | No new system boundary; sync-inhibit flag is local only |

## Project Structure

### Documentation (this feature)

```text
specs/005-dl-query-webview/
├── plan.md              ← this file
├── research.md          ← add Decision 8 (TypeScript-owned lifecycle)
├── data-model.md        ← update TempQueryClass section (Java→TypeScript ownership)
├── quickstart.md        ← unchanged
├── contracts/           ← no wire-format changes
└── tasks.md             ← add T027–T030 for this revision
```

### Source Code

```text
src/
├── views/DLQueryPanel.ts          ← add executing flag, try/finally cleanup, concurrent guard
└── views/DLQueryPanel.test.ts     ← add tests for cleanup-on-error, concurrent Execute

specs/005-dl-query-webview/
├── research.md                    ← add Decision 8
└── data-model.md                  ← update TempQueryClass section
```

No changes needed to:
- `java-server/` — OntologyService.dlQuery() already correct
- `webview-src/dl-query/` — DLQueryApp.ts behaviour unchanged
- `src/reasoner/ReasonerBridge.ts` — wire format unchanged
- `src/views/DLQueryMessages.ts` — message types unchanged

## Implementation Phases

### Phase A: TypeScript TempClass lifecycle in DLQueryPanel.ts

**Goal**: TypeScript `DLQueryPanel.ts` owns the TempClass window — tracking when a query is in flight, preventing concurrent queries, and guaranteeing cleanup on error.

**Architecture decision (Decision 8):** TypeScript maintains a module-level `executing` boolean flag and a `Set<string>` of temporary class IRIs. Before each `bridge.dlQuery()` call the IRI `'urn:ontograph:dlquery#TempQuery'` is added to the set and `executing` is set to `true`. A `try/finally` block guarantees removal from the set and reset of `executing` even when `bridge.dlQuery()` throws. The set can be checked by sync functions to guard against accidental disk writes (see Phase B).

The Java `dlQuery()` method continues to receive `content + classExpression` (unchanged wire format). TypeScript does **not** construct the EquivalentClasses OWL axiom itself — the Manchester expression parsing with rdfs:label resolution (via `AnnotationValueShortFormProvider`) is too complex to duplicate in TypeScript without significant additional infrastructure. This split is intentional: TypeScript owns the lifecycle window; Java owns the expression semantics.

**New logic in `handleMessage()` for `'execute'` in `DLQueryPanel.ts`:**

```typescript
const TEMP_CLASS_IRI = 'urn:ontograph:dlquery#TempQuery';
let executing = false;
const temporaryClassIris = new Set<string>();

// In handleMessage():
case 'execute': {
  if (executing) return;          // concurrent guard
  executing = true;
  temporaryClassIris.add(TEMP_CLASS_IRI);
  panel.webview.postMessage({ type: 'dlQueryLoading' });
  try {
    const result = await bridge.dlQuery(
      activeModel.format, activeModel.content, activeModel.filePath,
      msg.classExpression, msg.queryTypes, activeModel.engine,
    );
    panel.webview.postMessage({ type: 'dlQueryResult', ...convertResult(result, activeModel) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.postMessage({ type: 'dlQueryError', message });
  } finally {
    temporaryClassIris.delete(TEMP_CLASS_IRI);
    executing = false;
  }
  break;
}
```

**Sync guard exposure:** Export `temporaryClassIris` from the `openDLQueryPanel()` closure so that `AnnotationSync` and `AxiomSync` can check it. In practice, sync is manually triggered and does not fire automatically during Execute — but the guard is required by FR-016 for correctness by construction.

### Phase B: Sync inhibition guard in sync functions

Add a single check to the top of `AnnotationSync.applyAnnotationEdit()` and `AxiomSync.applyAxiomEdit()`:

```typescript
if (dlQueryTemporaryClassIris.has(entityIri)) {
  // Execute in progress for this IRI — skip disk write
  return;
}
```

The `dlQueryTemporaryClassIris` set is passed in (or imported) from `DLQueryPanel.ts`. This guard fires only if a user simultaneously triggers an entity-editor action during an in-flight DL query — an edge case, but required by FR-016.

### Phase C: Tests (Red before Green)

Write these failing tests in `src/views/DLQueryPanel.test.ts` BEFORE Phase A implementation:

- **(a)** `executing` flag prevents a second `execute` message from triggering a second `dlQuery()` call while the first is in flight.
- **(b)** `temporaryClassIris` contains `'urn:ontograph:dlquery#TempQuery'` during the `bridge.dlQuery()` call.
- **(c)** `temporaryClassIris` is empty after `dlQuery()` returns successfully.
- **(d)** `temporaryClassIris` is empty and `executing` is `false` after `dlQuery()` rejects with an error (cleanup-on-error path).

All four MUST fail before Phase A code is written.

### Phase D: Artifact updates

1. **`research.md`** — add Decision 8: TypeScript-owned TempClass lifecycle (rationale: Java expression parsing with rdfs:label resolution cannot be duplicated in TypeScript without OWLAPI; TypeScript owns the lifecycle window, Java owns expression semantics).

2. **`data-model.md`** — update the TempQueryClass section: change "Lifetime: Single `dlQuery` call; discarded with the fresh `OWLOntologyManager`" to "Lifetime: Single Execute window; tracked in TypeScript `DLQueryPanel.ts` via `temporaryClassIris` set, removed in finally block; the Java layer's fresh `OWLOntologyManager` continues to own the EquivalentClasses axiom construction and classification".

3. **`tasks.md`** — mark T001–T025 `[X]`; add T027–T030 for Phase A–D tasks.

### Phase E: Verification

1. `npm test` — all 146+ tests pass, coverage ≥ 80%.
2. `npm run compile` + `npm run compile:webview` — zero type errors.
3. `npm run build` — `dist/dl-query-webview.js` produced.
4. Manual: T026 — complete quickstart steps 1–9; confirm that rapid double-clicking Execute sends only one request, that an invalid expression shows an error message and the panel recovers for the next Execute, and that `'Body structure' and 'All or part of' some 'Entire liver'` resolves correctly in `anatomy.owl`.

## Complexity Tracking

| Design Choice | Justification |
|---|---|
| TypeScript owns lifecycle window, Java owns expression parsing | Full Manchester expression parsing with rdfs:label resolution (AnnotationValueShortFormProvider) is not available in TypeScript without significant new infrastructure; delegating to Java keeps the implementation minimal (Constitution II). |
| Module-level flag + Set rather than modifying OntologyModel | OntologyModel is a pure data structure; temporary query state does not belong in it. The panel's closure is the correct scope for ephemeral execution state (Constitution II). |
| Sync guard is defensive (sync is manually triggered) | FR-016 requires correctness by construction, not just incidentally correct behaviour. The guard costs one `Set.has()` call per sync operation — negligible. |
