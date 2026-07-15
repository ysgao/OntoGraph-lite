import type { LayoutDirection } from './directionControl';

export type ExclusionMode = 'subtree' | 'splice';

export interface RequestRegenerateMessage {
  type: 'requestRegenerate';
  iri: string;
  depth: number;
  direction: LayoutDirection;
  excludeIris: string[];
  mode: ExclusionMode;
}

export interface ResetExclusionsMessage {
  type: 'resetExclusions';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

export function buildRequestRegenerateMessage(
  iri: string,
  depth: number,
  direction: LayoutDirection,
  excludeIris: string[],
  mode: ExclusionMode,
): RequestRegenerateMessage {
  return { type: 'requestRegenerate', iri, depth, direction, excludeIris, mode };
}

export function buildResetExclusionsMessage(iri: string, depth: number, direction: LayoutDirection): ResetExclusionsMessage {
  return { type: 'resetExclusions', iri, depth, direction };
}
