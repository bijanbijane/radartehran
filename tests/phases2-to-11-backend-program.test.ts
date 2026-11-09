import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { registerPlatformFoundationAdminRoutes } from '../server/modules/platform-foundation/index.ts';
import {
  EnterpriseTenancyStore,
  resolveTrustedTenantContext,
  evaluateTenantAwareAuthorizationPolicy,
  TenantScopedRepository,
  buildTenantSafeScopePrefix,
  verifyBackgroundOperationTenantScope,
  classifyLegacyEntityTenantScope,
  createControlledCrossTenantGrant,
  CROSS_MODULE_ENTITY_ISOLATION_MATRIX,
} from '../server/modules/enterprise-tenancy/index.ts';
import {
  DistributedProcessingStore,
  DurableWorkflowAndSchedulerEngine,
} from '../server/modules/distributed-processing/index.ts';
import { CachingAndPerformanceService } from '../server/modules/caching-performance/index.ts';
import { InfrastructureSecurityService } from '../server/modules/infrastructure-security/index.ts';
import { BackupAndRecoveryService } from '../server/modules/backup-recovery/index.ts';
import { AnalyticalDataPlatformService } from '../server/modules/analytical-platform/index.ts';
import {
  PlatformResilienceService,
  crossModuleIntegrationCoordinator,
} from '../server/modules/platform-resilience/index.ts';

