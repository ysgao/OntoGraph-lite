# Feature Specification: Autodetect OWL Syntax for .owl Files

**Feature Branch**: `011-autodetect-owl-syntax`  
**Created**: 2026-05-27  
**Status**: Draft  
**Input**: User description: "Autodetect OWL syntax and do not rely on extension of files. For example, .owl should not be treated as OWL/XML — this failed parsing a Functional Syntax OWL file with the .owl extension. Other syntaxes can also have the .owl extension. Hence, files with .owl extension should always have their syntax detected by content."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Functional Syntax File with .owl Extension (Priority: P1)

A user has an OWL ontology file saved as `myOntology.owl` that contains OWL Functional Syntax. The `Ontology(` keyword appears in the file content, possibly preceded by `Prefix(` declarations. The user opens this file in VS Code and expects the ontology to load correctly.

Currently this fails because the `.owl` extension causes the file to be routed unconditionally to the OWL/XML parser, which cannot handle Functional Syntax content.

**Why this priority**: Live bug — prevents users from opening valid OWL files.

**Independent Test**: Open `test-ontologies/bfo-core.ofn` renamed to `bfo-core.owl` — OntoGraph must load the full class hierarchy without error.

**Acceptance Scenarios**:

1. **Given** a valid OWL Functional Syntax file with a `.owl` extension, **When** the user opens it in VS Code, **Then** OntoGraph loads the ontology correctly and displays the class hierarchy.
2. **Given** a Functional Syntax `.owl` file where `Ontology(` appears after multiple `Prefix(` declarations, **When** parsed, **Then** detection still succeeds and the ontology loads correctly.
3. **Given** a Functional Syntax `.owl` file, **When** parsed, **Then** the detected format is recorded as `functional` so subsequent save operations use Functional Syntax serialisation.

---

### User Story 2 - Open Manchester or Turtle File with .owl Extension (Priority: P2)

A user has a Manchester Syntax or Turtle file saved with a `.owl` extension. The user expects OntoGraph to detect the correct syntax and load the ontology rather than failing with an OWL/XML parse error.

**Why this priority**: The `.owl` extension is used across all OWL serialisation formats in the wild. After fixing Functional Syntax, all other formats must also be handled.

**Independent Test**: Open `test-ontologies/animals.omn` renamed to `animals.owl` — OntoGraph must load the ontology without error.

**Acceptance Scenarios**:

1. **Given** a valid Manchester Syntax file with a `.owl` extension, **When** the user opens it in VS Code, **Then** OntoGraph loads the ontology correctly.
2. **Given** a valid Turtle file with a `.owl` extension, **When** the user opens it in VS Code, **Then** OntoGraph loads the ontology correctly.
3. **Given** a valid RDF/XML file with a `.owl` extension (the most common Protégé output format), **When** the user opens it in VS Code, **Then** OntoGraph loads the ontology correctly.

---

### User Story 3 - Clear Error for Unrecognisable .owl File (Priority: P3)

A user opens a `.owl` file whose content does not match any supported OWL syntax. The user expects a clear, human-readable error message rather than a cryptic parser failure.

**Why this priority**: Good error messaging completes the feature.

**Independent Test**: Attempt to open a plain-text file renamed with `.owl` extension — an informative error notification appears.

**Acceptance Scenarios**:

1. **Given** a `.owl` file whose content does not match any supported OWL syntax, **When** the user opens it, **Then** a notification displays explaining that the OWL syntax could not be detected from the file content, and no partial or corrupt model is loaded.

---

### Edge Cases

- What happens when a `.owl` file has a UTF-8 BOM (U+FEFF) before the first meaningful token? Detection must strip the BOM and still succeed.
- What happens when an XML-based `.owl` file starts with `<?xml ...?>` and/or XML comments before the root element? Detection must scan past them.
- What happens when a `.owl` file is empty or contains only whitespace? A clear error must be surfaced, not a crash.
- What happens when a very large `.owl` file (above the large-file threshold) is opened? Content detection must operate on an initial slice of the file before dispatching to the worker thread.
- What happens with `.ofn`, `.omn`, `.ttl`, `.owx` files? They must continue to work exactly as before — content detection is not applied to these extensions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When opening any file with the `.owl` extension, the system MUST detect the OWL serialisation syntax from file content rather than assuming OWL/XML.
- **FR-002**: Content-based detection for `.owl` files MUST correctly identify all five supported serialisation formats: OWL Functional Syntax, Manchester Syntax, OWL/XML, RDF/XML, and Turtle/N-Triples.
- **FR-003**: The detection algorithm MUST follow this logic, applied to the first 4 KB of file content after stripping any leading BOM and whitespace:
  - If content starts with `<`: scan first 2 KB; detect as OWL/XML if `<Ontology` and `owl#` namespace are present; detect as RDF/XML if `<rdf:RDF` is present.
  - Otherwise: detect as OWL Functional Syntax if `Ontology(` appears in the first 4 KB; detect as Manchester Syntax if `Ontology:` appears in the first 2 KB; detect as Turtle if `@prefix`, `@base`, `PREFIX `, or `BASE ` appears in the first 1 KB.
