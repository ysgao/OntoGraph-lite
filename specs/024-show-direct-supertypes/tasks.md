# Tasks: Show Direct Supertypes in Graph View

**Feature branch**: `024-show-direct-supertypes`
**Input**: `specs/024-show-direct-supertypes/`

**Format**: `[ID] [P?] [Story?] Description with file path`
- **[P]**: Parallelisable (different files, no pending dependencies)
- **[US#]**: User story label (from spec.md)

---

## Phase 1: Foundational — Extend Edge Type Contract

**Purpose**: Add `'directSupertype'` to the shared message type union. This is a prerequisite for both the extension-host change (Phase 2) and the webview change (Phase 3), so both can proceed independently once this is done.

**⚠️ CRITICAL**: Phases 2 and 3 cannot start until this phase is complete.

- [ ] T001 Add `'directSupertype'` to `GraphEdge['type']` union in `src/views/GraphViewMessages.ts` (line 15–16, append `| 'directSupertype'` after `'inferred'`)

**Checkpoint**: `npm run compile` reports zero type errors. Both `src/` and `webview-src/` references to `GraphEdge.type` now accept the new literal.

---

## Phase 2: User Story 1 + 3 — Pre-BFS Supertype Pass & Depth Isolation (Priority: P1)

**Goal**: When a class entity is focused, its direct superclasses appear as graph nodes connected by a `directSupertype` edge, regardless of the Depth slider value. The Depth slider controls only the subtype (subclass) neighbourhood.

**Independent Test**: Open `test-ontologies/animals.omn`, double-click a class that has a known parent (e.g. `Animal`). Parent node must appear with a purple edge pointing to it. Set Depth to 1, 3, and 5 — parent node count stays the same; grandchildren appear as depth increases.

### Tests for Phase 2 — Write First, Confirm Failing

> **RED PHASE**: Write all 7 tests in a single editing pass in `src/commands/__tests__/openVisualization.test.ts`, then run `npm test` and verify they FAIL before writing implementation. Tests share one file so they are NOT parallelisable.

- [ ] T002 [US1] Write test `directSupertype nodes appear when focus has superclasses` in `src/commands/__tests__/openVisualization.test.ts` — assert that `buildGraphData` with a focused class whose `superClassIris` has one entry produces a node for that superclass IRI and an edge with `type: 'directSupertype'`, `source: focusIri`, `target: supIri`
- [ ] T003 [US1] Write test `directSupertype edge uses correct id to prevent post-BFS duplicate` — assert edge id is `${focusIri}|sub|${supIri}` (same convention as `subClassOf`) so the "also collect edges" sweep at lines 212–238 cannot insert a second edge for the same pair
- [ ] T004 [US1] Write test `owl:Thing in superClassIris produces a stub node` — assert that when `superClassIris` contains `http://www.w3.org/2002/07/owl#Thing`, a node with that IRI appears (not filtered out)
- [ ] T005 [US3] Write test `no supertype nodes when focus has empty superClassIris` — assert pre-pass adds nothing when `superClassIris` is empty
- [ ] T006 [US3] Write test `supertype node shared when IRI also reached by subtype BFS` — assert no duplicate nodes when a class is both a direct parent and happens to appear in the BFS subtype path
- [ ] T007 [US3] Write test `depth slider controls only subtypes` — at depth=1 assert only direct children appear in subtype direction; at depth=2 assert grandchildren appear; in both cases assert only direct (focus-level) parents appear
- [ ] T008 [US1] Write test `no supertype pre-pass when focusIri is undefined` — assert that with no focus, `buildGraphData` returns the same result as before this feature (overview mode unchanged)

### Implementation for Phase 2

- [ ] T009 [US1] Add direct-supertype pre-pass to `buildGraphData` in `src/commands/openVisualization.ts` — insert after line 129 (after `addEdge` definition, before the `for (let hop …)` loop):
  ```typescript
  // Direct supertypes of focus entity — always depth-1, not part of BFS
  if (focusIri) {
    const focusCls = model.classes.get(focusIri);
    if (focusCls) {
      for (const sup of focusCls.superClassIris) {
        if (!nodeIris.has(sup) && nodeIris.size < MAX_NODES) { nodeIris.add(sup); }
        // id matches subClassOf convention so post-BFS sweep cannot add a duplicate
        addEdge({ id: `${focusIri}|sub|${sup}`, source: focusIri, target: sup, type: 'directSupertype' });
      }
    }
  }
  ```
- [ ] T010 [US3] Remove the "SubClassOf (going up to superclass)" block from the main BFS hop loop in `src/commands/openVisualization.ts` (delete lines 138–143: the `for (const sup of cls.superClassIris)` loop inside the hop loop) — this ensures the Depth slider no longer traverses ancestors

**Checkpoint**: `npm test` — all 8 new tests pass. Existing tests still pass. `npm run compile` clean.

---

## Phase 3: User Story 1 + 2 — Webview Style (Priority: P1/P2)

**Goal**: The new `directSupertype` edge type renders in both layout modes with a visually distinct style (purple, solid, triangle arrow).

**Independent Test**: After Phase 2 is complete and the extension is rebuilt, focusing a class in the graph view shows a purple directed edge to its parent in both Hierarchical (dagre) and Force (cose) layout modes.

### Implementation for Phase 3

- [ ] T011 [P] [US1] Mirror type: append `| 'directSupertype'` to the local `GraphEdge.type` union in `webview-src/graph/GraphViewApp.ts` (line 20, after `'inferred'`)
- [ ] T012 [P] [US2] Add cytoscape style for `edge[type="directSupertype"]` in `webview-src/graph/GraphViewApp.ts` — insert after the `edge[type="inferred"]` style block (around line 181):
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

**Checkpoint**: `npm run compile:webview` clean. Both T011 and T012 can be done in parallel (same file, non-conflicting locations — or done sequentially in one edit).

---

## Phase 4: Polish & Verification

**Purpose**: Build the full bundle, run all tests, smoke test in VS Code.

- [ ] T013 Run `npm run build-all` — confirm zero errors in both extension and webview bundles
- [ ] T014 Run `npm test` — confirm all tests pass (new + pre-existing)
- [ ] T015 [P] Smoke test in VS Code: open `test-ontologies/animals.omn`, focus a class with a superclass, verify purple supertype edge appears in both Hierarchical and Force layout modes, verify Depth slider at 1/3/5 shows more subtype depth but same supertype nodes
- [ ] T016 [P] Smoke test edge case: focus a root class (no superclasses) — confirm no supertype nodes appear and graph looks correct

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Foundational): No dependencies — start immediately
- **Phase 2** (US1/US3 extension host): Depends on Phase 1 (type must exist before implementation)
- **Phase 3** (US1/US2 webview): Depends on Phase 1; can run in parallel with Phase 2 (different files)
- **Phase 4** (Polish): Depends on Phases 2 and 3 both complete

