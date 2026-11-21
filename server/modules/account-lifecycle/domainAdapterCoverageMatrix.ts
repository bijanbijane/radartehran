/**
 * Explicit account-owned domain deletion adapter coverage (CV audit matrix).
 */

import type { UserOwnedDomainSource } from './types.ts';
import { ALL_USER_OWNED_DOMAIN_SOURCES, DEPENDENT_PURGE_SOURCES, RETENTION_POLICY_SOURCES } from './types.ts';

export type DomainDeletionAdapterClassification =
  | 'CONNECTED_VIA_ORCHESTRATOR_DOMAIN_ADAPTER'
  | 'COORDINATED_VIA_MEDIA_ADAPTER'
  | 'LEGACY_FIRESTORE_SUPPLEMENT'
  | 'NOT_APPLICABLE_PLATFORM_AGGREGATE';

export interface DomainAdapterCoverageEntry {
  source: UserOwnedDomainSource | 'TELEMETRY' | 'FIREBASE_AUTH';
  purgePhase: 'DEPENDENT' | 'RETENTION' | 'MEDIA' | 'SUPPLEMENT' | 'TELEMETRY' | 'IDENTITY';
  classification: DomainDeletionAdapterClassification;
  ownershipPredicate: string;
  evidence: string;
}

export const DOMAIN_ADAPTER_COVERAGE_MATRIX: readonly DomainAdapterCoverageEntry[] = [
  ...DEPENDENT_PURGE_SOURCES.map(
    (source): DomainAdapterCoverageEntry => ({
      source,
      purgePhase: 'DEPENDENT',
      classification: 'CONNECTED_VIA_ORCHESTRATOR_DOMAIN_ADAPTER',
      ownershipPredicate: 'record.ownerUid === job.targetUid (enforced in moduleAdapters + disposeOwnedRecordsBatch)',
      evidence: 'expressServerDeletionBridge registers per-source UserOwnedDomainRepositoryAdapter',
    }),
  ),
  ...RETENTION_POLICY_SOURCES.map(
    (source): DomainAdapterCoverageEntry => ({
      source,
      purgePhase: 'RETENTION',
      classification: 'CONNECTED_VIA_ORCHESTRATOR_DOMAIN_ADAPTER',
      ownershipPredicate: 'record.ownerUid === job.targetUid',
      evidence: 'RETENTION_POLICY_SOURCES batch path in deletionOrchestratorRunners',
    }),
  ),
  {
    source: 'MEDIA_METADATA',
    purgePhase: 'MEDIA',
    classification: 'COORDINATED_VIA_MEDIA_ADAPTER',
    ownershipPredicate: 'mediaItem.ownerUid === job.targetUid (refused in runMediaCleanupBatches)',
    evidence: 'MediaDeletionCoordinationAdapter list/delete with cross-user guard',
  },
  {
    source: 'TELEMETRY',
    purgePhase: 'TELEMETRY',
    classification: 'CONNECTED_VIA_ORCHESTRATOR_DOMAIN_ADAPTER',
    ownershipPredicate: 'adapter maps telemetry to targetUid',
    evidence: 'AccountTelemetryErasureAdapter optional DI; blocks completion when configured incomplete',
  },
  {
    source: 'FIREBASE_AUTH',
    purgePhase: 'IDENTITY',
    classification: 'CONNECTED_VIA_ORCHESTRATOR_DOMAIN_ADAPTER',
    ownershipPredicate: 'AuthIdentityDeletionAdapter.deleteFirebaseAuthUser({ targetUid })',
    evidence: 'runAuthIdentityDeletion after assertAllDependentStepsCompletedBeforeAuth',
  },
] as const;

export function uncoveredDomainSources(): UserOwnedDomainSource[] {
  const covered = new Set(DOMAIN_ADAPTER_COVERAGE_MATRIX.map((e) => e.source));
  return ALL_USER_OWNED_DOMAIN_SOURCES.filter((s) => !covered.has(s));
}