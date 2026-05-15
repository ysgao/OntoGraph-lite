# Data Model: Abbreviate RDFS Annotation Property IRIs

**Branch**: `002-abbreviate-rdfs-iris` | **Date**: 2026-05-15

## Affected Constants

### Before (each file independently)

```typescript
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
```

### After (each file independently)

```typescript
const RDFS_PREFIX = 'http://www.w3.org/2000/01/rdf-schema#';
const RDFS_ANN_TO_TOKEN = new Map<string, string>([
  [`${RDFS_PREFIX}label`,       'rdfs:label'],
  [`${RDFS_PREFIX}comment`,     'rdfs:comment'],
  [`${RDFS_PREFIX}seeAlso`,     'rdfs:seeAlso'],
  [`${RDFS_PREFIX}isDefinedBy`, 'rdfs:isDefinedBy'],
]);
const RDFS_TOKEN_TO_IRI = new Map<string, string>(
  [...RDFS_ANN_TO_TOKEN.entries()].map(([k, v]) => [v, k]),
);
```

The two maps are module-private and duplicated across the three affected files. There is no shared export — this is an intentional YAGNI choice (presentation-layer concern, not a model concern).

---

## Affected Functions

### `abbreviateIri` (AnnotationSync.ts, AxiomSync.ts)

| | Before | After |
|--|--------|-------|
| Signature | `(iri: string, prefixes: Map<string, string>): string` | unchanged |
| Returns abbreviated token for | `rdfs:label` only | `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy` |
| Fallback | `<${iri}>` | `<${iri}>` (unchanged) |

### `iri()` (FunctionalSerializer.ts)

| | Before | After |
|--|--------|-------|
| Signature | `(s: string): string` | unchanged |
| Returns abbreviated token for | `rdfs:label` only | `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy` |
| Fallback | `<${s}>` | `<${s}>` (unchanged) |

### `parseFunctionalAnnotationItem` (AnnotationSync.ts, line ~120)

Read path for `.ofn` files.

| | Before | After |
|--|--------|-------|
| Recognises | `rdfs:label` token → `RDFS_LABEL` IRI | any of 4 `rdfs:*` tokens → their full IRI |
| Pattern | `propToken === 'rdfs:label' ? RDFS_LABEL : resolveIri(...)` | `RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(...)` |

### `parseManchesterAnnotationLine` (AnnotationSync.ts, line ~257)

Read path for `.omn` files.

| | Before | After |
|--|--------|-------|
| Recognises | `rdfs:label` token → `RDFS_LABEL` IRI | any of 4 `rdfs:*` tokens → their full IRI |
| Pattern | `propToken === 'rdfs:label' ? RDFS_LABEL : resolveIri(...)` | `RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(...)` |

---

## Invariants

1. **Abbreviation set is closed**: Only the 4 RDFS annotation property IRIs are abbreviated. No other RDFS vocabulary (e.g., `rdfs:subClassOf`, `rdfs:domain`) is abbreviated by these functions — they remain as `<fullIRI>`.
2. **Round-trip identity**: For any of the 4 RDFS annotation IRIs `I`, `resolveIri(abbreviateIri(I, _), {})` must fail (returns abbreviated token unchanged) but `RDFS_TOKEN_TO_IRI.get(abbreviateIri(I, _))` must return `I`. The parse path uses `RDFS_TOKEN_TO_IRI.get(token) ?? resolveIri(token, prefixes)`, which gives the correct round-trip even when the prefix is absent from the map.
3. **Idempotency preserved**: If a file already contains abbreviated RDFS tokens, the sync reads them via `RDFS_TOKEN_TO_IRI` → identifies the correct full IRI → matches model annotations → no-op. This is the same mechanism that already makes `rdfs:label` idempotent.
4. **No model changes**: The `OntologyModel` stores annotation property IRIs as full IRIs. The abbreviation/recognition mapping lives entirely in the sync and serializer layers.

---

## File Impact Summary

| File | Lines changed (est.) | Change type |
|------|----------------------|-------------|
| `src/sync/AnnotationSync.ts` | ~10 | Replace `RDFS_LABEL` const with maps; update 3 call sites |
| `src/sync/AxiomSync.ts` | ~8 | Replace `RDFS_LABEL` const with maps; update 1 call site |
| `src/serializer/FunctionalSerializer.ts` | ~8 | Replace `RDFS_LABEL` const with maps; update 1 call site |
| `src/sync/__tests__/AnnotationSync.test.ts` | ~60 | New tests for 3 formats × (write + idempotency) |
| `src/sync/__tests__/AxiomSync.test.ts` | ~30 | New tests for Turtle combined path |
| `src/serializer/FunctionalSerializer.test.ts` | ~20 | New tests for serializer output |
| `CLAUDE.md` | ~2 | Update IRI abbreviation rule documentation |

---

## No Changes Required

- `src/model/OntologyModel.ts` — no change; `BUILTIN_ANNOTATION_PROP_IRIS` already lists all 4 properties
- `src/parser/` — no change; parsers use prefix maps that include `rdfs:` declarations from the file
- `src/sync/__tests__/sync-anatomy-bench.test.ts` — no change; benchmark exercises the existing code paths, which are extended not replaced
- Any `.ttl`-format test files — the Turtle parser and writer already use prefix maps that resolve `rdfs:`
