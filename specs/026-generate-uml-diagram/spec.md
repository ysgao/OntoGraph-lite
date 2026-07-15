# Feature Specification: Generate UML Diagram

**Feature Branch**: `026-generate-uml-diagram`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "new feature: generate UML diagram. The folder @uml-diagram-cli-plan/ is an initial design of the feature. However, we need to revise the design to make it the function of the OntoGraph-lite first, e.g. right click the selected focus entity, the context menu will show generate diagram. This can be similar to the generate graph. The generated diagram can be showed in the webview and the user can change the depth of the diagram. When the function is working properly, this function can be registered to API and made accessible via the CLI (this can be done separately later). The other consideration is to remove the AI LLM model from the function. It should not require AI for generate the diagram if it is possible though the AI LLM could access the CLI when the function is ready."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a UML diagram for a selected entity (Priority: P1)

An ontology author browsing the Classes (or Individuals) panel selects a class they want to
understand structurally, right-clicks it, and chooses "Generate UML Diagram" from the context
menu. A new panel opens showing a UML-style class diagram rooted at that entity: its part-whole
relationships as composition connectors and its subtype relationships as generalization
connectors, laid out as a readable tree/graph.

**Why this priority**: This is the entire value proposition of the feature. Without it, there is
no diagram to view, adjust, or (later) automate. Every other story depends on this one existing.

**Independent Test**: Right-click any class with at least one subclass or part-of relationship in
a loaded ontology, choose "Generate UML Diagram," and confirm a diagram opens showing that entity
and its immediate structural relationships with correct connector styles.

**Acceptance Scenarios**:

1. **Given** an ontology is loaded and a class with known subclasses is selected in the Classes
   panel, **When** the user right-clicks it and chooses "Generate UML Diagram," **Then** a diagram
   view opens showing the selected class as the root node with its subclasses connected by
   generalization connectors.
2. **Given** an ontology is loaded and a class with part-of relationships to other classes is
   selected, **When** the user generates the diagram, **Then** the related classes appear
   connected by composition connectors, visually distinguishable from generalization connectors.
3. **Given** a class with no subclasses and no part-of relationships is selected, **When** the user
   generates the diagram, **Then** the diagram opens showing only that entity as a single node, with
   no error.

---

### User Story 2 - Adjust how much of the ontology is shown (Priority: P2)

Having opened a diagram, the user wants to see more or less of the surrounding structure without
starting over. They use a depth control in the diagram view to expand outward (see
grandchildren, great-grandchildren, etc.) or narrow back down to just direct relationships.

**Why this priority**: Ontology subtrees vary enormously in size; a fixed depth is right for some
entities and wrong for most others. This makes the diagram usable across the range of ontologies
the tool supports, but the diagram is already useful at a fixed default depth without it (P1 stands
alone).

**Independent Test**: With a diagram already open for an entity that has at least two levels of
descendants, move the depth control up and confirm additional levels of nodes appear; move it down
and confirm the diagram narrows back to fewer levels, all without closing and reopening the panel.

**Acceptance Scenarios**:

1. **Given** a UML diagram is open at the default depth, **When** the user increases the depth
   control, **Then** the diagram redraws to include additional levels of related entities out from
   the root.
2. **Given** a UML diagram is open showing several levels, **When** the user decreases the depth
   control, **Then** the diagram redraws showing fewer levels, without losing the root entity or
   requiring the user to re-invoke the command.
3. **Given** the depth control is set to its maximum, **When** the underlying relationships extend
   beyond that depth, **Then** the diagram indicates that further relationships exist but are not
   shown (rather than silently truncating with no indication).

---

### User Story 3 - Diagram generation never depends on external AI (Priority: P1)

A user working fully offline, or in an environment where no AI/LLM service is reachable, selects
"Generate UML Diagram" and gets a correct, complete diagram every time — because the classification
of relationships (part-of vs. subtype) and the diagram's layout are produced by fixed, repeatable
rules applied to the ontology's own axioms, not by a judgment call from an AI model.

**Why this priority**: This is a hard constraint from the requester, not a nice-to-have: the
feature must work the same way every time, without network access, an API key, or usage cost, and
must produce the same diagram from the same ontology input every time it is run.

**Independent Test**: Generate the same diagram for the same entity twice in a row (or on two
separate machines with no AI/network access at all) and confirm the resulting diagrams are
identical in structure, connector classification, and layout.

