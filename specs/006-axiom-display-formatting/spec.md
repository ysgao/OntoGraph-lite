# Feature Specification: Axiom Expression Display Formatting

**Feature Branch**: `006-axiom-display-formatting`  
**Created**: 2026-05-16  
**Status**: Draft  
**Input**: User description: "Improve the display of axiom expressions in Entity Editor and DL Query panels. The logical axioms, subclassOf expressions, equivalent classes expressions, GCI expressions and query class expressions in Manchester syntax are all displayed as a single line. Improve the display and entry by automatically start a new line at the key word 'and'. These are only display feature and they should not change the semantics or format in the OWL document. The format should be ignored when the changes to axiom are synchronised to the OWL document or parsed for classifications."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Complex Conjunctive Axioms Without Scrolling (Priority: P1)

An ontology author opens the Entity Editor and views a class with a complex definition containing multiple conjuncts joined by `and`. Currently the entire expression appears on a single line, forcing horizontal scrolling to read it. With this feature, each conjunct starts on a new line, making the full expression readable at a glance.

**Why this priority**: Reading and reviewing complex axioms is the most frequent activity in the Entity Editor. Long conjunctive expressions with 4+ conjuncts are common in biomedical ontologies (e.g. SNOMED CT). This improvement delivers immediate readability value with no editing required.

**Independent Test**: Open `test-ontologies/animals.omn` or any ontology with a multi-conjunct `SubClassOf` or `EquivalentClasses` axiom, navigate to the Entity Editor for that class, and confirm the expression spans multiple lines with each `and` keyword beginning a new line.

**Acceptance Scenarios**:

1. **Given** a class with a SubClassOf axiom `hasRole some TreatmentRole and hasLocation some Lung and hasCause some Infection`, **When** the Entity Editor displays the axiom, **Then** the display shows each conjunct on its own line with `and` at the start of the continuation lines.
2. **Given** a class with an EquivalentClasses axiom containing three or more conjuncts, **When** the user views it in the Entity Editor, **Then** the expression wraps at every `and` keyword and no horizontal scrolling is needed to read the full expression.
3. **Given** a class with a short axiom containing only one `and`, **When** the user views it, **Then** the expression still breaks at that `and` (single-break is acceptable and consistent).

---

### User Story 2 - Edit Multi-Line Axiom and Save Without Corruption (Priority: P1)

An ontology author edits a multi-line formatted axiom in the Entity Editor, modifying or extending a conjunctive expression. When they save the change, the OWL document receives the axiom in its original single-line Manchester syntax form — the visual line breaks are not written to the file.

**Why this priority**: Correctness of round-trip editing is critical. If display formatting accidentally alters the stored axiom, it would corrupt the ontology. This story must pass alongside Story 1 before the feature is considered shippable.

**Independent Test**: Edit a conjunctive axiom in the Entity Editor, confirm the saved OWL file contains the axiom as a single logical line with no injected newlines, and confirm the ontology re-opens identically.

**Acceptance Scenarios**:

1. **Given** a formatted multi-line axiom displayed in the Entity Editor, **When** the user saves without making changes, **Then** the OWL document is byte-for-byte identical to before the save.
2. **Given** a formatted multi-line axiom, **When** the user appends a new conjunct (e.g. `and hasStatus some Active`) and saves, **Then** the OWL document contains the complete single-line axiom with the new conjunct included, with no injected newline characters.
3. **Given** the OWL file after saving, **When** the file is re-opened in the tool or in Protégé, **Then** the axiom parses and displays correctly with no semantic change.

---

### User Story 3 - Write and Read DL Queries with Formatted Expressions (Priority: P2)

An ontology author types a DL Query expression in the DL Query panel that includes one or more `and` keywords. The expression is auto-formatted to show each conjunct on a new line as they type. When the query is submitted for execution, the reasoner receives the expression in single-line form.

**Why this priority**: DL Query expressions can be as complex as class axioms. Formatting helps users review the query before submitting. However, the DL Query panel is less critical than the Entity Editor since it does not write to the OWL document.

**Independent Test**: Type `hasRole some Doctor and hasLocation some Hospital` in the DL Query input, verify the display breaks at `and`, submit the query, and verify the reasoner returns correct results identical to submitting the expression as a single line.

**Acceptance Scenarios**:

