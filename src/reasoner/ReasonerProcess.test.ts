import { describe, it, expect, vi, beforeEach } from 'vitest';

// Deliberately NO `vi.mock('vscode', ...)` anywhere in this file — proving ReasonerProcess has
// zero dependency on the vscode module (unlike ReasonerBridge.test.ts, which must mock it).

// ----- child_process mock -----
const mockWrite = vi.fn().mockReturnValue(true);
const mockStdin = { write: mockWrite };
const mockStdout = { on: vi.fn() };
const mockStderr = { on: vi.fn() };
const mockProc = {
  stdin:  mockStdin,
  stdout: mockStdout,
  stderr: mockStderr,
  on:     vi.fn(),
};

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProc),
}));

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);
vi.mock('fs', () => ({
  promises: { writeFile: (...args: unknown[]) => mockWriteFile(...args), unlink: (...args: unknown[]) => mockUnlink(...args) },
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({ on: vi.fn() })),
}));

import { ReasonerProcess } from './ReasonerProcess.js';
import type { DLQueryResult } from '../model/OntologyModel.js';

type PendingMap = Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;

function resolvePending(rp: ReasonerProcess, payload: string, result: unknown): void {
  const req = JSON.parse(payload) as { id: number };
  const pending = (rp as unknown as Record<string, unknown>)['pending'] as PendingMap;
  const entry = pending.get(req.id);
  if (entry) {
    clearTimeout(entry.timer);
    entry.resolve(result);
  }
}

function rejectPending(rp: ReasonerProcess, payload: string, error: Error): void {
  const req = JSON.parse(payload) as { id: number };
  const pending = (rp as unknown as Record<string, unknown>)['pending'] as PendingMap;
  const entry = pending.get(req.id);
  if (entry) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
}

function makeReasonerProcess(): ReasonerProcess {
  const rp = new ReasonerProcess({ javaPath: '/fake/bin/java', jarPath: '/fake/onto-reasoner-server.jar' });
  (rp as unknown as Record<string, unknown>)['proc'] = mockProc;
  (rp as unknown as Record<string, unknown>)['ready'] = true;
  return rp;
}

describe('ReasonerProcess constructor', () => {
  it('accepts explicit options with no vscode/extensionPath dependency', () => {
    const rp = new ReasonerProcess({
      javaPath: '/fake/bin/java',
      jarPath: '/fake/onto-reasoner-server.jar',
      jvmArgs: ['-Xmx2g'],
      timeoutMs: 5000,
    });
    expect(rp).toBeInstanceOf(ReasonerProcess);
  });

  it('defaults jvmArgs to [-Xmx4g] and timeoutMs to 600000 when omitted', () => {
    const rp = new ReasonerProcess({ javaPath: '/fake/bin/java', jarPath: '/fake/onto-reasoner-server.jar' });
    expect((rp as unknown as { jvmArgs: string[] }).jvmArgs).toEqual(['-Xmx4g']);
    expect((rp as unknown as { timeoutMs: number }).timeoutMs).toBe(600_000);
  });
});

describe('ReasonerProcess.classify / classifyFile', () => {
  let rp: ReasonerProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdout.on.mockImplementation(vi.fn());
    rp = makeReasonerProcess();
  });

  it('sends a classify JSON-RPC request with correct params and resolves the result', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, {
        consistent: true,
        incoherentClasses: [],
        hierarchy: [['http://www.w3.org/2002/07/owl#Thing', 'http://example.org/A']],
        equivalentClasses: [],
      });
      return true;
    });

    const result = await rp.classify('functional', 'Prefix(:=<http://example.org/>)\nOntology(<http://example.org/>)', 'elk');

    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { method: string; params: { format: string; engine: string } };
    expect(req.method).toBe('classify');
    expect(req.params.format).toBe('functional');
    expect(req.params.engine).toBe('elk');
    expect(result.consistent).toBe(true);
  });

  it('classifyFile sends a filePath param instead of content', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, { consistent: true, incoherentClasses: [], hierarchy: [], equivalentClasses: [] });
      return true;
    });

    await rp.classifyFile('functional', '/fake/ontology.ofn', 'auto');

    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { params: { filePath: string } };
    expect(req.params.filePath).toBe('/fake/ontology.ofn');
  });

  it('substitutes a temp file for content larger than 512KB', async () => {
    const bigContent = 'x'.repeat(512_001);
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, { consistent: true, incoherentClasses: [], hierarchy: [], equivalentClasses: [] });
      return true;
    });

    await rp.classify('functional', bigContent, 'auto');

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { params: { filePath?: string; content?: string } };
    expect(req.params.filePath).toBeDefined();
    expect(req.params.content).toBeUndefined();
    expect(mockUnlink).toHaveBeenCalled();
  });

  it('does not use a temp file for small content', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, { consistent: true, incoherentClasses: [], hierarchy: [], equivalentClasses: [] });
      return true;
    });

    await rp.classify('functional', 'small content', 'auto');

    expect(mockWriteFile).not.toHaveBeenCalled();
    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { params: { content?: string } };
    expect(req.params.content).toBe('small content');
  });
});

