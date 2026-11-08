import crypto from 'crypto';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  CanonicalConflictRecord,
  CanonicalDispositionAction,
  CanonicalDispositionApproval,
  CanonicalDispositionRequest,
  CanonicalHoldActor,
  CanonicalLegalHold,
  CanonicalLegalHoldApproval,
  CanonicalLegalHoldRelease,
  CanonicalLegalHoldReview,
  CanonicalLegalHoldScope,
  CanonicalLegalHoldTarget,
  CanonicalRetentionAuditRecord,
  CanonicalRetentionEvaluation,
  CanonicalRetentionObligation,
  CanonicalRetentionPolicy,
  CanonicalRetentionPolicyVersion,
  SourceModuleDispositionProvider,
} from './canonicalHoldModels';
import { CanonicalHoldApiError } from './canonicalHoldValidationAndAuthz';

export const LEGAL_HOLD_FIRESTORE_COLLECTIONS = {
  LEGAL_HOLDS: 'legalHolds',
  LEGAL_HOLD_SCOPES: 'legalHoldScopes',
  LEGAL_HOLD_TARGETS: 'legalHoldTargets',
  LEGAL_HOLD_APPROVALS: 'legalHoldApprovals',
  LEGAL_HOLD_REVIEWS: 'legalHoldReviews',
  LEGAL_HOLD_RELEASES: 'legalHoldReleases',
  RETENTION_POLICIES: 'retentionPolicies',
  RETENTION_POLICY_VERSIONS: 'retentionPolicyVersions',
  RETENTION_OBLIGATIONS: 'retentionObligations',
  RETENTION_EVALUATIONS: 'retentionEvaluations',
  DISPOSITION_REQUESTS: 'dispositionRequests',
  DISPOSITION_APPROVALS: 'dispositionApprovals',
  RETENTION_CONFLICTS: 'retentionConflicts',
  RETENTION_AUDIT_LOG: 'retentionAuditLog',
  IDEMPOTENCY: 'legalHoldIdempotency',
} as const;

export interface CanonicalEntityRelationshipEdge {
  parentSourceModule: string;
  parentEntityType: string;
  parentEntityId: string;
  childSourceModule: string;
  childEntityType: string;
  childEntityId: string;
  childDataCategory: string;
}

export class DefaultSourceModuleDispositionProvider implements SourceModuleDispositionProvider {
  public unavailableModules = new Set<string>();
  public failingTargets = new Set<string>();
  public executedDispositions = new Map<string, string>();

  isModuleAvailable(sourceModule: string): boolean {
    return !this.unavailableModules.has(sourceModule);
  }

  async executeDisposition(input: {
    sourceModule: string;
    entityType: string;
    entityId: string;
    action: CanonicalDispositionAction;
    dispositionRequestId: string;
  }): Promise<{ ok: boolean; executionReference?: string; failureCode?: string }> {
    if (!this.isModuleAvailable(input.sourceModule)) {
      return { ok: false, failureCode: 'SOURCE_MODULE_UNAVAILABLE' };
    }
    const key = `${input.sourceModule}:${input.entityType}:${input.entityId}`;
    if (this.failingTargets.has(key)) {
      return { ok: false, failureCode: 'SOURCE_EXECUTION_ERROR' };
    }
    const ref = `exec_${input.sourceModule}_${input.entityId}_${input.dispositionRequestId}`;
    this.executedDispositions.set(key, ref);
    return { ok: true, executionReference: ref };
  }
}

