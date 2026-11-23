/**
 * Official account lifecycle API namespace (RT-ACCOUNT-LIFECYCLE-WORKERS-001 §9 — Phase A contracts).
 */

export const ACCOUNT_LIFECYCLE_API_PREFIX = '/api/v1/account/lifecycle';

export interface AccountLifecycleRouteContract {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly auth: 'VERIFIED_USER' | 'VERIFIED_USER_FRESH' | 'ADMIN';
  readonly idempotent: boolean;
  readonly purpose: string;
}

export const OFFICIAL_ACCOUNT_LIFECYCLE_ROUTES: readonly AccountLifecycleRouteContract[] = [
  {
    method: 'POST',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion`,
    auth: 'VERIFIED_USER_FRESH',
    idempotent: true,
    purpose: 'Register durable account deletion job with atomic write block',
  },
  {
    method: 'GET',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/:jobId`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Owner-visible deletion job status',
  },
  {
    method: 'POST',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/deletion/:jobId/continue`,
    auth: 'ADMIN',
    idempotent: true,
    purpose: 'Worker/queue continuation of batched deletion',
  },
  {
    method: 'POST',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/export`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Register bounded account data export job',
  },
  {
    method: 'GET',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/export/:exportJobId`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Export job status',
  },
  {
    method: 'GET',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/export/:exportJobId/download`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Time-limited secure export artifact',
  },
  {
    method: 'GET',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Read backend-authoritative privacy settings',
  },
  {
    method: 'PATCH',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy`,
    auth: 'VERIFIED_USER',
    idempotent: false,
    purpose: 'Update privacy settings with revision guard',
  },
  {
    method: 'POST',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy/consent`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Record versioned consent',
  },
  {
    method: 'POST',
    path: `${ACCOUNT_LIFECYCLE_API_PREFIX}/privacy/consent/revoke`,
    auth: 'VERIFIED_USER',
    idempotent: true,
    purpose: 'Revoke optional analytics consent immediately',
  },
] as const;

/** Legacy route retained until clients migrate (Phase D wiring). */
export const LEGACY_ACCOUNT_DELETION_ROUTE = '/api/account/delete';