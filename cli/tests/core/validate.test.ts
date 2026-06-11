import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runValidate } from '../../src/commands/core/validateCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

describe('validateCommand', () => {
  it('returns valid: true for a well-formed ontology', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runValidate(ANIMALS_OMN, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { valid: boolean; issues: unknown[] } };
    expect(r.success).toBe(true);
    expect(r.data.valid).toBe(true);
  });

  it('returns error for a deliberately malformed OWL file', async () => {
    const tmp = path.join(os.tmpdir(), 'bad-ontology.ofn');
    fs.writeFileSync(tmp, 'this is not valid OWL syntax at all @#$%');
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    await runValidate(tmp, 5000);
    process.stdout.write = origWrite;
    fs.unlinkSync(tmp);
    const r = captured as { success: boolean; data?: { valid: boolean }; errorCode?: string };
    // Either a parse error or valid:false with issues
    expect(r.success === false || r.data?.valid === false).toBe(true);
  });
});
