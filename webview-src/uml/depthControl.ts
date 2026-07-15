import type { LayoutDirection } from './directionControl';

// Matches the bounds of the ontograph.umlDiagram.defaultDepth setting (package.json) and the
// existing Graph view's depth slider (webview-src/graph/GraphViewApp.ts).
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 5;

export function clampDepth(value: number): number {
  return Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, Math.round(value)));
}

export interface RequestDepthChangeMessage {
  type: 'requestDepthChange';
  iri: string;
  depth: number;
  direction: LayoutDirection;
}

export function buildRequestDepthChangeMessage(iri: string, depth: number, direction: LayoutDirection): RequestDepthChangeMessage {
  return { type: 'requestDepthChange', iri, depth: clampDepth(depth), direction };
}
