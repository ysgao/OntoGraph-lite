# Tasks: Entity Search — Partial Match Across All Label Fields

**Input**: Design documents from `/specs/013-entity-search-partial-match/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included per constitution Section I (Test-First, NON-NEGOTIABLE). Each test task must FAIL before its implementation task begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete task dependency)
- **[Story]**: User story from spec.md
- Exact file paths in all descriptions

---

## Phase 1: Setup

No new project infrastructure needed — single file change to existing module. Skip to Phase 3.

---

## Phase 2: Foundational (Blocking Prerequisites)

No cross-cutting prerequisites — all four user stories modify only `src/model/OntologyIndex.ts`. Skip to Phase 3.

---

## Phase 3: User Story 1 — Cross-Field Token Matching (Priority: P1) 🎯 MVP

**Goal**: Multi-word queries match entities whose labels collectively cover all tokens, even if no single label string contains every token.

**Independent Test**: Build an `OntologyIndex` with a class having `rdfs:label "body"` and `skos:prefLabel "structure"`; call `searchByLabel("body structure")`; assert the entity is returned. Call `searchByLabel("structure body")`; assert same entity returned. Call `searchByLabel("xyz body")`; assert entity NOT returned.

### Tests for User Story 1

> **Write tests FIRST. Run `npm test -- src/model/OntologyIndex.test.ts` and confirm they FAIL before T003.**

- [x] T001 [P] [US1] Write failing unit tests for cross-field multi-word matching in `src/model/OntologyIndex.test.ts`: (a) entity with `rdfs:label "body"` + `skos:prefLabel "structure"` — searching "body structure" returns it; (b) searching "structure body" returns it (word-order irrelevant); (c) entity NOT returned when searched "xyz body" (missing token); (d) entity with `rdfs:label "body structure"` (both tokens in one label) still returned — existing single-label match preserved; (e) entity with three labels across three fields returned when all three tokens present; (f) cross-field match has LOWER score than same-entity single-label match — verify by asserting the single-label entity ranks above the cross-field entity in results; (g) empty query returns `[]`; (h) whitespace-only query returns `[]`
- [x] T002 [P] [US1] Write failing unit test asserting `searchByLabel` result count is bounded by `maxResults` parameter even when many entities cross-field match — in `src/model/OntologyIndex.test.ts`

### Implementation for User Story 1

- [x] T003 [US1] In `src/model/OntologyIndex.ts`, update `searchByLabel()`: replace the current per-label `tokens.every(t => text.includes(t))` entity-inclusion check with a cross-field check `tokens.every(t => labels.some(text => text.includes(t)))`; keep the per-label scoring loop unchanged (single-label matches still score higher); add a cross-field fallback score `5 - avgLabelLength * 0.01` when no single label matches all tokens; exact entity ordering: sort descending by score then by label length ascending as tiebreak

**Checkpoint**: T001 and T002 tests pass. Searching "body structure" where entity has separate labels "body" and "structure" returns the entity. Single-label behaviour preserved. `npm test` green.

---

## Phase 4: User Story 4 — Exact Entity-Name Lookup (Priority: P1)

**Goal**: Typing an entity's exact IRI local name (e.g., SNOMED concept ID `123037004`) finds that entity as the first result. Typing a partial local name (e.g., `12303`) does NOT find it via entity-name matching.

**Independent Test**: Build an `OntologyIndex` with a class whose IRI ends in `/123037004`; call `searchByLabel("123037004")`; assert entity is first result with score ≥ 200. Call `searchByLabel("12303")`; assert entity is absent from results (unless it has a label containing "12303"). Call `searchByLabel("1230370040")`; assert entity absent.

**Depends on**: Phase 3 complete — cross-field implementation must be in place so the entity-name check integrates cleanly into the scoring pipeline.

### Tests for User Story 4

> **Write tests FIRST. Run `npm test -- src/model/OntologyIndex.test.ts` and confirm they FAIL before T005.**

- [x] T004 [P] [US4] Write failing unit tests for entity-name exact match in `src/model/OntologyIndex.test.ts`: (a) entity with IRI `http://snomed.info/id/123037004` — searching `123037004` returns it as first result; (b) searching `12303` (prefix) does NOT return it via entity-name matching; (c) searching `1230370040` (superset) does NOT return it; (d) two entities with local names `1230` and `123037004` — searching `1230` returns only the `1230` entity, NOT `123037004`; (e) searching `123037004` does NOT return the `1230` entity; (f) entity-name match ranks above all label-based matches — verify by creating a second entity with `rdfs:label "123037004"` (exact label) and asserting the entity with local name `123037004` ranks first (score 200) above the label-match entity (score 100); (g) case-insensitive: IRI ending `#BodyStructure` — searching `bodystructure` returns entity; (h) entity with no local name (IRI ends with `#`) — not matched by any exact-name query
- [x] T005 [P] [US4] Write failing unit tests verifying local name is NOT in the substring label search in `src/model/OntologyIndex.test.ts`: (a) entity with IRI `#BodyStructure` and no labels — searching `body` does NOT return it (local name removed from substring index); (b) entity with IRI `/123037004` and no labels — searching `1230` does NOT return it; (c) entity with IRI `#BodyStructure` and `rdfs:label "Anatomical site"` — searching `anatomical` returns it (label match), searching `body` does NOT (local name not in substring)