**Acceptance Scenarios**:

1. **Given** no AI/LLM service is configured or reachable, **When** the user generates a UML
   diagram, **Then** the diagram is produced successfully with no degraded functionality.
2. **Given** the same entity and the same ontology content, **When** the diagram is generated twice,
   **Then** both diagrams show identical nodes, connectors, connector classifications, and layout.

---

### Edge Cases

- What happens when the selected entity's relationships form a cycle (e.g., two classes that are
  each, directly or transitively, a part of the other)? The diagram must still render without
  looping indefinitely, and the cyclical relationship must remain visible rather than being
  silently dropped.
- What happens when an entity has an extremely large number of direct relationships (e.g.,
  hundreds of subclasses, as can occur in large terminologies)? The diagram must remain usable
  (e.g., an explicit, visible indication of how many relationships are not rendered) rather than
  becoming unreadable or causing the view to hang.
- What happens when the selected entity is deleted, renamed, or the ontology file changes on disk
  while its diagram is open? Per the assumption below, the diagram is a point-in-time snapshot and
  is not required to auto-refresh; the user re-invokes the command to see current content.
- What happens when the selected entity has no structural relationships of either kind (isolated
  node)? Covered in User Story 1, Acceptance Scenario 3 — diagram opens with just the one node.
- What happens when relationships exist that don't fit either "part-of" or "subtype" classification
  (e.g., a property describing an unrelated kind of association)? These must not be silently
  reinterpreted as one of the two UML relationship kinds; they are excluded from the diagram, and
  the diagram indicates that some relationships were excluded rather than presenting the diagram as
  if it captured the entity's full relationship set.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to trigger UML diagram generation from a right-click context menu
  on a focus entity in the same tree views (Classes / Individuals) that already offer "Generate
  Graph," without needing a separate command-palette invocation.
- **FR-002**: The system MUST render the diagram in an editor-area webview panel (consistent with
  the existing graph visualization pattern), distinct from the ontology's source file view.
- **FR-003**: The system MUST classify each rendered structural relationship as exactly one of two
  UML notations — **composition** (part-of) or **generalization** (subtype) — and render each with
  a visually distinct connector so the two kinds are never ambiguous to the viewer.
- **FR-004**: The system MUST determine composition vs. generalization classification purely from
  the ontology's own asserted axioms, using a fixed, repeatable rule — never a per-diagram judgment
  call, and never a call to an external AI/LLM service.
- **FR-004a**: The system MUST let the user designate which object properties are treated as
  composition (part-of) relationships, via a configurable property selection — not a fixed
  "part-of" vocabulary and not an automatic label heuristic. Any object property the user selects
  renders as a composition connector wherever it connects two entities within the diagram's scope;
  properties not selected are not treated as composition (they may still be excluded relationships
  per FR-010, or read as generalization where the axiom shape independently qualifies as subtype).
  This selection is configured once (not re-decided per diagram) and applied automatically at
  generation time — it is a user setting, never a per-diagram AI/LLM judgment call.
- **FR-005**: The system MUST provide a depth control within the diagram view that lets the user
  widen or narrow how many relationship levels away from the root entity are shown, re-rendering
  the diagram in place without requiring the panel to be closed and reopened.
- **FR-006**: The system MUST select the root node of the diagram automatically as the entity the
  user right-clicked — no additional root-selection step or judgment call is presented to the user.
- **FR-007**: The system MUST cap the number of rendered relationships/nodes to keep the diagram
  responsive, and MUST visibly indicate when the cap has been reached (rather than silently
  omitting relationships).
- **FR-008**: The system MUST NOT require any AI/LLM call, external network service, or manual
  human authoring step (e.g., hand-editing an intermediate specification file) to produce a
  complete, correctly classified diagram. All extraction, classification, and layout decisions
  needed to draw the diagram MUST be fully automatic.
- **FR-009**: The system MUST remain usable when the selected entity or its relationships have no
  meaningful "part-of" style relationships at all — in that case the diagram MUST still render
  successfully using generalization relationships alone (and vice versa).
- **FR-010**: The system MUST NOT silently reclassify or drop a structural relationship that does
  not clearly fit the composition/generalization rule; such relationships are excluded from the
  rendered diagram, and their exclusion MUST be visible to the user in the diagram view.
