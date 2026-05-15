# Feature Specification: Fix Spurious OWL File Changes on Sync

**Feature Branch**: `001-fix-sync-data-loss`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "reduce the unnecessary git commit of changes to owl document. If a new annotation is added or logical axioms are added to an entity. These changes are deleted. There should be nothing in the diff. Hence, it should not trigger a git commit. The issue could be caused by orders of annotations during the changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No-change editing produces no diff (Priority: P1)

An ontologist opens a class in the editor to inspect it. They do not add, remove, or modify any annotation or logical axiom. After the editor syncs, the OWL file on disk is byte-for-byte identical to before. The git status shows no changes, and no commit is queued.

**Why this priority**: This is the most disruptive symptom — every time a user opens and saves a class, a spurious commit is created that pollutes the git history with meaningless annotation-reordering diffs. Fixing idempotency alone restores trust in the version history.

**Independent Test**: Open a class with at least one annotation, trigger a sync without modifying anything, then verify `git diff` is empty for the OWL file.

**Acceptance Scenarios**:

1. **Given** an OWL file whose annotations appear in the order `[Annotation A, Annotation B]`, **When** a sync is triggered with the entity unchanged, **Then** the file on disk retains the original order `[Annotation A, Annotation B]` with no modifications.
2. **Given** an OWL file with logical axioms (e.g., SubClassOf), **When** a sync is triggered with no axiom changes, **Then** the axiom lines in the file are byte-for-byte unchanged.
3. **Given** a clean git working tree, **When** a sync runs on an entity that was not modified, **Then** `git status` continues to report a clean working tree.

---

### User Story 2 - Adding an annotation produces an exact, minimal diff (Priority: P1)

An ontologist adds a new annotation (e.g., a definition or synonym) to a class via the editor. After saving, the git diff for the OWL file shows exactly the lines added for that annotation — no reordering of pre-existing annotations, no spurious deletions, no unrelated changes.

**Why this priority**: Co-equal with Story 1 — users cannot trust the audit trail when adding one annotation rewrites unrelated lines. This scenario is also how the data-loss symptom manifests: the new annotation is "added then undone" by a reordering pass, leaving no diff at all.

**Independent Test**: Add a single annotation to a class that already has one or more annotations, verify the diff contains exactly one added line and zero deleted or reordered lines.

**Acceptance Scenarios**:

1. **Given** a class with annotations `[rdfs:label "Cat"@en]`, **When** a `skos:definition "A domestic feline"` annotation is added, **Then** the diff shows exactly one added `AnnotationAssertion` line and no other changes.
2. **Given** a class where the file stores annotations in the order `[definition, rdfs:label]`, **When** a new annotation is added, **Then** the original two annotations remain in their original file order and only the new annotation line appears in the diff.
3. **Given** a class with multiple existing annotations, **When** an annotation is added, **Then** `git diff` contains no deletion markers (no lines are removed or reordered).

---

### User Story 3 - Adding a logical axiom produces an exact, minimal diff (Priority: P2)

An ontologist adds a SubClassOf or EquivalentClasses axiom to a class. The git diff shows exactly the new axiom line — no surrounding annotations or unrelated axiom lines are touched.

**Why this priority**: Lower than annotation stories because axiom reordering is less frequent in day-to-day editing, but the same correctness principle applies.

**Independent Test**: Add one SubClassOf axiom to a class that already has an axiom, verify the diff contains exactly one added axiom line and no other changes.

**Acceptance Scenarios**:

1. **Given** a class with an existing `SubClassOf` axiom, **When** a second `SubClassOf` axiom is added, **Then** the diff shows exactly one new `SubClassOf` line and the existing axiom line is unchanged.
2. **Given** a class with existing annotations and an axiom, **When** a new EquivalentClasses axiom is added, **Then** annotation lines are untouched in the diff.

---

### Edge Cases

- What happens when an entity has zero annotations and a new annotation is added? (Must produce exactly one added line, no spurious header.)
- What happens when two annotations are added in the same edit session? (Diff should show exactly two added lines.)
- What happens if the file uses prefix-abbreviated IRIs for annotation property references? (Ordering check must still function correctly.)
- What happens when annotation or axiom content contains special characters (quotes, backslashes, newlines)? (Must not corrupt the file or cause false-positive diffs.)
- What happens if sync runs while another sync is concurrently pending? (No data loss from edit interleaving.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sync MUST be idempotent — if the set and values of annotations for an entity are semantically identical to what is already in the file, no file modification must be produced.
- **FR-002**: The sync MUST preserve the existing order of annotations already present in the file when no reordering is required by the edit being applied.
- **FR-003**: When a new annotation is added, the sync MUST append it without reordering any pre-existing annotation lines.
- **FR-004**: When a new logical axiom is added, the sync MUST insert it without modifying any annotation lines or any other axiom lines already present.
- **FR-005**: The sync MUST NOT produce a file change when only cosmetic or ordering differences exist between the in-memory model representation and the file representation (i.e., annotation ordering in the model must not override annotation ordering in the file when the semantic content is unchanged).
- **FR-006**: All three OWL file formats (Functional Syntax `.ofn`, Manchester Syntax `.omn`, Turtle `.ttl`) MUST satisfy FR-001 through FR-005.

### Key Entities

- **OWL Entity**: A named class, object property, data property, annotation property, or individual tracked in the in-memory ontology model, with zero or more annotations and logical axioms.
- **Annotation**: A metadata statement on an entity (e.g., rdfs:label, skos:definition) stored as property-IRI + literal value pairs in the in-memory model and as `AnnotationAssertion` lines in the OWL file.
- **Logical Axiom**: A structural statement on an entity (SubClassOf, EquivalentClasses, etc.) stored in the in-memory model and as corresponding lines in the OWL file.
- **Sync Operation**: The process by which the in-memory model writes annotation or axiom changes back to the OWL file on disk without re-serializing the entire file.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After triggering a sync on an unmodified entity, `git diff` for the OWL file is empty in 100% of cases across all three supported file formats.
- **SC-002**: After adding a single annotation to an entity, `git diff` shows exactly one added line and zero removed or modified lines.
- **SC-003**: After adding a single logical axiom to an entity, `git diff` shows exactly one added line and zero removed or modified lines in annotation sections.
- **SC-004**: All existing tests continue to pass after the fix, with new tests added to cover the idempotency and ordering scenarios above (coverage ≥ 80% for modified files).

## Assumptions

- The fix applies to the incremental sync layer (`AnnotationSync` and `AxiomSync`) — it does not affect the full-file serializer used for initial file generation.
- The canonical annotation ordering in the file (as written by the user or imported from another tool) is treated as authoritative; the in-memory model's enumeration order does not override it for existing annotations.
- Concurrent sync calls (annotation sync and axiom sync running in close succession) are a plausible scenario and the fix must not introduce data loss under that condition.
- The scope is limited to `.ofn`, `.omn`, and `.ttl` formats; OWL/XML (`.owl`/`.owx`) format is out of scope for this fix.
