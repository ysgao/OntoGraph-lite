# Implementation Plan: Consistent OWL Functional Syntax Arrangement

## Phase 1: Unified Cluster Generation & Serialization

- [x] Task: Create unified cluster generation logic [354fb3e]
    - [x] Write unit tests for `generateEntityCluster` utility
    - [x] Implement `generateEntityCluster` in a shared utility file (or `FunctionalSerializer.ts`)
- [x] Task: Refactor `FunctionalSerializer.ts` for consistent ordering [8eb7dfe]
    - [x] Update `FunctionalSerializer.test.ts` with new expected structure
    - [x] Implement new ordering logic in `serializeToFunctional`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Unified Cluster Generation & Serialization' (Protocol in workflow.md)

## Phase 2: Incremental Synchronization

- [ ] Task: Update `AxiomSync.ts` for clustered functional syntax
    - [ ] Write integration tests for clustered axiom syncing
    - [ ] Implement `syncEntityClusterFunctional` and update `AxiomSync.ts`
- [ ] Task: Update `AnnotationSync.ts` for clustered functional syntax
    - [ ] Write integration tests for clustered annotation syncing
    - [ ] Update `AnnotationSync.ts` to use the shared clustering logic
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Incremental Synchronization' (Protocol in workflow.md)

## Phase 3: Complex Axioms & Final Polish

- [ ] Task: Handle GCIs and Property Chains separately
    - [ ] Add tests for GCI and Property Chain placement
    - [ ] Implement logic to move these axioms to the "Complex Axioms" section
- [ ] Task: Final round-trip verification
    - [ ] Perform manual edits via UI and verify file structure
    - [ ] Ensure `FunctionalParser.ts` can read the new arrangement without issues
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Complex Axioms & Final Polish' (Protocol in workflow.md)