test('Phases 2 & 3 (Employee 74): Enterprise Multi-Tenancy, Provisioning, Hierarchy Cycles, Invitations, and Isolation', () => {
  const store = new EnterpriseTenancyStore();
  const adminActor = { actorId: 'admin_1', isPlatformAdmin: true, correlationId: 'corr_test_74' };

  // 1. Idempotent provisioning & failure recovery
  const failedProv = store.provisionTenant(
    {
      idempotencyKey: 'idem_prov_tehran_agency_1',
      tenantCode: 'tehran-prime-realty',
      displayName: 'Tehran Prime Realty Group',
      tenantType: 'BROKERAGE',
      ownerUserId: 'user_owner_1',
      primaryOrganizationCode: 'hq-vanak',
      primaryOrganizationDisplayName: 'Vanak Headquarters',
      simulateFailureAtStep: 'ORGANIZATION_CREATION',
    },
    adminActor
  );
  assert.equal(failedProv.status, 'FAILED');

  const recoveredProv = store.provisionTenant(
    {
      idempotencyKey: 'idem_prov_tehran_agency_1',
      tenantCode: 'tehran-prime-realty',
      displayName: 'Tehran Prime Realty Group',
      tenantType: 'BROKERAGE',
      ownerUserId: 'user_owner_1',
      primaryOrganizationCode: 'hq-vanak',
      primaryOrganizationDisplayName: 'Vanak Headquarters',
      simulateFailureAtStep: null,
    },
    adminActor
  );
  assert.equal(recoveredProv.status, 'READY');
  assert.ok(recoveredProv.tenantId);
  assert.ok(recoveredProv.primaryOrganizationId);

  const replayProv = store.provisionTenant(
    {
      idempotencyKey: 'idem_prov_tehran_agency_1',
      tenantCode: 'tehran-prime-realty',
      displayName: 'Tehran Prime Realty Group',
      tenantType: 'BROKERAGE',
      ownerUserId: 'user_owner_1',
      primaryOrganizationCode: 'hq-vanak',
      primaryOrganizationDisplayName: 'Vanak Headquarters',
    },
    adminActor
  );
  assert.equal(replayProv.provisioningId, recoveredProv.provisioningId);
  assert.equal(replayProv.tenantId, recoveredProv.tenantId);

  const tenantId = recoveredProv.tenantId!;
  const hqOrgId = recoveredProv.primaryOrganizationId!;

  // 2. Organization hierarchy cycle prevention
  const branchOrg = store.createOrganization(
    tenantId,
    {
      organizationCode: 'branch-niavaran',
      displayName: 'Niavaran Branch',
      organizationType: 'BRANCH_OFFICE',
      parentOrganizationId: hqOrgId,
    },
    adminActor
  );
  assert.throws(
    () =>
      store.updateOrganization(
        tenantId,
        hqOrgId,
        { expectedRecordVersion: 1, parentOrganizationId: branchOrg.organizationId },
        adminActor
      ),
    (err: { code?: string }) => err.code === 'INVALID_ORGANIZATION_HIERARCHY_CYCLE'
  );

  // 3. Single-use hashed invitation token verification & replay prevention
  const { invitation, oneTimeVerificationToken } = store.createInvitation(
    tenantId,
    {
      invitedEmail: 'agent1@tehranprime.ir',
      organizationId: branchOrg.organizationId,
      roleReferences: ['listing_agent'],
    },
    adminActor
  );
  assert.notEqual(invitation.tokenHash, oneTimeVerificationToken);

  // Email match alone with wrong token must fail
  assert.throws(
    () =>
      store.acceptInvitation(tenantId, invitation.invitationId, 'wrong_token_value', {
        userId: 'user_agent_1',
        verifiedEmail: 'agent1@tehranprime.ir',
        correlationId: 'corr_inv_1',
      }),
    (err: { code?: string }) => err.code === 'INVALID_INVITATION_TOKEN'
  );

  // Valid token + verified email succeeds
  const accepted = store.acceptInvitation(
    tenantId,
    invitation.invitationId,
    oneTimeVerificationToken,
    {
      userId: 'user_agent_1',
      verifiedEmail: 'agent1@tehranprime.ir',
      correlationId: 'corr_inv_2',
    }
  );
  assert.equal(accepted.invitation.invitationStatus, 'ACCEPTED');
  assert.equal(accepted.membership.userId, 'user_agent_1');

  // Replaying the same invitation token must be rejected
  assert.throws(
    () =>
      store.acceptInvitation(
        tenantId,
        invitation.invitationId,
        oneTimeVerificationToken,
        {
          userId: 'user_agent_1',
          verifiedEmail: 'agent1@tehranprime.ir',
          correlationId: 'corr_inv_3',
        }
      ),
    (err: { code?: string }) => err.code === 'INVITATION_TOKEN_REPLAYED'
  );

  // 4. Trusted Tenant Context Resolution & Scoped Repository Isolation
  const resolvedAgentCtx = resolveTrustedTenantContext(store, {
    authenticatedActorId: 'user_agent_1',
    requestedTenantId: tenantId,
    requestedOrganizationId: branchOrg.organizationId,
  });
  assert.equal(resolvedAgentCtx.tenantId, tenantId);
  assert.equal(resolvedAgentCtx.organizationId, branchOrg.organizationId);

  const repo = new TenantScopedRepository<{
    id: string;
    tenantId: string;
    organizationId?: string | null;
    recordVersion: number;
    createdAt: string;
    updatedAt: string;
    title: string;
  }>('BROKERAGE_REPRESENTATION_AGREEMENT');

  const now = new Date().toISOString();
  repo.put(resolvedAgentCtx, {
    id: 'agr_101',
    tenantId,
    organizationId: branchOrg.organizationId,
    recordVersion: 1,
    createdAt: now,
    updatedAt: now,
    title: 'Exclusive Representation - Niavaran Penthouse',
  });
  assert.equal(repo.getById(resolvedAgentCtx, 'agr_101').title, 'Exclusive Representation - Niavaran Penthouse');

  // Cross-tenant write must be rejected
  assert.throws(
    () =>
      repo.put(resolvedAgentCtx, {
        id: 'agr_cross_tenant',
        tenantId: 'ten_other_unauthorized',
        organizationId: branchOrg.organizationId,
        recordVersion: 1,
        createdAt: now,
        updatedAt: now,
        title: 'Spoofed Tenant Record',
      }),
    (err: { code?: string }) => err.code === 'TENANT_ACCESS_DENIED'
  );

  // 5. Controlled Cross-Tenant Access Grant & Legacy Classification
  const grant = createControlledCrossTenantGrant({
    actorId: 'compliance_auditor_1',
    explicitPermission: 'compliance:cross_tenant:investigation',
    definedPurpose: 'Statutory AML & Escrow audit investigation #2026-88',
    targetTenantId: tenantId,
    allowedEntityTypes: ['FINANCIAL_LEDGER_ENTRY'],
    allowedOperations: ['READ'],
    approvalReference: 'APR_LEGAL_72_991',
  });
  const evalResult = evaluateTenantAwareAuthorizationPolicy(
    {
      actorId: 'compliance_auditor_1',
      actorPlatformRole: 'verified_user',
      action: 'ledger.read',
      resourceType: 'FINANCIAL_LEDGER_ENTRY',
      resourceId: 'led_001',
      resourceClassification: 'TENANT_OWNED',
      targetTenantId: tenantId,
      crossTenantGrant: grant,
    },
    store
  );
  assert.equal(evalResult.allowed, true);
  assert.equal(evalResult.scopeUsed, 'CONTROLLED_CROSS_TENANT_SCOPE');

  const legacyAmbiguous = classifyLegacyEntityTenantScope(store, {
    recordId: 'leg_999',
    entityType: 'PROPERTY_LISTING',
    explicitTenantId: 'non_existent_tenant_id',
  });
  assert.equal(legacyAmbiguous.classificationState, 'UNASSIGNED_LEGACY_QUARANTINE');
  assert.equal(CROSS_MODULE_ENTITY_ISOLATION_MATRIX.length, 21);

  // 6. Tenant closure blocked when active legal hold or unsettled financial obligation exists
  assert.throws(
    () =>
      store.transitionTenantLifecycle(tenantId, 'BEGIN_CLOSURE', adminActor, {
        hasActiveLegalHold: true,
      }),
    (err: { code?: string }) => err.code === 'LEGAL_HOLD_ACTIVE'
  );
});

