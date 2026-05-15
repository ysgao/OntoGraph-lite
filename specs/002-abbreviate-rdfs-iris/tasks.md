# Tasks: Abbreviate RDFS Annotation Property IRIs

**Input**: Design documents from `specs/002-abbreviate-rdfs-iris/`
**Branch**: `002-abbreviate-rdfs-iris`

**TDD Requirement**: The OntoGraph Constitution mandates Test-First (Principle I). Every implementation task must be preceded by a failing test task. Confirm tests fail before implementing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no inter-task dependencies)
- **[US1]**: Abbreviated RDFS tokens in sync output — write path (P1)
- **[US2]**: Round-trip fidelity for files with abbreviated RDFS tokens — read path + idempotency (P2)

---

## Phase 1: Foundational

**Purpose**: Confirm baseline before feature work begins.

- [x] T001 157d0ae Run `npm test` and confirm all existing tests pass; record baseline count in `specs/002-abbreviate-rdfs-iris/plan.md`

**Checkpoint**: Baseline passes — feature work may begin.

---

## Phase 2: User Story 1 — Abbreviated RDFS Tokens in Sync Output (P1)

**Goal**: When writing `rdfs:comment`, `rdfs:seeAlso`, or `rdfs:isDefinedBy` annotations, all three OWL file formats produce the abbreviated token (e.g., `rdfs:comment "..."`) rather than the full bracketed IRI (`<http://www.w3.org/2000/01/rdf-schema#comment> "..."`).

**Independent Test**: Add an `rdfs:comment` annotation to a class, save, inspect the file — the token must be abbreviated in all three formats.

**Implementation approach**: In each file, replace the single `RDFS_LABEL` constant with two module-level maps (`RDFS_ANN_TO_TOKEN: Map<string, string>` and `RDFS_TOKEN_TO_IRI: Map<string, string>`) covering all four RDFS annotation properties. Update `abbreviateIri` / `iri()` to use `RDFS_ANN_TO_TOKEN.get(iri)`. See `research.md` for the chosen implementation pattern.

### OWL Functional Serializer (`FunctionalSerializer.ts`)

- [x] T002 157d0ae [P] [US1] Write failing test: `generateEntityCluster` writes `rdfs:comment` abbreviated token in `AnnotationAssertion` output in `src/serializer/FunctionalSerializer.test.ts` — add a test entity with an annotation using the `rdfs:comment` property IRI and assert the output line contains `rdfs:comment`, not `<http://www.w3.org/2000/01/rdf-schema#comment>`
- [x] T003 157d0ae [US1] Implement write-path fix in `src/serializer/FunctionalSerializer.ts`: remove `const RDFS_LABEL`; add `RDFS_PREFIX`, `RDFS_ANN_TO_TOKEN`, `RDFS_TOKEN_TO_IRI` constants; update `iri()` function to use `RDFS_ANN_TO_TOKEN.get(s)`; update the `RDFS_LABEL` reference in `generateEntityCluster` to use `${RDFS_PREFIX}label`

**Checkpoint**: `npm test -- src/serializer/FunctionalSerializer.test.ts` — new test passes.

### OWL Functional Sync (`.ofn`) — Write Path

- [x] T004 157d0ae [P] [US1] Write failing test: `syncFunctional` writes `rdfs:comment` abbreviated token for a newly added annotation in `src/sync/__tests__/AnnotationSync.test.ts` — file has `AnnotationAssertion(rdfs:label ...)`, model adds `rdfs:comment`, assert the replacement contains `AnnotationAssertion(rdfs:comment ...)` not `AnnotationAssertion(<http://...#comment> ...)`
- [x] T005 157d0ae [US1] Implement write-path fix in `src/sync/AnnotationSync.ts`: remove `const RDFS_LABEL`; add `RDFS_PREFIX`, `RDFS_ANN_TO_TOKEN`, `RDFS_TOKEN_TO_IRI` constants; update `abbreviateIri` to use `RDFS_ANN_TO_TOKEN.get(iri)`; update all remaining `RDFS_LABEL` references (in `entityAnnotationPairs`) to use `\`${RDFS_PREFIX}label\``

**Checkpoint**: `npm test -- src/sync/__tests__/AnnotationSync.test.ts` — new test passes.

### Manchester Sync (`.omn`) — Write Path

