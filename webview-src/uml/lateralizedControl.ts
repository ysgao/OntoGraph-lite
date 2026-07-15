import type { LayoutDirection } from './directionControl';

export interface RequestToggleLateralizedMessage {
  type: 'requestToggleLateralized';
  iri: string;
  depth: number;
  direction: LayoutDirection;
  include: boolean;
}

export function buildRequestToggleLateralizedMessage(
  iri: string,
  depth: number,
  direction: LayoutDirection,
  include: boolean,
): RequestToggleLateralizedMessage {
  return { type: 'requestToggleLateralized', iri, depth, direction, include };
}
