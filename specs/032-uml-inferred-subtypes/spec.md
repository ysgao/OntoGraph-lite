# Feature Specification: Include Inferred Subtypes in UML Diagram Scope

**Feature Branch**: `032-uml-inferred-subtypes`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "When an entity is selected, all its subtypes should be in scope for inclusion in the UML except lateralised as default exclusion. Furthermore, the structure concepts are excluded by using entire concepts without 'entire' in description. This works well now. However, the subtypes should include the inferred classes as well. This seems to be missing when generating the UML."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reasoner-inferred subtypes appear in the diagram (Priority: P1)

An ontology author has classified their ontology with the reasoner. Some subtype relationships only emerge from classification (e.g., a class is inferred to be a subtype of another because of an `EquivalentClasses` definition, not because a direct subtype axiom was written). The author right-clicks a class, generates a UML diagram (the "Stated" view, by default, identical to pre-feature behavior), then switches the view to "Inferred". They expect every subtype the reasoner concluded for the selected entity to become available in this separate view, not silently dropped — and expect the Stated view to remain exactly as it always was, never mixed with reasoner-derived data.

**Why this priority**: This is the core defect reported — the diagram was incomplete for any ontology that relies on classification to reveal part of its subtype hierarchy, undermining the diagram's basic promise of showing "all subtypes in scope" once the author opts in.

**Independent Test**: Classify an ontology containing at least one class whose subtype relationship to another class is established only through reasoning (no direct written subtype axiom). Generate a UML diagram rooted at the parent (Stated view, default), then switch to the Inferred view. Confirm the reasoner-only subtype appears as a node in the Inferred view, connected by a generalization relationship; confirm it is absent from the Stated view (both before and after the switch exists as an option).

**Acceptance Scenarios**:

1. **Given** an ontology has been classified and a class B is a reasoner-inferred (but not directly written) subtype of class A, **When** the user switches to the Inferred view for a diagram rooted at A, **Then** B appears in the diagram as a subtype of A.
2. **Given** the same setup but the view is "Stated" (the default), **When** the user generates a UML diagram rooted at A, **Then** B does NOT appear — Stated scope is directly-written subtypes only, identical to pre-feature behavior, and is never mixed with Inferred-view data.
3. **Given** a class C is both a directly-written subtype of A and independently confirmed by the reasoner, **When** the user views the Inferred diagram rooted at A, **Then** C appears exactly once (no duplicate node or duplicate relationship line).
4. **Given** the ontology has NOT been classified yet, **When** the user switches to the Inferred view, **Then** the diagram shows only the focus entity (no subtypes, no error) and switching itself does not trigger a classification run.

---

### User Story 2 - Distinguishing inferred-only relationships visually (Priority: P2)

An ontology author viewing a generated diagram wants to tell, at a glance, which subtype relationships are backed by an axiom they (or a collaborator) actually wrote versus ones that only the reasoner produced — the latter may reflect a modeling consequence worth double-checking.

**Why this priority**: Important for trust and correctness review, but the diagram is still useful without it — the P1 story alone already fixes the core "missing entities" defect.

**Independent Test**: Generate a diagram containing at least one reasoner-only subtype relationship alongside at least one directly-written one. Confirm the two are rendered with a visibly different line style, and that the distinction survives every export format the diagram supports (not only the interactive view).

**Acceptance Scenarios**:

1. **Given** a diagram contains a subtype relationship that exists only because of reasoning, **When** the diagram is displayed, **Then** that relationship line is visually distinguished from directly-written relationship lines.
2. **Given** the same diagram, **When** the user exports it to any of the supported file formats, **Then** the exported file preserves the same visual distinction.
3. **Given** a subtype relationship is both directly-written AND confirmed by the reasoner, **When** the diagram is displayed, **Then** it is rendered as a normal (directly-written-style) relationship, not as an inferred-only one.

---

### User Story 3 - The Inferred view excludes lateralized and "Entire X" noise by default, and simplifies structure labels (Priority: P1)

An ontology author switches to the Inferred view and expects it to be immediately useful, not cluttered: lateralized (left/right-specific) variants and "Entire X" continuant concepts — both typically noise in a pure is-a breakdown — should be hidden by default but revealable, and body-structure-style labels ("Kidney structure", "Structure of liver") should read as just the entity name.

**Why this priority**: Without this, the Inferred view (once it exists at all, per User Story 1) is markedly less usable than the Stated view it sits alongside — equal priority to the core fix since it directly determines whether the new view is actually usable day-to-day.