test('Phases 4 & 5 (Employee 75): Distributed Jobs, Exclusive Leases, Transactional Outbox, Durable Workflows, Saga Compensation, and Scheduler', () => {
  const tenancyStore = new EnterpriseTenancyStore();
  const adminActor = { actorId: 'admin_1', isPlatformAdmin: true, correlationId: 'corr_75' };
  const prov = tenancyStore.provisionTenant(
    {
      idempotencyKey: 'idem_prov_75',
      tenantCode: 'radar-processing-tenant',
      displayName: 'Radar Processing Tenant',
      tenantType: 'BROKERAGE',
      ownerUserId: 'owner_75',
      primaryOrganizationCode: 'org-75',
      primaryOrganizationDisplayName: 'Org 75',
    },
    adminActor
  );
  const tenantId = prov.tenantId!;

  const procStore = new DistributedProcessingStore({ tenancyStore });
  const wfEngine = new DurableWorkflowAndSchedulerEngine(procStore);

  // 1. Job submission idempotency & exclusive worker lease
  const job1 = procStore.submitJob({
    jobType: 'listing.publication.index_sync',
    idempotencyKey: 'job_idem_val_001',
    inputReference: 'inp://district-1',
    tenantId,
    authorizedSystemService: true,
    correlationId: 'corr_job_1',
  });
  const job1Duplicate = procStore.submitJob({
    jobType: 'listing.publication.index_sync',
    idempotencyKey: 'job_idem_val_001',
    inputReference: 'inp://district-1',
    tenantId,
    authorizedSystemService: true,
    correlationId: 'corr_job_1',
  });
  assert.equal(job1.jobId, job1Duplicate.jobId);

  const workerA = procStore.registerWorker({
    workerId: 'wrk_alpha',
    workerType: 'general_compute',
    capabilities: ['listing.publication.index_sync'],
  });
  const workerB = procStore.registerWorker({
    workerId: 'wrk_beta',
    workerType: 'general_compute',
    capabilities: ['listing.publication.index_sync'],
  });

  const claimedByA = procStore.claimJobLease(workerA.workerId, job1.jobId, 1_000_000)!;
  assert.equal(claimedByA.status, 'RUNNING');
  assert.equal(claimedByA.leaseOwner, workerA.workerId);

  // Worker B cannot claim active lease held by Worker A
  assert.throws(
    () => procStore.claimJobLease(workerB.workerId, job1.jobId, 1_001_000),
    (err: { code?: string }) => err.code === 'JOB_LEASE_ALREADY_HELD'
  );

  // Simulate lease expiration -> Worker B recovers expired lease -> Stale Worker A write is rejected!
  const recoveredByB = procStore.claimJobLease(workerB.workerId, job1.jobId, 2_000_000)!;
  assert.equal(recoveredByB.leaseOwner, workerB.workerId);

  assert.throws(
    () =>
      procStore.completeJobWithLease(
        workerA.workerId,
        job1.jobId,
        claimedByA.recordVersion,
        'res://stale-worker-a',
        2_001_000
      ),
    (err: { code?: string }) => err.code === 'JOB_LEASE_EXPIRED'
  );

  const completedByB = procStore.completeJobWithLease(
    workerB.workerId,
    job1.jobId,
    recoveredByB.recordVersion,
    'res://fresh-worker-b',
    2_001_000
  );
  assert.equal(completedByB.status, 'COMPLETED');

  // 2. Transactional Outbox & Idempotent Consumer Deduplication
  const outboxRec = procStore.appendTransactionalOutbox({
    eventType: 'PROPERTY_PUBLISHED',
    ownerModule: 'EMP_58',
    aggregateType: 'PROPERTY',
    aggregateId: 'prop_777',
    tenantId,
    correlationId: 'corr_out_1',
    payloadReference: 'payload://prop_777',
  });
  const publishedOutbox = procStore.publishOutboxRecord(outboxRec.outboxId);
  assert.equal(publishedOutbox.publicationStatus, 'PUBLISHED');

  let sideEffectCount = 0;
  const consume1 = procStore.consumeOutboxEventIdempotently(outboxRec.eventId, 'search_indexer', () => {
    sideEffectCount += 1;
  });
  const consume2 = procStore.consumeOutboxEventIdempotently(outboxRec.eventId, 'search_indexer', () => {
    sideEffectCount += 1;
  });
  assert.equal(consume1.executed, true);
  assert.equal(consume2.duplicateIgnored, true);
  assert.equal(sideEffectCount, 1);

  // 3. Durable Workflow Checkpoints & Saga Reverse-Order Compensation
  const wf = wfEngine.startWorkflow({
    workflowType: 'tenant.provisioning.workflow',
    tenantId,
    actorId: 'admin_1',
    correlationId: 'corr_wf_1',
    inputReference: 'wf_inp://tenant_onboarding',
  });
  const step1Done = wfEngine.executeNextWorkflowStep(wf.workflowId);
  assert.equal(step1Done.completedSteps.length, 1);

  // Fail step 2 past maxRetries to trigger reverse-order Saga compensation
  wfEngine.executeNextWorkflowStep(wf.workflowId, { simulateFailureOnStep: step1Done.currentStep! });
  wfEngine.executeNextWorkflowStep(wf.workflowId, { simulateFailureOnStep: step1Done.currentStep! });
  const compensated = wfEngine.executeNextWorkflowStep(wf.workflowId, {
    simulateFailureOnStep: step1Done.currentStep!,
  });
  assert.equal(compensated.status, 'FAILED');
  assert.equal(compensated.compensationState, 'COMPENSATED');
  assert.ok(compensated.compensatedSteps.length >= 1);

  // 4. Provider-Independent Scheduler with Missed-Window Safety (No Unbounded Backlog)
  const pastIso = new Date(Date.now() - 5 * 3_600_000).toISOString(); // 5 hours ago
  const schedule = wfEngine.createSchedule({
    ownerModule: 'EMP_77',
    operationReference: 'backup.hourly_snapshot',
    jobType: 'listing.publication.index_sync',
    tenantId,
    timezone: 'Asia/Tehran',
    cadenceType: 'RECURRING',
    intervalMinutes: 60,
    missedWindowPolicy: 'SINGLE_CATCHUP',
    nextExecutionAt: pastIso,
  });

  const triggerResult = wfEngine.triggerDueSchedule(schedule.scheduleId, Date.now());
  assert.ok(triggerResult.dispatchedJob);
  assert.ok(triggerResult.missedWindowsCount >= 4);
  assert.ok(Date.parse(triggerResult.schedule.nextExecutionAt!) > Date.now());
});

