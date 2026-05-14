# Plan: Targeted IRI Abbreviation (rdfs:label)

## Objective
Update the OWL Functional Syntax serialization and synchronization logic to abbreviate `rdfs:label` as requested, while keeping all other IRIs in their full `<IRI>` format to match Protégé's output.

## Changes

### 1. `src/serializer/FunctionalSerializer.ts`
- Update `iri(s: string)` function to return `'rdfs:label'` if `s === RDFS_LABEL`.
- This will automatically affect `generateEntityCluster` and `serializeToFunctional`.

### 2. `src/sync/AnnotationSync.ts`
- Update `abbreviateIri(iri: string, prefixes: Map<string, string>)` or the usage of it to specifically handle `rdfs:label`.
- Actually, since we want *only* `rdfs:label` abbreviated, we can simplify this or ensure the prefix map used for sync only contains the necessary standard prefixes if they are present in the file.
- The user requested "only for rdfs:label".

### 3. `src/sync/AxiomSync.ts`
- Similar to `AnnotationSync.ts`, ensure `rdfs:label` is abbreviated in `generateFunctionalAxiomLines` and other functional sync paths.

## Verification
- Run existing tests.
- Add a test case to `FunctionalSerializer.test.ts` verifying that `rdfs:label` is abbreviated but other IRIs (like the entity IRI itself) are full.
- Manual verification via export and incremental sync.
