import {
  CanonicalConflictRecord,
  CanonicalDispositionMethod,
  CanonicalEvaluationDecision,
  CanonicalEvaluationRequestType,
  CanonicalHoldActor,
  CanonicalRetentionEvaluation,
  CanonicalRetentionObligation,
  CanonicalRetentionObligationType,
  CanonicalRetentionPolicy,
  CanonicalRetentionPolicyType,
  CanonicalRetentionPolicyVersion,
  CanonicalRetentionTrigger,
} from './canonicalHoldModels';
import {
  assertTenantAccess,
  CanonicalHoldApiError,
  paginateCollection,
  rejectUntrustedIdentityFields,
  requireCanonicalHoldPermission,
  sanitizeHoldForCaller,
} from './canonicalHoldValidationAndAuthz';
import { CanonicalHoldRepository, LEGAL_HOLD_FIRESTORE_COLLECTIONS } from './canonicalHoldRepository';

const EVALUATION_TTL_MS = 5 * 60 * 1000;
const ENGINE_VERSION = '1.0.0';

export class CanonicalRetentionPolicyAndEvaluationService {
  constructor(protected readonly repo: CanonicalHoldRepository) {}

  // ============================================================================
  // SECTION 5: RETENTION POLICY OPERATIONS
  // ============================================================================

  public createRetentionPolicy(
    actor: CanonicalHoldActor,
    rawBody: Record<string, unknown>,
  ): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    rejectUntrustedIdentityFields(rawBody);

    const policyCode = typeof rawBody.policyCode === 'string' ? rawBody.policyCode.trim().toUpperCase() : '';
    const name = typeof rawBody.name === 'string' ? rawBody.name.trim() : '';
    const policyType = rawBody.policyType as CanonicalRetentionPolicyType;
    const retentionTrigger = rawBody.retentionTrigger as CanonicalRetentionTrigger;
    const dispositionMethod = rawBody.dispositionMethod as CanonicalDispositionMethod;
    const effectiveFrom = typeof rawBody.effectiveFrom === 'string' ? rawBody.effectiveFrom : '';

