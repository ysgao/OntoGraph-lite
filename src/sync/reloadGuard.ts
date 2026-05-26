let suppressUntil = 0;

export function suppressReloadFor(ms: number): void {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

export function isReloadSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
