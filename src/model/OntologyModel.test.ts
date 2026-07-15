import { describe, it, expect } from 'vitest';
import { createEmptyModel, needsClassificationBeforeQuery } from './OntologyModel';

describe('needsClassificationBeforeQuery', () => {
  it('returns true when the ontology has never been classified', () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = false;
    model.classificationNeedsUpdate = false;
    expect(needsClassificationBeforeQuery(model)).toBe(true);
  });

  it('returns false when classified and not stale', () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = true;
    model.classificationNeedsUpdate = false;
    expect(needsClassificationBeforeQuery(model)).toBe(false);
  });

  it('returns true when classified but stale (classificationNeedsUpdate)', () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = true;
    model.classificationNeedsUpdate = true;
    expect(needsClassificationBeforeQuery(model)).toBe(true);
  });
});