**Independent Test**: Classify an ontology where a reasoner-inferred subtype of the diagram's root is itself a lateralized variant, and another is an "Entire X" class. Switch to the Inferred view and confirm both are excluded by default, and can be revealed via the existing "show full subhierarchy" control. Confirm a class labeled "X structure" or "Structure of X" displays as just "X".

**Acceptance Scenarios**:

1. **Given** a reasoner-inferred subtype of the root is a lateralized (left/right) variant, **When** the Inferred view is generated with default settings, **Then** that subtype is excluded from the diagram by default.
2. **Given** a reasoner-inferred subtype of the root has a label starting with "Entire ", **When** the Inferred view is generated with default settings, **Then** that subtype is also excluded from the diagram by default.
3. **Given** the user reveals the default-hidden set (the existing "show full subhierarchy" control), **When** the diagram regenerates, **Then** both the previously-hidden lateralized AND "Entire X" subtypes now appear.
4. **Given** a class in the Inferred view is labeled "Kidney structure" or "Structure of kidney", **When** it is displayed, **Then** its label reads "Kidney".
5. **Given** the Stated view is showing a diagram with structural ("whole/entire") concept anchoring in effect for the root, **When** the user has never switched to the Inferred view, **Then** the Stated view's anchoring/labeling behavior is completely unaffected — this feature added no code path that touches it.

### Edge Cases

- What happens when the ontology has never been classified? The diagram must behave exactly as it does today — direct subtypes only — with no error, no forced classification, and no visual clutter implying missing data.
- What happens when a previously-classified ontology has been edited since classification (inferred data may be stale)? The diagram should use whatever inferred data is currently available on the model as-is; keeping that data fresh is an existing, separate concern (re-classification) not introduced or changed by this feature.
- What happens when a class has many reasoner-inferred subtypes, pushing the diagram past its existing node cap? The existing node-cap and "more relationships exist" indicator behavior applies uniformly to inferred and directly-written subtypes alike — no special-case cap just for inferred ones.
- What happens when the same subtype relationship is asserted through more than one path (e.g., both a direct subtype axiom and an equivalent-class-driven inference)? It must still appear as a single relationship line in the diagram, not one line per source.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a "Stated" view (the diagram exactly as it existed before this feature — directly-written axioms only) and, on request, a completely SEPARATE "Inferred" view — the two are never mixed into one diagram (revised in the second refinement; see Assumptions).
- **FR-002**: The system MUST NOT trigger ontology classification as a side effect of generating a UML diagram or of switching to the Inferred view; if the ontology has not been classified, the Inferred view shows only the focus entity (no subtypes), never an error.
- **FR-010**: The system MUST provide a dedicated, persistent Stated/Inferred switch control in the UML diagram view, defaulting to "Stated" for every fresh focus session. The control's state persists across depth/direction changes for the same focus entity (same convention as the existing lateralized-classes toggle) and resets to "Stated" when a different entity becomes the focus or the panel is closed and reopened.
- **FR-011**: The Inferred view's entity scope MUST be built entirely from the reasoner's classified hierarchy, rooted at the clicked entity itself — it MUST NOT perform the Stated view's "All or part of" anchor-hop to an "Entire X" continuant, since that mechanism is composition-flavored and does not apply to a pure is-a breakdown.
- **FR-012**: The Inferred view MUST show generalization (is-a) relationships only — it MUST NOT include composition ("part of") relationships in any form, regardless of the workspace's configured composition properties.
- **FR-013**: The Inferred view MUST default-exclude (revealable via the same control used for lateralized variants) both (a) lateralized (left/right-specific) variants, same rule as the Stated view, and (b) classes whose label begins with "Entire " — noise in a pure is-a breakdown that the Stated view instead anchors on/substitutes.
- **FR-014**: In the Inferred view, a class label matching "X structure" or "Structure of X" (case-insensitive) MUST display as just "X" (re-capitalized). This label rule applies ONLY to the Inferred view — the Stated view's existing "Entire X" label handling is unchanged.
- **FR-003**: The system MUST render a subtype relationship that has both a direct axiom AND a reasoner-confirmed inference as a single relationship line, using the same visual style as a purely directly-written relationship — never duplicated, never shown as inferred-only.
- **FR-004**: The system MUST visually distinguish, within the Inferred view, a subtype relationship that is reasoner-inferred only (no supporting direct axiom) from one that is also directly-written, in the interactive diagram view.
- **FR-005**: The system MUST preserve this same visual distinction across every file format the diagram can be exported to.
- **FR-006**: The Inferred view MUST apply its own default exclusion (FR-013) using the same node-exclusion mechanism (and the same reveal control) already used by the Stated view for lateralized variants.
- **FR-007**: The Stated view's existing structural ("whole/entire") concept anchoring and labeling behavior MUST remain completely unchanged by this feature — it is exclusively a Stated-view concept.
- **FR-008**: The system MUST continue to enforce the existing diagram size cap (maximum number of entities shown) and "more relationships exist" indication uniformly, in both views.
- **FR-009**: The Stated view MUST NOT produce a different or additional root/anchor resolution outcome as a result of this feature — it is completely untouched by the Inferred view's existence.