### Implementation for User Story 4

- [x] T006 [US4] In `src/model/OntologyIndex.ts`, add field `private localNameToIri = new Map<string, string>()`; clear it in `rebuild()`; in the entity loop inside `rebuild()`, replace `allValues.push(localKey)` with `this.localNameToIri.set(localName.toLowerCase(), entity.iri)` (local name no longer enters the substring index); also clear `localNameToIri` at the start of `rebuild()` alongside `searchText.clear()`
- [x] T007 [US4] In `src/model/OntologyIndex.ts`, update `searchByLabel()`: before the main `searchText` loop, compute `const exactIri = this.localNameToIri.get(queryLower)` and if found push `{ entity, score: 200 }` and record `exactNameIri`; inside the main loop add `if (iri === exactNameIri) continue` to avoid duplicating the entity

**Checkpoint**: T004 and T005 tests pass. Searching exact concept ID returns entity as first result; partial ID returns nothing from entity-name match; searching "body" no longer matches entity with IRI `#BodyStructure` (no labels). `npm test` green.

---

## Phase 5: User Story 2 — Partial/Substring Tokens Across Fields (Priority: P2)

**Goal**: Query tokens shorter than a full word (e.g., "struct" for "structure") match label fields by substring, including when tokens span multiple fields.

**Independent Test**: Build `OntologyIndex` with entity having `rdfs:label "body"` and `skos:prefLabel "structures"`; call `searchByLabel("bod struct")`; assert entity returned. Call `searchByLabel("ody ruct")`; assert entity returned (mid-word substring). Call `searchByLabel("xyz")`; assert entity absent.

**Depends on**: Phase 3 complete — the cross-field implementation already uses `text.includes(t)` which is substring; these tests verify no regression and explicit partial-token coverage.

### Tests for User Story 2

> **Write tests FIRST. Run `npm test -- src/model/OntologyIndex.test.ts` and confirm they FAIL before T009. (If they already pass from Phase 3/4 implementation, mark T008 complete immediately and skip T009.)**

- [x] T008 [P] [US2] Write unit tests for partial-token cross-field matching in `src/model/OntologyIndex.test.ts`: (a) entity with `rdfs:label "body"` + `skos:prefLabel "structures"` — searching `bod struct` returns entity; (b) searching `ody ruct` returns entity (mid-word substrings cross-field); (c) searching `structures` (full token, single label) returns entity via single-label match with higher score than cross-field; (d) searching `body structures` returns entity (one token per label, cross-field); (e) entity NOT returned when token "xyz" absent from all labels

### Implementation for User Story 2

- [x] T009 [US2] Verify T008 tests pass from Phase 3+4 implementation (no code change expected — `text.includes(t)` already does substring); if any T008 test fails, fix the edge case in `src/model/OntologyIndex.ts`

**Checkpoint**: T008 tests pass. Partial-token cross-field matching works. `npm test` green.

---

## Phase 6: User Story 3 — Revised Local-Name Behaviour (Priority: P3)

**Goal**: Entity local names (IRI fragments) are matched by exact query only — confirmed edge cases from the spec revision that removed local name from substring search.

**Independent Test**: Build `OntologyIndex` with entity IRI `#BodyStructure` and no labels; searching `BodyStructure` returns it; searching `body` does not. Build entity with IRI `#BodyStructure` and `rdfs:label "Anatomical site"`; searching `anatomical` returns it; searching `body` does not.

**Depends on**: Phase 4 complete — `localNameToIri` and removal of local name from `allValues` must be in place.

### Tests for User Story 3

> **Write tests FIRST. Confirm FAIL before T011. (Most may already pass from Phase 4 implementation.)**

- [x] T010 [P] [US3] Write unit tests for revised local-name behaviour in `src/model/OntologyIndex.test.ts`: (a) exact local name `BodyStructure` (case-insensitive) finds entity with that IRI fragment; (b) partial `Body` does NOT find entity via local-name match; (c) entity with IRI `#BodyStructure` and `rdfs:label "Anatomical site"` — searching `anatomical site` returns it (label match); searching `body` does NOT (local name not in substring); (d) entity with empty local name (IRI is `http://example.org/`) — no entity-name match for any query; (e) two entities with different namespaces but same local name `123` — at least one is returned for query `123` (last-wins or implementation-defined)