test('Phase 6 (Employee 76): Distributed Caching, Deterministic Tenant-Safe Keys, Stampede Coalescing, and Resource Budgets', async () => {
  const cacheSvc = new CachingAndPerformanceService();

  // Tenant-scoped namespace without tenantId must fail
  assert.throws(
    () =>
      cacheSvc.buildDeterministicCacheKey({
        namespaceCode: 'TENANT_PRIVATE',
        entityType: 'CONTRACT',
        entityId: 'c_1',
      }),
    /TENANT_ISOLATION_VIOLATION/
  );

  // Secrets/credentials in cache payload must be rejected
  assert.throws(
    () =>
      cacheSvc.set(
        {
          namespaceCode: 'PUBLIC_REFERENCE',
          entityType: 'CONFIG',
          entityId: 'cfg_1',
        },
        { apiKey: 'Bearer secret_token_123' }
      ),
    /SECURITY_POLICY_VIOLATION/
  );

  // Single-flight coalescing under concurrent misses
  let originLoadCalls = 0;
  const keyCtx = {
    namespaceCode: 'VALUATION_RESULTS' as const,
    tenantId: 'tenant_alpha',
    entityType: 'PROPERTY',
    entityId: 'prop_coalesce_1',
  };

  const [r1, r2, r3] = await Promise.all([
    cacheSvc.getOrLoadSingleFlight(keyCtx, async () => {
      originLoadCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { estimatedPriceMillion: 18500 };
    }),
    cacheSvc.getOrLoadSingleFlight(keyCtx, async () => {
      originLoadCalls += 1;
      return { estimatedPriceMillion: 18500 };
    }),
    cacheSvc.getOrLoadSingleFlight(keyCtx, async () => {
      originLoadCalls += 1;
      return { estimatedPriceMillion: 18500 };
    }),
  ]);
  assert.equal(originLoadCalls, 1);
  assert.equal(r1.value.estimatedPriceMillion, 18500);
  assert.equal(r2.value.estimatedPriceMillion, 18500);
  assert.equal(r3.value.estimatedPriceMillion, 18500);

  // Domain invalidation
  const removed = cacheSvc.invalidateByTenant('tenant_alpha');
  assert.equal(removed, 1);
});

