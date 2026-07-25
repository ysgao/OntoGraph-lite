# Feature Specification: Layered Graph Layout for UML Diagrams

**Feature Branch**: `031-layered-graph-layout`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "review and implement layerd graph layout. The current output of UML still have overlaps of nodes and cross of edges when the level to beyond two or three. The issues are demonstrated in @Middle-ear-structure-uml.drawio under uml-diagram-cli-plan. A new algorithm @LayeredGraphAlgorithm.md is proposed. Review the existing codebase if the algorithm improve and resolve the current issues and implement the algorithm or improve it to address the issues."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a deep UML diagram without visual confusion (Priority: P1)

An ontology author generates a UML diagram rooted at an entity whose part-of and subtype
relationships extend four or more levels deep, with some entities reachable through more than one
path (shared/reused parts or supertypes). Today, once the diagram grows past two or three levels,
boxes land on top of each other and connector lines cut through unrelated boxes or cross one
another so heavily that it is difficult to tell which box connects to which. The author needs the
diagram to remain legible at any depth: every box fully visible and separated from every other box,
and every connector line traceable from one end to the other without guessing.

**Why this priority**: This is the core defect driving the request. A diagram that becomes
unreadable exactly when the ontology structure is complex enough to need a diagram defeats the
purpose of the whole UML feature. Nothing else matters if the base layout is illegible.

**Independent Test**: Generate a diagram for an entity known to have 4+ levels of depth and at
least one entity reachable via two different parents (e.g. the middle-ear-structure sample), and
confirm visually and by automated check that no two boxes overlap and no connector line passes
through a box it is not connected to, at any depth.

**Acceptance Scenarios**:

1. **Given** a UML diagram request for an entity with 5 levels of descendants, **When** the
   diagram is generated, **Then** every entity box is fully visible with no box overlapping any
   other box, at every level.
2. **Given** a UML diagram containing an entity reachable from two different parent entities,
   **When** the diagram is generated, **Then** no connector line passes through any entity box
   other than the two boxes it directly connects.
3. **Given** the same ontology subtree previously rendered with visible overlaps (e.g. the
   middle-ear-structure sample), **When** the diagram is regenerated, **Then** the overlaps are
   gone and the hierarchy (which entity is above/below which) is still clearly recognizable.

---

### User Story 2 - Follow relationships between entities with minimal crossing lines (Priority: P2)

Having fixed overlaps, the same author looks at a diagram where several entities share
relationships to the same set of other entities (a common pattern in part-whole hierarchies). They
need to visually trace which line goes from which box to which, without lines crossing each other
more than the shape of the relationships actually requires.

**Why this priority**: Eliminating overlap alone (P1) can still leave a diagram where every line
tangles with every other line, making the diagram technically non-overlapping but still hard to
read. Reducing unnecessary crossings is what makes the fixed layout genuinely usable, not just
technically correct.

**Independent Test**: Generate a diagram for a subtree with multiple entities sharing common
parents or children, and confirm the number of line crossings is measurably lower than the
diagram produced before this change, for the same input.

**Acceptance Scenarios**:

1. **Given** a diagram where multiple sibling entities connect to a shared set of related
   entities, **When** the diagram is generated, **Then** connector lines are arranged to minimize
   the total number of crossings among them.
2. **Given** two entities positioned within the same hierarchy level, **When** their relative
   order can be changed without affecting correctness, **Then** the system chooses the order that
   produces fewer line crossings overall.

---

### User Story 3 - Consistent, correct layout across every export format (Priority: P3)

A user who views a UML diagram in the in-editor panel, then exports the same diagram to draw.io,
SVG, or PNG for sharing outside the editor, expects the exported version to show the same
non-overlapping, low-crossing layout they saw on screen — not a different or worse arrangement.

**Why this priority**: The layout fix only delivers full value if it is visible everywhere the
diagram is consumed, including outputs shared with people who don't have the editor open. This
depends on P1/P2 already working correctly in at least one rendering path.

**Independent Test**: Generate a diagram for the same deep, multi-parent entity used in User
Story 1, export it to each supported format, and confirm each exported version shows the same
node positions and connector routing (no overlaps, same crossing count) as the in-editor view.

**Acceptance Scenarios**:

1. **Given** a UML diagram displayed in the editor panel with no overlaps, **When** the user
   exports it to draw.io format, **Then** the exported diagram shows the same node arrangement
   and connector routing with no overlaps.
2. **Given** the same diagram, **When** the user exports it to SVG or PNG, **Then** the exported
   image shows the same non-overlapping arrangement as the editor panel and the draw.io export.

---

### Edge Cases

- What happens when an entity is reachable from the root by paths of different lengths (e.g. one
  parent two hops away, another parent four hops away)? The entity must appear at a single,
  consistent level and not be duplicated or drawn twice.
- What happens when an entity in the requested depth range is not reachable from the root at all
  (e.g. only reachable through a relationship type excluded from the diagram)? It must still be
  placed somewhere sensible rather than causing the diagram to fail to generate.