### Task Dependencies Within Phases

- Phase 2: T002–T008 (tests) can all run in parallel; T009 and T010 are sequential implementation (same file, same function)
- Phase 3: T011 and T012 touch the same file but non-conflicting sections; do in one pass or sequentially

### Parallel Opportunities

```
Phase 1 complete
    │
    ├──► Phase 2: T002–T008 (write tests in parallel)
    │         └──► T009 → T010 (implement sequentially)
    │
    └──► Phase 3: T011 + T012 (parallel with Phase 2 since different files)

Phase 2 + Phase 3 complete
    └──► Phase 4: T013 → T014 → T015 + T016 (T015/T016 parallel)
```

---

## Implementation Strategy

### MVP (All stories complete in one pass — feature is small)

This feature touches only 3 files with ~15 lines of net-new code. All three user stories are satisfied by the same set of changes. Recommended order:

1. **Phase 1** — Extend type union (5 min)
2. **Phase 2** — Write failing tests, then implement pre-pass + remove BFS upward traversal (30 min)
3. **Phase 3** — Mirror type + add style (5 min)
4. **Phase 4** — Build, test, smoke (10 min)

Total estimated time: ~50 minutes for a complete, tested implementation.

---

## Notes

- TDD is mandatory per CLAUDE.md workflow: write tests (T002–T008), confirm they fail, then implement (T009–T010)
- The `addEdge` id-collision dedup (same `${focusIri}|sub|${sup}` id format) is load-bearing — a comment should be added at the call site explaining the dedup contract
- The removal of lines 138–143 is a visible behaviour change for users at depth > 1 (grandparent nodes no longer appear); this is intentional per spec but worth noting in the commit message