export class CanonicalHoldRepository {
  public holds = new Map<string, CanonicalLegalHold>();
  public scopes = new Map<string, CanonicalLegalHoldScope[]>();
  public targets = new Map<string, CanonicalLegalHoldTarget>();
  public targetUniqueIndex = new Map<string, string>();
  public approvals = new Map<string, CanonicalLegalHoldApproval[]>();
  public reviews = new Map<string, CanonicalLegalHoldReview[]>();
  public releases = new Map<string, CanonicalLegalHoldRelease[]>();
  public retentionPolicies = new Map<string, CanonicalRetentionPolicy>();
  public retentionPolicyVersions = new Map<string, CanonicalRetentionPolicyVersion[]>();
  public retentionObligations = new Map<string, CanonicalRetentionObligation>();
  public retentionEvaluations = new Map<string, CanonicalRetentionEvaluation>();
  public dispositionRequests = new Map<string, CanonicalDispositionRequest>();
  public dispositionApprovals = new Map<string, CanonicalDispositionApproval[]>();
  public conflicts = new Map<string, CanonicalConflictRecord>();
  public auditRecords: CanonicalRetentionAuditRecord[] = [];
  public idempotencyStore = new Map<string, unknown>();

  // Reference registries for validation and propagation
  public validJurisdictions = new Set<string>(['jurisdiction_1', 'IR', 'IR-THR', 'IR-TEH']);
  public approvedCaseReferences = new Set<string>(['case_123', 'case_456', 'case_emp66_01']);
  public approvedSourceReferences = new Set<string>(['auth_ref_1', 'authority_reference_123', 'STAT-ACT-101']);
  public entityRelationships: CanonicalEntityRelationshipEdge[] = [];
  public recordDataCategories = new Map<string, { dataCategory: string; jurisdictionId: string; createdAt: string }>();

  public retentionServiceUnavailable = false;
  public holdSequence = 100;
  public dispositionSequence = 100;
  public readonly dispositionProvider = new DefaultSourceModuleDispositionProvider();

  private getFirestoreDb() {
    if (process.env.PREVENT_PROD_FIREBASE_IN_TEST === 'true' || process.env.NODE_ENV === 'test') {
      return null;
    }
    try {
      return getFirebaseAdminFirestoreForServer();
    } catch {
      return null;
    }
  }

  public createId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  public nextHoldNumber(): string {
    this.holdSequence += 1;
    return `LH-2026-${String(this.holdSequence).padStart(6, '0')}`;
  }

  public nextDispositionNumber(): string {
    this.dispositionSequence += 1;
    return `DSP-2026-${String(this.dispositionSequence).padStart(6, '0')}`;
  }

  public async syncToFirestoreIfAvailable(collection: string, docId: string, payload: unknown): Promise<void> {
    const db = this.getFirestoreDb();
    if (!db) return;
    try {
      await db.collection(collection).doc(docId).set(JSON.parse(JSON.stringify(payload)));
    } catch {
      // Fallback store remains authoritative when local/offline preview has no Firestore write credentials
    }
  }

