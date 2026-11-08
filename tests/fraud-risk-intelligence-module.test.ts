/**
 * EMPLOYEE 71 — REAL ESTATE FRAUD DETECTION, RISK INTELLIGENCE & PLATFORM ABUSE PREVENTION TESTS
 * Comprehensive verification of all Unit, Integration, Security, and Behavioral requirements in Section 23.
 */

import assert from 'node:assert/strict';
import type {
  AuthenticatedPrincipal,
  StructuredAuditEvent,
  TransactionContextLike,
  TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  FraudRiskIntelligenceService,
  type RiskActionExecution,
} from '../server/modules/fraud-risk-intelligence';

function createInMemoryTxRunner(): TransactionRunnerAdapter {
  const store = new Map<string, Record<string, unknown>>();
  return {
    async runTransaction<T>(workFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const item = store.get(docPath);
          return { exists: Boolean(item), data: item as D | undefined };
        },
        set(docPath: string, data: Record<string, unknown>) {
          store.set(docPath, { ...data });
        },
        update(docPath: string, partial: Record<string, unknown>) {
          const prev = store.get(docPath) ?? {};
          store.set(docPath, { ...prev, ...partial });
        },
        delete(docPath: string) {
          store.delete(docPath);
        },
      };
      return workFn(tx);
    },
  };
}