- What happens when a single level contains a very large number of entities (wide fan-out)? The
  diagram must still avoid overlaps even if that requires the diagram to become wide; it must not
  compress boxes to the point of overlapping to save space.
- What happens when the diagram is regenerated after the user changes the depth control
  (existing feature)? The layout must remain overlap-free and low-crossing at every depth the
  control allows, not just the default depth.
- What happens on a diagram with only one or two levels (the cases that already render
  acceptably today)? The change must not introduce new overlaps or regressions for the simple
  cases that currently work.
- What happens with relationship cycles, if any occur in the underlying structural data? The
  layout must still complete and produce a readable diagram rather than looping indefinitely.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST position every entity box so that it does not overlap any other entity
  box, at any hierarchy depth and any number of entities per level.
- **FR-002**: System MUST route every connector line so that it does not pass through or overlap
  any entity box other than the two boxes it connects.
- **FR-003**: System MUST assign each entity to a level (row/column) reflecting its position in
  the hierarchy relative to the diagram's root, consistent with the depth semantics of the
  existing diagram feature (e.g. an entity's level is determined by its longest path from the
  root among all the paths that reach it).
- **FR-004**: System MUST minimize the number of connector line crossings for a given diagram,
  choosing among valid orderings of entities within a level to reduce crossings rather than
  leaving ordering to arbitrary/discovery order.
- **FR-005**: System MUST correctly lay out entities that are reachable from the root by more
  than one path (shared parts or shared supertypes) without duplicating the entity or breaking
  the overlap/crossing guarantees.
- **FR-006**: System MUST apply the corrected layout consistently across every export format the
  UML diagram feature supports (in-editor panel, draw.io, SVG, PNG).
- **FR-007**: System MUST continue to produce a correct, readable diagram for entities unreachable
  from the diagram's root or from an excluded relationship path, without failing diagram
  generation.
- **FR-008**: System MUST NOT introduce new overlaps or crossings for diagrams that already
  render correctly today (shallow, 1-2 level hierarchies) — the fix must not regress existing
  working cases.
- **FR-009**: System MUST produce layout results deterministically — regenerating a diagram from
  the same underlying structure MUST produce the same node arrangement each time.
- **FR-010**: System MUST complete layout generation within the diagram feature's existing
  interactive-use expectations (no noticeable added delay when generating or changing the depth
  of a diagram of the sizes the UML feature currently supports).

### Key Entities

- **Diagram Node**: A visual box representing one ontology entity (class or individual) in the
  UML diagram; has a position, size, and an assigned hierarchy level relative to the diagram's
  root.
- **Diagram Connector**: A visual line representing one structural relationship (part-of/
  composition or subtype/generalization) between two diagram nodes; has a routed path between its
  two endpoints.
- **Hierarchy Level**: The row or column grouping that reflects an entity's distance from the
  diagram's root; determines the relative vertical or horizontal position of all nodes at that
  level.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero node-to-node overlaps and zero connector-through-unrelated-node overlaps are
  detected across all sample diagrams used for regression testing, including the middle-ear
  structure sample, regardless of hierarchy depth.
- **SC-002**: For diagrams involving entities shared across multiple parents, the total number of
  connector line crossings is reduced compared to the current output for the same input, measured
  on the same regression samples.
- **SC-003**: Users can visually trace any connector line from its source entity to its target
  entity without ambiguity, verified by a walkthrough of the middle-ear structure sample and at
  least one other multi-level sample before and after the change.
- **SC-004**: 100% of existing UML diagram export formats (editor panel, draw.io, SVG, PNG) show
  matching, overlap-free layouts for the same diagram, with no format lagging behind the others.
- **SC-005**: Existing shallow diagrams (1-2 levels) show no visible layout regression after the
  change, confirmed against existing regression fixtures.

## Assumptions

- The scope of "UML diagram" here is the existing feature from `026-generate-uml-diagram`
  (composition/generalization diagrams generated from a resolved root entity and rendered via the
  editor panel, draw.io export, SVG export, and PNG export); no new diagram entry points are being
  added.
- Diagram sizes remain within the range the existing UML feature already generates (bounded by the
  feature's depth control); this work is not extending diagram scope to arbitrarily large,
  SNOMED CT-scale subgraphs in a single diagram.
- "Minimize crossings" means best-effort reduction relative to the current output, not a
  mathematical guarantee of zero crossings — some relationship structures cannot be drawn with
  zero crossings regardless of layout algorithm.
- Visual appearance of existing diagrams (including ones that don't currently show visible
  overlaps) may change as a side effect of adopting a corrected, shared layout approach; this is
  expected and acceptable as long as no regression is introduced per FR-008/SC-005.
- The `LayeredGraphAlgorithm.md` proposal is treated as a candidate approach to evaluate against
  the codebase during planning, not a mandated final design; the planning phase will determine
  whether to adopt it as proposed or an adapted version, based on what actually resolves the
  overlap/crossing issues without regressing existing behavior.