- **FR-004**: Detection MUST succeed even when the file begins with a UTF-8 BOM, leading whitespace, an XML declaration (`<?xml ...?>`), or XML comments before the first meaningful token.
- **FR-005**: When content-based detection succeeds, the system MUST record the detected format on the loaded model so that subsequent save and serialisation operations use the correct syntax.
- **FR-006**: When content-based detection fails for a `.owl` file, the system MUST surface a clear, user-readable error message identifying the file name and stating that the OWL syntax could not be determined from the file content.
- **FR-007**: Files with unambiguous extensions (`.ofn`, `.omn`, `.ttl`, `.owx`) MUST continue to parse correctly and MUST NOT regress — content detection is not applied to these extensions.
- **FR-008**: Content detection MUST be applied for both the inline parse path (small files) and the worker-thread parse path (large files above the size threshold).

### Key Entities

- **OWL Serialisation Format**: One of five canonical OWL serialisation syntaxes — OWL Functional Syntax, Manchester Syntax, OWL/XML, RDF/XML, Turtle. Each has distinct textual fingerprints detectable from the first 4 KB of content.
- **Content Fingerprint**: Distinctive tokens within the opening content of a file that uniquely identify each format, per W3C specifications:
  - OWL Functional Syntax: `Ontology(` (scan 4 KB; may be preceded by `Prefix(` declarations)
  - Manchester Syntax: `Ontology:` — colon distinguishes from Functional Syntax's paren (scan 2 KB)
  - OWL/XML: `<Ontology` with `owl#` namespace present in opening content (scan 2 KB)
  - RDF/XML: `<rdf:RDF` (scan 2 KB)
  - Turtle: `@prefix`, `@base`, `PREFIX `, or `BASE ` (scan 1 KB)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any valid OWL file with a `.owl` extension opens without error in OntoGraph, provided its content is a supported OWL serialisation format.
- **SC-002**: All five supported OWL serialisation formats are correctly identified by content detection for `.owl` files, with zero misclassifications across the existing test ontology suite (`animals.omn`, `animals.owx`, `animals.ttl`, `bfo-core.ofn`, `pizza.owl`).
- **SC-003**: Files with unambiguous extensions (`.ofn`, `.omn`, `.ttl`, `.owx`) continue to parse successfully — zero regressions in the existing test suite.
- **SC-004**: Content detection for `.owl` files adds no perceptible delay to file open time; inspecting at most the first 4 KB is sufficient for all format fingerprints.
- **SC-005**: When a `.owl` file's content is unrecognisable, a notification is shown to the user within 2 seconds of the open attempt, with a message that names the file and describes the problem in plain language.

## Assumptions

- The first 4 KB of any valid OWL file is sufficient to locate `Ontology(` even when preceded by multiple `Prefix(` declarations.
- `Ontology(` and `Ontology:` are unique and reliable fingerprints for OWL Functional Syntax and Manchester Syntax respectively; no other supported format uses either token.
- XML-based formats (OWL/XML, RDF/XML) are unambiguously identified by their root element tag (`<Ontology` with `owl#` namespace vs `<rdf:RDF`).
- Turtle files that open directly with a triple statement (no `@prefix`/`@base` directive) and that also have a `.owl` extension are considered out of scope; such files are extremely uncommon in practice.
- Files with `.ofn`, `.omn`, `.ttl`, and `.owx` extensions are assumed to reliably indicate their format; content detection is out of scope for these extensions.
- The VS Code language association for `.owl` → `owl-xml` cannot be removed without breaking VS Code syntax highlighting; the fix is applied in the parser dispatch layer, not by removing the language association.
