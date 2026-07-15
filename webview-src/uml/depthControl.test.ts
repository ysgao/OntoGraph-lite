import { describe, it, expect } from 'vitest';
import { buildRequestDepthChangeMessage, clampDepth, DEPTH_MIN, DEPTH_MAX } from './depthControl';

describe('clampDepth', () => {
  it('leaves an in-range depth unchanged', () => {
    expect(clampDepth(3)).toBe(3);
  });

  it('clamps below DEPTH_MIN up to DEPTH_MIN', () => {
    expect(clampDepth(0)).toBe(DEPTH_MIN);
  });

  it('clamps above DEPTH_MAX down to DEPTH_MAX', () => {
    expect(clampDepth(99)).toBe(DEPTH_MAX);
  });
});

describe('buildRequestDepthChangeMessage', () => {
  it('carries the current focus IRI, the new (clamped) depth value, and the current direction', () => {
    const msg = buildRequestDepthChangeMessage('http://example.org#Whole', 2, 'TB');
    expect(msg).toEqual({ type: 'requestDepthChange', iri: 'http://example.org#Whole', depth: 2, direction: 'TB' });
  });

  it('clamps an out-of-range slider value before building the message', () => {
    const msg = buildRequestDepthChangeMessage('http://example.org#Whole', 999, 'LR');
    expect(msg.depth).toBe(DEPTH_MAX);
    expect(msg.direction).toBe('LR');
  });
});