test('Phase 7 (Employee 78): Infrastructure Security, Metadata-Only Secret Rotation, Rollback, and SSRF Egress Protection', () => {
  const secSvc = new InfrastructureSecurityService();

  // Reject raw secret values in metadata registry
  assert.throws(
    () =>
      secSvc.registerSecretMetadata({
        secretReferenceId: 'sec_bad_raw',
        rawSecret: 'sk-live-123456',
      }),
    /SECURITY_POLICY_VIOLATION/
  );

  // Controlled 12-step secret rotation & verification failure rollback
  const initialSecret = secSvc.listSecrets()[0];
  const rolledBack = secSvc.rotateSecretControlled(initialSecret.secretReferenceId, 'sec_admin_1', {
    simulateVerificationFailure: true,
  });
  assert.equal(rolledBack.status, 'ROLLED_BACK');
  assert.equal(rolledBack.newFingerprint, initialSecret.versionFingerprint);

  const rotatedOk = secSvc.rotateSecretControlled(initialSecret.secretReferenceId, 'sec_admin_1');
  assert.equal(rotatedOk.status, 'COMPLETED');
  assert.notEqual(rotatedOk.newFingerprint, initialSecret.versionFingerprint);

  // SSRF outbound URL validation
  assert.throws(
    () => secSvc.validateOutboundEgressUrl('http://169.254.169.254/latest/meta-data/'),
    /SECURITY_POLICY_VIOLATION/
  );
  assert.throws(
    () => secSvc.validateOutboundEgressUrl('https://127.0.0.1:8080/internal'),
    /SECURITY_POLICY_VIOLATION/
  );
  const validEgress = secSvc.validateOutboundEgressUrl('https://api.open-meteo.com/v1/forecast');
  assert.equal(validEgress.allowed, true);
});

