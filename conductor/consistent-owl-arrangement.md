# Plan: Consistent OWL Functional Syntax Arrangement

This plan aims to align the app's OWL Functional Syntax (.ofn) output with the format produced by Protege, as described in `ContentArrangementInOWLfunctionalSyntaxDocument.md`.

## Objective
- Cluster annotations and logical axioms by entity.
- Maintain a global declarations block at the top.
- Separate Object Property clusters and Class clusters.
- Place complex axioms (GCIs, Property Chains) at the end of the file.
- Add descriptive comment lines for each entity cluster.

## Key Files & Context
- `src/serializer/FunctionalSerializer.ts`: Full file serialization logic.
- `src/sync/AxiomSync.ts`: Incremental axiom updates in the document.
- `src/sync/AnnotationSync.ts`: Incremental annotation updates in the document.
- `src/model/OntologyModel.ts`: Entity model and label lookup.

## Implementation Steps

### 1. Unified Cluster Generation
- Create a shared utility function `generateEntityCluster(entity: OWLEntity): string[]` that produces:
    - `# Type: <IRI> (Label)`
    - `AnnotationAssertion(...)` lines.
    - Logical axiom lines (excluding GCIs and Property Chains).
- This will be used by both the serializer and the sync logic.

### 2. Refactor `FunctionalSerializer.ts`
- Update `serializeToFunctional` to follow the Protege ordering:
    1. Prefixes
    2. Ontology Header & Imports
    3. Global Declarations (Classes, then Object Properties, etc.)
    4. Object Property Clusters (using `generateEntityCluster`)
    5. Class Clusters (using `generateEntityCluster`)
    6. Individual Clusters
    7. Complex Axioms (Property Chains and GCIs)
    8. Closing parenthesis

### 3. Coordinate Incremental Syncing
- Update `AxiomSync.ts` and `AnnotationSync.ts` to use a unified `syncEntityClusterFunctional` function for functional syntax.
- This function will:
    - Detect and remove all existing lines related to the entity (Comment, Annotations, Axioms).
    - Insert the new cluster in the correct section.
    - If it's a new entity, ensure a `Declaration(...)` is added to the declarations block at the top.
    - GCIs and Property Chains should be managed at the bottom of the file.

### 4. Logic Adjustments
- Move `PropertyChain` axioms from the property cluster to the "Complex Axioms" section at the end.
- Ensure `Declaration` lines are always grouped at the top, even when adding entities incrementally.

## Verification & Testing
- **Manual Verification**: Perform edits via the UI (label changes, axiom updates) on a functional syntax file and inspect the resulting text for proper clustering and ordering.
- **Unit Tests**: Add/update tests for `FunctionalSerializer` to verify the new arrangement pattern.
- **Round-trip check**: Ensure that a file saved by the app can still be parsed correctly by `FunctionalParser.ts`.