describe('ReasonerProcess.checkConsistency', () => {
  let rp: ReasonerProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdout.on.mockImplementation(vi.fn());
    rp = makeReasonerProcess();
  });

  it('sends a checkConsistency request and resolves the result', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, { consistent: false, explanation: ['reason'] });
      return true;
    });

    const result = await rp.checkConsistency('functional', 'content');

    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { method: string };
    expect(req.method).toBe('checkConsistency');
    expect(result.consistent).toBe(false);
  });
});

describe('ReasonerProcess.dlQuery', () => {
  let rp: ReasonerProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdout.on.mockImplementation(vi.fn());
    rp = makeReasonerProcess();
  });

  it('sends a dlQuery JSON-RPC request with correct params', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, {
        directSuperClasses: ['http://example.org/Animal'],
        superClasses: [],
        equivalentClasses: [],
        directSubClasses: [],
        subClasses: [],
        instances: [],
      } satisfies DLQueryResult);
      return true;
    });

    const result = await rp.dlQuery(
      'functional',
      'Prefix(:=<http://example.org/>)\nOntology(<http://example.org/>)',
      null,
      'Dog',
      ['directSuperClasses'],
      'auto',
    );

    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { method: string; params: { classExpression: string; queryTypes: string[] } };
    expect(req.method).toBe('dlQuery');
    expect(req.params.classExpression).toBe('Dog');
    expect(req.params.queryTypes).toEqual(['directSuperClasses']);
    expect(result.directSuperClasses).toEqual(['http://example.org/Animal']);
  });

  it('throws when the reasoner returns an error', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      rejectPending(rp, payload, new Error('Could not parse class expression: BadExpr'));
      return true;
    });

    await expect(
      rp.dlQuery('functional', 'content', null, 'BadExpr', ['subClasses'], 'auto'),
    ).rejects.toThrow('Could not parse class expression');
  });
});

describe('ReasonerProcess.convertFormat / validateExpression / isReady / dispose', () => {
  let rp: ReasonerProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStdout.on.mockImplementation(vi.fn());
    rp = makeReasonerProcess();
  });

  it('convertFormat sends the correct request', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, 'converted output');
      return true;
    });

    const result = await rp.convertFormat('content', 'functional', 'manchester');

    const [payload] = mockWrite.mock.calls[0] as [string];
    const req = JSON.parse(payload) as { method: string; params: { fromFormat: string; toFormat: string } };
    expect(req.method).toBe('convertFormat');
    expect(req.params.fromFormat).toBe('functional');
    expect(req.params.toFormat).toBe('manchester');
    expect(result).toBe('converted output');
  });

  it('validateExpression sends the correct request', async () => {
    mockWrite.mockImplementationOnce((payload: string) => {
      resolvePending(rp, payload, { valid: true });
      return true;
    });

    const result = await rp.validateExpression('Dog and Cat');
    expect(result.valid).toBe(true);
  });

  it('isReady reflects the internal ready flag', () => {
    expect(rp.isReady()).toBe(true);
  });

  it('dispose kills the process and rejects pending requests', async () => {
    const kill = vi.fn();
    (rp as unknown as Record<string, unknown>)['proc'] = { ...mockProc, kill };

    const pendingMap = (rp as unknown as Record<string, unknown>)['pending'] as PendingMap;
    let capturedReject: ((e: Error) => void) | undefined;
    const inFlight = new Promise((_resolve, reject) => { capturedReject = reject; });
    pendingMap.set(999, { resolve: () => {}, reject: capturedReject!, timer: setTimeout(() => {}, 100_000) });

    rp.dispose();

    await expect(inFlight).rejects.toThrow('ReasonerProcess disposed');
    expect(kill).toHaveBeenCalled();
  });
});
