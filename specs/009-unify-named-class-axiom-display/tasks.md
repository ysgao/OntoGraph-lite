# Tasks: Unify Named Class Axiom Display in Entity Editor

**Input**: Design documents from `/specs/009-unify-named-class-axiom-display/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

**Organization**: US1 (SubClassOf named parents) and US2 (EquivalentTo named equivalents) are symmetric and touch the same two files. Foundational tests are written first (TDD). Implementation is batched per file.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: No new project structure needed. Verify branch is correct.

- [x] T001 Confirm active branch is `009-unify-named-class-axiom-display` via `git branch --show-current`

---

## Phase 2: Foundational — Failing Tests (Red Phase)

**Purpose**: Write tests that define expected save-handler behavior for both US1 and US2. Tests MUST fail before proceeding to implementation.

**⚠️ CRITICAL**: Run `npm test -- src/views/EntityEditorPanel.test.ts` after writing — confirm new tests FAIL.

- [x] T002 Write failing unit tests for the save-handler split logic in `src/views/EntityEditorPanel.test.ts`:
  - Test: save message with `superClassExpressions: ['http://example.org/Animal']` (single bare IRI) → `cls.superClassIris = ['http://example.org/Animal']`, `cls.superClassExpressions = []`
  - Test: save message with `superClassExpressions: ['http://example.org/Animal', 'http://example.org/A and http://example.org/B']` (bare IRI + complex) → `cls.superClassIris = ['http://example.org/Animal']`, `cls.superClassExpressions = ['http://example.org/A and http://example.org/B']` (after normalizeExpression)
  - Test: save message with `superClassExpressions: []`, `superClassIris: []` → both empty on model
  - Test: same three cases for `equivalentClassExpressions` / `equivalentClassIris`
  - All tests use the existing `buildModel()` helper pattern in that file

**Checkpoint**: `npm test -- src/views/EntityEditorPanel.test.ts` — new tests fail, existing tests pass.

---

## Phase 3: User Story 1 — Named Class Parents in SubClassOf (expressions) (P1) 🎯 MVP

**Goal**: Named-class SubClassOf(A B) entries appear in the "SubClassOf (expressions)" section instead of a separate "SubClassOf" chip section. The chip section is removed.

**Independent Test**: Open any class with named-class parents in the Entity Editor. No separate "SubClassOf" section appears. Parents are visible as the first entries in "SubClassOf (expressions)".

### Implementation

- [x] T003 [US1] Implement single-bare-IRI split in `src/views/EntityEditorPanel.ts` save handler for `superClassIris`:
  - After `const validSuper = filterSection(msg.superClassExpressions, 'superClassExpressions')`
  - Normalize all validSuper entries: `const normalizedSuper = validSuper.map(e => normalizeExpression(e, model, index))`
  - Define predicate: `const SINGLE_IRI_RE = /^https?:\/\/\S+$/`
  - Split: `cls.superClassIris = normalizedSuper.filter(e => SINGLE_IRI_RE.test(e))`
  - Split: `cls.superClassExpressions = normalizedSuper.filter(e => !SINGLE_IRI_RE.test(e))`
  - Remove old line: `cls.superClassIris = msg.superClassIris ?? []`
  - Keep `msg.superClassIris` check in the loadEntity path (line ~505) — that is unchanged

- [x] T004 [US1] Update `webview-src/entity-editor/EntityEditorApp.ts` `renderEntity` for the class case:
  - Remove line: `iriListState['superClassIris'] = msg.superClassIris ?? []`
  - Remove line: `renderIriListSection(content, 'SubClassOf', 'superClassIris', true)`
  - Before the `renderExpressionSection` call for `'superClassExpressions'`, compute:
    ```typescript
    const namedSuperLabels = (msg.superClassIris ?? []).map(iri => localIriLabels[iri] ?? localNameFromIri(iri));
    const namedSuperRefs: ExpressionEntityRef[][] = (msg.superClassIris ?? []).map((iri, idx) => {
      const lbl = namedSuperLabels[idx];
      return [{ from: 0, to: lbl.length, iri, entityType: 'class' as EntityType, label: lbl }];
    });
    ```
  - Update `renderExpressionSection` call: prepend `namedSuperLabels` to the expressions array and `namedSuperRefs` to the refs array:
    ```typescript
    renderExpressionSection(
      content,
      'SubClassOf (expressions)',
      'superClassExpressions',
      [...namedSuperLabels, ...(msg.superClassExpressions ?? []), ...draftsFor('superClassExpressions')],
      [...namedSuperRefs, ...(msg.expressionEntityRefs?.['superClassExpressions'] ?? [])],
      true,
    );
    ```

- [x] T005 [US1] Update `getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts` for the class case:
  - Remove line: `superClassIris: iriListState['superClassIris'] ?? [],`
  - Replace with: `superClassIris: [],`
  - (All named-class labels are now in `superClassExpressions` via `collectEditorLines('superClassExpressions')`)

**Checkpoint**: `npm test -- src/views/EntityEditorPanel.test.ts` — T002 tests for `superClassIris` now pass.

---

## Phase 4: User Story 2 — Named Class Equivalents in EquivalentTo (expressions) (P1)

**Goal**: Named-class EquivalentClasses(A B) entries appear in "EquivalentTo (expressions)" instead of a separate "EquivalentTo" chip section. The chip section is removed.

**Independent Test**: Open any class with named-class equivalents in the Entity Editor. No separate "EquivalentTo" section appears. Equivalents are visible as the first entries in "EquivalentTo (expressions)".

### Implementation

- [x] T006 [US2] Implement single-bare-IRI split in `src/views/EntityEditorPanel.ts` save handler for `equivalentClassIris` (symmetric with T003):
  - After `const validEquiv = filterSection(msg.equivalentClassExpressions, 'equivalentClassExpressions')`
  - `const normalizedEquiv = validEquiv.map(e => normalizeExpression(e, model, index))`
  - `cls.equivalentClassIris = normalizedEquiv.filter(e => SINGLE_IRI_RE.test(e))`
  - `cls.equivalentClassExpressions = normalizedEquiv.filter(e => !SINGLE_IRI_RE.test(e))`
  - Remove old line: `cls.equivalentClassIris = msg.equivalentClassIris ?? []`
  - Note: `SINGLE_IRI_RE` is already defined from T003 — reuse it (define once above both split blocks)

- [x] T007 [US2] Update `webview-src/entity-editor/EntityEditorApp.ts` `renderEntity` for the class case (symmetric with T004):
  - Remove line: `iriListState['equivalentClassIris'] = msg.equivalentClassIris ?? []`
  - Remove line: `renderIriListSection(content, 'EquivalentTo', 'equivalentClassIris', true)`
  - Before the `renderExpressionSection` call for `'equivalentClassExpressions'`, compute:
    ```typescript
    const namedEquivLabels = (msg.equivalentClassIris ?? []).map(iri => localIriLabels[iri] ?? localNameFromIri(iri));
    const namedEquivRefs: ExpressionEntityRef[][] = (msg.equivalentClassIris ?? []).map((iri, idx) => {
      const lbl = namedEquivLabels[idx];
      return [{ from: 0, to: lbl.length, iri, entityType: 'class' as EntityType, label: lbl }];
    });
    ```
  - Update `renderExpressionSection` call:
    ```typescript
    renderExpressionSection(
      content,
      'EquivalentTo (expressions)',
      'equivalentClassExpressions',
      [...namedEquivLabels, ...(msg.equivalentClassExpressions ?? []), ...draftsFor('equivalentClassExpressions')],
      [...namedEquivRefs, ...(msg.expressionEntityRefs?.['equivalentClassExpressions'] ?? [])],
      true,
    );
    ```

- [x] T008 [US2] Update `getCurrentState()` in `webview-src/entity-editor/EntityEditorApp.ts`:
  - Remove line: `equivalentClassIris: iriListState['equivalentClassIris'] ?? [],`
  - Replace with: `equivalentClassIris: [],`

**Checkpoint**: `npm test -- src/views/EntityEditorPanel.test.ts` — ALL T002 tests now pass.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Draft-index fix and quality gates.

- [x] T009 Fix draft-expression index offset in `webview-src/entity-editor/EntityEditorApp.ts` message handler (lines ~1963-1968):
  - The current computation: `const validLen = ((msg[d.sectionKey ...]) ?? []).length`
  - For `sectionKey === 'superClassExpressions'`, drafts now come after N named-class entries + M complex entries. Add offset:
    ```typescript
    const baseLen = ((msg[d.sectionKey as keyof LoadEntityMessage] as string[] | undefined) ?? []).length;
    const namedOffset =
      d.sectionKey === 'superClassExpressions' ? (msg.superClassIris ?? []).length
      : d.sectionKey === 'equivalentClassExpressions' ? (msg.equivalentClassIris ?? []).length
      : 0;
    const validLen = namedOffset + baseLen;
    ```
  - Replace the old `validLen` line with this three-statement block

- [x] T010 [P] Run `npm run compile` — confirm zero TypeScript errors in `src/views/EntityEditorPanel.ts`

- [x] T011 [P] Run `npm run compile:webview` — confirm zero TypeScript errors in `webview-src/entity-editor/EntityEditorApp.ts`

- [x] T012 Run `npm test` — confirm all tests pass (full suite)

- [x] T013 Run `npm run build` — rebuild all bundles including `entity-editor-webview.js`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Setup): No deps — start immediately
- **Phase 2** (Failing tests): Depends on Phase 1
- **Phase 3** (US1): Depends on Phase 2 — tests must be written and failing before T003
- **Phase 4** (US2): Depends on Phase 2; can start after Phase 3 complete (same files)
- **Phase 5** (Polish): Depends on Phase 3 + Phase 4

### User Story Dependencies

- **US1 (P1)**: No dependency on US2 — independently verifiable
- **US2 (P1)**: No dependency on US1 — independently verifiable (same priority, same files)
- Both stories can be implemented in a single pass through each file since the changes are symmetric

### Within Each Story

1. Write failing tests (T002) — MUST fail before T003/T006
2. Extension save handler (T003, T006) — makes tests pass
3. Webview renderEntity (T004, T007) — display change
4. Webview getCurrentState (T005, T008) — save payload change

### Parallel Opportunities

- T010 and T011 (type-check extension vs. webview) can run in parallel
- T003 and T007 can logically be batched (same commit) since they're in the same file

---

## Parallel Example: User Story 1

```bash
# After T002 (failing tests), these can proceed:
Task T003: EntityEditorPanel.ts split logic — extension side
Task T004: EntityEditorApp.ts renderEntity — webview display
# T005 follows T004 (same file, getCurrentState depends on renderEntity state)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Confirm branch
2. Phase 2: Write failing tests (T002)
3. Phase 3: Implement US1 (T003–T005)
4. **STOP**: Test US1 — open a class with named parents, verify single unified section
5. Phase 4 + 5: Add US2 and polish

### Incremental Delivery

1. T001 → T002 (setup + red phase)
2. T003–T005 (US1 green + EntityEditorApp display)
3. T006–T008 (US2 symmetric)
4. T009–T013 (draft fix + quality gates)

Each step produces a working, incrementally better Entity Editor.

---

## Notes

- `SINGLE_IRI_RE` defined once in `EntityEditorPanel.ts` save handler, above both split blocks
- `namedSuperRefs` / `namedEquivRefs` are synthesized entirely from `msg.superClassIris` / `msg.equivalentClassIris` and `localIriLabels` — no protocol changes needed
- The webview's `lastSavedStateString` is set AFTER rendering (post `renderEntity`), so the initial "no-change" baseline always reflects the new save format — no spurious dirty state on open
- `iriListState['superClassIris']` and `iriListState['equivalentClassIris']` are no longer initialized for classes — remove those lines to keep state clean
- No changes to `EntityEditorMessages.ts`, `OntologyModel.ts`, `AxiomSync.ts`, or any parser/serializer
