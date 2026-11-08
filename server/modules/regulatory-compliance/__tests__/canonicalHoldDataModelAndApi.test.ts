import assert from 'node:assert/strict';
import {
  CanonicalHoldActor,
  CanonicalHoldApiController,
  CanonicalHoldRepository,
} from '../index';

process.env.PREVENT_PROD_FIREBASE_IN_TEST = 'true';

const creatorActor: CanonicalHoldActor = {
  actorId: 'actor_creator_01',
  actorRole: 'COMPLIANCE_COUNSEL',
  tenantId: 'tenant_alpha',
  permissions: [
    'legal_hold.read',
    'legal_hold.create',
    'legal_hold.scope.manage',
    'legal_hold.review',
    'legal_hold.release.request',
    'retention.policy.read',
    'retention.policy.manage',
    'retention.evaluate',
    'disposition.request',
    'retention.conflict.read',
    'retention.audit.read',
  ],
};

const approverActor: CanonicalHoldActor = {
  actorId: 'actor_approver_02',
  actorRole: 'GENERAL_COUNSEL',
  tenantId: 'tenant_alpha',
  permissions: [
    'legal_hold.read',
    'legal_hold.approve',
    'legal_hold.activate',
    'legal_hold.scope.manage',
    'legal_hold.review',
    'legal_hold.release.approve',
    'retention.policy.read',
    'retention.policy.approve',
    'retention.evaluate',
    'disposition.request',
    'disposition.approve',
    'disposition.execute',
    'retention.conflict.read',
    'retention.audit.read',
  ],
};

const unprivilegedActor: CanonicalHoldActor = {
  actorId: 'actor_basic_03',
  actorRole: 'VIEWER',
  tenantId: 'tenant_alpha',
  permissions: ['legal_hold.read'],
};

const otherOrgActor: CanonicalHoldActor = {
  ...approverActor,
  actorId: 'actor_other_org_04',
  tenantId: 'tenant_beta',
};

