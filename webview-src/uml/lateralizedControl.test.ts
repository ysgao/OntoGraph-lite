import { describe, it, expect } from 'vitest';
import { buildRequestToggleLateralizedMessage } from './lateralizedControl';

describe('buildRequestToggleLateralizedMessage', () => {
  it('carries the current focus IRI, depth, direction, and the newly requested include state', () => {
    const msg = buildRequestToggleLateralizedMessage('http://example.org#Root', 2, 'TB', true);
    expect(msg).toEqual({
      type: 'requestToggleLateralized', iri: 'http://example.org#Root', depth: 2, direction: 'TB', include: true,
    });
  });

  it('carries include: false when toggling back off', () => {
    const msg = buildRequestToggleLateralizedMessage('http://example.org#Root', 1, 'LR', false);
    expect(msg.include).toBe(false);
  });
});