test('Phase 8 (Employee 77): Verified Backups, Checksum Tamper Detection, 5-Tier Legal Hold Precedence Gate, and Restore Target Isolation', () => {
  const recSvc = new BackupAndRecoveryService();

  // 1. Tampered backup manifest checksum must fail verification and block restore
  const tamperedBackup = recSvc.executeVerifiedBackup({
    resourceId: 'res_firestore_ledger_and_settlements',
    tamperChecksumInTest: true,
  });
  assert.equal(tamperedBackup.status, 'VERIFICATION_FAILED');
  assert.throws(
    () =>
      recSvc.executeControlledRestore({
        backupId: tamperedBackup.backupId,
        targetEnvironment: 'ISOLATED_TEST',
        targetNamespace: 'ns_test_1',
        requestedBy: 'admin_1',
      }),
    /PRECONDITION_FAILED/
  );

  // 2. Verified backup + Employee 72 5-tier Legal Hold Precedence Gate
  const hold = recSvc.registerLegalHold({
    scopeType: 'TENANT',
    scopeTargetId: 'tenant_legal_hold_1',
    authorityReference: 'JUDICIAL_ORDER_72_2026',
    reason: 'Active commercial contract dispute preservation',
    createdBy: 'compliance_officer_1',
  });

  const validBackup = recSvc.executeVerifiedBackup({
    resourceId: 'res_firestore_ledger_and_settlements',
    tenantScope: 'tenant_legal_hold_1',
    activeLegalHoldIds: [hold.holdId],
    internalRetentionDays: -1, // Even if internal retention expired, Tier-1 Legal Hold must block expiration!
  });
  assert.equal(validBackup.status, 'VERIFIED_COMPLETE');

  assert.throws(() => recSvc.expireBackup(validBackup.backupId), /LEGAL_HOLD_ACTIVE/);

  // 3. Restore to PRODUCTION must be strictly blocked
  assert.throws(
    () =>
      recSvc.executeControlledRestore({
        backupId: validBackup.backupId,
        targetEnvironment: 'PRODUCTION',
        targetNamespace: 'prod_main',
        requestedBy: 'admin_1',
      }),
    /SECURITY_POLICY_VIOLATION/
  );

  // 4. Restore into ISOLATED_TEST succeeds and DR Exercise records measured RPO/RTO
  const drDrill = recSvc.recordDrExercise({
    scenarioName: 'Quarterly Financial Ledger Isolated Restore Drill',
    resourceId: 'res_firestore_ledger_and_settlements',
    executedBy: 'sre_admin_1',
  });
  assert.equal(drDrill.objectivesMet, true);
  assert.equal(drDrill.targetEnvironment, 'ISOLATED_TEST');
});

