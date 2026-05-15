# Research: Abbreviate RDFS Annotation Property IRIs

**Branch**: `002-abbreviate-rdfs-iris` | **Date**: 2026-05-15

## Q1 — Why does the code have a special case for `rdfs:label` rather than relying on the prefix map?

**Decision**: Keep the special-case pattern (check a known-IRI map before calling `resolveIri`) and extend it to all four RDFS annotation properties.

**Rationale**: The RDFS prefix (`http://www.w3.org/2000/01/rdf-schema#`) is a well-known namespace constant — not something an OWL file is required to declare. Many real ontologies (especially `.ofn` files from Protégé) declare only the prefixes they actually use in prefix declarations, and since full IRIs like `<http://www.w3.org/2000/01/rdf-schema#comment>` don't require an `rdfs:` prefix declaration to be valid, many files omit `Prefix(rdfs:=<...>)`. If the code relied on `resolveIri(propToken, prefixes)` to recognise `rdfs:comment`, it would fail silently for any file that has no `rdfs:` in its prefix map — the token would stay as `rdfs:comment` (unresolved), never match the entity's stored IRI, and the annotation would appear missing.

**Alternatives considered**:
- *Rely on prefix map only*: Fails on files without an explicit `rdfs:` prefix declaration. Rejected — not all files declare this prefix.
- *Inject RDFS prefix unconditionally into `parsePrefixes` output*: Would work but changes a shared helper with broader impact. Rejected — higher blast radius.
- *Hardcode an `RDFS_PREFIX` constant and check `token.startsWith('rdfs:')`*: Simpler but over-matches (e.g., would match `rdfs:subClassOf`, which is not an annotation property). Rejected — correct IRI abbreviation must be restricted to annotation properties only.

---

## Q2 — What is the complete set of places where `rdfs:label` token recognition or abbreviation is hardcoded?

Found in three source files:

| File | Location | What it does |
|------|----------|--------------|
| `src/sync/AnnotationSync.ts` | `abbreviateIri` (line 41) | Write path: full IRI → abbreviated token |
| `src/sync/AnnotationSync.ts` | `parseFunctionalAnnotationItem` (line 120) | Read path: recognises `rdfs:label` token → full IRI |
| `src/sync/AnnotationSync.ts` | `parseManchesterAnnotationLine` (line 257) | Read path: recognises `rdfs:label` token → full IRI |
| `src/sync/AxiomSync.ts` | `abbreviateIri` (line 56) | Write path: full IRI → abbreviated token |
| `src/serializer/FunctionalSerializer.ts` | `iri()` function (line 10) | Write path: full IRI → abbreviated token |

The `.ttl` write path in `AnnotationSync.syncTurtle` and `AxiomSync.syncAxiomsTurtle` both call the local `abbreviateIri`, so they are covered by fixing that function. No additional Turtle-specific special cases exist.

There is no parser-side special case in `AxiomSync.ts` because the Turtle and functional annotation-line parsers in `AxiomSync` use `BUILTIN_ANN_SET` + `resolveIri` (via the prefix map), not a manual token comparison. The prefix map is reliable in that context because Turtle files always declare `@prefix rdfs: <...>` when they use `rdfs:` tokens, and the functional read path in `AxiomSync` does not parse individual annotation tokens.

---

## Q3 — Chosen implementation approach

**Decision**: In each affected file, introduce a module-level bidirectional mapping between full RDFS annotation IRIs and their abbreviated tokens, then update `abbreviateIri` and all parser recognition points to use those maps.

**Concrete implementation**:

```typescript
// Module-level constants (replacing single RDFS_LABEL constant)
const RDFS_PREFIX = 'http://www.w3.org/2000/01/rdf-schema#';
const RDFS_ANN_TO_TOKEN = new Map<string, string>([
  [`${RDFS_PREFIX}label`,         'rdfs:label'],
  [`${RDFS_PREFIX}comment`,       'rdfs:comment'],
  [`${RDFS_PREFIX}seeAlso`,       'rdfs:seeAlso'],
  [`${RDFS_PREFIX}isDefinedBy`,   'rdfs:isDefinedBy'],
]);
const RDFS_TOKEN_TO_IRI = new Map<string, string>(
  [...RDFS_ANN_TO_TOKEN.entries()].map(([k, v]) => [v, k]),
);

// Updated abbreviateIri
function abbreviateIri(iri: string, prefixes: Map<string, string>): string {
  const token = RDFS_ANN_TO_TOKEN.get(iri);
  if (token !== undefined) { return token; }
  return `<${iri}>`;
}

// Updated recognition (in parseFunctionalAnnotationItem and parseManchesterAnnotationLine)
const propIri = RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(propToken, prefixes);
```

**Rationale**:
- The two maps are small (4 entries each) and make the bidirectional mapping explicit without duplication.
- `RDFS_TOKEN_TO_IRI.get(propToken) ?? resolveIri(...)` handles both abbreviated tokens (map hit) and full/other IRIs (map miss → resolveIri) in one expression. This is the same O(1) lookup pattern as before, just extended.
- Replacing `RDFS_LABEL` with `RDFS_ANN_TO_TOKEN.get(iri)` in `abbreviateIri` makes the extension trivially visible in code review.
- The `RDFS_LABEL` constant is no longer needed once replaced by the maps; it can be removed to avoid dead code.

**Alternatives considered**:
- *Single regex check on IRI prefix*: Abbreviated tokens are a closed set; a regex would be over-general. Rejected.
- *Centralise in `OntologyModel.ts`*: Would introduce a shared utility in the model layer for what is essentially a presentation concern (IRI → token for writing). The spec and constitution both say no model changes. Rejected.
- *Keep duplicate `RDFS_LABEL` constant + add `RDFS_COMMENT`, etc.*: Many independent comparisons (`if (iri === RDFS_LABEL) return 'rdfs:label'; else if (iri === RDFS_COMMENT) return 'rdfs:comment'; ...`). Functionally correct but verbose and fragile under extension. Rejected — map is cleaner.

---

## Q4 — Does `FunctionalSerializer.ts` have parser-side recognition to update?

**Decision**: No. The serializer is write-only — it takes an in-memory model and emits text. The `iri()` function only produces output; it never parses input tokens. So only the write path (`iri()` function, line 10) needs updating. No parser-side change is needed in the serializer.

---

## Q5 — Are there OWL parsing tests that would break if serializer output changes?

Checked `src/serializer/FunctionalSerializer.test.ts`: all annotation assertion tests use `rdfs:label` only. The serializer tests do not currently exercise `rdfs:comment`, `rdfs:seeAlso`, or `rdfs:isDefinedBy`. New tests must be added.

---

## Summary of changes

| File | Change type | Detail |
|------|-------------|--------|
| `src/sync/AnnotationSync.ts` | Write + Read | `abbreviateIri`: extend to 4-entry map; lines 120 + 257: use `RDFS_TOKEN_TO_IRI` |
| `src/sync/AxiomSync.ts` | Write only | `abbreviateIri`: extend to 4-entry map |
| `src/serializer/FunctionalSerializer.ts` | Write only | `iri()`: extend to 4-entry map |
| `src/sync/__tests__/AnnotationSync.test.ts` | Tests | New tests for `rdfs:comment` write + idempotency in all 3 formats |
| `src/sync/__tests__/AxiomSync.test.ts` | Tests | New tests for `rdfs:comment` write + idempotency in Turtle combined path |
| `src/serializer/FunctionalSerializer.test.ts` | Tests | New tests for `rdfs:comment` abbreviation in serializer output |
