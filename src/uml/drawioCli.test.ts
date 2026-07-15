import { describe, it, expect, vi } from 'vitest';
import { pickPngScale, resolveDrawioBinary } from './drawioCli';

describe('pickPngScale', () => {
  it('uses scale 2 for a narrow diagram well under the texture size cap', () => {
    expect(pickPngScale(2760)).toBe(2);
  });

  it('drops to scale 1 when scale 2 would meet or exceed the 16384px texture cap (spec §8.1)', () => {
    expect(pickPngScale(8500)).toBe(1); // 8500*2 = 17000 >= 16384
  });

  it('is right at the boundary — exactly at the cap still drops to scale 1', () => {
    expect(pickPngScale(8192)).toBe(1); // 8192*2 = 16384, meets the cap exactly
  });

  it('respects a custom max texture size', () => {
    expect(pickPngScale(3000, 5000)).toBe(1); // 3000*2=6000 >= 5000
    expect(pickPngScale(2000, 5000)).toBe(2); // 2000*2=4000 < 5000
  });
});

describe('resolveDrawioBinary', () => {
  it('prefers the known macOS app bundle path when it exists', () => {
    const bin = resolveDrawioBinary('darwin', () => true);
    expect(bin).toContain('draw.io.app');
  });

  it('falls back to the "drawio" PATH command when the macOS bundle is absent', () => {
    const bin = resolveDrawioBinary('darwin', () => false);
    expect(bin).toBe('drawio');
  });

  it('uses the PATH command on non-macOS platforms regardless of existsSync', () => {
    expect(resolveDrawioBinary('linux', () => true)).toBe('drawio');
    expect(resolveDrawioBinary('win32', () => true)).toBe('drawio');
  });
});