1. **Given** the DL Query panel is open, **When** the user types `A and B` in the query input, **Then** the input display shows `A` on line 1 and `and B` on line 2.
2. **Given** a multi-line formatted query expression, **When** the user submits the query, **Then** the expression sent to the reasoner is the single-line form and returns results consistent with that expression.
3. **Given** a query expression where `and` appears inside an IRI or quoted string (e.g. `"bread and butter"`), **When** the panel formats the expression, **Then** the `and` inside the string does NOT cause a line break.

---

### Edge Cases

- What happens when `and` appears inside a quoted annotation value or within an IRI (e.g. `<http://example.org/land>`)? The formatting must not split at those occurrences.
- What happens when an axiom expression contains only a single class name with no `and`? The expression displays unchanged on one line.
- What happens when an axiom expression is empty or blank? No formatting is applied; the empty state is preserved.
- What happens when `and` appears at the very start or end of an expression (malformed input)? The formatter applies the break rule consistently without crashing; the underlying expression is preserved as-is for synchronisation.
- What happens when nested parenthesised sub-expressions contain `and` (e.g. `(A and B) or (C and D)`)? The `and` inside parentheses still causes a line break in display.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The display layer MUST insert a visual line break immediately before each top-level and nested `and` keyword in Manchester syntax expressions shown in the Entity Editor panel.
- **FR-002**: The display layer MUST insert a visual line break immediately before each `and` keyword in Manchester syntax expressions shown in the DL Query panel input and results.
- **FR-003**: The display layer MUST NOT break at `and` tokens that appear inside quoted string literals or within IRI brackets (`<…>`).
- **FR-004**: The display formatting MUST be applied to all expression contexts: SubClassOf, EquivalentClasses, DisjointClasses, GCI (General Concept Inclusion) axioms, and DL Query class expressions.
- **FR-005**: When the user saves or synchronises an axiom change to the OWL document, the system MUST strip display-only line breaks and write the expression as a single logical line in Manchester syntax.
- **FR-006**: When the system passes expressions to the reasoner for classification or DL Query execution, the single-line form MUST be used; display formatting MUST be transparent to the reasoner.
- **FR-007**: The display formatting MUST NOT alter the logical semantics of any axiom expression — the set of inferred facts after loading the saved ontology MUST be identical to the set before this feature is enabled.
- **FR-008**: Continuation lines after a line break MUST be visually indented relative to the start of the expression to indicate they are part of the same axiom.

### Key Entities

- **Manchester Syntax Expression**: A string representation of an OWL class expression or axiom in Manchester OWL Syntax, containing zero or more `and` keywords as conjunction operators.
- **Display Formatter**: The component responsible for transforming a single-line expression into a multi-line display representation. It is the only component that applies or reads formatting line breaks.
- **Axiom Synchroniser**: The component that writes axiom changes back to the OWL document. It receives expressions from the editor and MUST strip formatting before writing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A conjunctive axiom with 4 or more `and`-separated conjuncts is fully readable in the Entity Editor without horizontal scrolling, verified in a standard 1280 px wide window.
- **SC-002**: After editing and saving a formatted axiom, the OWL document contains zero injected newline characters inside any axiom expression — verified by diff against the pre-edit file.
- **SC-003**: Classification results (inferred class hierarchy) are identical before and after the display formatting feature is enabled, verified against the `test-ontologies/animals.omn` test suite.
- **SC-004**: DL Query results for a given conjunctive expression are identical whether the expression is entered as a single line or in formatted multi-line form.
- **SC-005**: `and` tokens inside IRIs or quoted strings do not produce unwanted line breaks in 100% of test cases covering those patterns.

## Assumptions

- The feature targets only the `and` keyword as the line-break trigger. Other Manchester keywords (`or`, `not`, `some`, `only`, `value`, etc.) are out of scope for line-breaking in this version.
- The indentation applied to continuation lines is a fixed visual offset (e.g. 2–4 spaces or equivalent); adaptive or semantic indentation is out of scope.
- The feature applies to read/display mode and inline edit mode in the Entity Editor. It does not change how axioms are stored in the `OntologyModel` in memory — the in-memory representation remains a single string.
- The DL Query panel formats the expression as the user types (live formatting), which is consistent with existing CodeMirror-based editor behaviour in that panel.
- No new OWL document format is introduced; the `.ofn`, `.omn`, `.ttl`, and `.owl` serialisers remain unchanged.
- Users are ontology authors familiar with Manchester syntax who will recognise the multi-line display as a formatting aid rather than a structural change.
