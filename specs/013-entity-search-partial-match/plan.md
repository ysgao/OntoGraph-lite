# Implementation Plan: Entity Search — Partial Match Across All Label Fields

**Branch**: `013-entity-search-partial-match` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/013-entity-search-partial-match/spec.md`

## Summary

Improve `OntologyIndex.searchByLabel` in two ways:

1. **Cross-field token matching**: multi-word queries match entities whose labels collectively cover all tokens, even if no single label contains all of them. Currently all tokens must appear within one label string.

2. **Entity-name exact match**: a query that equals an entity's IRI local name exactly (case-insensitive) returns that entity at the top of results. The local name is removed from substring matching to prevent numeric SNOMED IDs from appearing in partial-token searches.

Only `src/model/OntologyIndex.ts` changes. No new files, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js 20  
**Primary Dependencies**: VS Code Extension API (no new runtime deps)  
**Storage**: In-memory index (`OntologyIndex`), rebuilt at ontology load time  
**Testing**: Vitest 1.6.0 — unit tests in `src/model/OntologyIndex.test.ts`, benchmark in `src/model/OntologyIndex.bench.test.ts`  
**Target Platform**: VS Code extension host (Node.js)  
**Performance Goals**: Search results within 300ms for 200k-entity ontologies (SC-003)  
**Constraints**: No new runtime dependencies; no change to public API signature  
**Scale/Scope**: SNOMED CT scale (50k–500k entities); anatomy.owl benchmark required (Constitution §IV)  
**Project Type**: VS Code extension (library module)

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Test-First | ✅ Required | All tasks follow Red→Green→Refactor; failing tests written before implementation |
| II — YAGNI | ✅ Compliant | Single file change; no new abstractions |
| III — OWL Compliance | ✅ N/A | No serializer or parser changes |
| IV — Scale-Aware | ✅ Required | Benchmark against anatomy.owl mandatory |
| V — Security | ✅ Compliant | No injection risk; query is already lowercased/trimmed internally |

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/013-entity-search-partial-match/
├── plan.md              ← this file
├── spec.md
├── research.md          ✅ complete
├── data-model.md        ✅ complete
├── quickstart.md        ✅ complete
├── contracts/
│   └── searchByLabel-contract.md  ✅ complete
├── checklists/
│   └── requirements.md
└── tasks.md             (Phase 2 — /speckit.tasks)
```

### Source Code

```text
src/model/
├── OntologyIndex.ts          ← modified (cross-field + exact-name)
├── OntologyIndex.test.ts     ← new (unit tests)
└── OntologyIndex.bench.test.ts  ← new (anatomy.owl benchmark)
```

No other source files change.

## Regression Safety

The following existing behaviours MUST be preserved:

| Scenario | How guaranteed |
|----------|---------------|
| Single-word query matching any label | Cross-field check degenerates to same result when 1 token |
| All tokens in one label (word-order-independent) | Existing per-label `tokens.every(t => text.includes(t))` check retained inside scoring loop |
| `exactMatchByLabel` method | Untouched |
| Result count cap at `maxResults` | Untouched |
| `SearchWebviewProvider` API | `searchByLabel` signature unchanged |

## Algorithm Change (from research.md)

### `rebuild()` — delta

```ts
// BEFORE: local name added to allValues (substring search)
if (localName) {
  const localKey = localName.toLowerCase();
  this.addToIndex(entity.iri, localKey);
  allValues.push(localKey);           // ← REMOVE THIS LINE
}

// AFTER: local name stored in dedicated exact-match map
if (localName) {
  this.localNameToIri.set(localName.toLowerCase(), entity.iri);
}
```

### `searchByLabel()` — delta

```ts
// BEFORE: per-entity check
for (const [iri, labels] of this.searchText) {
  let bestScore = -1;
  for (const text of labels) {
    if (tokens.every(t => text.includes(t))) {  // all tokens in one label
      // ... score
    }
  }
  if (bestScore > -1) { matches.push({ entity, score: bestScore }); }
}

// AFTER:
// Step 1 — exact name match (new)
const exactIri = this.localNameToIri.get(queryLower);
if (exactIri) {
  const e = this.iriToEntity.get(exactIri);
  if (e) { matches.push({ entity: e, score: 200 }); }
}

// Step 2 — cross-field label match (modified)
for (const [iri, labels] of this.searchText) {
  if (iri === exactIri) continue;  // already added
  const crossField = tokens.every(t => labels.some(text => text.includes(t)));
  if (!crossField) continue;

  let bestScore = -1;
  for (const text of labels) {
    if (tokens.every(t => text.includes(t))) {   // prefer single-label match
      let score = 0;
      if (text === queryLower)             score = 100;
      else if (text.startsWith(queryLower)) score = 50 - text.length * 0.1;
      else                                  score = 10 - text.length * 0.1;
      if (score > bestScore) { bestScore = score; }
    }
  }
  if (bestScore === -1) {  // cross-field only
    const avgLen = labels.reduce((s, t) => s + t.length, 0) / labels.length;
    bestScore = 5 - avgLen * 0.01;
  }
  const entity = this.iriToEntity.get(iri);
  if (entity) { matches.push({ entity, score: bestScore }); }
}
```

## Spec Revision Note

**US3 scenario 1 revised**: The original spec said "searching 'body' finds entity with IRI #BodyStructure (no labels)". This conflicts with the user's explicit requirement that entity-name matching be exact only (FR-009). The revised behavior: searching `BodyStructure` (exact) finds the entity; searching `body` does not (no labels to match). This is the correct behavior for SNOMED-scale use where local names are numeric IDs.

**US3 scenario 2 revised**: "searching 'anatomical body' finds entity with IRI #BodyStructure and rdfs:label 'Anatomical site'" — the token "body" no longer matches the local name via substring. This scenario only works if the entity has a label containing "body". The cross-field and exact-name modes remain intact for their specified use cases.

## Complexity Tracking

No constitution violations. Table omitted.
