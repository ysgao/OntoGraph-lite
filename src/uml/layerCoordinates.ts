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