async function runTests() {
  const txRunner = createInMemoryTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];
  const createdSupportCases: string[] = [];
  const dispatchedActions: RiskActionExecution[] = [];
  const publishedEvents: { eventName: string; payload: Record<string, unknown> }[] = [];

  const service = new FraudRiskIntelligenceService({
    txRunner,
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    onSupportCaseRequested: (payload) => {
      const caseId = `case_emp66_${createdSupportCases.length + 1}_${payload.entityId}`;
      createdSupportCases.push(caseId);
      return caseId;
    },
    onProtectiveActionDispatched: (action) => {
      dispatchedActions.push(action);
    },
    onRiskDomainEventPublished: (eventName, payload) => {
      publishedEvents.push({ eventName, payload });
    },
  });

  const primaryAdmin: AuthenticatedPrincipal = {
    uid: 'risk_admin_primary_1',
    email: 'risk-lead@tehranradar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const delegatedReviewer: AuthenticatedPrincipal = {
    uid: 'risk_reviewer_2',
    email: 'reviewer2@tehranradar.ir',
    emailVerified: true,
    role: 'delegated_admin',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const ordinaryUser: AuthenticatedPrincipal = {
    uid: 'ordinary_user_1',
    email: 'user@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  // 1. Security & RBAC: Reject ordinary users from accessing risk APIs or evidence
  await assert.rejects(
    () =>
      service.ingestRiskSignal(ordinaryUser, {
        category: 'LISTING_INTEGRITY',
        signalType: 'SUSPICIOUS_PRICE',
        sourceModule: 'employee-58-listings',
        sourceReferenceId: 'lst_900',
        entityType: 'PROPERTY_LISTING',
        entityId: 'lst_900',
        severity: 'HIGH',
        confidence: 0.85,
        reliability: 'CORROBORATED_INTERNAL',
      }),
    /Risk intelligence administrative privileges required/,
  );

  // 2. Rule Engine Security: Reject unsafe arbitrary code/SQL expressions in rules
  await assert.rejects(
    () =>
      service.upsertRiskRule(primaryAdmin, {
        ruleId: 'bad_eval_rule',
        name: 'Unsafe Rule',
        description: 'Tries to use eval()',
        category: 'LISTING_INTEGRITY',
        enabled: true,
        severity: 'HIGH',
        confidenceContribution: 0.8,
        weightPoints: 50,
        conditions: [{ field: 'eval(process.exit())', operator: 'EQ', expectedValue: true }],
        requiredFields: [],
        supportedEntityTypes: ['PROPERTY_LISTING'],
        cooldownSeconds: 60,
        expirationHours: 24,
        requiresHumanReview: true,
        effectiveFrom: new Date().toISOString(),
      }),
    /UNSAFE_RULE_EXPRESSION/,
  );

  // 3. Behavioral Test: Missing information does NOT automatically increase risk
  const missingDataEval = await service.evaluateDomainEventWithRules(primaryAdmin, {
    eventId: 'evt_listing_incomplete_1',
    sourceModule: 'employee-58-listings',
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_incomplete_101',
    payload: {
      priceRials: 120_000_000_000,
      // comparableBaselineRials is missing!
    },
  });
  assert.equal(missingDataEval.triggeredSignals.length, 0);
  assert.equal(missingDataEval.assessment.score, 0);
  assert.ok(missingDataEval.missingFieldsIgnored.includes('comparableBaselineRials'));

  // 4. Behavioral Test: Shared IP / weak network indicator does not trigger high risk alone
  const weakNetworkEval = await service.evaluateDomainEventWithRules(primaryAdmin, {
    eventId: 'evt_shared_office_wifi_1',
    sourceModule: 'employee-64-customer-experience',
    entityType: 'USER_ACCOUNT',
    entityId: 'usr_brokerage_office_1',
    payload: {
      sharedNetworkAccountCount: 6,
    },
  });
  assert.equal(weakNetworkEval.triggeredSignals.length, 1);
  assert.ok(weakNetworkEval.assessment.score <= 15);
  assert.equal(weakNetworkEval.assessment.riskBand, 'MINIMAL');
  assert.equal(weakNetworkEval.assessment.requiresHumanReview, false);

  // 5. Behavioral Test: Suspicious listing generates explainable signal, multiple signals combine, duplicate events do NOT inflate score
  const extremePriceEval = await service.evaluateDomainEventWithRules(primaryAdmin, {
    eventId: 'evt_listing_suspicious_price_500',
    sourceModule: 'employee-58-listings',
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_suspicious_500',
    payload: {
      priceRials: 25_000_000_000, // 75% below baseline of 100B Rials
      comparableBaselineRials: 100_000_000_000,
    },
  });
  assert.equal(extremePriceEval.triggeredSignals.length, 1);
  const firstScore = extremePriceEval.assessment.score;
  assert.ok(firstScore > 25);
  assert.equal(extremePriceEval.assessment.requiresHumanReview, true);
  assert.ok(extremePriceEval.assessment.linkedCaseId); // Linked to Employee 66 Case Management!

  // Replay the exact same signal -> deduplicated, score MUST NOT inflate
  const duplicateIngest = await service.ingestRiskSignal(primaryAdmin, {
    category: 'LISTING_INTEGRITY',
    signalType: 'RULE_RULE_LISTING_EXTREME_PRICE_DEVIATION',
    sourceModule: 'employee-58-listings',
    sourceReferenceId: 'evt_listing_suspicious_price_500',
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_suspicious_500',
    severity: 'HIGH',
    confidence: 0.85,
    reliability: 'CORROBORATED_INTERNAL',
    ruleId: 'rule_listing_extreme_price_deviation',
    deduplicationKey: 'PROPERTY_LISTING::lst_suspicious_500::rule_listing_extreme_price_deviation::evt_listing_suspicious_price_500',
  });
  assert.equal(duplicateIngest.deduplicated, true);
  assert.equal(duplicateIngest.assessment.score, firstScore);

  // Add a second independent document-reuse signal on the same listing -> score increases & triggers HIGH/CRITICAL review
  const secondSignal = await service.ingestRiskSignal(primaryAdmin, {
    category: 'DOCUMENT_INTEGRITY',
    signalType: 'REUSED_DEED_FINGERPRINT',
    sourceModule: 'employee-63-documents',
    sourceReferenceId: 'doc_deed_hash_991',
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_suspicious_500',
    severity: 'HIGH',
    confidence: 0.92,
    reliability: 'AUTHORITATIVE_VERIFIED',
    requiresHumanReview: true,
  });
  assert.ok(secondSignal.assessment.score > firstScore);
  assert.ok(secondSignal.assessment.contributingSignals.length === 2);

  // 6. Behavioral Test: Low-confidence signal does NOT automatically become a critical decision
  const lowConfResult = await service.ingestRiskSignal(primaryAdmin, {
    category: 'REPUTATION_AND_REVIEWS',
    signalType: 'UNUSUAL_REVIEW_TIMING',
    sourceModule: 'employee-65-reputation',
    sourceReferenceId: 'rev_batch_12',
    entityType: 'AGENT_BROKER',
    entityId: 'broker_low_conf_77',
    severity: 'CRITICAL',
    confidence: 0.25, // Very low confidence
    reliability: 'EXTERNAL_UNVERIFIED',
  });
  assert.ok(lowConfResult.assessment.score <= 58);
  assert.notEqual(lowConfResult.assessment.riskBand, 'CRITICAL');

  // 7. Evidence Registry & Strict Access Control
  const sensitiveEvidence = await service.registerEvidenceReference(primaryAdmin, {
    evidenceType: 'DOCUMENT_FINGERPRINT',
    sourceModule: 'employee-63-documents',
    sourceRecordId: 'doc_991',
    sourceVersion: 'v2',
    provenance: 'SHA256-collision-check',
    integrityHash: 'sha256:abcdef1234567890',
    accessClassification: 'RISK_SENSITIVE_ADMIN_ONLY',
    retentionDays: 365,
    relatedCaseIds: [extremePriceEval.assessment.linkedCaseId!],
    verificationStatus: 'VERIFIED',
  });
  // Delegated reviewer cannot read RISK_SENSITIVE_ADMIN_ONLY evidence
  assert.throws(
    () => service.getAuthorizedEvidence(delegatedReviewer, sensitiveEvidence.evidenceId),
    /Primary admin clearance required/,
  );
  // Primary admin can read it
  const fetchedEv = service.getAuthorizedEvidence(primaryAdmin, sensitiveEvidence.evidenceId);
  assert.equal(fetchedEv.evidenceId, sensitiveEvidence.evidenceId);

  // 8. Separation of duties (Dual Control) & False-Positive Management
  await assert.rejects(
    () =>
      service.recordHumanReviewDecision(primaryAdmin, {
        entityType: 'PROPERTY_LISTING',
        entityId: 'lst_suspicious_500',
        decisionOutcome: 'CONFIRM_CONCERN',
        reason: 'Attempting single-reviewer high-impact restriction',
        highImpactCategory: 'HIGH_VALUE_TRANSACTION_RESTRICTION',
        secondApproverUid: primaryAdmin.uid, // Same UID -> must fail dual control!
      }),
    /DUAL_CONTROL_REQUIRED/,
  );

  // False-positive confirmation recalculates score to 0 and prevents repeated signal generation
  const fpOutcome = await service.recordHumanReviewDecision(primaryAdmin, {
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_suspicious_500',
    decisionOutcome: 'MARK_FALSE_POSITIVE',
    falsePositiveCategory: 'LEGITIMATE_UNUSUAL_BEHAVIOR',
    reason: 'Verified distressed estate sale court order; legitimate discount and deed.',
  });
  assert.equal(fpOutcome.updatedAssessment.status, 'FALSE_POSITIVE');
  assert.equal(fpOutcome.updatedAssessment.score, 0);
  assert.ok(fpOutcome.decision.ruleImprovementRef);

  // Downstream risk gate now passes for lst_suspicious_500
  const gateAfterFp = service.checkCrossModuleOperationRiskGate({
    requestingModule: 'employee-69-search',
    operationType: 'LISTING_PUBLISH',
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_suspicious_500',
  });
  assert.equal(gateAfterFp.checkStatus, 'RISK_CHECK_PASSED');

  // 9. Protective Actions Safety: Irreversible actions & automated high-impact actions are blocked
  await assert.rejects(
    () =>
      service.executeProtectiveAction(primaryAdmin, {
        entityType: 'USER_ACCOUNT',
        entityId: 'usr_999',
        actionType: 'PERMANENT_ACCOUNT_BAN',
        classification: 'IRREVERSIBLE',
        reasonCode: 'ATTEMPT_AUTO_BAN',
        idempotencyKey: 'act_ban_1',
        isAutomatedTrigger: true,
      }),
    /PROHIBITED_IRREVERSIBLE_RISK_ACTION/,
  );

  await assert.rejects(
    () =>
      service.executeProtectiveAction(primaryAdmin, {
        entityType: 'TRANSACTION',
        entityId: 'tx_888',
        actionType: 'SEIZE_OR_TRANSFER_FUNDS',
        classification: 'IRREVERSIBLE',
        reasonCode: 'ATTEMPT_SEIZE_FUNDS',
        idempotencyKey: 'act_seize_1',
        isAutomatedTrigger: false,
      }),
    /PROHIBITED_IRREVERSIBLE_RISK_ACTION/,
  );

  const safeHoldAction = await service.executeProtectiveAction(primaryAdmin, {
    entityType: 'PROPERTY_LISTING',
    entityId: 'lst_hold_300',
    actionType: 'HOLD_LISTING_FOR_MODERATION',
    classification: 'TEMPORARILY_RESTRICTIVE',
    reasonCode: 'PENDING_DEED_CHECK',
    idempotencyKey: 'act_hold_300',
    isAutomatedTrigger: true,
  });
  assert.equal(safeHoldAction.status, 'COMPLETED');
  assert.equal(dispatchedActions.length, 1);

  // 10. Resilience: Risk service outage is NEVER interpreted as a confirmed safe assessment
  service.setSimulatedOutage(true);
  const outageGate = service.checkCrossModuleOperationRiskGate({
    requestingModule: 'employee-53-transactions',
    operationType: 'TRANSACTION_SETTLEMENT',
    entityType: 'TRANSACTION',
    entityId: 'tx_critical_55',
  });
  assert.equal(outageGate.checkStatus, 'RISK_CHECK_UNAVAILABLE');
  assert.equal(outageGate.requiresAdditionalReview, true);
  assert.equal(outageGate.fallbackPolicyApplied, 'HOLD_FOR_MANUAL_REVIEW');
  service.setSimulatedOutage(false);

  // 11. Neighborhood & Category Anomaly Detection + Bounded Entity Association Analysis
  const sparseAnomaly = service.detectStatisticalAnomaly(primaryAdmin, {
    observedValue: 500_000_000_000,
    historicalSampleValues: [100_000_000_000, 110_000_000_000], // < 5 samples
    neighborhoodId: 'hood_niavaran',
    propertyCategory: 'RESIDENTIAL',
  });
  assert.equal(sparseAnomaly.isAnomalous, false);
  assert.ok(sparseAnomaly.confidence <= 0.3);

  const sufficientAnomaly = service.detectStatisticalAnomaly(primaryAdmin, {
    observedValue: 450_000_000_000,
    historicalSampleValues: [
      100_000_000_000,
      105_000_000_000,
      98_000_000_000,
      102_000_000_000,
      101_000_000_000,
      99_000_000_000,
    ],
    neighborhoodId: 'hood_niavaran',
    propertyCategory: 'RESIDENTIAL',
  });
  assert.equal(sufficientAnomaly.isAnomalous, true);
  assert.ok(sufficientAnomaly.zScore >= 3.0);

  service.registerEntityRelationship(primaryAdmin, {
    fromEntityType: 'PROPERTY_LISTING',
    fromEntityId: 'lst_A',
    toEntityType: 'DOCUMENT',
    toEntityId: 'doc_shared_1',
    relationshipType: 'SHARED_DOCUMENT_HASH',
    sourceModule: 'employee-63-documents',
    confidence: 0.99,
    evidenceIds: [],
    isWeakTechnicalCorrelation: false,
  });
  service.registerEntityRelationship(primaryAdmin, {
    fromEntityType: 'PROPERTY_LISTING',
    fromEntityId: 'lst_B',
    toEntityType: 'DOCUMENT',
    toEntityId: 'doc_shared_1',
    relationshipType: 'SHARED_DOCUMENT_HASH',
    sourceModule: 'employee-63-documents',
    confidence: 0.99,
    evidenceIds: [],
    isWeakTechnicalCorrelation: false,
  });
  const assoc = service.analyzeAssociations(primaryAdmin, 'DOCUMENT', 'doc_shared_1');
  assert.ok(assoc.suspiciousCollusionIndicators.includes('REUSED_DOCUMENT_FINGERPRINT_ACROSS_MULTIPLE_ENTITIES'));

  const overview = service.getAdminOverviewAndMetrics(primaryAdmin);
  assert.ok(overview.totalActiveAssessments >= 3);
  assert.ok(publishedEvents.length >= 4);
  assert.ok(auditEvents.length >= 6);

  console.log('ALL EMPLOYEE 71 FRAUD DETECTION & RISK INTELLIGENCE TESTS PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
