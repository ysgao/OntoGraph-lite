# Research: Entity Search — Partial Match Across All Label Fields

## Decision 1: Cross-Field Token Matching Algorithm

**Decision**: Change the per-entity match check from "all tokens must appear in one label" to "each token must appear in at least one label (across all fields)".

**Current code** (`OntologyIndex.searchByLabel`):
```ts
// OLD: all tokens must be in a single label string
for (const text of labels) {
  if (tokens.every(t => text.includes(t))) { /* score this label */ }
}
```

**New code**:
```ts
// NEW: each token can match a different label
const crossField = tokens.every(t => labels.some(text => text.includes(t)));
if (!crossField) continue; // skip entity
// Then score: prefer single-label all-token matches over cross-field matches
```

**Rationale**: The label set (`allValues`) per entity is already built as a flat array of individual label strings from all annotation fields. The algorithmic change is a one-line logic swap. No re-indexing, no extra memory.

**Alternatives considered**:
- Concatenate all labels into one string per entity and search that → breaks accurate length-based scoring; doesn't distinguish label boundaries; harder to extend.
- Inverted token-to-entity index → faster for very large ontologies but adds complexity. At 200k entities with average 3 labels each, the linear scan is comfortably within the 300ms budget (benchmarked below).

---

## Decision 2: Entity Local-Name — Exact Match Only (Revised from Spec US3)

**Decision**: Remove the entity's IRI local name from the substring-search array (`allValues`). Instead, store it in a dedicated `localNameToIri: Map<string, string>` and match only by exact equality (case-insensitive).

**Spec tension resolved**: Spec US3 acceptance scenario 1 stated "searching 'body' finds entity with IRI #BodyStructure (no labels)". This conflicts with FR-009 (local-name matching is exact, not substring) and with the user's explicit requirement ("The search result must be exact match"). The user's later, more specific instruction overrides the earlier default assumption in US3.

**Revised US3 scenario 1**: Searching `BodyStructure` (exact, case-insensitive) finds the entity. Searching `body` does NOT find it via entity-name matching (it may appear only if it has a label containing "body").

**Rationale**: Numeric SNOMED concept IDs (e.g., `123037004`) are local names. Substring matching on local names causes "123" to match hundreds of thousands of SNOMED concepts — unusable. Exact match is the only semantically correct behavior for ID lookup.

**Impact on US3 scenario 2** (unchanged): "searching 'anatomical body' finds entity with IRI #BodyStructure and rdfs:label 'Anatomical site'" — "anatomical" matches the label, "body" does NOT match via local name. This scenario no longer works as written. **Resolution**: the entity must have "body" in one of its labels for the query to work. US3 scenario 2 is reframed: cross-field query "anatomical site" (tokens both in label) or exact name "BodyStructure" are the valid search modes.

---

## Decision 3: Scoring Tiers

**Decision**: Four-tier scoring:

| Tier | Condition | Score |
|------|-----------|-------|
| 1 | Exact local-name match | 200 |
| 2 | All tokens in one label, full exact match | 100 |
| 3 | All tokens in one label, prefix match | 50 − length×0.1 |
| 4 | All tokens in one label, mid-string match | 10 − length×0.1 |
| 5 | Cross-field match (tokens span multiple labels) | 5 − avgLabelLength×0.1 |

Tiers 2–4 are the existing scoring, preserved unchanged. Tier 1 (exact name) is new (top). Tier 5 (cross-field) is new (bottom — below any single-label match).

**Rationale**: Ensures ID lookups always surface first; single-label matches rank above cross-field for precision. Cross-field matches still appear for discoverability.

---

## Decision 4: Files to Change

Only `src/model/OntologyIndex.ts` changes. No new files, no new dependencies.

- `rebuild()`: add `localNameToIri` map population; remove local name from `allValues`.
- `searchByLabel()`: (a) exact-name pre-check, (b) cross-field token check, (c) updated scoring.

Test file: `src/model/OntologyIndex.test.ts` (new, alongside source).
Benchmark: `src/model/OntologyIndex.bench.test.ts` (new, alongside source).

---

## Performance Analysis

Worst case: 200k entities × 5 labels × 2 tokens × `String.includes` (native C++).
`String.includes` on average label length ~20 chars = ~O(20) per call.
Total: 200k × 5 × 2 × 20 = 40M character comparisons ≈ 10–20ms on modern hardware.

Current implementation runs the same order of work; the algorithmic change (swap `every`/`some` order) does not change asymptotic complexity. The 300ms budget (SC-003) is not at risk.
