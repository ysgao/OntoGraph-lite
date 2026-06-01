# Data Model: Entity Search — Partial Match Across All Label Fields

## Modified Class: `OntologyIndex` (`src/model/OntologyIndex.ts`)

### Fields

| Field | Type | Change | Purpose |
|-------|------|--------|---------|
| `iriToEntity` | `Map<string, OWLEntityUnion>` | Unchanged | IRI → entity lookup |
| `labelToIris` | `Map<string, string[]>` | Unchanged | Exact label → IRIs (used by `exactMatchByLabel`) |
| `searchText` | `Map<string, string[]>` | **Modified** | IRI → array of individual label strings (lowercase, lang-tag stripped). **Local name removed from this array.** |
| `localNameToIri` | `Map<string, string>` | **New** | Lowercase local IRI name → IRI. Used for exact-name lookup only. |

### `rebuild()` — Changes

1. After computing `localName` (the IRI fragment after last `#` or `/`), add to `localNameToIri` instead of `allValues`:
   ```ts
   // Before: allValues.push(localKey)
   // After:
   if (localName) { this.localNameToIri.set(localName.toLowerCase(), entity.iri); }
   ```
2. `allValues` now contains only label values (rdfs:label, skos:prefLabel, skos:altLabel) — no local name.

### `searchByLabel(query, maxResults)` — Algorithm

```
Input: query (string), maxResults (number, default 50)
Output: OWLEntityUnion[] ordered by descending score

1. tokens ← query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0)
   If tokens is empty → return []

2. queryLower ← query.toLowerCase().trim()
   matches ← []

3. Exact local-name check:
   iri ← localNameToIri.get(queryLower)
   If iri exists AND entity = iriToEntity.get(iri):
     Push { entity, score: 200 }
     exactNameIri ← iri   (to avoid duplicate below)

4. For each [iri, labels] in searchText:
   If iri === exactNameIri → skip (already added at tier 1)
   
   crossFieldMatch ← tokens.every(t => labels.some(text => text.includes(t)))
   If NOT crossFieldMatch → continue

   bestScore ← -1
   For each text in labels:
     If tokens.every(t => text.includes(t)):   // all tokens in one label
       score ←
         text === queryLower           → 100
         text.startsWith(queryLower)  → 50 − text.length × 0.1
         else                         → 10 − text.length × 0.1
       bestScore ← max(bestScore, score)
   If bestScore === -1:   // cross-field only
     avgLen ← labels.reduce((s, t) => s + t.length, 0) / labels.length
     bestScore ← 5 − avgLen × 0.01
   
   Push { entity: iriToEntity.get(iri), score: bestScore }

5. Sort matches by score descending.
6. Return matches.slice(0, maxResults).map(m => m.entity)
```

### Scoring Table

| Condition | Score |
|-----------|-------|
| Exact local-name match | 200 |
| All tokens in one label, full exact match | 100 |
| All tokens in one label, prefix match | 50 − len×0.1 |
| All tokens in one label, mid-string match | 10 − len×0.1 |
| Cross-field match (tokens span labels) | 5 − avgLen×0.01 |

### Unchanged Public Methods

- `exactMatchByLabel(label)` — unchanged
- `getByIri(iri)` — unchanged
- `classCount`, `objectPropertyCount`, `dataPropertyCount`, `individualCount` — unchanged

## Index Contents per Entity (after change)

| Source | Included in `searchText` | Included in `localNameToIri` |
|--------|--------------------------|------------------------------|
| `rdfs:label` (all languages, lang-tag stripped) | Yes | No |
| `skos:prefLabel` | Yes | No |
| `skos:altLabel` | Yes | No |
| IRI local name (after `#` or last `/`) | **No** | **Yes** |

## Validation Rules

- Empty local name (IRI ends with `#` or `/`): not added to `localNameToIri`.
- Empty label values: not added to `searchText` (existing behaviour, unchanged).
- Lang-tag stripping: everything after the last `@` is removed before indexing (existing, unchanged).
- Duplicate IRIs: `localNameToIri` is a 1:1 map — if two entities have the same local name (different namespaces), only the last one wins. Acceptable given local names are treated as unique identifiers within an ontology.
