# Feature Specification: Manchester Syntax Attribute Sorting

**Feature Branch**: `023-manchester-sort-attributes`

**Created**: 2026-07-01

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-sort on Save (Priority: P1)

An ontology author editing a class expression in the Entity Editor types or pastes a Manchester syntax expression whose `and`-conjoined attributes are out of the canonical order. When they save, the expression is rewritten with attributes sorted into the prescribed order before being written to disk.

**Why this priority**: Enforcing a consistent attribute order on every save eliminates manual re-ordering, makes diffs cleaner, and ensures expressions conform to the project's canonical form without any extra user action.

**Independent Test**: Open a class whose SubClassOf expression contains `and`-conjoined role fillers in a non-canonical order, save, and verify the saved file has them sorted correctly. Delivers consistent, auditable expressions independently of any other feature.

**Acceptance Scenarios**:

1. **Given** a class expression `Material anatomical entity and regional part of some entire skin and constitutional part of some entire upper limb and laterality some side`, **When** the user saves the entity, **Then** the stored expression reads `Material anatomical entity and constitutional part of some entire upper limb and regional part of some entire skin and laterality some side`.
2. **Given** an expression whose attributes are already in canonical order, **When** saved, **Then** the expression is unchanged.
3. **Given** an expression containing only the named class (no `and` clauses), **When** saved, **Then** the expression is unchanged.
4. **Given** an expression with a `and` clause whose role name does not appear in the canonical list, **When** saved, **Then** unrecognised attributes are placed after all other known attributes but before `laterality`, preserving their relative order among themselves.
5. **Given** an expression where `laterality` appears before any other attribute, **When** saved, **Then** `laterality` is moved to the last position.

---

### User Story 2 - Sort Preserved Across Display Formatting (Priority: P2)

After sorting, the display formatting (newline + 4-space indent before each `and`) is applied to the sorted expression so the editor view is also in canonical order.

**Why this priority**: The display layer and the save layer both pass through `ManchesterFormatting.ts`; sorting must compose correctly with display formatting so what the user sees after save matches what is stored.

**Independent Test**: Save an out-of-order expression, observe the editor reloads with the sorted, formatted expression. The visual presentation matches the on-disk content.

**Acceptance Scenarios**:

1. **Given** a multi-attribute expression saved in non-canonical order, **When** the entity editor reloads after save, **Then** each `and` clause appears on its own indented line in canonical attribute order.
2. **Given** an expression containing an IRI (`<http://…>`) or quoted string inside an attribute filler, **When** sorted, **Then** the content inside brackets and quotes is treated as opaque and is not re-ordered internally.

---

### User Story 3 - Canonical Order is Configurable (Priority: P3)

The canonical attribute order is defined in one place in the codebase so it can be updated without touching sorting logic.

**Why this priority**: The prescribed order (All or part of → Proper part of → Constitutional part of → Regional part of → Lateral half of → Systemic part of → laterality) reflects a domain convention that may evolve. Centralising it reduces future maintenance cost.

**Independent Test**: Change the order array and verify that a re-sort produces output matching the new order. No changes to sorting logic required.

**Acceptance Scenarios**:

1. **Given** the canonical order list is updated to swap two entries, **When** an expression is saved, **Then** the new order is reflected in the output.

---

### Edge Cases

- What happens when the same attribute appears more than once in an expression (duplicate `and` clause)? — Both occurrences are sorted to the same position; their relative order is preserved.
- How does sorting handle nested class expressions (e.g., `and constitutional part of (some X and some Y)`)? — The sort operates only on the top-level `and`-separated conjuncts; nested expressions inside parentheses are treated as opaque.
- What happens when an expression contains `or` or `not` at the top level? — Sorting is only applied when the expression is a flat conjunction of `and` clauses with no top-level `or`/`not`; mixed operators are left unchanged.
- What happens when `and` appears inside an IRI or quoted label? — The existing lexer in `ManchesterFormatting.ts` already skips `and` inside `<…>`, `"…"`, and `'…'`; sorting respects the same boundaries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST sort the `and`-conjoined attribute clauses of a Manchester syntax class expression into the canonical order before writing the expression to disk.
- **FR-002**: The canonical attribute order MUST be: All or part of, Proper part of, Constitutional part of, Regional part of, Lateral half of, Systemic part of, laterality (case-insensitive role-name prefix match). `laterality` MUST always be the final conjunct in a sorted expression.
- **FR-003**: Attributes whose role names do not match any canonical entry MUST be placed after all other recognised attributes but immediately before `laterality`, preserving their original relative order among themselves.
- **FR-004**: Sorting MUST operate only on top-level `and`-conjoined conjuncts; conjuncts inside parentheses, `or` expressions, or `not` expressions MUST be left unchanged.
- **FR-005**: The sort function MUST treat content inside IRI brackets (`<…>`), double-quoted strings (`"…"`), and single-quoted labels (`'…'`) as opaque, consistent with the existing lexer in `ManchesterFormatting.ts`.
- **FR-006**: When the expression is already in canonical order, the sorted output MUST be byte-identical to the input, ensuring no net change in file content on disk.
- **FR-007**: The sorting logic MUST be exposed as a named export from `src/utils/ManchesterFormatting.ts` so it can be unit-tested independently.
- **FR-008**: The sort MUST be applied at the point where the expression is assembled for saving, before display formatting is applied for the editor view.

### Key Entities

- **Conjunct**: A single `and`-separated clause at the top level of a Manchester class expression, e.g. `constitutional part of some entire upper limb`.
- **Role prefix**: The leading role-name token(s) of a conjunct used to determine its canonical position (e.g., `constitutional part of`, `laterality`).
- **Canonical order list**: The ordered sequence of role prefixes that defines the prescribed sort order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of saved class expressions whose top-level conjuncts contain only recognised canonical attributes are stored in canonical order.
- **SC-002**: Expressions already in canonical order are written to disk byte-for-byte identical to their pre-save form (no spurious edits).
- **SC-003**: All existing `ManchesterFormatting.ts` unit tests continue to pass after the sorting logic is added.
- **SC-004**: New unit tests cover: already-sorted input, reverse-sorted input, mixed known/unknown attributes (unknowns placed before `laterality`), `laterality`-first input moved to last position, expressions with no `and` clauses, and expressions with nested parentheses — achieving ≥ 95% branch coverage for the sort function.
- **SC-005**: Expressions with content inside IRI brackets or quoted strings are sorted without corrupting the bracketed/quoted content.

## Assumptions

- The sort is applied only to class expressions authored or edited via the Entity Editor; expressions in files that are never opened for editing are not retroactively re-sorted.
- Role-name matching for the canonical order uses a case-insensitive prefix match on the leading tokens of each conjunct (e.g., `constitutional part of` matches regardless of capitalisation).
- The feature targets Manchester Syntax expressions only; OWL Functional Syntax (`SubClassOf`, `EquivalentClasses`) axioms stored in `.ofn` files are out of scope.
- The named-class head of an expression (e.g., `Material anatomical entity`) is always the first conjunct and is never reordered; only the remaining `and`-joined attribute clauses are sorted.
- Expressions containing top-level `or`, `not`, or other non-`and` connectives are left unchanged by the sort.
- The canonical order list is a static compile-time constant; no user-facing configuration UI is required for this feature.
