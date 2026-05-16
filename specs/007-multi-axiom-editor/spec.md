# Feature Specification: Multi-Axiom Expression Editor

**Feature Branch**: `007-multi-axiom-editor`  
**Created**: 2026-05-16  
**Status**: Draft  
**Input**: User description: "Display and add multiple subclassof, equivalentclasses, and GCI axioms. The axiom expression was displayed in a single line in the past. However, the improved display uses multiple lines for readability. Then, how the multiple axiom expressions should be displayed and entered?"

## Background

Feature 006 improved the display of individual axiom expressions by formatting conjunctive expressions across multiple indented lines. A class with a SubClassOf axiom `hasRole some Doctor and hasLocation some Lung` now displays as:

```
hasRole some Doctor
    and hasLocation some Lung
```

This introduced an ambiguity when a section contains **more than one** axiom expression: because each expression may now span several lines, it is no longer obvious where one axiom ends and the next begins. Additionally, there is currently no explicit action for adding a new axiom expression to a section. This feature resolves both issues.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Multiple Axiom Expressions Without Confusion (Priority: P1)

An ontology author opens the Entity Editor for a class that has two or more SubClassOf (or EquivalentClasses, or GCI) axiom expressions. With feature 006 active, each expression may span multiple lines. Without visual separators, the section looks like one long block of text and the author cannot tell where one axiom ends and the next begins.

With this feature, each axiom expression is visually bounded: a clear separator between consecutive axiom expressions lets the author identify them individually at a glance.

**Why this priority**: Misreading a section with multiple axioms is a data-quality risk — an author could edit what they believe is one axiom but inadvertently affect a neighbour. Clarity here is prerequisite to safe editing.

**Independent Test**: Open any ontology class with two or more SubClassOf expressions in the Entity Editor and confirm each expression is visually distinct from the next — the boundary is unambiguous even when both expressions contain `and` and span multiple display lines.

**Acceptance Scenarios**:

1. **Given** a class with two SubClassOf axioms `hasRole some Doctor and hasLocation some Lung` and `hasCause some Infection`, **When** the Entity Editor loads the class, **Then** the SubClassOf section shows both axioms separated by a visible boundary, and the author can immediately see that there are two distinct expressions.
2. **Given** a class with a single EquivalentClasses axiom, **When** the Entity Editor loads it, **Then** the section looks identical to today — no separator appears when there is nothing to separate.
3. **Given** a class with three GCI axioms, **When** the Entity Editor displays them, **Then** there are two visible separators, and all three expressions are independently readable.

---

### User Story 2 - Add a New Axiom Expression to a Section (Priority: P1)

An ontology author wants to assert a new SubClassOf relationship for a class that already has one or more existing SubClassOf expressions. Currently there is no labelled action to add a new expression; the author must manually navigate to the end of the editor and type a new line, which is error-prone when the section already contains multi-line formatted expressions.

With this feature, each expression section has an explicit "Add expression" action. Activating it opens a new, empty expression input at the bottom of the section, ready for the author to type a Manchester class expression.

**Why this priority**: Adding axioms is a frequent authoring action. Without a clear entry point, authors may accidentally append text to an existing axiom rather than start a new one, silently corrupting the ontology.

**Independent Test**: Open the Entity Editor for any class, activate "Add SubClassOf expression", type a valid Manchester expression (e.g. `hasAge min 18`), save, and confirm the OWL document contains a new SubClassOf axiom for that class alongside the pre-existing ones.

**Acceptance Scenarios**:

1. **Given** a class with one existing SubClassOf expression, **When** the author activates "Add SubClassOf expression", **Then** a new blank expression input appears below the existing one, focused and ready for typing, visually separated from the existing expression.
2. **Given** the author has typed a new expression and saved, **Then** the OWL document contains both the original and the new SubClassOf axiom for that class; neither is altered.
3. **Given** the author activates "Add expression" but leaves the new input blank and saves, **Then** no new axiom is written to the OWL document and the existing axioms are unchanged.
4. **Given** a class with no existing EquivalentClasses axioms, **When** the author activates "Add EquivalentClasses expression" and types a valid expression, **Then** the OWL document gains a new EquivalentClasses axiom for that class.

---

### User Story 3 - Remove an Existing Axiom Expression (Priority: P2)

An ontology author needs to retract a SubClassOf (or EquivalentClasses, or GCI) axiom from a class. With multiple expressions displayed in the section, the author should be able to identify and remove a specific axiom without affecting the others.

**Why this priority**: Removal is less frequent than reading or adding. A workaround (clear the expression content and save) exists today, so this story is lower priority than display clarity and adding.