- [x] T006 157d0ae [US1] Write failing test: `syncManchester` writes `rdfs:comment` abbreviated token in `src/sync/__tests__/AnnotationSync.test.ts` — file has `Annotations:\n        rdfs:label "Cat"@en`, model adds `rdfs:comment "A comment"`, assert output contains `rdfs:comment "A comment"`, not `<http://...#comment>`
- [x] T007 157d0ae [US1] Confirm `syncManchester` write-path works with `src/sync/AnnotationSync.ts` changes from T005 — no additional code change needed (same `abbreviateIri` function); run `npm test -- src/sync/__tests__/AnnotationSync.test.ts` and confirm T006's test now passes

**Checkpoint**: Manchester write test passes (covered by T005 implementation).

### Turtle Sync (`.ttl`) — Write Path

- [x] T008 157d0ae [P] [US1] Write failing test: `syncAxiomsTurtle` writes `rdfs:comment` abbreviated token in `src/sync/__tests__/AxiomSync.test.ts` — entity block has `rdfs:label "A"@en .`, model adds `rdfs:comment "test"`, assert rebuilt block contains `rdfs:comment "test"` not `<http://...#comment> "test"`
- [x] T009 157d0ae [US1] Implement write-path fix in `src/sync/AxiomSync.ts`: remove `const RDFS_LABEL`; add `RDFS_PREFIX`, `RDFS_ANN_TO_TOKEN`, `RDFS_TOKEN_TO_IRI` constants; update `abbreviateIri` to use `RDFS_ANN_TO_TOKEN.get(iri)`; update all remaining `RDFS_LABEL` references (in `entityAnnotationSegs`) to use `\`${RDFS_PREFIX}label\``

**Checkpoint**: `npm test -- src/sync/__tests__/AxiomSync.test.ts` — new test passes.

---

## Phase 3: User Story 2 — Round-Trip Fidelity (P2)

**Goal**: A file already containing abbreviated RDFS tokens (`rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy`) produces an empty `git diff` on a no-op save. The sync layer correctly recognises these abbreviated tokens during parsing.

**Independent Test**: Open a file with `rdfs:comment "..."` already written; trigger a no-op save; `git diff` is empty.

**Why read-path fix is needed for `.ofn`/`.omn` but not `.ttl`**: `.ofn` and `.omn` files may omit the `rdfs:` prefix declaration, so `resolveIri('rdfs:comment', prefixes)` cannot fall back to the prefix map. The parsers need `RDFS_TOKEN_TO_IRI` as the authoritative resolution. `.ttl` files always declare `@prefix rdfs: <...>`, so `resolveIri` already works; only the write-path fix (T009) is needed for idempotency there.

### OWL Functional Sync (`.ofn`) — Read Path

- [x] T010 157d0ae [P] [US2] Write failing test: `syncFunctional` is a no-op when file already has `AnnotationAssertion(rdfs:comment ...)` (abbreviated token, no `rdfs:` in prefix map) in `src/sync/__tests__/AnnotationSync.test.ts` — confirm test fails before T011
- [x] T011 157d0ae [US2] Implement read-path fix in `src/sync/AnnotationSync.ts`: in `parseFunctionalAnnotationItem` (line ~120) change `propToken === 'rdfs:label' ? RDFS_LABEL : resolveIri(propToken, prefixes)` to `RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(propToken, prefixes)`

**Checkpoint**: syncFunctional idempotency test passes.

### Manchester Sync (`.omn`) — Read Path

- [x] T012 157d0ae [US2] Write failing test: `syncManchester` is a no-op when file already has `rdfs:comment "..."` (abbreviated token, no `rdfs:` in prefix map) in `src/sync/__tests__/AnnotationSync.test.ts` — confirm test fails before T013
- [x] T013 157d0ae [US2] Implement read-path fix in `src/sync/AnnotationSync.ts`: in `parseManchesterAnnotationLine` (line ~257) change `propToken === 'rdfs:label' ? RDFS_LABEL : resolveIri(propToken, prefixes)` to `RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(propToken, prefixes)`

**Checkpoint**: syncManchester idempotency test passes. Run `npm test -- src/sync/__tests__/AnnotationSync.test.ts` — all annotation sync tests pass.

---

## Phase 4: Polish & Verification

**Purpose**: Full suite pass, type safety, scale gate, and manual round-trip confirmation.

- [x] T014 157d0ae [P] Run `npm test` — all tests pass; coverage ≥ 80% for `src/sync/AnnotationSync.ts`, `src/sync/AxiomSync.ts`, and `src/serializer/FunctionalSerializer.ts`
- [x] T015 157d0ae [P] Run `npm run compile` — zero TypeScript type errors
- [x] T016 157d0ae [P] Principle IV benchmark — confirm both sync functions complete a no-op scan of `test-ontologies/anatomy.owl` (302k lines) in < 500ms each (existing `src/sync/__tests__/sync-anatomy-bench.test.ts`)