### Implementation for User Story 3

- [x] T011 [US3] Verify T010 tests pass from Phase 4 implementation (no code change expected); if any fail, fix edge cases in `src/model/OntologyIndex.ts` (empty local name guard, namespace collision)

**Checkpoint**: T010 tests pass. Revised local-name behaviour confirmed. `npm test` green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T012 [P] Benchmark test in `src/model/OntologyIndex.bench.test.ts` (Constitution §IV): check for `test-ontologies/anatomy.owl`; use `describe.skipIf(!anatomyExists)` if absent; parse anatomy.owl with `ParserRegistry.parse`; build `OntologyIndex`; call `searchByLabel("body structure", 100)` and `searchByLabel("123037004", 50)` (or valid local names from the ontology); assert each call completes in < 1000 ms and that `npm test` is never broken on machines without the file
- [x] T013 [P] Run `npm run compile` — zero TypeScript type errors; run `npm test` — all tests pass; verify new-file line coverage ≥ 80% (constitution Section I); fix any failures before marking complete
- [x] T014 Update `CLAUDE.md` Recent Changes section: add `013-entity-search-partial-match` entry — cross-field token matching across `rdfs:label`/`skos:prefLabel`/`skos:altLabel`; entity-name exact match via `localNameToIri` index; local name removed from substring search

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 3 (US1)**: No upstream dependencies — start immediately
- **Phase 4 (US4)**: Depends on Phase 3 — exact-name check integrates into the same `searchByLabel` method; implement after cross-field logic is in place
- **Phase 5 (US2)**: Depends on Phase 3 — verifies substring behaviour of cross-field implementation
- **Phase 6 (US3)**: Depends on Phase 4 — verifies local-name removal side effects
- **Phase 7 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: No dependencies — implement first
- **US4 (P1)**: Depends on US1 (`searchByLabel` restructured with cross-field loop)
- **US2 (P2)**: Depends on US1 (cross-field loop already does substring; just adds test coverage)
- **US3 (P3)**: Depends on US4 (`localNameToIri` and removal of local name from `allValues`)

### Within Each Phase

- Tests MUST be written and confirmed FAILING before implementation (constitution Section I)
- T001 and T002 are independent test cases → write both before T003
- T004 and T005 are independent test cases → write both before T006/T007
- T006 (rebuild) must complete before T007 (searchByLabel update) — `localNameToIri` must exist before the lookup
- T012 and T013 are independent → run in parallel

### Parallel Opportunities

- T001 + T002: parallel (independent test cases in same file)
- T004 + T005: parallel (independent test cases)
- T006 + T008 (after T003 done): different concerns — T006 rebuilds index, T008 writes US2 tests
- T012 + T013 + T014: parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Step 1 — Tests in parallel (both are independent test cases in same file):
Task T001: "Cross-field multi-word matching tests"
Task T002: "maxResults bounding test"

# Step 2 — Confirm ALL T001/T002 tests FAIL (run npm test first)

# Step 3 — Implementation (single task, single file):
Task T003: "Update searchByLabel() cross-field logic in OntologyIndex.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 4 Only)

1. Complete Phase 3: T001 → T002 → (confirm fail) → T003
2. Complete Phase 4: T004 → T005 → (confirm fail) → T006 → T007
3. **STOP and VALIDATE**: cross-field multi-word queries work; exact-ID lookup works; `npm test` green
4. This delivers the two highest-value use cases (cross-field discovery + SNOMED ID lookup) with zero changes to existing single-label behaviour

### Incremental Delivery

1. Phase 3 (US1) → **MVP**: cross-field label search works
2. Phase 4 (US4) → concept-ID exact lookup works; local name removed from substring
3. Phase 5 (US2) → explicit test coverage of partial tokens (implementation already handles this)
4. Phase 6 (US3) → edge-case verification of local-name removal

Each phase is independently testable and adds value without breaking prior phases.

---

## Notes

- Constitution Section I is NON-NEGOTIABLE: tests must fail before implementation
- All four stories modify only `src/model/OntologyIndex.ts` — no other source files change
- T003 (cross-field) and T006+T007 (exact-name + local-name removal) are the only code changes; T009 and T011 are expected to be no-ops if implementation is correct
- `exactMatchByLabel()` method is untouched — it uses the `labelToIris` map which is unchanged
- `SearchWebviewProvider` API is unchanged — `searchByLabel(query, 100)` call is unaffected
- Benchmark (T012) uses `describe.skipIf` — never breaks CI on machines without anatomy.owl
