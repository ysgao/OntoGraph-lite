import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationHistory } from './NavigationHistory';

describe('NavigationHistory', () => {
  let history: NavigationHistory;

  beforeEach(() => {
    history = new NavigationHistory();
  });

  describe('push', () => {
    it('appends an IRI to the back stack', () => {
      history.push('http://example.org/A');
      expect(history.canGoBack).toBe(false); // only 1 entry, need >1 to go back
      expect(history.canGoForward).toBe(false);
    });

    it('records multiple pushes in order', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      expect(history.canGoBack).toBe(true);
    });

    it('suppresses consecutive duplicate IRIs', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/A');
      // Still only 1 entry — cannot go back
      expect(history.canGoBack).toBe(false);
    });

    it('does not suppress non-consecutive duplicates', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.push('http://example.org/A');
      // 3 entries: A, B, A — can go back
      expect(history.canGoBack).toBe(true);
    });

    it('clears the forward stack on new push', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back(); // back to A, forward has B
      expect(history.canGoForward).toBe(true);

      history.push('http://example.org/C'); // new navigation clears forward
      expect(history.canGoForward).toBe(false);
    });

    it('is a no-op for empty string', () => {
      history.push('');
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(false);
    });

    it('trims oldest entry when MAX_DEPTH is exceeded', () => {
      // Push 51 unique IRIs; only the most recent 50 should be retained
      for (let i = 0; i < 51; i++) {
        history.push(`http://example.org/${i}`);
      }
      // back() should work up to 49 times (50 entries, need 2 to go back)
      let steps = 0;
      while (history.canGoBack) {
        const prev = history.back();
        expect(prev).toBeDefined();
        steps++;
      }
      expect(steps).toBe(49); // 50 entries → 49 back steps
    });
  });

  describe('back', () => {
    it('returns the previous IRI and makes it current', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      const prev = history.back();
      expect(prev).toBe('http://example.org/A');
    });

    it('moves the popped IRI to the forward stack', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      expect(history.canGoForward).toBe(true);
    });

    it('returns undefined when back stack has only one entry', () => {
      history.push('http://example.org/A');
      expect(history.back()).toBeUndefined();
    });

    it('returns undefined on an empty history', () => {
      expect(history.back()).toBeUndefined();
    });

    it('navigates through the full history in order', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.push('http://example.org/C');

      expect(history.back()).toBe('http://example.org/B');
      expect(history.back()).toBe('http://example.org/A');
      expect(history.back()).toBeUndefined(); // at oldest
    });
  });

  describe('forward', () => {
    it('returns the next IRI after going back', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.push('http://example.org/C');
      history.back(); // → B
      history.back(); // → A
      expect(history.forward()).toBe('http://example.org/B');
    });

    it('moves the popped IRI back onto the back stack', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      history.forward();
      expect(history.canGoBack).toBe(true); // B is back on top of A
    });

    it('returns undefined when forward stack is empty', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      expect(history.forward()).toBeUndefined();
    });

    it('returns undefined on an empty history', () => {
      expect(history.forward()).toBeUndefined();
    });

    it('round-trips N back + N forward to the same entity', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.push('http://example.org/C');

      history.back(); // → B
      history.back(); // → A
      history.forward(); // → B
      const tip = history.forward(); // → C
      expect(tip).toBe('http://example.org/C');
      expect(history.canGoForward).toBe(false);
    });
  });

  describe('clear', () => {
    it('empties both stacks', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      history.clear();
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(false);
    });

    it('makes back() and forward() return undefined after clearing', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.clear();
      expect(history.back()).toBeUndefined();
      expect(history.forward()).toBeUndefined();
    });
  });

  describe('canGoBack', () => {
    it('is false on empty history', () => {
      expect(history.canGoBack).toBe(false);
    });

    it('is false with exactly one entry', () => {
      history.push('http://example.org/A');
      expect(history.canGoBack).toBe(false);
    });

    it('is true with two or more entries', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      expect(history.canGoBack).toBe(true);
    });

    it('becomes false again after exhausting back navigation', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      expect(history.canGoBack).toBe(false);
    });
  });

  describe('canGoForward', () => {
    it('is false on empty history', () => {
      expect(history.canGoForward).toBe(false);
    });

    it('is false when at the tip of history', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      expect(history.canGoForward).toBe(false);
    });

    it('is true after navigating back', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      expect(history.canGoForward).toBe(true);
    });

    it('becomes false again after a new push', () => {
      history.push('http://example.org/A');
      history.push('http://example.org/B');
      history.back();
      history.push('http://example.org/C');
      expect(history.canGoForward).toBe(false);
    });
  });
});
