# Specification: Consistent OWL Functional Syntax Arrangement

## Background
The current OWL Functional Syntax (.ofn) output of OntoGraph is functional but doesn't follow the structured arrangement common in professional ontology editors like Protégé. This makes the files harder to read and diff.

## Goals
Align the serialization and incremental synchronization logic of OWL Functional Syntax with the Protégé standard:
- Cluster annotations and axioms by entity.
- Maintain a clear global declarations block.
- Separate property and class clusters.
- Move complex axioms (GCIs and Property Chains) to the end.

## Functional Requirements
- **Entity Clustering:** Each entity should have a cluster starting with a comment `# Type: <IRI> (Label)`, followed by its annotations, and then its logical axioms (Equivalence, then Subsumption).
- **Global Declarations:** All entities must be declared in a block at the top of the file, after the ontology header.
- **Ordered Sections:**
    1. Prefixes
    2. Ontology Header (IRI, Version, Imports)
    3. Declarations (Classes, Object Properties, Data Properties, Annotation Properties, Individuals)
    4. Object Property Clusters
    5. Class Clusters
    6. Individual Clusters
    7. General Class Axioms (GCIs)
    8. Property Chain Axioms
- **Incremental Sync:** When an entity is edited in the UI, only its cluster and the declarations block should be updated in the source file, preserving the rest of the file structure.

## Technical Constraints
- Do not reparse the entire file on save/sync.
- Maintain compatibility with the existing `FunctionalParser.ts`.
- Use Manchester syntax labels in comments where possible for readability.
