import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockReasonerProcessCtor = vi.fn();
vi.mock('@core/reasoner/ReasonerProcess', () => ({
  ReasonerProcess: class {
    constructor(...args: unknown[]) { mockReasonerProcessCtor(...args); }
  },
}));

describe('reasonerRuntime', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;
  const originalPath = process.env.PATH;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    process.env.PATH = originalPath;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws PlatformUnsupportedError on a non-darwin/arm64 platform', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });

    const { checkRuntimeAvailable, PlatformUnsupportedError } = await import('../src/reasonerRuntime');
    expect(() => checkRuntimeAvailable()).toThrow(PlatformUnsupportedError);
  });

  it('does not throw PlatformUnsupportedError on darwin/arm64', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'arm64' });

    const { checkRuntimeAvailable, PlatformUnsupportedError } = await import('../src/reasonerRuntime');
    // May still throw RuntimeUnavailableError if the runtime isn't built in this environment —
    // that's a different, expected error class, not PlatformUnsupportedError.
    try {
      checkRuntimeAvailable();
    } catch (err) {
      expect(err).not.toBeInstanceOf(PlatformUnsupportedError);
    }
  });

  it('throws RuntimeUnavailableError (not PlatformUnsupportedError) when the bundled runtime files are missing on a supported platform', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'arm64' });

    // Simulate a corrupted/incomplete install by temporarily hiding the real bundled JRE.
    const fs = await import('fs');
    const path = await import('path');
    const jreDir = path.join(__dirname, '..', 'dist', 'runtime', 'jre');
    const backupDir = `${jreDir}.reasonerRuntime-test-backup`;
    const hadJre = fs.existsSync(jreDir);
    if (hadJre) { fs.renameSync(jreDir, backupDir); }

    try {
      const { checkRuntimeAvailable, RuntimeUnavailableError, PlatformUnsupportedError } = await import('../src/reasonerRuntime');
      expect(() => checkRuntimeAvailable()).toThrow(RuntimeUnavailableError);
      try {
        checkRuntimeAvailable();
      } catch (err) {
        expect(err).not.toBeInstanceOf(PlatformUnsupportedError);
      }
    } finally {
      if (hadJre) {
        fs.rmSync(jreDir, { recursive: true, force: true });
        fs.renameSync(backupDir, jreDir);
      }
    }
  });

  it('FR-004: never uses a system java on PATH — always constructs ReasonerProcess with the bundled, absolute javaPath', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'arm64' });
    // Point PATH at a directory with a fake, obviously-different "java" stub, to prove it's
    // never consulted.
    process.env.PATH = '/fake/system/java/bin';

    const { createReasonerProcess, RuntimeUnavailableError } = await import('../src/reasonerRuntime');

    try {
      createReasonerProcess();
    } catch (err) {
      // If the real bundled runtime isn't present in this test environment, createReasonerProcess
      // throws before ever constructing a ReasonerProcess — that's fine, this test only cares
      // about what happens *when* one is constructed.
      expect(err).toBeInstanceOf(RuntimeUnavailableError);
      return;
    }

    expect(mockReasonerProcessCtor).toHaveBeenCalledTimes(1);
    const [options] = mockReasonerProcessCtor.mock.calls[0] as [{ javaPath: string }];
    expect(options.javaPath).not.toBe('java');
    expect(options.javaPath.startsWith('/fake/system/java')).toBe(false);
    expect(options.javaPath).toMatch(/runtime.*jre.*bin.*java/);
  });
});
