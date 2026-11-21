/**
 * Central account mutation write-block guard (Stage D).
 */

import type { DurableAccountLifecycleStore } from './storeContract.ts';
import { AccountLifecycleError } from './types.ts';
import { ACCOUNT_LIFECYCLE_API_PREFIX } from './officialApiContract.ts';
import {
  assertWriteAdmissionPermitsMutation,
  type WriteAdmissionDecision,
} from './writeAdmissionAuthority.ts';

export const MUTATION_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const LIFECYCLE_WRITE_BLOCK_EXEMPT_PATH_PREFIXES: readonly string[] = [
  ACCOUNT_LIFECYCLE_API_PREFIX,
  '/api/v1/account/lifecycle/deletion',
];

export function isLifecycleExemptPath(pathname: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  return LIFECYCLE_WRITE_BLOCK_EXEMPT_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Journal/D1 store direct check — not for Express HTTP mutation admission (use ViaWriteAdmission). */
export async function assertAccountMutationPermitted(params: {
  store: DurableAccountLifecycleStore;
  authenticatedUid: string;
  pathname: string;
  method: string;
}): Promise<void> {
  if (!MUTATION_HTTP_METHODS.has(params.method.toUpperCase())) return;
  if (isLifecycleExemptPath(params.pathname, params.method)) return;
  await params.store.assertUserWritePermitted(params.authenticatedUid);
}

/** Authoritative D1-backed admission only (no Journal). Used by Express mutation middleware. */
export async function assertAccountMutationPermittedViaWriteAdmission(params: {
  resolveAdmission: (authenticatedUid: string) => Promise<WriteAdmissionDecision>;
  authenticatedUid: string;
  pathname: string;
  method: string;
}): Promise<void> {
  if (!MUTATION_HTTP_METHODS.has(params.method.toUpperCase())) return;
  if (isLifecycleExemptPath(params.pathname, params.method)) return;
  const decision = await params.resolveAdmission(params.authenticatedUid);
  assertWriteAdmissionPermitsMutation(decision);
}

export function classifyMutationRoute(method: string, pathname: string): 'MUTATION' | 'READ' | 'EXEMPT' {
  const m = method.toUpperCase();
  if (isLifecycleExemptPath(pathname, m)) return 'EXEMPT';
  if (MUTATION_HTTP_METHODS.has(m)) return 'MUTATION';
  return 'READ';
}

export function writeBlockViolationError(): AccountLifecycleError {
  return new AccountLifecycleError(
    'USER_WRITES_BLOCKED_BY_DELETION',
    'Account writes are blocked while deletion is in progress.',
    423,
  );
}