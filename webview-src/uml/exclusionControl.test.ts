import { describe, it, expect } from 'vitest';
import { buildRequestRegenerateMessage, buildResetExclusionsMessage } from './exclusionControl';

describe('buildRequestRegenerateMessage', () => {
  it('carries the focus IRI, depth, direction, marked IRIs, and the chosen exclusion mode', () => {
    const msg = buildRequestRegenerateMessage('http://example.org#Root', 2, 'TB', ['http://example.org#Bone'], 'subtree');
    expect(msg).toEqual({
      type: 'requestRegenerate',
      iri: 'http://example.org#Root',
      depth: 2,
      direction: 'TB',
      excludeIris: ['http://example.org#Bone'],
      mode: 'subtree',
    });
  });

  it('preserves the order and contents of multiple marked IRIs', () => {
    const msg = buildRequestRegenerateMessage('http://example.org#Root', 1, 'LR', ['a', 'b', 'c'], 'splice');
    expect(msg.excludeIris).toEqual(['a', 'b', 'c']);
    expect(msg.mode).toBe('splice');
    expect(msg.direction).toBe('LR');
  });
});

describe('buildResetExclusionsMessage', () => {
  it('carries the current focus IRI, depth, and direction', () => {
    const msg = buildResetExclusionsMessage('http://example.org#Root', 2, 'TB');
    expect(msg).toEqual({ type: 'resetExclusions', iri: 'http://example.org#Root', depth: 2, direction: 'TB' });
  });
});
