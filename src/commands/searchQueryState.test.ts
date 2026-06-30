import { describe, it, expect, beforeEach } from 'vitest';
import { getSearchQuery, setSearchQuery, resetSearchQuery } from './searchQueryState.js';

describe('searchQueryState', () => {
  beforeEach(() => {
    resetSearchQuery();
  });

  it('lastSearchQuery starts empty', () => {
    expect(getSearchQuery()).toBe('');
  });

  it('query retained after typing', () => {
    setSearchQuery('liver structure');
    expect(getSearchQuery()).toBe('liver structure');
  });

  it('empty string retained after clear', () => {
    setSearchQuery('liver structure');
    setSearchQuery('');
    expect(getSearchQuery()).toBe('');
  });

  it('query resets on ontology load', () => {
    setSearchQuery('body structure');
    resetSearchQuery();
    expect(getSearchQuery()).toBe('');
  });

  it('most recent value wins', () => {
    setSearchQuery('liver');
    setSearchQuery('kidney');
    expect(getSearchQuery()).toBe('kidney');
  });
});