- **FR-011**: When an entity has more than one qualifying relationship of either kind (e.g., two
  distinct composition parents, or a composition parent and a generalization parent at the same
  time), the system MUST render every qualifying relationship as its own connector. The diagram is
  a general graph, not a strict tree — a node can have multiple incoming/outgoing connectors — so
  no relationship is dropped or requires a primary-edge judgment call.
- **FR-012**: The underlying diagram-generation capability MUST be structured so that it can later
  be exposed through the existing command-line interface without re-implementing the extraction,
  classification, or layout logic — this is a design constraint for this feature, not a deliverable
  of it; CLI exposure itself is out of scope for this feature.
- **FR-013**: The system MUST support on-screen viewing of the diagram within the webview as the
  complete deliverable for this feature's initial version. Exporting the diagram to a shareable
  file format (e.g., an image or diagram-interchange file, as the original CLI-based design
  prototype produced) is out of scope for this feature and MAY be addressed as a later enhancement.

### Key Entities

- **Focus Entity**: The class (or individual) the user selected before invoking diagram
  generation; becomes the diagram's root node.
- **Diagram Node**: A rendered entity in the diagram, corresponding to an ontology class reachable
  from the focus entity within the current depth setting; carries a display label and a
  relationship-derived visual style.
- **Composition Relationship**: A rendered connector meaning "the connected entity is a part of
  this entity," derived mechanically from the ontology's part-of style axioms.
- **Generalization Relationship**: A rendered connector meaning "the connected entity is a subtype
  of this entity," derived mechanically from the ontology's subclass axioms.
- **Depth Setting**: The user-adjustable number of relationship levels, away from the focus entity,
  included in the current rendering of the diagram.
- **Composition Property Selection**: The user-configured set of object properties designated to
  render as composition (part-of) connectors; persists across diagram generations rather than
  being decided per-diagram.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from selecting an entity to viewing its UML diagram in under 5 seconds
  for ontologies within the tool's existing supported scale.
- **SC-002**: 100% of rendered relationships are unambiguously shown as either composition or
  generalization — never an unstyled or ambiguous connector.
- **SC-003**: Regenerating the same diagram for the same entity against unchanged ontology content
  produces an identical diagram every time, with zero dependency on any external/AI service being
  reachable.
- **SC-004**: A user can change the visible depth of an open diagram and see the update reflected
  in under 3 seconds, without losing their place (the root entity remains visible and unchanged).
- **SC-005**: Diagrams generated for entities with large relationship counts remain responsive
  (no UI freeze) and clearly communicate when relationships have been capped.

## Assumptions

- "Focus entity" means a class or individual selected in the Classes / Inferred Classes /
  Individuals tree views — the same set of views that currently offer "Generate Graph" — so the
  new context-menu entry can reuse that existing availability rule.
- Generalization relationships are derived from ordinary subclass axioms between named classes,
  which every supported ontology format already expresses in a directly readable way; no
  additional configuration is needed for this half of the classification.
- Composition relationships are derived from whichever object properties the user has designated
  via the Composition Property Selection; this selection is not limited to a fixed "part-of"
  vocabulary and applies to any object property the user chooses, so the feature works the same way
  for part-of-style properties and for other structurally meaningful object properties the user
  wants rendered as composition.
- A diagram is a general graph rather than a strict tree: an entity with multiple qualifying
  relationships (e.g., two composition parents, or a composition parent and a generalization parent
  at once) shows every one of them rather than picking a single primary edge.
- Exporting the diagram to an external file format is a possible future enhancement, not required
  for this feature's initial delivery; on-screen viewing in the webview is the complete v1
  deliverable.
- The diagram is a point-in-time, in-session view: it reflects the ontology content at the moment
  it was generated. Auto-refreshing an open diagram when the underlying file changes on disk is out
  of scope for this feature; the user re-invokes "Generate UML Diagram" to refresh.
- Registering this capability with the CLI is explicitly deferred, per the request, to a later,
  separate effort; this feature only needs to be built in a way that doesn't preclude that later
  work.
- Removing the AI/LLM dependency means the feature must never call an external AI/LLM service to
  produce the diagram; it does not preclude an AI/LLM assistant (e.g., a chat agent) from later
  driving the feature through the CLI once that CLI surface exists.
