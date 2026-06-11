import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const MAIN = path.resolve(__dirname, '../../dist/main.js');

describe('no-args behavior', () => {
  it('exits non-zero when no subcommand is given', () => {
    const result = spawnSync('node', [MAIN], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  });

  it('outputs usage information when invoked with no args', () => {
    const result = spawnSync('node', [MAIN], { encoding: 'utf8' });
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    expect(output).toMatch(/Usage|ontograph|help/i);
  });
});
