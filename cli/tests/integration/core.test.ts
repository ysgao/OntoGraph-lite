import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const MAIN = path.resolve(__dirname, '../../dist/main.js');
const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS = path.join(ROOT, 'test-ontologies/animals.omn');
const BFO = path.join(ROOT, 'test-ontologies/bfo-core.ofn');
const PIZZA = path.join(ROOT, 'test-ontologies/pizza.owl');

function run(args: string): { data: Record<string, unknown>; success: boolean; durationMs: number } {
  const stdout = execSync(`node ${MAIN} ${args}`, { encoding: 'utf8' });
  return JSON.parse(stdout);
}

describe('core integration — parse', () => {
  it('animals.omn: valid JSON, classCount > 0, durationMs < 5000', () => {
    const r = run(`parse ${ANIMALS}`);
    expect(r.success).toBe(true);
    expect((r.data.classCount as number)).toBeGreaterThan(0);
    expect(r.durationMs).toBeLessThan(5000);
  });

  it('bfo-core.ofn: valid JSON, classCount > 0, durationMs < 5000', () => {
    const r = run(`parse ${BFO}`);
    expect(r.success).toBe(true);
    expect((r.data.classCount as number)).toBeGreaterThan(0);
    expect(r.durationMs).toBeLessThan(5000);
  });

  it('pizza.owl: valid JSON, classCount > 0, durationMs < 5000', () => {
    const r = run(`parse ${PIZZA}`);
    expect(r.success).toBe(true);
    expect((r.data.classCount as number)).toBeGreaterThan(0);
    expect(r.durationMs).toBeLessThan(5000);
  });
});

describe('core integration — search', () => {
  it('animals.omn: search Animal returns match', () => {
    const r = run(`search ${ANIMALS} Animal`);
    expect(r.success).toBe(true);
    expect((r.data.totalMatches as number)).toBeGreaterThan(0);
    expect(r.durationMs).toBeLessThan(5000);
  });

  it('pizza.owl: search Pizza returns match', () => {
    const r = run(`search ${PIZZA} Pizza`);
    expect(r.success).toBe(true);
    expect((r.data.totalMatches as number)).toBeGreaterThan(0);
  });
});
