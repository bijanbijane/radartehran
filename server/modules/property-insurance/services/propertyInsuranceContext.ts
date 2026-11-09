/**
 * @file server/modules/property-insurance/services/propertyInsuranceContext.ts
 * @description Shared persistence collection names, dependency contracts, durable transaction
 * runner, and authorization helpers for the Property Insurance & Claims Management Backend.
 */

import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  requireSafeFirestoreId,
  sanitizeTextInput,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type {
  InsuranceMediaReadAdapter,
  InsuranceNotificationDispatchAdapter,
  InsuranceOperationalEventType,
  InsurancePaymentVerificationReadAdapter,
  InsurancePropertyOwnershipReadAdapter,
  InsurancePropertyRegistryReadAdapter,
  InsurancePropertyRiskReadAdapter,
} from '../contracts/externalAdapters';
import type {
  InsuranceClaimRecord,
  InsuranceLifecycleHistoryEntry,
  InsurancePolicyRecord,
  InsuranceVerificationStatus,
} from '../domain/types';

export const PROPERTY_INSURANCE_COLLECTIONS = {
  PROVIDERS: 'property_insurance_providers',
  POLICIES: 'property_insurance_policies',
  COVERAGES: 'property_insurance_coverages',
  EXCLUSIONS: 'property_insurance_exclusions',
  CLAIMS: 'property_insurance_claims',
  ASSESSMENTS: 'property_insurance_assessments',
  EVIDENCE: 'property_insurance_evidence',
  SETTLEMENTS: 'property_insurance_settlements',
  RENEWALS: 'property_insurance_renewals',
  LIFECYCLE_HISTORY: 'property_insurance_lifecycle_history',
} as const;

export interface PropertyInsuranceStoreTransaction {
  get<T>(collectionName: string, docId: string): Promise<T | null>;
  query<T>(collectionName: string): Promise<T[]>;
  set<T>(collectionName: string, docId: string, data: T): void;
  update(collectionName: string, docId: string, patch: Record<string, unknown>): void;
  delete(collectionName: string, docId: string): void;
}

export interface PropertyInsuranceTransactionRunner {
  runTransaction<T>(work: (tx: PropertyInsuranceStoreTransaction) => Promise<T>): Promise<T>;
}

export interface PropertyInsuranceServiceDependencies {
  txRunner: PropertyInsuranceTransactionRunner;
  idempotencyStore: IdempotencyStoreAdapter;
  propertyRegistryAdapter: InsurancePropertyRegistryReadAdapter;
  propertyOwnershipAdapter?: InsurancePropertyOwnershipReadAdapter;
  propertyRiskAdapter?: InsurancePropertyRiskReadAdapter;
  mediaAdapter: InsuranceMediaReadAdapter;
  paymentVerificationAdapter: InsurancePaymentVerificationReadAdapter;
  notificationAdapter?: InsuranceNotificationDispatchAdapter;
  auditSink?: AuditEventSink;
  now?: () => Date;
}

export function requireValidId(raw: string, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `INVALID_ID_FORMAT: Invalid ${fieldName}: '${raw}'`,
    );
  }
  return res.value;
}

export async function runInsuranceDurableTx<T>(
  txRunner: PropertyInsuranceTransactionRunner,
  operationName: string,
  work: (tx: PropertyInsuranceStoreTransaction) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await txRunner.runTransaction(work);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransientAbort =
        code === 'ABORTED' || msg.includes('ABORTED') || msg.includes('TRANSIENT_CONCURRENCY');
      if (isTransientAbort && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5 * attempt));
        continue;
      }
      throw err;
    }
  }
}

export function isInsuranceReviewerOrAdmin(
  principal: AuthenticatedPrincipal | null | undefined,
): boolean {
  if (!principal || !principal.uid) return false;
  if (
    principal.role === 'delegated_admin' ||
    principal.role === 'primary_admin' ||
    principal.role === 'server_secret_admin'
  ) {
    return true;
  }
  const scopes = Array.isArray(principal.claims?.scopes)
    ? (principal.claims.scopes as string[])
    : [];
  return (
    scopes.includes('property_insurance:review') ||
    scopes.includes('property_insurance:adjuster')
  );
}

export function assertInsuranceAuthenticated(
  principal: AuthenticatedPrincipal | null | undefined,
): AuthenticatedPrincipal {
  if (!principal || !principal.uid || principal.role === 'guest') {
    throw new CoreApiError(
      'UNAUTHENTICATED',
      401,
      'AUTHENTICATION_REQUIRED: Authenticated principal is required.',
    );
  }
  return principal;
}

