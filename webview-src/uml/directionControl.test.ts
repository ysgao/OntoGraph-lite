import { describe, it, expect } from 'vitest';
import { buildRequestDirectionChangeMessage, DEFAULT_DIRECTION } from './directionControl';

describe('DEFAULT_DIRECTION', () => {
  it('defaults to left-to-right', () => {
    expect(DEFAULT_DIRECTION).toBe('LR');
  });
});

describe('buildRequestDirectionChangeMessage', () => {
  it('carries the current focus IRI, depth, and the newly selected direction', () => {
    const msg = buildRequestDirectionChangeMessage('http://example.org#Whole', 2, 'LR');
    expect(msg).toEqual({ type: 'requestDirectionChange', iri: 'http://example.org#Whole', depth: 2, direction: 'LR' });
  });
});