### Key Entities

- **Diagram Node**: A single class shown in the generated UML diagram. In the Inferred view, its displayed label may additionally be simplified per FR-014.
- **Generalization Relationship (diagram edge)**: A parent/subtype connection line. In the Inferred view only, carries an attribute distinguishing "reasoner-inferred only" from "also directly-written."
- **View Mode**: Which of the two mutually exclusive views (Stated/Inferred) is currently shown — session-scoped UI state, not a persisted setting (FR-010).
- **Classification State**: Whether the currently-open ontology has been classified by the reasoner; gates whether the Inferred view shows anything beyond the focus entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a classified ontology, 100% of a selected entity's subtypes — whether directly-written or reasoner-inferred — that fall within the diagram's existing depth and size limits are present in the generated diagram.
- **SC-002**: Users can visually identify, without opening any underlying file, which relationship lines in a diagram are reasoner-inferred-only versus directly-written, in the interactive view and in every exported file format.
- **SC-003**: No relationship that is both directly-written and reasoner-confirmed is ever rendered twice or double-counted toward the diagram's size cap.
- **SC-004**: For an unclassified ontology, diagram output is pixel-for-pixel/byte-for-byte identical to current behavior (no regression), confirming this feature is purely additive when inferred data is unavailable.
- **SC-005**: Existing lateralized-variant default-exclusion and structural anchoring behavior show no regressions (100% of existing passing tests covering this behavior continue to pass unmodified).

## Assumptions

- "Inferred subtypes" refers to the reasoner's classified parent→child class hierarchy already produced by the existing "classify" action, not a new or different reasoning capability — this feature only changes how that existing result is *used* when building a UML diagram.
- Classification, when stale relative to the ontology's current edits, is an existing, separately-handled concern; this feature consumes whatever classification result is currently attached to the ontology without judging its freshness.
- "Directly-written" subtype relationships include both plain subtype axioms and equivalent-class definitions that already contribute to today's diagram — the new behavior is additive on top of that existing set, not a replacement for any part of it.
- Visual distinction for inferred-only relationships means a distinct line style (e.g., dashed vs. solid), consistent with how the product's existing graph-visualization feature already distinguishes inferred from asserted relationships elsewhere in the product.
- **Revised during implementation (first refinement)**: the initial design made inferred-subtype inclusion automatic whenever the ontology was classified, with no user control. This was changed to an explicit, dedicated "Include inferred subtypes" tick-box, defaulting to unchecked/"stated".
- **Revised during implementation (second refinement, supersedes the first)**: the tick-box design ADDITIVELY merged inferred subtypes into the SAME diagram as stated ones (asserted data taking dedup priority). Based on further direct user feedback, this was changed again: Stated and Inferred are now two completely SEPARATE views (a switch, not a checkbox) — the Inferred view is built entirely from `model.inferredSubClasses` (never mixed with asserted-axiom traversal), is generalization-only (no composition/part-of at all), does not perform the Stated view's anchor-hop to "Entire X" (the clicked entity is always its own root), and default-excludes both lateralized variants AND "Entire X" classes as noise. A new, Inferred-view-only label rule ("X structure"/"Structure of X" → "X") was added since most SNOMED body-structure hierarchy entries are named this way. The Stated view is completely unchanged by either refinement — it behaves exactly as it did before this feature existed.
- The solid-vs-dashed distinction (FR-003/FR-004) survives into the split-view design: even though the Inferred view is 100% reasoner-derived by construction, a specific relationship within it may ALSO be backed by a direct axiom — that nuance is still worth surfacing (dashed = reasoner-only, solid = also directly-written), so it wasn't dropped when the two views were split apart.
