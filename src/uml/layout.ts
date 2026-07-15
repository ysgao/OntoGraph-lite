import type { DiagramNode, DiagramEdge, LayoutDirection } from './diagramModel';

export interface LayoutPosition {
  x: number;
  y: number;
  depth: number;
}

// Spacing along the DEPTH axis (rows in TB, columns in LR) — must clear the node's own extent
// along that axis plus enough gap for a bus stem (`diagramGeometry.ts`'s BUS_GAP). TB's depth
// axis is screen-vertical, so it's sized against NODE_HEIGHT (56); LR's is screen-horizontal,
// sized against NODE_WIDTH (160) — hence the two constants differ rather than one being reused.
const ROW_HEIGHT = 140;
const COLUMN_WIDTH = 260;

// Spacing along the CROSS axis (columns of siblings in TB, rows of siblings in LR) — sized
// against the node's extent on THAT axis instead: TB's cross axis is screen-horizontal (against
// NODE_WIDTH), LR's is screen-vertical (against NODE_HEIGHT).
const SLOT_WIDTH = 170;
const SLOT_HEIGHT = 90;

const LEFT_MARGIN = 40;

/**
 * Pure tidy-tree layout: depth maps to a fixed row/column along the flow axis, leaves are
 * assigned slots in declared order along the cross axis, and each internal node's cross
 * position is the average of its children's (post-order). Mirrors the layout scheme in the
 * original hand-built diagram prototypes (`uml-diagram-cli-plan/gen_drawio.py`), computed once
 * and shared by whichever webview consumes it — there is only one renderer here (Cytoscape,
 * `preset` layout), but the pure/deterministic shape is kept independent of any rendering
 * library so it stays unit-testable on its own (spec SC-003 determinism).
 *
 * `direction` picks which screen axis is "flow" (depth) and which is "cross" (siblings):
 * 'TB' (default) maps flow to `y` and cross to `x`; 'LR' maps flow to `x` and cross to `y`. The
 * underlying tidy-tree math is identical either way — only the final flow/cross → x/y mapping
 * (and which spacing constants apply) differs, so a caller switching direction gets the exact
 * same tree shape, just laid out along the other axis.
 */
