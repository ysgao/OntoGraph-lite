# Phase 1 Data Model: Generate UML Diagram

All entities below are the diagram's own derived data — none are new persisted ontology data; the
ontology's own model (`OntologyModel`, `OWLClass`, etc.) remains the single source of truth. Every
entity here maps to a Key Entity from `spec.md`.

## Conjunct (internal, extraction-time only)

The parsed shape of one term inside a class's `SubClassOf`/`EquivalentClasses` intersection.
Produced by the new `parseConjuncts()` helper (`src/utils/ManchesterFormatting.ts`); consumed only
by `src/uml/partOfGraph.ts`, never sent to the webview.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'bare' \| 'restriction'` | `bare` = named-class conjunct (generalization candidate); `restriction` = `ObjectSomeValuesFrom(property, target)` |
| `targetIri` | `string` | The class this conjunct references |
| `propertyIri` | `string` (restriction only) | The object property used in the restriction |

## Diagram Node

One rendered entity in the diagram. Corresponds to spec's **Diagram Node** key entity.

| Field | Type | Notes |
|---|---|---|
| `iri` | `string` | Ontology class IRI; stable identity across depth changes |
| `label` | `string` | Display label (existing label-resolution convention, same as Graph view) |
| `depth` | `number` | BFS distance from the focus entity along rendered edges |
| `isRoot` | `boolean` | True only for the focus entity itself |
| `hasHiddenRelations` | `boolean` | True when this node has qualifying relationships not rendered because the depth or node cap was reached (drives the visible "more exists" indicator required by spec edge cases and FR-007) |
| `x`, `y` | `number` | Tidy-tree layout position computed server-side by `src/uml/layout.ts`; the webview renders nodes at these fixed coordinates (Cytoscape `preset` layout) rather than auto-laying-out, since a UML diagram reads best as a deterministic top-down tree |

Node visual category (fill/stroke) is a deterministic function of role — `root` vs. `non-root` —
not a user-assigned or AI-assigned domain category; this satisfies the "no per-diagram judgment
call" requirement (FR-004, FR-006) by removing the category-assignment decision entirely rather
than automating a judgment call that has no principled default.

## Diagram Edge

One rendered connector between two Diagram Nodes. Corresponds to spec's **Composition
Relationship** and **Generalization Relationship** key entities — both are the same underlying
shape, distinguished by `kind`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `${parentIri}\|${childIri}\|${kind}\|${propertyIri ?? ''}` — stable, de-duplicates same-kind repeats |
| `parentIri` | `string` | Whole (composition) or supertype (generalization) |
| `childIri` | `string` | Part (composition) or subtype (generalization) |
| `kind` | `'composition' \| 'generalization'` | Drives connector notation: filled diamond at `parentIri` for composition, hollow triangle at `parentIri` for generalization |
| `propertyIri` | `string \| undefined` | The composition object property used (undefined for generalization, which has no property — it's a bare conjunct) |

Per FR-011 / the resolved multiple-parents question, a node may be the `childIri` of more than one
Diagram Edge (e.g., one composition edge and one generalization edge, or two composition edges via
two different configured properties) — the diagram is a general graph, so no edge is dropped or
chosen as "primary."

## Excluded Relation (surfacing only, per FR-010)

A relationship the extraction pass saw but did not render, because it used an object property that
is neither a subclass axiom nor in the Composition Property Selection. Not a graph node/edge —
rendered as a visible annotation on the node it originates from (e.g., a footnote/badge), never
silently dropped.

| Field | Type | Notes |
|---|---|---|
| `fromIri` | `string` | The node the excluded relationship originates from |
| `propertyIri` | `string` | The object property that didn't qualify as composition |
| `targetIri` | `string` | What it pointed to (may or may not itself be a rendered node) |

## Depth Setting

The current traversal depth for a diagram already open (spec's **Depth Setting** key entity). Lives
only in the webview session's UI state and the request message payload — not persisted as
document/workspace data (each new "Generate UML Diagram" invocation starts at the configured
default depth).

| Field | Type | Notes |
|---|---|---|
| `value` | `number` | Bounded (e.g., 1–5, matching the existing `ontograph.graph.defaultDepth` convention's bounds) |

## Composition Property Selection (persisted setting)

Spec's **Composition Property Selection** key entity. A VS Code workspace setting, not a
document/model entity — see `research.md` §2 and `contracts/uml-diagram-settings.md`.

| Field | Type | Notes |
|---|---|---|
| `ontograph.umlDiagram.compositionProperties` | `string[]` | Object property IRIs treated as composition; default `[]` |
| `ontograph.umlDiagram.defaultDepth` | `number` | Default depth for a newly generated diagram |

## Relationships between entities

```
OntologyModel (existing)
   └─ per-class Conjunct[] (derived, in-memory, extraction-time only)
        └─ BFS from Focus Entity, bounded by Depth Setting and a node cap
             ├─ produces Diagram Node[] (one of which isRoot)
             ├─ produces Diagram Edge[] (kind = composition | generalization)
             └─ produces Excluded Relation[] (surfaced, not rendered as edges)

Composition Property Selection (persisted setting)
   └─ read once per generation/depth-change request; determines which
      `restriction` Conjuncts classify as composition vs. Excluded Relation
```