export function assertInsuranceReviewerOrAdmin(
  principal: AuthenticatedPrincipal | null | undefined,
  operationName: string,
): AuthenticatedPrincipal {
  const auth = assertInsuranceAuthenticated(principal);
  if (!isInsuranceReviewerOrAdmin(auth)) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `INSURANCE_REVIEWER_AUTHORIZATION_REQUIRED: Principal '${auth.uid}' is not authorized to perform '${operationName}'.`,
    );
  }
  return auth;
}

export function assertPolicyAccessAuthorized(
  principal: AuthenticatedPrincipal | null | undefined,
  policy: InsurancePolicyRecord,
  requireWriteOrHolder: boolean,
): AuthenticatedPrincipal {
  const auth = assertInsuranceAuthenticated(principal);
  if (isInsuranceReviewerOrAdmin(auth)) return auth;

  if (policy.policyholderUid === auth.uid) return auth;

  const isParty = policy.partyReferences.some((p) => p.partyId === auth.uid);
  if (!requireWriteOrHolder && isParty) {
    return auth;
  }

  const isRep = policy.partyReferences.some(
    (p) => p.partyId === auth.uid && p.partyRole === 'AUTHORIZED_REPRESENTATIVE',
  );
  if (isRep) return auth;

  throw new CoreApiError(
    'FORBIDDEN',
    403,
    `POLICY_ACCESS_FORBIDDEN: Principal '${auth.uid}' does not have access to policy '${policy.policyId}'.`,
  );
}

export function assertClaimAccessAuthorized(
  principal: AuthenticatedPrincipal | null | undefined,
  claim: InsuranceClaimRecord,
  policy: InsurancePolicyRecord,
): AuthenticatedPrincipal {
  const auth = assertInsuranceAuthenticated(principal);
  if (isInsuranceReviewerOrAdmin(auth)) return auth;
  if (claim.claimantUid === auth.uid || policy.policyholderUid === auth.uid) return auth;
  if (claim.assignedAdjusterOrReviewerUid === auth.uid) return auth;

  const isParty = policy.partyReferences.some((p) => p.partyId === auth.uid);
  if (isParty) return auth;

  throw new CoreApiError(
    'FORBIDDEN',
    403,
    `CLAIM_ACCESS_FORBIDDEN: Principal '${auth.uid}' is not authorized to access claim '${claim.claimId}'.`,
  );
}

export function appendLifecycleHistoryInTx(
  tx: PropertyInsuranceStoreTransaction,
  params: {
    targetType: 'POLICY' | 'CLAIM';
    targetId: string;
    previousState: string | null;
    newState: string;
    principal: AuthenticatedPrincipal;
    reason: string;
    supportingEvidenceIds?: string[];
    verificationStatus: InsuranceVerificationStatus;
    nowIso: string;
  },
): InsuranceLifecycleHistoryEntry {
  const historyId = `inshist_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const entry: InsuranceLifecycleHistoryEntry = {
    historyId,
    targetType: params.targetType,
    targetId: params.targetId,
    previousState: params.previousState,
    newState: params.newState,
    actorUid: params.principal.uid,
    actorRole: params.principal.role,
    reason: sanitizeTextInput(params.reason).slice(0, 300),
    supportingEvidenceIds: (params.supportingEvidenceIds ?? []).map((id) =>
      requireValidId(id, 'supportingEvidenceId'),
    ),
    verificationStatus: params.verificationStatus,
    timestampIso: params.nowIso,
  };
  tx.set(PROPERTY_INSURANCE_COLLECTIONS.LIFECYCLE_HISTORY, historyId, entry);
  return entry;
}

export async function dispatchInsuranceNotificationSafely(
  deps: PropertyInsuranceServiceDependencies,
  input: {
    eventType: InsuranceOperationalEventType;
    recipientUids: string[];
    policyId: string;
    claimId?: string | null;
    summaryMessage: string;
  },
): Promise<void> {
  if (!deps.notificationAdapter) return;
  await deps.notificationAdapter.enqueueOperationalEventNotification(input);
}

export async function recordInsuranceAuditEvent(
  deps: PropertyInsuranceServiceDependencies,
  params: {
    principal: AuthenticatedPrincipal;
    action: string;
    targetCollection: string;
    targetResourceId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  if (!deps.auditSink) return;
  const event = createStructuredAuditEvent({
    correlationId: `corr_${Date.now()}`,
    principal: params.principal,
    action: params.action,
    targetCollection: params.targetCollection,
    targetResourceId: params.targetResourceId,
    outcome: params.outcome,
    metadata: params.metadata,
  });
  await deps.auditSink.writeAuditEvent(event);
}