- [ ] T017 Manual round-trip verification per `specs/002-abbreviate-rdfs-iris/quickstart.md` (7 scenarios):
  - Scenario 1: no-op save on `.ofn` → empty git diff ✓
  - Scenario 2: add `rdfs:comment` in `.ofn` → abbreviated token in diff ✓
  - Scenario 3: no-op save on `.omn` → empty git diff ✓
  - Scenario 4: add `rdfs:comment` in `.omn` → abbreviated token in diff ✓
  - Scenario 5: no-op save on `.ttl` → empty git diff ✓
  - Scenario 6: add `rdfs:comment` in `.ttl` → abbreviated token in diff ✓
  - Scenario 7: `rdfs:seeAlso` / `rdfs:isDefinedBy` spot check ✓

- [ ] T018 Conductor — Manual Verification 'Abbreviate RDFS Annotation Property IRIs': confirmed `git diff` behaviour matches all acceptance scenarios in `specs/002-abbreviate-rdfs-iris/spec.md §User Stories`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 checkpoint
- **Phase 3 (US2)**: Depends on Phase 2 — `RDFS_TOKEN_TO_IRI` map must exist before T011/T013 can reference it
- **Phase 4 (Polish)**: Depends on Phase 2 AND Phase 3 completion

### Within Phase 2

```
T002 → T003   (FunctionalSerializer — independent file)
T004 → T005   (AnnotationSync .ofn write — same file as T006)
T006 → T007   (AnnotationSync .omn write — sequential in same file, T005 already does the fix)
T008 → T009   (AxiomSync Turtle — independent file, parallel with AnnotationSync track)
```

### Within Phase 3

```
T010 → T011   (AnnotationSync .ofn read)
T012 → T013   (AnnotationSync .omn read — sequential in same file after T010/T011)
```

Note: T011 and T013 are both changes to `AnnotationSync.ts`. T011 changes `parseFunctionalAnnotationItem`; T013 changes `parseManchesterAnnotationLine`. They are in different functions but the same file — do them sequentially.

### Parallel Opportunities

- T002, T004, T008 (write failing tests) can be started in parallel — different files or clearly separated test blocks
- T003, T005, T009 (implementation) can be done in parallel once their respective red tests exist
- T014, T015, T016 (verification) run in parallel

---

## Parallel Example: Phase 2

```
Track A (FunctionalSerializer):
  T002 → T003

Track B (AnnotationSync .ofn + .omn):
  T004 → T005 → T006 → T007

Track C (AxiomSync .ttl):
  T008 → T009
```

Track B and Track C can run in parallel since they touch different files.
Track A can also run in parallel with both.

---

## Implementation Strategy

### MVP (User Story 1 — highest impact)

1. Complete Phase 1 (T001) — baseline confirmed
2. Run Phase 2 Track A (T002–T003) — serializer abbreviates rdfs:comment
3. Run Phase 2 Track B (T004–T007) — AnnotationSync write path fixed
4. Run Phase 2 Track C (T008–T009) — AxiomSync write path fixed
5. **STOP and VALIDATE**: `git diff` shows abbreviated tokens for all three formats
6. Complete Phase 3 (T010–T013) — idempotency for files with existing abbreviated tokens
7. Complete Phase 4 (T014–T018) — full verification and sign-off

### Incremental Delivery

- T002–T003: Serializer outputs `rdfs:comment` abbreviated (most visible change for Protégé-authored files)
- T004–T009: All three sync formats write abbreviated tokens
- T010–T013: Round-trip fidelity confirmed — no spurious rewrites
- T014–T018: Closes the feature with benchmark + manual sign-off

---

## Notes

- Constitution Principle I (Test-First) is non-negotiable: every test task must be confirmed **failing** before its paired implementation task begins
- T007 has no separate implementation step because the fix from T005 already covers it — verify this by running the test added in T006 after T005 is implemented
- T017 requires VS Code with the extension running — cannot be automated; must be done manually
- T018 is a conductor gate — requires explicit user confirmation before the track is closed
- `rdfs:seeAlso` and `rdfs:isDefinedBy` are covered by the same map changes as `rdfs:comment` — no additional test tasks are needed for them beyond the spot check in T017 (Scenario 7)
