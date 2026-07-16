import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runSearch } from '../../src/commands/core/searchCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

async function capture(file: string, query: string): Promise<{ code: number; body: unknown }> {
  let captured: unknown;
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  const code = await runSearch(file, query, 20, undefined, 5000);
  process.stdout.write = origWrite;
  return { code, body: captured };
}

describe('searchCommand', () => {
  it('returns matching entities for query "Animal"', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'Animal');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { totalMatches: number; results: { iri: string }[] } };
    expect(r.success).toBe(true);
    expect(r.data.totalMatches).toBeGreaterThan(0);
    expect(r.data.results.length).toBeGreaterThan(0);
  });

  it('reports a unique exact label match in exactMatches', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'Koala');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { exactMatches: { iri: string }[] } };
    expect(r.success).toBe(true);
    expect(r.data.exactMatches).toHaveLength(1);
    expect(r.data.exactMatches[0].iri).toBe('http://example.org/animals#Koala');
  });

  it('surfaces multiple exactMatches when the label is ambiguous', async () => {
    const tmpFile = path.join(os.tmpdir(), 'search-ambiguous.ofn');
    const src = `Prefix(:=<http://example.org/dup#>)
Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
Ontology(<http://example.org/dup>
  Declaration(Class(:A))
  Declaration(Class(:B))
  AnnotationAssertion(rdfs:label :A "Middle ear structure"@en)
  AnnotationAssertion(rdfs:label :B "Middle ear structure"@en)
)`;
    fs.writeFileSync(tmpFile, src);
    try {
      const { code, body } = await capture(tmpFile, 'Middle ear structure');
      expect(code).toBe(0);
      const r = body as { success: boolean; data: { exactMatches: { iri: string }[] } };
      expect(r.success).toBe(true);
      expect(r.data.exactMatches).toHaveLength(2);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns empty results for unmatched query', async () => {
    let captured: unknown;
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
    const code = await runSearch(ANIMALS_OMN, 'xyzzy__no_match_999', 20, undefined, 5000);
    process.stdout.write = origWrite;
    expect(code).toBe(0);
    const r = captured as { success: boolean; data: { totalMatches: number } };
    expect(r.success).toBe(true);
    expect(r.data.totalMatches).toBe(0);
  });
});
