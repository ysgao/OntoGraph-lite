# Implementation Plan: Show Direct Supertypes in Graph View

**Feature**: 024-show-direct-supertypes
**Branch**: `024-show-direct-supertypes`
**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Data model**: [data-model.md](data-model.md)

<!-- SPECKIT START -->
Plan: specs/024-show-direct-supertypes/plan.md
<!-- SPECKIT END -->

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| Decoupled UI Core | ✅ Pass | Webview changes are self-contained in `webview-src/`; no new imports from `src/` |
| IPC-Only Communication | ✅ Pass | New edge data travels via existing `postMessage('updateGraph')` — no direct network calls |
| Webview Path Safety | ✅ Pass | No new assets; existing `asWebviewUri` setup unchanged |
| Test-First Integration | ✅ Pass | Tests must be written before implementation (see TDD phases below) |

## Approach

Three targeted changes across three files. No new files. No new message types. No new UI controls.

1. **Extend the edge type union** — one string literal added to the discriminated union in `GraphViewMessages.ts` and its mirror in `GraphViewApp.ts`.
2. **Separate supertype traversal from the BFS** — in `openVisualization.ts`: add a pre-BFS direct-supertype pass for the focus entity; remove the upward (`superClassIris`) traversal from the main BFS hop loop so the depth slider controls only subtypes.
3. **Add cytoscape style** — in `GraphViewApp.ts`: one new style rule for `edge[type="directSupertype"]`.

## Task List

### T1 — Extend GraphEdge type union (contracts)
**File**: `src/views/GraphViewMessages.ts` line 15–16
**Change**: Append `| 'directSupertype'` to the `type` field of `GraphEdge`.

**Tests (write first)**:
- `src/views/__tests__/GraphViewMessages.test.ts` (create if absent): type-level test confirming `'directSupertype'` is assignable to `GraphEdge['type']`. Since this is a type-only change, a compile-time test (ensure no `@ts-expect-error`) is sufficient.

---

### T2 — Add pre-BFS direct-supertype pass in buildGraphData
**File**: `src/commands/openVisualization.ts`

**Change A — Add pre-pass** (insert after line 129, before the `for (let hop …)` loop):
```typescript
// Direct supertypes of focus entity — always depth-1, not part of BFS
if (focusIri) {
  const focusCls = model.classes.get(focusIri);
  if (focusCls) {
    for (const sup of focusCls.superClassIris) {
      if (!nodeIris.has(sup) && nodeIris.size < MAX_NODES) { nodeIris.add(sup); }
      // Same id format as subClassOf to prevent the post-BFS sweep adding a duplicate
      addEdge({ id: `${focusIri}|sub|${sup}`, source: focusIri, target: sup, type: 'directSupertype' });
    }
  }
}
```

**Change B — Remove superclass BFS traversal** (delete the "SubClassOf (going up to superclass)" block from the main hop loop, currently lines 138–143):
```typescript
// DELETE THIS BLOCK:
// SubClassOf (going up to superclass)
for (const sup of cls.superClassIris) {
  if (sup === OWL_THING) { continue; }
  addEdge({ id: `${iri}|sub|${sup}`, source: iri, target: sup, type: 'subClassOf' });
  if (!nodeIris.has(sup) && nodeIris.size < MAX_NODES) { nodeIris.add(sup); next.add(sup); }
}
```

**Tests (write first)** in `src/commands/__tests__/openVisualization.test.ts`:

| Test | What it checks |
|------|---------------|
| `directSupertype nodes appear when focus has superclasses` | Pre-pass adds nodes and `directSupertype` edges for focus entity's `superClassIris` |
| `directSupertype edge has correct source/target` | `source === focusIri`, `target === supIri` |
| `depth slider does not affect supertype nodes` | At depth=1 and depth=3, the same supertype nodes appear; grandparent nodes absent |
| `no supertype nodes when focus has no superClassIris` | Pre-pass is a no-op; edge count unchanged |
| `owl:Thing in superClassIris produces a node` | `owl:Thing` is not filtered; appears as a stub node |
| `supertype node shared when IRI also in subtype BFS` | No duplicate nodes when a class is both a direct parent and reached via BFS |
| `no supertype pre-pass when focusIri is undefined` | Overview mode (no focus) is unchanged |
| `subtype BFS still respects depth` | At depth=2, grandchildren appear; at depth=1, only direct children |

---

### T3 — Mirror type + add cytoscape style in GraphViewApp.ts
**File**: `webview-src/graph/GraphViewApp.ts`

**Change A** (line 20): Append `| 'directSupertype'` to the local `GraphEdge.type` union.

**Change B** (insert after the `edge[type="inferred"]` style block, around line 181):
```typescript
{
  selector: 'edge[type="directSupertype"]',
  style: {
    'line-color': '#c17ade',
    'target-arrow-color': '#c17ade',
    'target-arrow-shape': 'triangle',
    width: 2,
    'line-style': 'solid',
  },
},
```

**Tests**: Webview bundles are not unit-tested. Visual verification in T4 suffices.

---

### T4 — Build and visual verification
- Run `npm run build` (or `npm run build-all`): confirm zero TypeScript errors.
- Run `npm test`: confirm all existing tests pass plus new tests from T2.
- Manual smoke test: open `test-ontologies/animals.omn`, focus a class with a known superclass, verify purple parent arrow appears in both Hierarchical and Force layouts.
- Verify Depth slider still controls only subtypes at depth 1, 3, and 5.

## Files Changed

| File | Change type | Description |
|------|------------|-------------|
| `src/views/GraphViewMessages.ts` | Edit | Add `'directSupertype'` to edge type union |
| `src/commands/openVisualization.ts` | Edit | Add pre-BFS supertype pass; remove upward BFS traversal |
| `webview-src/graph/GraphViewApp.ts` | Edit | Mirror type; add cytoscape style |

No new files. No new VS Code settings. No dependency changes.

## Risk Notes

- **Behaviour change for depth > 1**: Previously at depth ≥ 2, ancestor nodes (grandparents) appeared. After this change, only direct parents appear. This is intentional per spec, but it is a visible change for existing users.
- **"Also collect edges" sweep**: The id-collision dedup strategy (see Decision 2, research.md) silently prevents duplicate edges. If the id format changes in the future, this implicit contract breaks. A comment is warranted in the code.
