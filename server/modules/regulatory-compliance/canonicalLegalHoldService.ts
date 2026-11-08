import {
  CanonicalApprovalDecision,
  CanonicalHoldActor,
  CanonicalHoldPriority,
  CanonicalHoldStatus,
  CanonicalHoldType,
  CanonicalLegalBasis,
  CanonicalLegalHold,
  CanonicalLegalHoldApproval,
  CanonicalLegalHoldRelease,
  CanonicalLegalHoldReview,
  CanonicalLegalHoldScope,
  CanonicalLegalHoldTarget,
  CanonicalReleaseType,
  CanonicalRetentionObligation,
  CanonicalReviewDecision,
} from './canonicalHoldModels';
import {
  assertTenantAccess,
  CanonicalHoldApiError,
  paginateCollection,
  rejectUntrustedIdentityFields,
  requireCanonicalHoldPermission,
  sanitizeHoldForCaller,
  validateScopeDefinitionInput,
} from './canonicalHoldValidationAndAuthz';
import { CanonicalHoldRepository } from './canonicalHoldRepository';

export class CanonicalLegalHoldService {
  constructor(private readonly repo: CanonicalHoldRepository) {}

  // 4.1 Create a Legal Hold
  public createLegalHold(
    actor: CanonicalHoldActor,
    rawBody: Record<string, unknown>,
    options?: { createAsDraft?: boolean },
  ): {
    id: string;
    holdNumber: string;
    status: CanonicalHoldStatus;
    version: number;
    scopeVersion: number;
    scopeFingerprint: string;
    hold: CanonicalLegalHold;
  } {
    requireCanonicalHoldPermission(actor, 'legal_hold.create');
    rejectUntrustedIdentityFields(rawBody);

    const title = typeof rawBody.title === 'string' ? rawBody.title.trim() : '';
    if (!title) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'title is required.');
    }
    const allowedHoldTypes: CanonicalHoldType[] = [
      'LITIGATION',
      'REGULATORY',
      'INVESTIGATION',
      'CONTRACTUAL',
      'AUTHORITY_REQUEST',
      'OTHER',
    ];
    const holdType = rawBody.holdType as CanonicalHoldType;
    if (!allowedHoldTypes.includes(holdType)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Invalid holdType.');
    }

    const legalBasis = rawBody.legalBasis as CanonicalLegalBasis | undefined;
    if (
      !legalBasis ||
      typeof legalBasis !== 'object' ||
      !legalBasis.basisType ||
      !legalBasis.referenceId ||
      !legalBasis.description ||
      legalBasis.verified === false
    ) {
      throw new CanonicalHoldApiError('LEGAL_BASIS_UNVERIFIED', 'A valid, verified legalBasis object is required.');
    }
    if (
      legalBasis.basisType === 'APPROVED_CASE_REFERENCE' &&
      !this.repo.approvedCaseReferences.has(legalBasis.referenceId)
    ) {
      throw new CanonicalHoldApiError(
        'LEGAL_BASIS_UNVERIFIED',
        `Case reference '${legalBasis.referenceId}' is not verified in the case-management registry.`,
      );
    }

    const jurisdictionIds = Array.isArray(rawBody.jurisdictionIds) ? (rawBody.jurisdictionIds as string[]) : [];
    if (jurisdictionIds.length === 0 || jurisdictionIds.some((j) => !this.repo.validJurisdictions.has(j))) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'All jurisdictionIds must reference registered jurisdictions.');
    }

    const reviewIntervalDays = Number(rawBody.reviewIntervalDays ?? 30);
    if (!Number.isInteger(reviewIntervalDays) || reviewIntervalDays <= 0) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'reviewIntervalDays must be a positive integer.');
    }

    const effectiveAt = typeof rawBody.effectiveAt === 'string' ? rawBody.effectiveAt : '';
    if (!effectiveAt || Number.isNaN(Date.parse(effectiveAt))) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'effectiveAt must be a valid ISO-8601 timestamp.');
    }

    const validatedScope = validateScopeDefinitionInput(rawBody.scope as Record<string, unknown> | undefined);
    const now = new Date().toISOString();
    const holdId = this.repo.createId('hold');
    const scopeId = this.repo.createId('hscope');
    const corr = actor.correlationId || this.repo.createId('corr');
    const initialStatus: CanonicalHoldStatus = options?.createAsDraft || rawBody.initialStatus === 'DRAFT' ? 'DRAFT' : 'PENDING_APPROVAL';

    const scopeRecord: CanonicalLegalHoldScope = {
      id: scopeId,
      legalHoldId: holdId,
      scopeVersion: 1,
      scopeType: validatedScope.scopeType,
      entityTypes: validatedScope.entityTypes,
      entityIds: validatedScope.entityIds,
      dataCategories: validatedScope.dataCategories,
      sourceModuleIds: validatedScope.sourceModuleIds,
      relationshipRules: validatedScope.relationshipRules,
      boundedQuery: validatedScope.boundedQuery,
      jurisdictionIds,
      effectiveFrom: effectiveAt,
      effectiveUntil: null,
      includeFutureMatchingRecords: validatedScope.includeFutureMatchingRecords,
      maximumExpansionCount: validatedScope.maximumExpansionCount,
      maximumRelationshipDepth: validatedScope.maximumRelationshipDepth,
      scopeFingerprint: validatedScope.scopeFingerprint,
      createdBy: actor.actorId,
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
      version: 1,
    };
    this.repo.appendScopeVersion(scopeRecord);

    const hold: CanonicalLegalHold = {
      id: holdId,
      tenantId: actor.tenantId,
      holdNumber: this.repo.nextHoldNumber(),
      title,
      description: typeof rawBody.description === 'string' ? rawBody.description.trim() : null,
      holdType,
      legalBasis,
      jurisdictionIds,
      authorityReference: typeof rawBody.authorityReference === 'string' ? rawBody.authorityReference : null,
      caseReferences: Array.isArray(rawBody.caseReferences) ? (rawBody.caseReferences as string[]) : [],
      obligationReferences: Array.isArray(rawBody.obligationReferences)
        ? (rawBody.obligationReferences as string[])
        : [],
      scopeDefinitionId: scopeRecord.id,
      currentScopeVersion: 1,
      status: initialStatus,
      priority: ((rawBody.priority as CanonicalHoldPriority) || 'NORMAL'),
      effectiveAt,
      approvedAt: null,
      activatedAt: null,
      reviewIntervalDays,
      nextReviewAt: new Date(Date.parse(effectiveAt) + reviewIntervalDays * 86400000).toISOString(),
      requestedReleaseAt: null,
      releasedAt: null,
      releaseReason: null,
      createdBy: actor.actorId,
      approvedBy: null,
      releasedBy: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      correlationId: corr,
    };

    this.repo.saveHoldWithOptimisticConcurrency(hold, 0);
    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_CREATED',
      targetType: 'LegalHold',
      targetId: hold.id,
      previousState: null,
      newState: { status: hold.status, version: hold.version, scopeVersion: 1 },
      reason: legalBasis.description,
    });

    return {
      id: hold.id,
      holdNumber: hold.holdNumber,
      status: hold.status,
      version: hold.version,
      scopeVersion: 1,
      scopeFingerprint: scopeRecord.scopeFingerprint,
      hold,
    };
  }

  // 4.2 List Legal Holds
  public listLegalHolds(
    actor: CanonicalHoldActor,
    query: Record<string, unknown> = {},
  ): { items: Array<Partial<CanonicalLegalHold>>; nextCursor: string | null; hasMore: boolean } {
    requireCanonicalHoldPermission(actor, 'legal_hold.read');
    const all = Array.from(this.repo.holds.values()).filter((h) => {
      if (h.tenantId !== null && h.tenantId !== actor.tenantId) return false;
      if (query.status && h.status !== query.status) return false;
      if (query.holdType && h.holdType !== query.holdType) return false;
      if (query.priority && h.priority !== query.priority) return false;
      if (query.jurisdictionId && !h.jurisdictionIds.includes(String(query.jurisdictionId))) return false;
      if (query.caseReference && !h.caseReferences.includes(String(query.caseReference))) return false;
      if (query.createdAfter && Date.parse(h.createdAt) < Date.parse(String(query.createdAfter))) return false;
      if (query.createdBefore && Date.parse(h.createdAt) > Date.parse(String(query.createdBefore))) return false;
      if (query.reviewDue === 'true' && (!h.nextReviewAt || Date.parse(h.nextReviewAt) > Date.now())) return false;
      if (query.entityType || query.entityId) {
        const scopes = this.repo.scopes.get(h.id) ?? [];
        const latestScope = scopes[scopes.length - 1];
        if (query.entityType && !latestScope?.entityTypes.includes(String(query.entityType))) return false;
        if (query.entityId && !latestScope?.entityIds.includes(String(query.entityId))) return false;
      }
      return true;
    });
    const paged = paginateCollection(all, {
      limit: query.limit as number | string | undefined,
      cursor: query.cursor as string | undefined,
    });
    return {
      items: paged.items.map((h) => sanitizeHoldForCaller(h, actor)),
      nextCursor: paged.nextCursor,
      hasMore: paged.hasMore,
    };
  }

  // 4.3 Retrieve a Legal Hold
  public getLegalHold(
    actor: CanonicalHoldActor,
    holdId: string,
  ): {
    hold: Partial<CanonicalLegalHold>;
    currentScopeVersion: number;
    currentScope: CanonicalLegalHoldScope | null;
    approvalHistory: CanonicalLegalHoldApproval[];
    reviewHistory: CanonicalLegalHoldReview[];
    releaseHistory: CanonicalLegalHoldRelease[];
    propagationStatus: { activeTargetCount: number; totalTargetCount: number };
    associatedRetentionObligationIds: string[];
  } {
    requireCanonicalHoldPermission(actor, 'legal_hold.read');
    const hold = this.requireHoldForTenant(actor, holdId);
    const scopes = this.repo.scopes.get(hold.id) ?? [];
    const currentScope = scopes.find((s) => s.scopeVersion === hold.currentScopeVersion) ?? null;
    const targets = Array.from(this.repo.targets.values()).filter((t) => t.legalHoldId === hold.id);
    const obligations = Array.from(this.repo.retentionObligations.values()).filter(
      (o) => o.sourceReferenceType === 'LEGAL_HOLD' && o.sourceReferenceId === hold.id,
    );

    return {
      hold: sanitizeHoldForCaller(hold, actor),
      currentScopeVersion: hold.currentScopeVersion,
      currentScope,
      approvalHistory: [...(this.repo.approvals.get(hold.id) ?? [])],
      reviewHistory: [...(this.repo.reviews.get(hold.id) ?? [])],
      releaseHistory: [...(this.repo.releases.get(hold.id) ?? [])],
      propagationStatus: {
        activeTargetCount: targets.filter((t) => t.preservationStatus === 'ACTIVE').length,
        totalTargetCount: targets.length,
      },
      associatedRetentionObligationIds: obligations.map((o) => o.id),
    };
  }

  // 4.4 Update a Draft or Pending Hold
  public updateDraftHold(
    actor: CanonicalHoldActor,
    holdId: string,
    ifMatchVersion: number | undefined,
    rawBody: Record<string, unknown>,
  ): { hold: CanonicalLegalHold; currentScopeVersion: number; scopeFingerprint: string } {
    requireCanonicalHoldPermission(actor, 'legal_hold.create');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    if (ifMatchVersion === undefined || !Number.isInteger(ifMatchVersion)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'If-Match version header is required.');
    }
    if (hold.version !== ifMatchVersion) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        `Stale If-Match version ${ifMatchVersion}; current hold version is ${hold.version}.`,
      );
    }
    if (hold.status !== 'DRAFT' && hold.status !== 'PENDING_APPROVAL') {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        `Cannot PATCH hold in status '${hold.status}'; only DRAFT or PENDING_APPROVAL holds may be patched.`,
      );
    }

    const prevState = { title: hold.title, version: hold.version, currentScopeVersion: hold.currentScopeVersion };
    const now = new Date().toISOString();
    if (typeof rawBody.title === 'string' && rawBody.title.trim()) {
      hold.title = rawBody.title.trim();
    }
    if (typeof rawBody.description === 'string') {
      hold.description = rawBody.description.trim();
    }
    if (typeof rawBody.priority === 'string') {
      hold.priority = rawBody.priority as CanonicalHoldPriority;
    }

    const scopes = this.repo.scopes.get(hold.id) ?? [];
    let latestScope = scopes[scopes.length - 1]!;
    if (rawBody.scope) {
      const validated = validateScopeDefinitionInput(rawBody.scope as Record<string, unknown>);
      const nextScopeVersion = hold.currentScopeVersion + 1;
      latestScope = this.repo.appendScopeVersion({
        id: this.repo.createId('hscope'),
        legalHoldId: hold.id,
        scopeVersion: nextScopeVersion,
        scopeType: validated.scopeType,
        entityTypes: validated.entityTypes,
        entityIds: validated.entityIds,
        dataCategories: validated.dataCategories,
        sourceModuleIds: validated.sourceModuleIds,
        relationshipRules: validated.relationshipRules,
        boundedQuery: validated.boundedQuery,
        jurisdictionIds: hold.jurisdictionIds,
        effectiveFrom: hold.effectiveAt,
        effectiveUntil: null,
        includeFutureMatchingRecords: validated.includeFutureMatchingRecords,
        maximumExpansionCount: validated.maximumExpansionCount,
        maximumRelationshipDepth: validated.maximumRelationshipDepth,
        scopeFingerprint: validated.scopeFingerprint,
        createdBy: actor.actorId,
        createdAt: now,
        approvedBy: null,
        approvedAt: null,
        version: nextScopeVersion,
      });
      hold.scopeDefinitionId = latestScope.id;
      hold.currentScopeVersion = nextScopeVersion;
    }

    hold.version += 1;
    hold.updatedAt = now;
    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, ifMatchVersion);
    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_UPDATED',
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: prevState,
      newState: { title: saved.title, version: saved.version, currentScopeVersion: saved.currentScopeVersion },
      reason: 'Draft/pending hold update',
    });

    return {
      hold: saved,
      currentScopeVersion: saved.currentScopeVersion,
      scopeFingerprint: latestScope.scopeFingerprint,
    };
  }

  // 4.5 Approve a Hold
  public approveLegalHold(
    actor: CanonicalHoldActor,
    holdId: string,
    rawBody: Record<string, unknown>,
  ): { hold: CanonicalLegalHold; approval: CanonicalLegalHoldApproval } {
    requireCanonicalHoldPermission(actor, 'legal_hold.approve');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    if (hold.createdBy === actor.actorId && !actor.allowSelfApprovalByPolicy) {
      throw new CanonicalHoldApiError(
        'FORBIDDEN',
        'Separation of duties violation: creator cannot approve their own legal hold.',
      );
    }
    if (hold.status !== 'PENDING_APPROVAL' && hold.status !== 'DRAFT') {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        `Hold in status '${hold.status}' cannot be approved.`,
      );
    }

    const decision = rawBody.decision as CanonicalApprovalDecision;
    if (!['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'decision must be APPROVED, REJECTED, or CHANGES_REQUESTED.');
    }
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason.trim() : '';
    if (!reason) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'reason is required.');
    }
    const approvedScopeFingerprint =
      typeof rawBody.approvedScopeFingerprint === 'string' ? rawBody.approvedScopeFingerprint.trim() : '';

    const scopes = this.repo.scopes.get(hold.id) ?? [];
    const currentScope = scopes.find((s) => s.scopeVersion === hold.currentScopeVersion);
    if (!currentScope || currentScope.scopeFingerprint !== approvedScopeFingerprint) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        'approvedScopeFingerprint does not match the current scope version fingerprint.',
      );
    }

    const now = new Date().toISOString();
    const prevVersion = hold.version;
    const approval: CanonicalLegalHoldApproval = this.repo.appendApproval({
      id: this.repo.createId('lhapp'),
      legalHoldId: hold.id,
      holdVersion: hold.version + 1,
      decision,
      reviewerId: actor.actorId,
      reviewerRole: actor.actorRole,
      reason,
      evidenceReferences: Array.isArray(rawBody.evidenceReferences)
        ? (rawBody.evidenceReferences as string[])
        : [],
      approvedScopeFingerprint,
      createdAt: now,
      correlationId: actor.correlationId || hold.correlationId,
    });

    if (decision === 'APPROVED') {
      hold.approvedBy = actor.actorId;
      hold.approvedAt = now;
      hold.status = 'PENDING_APPROVAL';
    } else if (decision === 'REJECTED') {
      hold.status = 'REJECTED';
    } else {
      hold.status = 'DRAFT';
    }
    hold.version += 1;
    hold.updatedAt = now;

    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);
    this.repo.appendAuditRecord(actor, {
      operation: `LEGAL_HOLD_APPROVAL_${decision}`,
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { version: prevVersion },
      newState: { status: saved.status, approvedBy: saved.approvedBy, version: saved.version },
      reason,
    });
    return { hold: saved, approval };
  }

  // 4.6 Activate a Hold
  public activateLegalHold(
    actor: CanonicalHoldActor,
    holdId: string,
    rawBody: Record<string, unknown>,
    options?: { evaluationNowIso?: string; idempotencyKey?: string },
  ): { hold: CanonicalLegalHold; targetCount: number; idempotentReplay: boolean } {
    requireCanonicalHoldPermission(actor, 'legal_hold.activate');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    const idemKey = options?.idempotencyKey || (typeof rawBody.idempotencyKey === 'string' ? rawBody.idempotencyKey : '');
    if (idemKey) {
      const cached = this.repo.idempotencyStore.get(`activate::${hold.id}::${idemKey}`) as
        | { hold: CanonicalLegalHold; targetCount: number }
        | undefined;
      if (cached) {
        return { ...cached, idempotentReplay: true };
      }
    }

    if (
      hold.status === 'ACTIVE' &&
      (Number(rawBody.expectedVersion) === hold.version || Number(rawBody.expectedVersion) === hold.version - 1)
    ) {
      const existingTargets = Array.from(this.repo.targets.values()).filter(
        (t) => t.legalHoldId === hold.id && t.preservationStatus === 'ACTIVE',
      );
      return { hold, targetCount: existingTargets.length, idempotentReplay: true };
    }

    const expectedVersion = Number(rawBody.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== hold.version) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        `Expected version ${expectedVersion} does not match current hold version ${hold.version}.`,
      );
    }

    const approvals = this.repo.approvals.get(hold.id) ?? [];
    const latestApproval = approvals[approvals.length - 1];
    if (!latestApproval || latestApproval.decision !== 'APPROVED' || latestApproval.holdVersion !== hold.version) {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        'Only an approved hold with a matching approved version may be activated.',
      );
    }

    const nowIso = options?.evaluationNowIso ?? new Date().toISOString();
    if (Date.parse(nowIso) < Date.parse(hold.effectiveAt)) {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        `Hold cannot be activated before its effectiveAt timestamp (${hold.effectiveAt}).`,
      );
    }

    const scopes = this.repo.scopes.get(hold.id) ?? [];
    const activeScope = scopes.find((s) => s.scopeVersion === hold.currentScopeVersion);
    if (!activeScope) {
      throw new CanonicalHoldApiError('SCOPE_INVALID', 'Active scope definition not found.');
    }

    const propagatedTargets = this.expandAndPersistHoldTargets(hold, activeScope, nowIso);
    const prevVersion = hold.version;
    hold.status = 'ACTIVE';
    hold.activatedAt = nowIso;
    hold.version += 1;
    hold.updatedAt = nowIso;

    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);
    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_ACTIVATED',
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { status: 'PENDING_APPROVAL', version: prevVersion },
      newState: { status: 'ACTIVE', version: saved.version, targetCount: propagatedTargets.length },
      reason: typeof rawBody.reason === 'string' ? rawBody.reason : 'Hold activated',
    });

    const result = { hold: saved, targetCount: propagatedTargets.length };
    if (idemKey) {
      this.repo.idempotencyStore.set(`activate::${hold.id}::${idemKey}`, result);
    }
    return { ...result, idempotentReplay: false };
  }

  // 4.7 Retrieve Hold Targets
  public listHoldTargets(
    actor: CanonicalHoldActor,
    holdId: string,
    query: Record<string, unknown> = {},
  ): { items: CanonicalLegalHoldTarget[]; nextCursor: string | null; hasMore: boolean } {
    requireCanonicalHoldPermission(actor, 'legal_hold.read');
    const hold = this.requireHoldForTenant(actor, holdId);
    const filtered = Array.from(this.repo.targets.values()).filter((t) => {
      if (t.legalHoldId !== hold.id) return false;
      if (query.sourceModule && t.sourceModule !== query.sourceModule) return false;
      if (query.entityType && t.entityType !== query.entityType) return false;
      if (query.preservationStatus && t.preservationStatus !== query.preservationStatus) return false;
      if (query.targetOrigin && t.targetOrigin !== query.targetOrigin) return false;
      return true;
    });
    return paginateCollection(filtered, {
      limit: query.limit as number | string | undefined,
      cursor: query.cursor as string | undefined,
    });
  }

  // 4.8 Modify Hold Scope
  public modifyHoldScope(
    actor: CanonicalHoldActor,
    holdId: string,
    rawBody: Record<string, unknown>,
  ): { hold: CanonicalLegalHold; newScope: CanonicalLegalHoldScope; targets: CanonicalLegalHoldTarget[] } {
    requireCanonicalHoldPermission(actor, 'legal_hold.scope.manage');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    const expectedHoldVersion = Number(rawBody.expectedHoldVersion);
    if (!Number.isInteger(expectedHoldVersion) || expectedHoldVersion !== hold.version) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        `Expected hold version ${expectedHoldVersion} does not match current version ${hold.version}.`,
      );
    }
    const changeReason = typeof rawBody.changeReason === 'string' ? rawBody.changeReason.trim() : '';
    if (!changeReason) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'changeReason is required.');
    }

    const validated = validateScopeDefinitionInput(rawBody.scope as Record<string, unknown> | undefined);
    const now = new Date().toISOString();
    const nextScopeVersion = hold.currentScopeVersion + 1;

    const newScope = this.repo.appendScopeVersion({
      id: this.repo.createId('hscope'),
      legalHoldId: hold.id,
      scopeVersion: nextScopeVersion,
      scopeType: validated.scopeType,
      entityTypes: validated.entityTypes,
      entityIds: validated.entityIds,
      dataCategories: validated.dataCategories,
      sourceModuleIds: validated.sourceModuleIds,
      relationshipRules: validated.relationshipRules,
      boundedQuery: validated.boundedQuery,
      jurisdictionIds: hold.jurisdictionIds,
      effectiveFrom: now,
      effectiveUntil: null,
      includeFutureMatchingRecords: validated.includeFutureMatchingRecords,
      maximumExpansionCount: validated.maximumExpansionCount,
      maximumRelationshipDepth: validated.maximumRelationshipDepth,
      scopeFingerprint: validated.scopeFingerprint,
      createdBy: actor.actorId,
      createdAt: now,
      approvedBy: actor.actorId,
      approvedAt: now,
      version: nextScopeVersion,
    });

    const prevVersion = hold.version;
    hold.scopeDefinitionId = newScope.id;
    hold.currentScopeVersion = nextScopeVersion;
    hold.version += 1;
    hold.updatedAt = now;

    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);
    const targets = saved.status === 'ACTIVE' ? this.expandAndPersistHoldTargets(saved, newScope, now) : [];

    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_SCOPE_MODIFIED',
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { scopeVersion: nextScopeVersion - 1, version: prevVersion },
      newState: { scopeVersion: nextScopeVersion, version: saved.version },
      reason: changeReason,
    });

    return { hold: saved, newScope, targets };
  }

  // 4.9 Review a Hold
  public reviewLegalHold(
    actor: CanonicalHoldActor,
    holdId: string,
    rawBody: Record<string, unknown>,
  ): { hold: CanonicalLegalHold; review: CanonicalLegalHoldReview } {
    requireCanonicalHoldPermission(actor, 'legal_hold.review');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    const decision = rawBody.decision as CanonicalReviewDecision;
    if (!['CONTINUE', 'MODIFY_SCOPE', 'RELEASE_RECOMMENDED', 'ESCALATE'].includes(decision)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Invalid review decision.');
    }
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason.trim() : '';
    const nextReviewAt = typeof rawBody.nextReviewAt === 'string' ? rawBody.nextReviewAt : '';
    if (!reason || !nextReviewAt || Number.isNaN(Date.parse(nextReviewAt))) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'reason and valid nextReviewAt are required.');
    }

    const now = new Date().toISOString();
    const prevVersion = hold.version;
    const review = this.repo.appendReview({
      id: this.repo.createId('lhrev'),
      legalHoldId: hold.id,
      holdVersion: hold.version,
      scheduledAt: hold.nextReviewAt ?? now,
      completedAt: now,
      reviewerId: actor.actorId,
      decision,
      reason,
      evidenceReferences: Array.isArray(rawBody.evidenceReferences)
        ? (rawBody.evidenceReferences as string[])
        : [],
      nextReviewAt,
      createdAt: now,
    });

    // A review decision of RELEASE_RECOMMENDED must NOT release the hold
    hold.nextReviewAt = nextReviewAt;
    if (decision === 'ESCALATE' || decision === 'MODIFY_SCOPE') {
      hold.status = 'UNDER_REVIEW';
    }
    hold.version += 1;
    hold.updatedAt = now;

    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);
    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_REVIEWED',
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { version: prevVersion },
      newState: { status: saved.status, nextReviewAt: saved.nextReviewAt, version: saved.version },
      reason,
    });
    return { hold: saved, review };
  }

  // 4.10 Request Hold Release
  public requestHoldRelease(
    actor: CanonicalHoldActor,
    holdId: string,
    rawBody: Record<string, unknown>,
  ): { hold: CanonicalLegalHold; releaseRequest: CanonicalLegalHoldRelease } {
    requireCanonicalHoldPermission(actor, 'legal_hold.release.request');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    if (hold.status !== 'ACTIVE' && hold.status !== 'UNDER_REVIEW') {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        `Cannot request release for hold in status '${hold.status}'.`,
      );
    }
    const releaseType = rawBody.releaseType as CanonicalReleaseType;
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason.trim() : '';
    const authorityReference = typeof rawBody.authorityReference === 'string' ? rawBody.authorityReference.trim() : '';
    if (!['FULL', 'PARTIAL', 'REVOCATION', 'EXPIRATION'].includes(releaseType) || !reason || !authorityReference) {
      throw new CanonicalHoldApiError(
        'VALIDATION_ERROR',
        'releaseType, reason, and authorityReference are required.',
      );
    }

    const scopes = this.repo.scopes.get(hold.id) ?? [];
    const activeScope = scopes.find((s) => s.scopeVersion === hold.currentScopeVersion);
    const now = new Date().toISOString();
    const prevVersion = hold.version;

    const releaseRequest = this.repo.saveOrUpdateRelease({
      id: this.repo.createId('lhrel'),
      legalHoldId: hold.id,
      holdVersion: hold.version,
      releaseType,
      reason,
      authorityReference,
      requestedBy: actor.actorId,
      approvedBy: null,
      requestedAt: now,
      approvedAt: null,
      effectiveAt: null,
      scopeFingerprint: activeScope?.scopeFingerprint ?? '',
      releaseDecisionReference: null,
      status: 'PENDING_APPROVAL',
      createdAt: now,
    });

    // Do NOT remove preservation restrictions upon release request
    hold.status = 'RELEASE_PENDING';
    hold.requestedReleaseAt = now;
    hold.version += 1;
    hold.updatedAt = now;

    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);
    this.repo.appendAuditRecord(actor, {
      operation: 'LEGAL_HOLD_RELEASE_REQUESTED',
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { status: 'ACTIVE', version: prevVersion },
      newState: { status: 'RELEASE_PENDING', version: saved.version, releaseRequestId: releaseRequest.id },
      reason,
    });
    return { hold: saved, releaseRequest };
  }

  // 4.11 Approve Hold Release
  public approveHoldRelease(
    actor: CanonicalHoldActor,
    holdId: string,
    releaseId: string,
    rawBody: Record<string, unknown>,
  ): {
    hold: CanonicalLegalHold;
    releaseRecord: CanonicalLegalHoldRelease;
    remainingActiveHoldIdsOnTargets: string[];
    remainingRetentionObligationIdsOnTargets: string[];
  } {
    requireCanonicalHoldPermission(actor, 'legal_hold.release.approve');
    rejectUntrustedIdentityFields(rawBody);
    const hold = this.requireHoldForTenant(actor, holdId);

    const releases = this.repo.releases.get(hold.id) ?? [];
    const releaseRecord = releases.find((r) => r.id === releaseId);
    if (!releaseRecord) {
      throw new CanonicalHoldApiError('RESOURCE_NOT_FOUND', `Release request '${releaseId}' not found.`);
    }
    if (releaseRecord.requestedBy === actor.actorId && !actor.allowSelfApprovalByPolicy) {
      throw new CanonicalHoldApiError(
        'FORBIDDEN',
        'Separation of duties violation: release requester cannot approve their own release request.',
      );
    }

    const decision = rawBody.decision as 'APPROVED' | 'REJECTED';
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason.trim() : '';
    if (!['APPROVED', 'REJECTED'].includes(decision) || !reason) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'decision (APPROVED|REJECTED) and reason are required.');
    }

    const now = new Date().toISOString();
    const prevVersion = hold.version;
    releaseRecord.approvedBy = actor.actorId;
    releaseRecord.approvedAt = now;
    releaseRecord.status = decision;

    const remainingActiveHoldIds = new Set<string>();
    const remainingObligationIds = new Set<string>();

    if (decision === 'APPROVED') {
      releaseRecord.effectiveAt = now;
      releaseRecord.releaseDecisionReference = `rel_dec_${releaseRecord.id}`;
      hold.status = releaseRecord.releaseType === 'REVOCATION' ? 'REVOKED' : 'RELEASED';
      hold.releasedAt = now;
      hold.releasedBy = actor.actorId;
      hold.releaseReason = reason;

      // Reconcile targets and obligations for this hold only
      const holdTargets = Array.from(this.repo.targets.values()).filter((t) => t.legalHoldId === hold.id);
      for (const target of holdTargets) {
        target.preservationStatus = 'RELEASED';
        target.releasedAt = now;
        target.updatedAt = now;

        // Identify other active holds on the same target
        for (const otherTarget of this.repo.targets.values()) {
          if (
            otherTarget.legalHoldId !== hold.id &&
            otherTarget.sourceModule === target.sourceModule &&
            otherTarget.entityType === target.entityType &&
            otherTarget.entityId === target.entityId &&
            otherTarget.preservationStatus === 'ACTIVE'
          ) {
            const otherHold = this.repo.holds.get(otherTarget.legalHoldId);
            if (otherHold && (otherHold.status === 'ACTIVE' || otherHold.status === 'RELEASE_PENDING')) {
              remainingActiveHoldIds.add(otherHold.id);
            }
          }
        }

        // Release only the LEGAL_HOLD obligation for THIS hold; preserve independent obligations
        for (const obl of this.repo.retentionObligations.values()) {
          if (
            obl.targetEntityType === target.entityType &&
            obl.targetEntityId === target.entityId &&
            obl.sourceModule === target.sourceModule
          ) {
            if (obl.sourceReferenceType === 'LEGAL_HOLD' && obl.sourceReferenceId === hold.id) {
              obl.status = 'RELEASED';
              obl.updatedAt = now;
            } else if (obl.status === 'ACTIVE') {
              remainingObligationIds.add(obl.id);
            }
          }
        }
      }
    } else {
      hold.status = 'ACTIVE';
    }

    this.repo.saveOrUpdateRelease(releaseRecord);
    hold.version += 1;
    hold.updatedAt = now;
    const saved = this.repo.saveHoldWithOptimisticConcurrency(hold, prevVersion);

    this.repo.appendAuditRecord(actor, {
      operation: `LEGAL_HOLD_RELEASE_${decision}`,
      targetType: 'LegalHold',
      targetId: saved.id,
      previousState: { status: 'RELEASE_PENDING', version: prevVersion },
      newState: {
        status: saved.status,
        version: saved.version,
        remainingActiveHoldsCount: remainingActiveHoldIds.size,
        remainingObligationsCount: remainingObligationIds.size,
      },
      reason,
    });

    return {
      hold: saved,
      releaseRecord,
      remainingActiveHoldIdsOnTargets: Array.from(remainingActiveHoldIds),
      remainingRetentionObligationIdsOnTargets: Array.from(remainingObligationIds),
    };
  }

  // 4.12 Retrieve Hold History
  public getHoldHistory(
    actor: CanonicalHoldActor,
    holdId: string,
  ): {
    holdId: string;
    holdNumber: string;
    scopes: CanonicalLegalHoldScope[];
    approvals: CanonicalLegalHoldApproval[];
    reviews: CanonicalLegalHoldReview[];
    releases: CanonicalLegalHoldRelease[];
    auditTrail: ReturnType<CanonicalHoldRepository['appendAuditRecord']>[];
  } {
    requireCanonicalHoldPermission(actor, 'legal_hold.read');
    const hold = this.requireHoldForTenant(actor, holdId);
    return {
      holdId: hold.id,
      holdNumber: hold.holdNumber,
      scopes: [...(this.repo.scopes.get(hold.id) ?? [])],
      approvals: [...(this.repo.approvals.get(hold.id) ?? [])],
      reviews: [...(this.repo.reviews.get(hold.id) ?? [])],
      releases: [...(this.repo.releases.get(hold.id) ?? [])],
      auditTrail: this.repo.auditRecords.filter((a) => a.targetId === hold.id),
    };
  }

  private expandAndPersistHoldTargets(
    hold: CanonicalLegalHold,
    scope: CanonicalLegalHoldScope,
    nowIso: string,
  ): CanonicalLegalHoldTarget[] {
    const persisted: CanonicalLegalHoldTarget[] = [];
    let expansionCount = 0;

    // 1. Direct targets from scope.entityIds
    for (let i = 0; i < scope.entityIds.length; i++) {
      if (expansionCount >= scope.maximumExpansionCount) break;
      const entityId = scope.entityIds[i];
      const entityType = scope.entityTypes[i] ?? scope.entityTypes[0] ?? 'ENTITY';
      const sourceModule = scope.sourceModuleIds[i] ?? scope.sourceModuleIds[0] ?? 'default';

      const directTarget = this.repo.upsertHoldTargetUnique({
        legalHoldId: hold.id,
        scopeVersion: scope.scopeVersion,
        sourceModule,
        entityType,
        entityId,
        recordVersion: 1,
        targetOrigin: 'DIRECT',
        parentTargetId: null,
        propagationRuleId: null,
        preservationStatus: 'ACTIVE',
        firstCoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        releasedAt: null,
        failureCode: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      persisted.push(directTarget);
      expansionCount += 1;
      this.ensureHoldRetentionObligation(hold, directTarget, nowIso);

      // 2. Bounded relationship propagation
      if (scope.maximumRelationshipDepth > 0 && scope.relationshipRules.length > 0) {
        for (const rule of scope.relationshipRules) {
          if (rule.parentEntityType !== entityType) continue;
          const matchingEdges = this.repo.entityRelationships.filter(
            (edge) =>
              edge.parentEntityType === entityType &&
              edge.parentEntityId === entityId &&
              edge.childEntityType === rule.childEntityType &&
              edge.childSourceModule === rule.childSourceModule &&
              (rule.childDataCategories.length === 0 || rule.childDataCategories.includes(edge.childDataCategory)),
          );
          for (const edge of matchingEdges) {
            if (expansionCount >= scope.maximumExpansionCount) break;
            const childTarget = this.repo.upsertHoldTargetUnique({
              legalHoldId: hold.id,
              scopeVersion: scope.scopeVersion,
              sourceModule: edge.childSourceModule,
              entityType: edge.childEntityType,
              entityId: edge.childEntityId,
              recordVersion: 1,
              targetOrigin: 'PROPAGATED',
              parentTargetId: directTarget.id,
              propagationRuleId: rule.ruleId,
              preservationStatus: 'ACTIVE',
              firstCoveredAt: nowIso,
              lastVerifiedAt: nowIso,
              releasedAt: null,
              failureCode: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
            persisted.push(childTarget);
            expansionCount += 1;
            this.ensureHoldRetentionObligation(hold, childTarget, nowIso);
          }
        }
      }
    }
    return persisted;
  }

  private ensureHoldRetentionObligation(
    hold: CanonicalLegalHold,
    target: CanonicalLegalHoldTarget,
    nowIso: string,
  ): CanonicalRetentionObligation {
    const existing = Array.from(this.repo.retentionObligations.values()).find(
      (o) =>
        o.sourceReferenceType === 'LEGAL_HOLD' &&
        o.sourceReferenceId === hold.id &&
        o.targetEntityType === target.entityType &&
        o.targetEntityId === target.entityId &&
        o.sourceModule === target.sourceModule &&
        o.status === 'ACTIVE',
    );
    if (existing) return existing;

    const obligation: CanonicalRetentionObligation = {
      id: this.repo.createId('robl'),
      tenantId: hold.tenantId ?? 'GLOBAL',
      targetEntityType: target.entityType,
      targetEntityId: target.entityId,
      sourceModule: target.sourceModule,
      obligationType: 'LEGAL_HOLD',
      sourceReferenceType: 'LEGAL_HOLD',
      sourceReferenceId: hold.id,
      sourceVersion: hold.version,
      retentionStartAt: nowIso,
      retainUntil: null,
      reviewAt: hold.nextReviewAt,
      status: 'ACTIVE',
      priorityClass: 1,
      reasonCode: 'ACTIVE_LEGAL_HOLD',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.repo.retentionObligations.set(obligation.id, obligation);
    return obligation;
  }

  private requireHoldForTenant(actor: CanonicalHoldActor, holdId: string): CanonicalLegalHold {
    const hold = this.repo.holds.get(holdId);
    if (!hold) {
      throw new CanonicalHoldApiError('RESOURCE_NOT_FOUND', `LegalHold '${holdId}' not found.`);
    }
    assertTenantAccess(actor, hold.tenantId);
    return structuredClone(hold);
  }
}