    if (!policyCode || !name || !effectiveFrom || Number.isNaN(Date.parse(effectiveFrom))) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'policyCode, name, and valid effectiveFrom are required.');
    }
    if (!['STATUTORY', 'REGULATORY', 'CONTRACTUAL', 'INTERNAL'].includes(policyType)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Invalid policyType.');
    }
    if (
      ![
        'CREATED_AT',
        'TRANSACTION_COMPLETED',
        'CONTRACT_TERMINATED',
        'TENANCY_TERMINATED',
        'ACCOUNT_CLOSED',
        'CASE_RESOLVED',
        'PAYMENT_SETTLED',
        'CUSTOM_EVENT',
      ].includes(retentionTrigger)
    ) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Invalid retentionTrigger.');
    }
    if (!['DELETE', 'ANONYMIZE', 'ARCHIVE', 'MANUAL_REVIEW'].includes(dispositionMethod)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Invalid dispositionMethod.');
    }

    const jurisdictionIds = Array.isArray(rawBody.jurisdictionIds) ? (rawBody.jurisdictionIds as string[]) : [];
    if (jurisdictionIds.length === 0 || jurisdictionIds.some((j) => !this.repo.validJurisdictions.has(j))) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Valid jurisdictionIds are required.');
    }

    const authorityReference =
      typeof rawBody.authorityReference === 'string' && rawBody.authorityReference.trim()
        ? rawBody.authorityReference.trim()
        : null;

    if ((policyType === 'STATUTORY' || policyType === 'REGULATORY') && !authorityReference) {
      throw new CanonicalHoldApiError(
        'LEGAL_BASIS_UNVERIFIED',
        'Statutory or regulatory retention policy requires an authorityReference; invented statutory durations are prohibited.',
      );
    }

    const retentionDurationDays =
      typeof rawBody.retentionDurationDays === 'number' ? rawBody.retentionDurationDays : null;
    if (retentionDurationDays !== null && (!Number.isInteger(retentionDurationDays) || retentionDurationDays <= 0)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'retentionDurationDays must be a positive integer.');
    }

    const now = new Date().toISOString();
    const policy: CanonicalRetentionPolicy = {
      id: this.repo.createId('rpol'),
      tenantId: actor.tenantId,
      policyCode,
      name,
      description: typeof rawBody.description === 'string' ? rawBody.description.trim() : '',
      dataCategories: Array.isArray(rawBody.dataCategories) ? (rawBody.dataCategories as string[]) : [],
      entityTypes: Array.isArray(rawBody.entityTypes) ? (rawBody.entityTypes as string[]) : [],
      sourceModules: Array.isArray(rawBody.sourceModules) ? (rawBody.sourceModules as string[]) : [],
      jurisdictionIds,
      policyType,
      authorityReference,
      retentionTrigger,
      customTriggerEvent: typeof rawBody.customTriggerEvent === 'string' ? rawBody.customTriggerEvent : null,
      retentionDurationDays,
      minimumRetentionUntil: typeof rawBody.minimumRetentionUntil === 'string' ? rawBody.minimumRetentionUntil : null,
      dispositionMethod,
      status: 'DRAFT',
      effectiveFrom,
      effectiveUntil: typeof rawBody.effectiveUntil === 'string' ? rawBody.effectiveUntil : null,
      ownerId: actor.actorId,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, 'Initial policy creation', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_CREATED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: null,
      newState: { policyCode: policy.policyCode, status: policy.status, version: 1 },
      reason: 'Created retention policy',
    });
    return structuredClone(policy);
  }

  public listRetentionPolicies(
    actor: CanonicalHoldActor,
    query: Record<string, unknown> = {},
  ): { items: CanonicalRetentionPolicy[]; nextCursor: string | null; hasMore: boolean } {
    requireCanonicalHoldPermission(actor, 'retention.policy.read');
    const items = Array.from(this.repo.retentionPolicies.values()).filter((p) => {
      if (p.tenantId !== actor.tenantId) return false;
      if (query.status && p.status !== query.status) return false;
      if (query.policyType && p.policyType !== query.policyType) return false;
      return true;
    });
    return paginateCollection(items, {
      limit: query.limit as number | string | undefined,
      cursor: query.cursor as string | undefined,
    });
  }

  public getRetentionPolicy(actor: CanonicalHoldActor, policyId: string): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.read');
    return structuredClone(this.requirePolicyForTenant(actor, policyId));
  }

  public updateRetentionPolicy(
    actor: CanonicalHoldActor,
    policyId: string,
    ifMatchVersion: number | undefined,
    rawBody: Record<string, unknown>,
  ): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    rejectUntrustedIdentityFields(rawBody);
    const policy = this.requirePolicyForTenant(actor, policyId);

    if (ifMatchVersion !== undefined && policy.version !== ifMatchVersion) {
      throw new CanonicalHoldApiError('VERSION_CONFLICT', 'Retention policy version mismatch.');
    }
    const prevVersion = policy.version;
    if (typeof rawBody.name === 'string' && rawBody.name.trim()) policy.name = rawBody.name.trim();
    if (typeof rawBody.description === 'string') policy.description = rawBody.description.trim();
    if (typeof rawBody.retentionDurationDays === 'number' && rawBody.retentionDurationDays > 0) {
      policy.retentionDurationDays = rawBody.retentionDurationDays;
    }
    if (typeof rawBody.dispositionMethod === 'string') {
      policy.dispositionMethod = rawBody.dispositionMethod as CanonicalDispositionMethod;
    }
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();

    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(
      policy,
      typeof rawBody.changeReason === 'string' ? rawBody.changeReason : 'Updated retention policy',
      actor.actorId,
    );
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_UPDATED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { version: prevVersion },
      newState: { version: policy.version, retentionDurationDays: policy.retentionDurationDays },
      reason: typeof rawBody.changeReason === 'string' ? rawBody.changeReason : 'Updated retention policy',
    });
    return structuredClone(policy);
  }

  public submitRetentionPolicy(actor: CanonicalHoldActor, policyId: string): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    const policy = this.requirePolicyForTenant(actor, policyId);
    const prevStatus = policy.status;
    policy.status = 'PENDING_APPROVAL';
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();
    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, 'Submitted for approval', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_SUBMITTED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { status: prevStatus },
      newState: { status: policy.status, version: policy.version },
      reason: 'Submitted for approval',
    });
    return structuredClone(policy);
  }

  public approveRetentionPolicy(
    actor: CanonicalHoldActor,
    policyId: string,
    reason: string,
  ): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.approve');
    const policy = this.requirePolicyForTenant(actor, policyId);
    if (
      (policy.policyType === 'STATUTORY' || policy.policyType === 'REGULATORY') &&
      (!policy.authorityReference || !this.repo.approvedSourceReferences.has(policy.authorityReference))
    ) {
      throw new CanonicalHoldApiError(
        'LEGAL_BASIS_UNVERIFIED',
        'Statutory/regulatory retention policy requires a verified authorityReference.',
      );
    }
    const now = new Date().toISOString();
    policy.approvedBy = actor.actorId;
    policy.approvedAt = now;
    policy.version += 1;
    policy.updatedAt = now;
    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, reason || 'Approved policy', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_APPROVED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { approvedBy: null },
      newState: { approvedBy: policy.approvedBy, version: policy.version },
      reason: reason || 'Approved policy',
    });
    return structuredClone(policy);
  }

  public activateRetentionPolicy(actor: CanonicalHoldActor, policyId: string): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.approve');
    const policy = this.requirePolicyForTenant(actor, policyId);
    if (!policy.approvedBy) {
      throw new CanonicalHoldApiError('INVALID_STATE_TRANSITION', 'Policy must be approved before activation.');
    }
    if (
      (policy.policyType === 'STATUTORY' || policy.policyType === 'REGULATORY') &&
      (!policy.authorityReference || !this.repo.approvedSourceReferences.has(policy.authorityReference))
    ) {
      throw new CanonicalHoldApiError(
        'LEGAL_BASIS_UNVERIFIED',
        'Cannot activate statutory or regulatory policy without an approved authoritative source reference.',
      );
    }
    const prevStatus = policy.status;
    policy.status = 'ACTIVE';
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();
    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, 'Activated policy', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_ACTIVATED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { status: prevStatus },
      newState: { status: 'ACTIVE', version: policy.version },
      reason: 'Activated retention policy',
    });
    return structuredClone(policy);
  }

  public listRetentionPolicyVersions(
    actor: CanonicalHoldActor,
    policyId: string,
  ): CanonicalRetentionPolicyVersion[] {
    requireCanonicalHoldPermission(actor, 'retention.policy.read');
    this.requirePolicyForTenant(actor, policyId);
    return [...(this.repo.retentionPolicyVersions.get(policyId) ?? [])];
  }

  public supersedeRetentionPolicy(
    actor: CanonicalHoldActor,
    policyId: string,
    reason: string,
  ): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    const policy = this.requirePolicyForTenant(actor, policyId);
    policy.status = 'SUPERSEDED';
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();
    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, reason || 'Policy superseded', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_SUPERSEDED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { status: 'ACTIVE' },
      newState: { status: 'SUPERSEDED', version: policy.version },
      reason: reason || 'Policy superseded',
    });
    return structuredClone(policy);
  }

  public retireRetentionPolicy(
    actor: CanonicalHoldActor,
    policyId: string,
    reason: string,
  ): CanonicalRetentionPolicy {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    const policy = this.requirePolicyForTenant(actor, policyId);
    policy.status = 'RETIRED';
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();
    this.repo.retentionPolicies.set(policy.id, structuredClone(policy));
    this.appendPolicyVersionSnapshot(policy, reason || 'Policy retired', actor.actorId);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_POLICY_RETIRED',
      targetType: 'RetentionPolicy',
      targetId: policy.id,
      previousState: { status: 'ACTIVE' },
      newState: { status: 'RETIRED', version: policy.version },
      reason: reason || 'Policy retired',
    });
    return structuredClone(policy);
  }

  protected appendPolicyVersionSnapshot(
    policy: CanonicalRetentionPolicy,
    changeReason: string,
    changedBy: string,
  ): CanonicalRetentionPolicyVersion {
    const list = this.repo.retentionPolicyVersions.get(policy.id) ?? [];
    const entry: CanonicalRetentionPolicyVersion = Object.freeze({
      id: this.repo.createId('rpver'),
      retentionPolicyId: policy.id,
      version: policy.version,
      snapshot: Object.freeze(structuredClone(policy)),
      changeReason,
      changedBy,
      approvedBy: policy.approvedBy,
      effectiveFrom: policy.effectiveFrom,
      createdAt: policy.updatedAt,
    });
    list.push(entry);
    this.repo.retentionPolicyVersions.set(policy.id, list);
    void this.repo.syncToFirestoreIfAvailable(
      LEGAL_HOLD_FIRESTORE_COLLECTIONS.RETENTION_POLICY_VERSIONS,
      entry.id,
      entry,
    );
    return entry;
  }

  // ============================================================================
  // SECTION 6: RETENTION PRECEDENCE ENGINE & OBLIGATIONS
  // ============================================================================

  public registerRetentionObligation(
    actor: CanonicalHoldActor,
    input: {
      targetEntityType: string;
      targetEntityId: string;
      sourceModule: string;
      obligationType: CanonicalRetentionObligationType;
      sourceReferenceType: 'LEGAL_HOLD' | 'RETENTION_POLICY' | 'COMPLIANCE_OBLIGATION';
      sourceReferenceId: string;
      sourceVersion?: number;
      retentionStartAt: string;
      retainUntil: string | null;
      reviewAt?: string | null;
      reasonCode: string;
    },
  ): CanonicalRetentionObligation {
    requireCanonicalHoldPermission(actor, 'retention.policy.manage');
    const priorityMap: Record<CanonicalRetentionObligationType, 1 | 2 | 3 | 4 | 5> = {
      LEGAL_HOLD: 1,
      STATUTORY: 2,
      REGULATORY: 2,
      CONTRACTUAL: 3,
      INTERNAL: 4,
    };
    const now = new Date().toISOString();
    const obl: CanonicalRetentionObligation = {
      id: this.repo.createId('robl'),
      tenantId: actor.tenantId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      sourceModule: input.sourceModule,
      obligationType: input.obligationType,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceVersion: input.sourceVersion ?? 1,
      retentionStartAt: input.retentionStartAt,
      retainUntil: input.retainUntil,
      reviewAt: input.reviewAt ?? null,
      status: 'ACTIVE',
      priorityClass: priorityMap[input.obligationType],
      reasonCode: input.reasonCode,
      createdAt: now,
      updatedAt: now,
    };
    this.repo.retentionObligations.set(obl.id, obl);
    return structuredClone(obl);
  }

  public registerConflictingInstruction(
    actor: CanonicalHoldActor,
    input: {
      sourceModule: string;
      entityType: string;
      entityId: string;
      jurisdictionId: string;
      conflictingReferences: string[];
      priority?: CanonicalConflictRecord['priority'];
    },
  ): CanonicalConflictRecord {
    const conflict: CanonicalConflictRecord = {
      id: this.repo.createId('rconf'),
      tenantId: actor.tenantId,
      sourceModule: input.sourceModule,
      entityType: input.entityType,
      entityId: input.entityId,
      jurisdictionId: input.jurisdictionId,
      conflictType: 'CONTRADICTORY_PRESERVATION_AND_DELETION',
      status: 'OPEN',
      priority: input.priority ?? 'HIGH',
      conflictingReferences: input.conflictingReferences,
      createdAt: new Date().toISOString(),
    };
    this.repo.conflicts.set(conflict.id, conflict);
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_CONFLICT_RECORDED',
      targetType: 'ConflictRecord',
      targetId: conflict.id,
      previousState: null,
      newState: { status: 'OPEN', conflictingReferences: input.conflictingReferences },
      reason: 'Contradictory preservation and deletion instructions detected',
      sourceModule: input.sourceModule,
    });
    return structuredClone(conflict);
  }

  // 6.1 Evaluate a Record
  public evaluateRecord(
    actor: CanonicalHoldActor,
    rawBody: Record<string, unknown>,
    options?: { evaluationNowIso?: string },
  ): {
    decisionId: string;
    decision: CanonicalEvaluationDecision;
    decisionReasonCode: string;
    explanation: string;
    applicableHolds: Array<{ holdId: string; holdNumber: string; status: string; scopeVersion: number }>;
    applicableRetentionObligations: CanonicalRetentionObligation[];
    conflicts: CanonicalConflictRecord[];
    evaluatedAt: string;
    engineVersion: string;
    expiresAt: string;
    evaluationRecord: CanonicalRetentionEvaluation;
  } {
    requireCanonicalHoldPermission(actor, 'retention.evaluate');
    rejectUntrustedIdentityFields(rawBody);
    if (this.repo.retentionServiceUnavailable) {
      throw new CanonicalHoldApiError(
        'RETENTION_SERVICE_UNAVAILABLE',
        'Retention precedence evaluation service is temporarily unavailable; destructive disposition is blocked.',
      );
    }

    const target = rawBody.target as { sourceModule?: string; entityType?: string; entityId?: string } | undefined;
    if (!target || !target.sourceModule || !target.entityType || !target.entityId) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'target.sourceModule, target.entityType, and target.entityId are required.');
    }
    const requestType = (rawBody.requestType as CanonicalEvaluationRequestType) || 'RETENTION_CHECK';
    const evalIso = options?.evaluationNowIso ?? new Date().toISOString();
    const evalMs = Date.parse(evalIso);
    const expiresAt = new Date(evalMs + EVALUATION_TTL_MS).toISOString();

    const sourceAvailable = this.repo.dispositionProvider.isModuleAvailable(target.sourceModule);

    const activeHoldTargets = Array.from(this.repo.targets.values()).filter(
      (t) =>
        t.sourceModule === target.sourceModule &&
        t.entityType === target.entityType &&
        t.entityId === target.entityId &&
        t.preservationStatus === 'ACTIVE',
    );
    const applicableHolds = Array.from(
      new Map(
        activeHoldTargets
          .map((t) => this.repo.holds.get(t.legalHoldId))
          .filter((h): h is NonNullable<typeof h> =>
            Boolean(h && (h.status === 'ACTIVE' || h.status === 'UNDER_REVIEW' || h.status === 'RELEASE_PENDING')),
          )
          .map((h) => [h.id, h]),
      ).values(),
    );

    const activeObligations = Array.from(this.repo.retentionObligations.values()).filter((o) => {
      if (
        o.sourceModule !== target.sourceModule ||
        o.targetEntityType !== target.entityType ||
        o.targetEntityId !== target.entityId ||
        o.status !== 'ACTIVE'
      ) {
        return false;
      }
      if (o.obligationType === 'LEGAL_HOLD') return false;
      if (o.retainUntil && Date.parse(o.retainUntil) <= evalMs) {
        o.status = 'EXPIRED';
        return false;
      }
      return true;
    });

    const matchingPolicies = Array.from(this.repo.retentionPolicies.values()).filter(
      (p) =>
        p.tenantId === actor.tenantId &&
        p.status === 'ACTIVE' &&
        (p.sourceModules.length === 0 || p.sourceModules.includes(target.sourceModule!)) &&
        (p.entityTypes.length === 0 || p.entityTypes.includes(target.entityType!)),
    );

    const openConflicts = Array.from(this.repo.conflicts.values()).filter(
      (c) =>
        c.tenantId === actor.tenantId &&
        c.sourceModule === target.sourceModule &&
        c.entityType === target.entityType &&
        c.entityId === target.entityId &&
        c.status === 'OPEN',
    );

    let decision: CanonicalEvaluationDecision = 'ELIGIBLE_FOR_DISPOSITION';
    let decisionReasonCode = 'ELIGIBLE_FOR_DISPOSITION';
    let explanation = 'No active legal hold or unexpired retention obligation applies to this record.';
    let missingConfiguration = false;

    if (!sourceAvailable) {
      decision = 'SOURCE_MODULE_UNAVAILABLE';
      decisionReasonCode = 'SOURCE_MODULE_UNAVAILABLE';
      explanation = `Source module '${target.sourceModule}' is unavailable for disposition verification.`;
    } else if (openConflicts.length > 0) {
      decision = 'LEGAL_REVIEW_REQUIRED';
      decisionReasonCode = 'CONFLICTING_PRESERVATION_INSTRUCTIONS';
      explanation = 'Contradictory preservation and deletion instructions apply; routed to legal review.';
    } else if (applicableHolds.length > 0) {
      decision = 'PRESERVE_LEGAL_HOLD';
      decisionReasonCode = 'ACTIVE_LEGAL_HOLD';
      explanation = 'An active legal hold applies to this record.';
    } else if (
      activeObligations.some((o) => o.obligationType === 'STATUTORY' || o.obligationType === 'REGULATORY')
    ) {
      decision = 'PRESERVE_MANDATORY_RETENTION';
      decisionReasonCode = 'ACTIVE_MANDATORY_RETENTION';
      explanation = 'A mandatory statutory or regulatory retention obligation applies to this record.';
    } else if (activeObligations.some((o) => o.obligationType === 'CONTRACTUAL')) {
      decision = 'PRESERVE_CONTRACTUAL_OBLIGATION';
      decisionReasonCode = 'ACTIVE_CONTRACTUAL_RETENTION';
      explanation = 'An approved contractual preservation obligation applies to this record.';
    } else if (activeObligations.some((o) => o.obligationType === 'INTERNAL')) {
      decision = 'PRESERVE_INTERNAL_POLICY';
      decisionReasonCode = 'ACTIVE_INTERNAL_RETENTION';
      explanation = 'An approved internal retention policy obligation applies to this record.';
    } else if (matchingPolicies.length === 0 && activeObligations.length === 0) {
      decision = 'RETENTION_CONFIGURATION_MISSING';
      decisionReasonCode = 'RETENTION_CONFIGURATION_MISSING';
      explanation = 'No active retention policy configuration found for this record; deletion is blocked.';
      missingConfiguration = true;
    } else if (
      matchingPolicies.some((p) => p.dispositionMethod === 'ANONYMIZE') &&
      requestType === 'DELETE'
    ) {
      decision = 'ANONYMIZATION_REVIEW_REQUIRED';
      decisionReasonCode = 'POLICY_REQUIRES_ANONYMIZATION';
      explanation = 'Retention period completed, but governing policy specifies anonymization rather than deletion.';
    }

    const evaluation: CanonicalRetentionEvaluation = Object.freeze({
      id: this.repo.createId('evaluation'),
      tenantId: actor.tenantId,
      targetEntityType: target.entityType,
      targetEntityId: target.entityId,
      sourceModule: target.sourceModule,
      requestType,
      decision,
      decisionReasonCode,
      decisionExplanation: explanation,
      applicableHoldIds: applicableHolds.map((h) => h.id),
      applicableRetentionObligationIds: activeObligations.map((o) => o.id),
      applicablePolicyVersions: matchingPolicies.map((p) => ({
        policyId: p.id,
        policyCode: p.policyCode,
        version: p.version,
      })),
      conflictingInstructionReferences: openConflicts.flatMap((c) => c.conflictingReferences),
      missingConfiguration,
      sourceAvailability: sourceAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
      evaluatedAt: evalIso,
      evaluatedBy: actor.actorId,
      engineVersion: ENGINE_VERSION,
      correlationId: actor.correlationId || this.repo.createId('corr'),
      expiresAt,
    });

    this.repo.retentionEvaluations.set(evaluation.id, evaluation);
    void this.repo.syncToFirestoreIfAvailable(
      LEGAL_HOLD_FIRESTORE_COLLECTIONS.RETENTION_EVALUATIONS,
      evaluation.id,
      evaluation,
    );
    this.repo.appendAuditRecord(actor, {
      operation: 'RETENTION_EVALUATED',
      targetType: `${target.sourceModule}:${target.entityType}`,
      targetId: target.entityId,
      previousState: null,
      newState: { evaluationId: evaluation.id, decision: evaluation.decision },
      reason: typeof rawBody.reason === 'string' ? rawBody.reason : 'Retention evaluation',
      sourceModule: target.sourceModule,
    });

    return {
      decisionId: evaluation.id,
      decision: evaluation.decision,
      decisionReasonCode: evaluation.decisionReasonCode,
      explanation: evaluation.decisionExplanation,
      applicableHolds: applicableHolds.map((h) => ({
        holdId: h.id,
        holdNumber: h.holdNumber,
        status: h.status,
        scopeVersion: h.currentScopeVersion,
      })),
      applicableRetentionObligations: activeObligations,
      conflicts: openConflicts,
      evaluatedAt: evaluation.evaluatedAt,
      engineVersion: evaluation.engineVersion,
      expiresAt: evaluation.expiresAt,
      evaluationRecord: evaluation,
    };
  }

  // 6.2 Retrieve Evaluation
  public getEvaluation(actor: CanonicalHoldActor, evaluationId: string): CanonicalRetentionEvaluation {
    requireCanonicalHoldPermission(actor, 'retention.evaluate');
    const evaluation = this.repo.retentionEvaluations.get(evaluationId);
    if (!evaluation) {
      throw new CanonicalHoldApiError('RESOURCE_NOT_FOUND', `RetentionEvaluation '${evaluationId}' not found.`);
    }
    assertTenantAccess(actor, evaluation.tenantId);
    return evaluation;
  }

  // 6.3 Retrieve Record Retention State
  public getRecordRetentionState(
    actor: CanonicalHoldActor,
    sourceModule: string,
    entityType: string,
    entityId: string,
  ) {
    requireCanonicalHoldPermission(actor, 'retention.evaluate');
    const evalResult = this.evaluateRecord(actor, {
      target: { sourceModule, entityType, entityId },
      requestType: 'RETENTION_CHECK',
      reason: 'Record retention state inspection',
    });

    const activeHoldRecords = evalResult.applicableHolds
      .map((h) => this.repo.holds.get(h.holdId))
      .filter((h): h is NonNullable<typeof h> => Boolean(h))
      .map((h) => sanitizeHoldForCaller(h, actor));

    const reviewDates = [
      ...evalResult.applicableRetentionObligations.map((o) => o.reviewAt).filter((d): d is string => Boolean(d)),
    ];

    return {
      activeHolds: activeHoldRecords,
      activeRetentionObligations: evalResult.applicableRetentionObligations,
      currentRetentionStatus: evalResult.decision,
      nextReviewDate: reviewDates.length > 0 ? reviewDates.sort()[0] : null,
      mostRecentEvaluation: evalResult.evaluationRecord,
      dispositionEligibility: evalResult.decision === 'ELIGIBLE_FOR_DISPOSITION',
    };
  }

  // 6.4 Retrieve Conflicts
  public listConflicts(
    actor: CanonicalHoldActor,
    query: Record<string, unknown> = {},
  ): { items: CanonicalConflictRecord[]; nextCursor: string | null; hasMore: boolean } {
    requireCanonicalHoldPermission(actor, 'retention.conflict.read');
    const filtered = Array.from(this.repo.conflicts.values()).filter((c) => {
      if (c.tenantId !== actor.tenantId) return false;
      if (query.sourceModule && c.sourceModule !== query.sourceModule) return false;
      if (query.jurisdictionId && c.jurisdictionId !== query.jurisdictionId) return false;
      if (query.conflictType && c.conflictType !== query.conflictType) return false;
      if (query.status && c.status !== query.status) return false;
      if (query.priority && c.priority !== query.priority) return false;
      return true;
    });
    return paginateCollection(filtered, {
      limit: query.limit as number | string | undefined,
      cursor: query.cursor as string | undefined,
    });
  }

  protected requirePolicyForTenant(actor: CanonicalHoldActor, policyId: string): CanonicalRetentionPolicy {
    const policy = this.repo.retentionPolicies.get(policyId);
    if (!policy) {
      throw new CanonicalHoldApiError('RESOURCE_NOT_FOUND', `RetentionPolicy '${policyId}' not found.`);
    }
    assertTenantAccess(actor, policy.tenantId);
    return policy;
  }
}