export function computeLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection = 'TB',
): Map<string, LayoutPosition> {
  const flowSpacing = direction === 'LR' ? COLUMN_WIDTH : ROW_HEIGHT;
  const crossSpacing = direction === 'LR' ? SLOT_HEIGHT : SLOT_WIDTH;
  const depthByIri = new Map(nodes.map(n => [n.iri, n.depth]));

  // A parent frequently has BOTH composition and generalization children at once (e.g. an
  // anatomical whole with a part-of breakdown AND laterality-qualified subtypes) — clustering
  // same-kind children together (rather than the raw edge-declaration order, which can
  // interleave the two kinds) keeps each kind's x-span from overlapping the other's when
  // `diagramGeometry.ts` draws their two separate bus groups.
  const kindOrder: Record<DiagramEdge['kind'], number> = { composition: 0, generalization: 1 };
  const edgesByParent = new Map<string, DiagramEdge[]>();
  for (const e of edges) {
    let list = edgesByParent.get(e.parentIri);
    if (!list) { list = []; edgesByParent.set(e.parentIri, list); }
    list.push(e);
  }

  // Raw (declaration-order, deduped) children per kind, per parent — built before the
  // shared-children reorder pass below because that pass needs every node's own child SET
  // (to detect sharing) before any node's final child ORDER is decided.
  const rawChildrenByParentByKind = new Map<string, Map<DiagramEdge['kind'], string[]>>();
  for (const [parentIri, parentEdges] of edgesByParent) {
    const byKind = new Map<DiagramEdge['kind'], string[]>();
    for (const kind of Object.keys(kindOrder) as DiagramEdge['kind'][]) {
      const children: string[] = [];
      for (const e of parentEdges) {
        if (e.kind !== kind) { continue; }
        // A shared child (multiple qualifying parents, FR-011) must not get more than one
        // x-slot allocation — de-dup per parent's own child list only.
        if (!children.includes(e.childIri)) { children.push(e.childIri); }
      }
      byKind.set(kind, children);
    }
    rawChildrenByParentByKind.set(parentIri, byKind);
  }

  function ownChildSet(iri: string): Set<string> {
    const byKind = rawChildrenByParentByKind.get(iri);
    const set = new Set<string>();
    if (!byKind) { return set; }
    for (const list of byKind.values()) {
      for (const c of list) { set.add(c); }
    }
    return set;
  }

  // Group siblings that share a child (grandchild of their common parent) adjacent to one
  // another, e.g. two anatomical wholes that both break down into the same part — a sibling
  // with no shared descendants keeps its relative position, but siblings connected via a
  // shared child are pulled together so the shared child's own average-based cross position
  // (see assignLeafSlots below) doesn't have to straddle an unrelated sibling sitting between
  // them. Connectivity (not just pairwise adjacency) so a 3-way share still forms one cluster.
  function reorderBySharedChildren(siblings: string[]): string[] {
    const n = siblings.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x: number): number {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a: number, b: number): void {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) { parent[ra] = rb; }
    }
    const childSets = siblings.map(ownChildSet);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (childSets[i].size === 0 || childSets[j].size === 0) { continue; }
        let shares = false;
        for (const c of childSets[i]) {
          if (childSets[j].has(c)) { shares = true; break; }
        }
        if (shares) { union(i, j); }
      }
    }
    const groupOf = new Map<number, string[]>();
    const groupOrder: number[] = [];
    for (let i = 0; i < n; i++) {
      const root = find(i);
      let group = groupOf.get(root);
      if (!group) { group = []; groupOf.set(root, group); groupOrder.push(root); }
      group.push(siblings[i]);
    }
    return groupOrder.flatMap(root => groupOf.get(root)!);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [parentIri, byKind] of rawChildrenByParentByKind) {
    const children: string[] = [];
    for (const kind of Object.keys(kindOrder) as DiagramEdge['kind'][]) {
      children.push(...reorderBySharedChildren(byKind.get(kind) ?? []));
    }
    childrenByParent.set(parentIri, children);
  }

  const cross = new Map<string, number>();
  let nextSlot = 0;

  // Root = the unique node with no incoming edge from within the node set (depth 0, by
  // construction from src/uml/partOfGraph.ts — every other node has a parent edge).
  const root = nodes.find(n => n.depth === 0);

  function assignLeafSlots(iri: string): void {
    const children = childrenByParent.get(iri) ?? [];
    if (children.length === 0) {
      cross.set(iri, LEFT_MARGIN + (nextSlot + 0.5) * crossSpacing);
      nextSlot++;
      return;
    }
    for (const child of children) {
      if (!cross.has(child)) { assignLeafSlots(child); }
    }
    const childCrosses = children.map(c => cross.get(c)!);
    cross.set(iri, childCrosses.reduce((a, b) => a + b, 0) / childCrosses.length);
  }

  if (root) { assignLeafSlots(root.iri); }

  // Direct ancestors of the root (`partOfGraph.ts`'s one-hop ancestor pre-pass, depth < 0) are
  // NOT reachable via `childrenByParent` from root — the edge runs ancestor -> root, not the
  // other way — so without this step they'd fall through to the "unreachable node" fallback
  // below and get appended after every one of root's own descendants, landing off to one side
  // instead of centered above the class they're a superclass of. Center them as a group on
  // root's own cross position instead (symmetric about it, spaced the same as siblings), so a
  // lone ancestor lines up exactly with the focus class and multiple ancestors straddle it.
  if (root) {
    const rootCross = cross.get(root.iri)!;
    const ancestors = nodes.filter(n => n.depth < 0);
    ancestors.forEach((n, i) => {
      cross.set(n.iri, rootCross + (i - (ancestors.length - 1) / 2) * crossSpacing);
    });
  }

  // Any node unreachable from root via a parent->child edge (shouldn't happen given
  // partOfGraph.ts's BFS, but keep layout total rather than throwing) still gets a slot.
  for (const n of nodes) {
    if (!cross.has(n.iri)) {
      cross.set(n.iri, LEFT_MARGIN + (nextSlot + 0.5) * crossSpacing);
      nextSlot++;
    }
  }

  // Centering ancestors on root can push their cross value below the left margin (e.g. a single
  // ancestor centered on a root whose own cross is small, or several ancestors straddling it) —
  // shift every node's cross value forward just enough to clear the margin, same non-negative
  // normalization idea as `flowOffset` below but for the cross axis.
  const minCross = Math.min(...cross.values());
  if (minCross < LEFT_MARGIN) {
    const crossShift = LEFT_MARGIN - minCross;
    for (const [iri, v] of cross) { cross.set(iri, v + crossShift); }
  }

  // A direct ancestor of the root (`partOfGraph.ts`'s one-hop ancestor pre-pass) is given a
  // negative depth so it never shares a row/column with the root's own descendants — but the
  // flow coordinate must still be non-negative (rendered as an absolute-positioned pixel offset),
  // so shift every row/column forward by however far below zero the minimum depth's would
  // otherwise be.
  const minDepth = Math.min(0, ...nodes.map(n => depthByIri.get(n.iri) ?? 0));
  const flowOffset = -minDepth * flowSpacing;

  const layout = new Map<string, LayoutPosition>();
  for (const n of nodes) {
    const depth = depthByIri.get(n.iri) ?? 0;
    const flow = depth * flowSpacing + flowOffset;
    const crossVal = cross.get(n.iri)!;
    const pos = direction === 'LR' ? { x: flow, y: crossVal } : { x: crossVal, y: flow };
    layout.set(n.iri, { ...pos, depth });
  }
  return layout;
}
