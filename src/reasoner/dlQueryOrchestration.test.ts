import { describe, it, expect, vi } from 'vitest';
import { createEmptyModel } from '../model/OntologyModel';
import { runDlQueryWithClassifyFirst } from './dlQueryOrchestration';

describe('runDlQueryWithClassifyFirst', () => {
  it('classifies before running the query when classification is needed', async () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = false;
    const order: string[] = [];
    const classify = vi.fn(async () => { order.push('classify'); });
    const runQuery = vi.fn(async () => { order.push('query'); return 'result'; });

    const result = await runDlQueryWithClassifyFirst(model, classify, runQuery);

    expect(order).toEqual(['classify', 'query']);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('skips classification and runs the query directly when already classified and fresh', async () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = true;
    model.classificationNeedsUpdate = false;
    const classify = vi.fn(async () => {});
    const runQuery = vi.fn(async () => 'result');

    const result = await runDlQueryWithClassifyFirst(model, classify, runQuery);

    expect(classify).not.toHaveBeenCalled();
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('rejects with the classify failure and never calls runQuery when classification fails', async () => {
    const model = createEmptyModel('file:///test.ofn');
    model.isClassified = false;
    const classifyError = new Error('Ontology is inconsistent');
    const classify = vi.fn(async () => { throw classifyError; });
    const runQuery = vi.fn(async () => 'result');

    await expect(runDlQueryWithClassifyFirst(model, classify, runQuery)).rejects.toBe(classifyError);
    expect(runQuery).not.toHaveBeenCalled();
  });
});
