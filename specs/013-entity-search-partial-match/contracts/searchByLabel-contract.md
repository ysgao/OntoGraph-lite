# Contract: `OntologyIndex.searchByLabel`

**File**: `src/model/OntologyIndex.ts`  
**Method**: `searchByLabel(query: string, maxResults?: number): OWLEntityUnion[]`

## Signature (unchanged)

```typescript
searchByLabel(query: string, maxResults?: number): OWLEntityUnion[]
```

## Behavioral Contract

### Inputs

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `query` | `string` | — | Any string; whitespace-only returns `[]` |
| `maxResults` | `number` | `50` | Positive integer; callers currently use `100` |

### Outputs

Ordered array of `OWLEntityUnion` entities, descending score. Length ≤ `maxResults`.

### Match Rules (post-change)

1. **Exact local-name match** (new): If `query.trim().toLowerCase()` equals the IRI local name of an entity, that entity is included and ranked first (score 200). The local name is the substring after the last `#` or `/` in the entity's full IRI.

2. **Cross-field label match** (new): An entity is included if, for every whitespace-delimited token in `query`, at least one of the entity's label values (`rdfs:label` all languages, `skos:prefLabel`, `skos:altLabel`) contains that token as a case-insensitive substring.

3. **Exclusion**: An entity is excluded if:
   - Not matched by rule 1, AND
   - Any query token is absent as a substring from all of the entity's label values.

### Ranking

Entities returned in descending score order:

| Priority | Condition |
|----------|-----------|
| 1st | Exact local-name match (score 200) |
| 2nd | All tokens appear in a single label, full exact match (score 100) |
| 3rd | All tokens in a single label, prefix match |
| 4th | All tokens in a single label, mid-string match |
| 5th | Tokens matched across multiple labels (cross-field) |

Within the same tier, shorter labels rank higher.

### Invariants

- **Word order independence**: `searchByLabel("body structure")` and `searchByLabel("structure body")` return the same entity set (order within results may differ only due to score ties).
- **Monotonicity**: Adding more labels to an entity cannot cause it to disappear from results for a previously matching query.
- **No false positives**: An entity with no label containing any query token and whose local name is not an exact match for the query MUST NOT appear in results.

### Breaking Changes from Previous Contract

| Old behaviour | New behaviour |
|---------------|---------------|
| All tokens must appear in a single label | Tokens may be distributed across label fields |
| IRI local name participates in substring matching | IRI local name participates in exact match only |
| No entity-name exact match | Entity-name exact match returns entity at top |
