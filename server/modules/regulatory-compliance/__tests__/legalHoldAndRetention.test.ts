import assert from 'node:assert/strict';
import {
  ComplianceActorContext,
  ComplianceDomainError,
  createRegulatoryComplianceModule,
} from '../index';

const legalAdmin: ComplianceActorContext = {
  actorId: 'usr_legal_admin',
  actorRole: 'GENERAL_COUNSEL',
  organizationId: 'org_radar_1',
  tenantId: 'ten_radar_1',
  permissions: [
    'compliance.read',
    'compliance.jurisdiction.manage',
    'compliance.source.manage',
    'compliance.source.approve',
    'compliance.obligation.manage',
    'compliance.obligation.approve',
    'compliance.legal_hold.manage',
    'compliance.legal_hold.approve',
    'compliance.legal_hold.release',
    'compliance.retention.manage',
    'compliance.disposition.approve',
  ],
  correlationId: 'corr_lh_suite',
};

const unauthorizedUser: ComplianceActorContext = {
  actorId: 'usr_unauth_ops',
  actorRole: 'SUPPORT_AGENT',
  organizationId: 'org_radar_1',
  tenantId: 'ten_radar_1',
  permissions: ['compliance.read'],
};

async function runLegalHoldAndRetentionTests(): Promise<void> {
  const mod = createRegulatoryComplianceModule();

  // Setup jurisdiction, approved source, and active statutory retention obligation
  const jur = mod.jurisdictionsAndObligations.registerJurisdiction(legalAdmin, {
    code: 'IR-TEH',
    name: 'Tehran Jurisdiction',
    level: 'PROVINCE_OR_STATE',
    effectiveFrom: '2025-01-01T00:00:00.000Z',
  });
  const auth = mod.jurisdictionsAndObligations.registerRegulatoryAuthority(legalAdmin, {
    name: 'Judiciary & Tax Authority',
    jurisdictionId: jur.id,
    domainScope: ['LEGAL_HOLD', 'TAX_RETENTION'],
  });
  const src = mod.jurisdictionsAndObligations.registerRegulatorySource(legalAdmin, {
    title: 'Commercial & Real Estate Statutory Retention Act',
    issuingAuthorityId: auth.id,
    jurisdictionId: jur.id,
    sourceType: 'GOVERNMENT_LEGISLATION_PORTAL',
    externalReferenceCode: 'ACT-RET-10Y',
    officialCitation: 'Article 95 Tax & Real Estate Code',
    publicationDate: '2025-01-01T00:00:00.000Z',
    effectiveDate: '2025-01-01T00:00:00.000Z',
    versionLabel: 'v1',
    summaryNotes: 'Mandatory retention of transaction & ledger records',
  });
  mod.jurisdictionsAndObligations.approveRegulatorySource(legalAdmin, src.id, 'Approved statutory source');
  const statutoryObl = mod.jurisdictionsAndObligations.createObligation(legalAdmin, {
    code: 'OBL-STAT-RET-365',
    title: 'Statutory Transaction Document Preservation',
    description: 'Preserve transaction documents for 365 days after completion',
    category: 'RECORD_RETENTION_ARCHIVAL_AND_LEGAL_HOLD',
    regulatorySourceId: src.id,
    jurisdictionId: jur.id,
    applicabilityCriteria: {
      jurisdictionIds: [jur.id],
      businessActivities: [],
      platformModules: [],
      organizationTypes: [],
      transactionCategories: [],
      propertyCategories: [],
      customerRelationships: [],
      dataProcessingActivities: [],
    },
    mandatoryLevel: 'MANDATORY',
    severity: 'CRITICAL',
    responsibleOwnerRole: 'GENERAL_COUNSEL',
    reviewFrequencyDays: 180,
    evidenceRequirements: ['RETENTION_AUDIT_LOG'],
    effectiveStartDate: '2025-01-01T00:00:00.000Z',
  });
  mod.jurisdictionsAndObligations.transitionObligationStatus(legalAdmin, statutoryObl.id, 'ACTIVE', 'Activated');

  // Register platform records across Employee 63 (Documents), Employee 54 (Ledger), Employee 64 (Privacy)
  mod.legalHolds.registerPlatformRecord(legalAdmin, {
    recordId: 'tx_parent_100',
    tenantId: legalAdmin.tenantId,
    organizationId: legalAdmin.organizationId,
    entityType: 'TRANSACTION',
    sourceModule: 'real-estate-transactions',
    dataCategory: 'TRANSACTION_CORE',
    jurisdictionId: jur.id,
    subjectUserOrOrgId: 'user_seller_9',
    createdAt: '2026-01-01T00:00:00.000Z',
    retentionTriggerEvents: { TRANSACTION_COMPLETION: '2026-01-10T00:00:00.000Z' },
    sourceModuleSupportsDisposition: true,
    sourceModuleSupportsAnonymization: true,
  });

  mod.legalHolds.registerPlatformRecord(legalAdmin, {
    recordId: 'doc_child_101',
    tenantId: legalAdmin.tenantId,
    organizationId: legalAdmin.organizationId,
    entityType: 'DOCUMENT',
    sourceModule: 'employee-63-documents',
    dataCategory: 'CONTRACT_DOCUMENT',
    jurisdictionId: jur.id,
    parentEntityType: 'TRANSACTION',
    parentEntityId: 'tx_parent_100',
    subjectUserOrOrgId: 'user_seller_9',
    createdAt: '2026-01-02T00:00:00.000Z',
    retentionTriggerEvents: { TRANSACTION_COMPLETION: '2026-01-10T00:00:00.000Z' },
    sourceModuleSupportsDisposition: true,
    sourceModuleSupportsAnonymization: false,
  });

  // Unrelated record belonging to the same user (must NOT be placed on hold or blocked from deletion)
  mod.legalHolds.registerPlatformRecord(legalAdmin, {
    recordId: 'pref_unrelated_200',
    tenantId: legalAdmin.tenantId,
    organizationId: legalAdmin.organizationId,
    entityType: 'INDIVIDUAL_RECORD',
    sourceModule: 'employee-64-privacy',
    dataCategory: 'MARKETING_PREFERENCE',
    jurisdictionId: jur.id,
    subjectUserOrOrgId: 'user_seller_9',
    createdAt: '2025-01-01T00:00:00.000Z',
    retentionTriggerEvents: { RECORD_CREATION: '2025-01-01T00:00:00.000Z' },
    sourceModuleSupportsDisposition: true,
    sourceModuleSupportsAnonymization: true,
  });

  // TEST 1 & 3: Single active hold + Parent-child scope propagation (bounded, idempotent)
  const hold1 = mod.legalHolds.createLegalHold(legalAdmin, {
    title: 'Hold #1 — Transaction Dispute Investigation',
    description: 'Preserve transaction tx_parent_100 and child contract documents',
    legalOrPreservationBasis: 'Judicial Subpoena #SUB-2026-11',
    jurisdictionId: jur.id,
    issuingOrRequestingAuthority: 'Tehran Civil Court Branch 12',
    relatedCaseOrInvestigationId: 'case_emp66_01',
    relatedObligationIds: [statutoryObl.id],
    scope: {
      coveredEntityTypes: ['TRANSACTION'],
      coveredEntityIds: ['tx_parent_100'],
      coveredDocumentCategories: ['CONTRACT_DOCUMENT'],
      coveredDataCategories: ['TRANSACTION_CORE', 'CONTRACT_DOCUMENT'],
      coveredSystemsAndSourceModules: ['real-estate-transactions', 'employee-63-documents'],
      propagationRules: [
        {
          ruleId: 'rule_tx_to_docs',
          ruleVersion: 1,
          parentEntityType: 'TRANSACTION',
          childEntityTypes: ['DOCUMENT', 'FINANCIAL_RECORD'],
          allowedChildSourceModules: ['employee-63-documents', 'employee-54-financial-ledger'],
          allowedChildDataCategories: ['CONTRACT_DOCUMENT', 'LEDGER_SETTLEMENT'],
          includeNewlyCreatedRelatedRecords: true,
          maxPropagationDepth: 1,
          explicitUserWideHoldAuthorized: false,
        },
      ],
    },
    effectiveTimestamp: '2026-02-01T00:00:00.000Z',
    responsibleLegalOrComplianceOwnerId: legalAdmin.actorId,
    reviewFrequencyDays: 60,
    releaseConditions: 'Written court order releasing subpoena',
    submitForApproval: true,
  });

  // TEST 15: Unauthorized hold activation blocked
  assert.throws(
    () =>
      mod.legalHolds.approveAndActivateLegalHold(unauthorizedUser, hold1.id, {
        authority: 'None',
        rationale: 'Attempt',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNAUTHORIZED_COMPLIANCE_OPERATION',
  );

  const activation1 = mod.legalHolds.approveAndActivateLegalHold(legalAdmin, hold1.id, {
    authority: 'General Counsel',
    rationale: 'Verified subpoena authenticity',
  });
  assert.equal(activation1.hold.status, 'ACTIVE');
  assert.equal(activation1.propagatedInstructions.length, 1);
  assert.equal(activation1.propagatedInstructions[0].targetRecordId, 'doc_child_101');

  // Re-running propagation is idempotent (still 1 instruction)
  const rerunProp = mod.legalHolds.propagateHoldScope(legalAdmin, hold1.id);
  assert.equal(rerunProp.length, 1);

  // TEST 4: Newly created record within continuing hold scope is automatically covered
  mod.legalHolds.registerPlatformRecord(legalAdmin, {
    recordId: 'ledger_new_child_102',
    tenantId: legalAdmin.tenantId,
    organizationId: legalAdmin.organizationId,
    entityType: 'FINANCIAL_RECORD',
    sourceModule: 'employee-54-financial-ledger',
    dataCategory: 'LEDGER_SETTLEMENT',
    jurisdictionId: jur.id,
    parentEntityType: 'TRANSACTION',
    parentEntityId: 'tx_parent_100',
    subjectUserOrOrgId: 'user_seller_9',
    createdAt: '2026-05-01T00:00:00.000Z',
    retentionTriggerEvents: { PAYMENT_SETTLEMENT: '2026-05-01T00:00:00.000Z' },
    sourceModuleSupportsDisposition: true,
    sourceModuleSupportsAnonymization: false,
  });
  const decisionNewChild = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'ledger_new_child_102',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(decisionNewChild.outcome, 'PRESERVE_LEGAL_HOLD');
  assert.ok(decisionNewChild.applicableHoldIds.includes(hold1.id));

  // TEST 2 & 5: Multiple simultaneous holds + Hold release with another hold still active
  const hold2 = mod.legalHolds.createLegalHold(legalAdmin, {
    title: 'Hold #2 — Fraud Investigation Hold (Employee 71)',
    description: 'Concurrent fraud investigation covering doc_child_101',
    legalOrPreservationBasis: 'Internal Fraud Investigation #FRD-71-88',
    jurisdictionId: jur.id,
    relatedCaseOrInvestigationId: 'frd_case_88',
    scope: {
      coveredEntityTypes: ['DOCUMENT'],
      coveredEntityIds: ['doc_child_101'],
      coveredDocumentCategories: ['CONTRACT_DOCUMENT'],
      coveredDataCategories: ['CONTRACT_DOCUMENT'],
      coveredSystemsAndSourceModules: ['employee-63-documents'],
      propagationRules: [],
    },
    effectiveTimestamp: '2026-03-01T00:00:00.000Z',
    responsibleLegalOrComplianceOwnerId: legalAdmin.actorId,
    reviewFrequencyDays: 30,
    releaseConditions: 'Fraud investigation closure',
    submitForApproval: true,
  });
  mod.legalHolds.approveAndActivateLegalHold(legalAdmin, hold2.id, {
    authority: 'Risk & Compliance Committee',
    rationale: 'Active fraud review',
  });

  const multiHoldDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'doc_child_101',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(multiHoldDecision.outcome, 'PRESERVE_LEGAL_HOLD');
  assert.equal(multiHoldDecision.applicableHoldIds.length, 2);

  // TEST 16: Unauthorized hold release blocked
  assert.throws(
    () =>
      mod.legalHolds.releaseLegalHold(unauthorizedUser, hold1.id, {
        releaseReason: 'Unauthorized release',
        releasingAuthority: 'None',
        releaseScope: 'FULL',
        relatedCaseOrObligationReferences: ['case_emp66_01'],
        evidenceOrSupportingDecisionReferences: ['ev_1'],
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNAUTHORIZED_COMPLIANCE_OPERATION',
  );

  // Release Hold #1 while Hold #2 remains active
  mod.legalHolds.releaseLegalHold(legalAdmin, hold1.id, {
    releaseReason: 'Court subpoena dismissed',
    releasingAuthority: 'Tehran Civil Court Branch 12',
    releaseScope: 'FULL',
    relatedCaseOrObligationReferences: ['case_emp66_01'],
    evidenceOrSupportingDecisionReferences: ['court_dismissal_order_991'],
  });
  const afterHold1Release = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'doc_child_101',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(afterHold1Release.outcome, 'PRESERVE_LEGAL_HOLD');
  assert.deepEqual(afterHold1Release.applicableHoldIds, [hold2.id]);

  // Configure Retention Policies (Statutory, Contractual, Internal, Ordinary Lifecycle) + TEST 22 (Policy version changes)
  // First verify invented untraceable retention period is rejected
  assert.throws(
    () =>
      mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
        policyCode: 'INVENTED-POL',
        basisTier: 'MANDATORY_STATUTORY_OR_REGULATORY',
        dataCategory: 'CONTRACT_DOCUMENT',
        recordType: 'DOCUMENT',
        applicableJurisdictionId: jur.id,
        retentionTrigger: 'TRANSACTION_COMPLETION',
        retentionDurationDays: 365,
        retentionConditionDescription: 'No source ref',
        responsibleOwnerRole: 'GENERAL_COUNSEL',
        effectiveDate: '2026-01-01T00:00:00.000Z',
        reviewDate: '2027-01-01T00:00:00.000Z',
        dispositionMethod: 'HARD_DELETE',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNTRACEABLE_RETENTION_PERIOD',
  );

  // Create v1 and update to v2 for statutory retention on DOCUMENT (365 days from TRANSACTION_COMPLETION = 2027-01-10)
  const statPolV1 = mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
    policyCode: 'POL-STAT-DOC',
    basisTier: 'MANDATORY_STATUTORY_OR_REGULATORY',
    dataCategory: 'CONTRACT_DOCUMENT',
    recordType: 'DOCUMENT',
    applicableJurisdictionId: jur.id,
    retentionTrigger: 'TRANSACTION_COMPLETION',
    retentionDurationDays: 180,
    retentionConditionDescription: 'Initial 180d',
    sourceObligationId: statutoryObl.id,
    responsibleOwnerRole: 'GENERAL_COUNSEL',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    reviewDate: '2027-01-01T00:00:00.000Z',
    dispositionMethod: 'HARD_DELETE',
    approveImmediately: true,
  });
  const statPolV2 = mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
    policyCode: 'POL-STAT-DOC',
    basisTier: 'MANDATORY_STATUTORY_OR_REGULATORY',
    dataCategory: 'CONTRACT_DOCUMENT',
    recordType: 'DOCUMENT',
    applicableJurisdictionId: jur.id,
    retentionTrigger: 'TRANSACTION_COMPLETION',
    retentionDurationDays: 365,
    retentionConditionDescription: 'Updated 365d statutory retention',
    sourceObligationId: statutoryObl.id,
    responsibleOwnerRole: 'GENERAL_COUNSEL',
    effectiveDate: '2026-02-01T00:00:00.000Z',
    reviewDate: '2027-02-01T00:00:00.000Z',
    dispositionMethod: 'HARD_DELETE',
    approveImmediately: true,
  });
  assert.equal(statPolV1.approvalStatus, 'SUPERSEDED');
  assert.equal(statPolV2.version, 2);

  // Contractual retention policy (500 days from TRANSACTION_COMPLETION) on DOCUMENT
  mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
    policyCode: 'POL-CONTRACT-DOC',
    basisTier: 'APPROVED_CONTRACTUAL_PRESERVATION',
    dataCategory: 'CONTRACT_DOCUMENT',
    recordType: 'DOCUMENT',
    applicableJurisdictionId: jur.id,
    retentionTrigger: 'TRANSACTION_COMPLETION',
    retentionDurationDays: 500,
    retentionConditionDescription: 'Escrow partner SLA 500 days',
    approvedPolicyDocumentRef: 'contract_escrow_sla_2026',
    responsibleOwnerRole: 'GENERAL_COUNSEL',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    reviewDate: '2027-01-01T00:00:00.000Z',
    dispositionMethod: 'HARD_DELETE',
    approveImmediately: true,
  });

  // Internal retention policy on TRANSACTION_CORE (400 days)
  mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
    policyCode: 'POL-INTERNAL-TX',
    basisTier: 'APPROVED_INTERNAL_RETENTION_POLICY',
    dataCategory: 'TRANSACTION_CORE',
    recordType: 'TRANSACTION',
    applicableJurisdictionId: jur.id,
    retentionTrigger: 'TRANSACTION_COMPLETION',
    retentionDurationDays: 400,
    retentionConditionDescription: 'Internal audit policy 400 days',
    approvedPolicyDocumentRef: 'int_pol_audit_400',
    responsibleOwnerRole: 'COMPLIANCE_ADMIN',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    reviewDate: '2027-01-01T00:00:00.000Z',
    dispositionMethod: 'HARD_DELETE',
    approveImmediately: true,
  });

  // Ordinary lifecycle policy on MARKETING_PREFERENCE (30 days from RECORD_CREATION -> expired by 2026)
  mod.retentionAndDisposition.createOrUpdateRetentionPolicy(legalAdmin, {
    policyCode: 'POL-MKT-PREF',
    basisTier: 'ORDINARY_DATA_LIFECYCLE_POLICY',
    dataCategory: 'MARKETING_PREFERENCE',
    recordType: 'INDIVIDUAL_RECORD',
    applicableJurisdictionId: jur.id,
    retentionTrigger: 'RECORD_CREATION',
    retentionDurationDays: 30,
    retentionConditionDescription: '30d marketing preference lifecycle',
    approvedPolicyDocumentRef: 'int_pol_mkt_30d',
    responsibleOwnerRole: 'PRIVACY_OFFICER',
    effectiveDate: '2025-01-01T00:00:00.000Z',
    reviewDate: '2026-01-01T00:00:00.000Z',
    dispositionMethod: 'HARD_DELETE',
    approveImmediately: true,
  });

  // TEST 6, 7, 8: Release Hold #2 -> Mandatory statutory retention (Rank 2) takes precedence at 2026-06-01, with longest preservation date from contractual policy (500d)
  mod.legalHolds.releaseLegalHold(legalAdmin, hold2.id, {
    releaseReason: 'Fraud investigation cleared',
    releasingAuthority: 'Risk & Compliance Committee',
    releaseScope: 'FULL',
    relatedCaseOrObligationReferences: ['frd_case_88'],
    evidenceOrSupportingDecisionReferences: ['clearance_memo_88'],
  });

  const mandatoryRetDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'doc_child_101',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(mandatoryRetDecision.outcome, 'PRESERVE_MANDATORY_RETENTION');
  assert.equal(mandatoryRetDecision.precedenceHierarchyRank, 2);

  // At 2027-03-01 (415 days after 2026-01-10), 365d statutory has expired, but 500d contractual obligation is still active -> PRESERVE_CONTRACTUAL_OBLIGATION
  const contractualRetDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'doc_child_101',
    evaluationTimestampIso: '2027-03-01T00:00:00.000Z',
  });
  assert.equal(contractualRetDecision.outcome, 'PRESERVE_CONTRACTUAL_OBLIGATION');
  assert.equal(contractualRetDecision.precedenceHierarchyRank, 3);

  // Internal retention policy check on tx_parent_100 at 2026-06-01 -> PRESERVE_INTERNAL_POLICY
  const internalRetDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'tx_parent_100',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(internalRetDecision.outcome, 'PRESERVE_INTERNAL_POLICY');
  assert.equal(internalRetDecision.precedenceHierarchyRank, 4);

  // TEST 9 & 10: Partial deletion request (Employee 64) + Unrelated record remains eligible for disposition
  const privacyEval = mod.retentionAndDisposition.evaluatePrivacyDeletionRequest(legalAdmin, {
    privacyRequestId: 'emp64_req_501',
    subjectUserOrOrgId: 'user_seller_9',
    requestedRecordIds: ['doc_child_101', 'pref_unrelated_200'],
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(privacyEval.overallStatus, 'PARTIAL_FULFILLMENT_PERMITTED');
  assert.deepEqual(privacyEval.eligibleRecordIds, ['pref_unrelated_200']);
  assert.deepEqual(privacyEval.preservedRecordIds, ['doc_child_101']);

  // TEST 11: Conflicting legal instructions block disposition and create a mandatory legal review
  mod.legalHolds.registerPlatformRecord(legalAdmin, {
    recordId: 'rec_conflict_77',
    tenantId: legalAdmin.tenantId,
    organizationId: legalAdmin.organizationId,
    entityType: 'DOCUMENT',
    sourceModule: 'employee-63-documents',
    dataCategory: 'CONTRACT_DOCUMENT',
    jurisdictionId: jur.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    retentionTriggerEvents: { TRANSACTION_COMPLETION: '2026-01-01T00:00:00.000Z' },
    sourceModuleSupportsDisposition: true,
    sourceModuleSupportsAnonymization: false,
    conflictingLegalDeletionInstructionId: 'court_purge_order_44',
  });
  const conflictHold = mod.legalHolds.createLegalHold(legalAdmin, {
    title: 'Hold on Conflict Record',
    description: 'Hold conflicting with purge order',
    legalOrPreservationBasis: 'Regulatory Hold Order #99',
    jurisdictionId: jur.id,
    scope: {
      coveredEntityTypes: ['DOCUMENT'],
      coveredEntityIds: ['rec_conflict_77'],
      coveredDocumentCategories: ['CONTRACT_DOCUMENT'],
      coveredDataCategories: ['CONTRACT_DOCUMENT'],
      coveredSystemsAndSourceModules: ['employee-63-documents'],
      propagationRules: [],
    },
    effectiveTimestamp: '2026-02-01T00:00:00.000Z',
    responsibleLegalOrComplianceOwnerId: legalAdmin.actorId,
    reviewFrequencyDays: 30,
    releaseConditions: 'Conflict resolution',
    submitForApproval: true,
  });
  mod.legalHolds.approveAndActivateLegalHold(legalAdmin, conflictHold.id, {
    authority: 'General Counsel',
    rationale: 'Preserve pending conflict resolution',
  });

  const conflictDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'rec_conflict_77',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(conflictDecision.outcome, 'LEGAL_REVIEW_REQUIRED');
  assert.equal(mod.store.retentionConflicts.size, 1);

  // TEST 12: Missing retention configuration blocks disposition
  const missingConfigDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'ledger_new_child_102', // LEDGER_SETTLEMENT has no retention policy configured yet and hold1 was released
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(missingConfigDecision.outcome, 'RETENTION_CONFIGURATION_MISSING');

  // TEST 13 & 14: Unavailable hold registry & incomplete scope resolution fail-safes block disposition
  mod.store.holdRegistryUnavailable = true;
  const unavailableDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'pref_unrelated_200',
  });
  assert.equal(unavailableDecision.outcome, 'LEGAL_REVIEW_REQUIRED');
  mod.store.holdRegistryUnavailable = false;

  mod.store.scopeResolutionIncomplete = true;
  const incompleteScopeDecision = mod.retentionAndDisposition.evaluateRetentionPrecedence(legalAdmin, {
    recordId: 'pref_unrelated_200',
  });
  assert.equal(incompleteScopeDecision.outcome, 'LEGAL_REVIEW_REQUIRED');
  mod.store.scopeResolutionIncomplete = false;

  // TEST 17 & 18: Unauthorized disposition blocked, blocked disposition on preserved record, failed disposition execution never marked COMPLETED, and successful disposition on eligible record
  assert.throws(
    () =>
      mod.retentionAndDisposition.requestAndExecuteDisposition(unauthorizedUser, {
        targetRecordId: 'pref_unrelated_200',
        requestedAction: 'DELETE',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'UNAUTHORIZED_COMPLIANCE_OPERATION',
  );

  const blockedDisp = mod.retentionAndDisposition.requestAndExecuteDisposition(legalAdmin, {
    targetRecordId: 'doc_child_101',
    requestedAction: 'DELETE',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(blockedDisp.status, 'BLOCKED');

  mod.store.simulatedSourceDispositionFailure = true;
  const failedDisp = mod.retentionAndDisposition.requestAndExecuteDisposition(legalAdmin, {
    targetRecordId: 'pref_unrelated_200',
    requestedAction: 'DELETE',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(failedDisp.status, 'FAILED');
  mod.store.simulatedSourceDispositionFailure = false;

  const completedDisp = mod.retentionAndDisposition.requestAndExecuteDisposition(legalAdmin, {
    targetRecordId: 'pref_unrelated_200',
    requestedAction: 'DELETE',
    evaluationTimestampIso: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(completedDisp.status, 'COMPLETED');

  // TEST 19, 20, 21: Idempotent event processing, historical audit preservation, and concurrent hold updates
  const evt1 = mod.store.publishEvent('legal_hold.review_required', 'idemp_review_key_1', 'corr_1', {
    holdId: conflictHold.id,
  });
  const evt2 = mod.store.publishEvent('legal_hold.review_required', 'idemp_review_key_1', 'corr_1', {
    holdId: conflictHold.id,
  });
  assert.equal(evt1.eventId, evt2.eventId);

  assert.throws(
    () => mod.attemptModifyHistoricalDecisionOrEraseAudit(legalAdmin, mod.store.auditTrail[0].id),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'IMMUTABLE_AUDIT_TRAIL_VIOLATION',
  );

  assert.throws(
    () =>
      mod.legalHolds.updateLegalHoldScope(legalAdmin, conflictHold.id, {
        expectedVersion: 999, // Stale/wrong version
        newScope: conflictHold.scope,
        reason: 'Concurrent update test',
      }),
    (err: unknown) => err instanceof ComplianceDomainError && err.code === 'CONCURRENT_HOLD_MODIFICATION_CONFLICT',
  );

  console.log('PASSED: legalHoldAndRetention.test.ts (All 22 Legal Hold & Retention Precedence test scenarios)');
}

runLegalHoldAndRetentionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