  public saveHoldWithOptimisticConcurrency(
    hold: CanonicalLegalHold,
    expectedPreviousVersion?: number,
  ): CanonicalLegalHold {
    const existing = this.holds.get(hold.id);
    if (expectedPreviousVersion !== undefined) {
      const currentVersion = existing ? existing.version : 0;
      if (currentVersion !== expectedPreviousVersion) {
        throw new CanonicalHoldApiError(
          'VERSION_CONFLICT',
          `Optimistic concurrency conflict on LegalHold '${hold.id}': expected version ${expectedPreviousVersion}, actual ${currentVersion}.`,
          [{ expectedVersion: expectedPreviousVersion, actualVersion: currentVersion }],
        );
      }
    }
    const cloned = structuredClone(hold);
    this.holds.set(hold.id, cloned);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLDS, hold.id, cloned);
    return structuredClone(cloned);
  }

  public appendScopeVersion(scope: CanonicalLegalHoldScope): CanonicalLegalHoldScope {
    const list = this.scopes.get(scope.legalHoldId) ?? [];
    if (list.some((s) => s.scopeVersion === scope.scopeVersion)) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        `Scope version ${scope.scopeVersion} already exists for hold '${scope.legalHoldId}'.`,
      );
    }
    const frozen = Object.freeze(structuredClone(scope));
    list.push(frozen);
    this.scopes.set(scope.legalHoldId, list);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLD_SCOPES, scope.id, frozen);
    return structuredClone(frozen);
  }

  public upsertHoldTargetUnique(target: Omit<CanonicalLegalHoldTarget, 'id'>): CanonicalLegalHoldTarget {
    const uniqueKey = `${target.legalHoldId}::${target.scopeVersion}::${target.sourceModule}::${target.entityType}::${target.entityId}`;
    const existingId = this.targetUniqueIndex.get(uniqueKey);
    if (existingId) {
      const existing = this.targets.get(existingId)!;
      existing.lastVerifiedAt = target.lastVerifiedAt;
      existing.preservationStatus = target.preservationStatus;
      existing.releasedAt = target.releasedAt;
      existing.updatedAt = target.updatedAt;
      return structuredClone(existing);
    }
    const created: CanonicalLegalHoldTarget = {
      id: this.createId('lhtgt'),
      ...target,
    };
    this.targetUniqueIndex.set(uniqueKey, created.id);
    this.targets.set(created.id, created);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLD_TARGETS, created.id, created);
    return structuredClone(created);
  }

  public appendApproval(approval: CanonicalLegalHoldApproval): CanonicalLegalHoldApproval {
    const list = this.approvals.get(approval.legalHoldId) ?? [];
    const frozen = Object.freeze(structuredClone(approval));
    list.push(frozen);
    this.approvals.set(approval.legalHoldId, list);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLD_APPROVALS, approval.id, frozen);
    return structuredClone(frozen);
  }

  public appendReview(review: CanonicalLegalHoldReview): CanonicalLegalHoldReview {
    const list = this.reviews.get(review.legalHoldId) ?? [];
    const frozen = Object.freeze(structuredClone(review));
    list.push(frozen);
    this.reviews.set(review.legalHoldId, list);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLD_REVIEWS, review.id, frozen);
    return structuredClone(frozen);
  }

  public saveOrUpdateRelease(release: CanonicalLegalHoldRelease): CanonicalLegalHoldRelease {
    const list = this.releases.get(release.legalHoldId) ?? [];
    const idx = list.findIndex((r) => r.id === release.id);
    const cloned = structuredClone(release);
    if (idx >= 0) {
      list[idx] = cloned;
    } else {
      list.push(cloned);
    }
    this.releases.set(release.legalHoldId, list);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.LEGAL_HOLD_RELEASES, release.id, cloned);
    return structuredClone(cloned);
  }

  public appendAuditRecord(
    actor: CanonicalHoldActor,
    input: {
      operation: string;
      targetType: string;
      targetId: string;
      previousState: Record<string, unknown> | null;
      newState: Record<string, unknown> | null;
      reason: string;
      sourceModule?: string;
    },
  ): CanonicalRetentionAuditRecord {
    const now = new Date().toISOString();
    const corr = actor.correlationId || `corr_${crypto.randomBytes(6).toString('hex')}`;
    const digestPayload = JSON.stringify({
      op: input.operation,
      actorId: actor.actorId,
      targetId: input.targetId,
      prev: input.previousState,
      next: input.newState,
      at: now,
    });
    const record: CanonicalRetentionAuditRecord = Object.freeze({
      id: this.createId('raud'),
      tenantId: actor.tenantId,
      operation: input.operation,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      targetType: input.targetType,
      targetId: input.targetId,
      previousState: input.previousState,
      newState: input.newState,
      reason: input.reason,
      sourceModule: input.sourceModule ?? 'regulatory-compliance',
      authorizationContext: [...actor.permissions],
      correlationId: corr,
      createdAt: now,
      integrityReference: `sha256:${crypto.createHash('sha256').update(digestPayload, 'utf8').digest('hex')}`,
    });
    this.auditRecords.push(record);
    void this.syncToFirestoreIfAvailable(LEGAL_HOLD_FIRESTORE_COLLECTIONS.RETENTION_AUDIT_LOG, record.id, record);
    return record;
  }
}
