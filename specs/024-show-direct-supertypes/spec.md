# Feature Specification: Show Direct Supertypes in Graph View

**Feature Branch**: `024-show-direct-supertypes`

**Created**: 2026-07-03

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Direct Parents of Focused Entity (Priority: P1)

An ontology editor focuses on an entity in the graph view (either by double-clicking or navigating from the sidebar). They want to immediately see not only the entity's subclass neighborhood (controlled by the Depth slider) but also its direct superclasses — the one-level-up parents in the class hierarchy — so they can understand the entity's position in the ontology without having to navigate away.

**Why this priority**: Understanding an entity's place in a hierarchy requires knowing both its children and its parents. Without direct supertype visibility, users must separately navigate to each parent, breaking their flow. This is the core value of the feature.

**Independent Test**: Open any ontology with a multi-level class hierarchy. Focus an entity that has both subclasses and superclasses. The graph should display the focused entity's direct parent(s) as nodes connected by an upward edge, alongside the subclass neighbourhood produced by the Depth slider.

**Acceptance Scenarios**:

1. **Given** a graph view with a focused entity that has one or more direct superclasses, **When** the graph renders, **Then** each direct superclass appears as a node connected to the focused entity by a supertype edge, regardless of the current Depth slider value.
2. **Given** a focused entity whose only superclass is `owl:Thing`, **When** the graph renders, **Then** `owl:Thing` is shown as the single parent node.
3. **Given** a focused entity with no asserted superclass (root class), **When** the graph renders, **Then** no supertype node is added and the graph looks identical to before this feature.
4. **Given** a focused entity with multiple direct superclasses, **When** the graph renders, **Then** all direct superclasses appear as separate nodes each connected to the focused entity.

---

### User Story 2 - Supertype Display Consistent Across Layout Modes (Priority: P2)

A user switches between the Hierarchical (dagre) and Force (cose) layout modes. In both modes, the direct supertype nodes should be present and visually connected to the focused entity.

**Why this priority**: The feature request explicitly calls out both layout modes as in scope. Users who prefer either layout should have access to the same contextual information.

**Independent Test**: Focus an entity that has superclasses. Switch between Hierarchical and Force layout buttons. In both views, supertype nodes must be visible and linked.

**Acceptance Scenarios**:

1. **Given** supertype nodes are visible in Force layout, **When** the user clicks "Hierarchical", **Then** the same supertype nodes remain visible with the hierarchical (top-down) arrangement applied.
2. **Given** supertype nodes are visible in Hierarchical layout, **When** the user clicks "Force", **Then** the same supertype nodes remain visible with the force-directed arrangement applied.

---

### User Story 3 - Depth Slider Unchanged for Subtypes (Priority: P1)

A user adjusts the Depth slider to control how many levels of subclasses are shown. The slider must continue to work exactly as before for subtypes — supertype display is always fixed at depth 1 and is not affected by the slider.

**Why this priority**: The feature description explicitly states no change to the existing Depth setting. Preserving backward compatibility is required.

**Independent Test**: Set depth to 3 and focus an entity. Confirm three levels of subclasses are shown. Confirm the supertype nodes are always exactly the direct parents (depth 1), not three levels of ancestors.

**Acceptance Scenarios**:

1. **Given** depth is set to 1, **When** viewing the focused entity, **Then** direct subclasses appear (as before) and direct superclasses also appear (exactly 1 level up).
2. **Given** depth is set to 3, **When** viewing the focused entity, **Then** up to 3 levels of subclasses appear (as before) and still only direct (1 level) superclasses appear.
3. **Given** the user changes the depth slider while viewing a focused entity, **Then** the supertype nodes do not change, only the subtype neighborhood changes.

---

### Edge Cases

- What happens when a superclass node IRI is already present in the graph as a subclass-side node? It should not be duplicated — the existing node is reused.
- How does the system handle the case where a focused entity is itself `owl:Thing` (no supertype)? No parent node is added.
- What if inferred superclasses exist but the "Inferred" toggle is off? Only asserted direct superclasses are shown regardless of the toggle (supertype depth-1 is always asserted; inferred is a separate display concern handled the same way as existing inferred edges).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an entity is focused in the graph view, its direct (depth-1) asserted superclasses MUST be included as graph nodes and connected to the focused entity by a directed supertype edge.
- **FR-002**: The supertype depth MUST be fixed at 1 and MUST NOT be configurable via the existing Depth slider or any new control.
- **FR-003**: The Depth slider MUST continue to control only the subtype/subclass neighbourhood depth, with no change to its existing behaviour.
- **FR-004**: Supertype display MUST function in both Hierarchical (dagre) layout and Force (cose) layout.
- **FR-005**: If a superclass node IRI is already present in the graph (e.g., it also appears in the subtype neighbourhood), the node MUST be shared/reused rather than duplicated.
- **FR-006**: If the focused entity has no asserted direct superclass, no supertype node MUST be added to the graph.
- **FR-007**: Supertype edges MUST be visually distinguishable from subtype edges (e.g., distinct colour, arrow style, or edge type label).
- **FR-008**: The extension host MUST include `directSupertype` edges and their corresponding superclass nodes in the existing `updateGraph` response for the focused entity, delivered via the same `postMessage` mechanism as all other graph data — no new message type or protocol field is required.

### Key Entities

- **Focused Entity**: The ontology entity whose neighbourhood is currently displayed; it is the anchor node of the graph.
- **Direct Supertype**: A class that is a direct (asserted, depth-1) superclass of the focused entity via a `SubClassOf` axiom.
- **Supertype Edge**: A directed graph edge from the focused entity to its direct supertype node, distinct from subclass edges.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When focusing any entity that has one or more direct superclasses, all direct superclass nodes appear in the graph within the same render cycle as the rest of the neighbourhood — no additional user action required.
- **SC-002**: The Depth slider behaviour is identical to pre-feature behaviour when measured against the subtype neighbourhood: changing depth from 1 to 5 shows progressively deeper subclasses, and supertype display is unaffected.
- **SC-003**: 100% of graph renders in both layout modes (Hierarchical and Force) include supertype nodes when the focused entity has direct superclasses.
- **SC-004**: No duplicate nodes appear in the graph when a superclass IRI coincides with a node already included in the subtype neighbourhood.

## Assumptions

- The extension host already computes the direct superclasses of any entity during ontology indexing; the feature requires exposing that data to the webview, not computing it anew.
- `owl:Thing` is a valid supertype node and may be displayed if it is the only explicit superclass.
- Inferred superclasses follow the existing "Inferred" toggle logic: they are shown only when the toggle is on, just like inferred subclass edges.
- The supertype display applies only when an entity is focused (i.e., a `requestNeighborhood` or equivalent message is active); the global/overview graph state is unaffected.
- No UI control (checkbox, slider, button) is added to enable or disable supertype display — it is always on when a focus entity is set.
- The depth slider previously surfaced ancestor nodes at depth ≥ 2 via bidirectional BFS. This feature intentionally restricts upward traversal to depth-1 direct supertypes only; visibility of deeper ancestors (grandparents and above) is removed as a deliberate trade-off to make supertype display depth-independent.