async function runAll30CanonicalTests(): Promise<void> {
  const repo = new CanonicalHoldRepository();
  const api = new CanonicalHoldApiController(repo);

  // Seed relationship graph for bounded propagation
  repo.entityRelationships.push(
    {
      parentSourceModule: 'transactions',
      parentEntityType: 'TRANSACTION',
      parentEntityId: 'transaction_123',
      childSourceModule: 'documents',
      childEntityType: 'DOCUMENT',
      childEntityId: 'document_456',
      childDataCategory: 'CONTRACTUAL_RECORDS',
    },
    {
      parentSourceModule: 'transactions',
      parentEntityType: 'TRANSACTION',
      parentEntityId: 'transaction_123',
      childSourceModule: 'documents',
      childEntityType: 'DOCUMENT',
      childEntityId: 'document_overflow_999',
      childDataCategory: 'CONTRACTUAL_RECORDS',
    },
  );

  // TEST 1: Hold creation and draft/pending_approval persistence
  const createRes = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/legal-holds',
    actor: creatorActor,
    body: {
      title: 'Transaction preservation',
      description: 'Preserve records relevant to the referenced investigation.',
      holdType: 'INVESTIGATION',
      legalBasis: {
        basisType: 'APPROVED_CASE_REFERENCE',
        referenceId: 'case_123',
        description: 'Approved preservation instruction',
      },
      jurisdictionIds: ['jurisdiction_1'],
      caseReferences: ['case_123'],
      obligationReferences: [],
      priority: 'HIGH',
      effectiveAt: '2026-11-08T12:00:00.000Z',
      reviewIntervalDays: 30,
      scope: {
        scopeType: 'EXPLICIT_RECORDS',
        entityTypes: ['TRANSACTION'],
        entityIds: ['transaction_123'],
        dataCategories: ['CONTRACTUAL_RECORDS'],
        sourceModuleIds: ['transactions'],
        relationshipRules: [
          {
            ruleId: 'rel_tx_docs',
            parentEntityType: 'TRANSACTION',
            childEntityType: 'DOCUMENT',
            childSourceModule: 'documents',
            childDataCategories: ['CONTRACTUAL_RECORDS'],
            maxDepth: 1,
          },
        ],
        includeFutureMatchingRecords: false,
        maximumExpansionCount: 2, // Bounded to 1 direct + 1 propagated child
        maximumRelationshipDepth: 1,
      },
    },
  });
  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.success, true);
  const createdHold = (createRes.body as any).data as {
    id: string;
    holdNumber: string;
    status: string;
    version: number;
    scopeVersion: number;
    scopeFingerprint: string;
  };
  assert.equal(createdHold.status, 'PENDING_APPROVAL');
  assert.equal(createdHold.version, 1);
  assert.equal(createdHold.scopeVersion, 1);

  // TEST 2: Hold approval (and separation-of-duties check)
  const selfApproveRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/approve`,
    actor: creatorActor,
    body: {
      decision: 'APPROVED',
      reason: 'Self approval attempt',
      approvedScopeFingerprint: createdHold.scopeFingerprint,
    },
  });
  assert.equal(selfApproveRes.statusCode, 403);

  const approveRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/approve`,
    actor: approverActor,
    body: {
      decision: 'APPROVED',
      reason: 'Preservation instruction verified.',
      approvedScopeFingerprint: createdHold.scopeFingerprint,
    },
  });
  assert.equal(approveRes.statusCode, 200);
  const approvedHoldVersion = (approveRes.body as any).data.hold.version as number;
  assert.equal(approvedHoldVersion, 2);
  // Approval endpoint does NOT activate the hold
  assert.equal((approveRes.body as any).data.hold.status, 'PENDING_APPROVAL');

  // TEST 4: Activation before effective date is rejected (409 INVALID_STATE_TRANSITION)
  const prematureActivateRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/activate`,
    actor: approverActor,
    evaluationNowIso: '2026-11-08T10:00:00.000Z', // 2 hours before effectiveAt
    body: {
      expectedVersion: approvedHoldVersion,
      reason: 'Premature activation attempt',
    },
  });
  assert.equal(prematureActivateRes.statusCode, 409);
  assert.equal((prematureActivateRes.body as any).error.code, 'INVALID_STATE_TRANSITION');

  // TEST 23: Unauthorized hold activation rejected (403 FORBIDDEN)
  const unauthActivateRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/activate`,
    actor: unprivilegedActor,
    evaluationNowIso: '2026-11-08T12:05:00.000Z',
    body: {
      expectedVersion: approvedHoldVersion,
      reason: 'Unauthorized activation attempt',
    },
  });
  assert.equal(unauthActivateRes.statusCode, 403);

  // TEST 3, 6, 7: Hold activation, duplicate target prevention, and bounded propagation
  const activateRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/activate`,
    actor: approverActor,
    headers: { 'idempotency-key': 'act-key-1' },
    evaluationNowIso: '2026-11-08T12:05:00.000Z',
    body: {
      expectedVersion: approvedHoldVersion,
      reason: 'Approved preservation instruction is effective.',
    },
  });
  assert.equal(activateRes.statusCode, 200);
  assert.equal((activateRes.body as any).data.hold.status, 'ACTIVE');
  // maximumExpansionCount is 2 -> 1 direct (transaction_123) + 1 propagated (document_456), stopping before document_overflow_999
  assert.equal((activateRes.body as any).data.targetCount, 2);

  // Idempotent activation repeat does not create duplicate targets
  const repeatActivateRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/activate`,
    actor: approverActor,
    headers: { 'idempotency-key': 'act-key-1' },
    evaluationNowIso: '2026-11-08T12:06:00.000Z',
    body: {
      expectedVersion: approvedHoldVersion,
      reason: 'Approved preservation instruction is effective.',
    },
  });
  assert.equal(repeatActivateRes.statusCode, 200);
  assert.equal((repeatActivateRes.body as any).data.idempotentReplay, true);

  const targetsListRes = await api.dispatch({
    method: 'GET',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/targets`,
    actor: approverActor,
  });
  assert.equal((targetsListRes.body as any).data.items.length, 2);

  // TEST 5 & 8: Scope version creation & concurrent scope changes (409 VERSION_CONFLICT)
  const activeVersion = (activateRes.body as any).data.hold.version as number;
  const scopeModRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/scopes`,
    actor: approverActor,
    body: {
      expectedHoldVersion: activeVersion,
      changeReason: 'Additional records were identified.',
      scope: {
        scopeType: 'EXPLICIT_RECORDS',
        entityTypes: ['TRANSACTION', 'DOCUMENT'],
        entityIds: ['transaction_123', 'document_456'],
        dataCategories: ['CONTRACTUAL_RECORDS'],
        sourceModuleIds: ['transactions', 'documents'],
        includeFutureMatchingRecords: false,
        maximumExpansionCount: 500,
        maximumRelationshipDepth: 1,
      },
    },
  });
  assert.equal(scopeModRes.statusCode, 200);
  assert.equal((scopeModRes.body as any).data.newScope.scopeVersion, 2);

  const staleScopeModRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/scopes`,
    actor: approverActor,
    body: {
      expectedHoldVersion: activeVersion, // Now stale!
      changeReason: 'Stale concurrent modification',
      scope: {
        scopeType: 'EXPLICIT_RECORDS',
        entityTypes: ['TRANSACTION'],
        entityIds: ['transaction_123'],
        dataCategories: ['CONTRACTUAL_RECORDS'],
        sourceModuleIds: ['transactions'],
        includeFutureMatchingRecords: false,
        maximumExpansionCount: 500,
        maximumRelationshipDepth: 1,
      },
    },
  });
  assert.equal(staleScopeModRes.statusCode, 409);
  assert.equal((staleScopeModRes.body as any).error.code, 'VERSION_CONFLICT');

  // TEST 9: Multiple simultaneous holds on the same target (transaction_123)
  const createHold2 = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/legal-holds',
    actor: creatorActor,
    body: {
      title: 'Regulatory Audit Hold #2',
      holdType: 'REGULATORY',
      legalBasis: {
        basisType: 'APPROVED_CASE_REFERENCE',
        referenceId: 'case_456',
        description: 'Concurrent regulatory hold',
      },
      jurisdictionIds: ['jurisdiction_1'],
      caseReferences: ['case_456'],
      obligationReferences: [],
      priority: 'URGENT',
      effectiveAt: '2026-11-08T12:00:00.000Z',
      reviewIntervalDays: 15,
      scope: {
        scopeType: 'EXPLICIT_RECORDS',
        entityTypes: ['TRANSACTION'],
        entityIds: ['transaction_123'],
        dataCategories: ['CONTRACTUAL_RECORDS'],
        sourceModuleIds: ['transactions'],
        includeFutureMatchingRecords: false,
        maximumExpansionCount: 100,
        maximumRelationshipDepth: 0,
      },
    },
  });
  const hold2Data = (createHold2.body as any).data;
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${hold2Data.id}/approve`,
    actor: approverActor,
    body: {
      decision: 'APPROVED',
      reason: 'Approved hold 2',
      approvedScopeFingerprint: hold2Data.scopeFingerprint,
    },
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${hold2Data.id}/activate`,
    actor: approverActor,
    evaluationNowIso: '2026-11-08T12:10:00.000Z',
    body: {
      expectedVersion: 2,
      reason: 'Activated hold 2',
    },
  });

  const evalMultiHold = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2026-11-08T12:15:00.000Z',
    body: {
      target: {
        sourceModule: 'transactions',
        entityType: 'TRANSACTION',
        entityId: 'transaction_123',
      },
      requestType: 'DELETE',
      reason: 'Check multiple holds',
    },
  });
  assert.equal((evalMultiHold.body as any).data.decision, 'PRESERVE_LEGAL_HOLD');
  assert.equal((evalMultiHold.body as any).data.applicableHolds.length, 2);

  // TEST 18: Deletion / Disposition request blocked by active hold
  const blockedDispRes = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/dispositions',
    actor: creatorActor,
    evaluationNowIso: '2026-11-08T12:15:00.000Z',
    body: {
      target: {
        sourceModule: 'transactions',
        entityType: 'TRANSACTION',
        entityId: 'transaction_123',
      },
      requestedAction: 'DELETE',
      requestReason: 'Attempt deletion under hold',
      requestSource: 'RETENTION_EXPIRY',
      privacyRequestReference: null,
    },
  });
  assert.equal(blockedDispRes.statusCode, 201);
  assert.equal((blockedDispRes.body as any).data.request.status, 'BLOCKED');

  // TEST 10, 11, 24: Hold release request, unauthorized release rejection, and release approval with another hold still active
  const relReqRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/release-requests`,
    actor: creatorActor,
    body: {
      releaseType: 'FULL',
      reason: 'Investigation 1 concluded',
      authorityReference: 'authority_reference_123',
    },
  });
  assert.equal(relReqRes.statusCode, 201);
  const releaseId = (relReqRes.body as any).data.releaseRequest.id as string;

  // Unauthorized release approval rejected (403 FORBIDDEN)
  const unauthRelApprove = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/release-requests/${releaseId}/approve`,
    actor: unprivilegedActor,
    body: {
      decision: 'APPROVED',
      reason: 'Unauthorized release',
    },
  });
  assert.equal(unauthRelApprove.statusCode, 403);

  const relApproveRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/release-requests/${releaseId}/approve`,
    actor: approverActor,
    body: {
      decision: 'APPROVED',
      reason: 'The release instruction has been verified.',
    },
  });
  assert.equal(relApproveRes.statusCode, 200);
  assert.equal((relApproveRes.body as any).data.hold.status, 'RELEASED');
  assert.deepEqual((relApproveRes.body as any).data.remainingActiveHoldIdsOnTargets, [hold2Data.id]);

  // Now release Hold #2 as well so we can test Mandatory, Contractual, and Internal retention precedence
  const relReq2 = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${hold2Data.id}/release-requests`,
    actor: creatorActor,
    body: {
      releaseType: 'FULL',
      reason: 'Audit 2 concluded',
      authorityReference: 'authority_reference_123',
    },
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${hold2Data.id}/release-requests/${(relReq2.body as any).data.releaseRequest.id}/approve`,
    actor: approverActor,
    body: {
      decision: 'APPROVED',
      reason: 'Verified release of hold 2',
    },
  });

  // TEST 15: Missing policy configuration returns RETENTION_CONFIGURATION_MISSING
  const missingPolEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2026-11-08T12:20:00.000Z',
    body: {
      target: {
        sourceModule: 'transactions',
        entityType: 'TRANSACTION',
        entityId: 'transaction_123',
      },
      requestType: 'DELETE',
      reason: 'Check missing policy',
    },
  });
  assert.equal((missingPolEval.body as any).data.decision, 'RETENTION_CONFIGURATION_MISSING');

  // TEST 28: Create, update, approve, and activate RetentionPolicy with immutable version snapshots
  const createPolRes = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention-policies',
    actor: creatorActor,
    body: {
      policyCode: 'RET-TX-STAT-10Y',
      name: 'Statutory Transaction Retention',
      description: 'Initial v1 description',
      dataCategories: ['CONTRACTUAL_RECORDS'],
      entityTypes: ['TRANSACTION', 'DOCUMENT'],
      sourceModules: ['transactions', 'documents'],
      jurisdictionIds: ['jurisdiction_1'],
      policyType: 'STATUTORY',
      authorityReference: 'STAT-ACT-101',
      retentionTrigger: 'TRANSACTION_COMPLETED',
      retentionDurationDays: 365,
      dispositionMethod: 'DELETE',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    },
  });
  assert.equal(createPolRes.statusCode, 201);
  const policyId = (createPolRes.body as any).data.id as string;

  await api.dispatch({
    method: 'PATCH',
    path: `/api/admin/compliance/retention-policies/${policyId}`,
    actor: creatorActor,
    headers: { 'if-match': '1' },
    body: {
      description: 'Updated v2 description',
      retentionDurationDays: 730,
      changeReason: 'Extended duration',
    },
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/retention-policies/${policyId}/submit`,
    actor: creatorActor,
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/retention-policies/${policyId}/approve`,
    actor: approverActor,
    body: { reason: 'Verified statutory basis' },
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/retention-policies/${policyId}/activate`,
    actor: approverActor,
  });

  const versionsRes = await api.dispatch({
    method: 'GET',
    path: `/api/admin/compliance/retention-policies/${policyId}/versions`,
    actor: creatorActor,
  });
  const versions = (versionsRes.body as any).data as Array<{ version: number; snapshot: { retentionDurationDays: number } }>;
  assert.equal(versions.length, 5);
  assert.equal(versions[0].snapshot.retentionDurationDays, 365);
  assert.equal(versions[1].snapshot.retentionDurationDays, 730);

  // TEST 12, 13, 14: Mandatory, Contractual, and Internal retention precedence
  const statObl = api.retentionService.registerRetentionObligation(creatorActor, {
    targetEntityType: 'TRANSACTION',
    targetEntityId: 'transaction_123',
    sourceModule: 'transactions',
    obligationType: 'STATUTORY',
    sourceReferenceType: 'RETENTION_POLICY',
    sourceReferenceId: policyId,
    retentionStartAt: '2026-01-01T00:00:00.000Z',
    retainUntil: '2027-01-01T00:00:00.000Z',
    reasonCode: 'STATUTORY_TAX_RETENTION',
  });
  const contractObl = api.retentionService.registerRetentionObligation(creatorActor, {
    targetEntityType: 'TRANSACTION',
    targetEntityId: 'transaction_123',
    sourceModule: 'transactions',
    obligationType: 'CONTRACTUAL',
    sourceReferenceType: 'RETENTION_POLICY',
    sourceReferenceId: policyId,
    retentionStartAt: '2026-01-01T00:00:00.000Z',
    retainUntil: '2028-01-01T00:00:00.000Z',
    reasonCode: 'CONTRACTUAL_ESCROW_COVENANT',
  });
  const internalObl = api.retentionService.registerRetentionObligation(creatorActor, {
    targetEntityType: 'TRANSACTION',
    targetEntityId: 'transaction_123',
    sourceModule: 'transactions',
    obligationType: 'INTERNAL',
    sourceReferenceType: 'RETENTION_POLICY',
    sourceReferenceId: policyId,
    retentionStartAt: '2026-01-01T00:00:00.000Z',
    retainUntil: '2029-01-01T00:00:00.000Z',
    reasonCode: 'INTERNAL_AUDIT_POLICY',
  });

  // At 2026-11-08: Statutory is active -> PRESERVE_MANDATORY_RETENTION
  const statEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2026-11-08T12:00:00.000Z',
    body: {
      target: { sourceModule: 'transactions', entityType: 'TRANSACTION', entityId: 'transaction_123' },
      requestType: 'DELETE',
    },
  });
  assert.equal((statEval.body as any).data.decision, 'PRESERVE_MANDATORY_RETENTION');
  assert.ok(statObl.id);

  // At 2027-06-01: Statutory expired, Contractual active -> PRESERVE_CONTRACTUAL_OBLIGATION
  const contractEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2027-06-01T12:00:00.000Z',
    body: {
      target: { sourceModule: 'transactions', entityType: 'TRANSACTION', entityId: 'transaction_123' },
      requestType: 'DELETE',
    },
  });
  assert.equal((contractEval.body as any).data.decision, 'PRESERVE_CONTRACTUAL_OBLIGATION');
  assert.ok(contractObl.id);

  // At 2028-06-01: Contractual expired, Internal active -> PRESERVE_INTERNAL_POLICY
  const internalEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2028-06-01T12:00:00.000Z',
    body: {
      target: { sourceModule: 'transactions', entityType: 'TRANSACTION', entityId: 'transaction_123' },
      requestType: 'DELETE',
    },
  });
  assert.equal((internalEval.body as any).data.decision, 'PRESERVE_INTERNAL_POLICY');
  assert.ok(internalObl.id);

  // TEST 16: Unavailable source module returns SOURCE_MODULE_UNAVAILABLE
  repo.dispositionProvider.unavailableModules.add('documents');
  const unavailEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:00:00.000Z',
    body: {
      target: { sourceModule: 'documents', entityType: 'DOCUMENT', entityId: 'document_456' },
      requestType: 'DELETE',
    },
  });
  assert.equal((unavailEval.body as any).data.decision, 'SOURCE_MODULE_UNAVAILABLE');
  repo.dispositionProvider.unavailableModules.delete('documents');

  // TEST 19: Partial privacy request fulfillment (Employee 64)
  // At 2028-06-01: transaction_123 is preserved under internal policy, while document_456 has no active obligations and is eligible
  const privacyDisposition = api.retentionService.evaluatePrivacyDisposition(approverActor, {
    privacyRequestId: 'priv_req_64_01',
    requestingUserReference: 'user_99',
    requestedDataCategories: ['CONTRACTUAL_RECORDS'],
    requestedEntityReferences: [
      { sourceModule: 'transactions', entityType: 'TRANSACTION', entityId: 'transaction_123' },
      { sourceModule: 'documents', entityType: 'DOCUMENT', entityId: 'document_456' },
    ],
    requestScope: 'SELECTED_RECORDS',
    requestTimestamp: '2028-06-01T12:00:00.000Z',
  });
  assert.equal(privacyDisposition.overallProcessingStatus, 'PARTIAL_FULFILLMENT_REQUIRED');
  assert.equal(privacyDisposition.eligibleRecords.length, 1);
  assert.equal(privacyDisposition.preservedRecords.length, 1);

  // TEST 17, 20, 21, 22, 25: Disposition creation, stale evaluation rejection, disposition approval, hold activated between approval and execution, idempotent execution, and unauthorized disposition
  const dispCreate = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/dispositions',
    actor: creatorActor,
    evaluationNowIso: '2029-06-01T12:00:00.000Z',
    body: {
      target: { sourceModule: 'documents', entityType: 'DOCUMENT', entityId: 'document_456' },
      requestedAction: 'DELETE',
      requestReason: 'Retention period completed',
      requestSource: 'RETENTION_EXPIRY',
      privacyRequestReference: null,
    },
  });
  const dispReqId = (dispCreate.body as any).data.request.id as string;
  assert.equal((dispCreate.body as any).data.request.status, 'PENDING_APPROVAL');

  // TEST 17: Stale evaluation rejected on approval (more than 5 minutes after evaluationNowIso)
  const staleApprove = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispReqId}/approve`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:15:00.000Z',
    body: { decision: 'APPROVED', reason: 'Too late' },
  });
  assert.equal(staleApprove.statusCode, 409);
  assert.equal((staleApprove.body as any).error.code, 'EVALUATION_STALE');

  // TEST 20: Valid disposition approval within freshness window
  const validApprove = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispReqId}/approve`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:02:00.000Z',
    body: { decision: 'APPROVED', reason: 'Retention and preservation checks passed.' },
  });
  assert.equal(validApprove.statusCode, 200);
  assert.equal((validApprove.body as any).data.request.status, 'APPROVED');

  // TEST 25: Unauthorized disposition execution rejected
  const unauthExec = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispReqId}/execute`,
    actor: unprivilegedActor,
    evaluationNowIso: '2029-06-01T12:03:00.000Z',
    body: { expectedVersion: 2, idempotencyKey: 'exec-unauth-1' },
  });
  assert.equal(unauthExec.statusCode, 403);

  // TEST 21: Activate a new hold on document_456 AFTER disposition approval but BEFORE execution -> execution is blocked!
  const lateHoldRes = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/legal-holds',
    actor: creatorActor,
    body: {
      title: 'Emergency Hold Before Execution',
      holdType: 'LITIGATION',
      legalBasis: {
        basisType: 'APPROVED_CASE_REFERENCE',
        referenceId: 'case_123',
        description: 'Urgent preservation before execution',
      },
      jurisdictionIds: ['jurisdiction_1'],
      caseReferences: ['case_123'],
      obligationReferences: [],
      priority: 'URGENT',
      effectiveAt: '2029-06-01T12:00:00.000Z',
      reviewIntervalDays: 30,
      scope: {
        scopeType: 'EXPLICIT_RECORDS',
        entityTypes: ['DOCUMENT'],
        entityIds: ['document_456'],
        dataCategories: ['CONTRACTUAL_RECORDS'],
        sourceModuleIds: ['documents'],
        includeFutureMatchingRecords: false,
        maximumExpansionCount: 10,
        maximumRelationshipDepth: 0,
      },
    },
  });
  const lateHold = (lateHoldRes.body as any).data;
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${lateHold.id}/approve`,
    actor: approverActor,
    body: {
      decision: 'APPROVED',
      reason: 'Approved emergency hold',
      approvedScopeFingerprint: lateHold.scopeFingerprint,
    },
  });
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/legal-holds/${lateHold.id}/activate`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:02:30.000Z',
    body: { expectedVersion: 2, reason: 'Activated before disposition execute' },
  });

  const blockedExecRes = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispReqId}/execute`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:03:00.000Z',
    body: { expectedVersion: 2, idempotencyKey: 'exec-blocked-by-late-hold' },
  });
  assert.equal(blockedExecRes.statusCode, 409);
  assert.equal((blockedExecRes.body as any).error.code, 'ACTIVE_LEGAL_HOLD');

  // TEST 22: Idempotent disposition execution on eligible record (transaction_123 after all obligations expired at 2029-06-01)
  const dispTxCreate = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/dispositions',
    actor: creatorActor,
    evaluationNowIso: '2029-06-01T12:00:00.000Z',
    body: {
      target: { sourceModule: 'transactions', entityType: 'TRANSACTION', entityId: 'transaction_123' },
      requestedAction: 'DELETE',
      requestReason: 'All retention obligations expired',
      requestSource: 'RETENTION_EXPIRY',
      privacyRequestReference: null,
    },
  });
  const dispTxId = (dispTxCreate.body as any).data.request.id as string;
  await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispTxId}/approve`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:01:00.000Z',
    body: { decision: 'APPROVED', reason: 'Approved' },
  });

  const exec1 = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispTxId}/execute`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:02:00.000Z',
    body: { expectedVersion: 2, idempotencyKey: 'disposition-tx-123-exec-1' },
  });
  assert.equal(exec1.statusCode, 200);
  assert.equal((exec1.body as any).data.request.status, 'COMPLETED');
  assert.equal((exec1.body as any).data.idempotentReplay, false);

  const exec2 = await api.dispatch({
    method: 'POST',
    path: `/api/admin/compliance/dispositions/${dispTxId}/execute`,
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:02:30.000Z',
    body: { expectedVersion: 2, idempotencyKey: 'disposition-tx-123-exec-1' },
  });
  assert.equal(exec2.statusCode, 200);
  assert.equal((exec2.body as any).data.idempotentReplay, true);

  // TEST 26: Cross-organization access prevention (403 FORBIDDEN)
  const crossOrgGet = await api.dispatch({
    method: 'GET',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}`,
    actor: otherOrgActor,
  });
  assert.equal(crossOrgGet.statusCode, 403);

  // TEST 27, 29, 30: Immutable approval history, conflicting preservation instructions, and audit record creation for every consequential transition
  const historyRes = await api.dispatch({
    method: 'GET',
    path: `/api/admin/compliance/legal-holds/${createdHold.id}/history`,
    actor: approverActor,
  });
  assert.equal(historyRes.statusCode, 200);
  assert.equal((historyRes.body as any).data.approvals.length, 1);
  assert.throws(() => {
    ((historyRes.body as any).data.approvals[0] as any).decision = 'REJECTED';
  });

  api.retentionService.registerConflictingInstruction(creatorActor, {
    sourceModule: 'documents',
    entityType: 'DOCUMENT',
    entityId: 'document_456',
    jurisdictionId: 'jurisdiction_1',
    conflictingReferences: [lateHold.holdNumber, 'COURT-PURGE-ORDER-77'],
  });
  const conflictEval = await api.dispatch({
    method: 'POST',
    path: '/api/admin/compliance/retention/evaluate',
    actor: approverActor,
    evaluationNowIso: '2029-06-01T12:04:00.000Z',
    body: {
      target: { sourceModule: 'documents', entityType: 'DOCUMENT', entityId: 'document_456' },
      requestType: 'DELETE',
    },
  });
  assert.equal((conflictEval.body as any).data.decision, 'LEGAL_REVIEW_REQUIRED');
  assert.equal((conflictEval.body as any).data.decisionReasonCode, 'CONFLICTING_PRESERVATION_INSTRUCTIONS');

  assert.ok(repo.auditRecords.length >= 20, 'Audit records must be created for every consequential transition');

  console.log('PASSED: canonicalHoldDataModelAndApi.test.ts (All 30 required data model & REST API contract tests)');
}

runAll30CanonicalTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
