import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import path from 'path';

const MAIN = path.resolve(__dirname, '../../dist/main.js');

describe('help and discoverability', () => {
  it('--help lists all 7 commands', () => {
    const result = execSync(`node ${MAIN} --help`, { encoding: 'utf8' });
    expect(result).toContain('parse');
    expect(result).toContain('search');
    expect(result).toContain('validate');
    expect(result).toContain('convert');
    expect(result).toContain('classify');
    expect(result).toContain('check-consistency');
    expect(result).toContain('dl-query');
  });

  it('parse --help includes required argument', () => {
    const result = execSync(`node ${MAIN} parse --help`, { encoding: 'utf8' });
    expect(result).toContain('file');
  });

  it('convert --help shows --to flag', () => {
    const result = execSync(`node ${MAIN} convert --help`, { encoding: 'utf8' });
    expect(result).toContain('--to');
  });
});
