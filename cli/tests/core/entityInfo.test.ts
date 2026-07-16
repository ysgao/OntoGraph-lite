import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runEntityInfo } from '../../src/commands/core/entityInfoCommand';

const ROOT = path.resolve(__dirname, '../../../');
const ANIMALS_OMN = path.join(ROOT, 'test-ontologies/animals.omn');

async function capture(file: string, iriOrLabel: string): Promise<{ code: number; body: unknown }> {
  let captured: unknown;
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown) => { captured = JSON.parse(chunk as string); return true; };
  const code = await runEntityInfo(file, iriOrLabel, 5000);
  process.stdout.write = origWrite;
  return { code, body: captured };
}

describe('entityInfoCommand', () => {
  it('still resolves a literal IRI directly (existing behavior)', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'http://example.org/animals#Koala');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { iri: string; localName: string } };
    expect(r.success).toBe(true);
    expect(r.data.localName).toBe('Koala');
  });

  it('resolves a bare local name, case-insensitively', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'koala');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { iri: string; localName: string } };
    expect(r.success).toBe(true);
    expect(r.data.localName).toBe('Koala');
  });

  it('renders superClassExpressions with labels instead of raw IRIs', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'koala');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { superClassExpressions?: string[] } };
    expect(r.success).toBe(true);
    expect(r.data.superClassExpressions).toContain('has habitat some Forest');
  });

  it('returns superClasses as {iri, label} refs, not bare local names', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'koala');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { superClasses?: { iri: string; label: string | null }[] } };
    expect(r.success).toBe(true);
    expect(r.data.superClasses).toContainEqual({ iri: 'http://example.org/animals#Marsupial', label: 'Marsupial' });
  });

  describe('label differs from local name (SNOMED-style numeric IRIs)', () => {
    const tmpFile = path.join(os.tmpdir(), 'entity-info-snomed-style.ofn');
    const src = `Prefix(:=<http://example.org/snomed#>)
Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
Ontology(<http://example.org/snomed>
  Declaration(Class(:41695006))
  AnnotationAssertion(rdfs:label :41695006 "Middle ear structure"@en)
)`;
    fs.writeFileSync(tmpFile, src);

    it('resolves the label to its numeric-IRI entity', async () => {
      const { code, body } = await capture(tmpFile, 'Middle ear structure');
      expect(code).toBe(0);
      const r = body as { success: boolean; data: { localName: string } };
      expect(r.success).toBe(true);
      expect(r.data.localName).toBe('41695006');
      fs.unlinkSync(tmpFile);
    });
  });

  describe('direct subclass via a complex stated superclass expression', () => {
    const tmpFile = path.join(os.tmpdir(), 'entity-info-conjunct-subclass.ofn');
    const src = `Prefix(:=<http://example.org/anat#>)
Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
Ontology(<http://example.org/anat>
  Declaration(Class(:MiddleEar))
  Declaration(Class(:OtherThing))
  Declaration(Class(:Sub))
  AnnotationAssertion(rdfs:label :MiddleEar "Middle ear structure"@en)
  AnnotationAssertion(rdfs:label :Sub "Some subclass"@en)
  SubClassOf(:Sub ObjectIntersectionOf(:OtherThing :MiddleEar))
)`;
    fs.writeFileSync(tmpFile, src);

    it('includes the subclass, not just plain SubClassOf/EquivalentClasses cases', async () => {
      const { code, body } = await capture(tmpFile, 'Middle ear structure');
      expect(code).toBe(0);
      const r = body as { success: boolean; data: { directSubClasses?: { iri: string; label: string | null }[] } };
      expect(r.success).toBe(true);
      expect(r.data.directSubClasses).toContainEqual({ iri: 'http://example.org/anat#Sub', label: 'Some subclass' });
      fs.unlinkSync(tmpFile);
    });
  });

  it('resolves a multi-word label', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'Some Forest');
    expect(code).toBe(0);
    const r = body as { success: boolean; data: { localName: string } };
    expect(r.success).toBe(true);
    expect(r.data.localName).toBe('someForest');
  });

  it('returns NOT_FOUND with suggestions for an unmatched label', async () => {
    const { code, body } = await capture(ANIMALS_OMN, 'Koal');
    expect(code).not.toBe(0);
    const r = body as { success: boolean; errorCode: string; data?: { suggestions: { iri: string; label: string | null }[] } };
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_FOUND');
    expect(r.data?.suggestions.some(s => s.label === 'Koala')).toBe(true);
  });

  describe('ambiguous labels', () => {
    const tmpFile = path.join(os.tmpdir(), 'entity-info-ambiguous.ofn');
    const src = `Prefix(:=<http://example.org/dup#>)
Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
Ontology(<http://example.org/dup>
  Declaration(Class(:A))
  Declaration(Class(:B))
  AnnotationAssertion(rdfs:label :A "Middle ear structure"@en)
  AnnotationAssertion(rdfs:label :B "Middle ear structure"@en)
)`;
    fs.writeFileSync(tmpFile, src);
    afterEach(() => { /* keep file across tests in this block */ });

    it('returns AMBIGUOUS_MATCH listing all candidates', async () => {
      const { code, body } = await capture(tmpFile, 'Middle ear structure');
      expect(code).not.toBe(0);
      const r = body as { success: boolean; errorCode: string; data?: { candidates: { iri: string }[] } };
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('AMBIGUOUS_MATCH');
      expect(r.data?.candidates.length).toBe(2);
      fs.unlinkSync(tmpFile);
    });
  });
});