test('Phase 9 (Employee 79): 4-Layer Analytical Warehouse, Schema Evolution, Quarantine, and K-Anonymity Cohort Suppression', () => {
  const anaSvc = new AnalyticalDataPlatformService();

  // Breaking schema change without incrementing schemaVersion must be rejected
  assert.throws(
    () =>
      anaSvc.validateSchemaEvolution(
        'DS_DEMAND_COHORT_RESEARCH_PUBLISHED',
        ['city', 'districtId'], // missing 'budgetBand' and 'cohortSize'
        1
      ),
    /CONFLICT/
  );

  // Ingest batch with valid rows, duplicate rows, missing-field rows, and forbidden PII attributes
  const batchResult = anaSvc.ingestAnalyticalBatch({
    datasetCode: 'DS_DEMAND_COHORT_RESEARCH_PUBLISHED',
    mode: 'FULL',
    sourceEntityId: 'search_demand_aggregator',
    records: [
      { city: 'tehran', districtId: 1, budgetBand: '150M-250M', cohortSize: 12 },
      { city: 'tehran', districtId: 1, budgetBand: '150M-250M', cohortSize: 12 }, // duplicate
      { city: 'tehran', districtId: 2, budgetBand: '100M-150M', cohortSize: 3 }, // small cohort (< 5)
      { city: 'tehran', districtId: 3, budgetBand: '', cohortSize: 9 }, // missing required field -> quarantined
      { city: 'tehran', districtId: 4, budgetBand: '80M-120M', cohortSize: 10, password: 'secret' }, // forbidden attribute -> quarantined
    ],
  });

  assert.equal(batchResult.acceptedCount, 2);
  assert.equal(batchResult.duplicateRejectedCount, 1);
  assert.equal(batchResult.quarantinedCount, 2);

  // Querying enforces k-anonymity (suppresses cohortSize=3 < 5)
  const queryRes = anaSvc.queryDatasetWithPrivacyAndTenantControls({
    datasetCode: 'DS_DEMAND_COHORT_RESEARCH_PUBLISHED',
  });
  assert.equal(queryRes.rows.length, 1);
  assert.equal(queryRes.suppressedSmallCohortCount, 1);
});

