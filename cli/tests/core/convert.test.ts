import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runConvert } from '../../src/commands/core/convertCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

describe('convertCommand', () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
    outputs.length = 0;
  });

  it('converts animals.omn (Manchester) to Functional Syntax', async () => {
    const outFile = path.join(os.tmpdir(), 'animals-converted.ofn');
    outputs.push(outFile);
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runConvert(ANIMALS_OMN, 'functional', outFile, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { outputPath: string; outputFormat: string } };
    expect(r.success).toBe(true);
    expect(r.data.outputFormat).toBe('functional');
    expect(fs.existsSync(outFile)).toBe(true);
    const content = fs.readFileSync(outFile, 'utf8');
    expect(content).toContain('Ontology(');
  });

  it('returns UNSUPPORTED_FORMAT for unknown target format', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runConvert(ANIMALS_OMN, 'jsonld', undefined, 5000);
    process.stdout.write = origWrite;
    expect(code).not.toBe(0);
    const r = captured as { success: boolean; errorCode: string };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('UNSUPPORTED_FORMAT');
  });
});
