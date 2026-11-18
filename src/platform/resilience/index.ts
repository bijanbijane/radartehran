/**
 * @file src/platform/resilience/index.ts
 * @description Stage 14 (RT-FE-REBUILD-FRONTEND-RESILIENCE-014) — Operational Resilience,
 * 10-Domain Fault Isolation, Service Circuit Breaker, Stale Response Guard, Recovery Snapshot & Cross-Tab Sync.
 */

export const RT_FE_REBUILD_STAGE_14_SPEC_ID = 'RT-FE-REBUILD-FRONTEND-RESILIENCE-014' as const;

export const TEN_FAILURE_ISOLATION_DOMAINS = [
  'map',
  'market_intelligence',
  'property_search',
  'valuation',
  'messaging',
  'notifications',
  'services_marketplace',
  'community',
  'account',
  'admin',
] as const;

export type FailureIsolationDomain = (typeof TEN_FAILURE_ISOLATION_DOMAINS)[number];
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type OperationStatus = 'idle' | 'pending' | 'confirmed' | 'failed' | 'unknown' | 'cancelled';

export type CrossTabEventType =
  | 'AUTH_LOGOUT'
  | 'ACCOUNT_CHANGED'
  | 'WORKSPACE_CHANGED'
  | 'CITY_CONTEXT_CHANGED'
  | 'DRAFT_UPDATED'
  | 'NOTIFICATION_READ_SYNC';

export interface CrossTabEventPayload {
  readonly type: CrossTabEventType;
  readonly tabId: string;
  readonly timestampMs: number;
  readonly payload: Record<string, unknown>;
}

export interface RecoverySnapshot<T> {
  readonly version: number;
  readonly ownerKey: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly data: T;
}

export class ServiceCircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAtMs = 0;

  constructor(
    public readonly serviceId: string,
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 15_000,
  ) {}

  getState(nowMs = Date.now()): CircuitBreakerState {
    if (this.state === 'OPEN' && nowMs - this.openedAtMs >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  canExecute(nowMs = Date.now()): boolean {
    return this.getState(nowMs) !== 'OPEN';
  }

  recordSuccess(): CircuitBreakerState {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    return this.state;
  }

  recordFailure(nowMs = Date.now()): CircuitBreakerState {
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAtMs = nowMs;
    }
    return this.state;
  }
}

export class RequestSequenceController {
  private latestSeq = 0;
  private activeContextKey = '';

  issueRequest(contextKey: string): { readonly requestId: number; readonly contextKey: string } {
    this.latestSeq += 1;
    this.activeContextKey = contextKey;
    return { requestId: this.latestSeq, contextKey };
  }

  shouldAcceptResponse(requestId: number, contextKey: string): {
    readonly accepted: boolean;
    readonly reasonCode: 'FRESH_MATCH' | 'STALE_SEQUENCE' | 'CONTEXT_CHANGED';
  } {
    if (contextKey !== this.activeContextKey) {
      return { accepted: false, reasonCode: 'CONTEXT_CHANGED' };
    }
    if (requestId !== this.latestSeq) {
      return { accepted: false, reasonCode: 'STALE_SEQUENCE' };
    }
    return { accepted: true, reasonCode: 'FRESH_MATCH' };
  }
}

export function createRecoverySnapshot<T>(input: {
  version: number;
  ownerKey: string;
  data: T;
  ttlMs?: number;
  nowMs?: number;
}): RecoverySnapshot<T> {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? 30 * 60_000;
  return {
    version: input.version,
    ownerKey: input.ownerKey,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    data: input.data,
  };
}

export function validateRecoverySnapshot<T>(
  snapshot: RecoverySnapshot<T> | null | undefined,
  expectedVersion: number,
  expectedOwnerKey: string,
  nowMs = Date.now(),
): {
  readonly valid: boolean;
  readonly reasonCode: 'VALID' | 'MISSING' | 'VERSION_MISMATCH' | 'OWNER_MISMATCH' | 'EXPIRED';
} {
  if (!snapshot) return { valid: false, reasonCode: 'MISSING' };
  if (snapshot.version !== expectedVersion) return { valid: false, reasonCode: 'VERSION_MISMATCH' };
  if (snapshot.ownerKey !== expectedOwnerKey) return { valid: false, reasonCode: 'OWNER_MISMATCH' };
  if (nowMs > snapshot.expiresAtMs) return { valid: false, reasonCode: 'EXPIRED' };
  return { valid: true, reasonCode: 'VALID' };
}

export function reconcileThreeLayerState<T>(input: {
  serverState: T | null;
  localDraftState: T | null;
  optimisticState: T | null;
  operationStatus: OperationStatus;
}): {
  readonly authoritativeDisplayState: T | null;
  readonly isConfirmedByServer: boolean;
  readonly preserveLocalDraftForRetry: boolean;
} {
  if (input.operationStatus === 'confirmed' && input.serverState !== null) {
    return {
      authoritativeDisplayState: input.serverState,
      isConfirmedByServer: true,
      preserveLocalDraftForRetry: false,
    };
  }
  if (input.operationStatus === 'failed' || input.operationStatus === 'unknown') {
    return {
      authoritativeDisplayState: input.serverState,
      isConfirmedByServer: false,
      preserveLocalDraftForRetry: input.localDraftState !== null,
    };
  }
  return {
    authoritativeDisplayState: input.optimisticState ?? input.serverState,
    isConfirmedByServer: false,
    preserveLocalDraftForRetry: input.localDraftState !== null,
  };
}