test('Phase 10 & 11 (Employee 80 & Cross-Module Integration): Reconciliation Boundaries, Circuit Breakers, Decimal-Safe Ledger, Hedonic Valuation, and Admin APIs', async () => {
  const resSvc = new PlatformResilienceService();

  // 1. Financial discrepancy must NEVER be auto-repaired
  const finDisc = resSvc.registerDiscrepancy({
    category: 'TRANSACTION_TO_LEDGER',
    sourceModule: 'EMP_53_TRANSACTION_NEGOTIATION',
    targetModule: 'EMP_54_FINANCIAL_LEDGER_SETTLEMENT',
    entityId: 'tx_9901',
    severity: 'CRITICAL',
    description: 'Escrow settlement mismatch of 50,000,000 IRT',
    involvesFinancialMismatch: true,
    involvesOwnershipConflict: false,
    involvesLegalHoldConflict: false,
    involvesTenantConflict: false,
    involvesSuspectedFraud: false,
    deterministicRepairSupported: false,
  });
  assert.equal(finDisc.state, 'MANUAL_APPROVAL_REQUIRED');
  assert.throws(() => resSvc.attemptAutomaticReconciliationRepair(finDisc.discrepancyId), /SECURITY_POLICY_VIOLATION/);

  // Safe deterministic search-index projection discrepancy CAN be auto-repaired
  const idxDisc = resSvc.registerDiscrepancy({
    category: 'PROPERTY_TO_SEARCH_INDEX',
    sourceModule: 'EMP_58_PROPERTY_DOMAIN_CORE',
    targetModule: 'EMP_69_SEARCH_DISCOVERY_RECOMMENDATION',
    entityId: 'prop_8801',
    severity: 'LOW',
    description: 'Stale search index projection version',
    involvesFinancialMismatch: false,
    involvesOwnershipConflict: false,
    involvesLegalHoldConflict: false,
    involvesTenantConflict: false,
    involvesSuspectedFraud: false,
    deterministicRepairSupported: true,
  });
  const repaired = resSvc.attemptAutomaticReconciliationRepair(idxDisc.discrepancyId);
  assert.equal(repaired.state, 'AUTO_REPAIRED');

  // 2. Cross-Module Decimal-Safe Financial Ledger & Immutable Reversal (Employee 54 & 67)
  const webhookResult = crossModuleIntegrationCoordinator.processVerifiedPaymentWebhook({
    webhookEventId: 'wh_evt_2026_001',
    tenantId: 'tenant_fin_1',
    transactionRefId: 'tx_escrow_001',
    amountToman: 250_000_000,
    signatureHeader: 'hmac-sha256=9f86d081884c7d659a2feaa0c55ad015',
    expectedSecretFingerprint: 'fp_sha256_v1_8f92a1c4',
    actorId: 'payment_gateway_service',
  });
  assert.equal(webhookResult.deduplicated, false);
  assert.equal(webhookResult.ledgerEntry.amountRials, 2_500_000_000);

  const duplicateWebhook = crossModuleIntegrationCoordinator.processVerifiedPaymentWebhook({
    webhookEventId: 'wh_evt_2026_001',
    tenantId: 'tenant_fin_1',
    transactionRefId: 'tx_escrow_001',
    amountToman: 250_000_000,
    signatureHeader: 'hmac-sha256=9f86d081884c7d659a2feaa0c55ad015',
    expectedSecretFingerprint: 'fp_sha256_v1_8f92a1c4',
    actorId: 'payment_gateway_service',
  });
  assert.equal(duplicateWebhook.deduplicated, true);
  assert.equal(duplicateWebhook.ledgerEntry.entryId, webhookResult.ledgerEntry.entryId);

  const reversal = crossModuleIntegrationCoordinator.reverseLedgerEntry({
    originalEntryId: webhookResult.ledgerEntry.entryId,
    tenantId: 'tenant_fin_1',
    reason: 'Cancelled escrow agreement refund',
    actorId: 'finance_admin_1',
    idempotencyKey: 'rev_wh_evt_2026_001',
  });
  assert.equal(reversal.entryType, 'REVERSAL_ENTRY');
  assert.equal(reversal.amountRials, -2_500_000_000);

  // 3. HTTP Administrative Endpoints End-to-End Verification
  const app = express();
  app.use(express.json());
  registerPlatformFoundationAdminRoutes(app);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Unauthenticated call must fail with 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/cache/health`);
    assert.equal(unauthRes.status, 401);

    // Authenticated admin call to Cache Health, Security Secrets, Recovery Resources, Analytics Datasets, and Resilience Readiness
    const adminHeaders = {
      'x-admin-token': 'test-verified-admin',
      'x-actor-id': 'admin_e2e_tester',
    };

    const [cacheRes, secRes, recRes, anaRes, rdyRes] = await Promise.all([
      fetch(`${baseUrl}/api/admin/cache/health`, { headers: adminHeaders }),
      fetch(`${baseUrl}/api/admin/security/secrets`, { headers: adminHeaders }),
      fetch(`${baseUrl}/api/admin/recovery/resources`, { headers: adminHeaders }),
      fetch(`${baseUrl}/api/admin/analytics/datasets`, { headers: adminHeaders }),
      fetch(`${baseUrl}/api/admin/resilience/readiness`, { headers: adminHeaders }),
    ]);

    assert.equal(cacheRes.status, 200);
    assert.equal(secRes.status, 200);
    assert.equal(recRes.status, 200);
    assert.equal(anaRes.status, 200);
    assert.equal(rdyRes.status, 200);

    const rdyBody = await rdyRes.json();
    assert.equal(rdyBody.success, true);
    assert.equal(rdyBody.data.readiness, 'READY');
    assert.equal(rdyBody.data.externalCloudBindings.cloudflareQueues, 'NOT_CONFIGURED');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
