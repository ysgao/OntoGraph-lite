import type { LayoutDirection } from './directionControl';

export type ViewMode = 'stated' | 'inferred';

export interface RequestSetViewModeMessage {
  type: 'requestSetViewMode';
  iri: string;
  depth: number;
  direction: LayoutDirection;
  mode: ViewMode;
}

export function buildRequestSetViewModeMessage(
  iri: string,
  depth: number,
  direction: LayoutDirection,
  mode: ViewMode,
): RequestSetViewModeMessage {
  return { type: 'requestSetViewMode', iri, depth, direction, mode };
}
