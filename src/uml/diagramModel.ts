// `Conjunct` (parsed SubClassOf/EquivalentClasses intersection term) is defined and
// produced by `parseConjuncts()` in `src/utils/ManchesterFormatting.ts` — import it
// from there rather than redefining it here.

/** Flow direction for `src/uml/layout.ts`'s layered graph layout — 'TB' (top-to-bottom,
 *  depth maps to rows) is the long-standing default; 'LR' (left-to-right, depth maps to
 *  columns) is a user-selectable alternative (a toolbar toggle in the webview), never the
 *  default. */
export type LayoutDirection = 'TB' | 'LR';

/** One rendered entity in a UML diagram. */
export interface DiagramNode {
  iri: string;
  label: string;
  depth: number;
  isRoot: boolean;
  /** True when this node has qualifying relationships not rendered because the
   *  depth or node cap was reached. */
  hasHiddenRelations: boolean;
  /** Layered-layout position (`src/uml/layout.ts`), in diagram-space pixels. Absent from
   *  `src/uml/partOfGraph.ts`'s pure extraction output — merged in by
   *  `src/commands/generateUmlDiagram.ts` before the node is sent to the webview, which renders
   *  it as a fixed position; a UML class diagram reads best as a deterministic top-down layered
   *  graph, not a force-directed one, unlike the general-purpose Graph view. */
  x?: number;
  y?: number;
}

/** One rendered connector between two DiagramNodes. */
export interface DiagramEdge {
  id: string;
  parentIri: string;
  childIri: string;
  kind: 'composition' | 'generalization';
  propertyIri?: string;
}

/** A relationship seen during extraction but not rendered because it used an
 *  object property that is neither a subclass axiom nor in the Composition
 *  Property Selection. Surfaced to the user, never silently dropped (FR-010) —
 *  as a note listed below the diagram (not attached to the class box itself), so the
 *  `*Label` fields carry everything needed to render that note without any further
 *  model lookups. */
export interface ExcludedRelation {
  fromIri: string;
  propertyIri: string;
  targetIri: string;
  fromLabel: string;
  propertyLabel: string;
  targetLabel: string;
}
