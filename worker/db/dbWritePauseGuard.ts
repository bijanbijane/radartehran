export interface DbWritePauseState {
  readonly pausedUntilUtc: string;
  readonly retryAfterSeconds: number;
  readonly configurationInvalid: boolean;
}

const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function resolveDbWritePauseState(value?: string, nowMs = Date.now()): DbWritePauseState | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const timestamp = Date.parse(raw);
  if (!UTC_ISO_TIMESTAMP.test(raw) || !Number.isFinite(timestamp)) {
    return {
      pausedUntilUtc: raw,
      retryAfterSeconds: 3_600,
      configurationInvalid: true,
    };
  }
  if (timestamp <= nowMs) return null;

  return {
    pausedUntilUtc: new Date(timestamp).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((timestamp - nowMs) / 1_000)),
    configurationInvalid: false,
  };
}

/**
 * Read-only requests remain available during a write freeze.
 * Privacy requests and session revocation remain available because they are
 * user-rights/security operations rather than ordinary product mutations.
 */
export function isDbWritePauseExempt(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') return true;

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (normalizedMethod !== 'POST') return false;
  if (
    normalizedPath === '/api/account/deletion-requests' ||
    normalizedPath === '/api/account/deletion-requests/reconcile' ||
    normalizedPath === '/api/account/data-requests'
  ) return true;
  return /^\/api\/account\/sessions\/[^/]+\/revoke$/.test(normalizedPath);
}
