/**
 * Assigns each layer's occupants (real nodes and/or dummy nodes, mixed) a cross-axis coordinate
 * via a running cumulative sum of widths — never by computing a position and then checking/
 * clamping it against a neighbor after the fact. Two adjacent occupants in the SAME layer can
 * therefore never overlap, regardless of their order or width: the position IS the sum, not an
 * independently-derived value a clamp has to fix up (`LayeredGraphAlgorithm.md` §4).
 *
 * Each layer starts fresh from `leftMargin` — layers are independent of one another; only the
 * FLOW axis (row/column index, assigned elsewhere) separates them.
 */
export function assignLayerCoordinates(
  layerOrder: Map<number, string[]>,
  widthById: Map<string, number>,
  gap: number,
  leftMargin: number,
): Map<string, number> {
  const cross = new Map<string, number>();
  for (const order of layerOrder.values()) {
    let cumulative = leftMargin;
    for (const id of order) {
      const width = widthById.get(id) ?? 0;
      cross.set(id, cumulative + width / 2);
      cumulative += width + gap;
    }
  }
  return cross;
}

/**
 * Order-preserving, overlap-free packing of ONE layer toward a per-occupant DESIRED coordinate.
 * A node with no desire keeps its current coordinate. Runs the crowd-resolution twice — once
 * left-to-right (each occupant pushed at least far enough right of its predecessor) and once
 * right-to-left (pulled left of its successor) — then averages the two. Averaging two arrangements
 * that each already satisfy the minimum centre-to-centre separation yields one that still does
 * (the average of two values each ≥ S is ≥ S) AND is unbiased: the pure left-to-right pass alone
 * would jam a crowded layer against the left margin, the reverse against the right; their mean
 * sits balanced. Preserves the given order exactly.
 */
function packLayerToward(
  order: string[],
  desired: Map<string, number>,
  current: Map<string, number>,
  widthById: Map<string, number>,
  gap: number,
  leftMargin: number,
): Map<string, number> {
  const want = (id: string): number => desired.get(id) ?? current.get(id) ?? leftMargin;
  const half = (id: string): number => (widthById.get(id) ?? 0) / 2;

  const ltr = new Map<string, number>();
  let rightEdge = -Infinity;
  for (const id of order) {
    const lower = (rightEdge === -Infinity ? leftMargin : rightEdge + gap) + half(id);
    const c = Math.max(want(id), lower);
    ltr.set(id, c);
    rightEdge = c + half(id);
  }

  const rtl = new Map<string, number>();
  let leftEdge = Infinity;
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const upper = leftEdge === Infinity ? Infinity : leftEdge - gap - half(id);
    const c = Math.min(want(id), upper);
    rtl.set(id, c);
    leftEdge = c - half(id);
  }

  const out = new Map<string, number>();
  for (const id of order) { out.set(id, (ltr.get(id)! + rtl.get(id)!) / 2); }
  return out;
}

/**
 * Tidy, parent-over-children coordinate assignment (the layout users expect from a class/part-of
 * tree — a parent sits horizontally in the middle of the span of its subtypes/compositions, not
 * merely at the same even pitch as unrelated siblings). Starts from the flat cumulative packing
 * (which fixes each layer's order and guarantees no overlap), then alternately sweeps:
 *
 *  - UP (deepest→shallowest): each occupant desires the MIDPOINT of its children's current span,
 *    so a parent centres over its children.
 *  - DOWN (shallowest→deepest): each occupant desires the MEAN of its parents' positions, so a
 *    lone child tucks under its parent and a shared child balances between them.
 *
 * After each per-layer desire is computed, `packLayerToward` re-packs that layer order-preserving
 * and overlap-free. A chain dummy (exactly one parent, one child) desires its neighbour's x in
 * both sweeps, so multi-layer edges stay vertical. Occupants at negative layers (root ancestors)
 * are left untouched — the caller positions those as a symmetric group about the root instead.
 */
export function assignBalancedCoordinates(
  layerOrder: Map<number, string[]>,
  sortedLayers: number[],
  widthById: Map<string, number>,
  childrenByOccupant: Map<string, string[]>,
  layerOfId: Map<string, number>,
  gap: number,
  leftMargin: number,
  iterations = 8,
): Map<string, number> {
  const pos = assignLayerCoordinates(layerOrder, widthById, gap, leftMargin);

  const parentsByOccupant = new Map<string, string[]>();
  for (const [parent, kids] of childrenByOccupant) {
    for (const k of kids) {
      const arr = parentsByOccupant.get(k) ?? [];
      arr.push(parent);
      parentsByOccupant.set(k, arr);
    }
  }

  const adjustable = (id: string): boolean => (layerOfId.get(id) ?? 0) >= 0;
  const positive = sortedLayers.filter(l => l >= 0);

  const sweep = (layers: number[], desireOf: (id: string) => number | undefined): void => {
    for (const layer of layers) {
      const order = layerOrder.get(layer);
      if (!order || order.length === 0) { continue; }
      const desired = new Map<string, number>();
      for (const id of order) {
        const d = desireOf(id);
        if (d !== undefined) { desired.set(id, d); }
      }
      const packed = packLayerToward(order, desired, pos, widthById, gap, leftMargin);
      for (const [id, v] of packed) { pos.set(id, v); }
    }
  };

  for (let it = 0; it < iterations; it++) {
    // UP: parent → midpoint of its children's span.
    sweep([...positive].reverse(), (id) => {
      const kids = (childrenByOccupant.get(id) ?? []).filter(k => pos.has(k));
      if (kids.length === 0) { return undefined; }
      const xs = kids.map(k => pos.get(k)!);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    });
    // DOWN: child → mean of its (non-ancestor) parents.
    sweep(positive, (id) => {
      const parents = (parentsByOccupant.get(id) ?? []).filter(p => pos.has(p) && adjustable(p));
      if (parents.length === 0) { return undefined; }
      return parents.reduce((a, p) => a + pos.get(p)!, 0) / parents.length;
    });
  }

  return pos;
}