**Independent Test**: Open the Entity Editor for a class with two SubClassOf axioms. Remove one of them. Save. Confirm the OWL document retains exactly the one remaining SubClassOf axiom and does not contain the removed one.

**Acceptance Scenarios**:

1. **Given** a class with two SubClassOf axioms, **When** the author removes one and saves, **Then** the OWL document contains exactly one SubClassOf axiom for that class — the retained one.
2. **Given** a class with one SubClassOf axiom, **When** the author removes it and saves, **Then** the OWL document contains no SubClassOf axiom for that class.
3. **Given** the author removes an axiom but navigates away without saving, **Then** the OWL document is unchanged.

---

### Edge Cases

- What happens when the author types `and` at the start of what they intend as a new axiom (e.g., `and hasAge min 18`)? Because the continuation-line rule attaches lines beginning with `and ` to the previous axiom, this would silently merge with the previous expression. The expected behaviour should be documented clearly (either warn the user, or treat it as a continuation as today).
- What happens when all expressions in a section are removed? The section header and "Add expression" action remain visible so the author can add expressions again.
- What happens when an added expression contains invalid Manchester syntax? Existing linter markers provide inline error feedback; no additional behaviour is required.
- What happens when a class has a large number of axioms (20+ SubClassOf expressions)? The section must scroll without truncating or hiding expressions.
- What happens if the author pastes a block containing several expressions separated by blank lines into a new expression input? Each blank-line-delimited segment should be treated as a separate axiom, consistent with the existing parsing model.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Entity Editor MUST render a visible separator between consecutive axiom expressions within a section when two or more expressions are present.
- **FR-002**: The separator MUST be visually distinguishable from the indented continuation lines used inside a formatted multi-line expression (the `    and …` lines introduced by feature 006), so that expression boundaries are unambiguous.
- **FR-003**: Each expression section (SubClassOf, EquivalentClasses, GCI) MUST provide an explicit "Add expression" action that creates a new, focused, empty entry at the bottom of that section.
- **FR-004**: When the author saves after typing a new expression, the OWL document MUST contain a new axiom of the corresponding type for that entity.
- **FR-005**: When the author saves after leaving a newly added expression blank, no new axiom MUST be written — the blank entry is silently discarded.
- **FR-006**: Each axiom expression entry MUST provide a way to remove it. After removal and save, the OWL document MUST no longer contain that axiom for the entity.
- **FR-007**: Removing one axiom expression MUST NOT alter any other axiom in the same section.
- **FR-008**: The OWL document MUST NOT receive display-only artefacts (separator characters, extra blank lines) when changes are saved — serialised axioms MUST match what the author entered semantically.
- **FR-009**: All three section types (SubClassOf, EquivalentClasses, GCI) MUST support the display separators, "Add expression" action, and remove behaviour described above.

### Key Entities

- **Axiom Expression Section**: A named group within the Entity Editor (SubClassOf, EquivalentClasses, GCI) that holds zero or more axiom expression entries.
- **Axiom Expression Entry**: A single Manchester class expression belonging to one section. It may span multiple display lines due to feature-006 formatting but is a single logical unit in the OWL document.
- **Expression Separator**: A visual element rendered between consecutive entries in a section. It exists only in the display layer and is never written to the OWL document.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An ontology author correctly identifies the count of distinct axiom expressions in a section containing 3 or more multi-line formatted expressions on first view, with zero miscounts.
- **SC-002**: Adding a new axiom expression to a class takes under 10 seconds from activating "Add expression" to completing the save action.
- **SC-003**: After adding or removing expressions and saving, the OWL document diff contains only the expected axiom additions or deletions — zero unintended modifications to other axioms and zero display artefacts.
- **SC-004**: The "Add expression" action is found without instruction in user testing — target: 100% of sessions.
- **SC-005**: An ontology file edited via this feature (add, remove, re-open) produces an identical inferred class hierarchy to the same file edited in Protégé for the same changes.

---

## Assumptions

- The feature targets the Entity Editor panel only. The DL Query panel uses a single-expression editor and is out of scope.
- The `collectLogicalLines` parsing model (blank lines skipped, lines beginning with `and ` are continuation lines) is retained as-is. Blank lines serve as the axiom separator boundary; the feature relies on this being visually distinct from the `    and ` continuation indent.
- Reordering axiom expressions within a section is out of scope for this version.
- Copying or duplicating an axiom expression is out of scope.
- Keyboard shortcut for "Add expression" (e.g. Alt+Enter or similar) may be added but is not required for the initial version.
- Users are ontology authors familiar with Manchester syntax; no guided expression builder is needed.
- The three section types (SubClassOf, EquivalentClasses, GCI) receive identical treatment — no section is handled differently from the others.
