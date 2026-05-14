# Implementation Plan: Consistent OWL Functional Syntax Arrangement

## Phase 1: Unified Cluster Generation & Serialization [checkpoint: b12f04d]

- [x] Task: Create unified cluster generation logic [354fb3e]
    - [x] Write unit tests for `generateEntityCluster` utility
    - [x] Implement `generateEntityCluster` in a shared utility file (or `FunctionalSerializer.ts`)
- [x] Task: Refactor `FunctionalSerializer.ts` for consistent ordering [8e38692]
    - [x] Update `FunctionalSerializer.test.ts` with new expected structure
    - [x] Implement new ordering logic in `serializeToFunctional`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Unified Cluster Generation & Serialization' (Protocol in workflow.md) [fd48009]

## Phase 2: Incremental Synchronization

- [x] Task: Update `AxiomSync.ts` for clustered functional syntax [0a7e0ca]
    - [x] Write integration tests for clustered axiom syncing
    - [x] Implement `syncEntityClusterFunctional` and update `AxiomSync.ts`
- [x] Task: Update `AnnotationSync.ts` for clustered functional syntax [8ca07bf]
    - [x] Write integration tests for clustered annotation syncing
    - [x] Update `AnnotationSync.ts` to use the shared clustering logic
- [x] Task: Conductor - User Manual Verification 'Phase 2: Incremental Synchronization' (Protocol in workflow.md)

## Phase 3: Complex Axioms & Final Polish

- [x] Task: Handle GCIs and Property Chains separately
    - [x] Add tests for GCI and Property Chain placement
    - [x] Implement logic to move these axioms to the "Complex Axioms" section
- [x] Task: Final round-trip verification
    - [x] Perform manual edits via UI and verify file structure
    - [x] Ensure `FunctionalParser.ts` can read the new arrangement without issues
- [x] Task: Conductor - User Manual Verification 'Phase 3: Complex Axioms & Final Polish' (Protocol in workflow.md)
