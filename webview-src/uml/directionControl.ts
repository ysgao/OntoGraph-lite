// Layout flow direction (src/uml/layout.ts) — 'LR' (left-to-right) is the product default
// (`ontograph.umlDiagram.defaultDirection`); 'TB' (top-to-bottom) is a user-selectable
// alternative via the toolbar toggle. This constant only covers the brief window before the
// host's first 'updateDiagram' response arrives (see UmlDiagramApp.ts's 'ready' handshake) —
// it must match that response's actual default so the toolbar select doesn't visibly flip.
export type LayoutDirection = 'TB' | 'LR';

export const DEFAULT_DIRECTION: LayoutDirection = 'LR';

export interface RequestDirectionChangeMessage {
  type: 'requestDirectionChange';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

export function buildRequestDirectionChangeMessage(iri: string, depth: number, direction: LayoutDirection): RequestDirectionChangeMessage {
  return { type: 'requestDirectionChange', iri, depth, direction };
}
