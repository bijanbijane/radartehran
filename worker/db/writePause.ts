import type { WorkerEnv } from '../types';

export interface D1WritePauseState {
  readonly paused: boolean;
  readonly pauseUntilUtc: string | null;
  readonly retryAfterSeconds: number;
  readonly invalidConfiguration: boolean;
}

/**
 * Resolves the temporary D1 write pause. A configured but invalid deadline
 * fails closed; an absent or expired deadline leaves normal operation enabled.
 */
export function resolveD1WritePauseState(
  env: Partial<Pick<WorkerEnv, 'DB_WRITES_PAUSED_UNTIL_UTC'>> = {},
  nowMs = Date.now(),
): D1WritePauseState {
  const configuredDeadline = env.DB_WRITES_PAUSED_UNTIL_UTC?.trim();
  if (!configuredDeadline) {
    return {
      paused: false,
      pauseUntilUtc: null,
      retryAfterSeconds: 0,
      invalidConfiguration: false,
    };
  }

  const deadlineMs = Date.parse(configuredDeadline);
  if (!Number.isFinite(deadlineMs)) {
    return {
      paused: true,
      pauseUntilUtc: configuredDeadline,
      retryAfterSeconds: 3600,
      invalidConfiguration: true,
    };
  }

  const paused = nowMs < deadlineMs;
  return {
    paused,
    pauseUntilUtc: new Date(deadlineMs).toISOString(),
    retryAfterSeconds: paused
      ? Math.max(1, Math.min(3600, Math.ceil((deadlineMs - nowMs) / 1000)))
      : 0,
    invalidConfiguration: false,
  };
}
