import {
  CanonicalDispositionAction,
  CanonicalDispositionApproval,
  CanonicalDispositionRequest,
  CanonicalDispositionRequestSource,
  CanonicalHoldActor,
  CanonicalRetentionEvaluation,
} from './canonicalHoldModels';
import {
  assertTenantAccess,
  CanonicalHoldApiError,
  paginateCollection,
  rejectUntrustedIdentityFields,
  requireCanonicalHoldPermission,
} from './canonicalHoldValidationAndAuthz';
import { CanonicalHoldRepository } from './canonicalHoldRepository';
import { CanonicalRetentionPolicyAndEvaluationService } from './canonicalRetentionPolicyAndEvaluationService';

export class CanonicalRetentionAndDispositionService extends CanonicalRetentionPolicyAndEvaluationService {
  constructor(repo: CanonicalHoldRepository) {
    super(repo);
  }

  // 7.1 Create a Disposition Request
  public createDispositionRequest(
    actor: CanonicalHoldActor,
    rawBody: Record<string, unknown>,
    options?: { evaluationNowIso?: string },
  ): { request: CanonicalDispositionRequest; evaluation: CanonicalRetentionEvaluation } {
    requireCanonicalHoldPermission(actor, 'disposition.request');
    rejectUntrustedIdentityFields(rawBody);

    const target = rawBody.target as { sourceModule?: string; entityType?: string; entityId?: string } | undefined;
    if (!target || !target.sourceModule || !target.entityType || !target.entityId) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'target is required.');
    }
    const requestedAction = rawBody.requestedAction as CanonicalDispositionAction;
    if (!['DELETE', 'ANONYMIZE', 'ARCHIVE'].includes(requestedAction)) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'requestedAction must be DELETE, ANONYMIZE, or ARCHIVE.');
    }
    const requestReason = typeof rawBody.requestReason === 'string' ? rawBody.requestReason.trim() : '';
    const requestSource = rawBody.requestSource as CanonicalDispositionRequestSource;
    if (
      !requestReason ||
      !['USER_PRIVACY_REQUEST', 'RETENTION_EXPIRY', 'ADMINISTRATIVE', 'SYSTEM_POLICY'].includes(requestSource)
    ) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'requestReason and valid requestSource are required.');
    }

    const evalResult = this.evaluateRecord(
      {
        ...actor,
        permissions: Array.from(new Set([...actor.permissions, 'retention.evaluate'])),
      },
      {
        target,
        requestType: requestedAction,
        reason: `Fresh evaluation for disposition request: ${requestReason}`,
      },
      options,
    );

    const isEligible =
      evalResult.decision === 'ELIGIBLE_FOR_DISPOSITION' ||
      (requestedAction === 'ANONYMIZE' && evalResult.decision === 'ANONYMIZATION_REVIEW_REQUIRED');

    const now = options?.evaluationNowIso ?? new Date().toISOString();
    const request: CanonicalDispositionRequest = {
      id: this.repo.createId('dreq'),
      tenantId: actor.tenantId,
      requestNumber: this.repo.nextDispositionNumber(),
      targetEntityType: target.entityType,
      targetEntityId: target.entityId,
      sourceModule: target.sourceModule,
      requestedAction,
      requestReason,
      requestSource,
      privacyRequestReference:
        typeof rawBody.privacyRequestReference === 'string' ? rawBody.privacyRequestReference : null,
      retentionEvaluationId: evalResult.decisionId,
      status: isEligible ? 'PENDING_APPROVAL' : 'BLOCKED',
      requestedBy: actor.actorId,
      approvedBy: null,
      approvedAt: null,
      executedAt: null,
      executionReference: null,
      failureCode: isEligible ? null : evalResult.decisionReasonCode,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.repo.dispositionRequests.set(request.id, structuredClone(request));
    this.repo.appendAuditRecord(actor, {
      operation: 'DISPOSITION_REQUEST_CREATED',
      targetType: 'DispositionRequest',
      targetId: request.id,
      previousState: null,
      newState: { status: request.status, evaluationDecision: evalResult.decision, version: 1 },
      reason: requestReason,
      sourceModule: target.sourceModule,
    });

    return { request: structuredClone(request), evaluation: evalResult.evaluationRecord };
  }

  // 7.2 Retrieve Disposition Requests
  public listDispositionRequests(
    actor: CanonicalHoldActor,
    query: Record<string, unknown> = {},
  ): { items: CanonicalDispositionRequest[]; nextCursor: string | null; hasMore: boolean } {
    requireCanonicalHoldPermission(actor, 'disposition.request');
    const items = Array.from(this.repo.dispositionRequests.values()).filter((r) => {
      if (r.tenantId !== actor.tenantId) return false;
      if (query.status && r.status !== query.status) return false;
      if (query.requestedAction && r.requestedAction !== query.requestedAction) return false;
      if (query.sourceModule && r.sourceModule !== query.sourceModule) return false;
      if (query.entityType && r.targetEntityType !== query.entityType) return false;
      if (query.requestSource && r.requestSource !== query.requestSource) return false;
      return true;
    });
    return paginateCollection(items, {
      limit: query.limit as number | string | undefined,
      cursor: query.cursor as string | undefined,
    });
  }

  // 7.3 Retrieve a Disposition Request
  public getDispositionRequest(
    actor: CanonicalHoldActor,
    requestId: string,
  ): {
    request: CanonicalDispositionRequest;
    evaluation: CanonicalRetentionEvaluation | null;
    approvals: CanonicalDispositionApproval[];
  } {
    requireCanonicalHoldPermission(actor, 'disposition.request');
    const req = this.requireDispositionForTenant(actor, requestId);
    const evaluation = this.repo.retentionEvaluations.get(req.retentionEvaluationId) ?? null;
    const approvals = [...(this.repo.dispositionApprovals.get(req.id) ?? [])];
    return { request: structuredClone(req), evaluation, approvals };
  }

  // 7.4 Approve a Disposition
  public approveDispositionRequest(
    actor: CanonicalHoldActor,
    requestId: string,
    rawBody: Record<string, unknown>,
    options?: { evaluationNowIso?: string },
  ): { request: CanonicalDispositionRequest; approval: CanonicalDispositionApproval } {
    requireCanonicalHoldPermission(actor, 'disposition.approve');
    rejectUntrustedIdentityFields(rawBody);
    const req = this.requireDispositionForTenant(actor, requestId);

    const decision = rawBody.decision as 'APPROVED' | 'REJECTED';
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason.trim() : '';
    if (!['APPROVED', 'REJECTED'].includes(decision) || !reason) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'decision (APPROVED|REJECTED) and reason are required.');
    }

    const nowIso = options?.evaluationNowIso ?? new Date().toISOString();
    const initialEval = this.repo.retentionEvaluations.get(req.retentionEvaluationId);
    if (!initialEval || Date.parse(nowIso) > Date.parse(initialEval.expiresAt)) {
      throw new CanonicalHoldApiError(
        'EVALUATION_STALE',
        'The retention evaluation associated with this disposition request has expired and is stale.',
      );
    }

    const freshEval = this.evaluateRecord(
      {
        ...actor,
        permissions: Array.from(new Set([...actor.permissions, 'retention.evaluate'])),
      },
      {
        target: {
          sourceModule: req.sourceModule,
          entityType: req.targetEntityType,
          entityId: req.targetEntityId,
        },
        requestType: req.requestedAction,
        reason: 'Pre-approval retention reevaluation',
      },
      { evaluationNowIso: nowIso },
    );

    if (freshEval.decision === 'SOURCE_MODULE_UNAVAILABLE') {
      throw new CanonicalHoldApiError('SOURCE_MODULE_UNAVAILABLE', freshEval.explanation);
    }
    if (freshEval.decision === 'PRESERVE_LEGAL_HOLD') {
      req.status = 'BLOCKED';
      req.version += 1;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      throw new CanonicalHoldApiError('ACTIVE_LEGAL_HOLD', freshEval.explanation);
    }
    if (
      freshEval.decision === 'PRESERVE_MANDATORY_RETENTION' ||
      freshEval.decision === 'PRESERVE_CONTRACTUAL_OBLIGATION' ||
      freshEval.decision === 'PRESERVE_INTERNAL_POLICY'
    ) {
      req.status = 'BLOCKED';
      req.version += 1;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      throw new CanonicalHoldApiError('RETENTION_OBLIGATION_ACTIVE', freshEval.explanation);
    }
    if (freshEval.decision === 'LEGAL_REVIEW_REQUIRED') {
      req.status = 'BLOCKED';
      req.version += 1;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      throw new CanonicalHoldApiError('CONFLICTING_PRESERVATION_INSTRUCTIONS', freshEval.explanation);
    }
    if (freshEval.decision !== 'ELIGIBLE_FOR_DISPOSITION' && freshEval.decision !== 'ANONYMIZATION_REVIEW_REQUIRED') {
      throw new CanonicalHoldApiError('INVALID_STATE_TRANSITION', freshEval.explanation);
    }

    const approval: CanonicalDispositionApproval = Object.freeze({
      id: this.repo.createId('dappr'),
      dispositionRequestId: req.id,
      evaluationId: freshEval.decisionId,
      decision,
      reviewerId: actor.actorId,
      reason,
      createdAt: nowIso,
    });
    const list = this.repo.dispositionApprovals.get(req.id) ?? [];
    list.push(approval);
    this.repo.dispositionApprovals.set(req.id, list);

    const prevStatus = req.status;
    req.retentionEvaluationId = freshEval.decisionId;
    req.status = decision === 'APPROVED' ? 'APPROVED' : 'BLOCKED';
    req.approvedBy = decision === 'APPROVED' ? actor.actorId : null;
    req.approvedAt = decision === 'APPROVED' ? nowIso : null;
    req.version += 1;
    req.updatedAt = nowIso;
    this.repo.dispositionRequests.set(req.id, structuredClone(req));

    this.repo.appendAuditRecord(actor, {
      operation: `DISPOSITION_${decision}`,
      targetType: 'DispositionRequest',
      targetId: req.id,
      previousState: { status: prevStatus },
      newState: { status: req.status, version: req.version, evaluationId: freshEval.decisionId },
      reason,
      sourceModule: req.sourceModule,
    });
    return { request: structuredClone(req), approval };
  }

  // 7.5 Execute a Disposition
  public async executeDispositionRequest(
    actor: CanonicalHoldActor,
    requestId: string,
    rawBody: Record<string, unknown>,
    options?: { evaluationNowIso?: string },
  ): Promise<{ request: CanonicalDispositionRequest; idempotentReplay: boolean }> {
    requireCanonicalHoldPermission(actor, 'disposition.execute');
    rejectUntrustedIdentityFields(rawBody);
    const req = this.requireDispositionForTenant(actor, requestId);

    const idempotencyKey = typeof rawBody.idempotencyKey === 'string' ? rawBody.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'idempotencyKey is required for disposition execution.');
    }

    const cached = this.repo.idempotencyStore.get(`disp_exec::${req.id}::${idempotencyKey}`) as
      | CanonicalDispositionRequest
      | undefined;
    if (cached) {
      return { request: structuredClone(cached), idempotentReplay: true };
    }

    const expectedVersion = Number(rawBody.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== req.version) {
      throw new CanonicalHoldApiError(
        'VERSION_CONFLICT',
        `Expected version ${expectedVersion} does not match current disposition request version ${req.version}.`,
      );
    }
    if (req.status !== 'APPROVED' || !req.approvedBy) {
      throw new CanonicalHoldApiError(
        'DISPOSITION_NOT_APPROVED',
        `Disposition request '${req.id}' is in status '${req.status}' and is not approved for execution.`,
      );
    }

    const nowIso = options?.evaluationNowIso ?? new Date().toISOString();
    const preExecEval = this.evaluateRecord(
      {
        ...actor,
        permissions: Array.from(new Set([...actor.permissions, 'retention.evaluate'])),
      },
      {
        target: {
          sourceModule: req.sourceModule,
          entityType: req.targetEntityType,
          entityId: req.targetEntityId,
        },
        requestType: req.requestedAction,
        reason: 'Immediate pre-execution retention precedence check',
      },
      { evaluationNowIso: nowIso },
    );

    if (preExecEval.decision === 'PRESERVE_LEGAL_HOLD') {
      req.status = 'BLOCKED';
      req.failureCode = 'ACTIVE_LEGAL_HOLD';
      req.version += 1;
      req.updatedAt = nowIso;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      this.repo.appendAuditRecord(actor, {
        operation: 'DISPOSITION_EXECUTION_BLOCKED_BY_HOLD',
        targetType: 'DispositionRequest',
        targetId: req.id,
        previousState: { status: 'APPROVED' },
        newState: { status: 'BLOCKED', version: req.version },
        reason: preExecEval.explanation,
        sourceModule: req.sourceModule,
      });
      throw new CanonicalHoldApiError('ACTIVE_LEGAL_HOLD', preExecEval.explanation);
    }
    if (preExecEval.decision === 'SOURCE_MODULE_UNAVAILABLE') {
      throw new CanonicalHoldApiError('SOURCE_MODULE_UNAVAILABLE', preExecEval.explanation);
    }
    if (
      preExecEval.decision !== 'ELIGIBLE_FOR_DISPOSITION' &&
      !(req.requestedAction === 'ANONYMIZE' && preExecEval.decision === 'ANONYMIZATION_REVIEW_REQUIRED')
    ) {
      req.status = 'BLOCKED';
      req.failureCode = preExecEval.decisionReasonCode;
      req.version += 1;
      req.updatedAt = nowIso;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      throw new CanonicalHoldApiError('RETENTION_OBLIGATION_ACTIVE', preExecEval.explanation);
    }

    const execOutcome = await this.repo.dispositionProvider.executeDisposition({
      sourceModule: req.sourceModule,
      entityType: req.targetEntityType,
      entityId: req.targetEntityId,
      action: req.requestedAction,
      dispositionRequestId: req.id,
    });

    const prevVersion = req.version;
    if (!execOutcome.ok) {
      req.status = 'FAILED';
      req.failureCode = execOutcome.failureCode ?? 'SOURCE_EXECUTION_ERROR';
      req.version += 1;
      req.updatedAt = nowIso;
      this.repo.dispositionRequests.set(req.id, structuredClone(req));
      this.repo.appendAuditRecord(actor, {
        operation: 'DISPOSITION_EXECUTION_FAILED',
        targetType: 'DispositionRequest',
        targetId: req.id,
        previousState: { status: 'APPROVED', version: prevVersion },
        newState: { status: 'FAILED', failureCode: req.failureCode, version: req.version },
        reason: 'Source module disposition execution failed',
        sourceModule: req.sourceModule,
      });
      return { request: structuredClone(req), idempotentReplay: false };
    }

    req.status = 'COMPLETED';
    req.executedAt = nowIso;
    req.executionReference = execOutcome.executionReference ?? `exec_${req.id}`;
    req.failureCode = null;
    req.version += 1;
    req.updatedAt = nowIso;
    this.repo.dispositionRequests.set(req.id, structuredClone(req));
    this.repo.idempotencyStore.set(`disp_exec::${req.id}::${idempotencyKey}`, structuredClone(req));

    this.repo.appendAuditRecord(actor, {
      operation: 'DISPOSITION_EXECUTED',
      targetType: 'DispositionRequest',
      targetId: req.id,
      previousState: { status: 'APPROVED', version: prevVersion },
      newState: { status: 'COMPLETED', executionReference: req.executionReference, version: req.version },
      reason: 'Disposition executed via source module provider',
      sourceModule: req.sourceModule,
    });

    return { request: structuredClone(req), idempotentReplay: false };
  }

  // 7.6 Cancel a Disposition
  public cancelDispositionRequest(
    actor: CanonicalHoldActor,
    requestId: string,
    reason: string,
  ): CanonicalDispositionRequest {
    requireCanonicalHoldPermission(actor, 'disposition.approve');
    const req = this.requireDispositionForTenant(actor, requestId);
    if (req.status === 'COMPLETED') {
      throw new CanonicalHoldApiError(
        'INVALID_STATE_TRANSITION',
        'A completed disposition cannot be cancelled retroactively.',
      );
    }
    if (!reason?.trim()) {
      throw new CanonicalHoldApiError('VALIDATION_ERROR', 'Cancellation reason is required.');
    }
    const prevStatus = req.status;
    req.status = 'CANCELLED';
    req.version += 1;
    req.updatedAt = new Date().toISOString();
    this.repo.dispositionRequests.set(req.id, structuredClone(req));

    this.repo.appendAuditRecord(actor, {
      operation: 'DISPOSITION_CANCELLED',
      targetType: 'DispositionRequest',
      targetId: req.id,
      previousState: { status: prevStatus },
      newState: { status: 'CANCELLED', version: req.version },
      reason: reason.trim(),
      sourceModule: req.sourceModule,
    });
    return structuredClone(req);
  }

  // SECTION 8: PRIVACY REQUEST INTEGRATION CONTRACT (EMPLOYEE 64)
  public evaluatePrivacyDisposition(
    actor: CanonicalHoldActor,
    input: {
      privacyRequestId: string;
      requestingUserReference: string;
      requestedDataCategories: string[];
      requestedEntityReferences: Array<{ sourceModule: string; entityType: string; entityId: string }>;
      requestScope: 'FULL_ACCOUNT' | 'SELECTED_RECORDS';
      requestTimestamp: string;
    },
  ) {
    requireCanonicalHoldPermission(actor, 'retention.evaluate');

    const eligibleRecords: Array<{ sourceModule: string; entityType: string; entityId: string; evaluationId: string }> = [];
    const preservedRecords: Array<{
      sourceModule: string;
      entityType: string;
      entityId: string;
      evaluationId: string;
      reasonCode: string;
      publicSafeExplanation: string;
    }> = [];
    const recordsRequiringLegalReview: Array<{
      sourceModule: string;
      entityType: string;
      entityId: string;
      evaluationId: string;
      reasonCode: string;
    }> = [];
    const preservationRefs = new Set<string>();
    const policyRefs = new Set<string>();
    const reasonCodes = new Set<string>();
    const reassessmentRequirements: string[] = [];

    for (const ref of input.requestedEntityReferences) {
      const evalRes = this.evaluateRecord(
        actor,
        {
          target: ref,
          requestType: 'DELETE',
          reason: `Employee 64 privacy deletion request ${input.privacyRequestId}`,
        },
        { evaluationNowIso: input.requestTimestamp },
      );

      reasonCodes.add(evalRes.decisionReasonCode);
      for (const h of evalRes.applicableHolds) preservationRefs.add(h.holdNumber);
      for (const p of evalRes.evaluationRecord.applicablePolicyVersions) policyRefs.add(p.policyCode);

      if (evalRes.decision === 'ELIGIBLE_FOR_DISPOSITION' || evalRes.decision === 'ANONYMIZATION_REVIEW_REQUIRED') {
        eligibleRecords.push({ ...ref, evaluationId: evalRes.decisionId });
      } else if (
        evalRes.decision === 'PRESERVE_LEGAL_HOLD' ||
        evalRes.decision === 'PRESERVE_MANDATORY_RETENTION' ||
        evalRes.decision === 'PRESERVE_CONTRACTUAL_OBLIGATION' ||
        evalRes.decision === 'PRESERVE_INTERNAL_POLICY'
      ) {
        preservedRecords.push({
          ...ref,
          evaluationId: evalRes.decisionId,
          reasonCode: evalRes.decisionReasonCode,
          publicSafeExplanation:
            'This record is temporarily retained to comply with a mandatory legal or regulatory preservation obligation.',
        });
        reassessmentRequirements.push(
          `Reassess ${ref.sourceModule}:${ref.entityType}:${ref.entityId} upon release or expiry of obligation (${evalRes.decisionReasonCode}).`,
        );
      } else {
        recordsRequiringLegalReview.push({
          ...ref,
          evaluationId: evalRes.decisionId,
          reasonCode: evalRes.decisionReasonCode,
        });
      }
    }

    let overallProcessingStatus:
      | 'ELIGIBLE_FOR_FULL_FULFILLMENT'
      | 'PARTIAL_FULFILLMENT_REQUIRED'
      | 'PRESERVATION_REQUIRED'
      | 'LEGAL_REVIEW_REQUIRED' = 'PRESERVATION_REQUIRED';

    if (recordsRequiringLegalReview.length > 0) {
      overallProcessingStatus = 'LEGAL_REVIEW_REQUIRED';
    } else if (
      eligibleRecords.length === input.requestedEntityReferences.length &&
      eligibleRecords.length > 0
    ) {
      overallProcessingStatus = 'ELIGIBLE_FOR_FULL_FULFILLMENT';
    } else if (eligibleRecords.length > 0 && preservedRecords.length > 0) {
      overallProcessingStatus = 'PARTIAL_FULFILLMENT_REQUIRED';
    }

    this.repo.appendAuditRecord(actor, {
      operation: 'PRIVACY_DISPOSITION_EVALUATED',
      targetType: 'PrivacyRequest',
      targetId: input.privacyRequestId,
      previousState: null,
      newState: {
        overallProcessingStatus,
        eligibleCount: eligibleRecords.length,
        preservedCount: preservedRecords.length,
      },
      reason: `Evaluated Employee 64 privacy request for ${input.requestingUserReference}`,
      sourceModule: 'employee-64-privacy',
    });

    return {
      privacyRequestId: input.privacyRequestId,
      overallProcessingStatus,
      eligibleRecords,
      preservedRecords,
      recordsRequiringLegalReview,
      applicablePreservationReferences: Array.from(preservationRefs),
      applicableRetentionPolicyReferences: Array.from(policyRefs),
      reasonCodes: Array.from(reasonCodes),
      reassessmentRequirements,
    };
  }

  private requireDispositionForTenant(actor: CanonicalHoldActor, requestId: string): CanonicalDispositionRequest {
    const req = this.repo.dispositionRequests.get(requestId);
    if (!req) {
      throw new CanonicalHoldApiError('RESOURCE_NOT_FOUND', `DispositionRequest '${requestId}' not found.`);
    }
    assertTenantAccess(actor, req.tenantId);
    return req;
  }
}
