# Feature Specification: Abbreviate RDFS Annotation Property IRIs

**Feature Branch**: `002-abbreviate-rdfs-iris`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "use abbreviated IRI for the RDFS scheme annotation properties in OWL documents by following the same approach for rdfs:label."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abbreviated RDFS tokens in sync output (Priority: P1)

An ontology editor adds an `rdfs:comment` annotation to a class and saves. The saved OWL file contains `rdfs:comment "..."` (abbreviated token) rather than `<http://www.w3.org/2000/01/rdf-schema#comment> "..."` (full bracketed IRI). The same applies to `rdfs:seeAlso` and `rdfs:isDefinedBy`. The behavior is already established for `rdfs:label`; this story extends that pattern to the remaining three RDFS annotation properties.

**Why this priority**: Consistency — all four RDFS built-in annotation properties should follow the same abbreviation rule. Writing full bracketed IRIs for `rdfs:comment` while abbreviating `rdfs:label` produces output that diverges from Protégé conventions and the user's expectations.

**Independent Test**: Open `test-ontologies/animals.omn`, add an `rdfs:comment` annotation to any class, save, and inspect the file — the written token must be `rdfs:comment`, not `<http://www.w3.org/2000/01/rdf-schema#comment>`. Repeat for `.ttl` and `.ofn` formats.

**Acceptance Scenarios**:

1. **Given** a class with no existing `rdfs:comment` annotation, **When** the user adds an `rdfs:comment` annotation and saves, **Then** the written OWL file contains the abbreviated token `rdfs:comment` (not the bracketed full IRI) in all three supported formats (`.omn`, `.ttl`, `.ofn`).
2. **Given** a class with an existing `rdfs:comment "..."` line in the file, **When** the user saves without changes, **Then** the line is preserved exactly — no rewrite to a bracketed form or any other change.
3. **Given** a class with an `rdfs:seeAlso` or `rdfs:isDefinedBy` annotation, **When** the user saves without changes, **Then** those annotations are preserved with their abbreviated token form.
4. **Given** a class where the in-memory model lists annotations in a different order than the file, **When** the user saves without changes, **Then** the operation remains a no-op (no diff), consistent with the idempotency guarantee already established for `rdfs:label`.

---

### User Story 2 - Round-trip fidelity for files with abbreviated RDFS tokens (Priority: P2)

An OWL file already on disk contains `rdfs:comment "..."` lines (written by Protégé or another tool). When the extension parses and then re-syncs that file, the abbreviated tokens are recognised during parsing and reproduced as abbreviated tokens on write — not converted to bracketed IRIs.

**Why this priority**: Without correct round-trip handling, the first save after opening a Protégé-authored file would rewrite every `rdfs:comment` line, polluting git history — the same class of bug that motivated the previous fix.

**Independent Test**: Open a Protégé-authored file containing `rdfs:comment`, trigger a no-op save, run `git diff` — the diff must be empty.

**Acceptance Scenarios**:

1. **Given** a file containing `rdfs:comment "text"@en`, **When** the extension opens and saves without edits, **Then** `git diff` is empty.
2. **Given** a file containing a mix of `rdfs:label`, `rdfs:comment`, and `rdfs:seeAlso` annotations, **When** the user adds one new annotation, **Then** only the new annotation line appears in `git diff`; all existing abbreviated-token lines are untouched.

---

### Edge Cases

- A file that uses the full bracketed form `<http://www.w3.org/2000/01/rdf-schema#comment>` (not abbreviated): the extension must still parse it correctly and, on write, produce the abbreviated `rdfs:comment` token (normalising to the canonical abbreviated form).
- A file where the `rdfs:` prefix is not declared in the prefix map: the extension must still produce the correct abbreviated token (the RDFS prefix is a well-known constant, not user-declared).
- An annotation property whose IRI starts with the RDFS namespace but is not one of the four built-in annotation properties (hypothetical): it must continue to be written as a full bracketed IRI, not abbreviated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The write path MUST produce the abbreviated token `rdfs:comment`, `rdfs:seeAlso`, or `rdfs:isDefinedBy` whenever writing an annotation with the corresponding RDFS property IRI — in all three OWL file formats (`.omn`, `.ttl`, `.ofn`).
- **FR-002**: The read/parse path MUST recognise abbreviated tokens `rdfs:comment`, `rdfs:seeAlso`, and `rdfs:isDefinedBy` and resolve them to the full RDFS IRI, in the same way `rdfs:label` is already resolved.
- **FR-003**: A no-op save on a file that already contains abbreviated RDFS tokens MUST remain a no-op — producing no file modification.
- **FR-004**: The scope of abbreviation MUST be limited to the four RDFS built-in annotation property IRIs (`rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy`). Other RDFS vocabulary (e.g., `rdfs:subClassOf`, `rdfs:domain`, `rdfs:range`) MUST continue to be written in full bracketed form.
- **FR-005**: The existing idempotency guarantee for `rdfs:label` MUST be preserved without regression.

### Key Entities

- **RDFS annotation property IRI**: One of `http://www.w3.org/2000/01/rdf-schema#{label,comment,seeAlso,isDefinedBy}` — the four properties already listed in `BUILTIN_ANNOTATION_PROP_IRIS`.
- **Abbreviated token**: The short `rdfs:<localName>` form written into and recognised from OWL files instead of the full `<http://...>` bracketed form.
- **IRI abbreviation rule**: The mapping from a full RDFS IRI to its abbreviated token; currently only covers `rdfs:label`, to be extended to cover all four RDFS annotation properties.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing sync tests continue to pass with zero regressions after the change.
- **SC-002**: New tests confirm that adding an `rdfs:comment`, `rdfs:seeAlso`, or `rdfs:isDefinedBy` annotation writes the abbreviated token in each of the three supported file formats.
- **SC-003**: New tests confirm that a no-op save on a file already containing abbreviated `rdfs:comment`, `rdfs:seeAlso`, or `rdfs:isDefinedBy` tokens produces zero file changes.
- **SC-004**: A no-op scan of `test-ontologies/anatomy.owl` (302k lines) completes in under 500 ms after the change, confirming no performance regression.
- **SC-005**: Zero TypeScript type errors after the change.

## Assumptions

- The four RDFS annotation properties to abbreviate are exactly those already declared in `BUILTIN_ANNOTATION_PROP_IRIS`: `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, `rdfs:isDefinedBy`. No other RDFS vocabulary is in scope.
- The `rdfs:` prefix (`http://www.w3.org/2000/01/rdf-schema#`) is a well-known constant and does not need to be declared in the ontology's prefix map to be used in output.
- The serializer (`FunctionalSerializer.ts`) has an analogous single-property abbreviation; it will be updated alongside the sync layer for consistency, but the sync layer is the primary change target.
- No changes to the OWL parser layer (format parsers) are needed: existing parsers already resolve abbreviated tokens via prefix maps that include `rdfs:`.
- The fix is narrowly scoped to `abbreviateIri` (and symmetric recognition in annotation-line parsers) in `AnnotationSync.ts`, `AxiomSync.ts`, and `FunctionalSerializer.ts`. No model or index changes are required.
