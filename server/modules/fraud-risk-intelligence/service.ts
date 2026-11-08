/**
 * EMPLOYEE 71 — REAL ESTATE FRAUD DETECTION, RISK INTELLIGENCE & PLATFORM ABUSE PREVENTION SERVICE
 */

import crypto from 'crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import {
  analyzeEntityAssociationsBounded,
  calculateExplainableRiskScore,
  evaluateNeighborhoodCategoryAnomaly,
  evaluateRuleAgainstPayload,
  validateStructuredRiskRule,
} from './engine';
import type {
  EvidenceReliability,
  FalsePositiveReasonCategory,
  FraudRiskModuleDependencies,
  ProtectiveActionClassification,
  ProtectiveActionType,
  RiskActionExecution,
  RiskAssessment,
  RiskAssessmentStatus,
  RiskCaseLink,
  RiskCheckGateResult,
  RiskDecision,
  RiskEntityType,
  RiskEvidenceReference,
  RiskPolicyConfiguration,
  RiskRelationship,
  RiskRule,
  RiskRuleVersion,
  RiskSeverity,
  RiskSignal,
  RiskSignalCategory,
} from './types';

function writeDoc(tx: TransactionContextLike, docPath: string, data: unknown): void {
  tx.set(docPath, data as Record<string, unknown>);
}

const PROHIBITED_AUTOMATED_ACTIONS = new Set<ProtectiveActionType>([
  'PERMANENT_ACCOUNT_BAN',
  'DELETE_USER_ACCOUNT',
  'SEIZE_OR_TRANSFER_FUNDS',
  'MODIFY_LEDGER_BALANCE',
]);

export class FraudRiskIntelligenceService {
  private readonly signals = new Map<string, RiskSignal>();
  private readonly signalDedupeIndex = new Map<string, string>();
  private readonly suppressedSignatureKeys = new Set<string>();
  private readonly rules = new Map<string, RiskRule>();
  private readonly ruleVersions = new Map<string, RiskRuleVersion[]>();
  private readonly assessments = new Map<string, RiskAssessment>();
  private readonly assessmentHistory = new Map<string, RiskAssessment[]>();
  private readonly evidences = new Map<string, RiskEvidenceReference>();
  private readonly relationships = new Map<string, RiskRelationship>();
  private readonly decisions = new Map<string, RiskDecision>();
  private readonly actions = new Map<string, RiskActionExecution>();
  private readonly caseLinks = new Map<string, RiskCaseLink>();
  private readonly processedEventIds = new Set<string>();
  private serviceUnavailableSimulated = false;
  private policy: RiskPolicyConfiguration;

  private metrics = {
    signalsProcessed: 0,
    signalsDeduplicated: 0,
    ruleEvaluations: 0,
    assessmentsCalculated: 0,
    falsePositivesConfirmed: 0,
    actionsExecuted: 0,
    actionsRejected: 0,
  };

  constructor(private readonly deps: FraudRiskModuleDependencies) {
    const now = new Date().toISOString();
    this.policy = {
      policyVersion: 'policy-v1.0',
      bands: { minimalMax: 19, lowMax: 39, moderateMax: 59, highMax: 79 },
      humanReviewThresholdScore: 60,
      secondReviewerRequiredCategories: [
        'PERMANENT_RESTRICTION',
        'ORGANIZATION_RESTRICTION',
        'HIGH_VALUE_TRANSACTION_RESTRICTION',
        'FINANCIAL_INTERVENTION',
        'CREDENTIAL_REVOCATION',
      ],
      defaultSignalTtlHours: 720,
      timeDecayHalfLifeHours: 168,
      updatedAt: now,
      updatedByUid: 'system_bootstrap',
    };
    this.seedDefaultRules(now);
  }

  private seedDefaultRules(now: string): void {
    const defaultRules: RiskRule[] = [
      {
        ruleId: 'rule_listing_extreme_price_deviation',
        name: 'Extreme Listing Price Deviation From Comparable Evidence',
        description: 'Detects listing price deviating by >60% from comparable valuation baseline.',
        category: 'LISTING_INTEGRITY',
        version: 1,
        enabled: true,
        severity: 'HIGH',
        confidenceContribution: 0.85,
        weightPoints: 48,
        conditions: [
          {
            field: 'priceRials',
            operator: 'RATIO_DEVIATION_GT',
            expectedValue: 0.6,
            referenceBaselineField: 'comparableBaselineRials',
          },
        ],
        requiredFields: ['priceRials', 'comparableBaselineRials'],
        supportedEntityTypes: ['PROPERTY_LISTING', 'PROPERTY'],
        cooldownSeconds: 3600,
        expirationHours: 720,
        requiresHumanReview: true,
        effectiveFrom: now,
        ownerUid: 'system_bootstrap',
        updatedAt: now,
      },
      {
        ruleId: 'rule_shared_network_weak_indicator',
        name: 'Shared Network / Office IP Weak Technical Indicator',
        description: 'Informational weak correlation; never proves fraud or triggers high risk alone.',
        category: 'IDENTITY_AND_ACCOUNT',
        version: 1,
        enabled: true,
        severity: 'LOW',
        confidenceContribution: 0.3,
        weightPoints: 10,
        conditions: [{ field: 'sharedNetworkAccountCount', operator: 'GTE', expectedValue: 3 }],
        requiredFields: ['sharedNetworkAccountCount'],
        supportedEntityTypes: ['USER_ACCOUNT'],
        cooldownSeconds: 86400,
        expirationHours: 168,
        requiresHumanReview: false,
        weakSignalOnly: true,
        effectiveFrom: now,
        ownerUid: 'system_bootstrap',
        updatedAt: now,
      },
    ];
    for (const r of defaultRules) {
      this.rules.set(r.ruleId, r);
      this.ruleVersions.set(r.ruleId, [
        {
          ruleId: r.ruleId,
          version: 1,
          snapshot: { ...r },
          changedByUid: 'system_bootstrap',
          changeReason: 'Initial default rule seed',
          recordedAt: now,
        },
      ]);
    }
  }

  public setSimulatedOutage(unavailable: boolean): void {
    this.serviceUnavailableSimulated = unavailable;
  }

  private assertRiskAdmin(actor: AuthenticatedPrincipal): void {
    const allowed = new Set(['primary_admin', 'delegated_admin', 'server_secret_admin']);
    if (!allowed.has(actor.role)) {
      throw new CoreApiError('FORBIDDEN', 403, 'Risk intelligence administrative privileges required.');
    }
  }

  public async registerEvidenceReference(
    actor: AuthenticatedPrincipal,
    input: Omit<RiskEvidenceReference, 'evidenceId' | 'collectedAt'>,
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<RiskEvidenceReference> {
    this.assertRiskAdmin(actor);
    const evidence: RiskEvidenceReference = {
      ...input,
      evidenceId: `evd_${crypto.randomUUID()}`,
      collectedAt: new Date().toISOString(),
    };
    await runDurableTransaction(
      this.deps.txRunner,
      { operationName: 'risk.registerEvidence' },
      async (tx) => {
        writeDoc(tx, `risk_evidences/${evidence.evidenceId}`, evidence);
      },
    );
    this.evidences.set(evidence.evidenceId, evidence);
    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'RISK_EVIDENCE_REGISTERED',
        targetCollection: 'risk_evidences',
        targetResourceId: evidence.evidenceId,
        outcome: 'SUCCESS',
        metadata: { evidenceType: evidence.evidenceType, sourceModule: evidence.sourceModule },
      }),
    );
    return evidence;
  }

  public getAuthorizedEvidence(actor: AuthenticatedPrincipal, evidenceId: string): RiskEvidenceReference {
    this.assertRiskAdmin(actor);
    const ev = this.evidences.get(evidenceId);
    if (!ev) {
      throw new CoreApiError('NOT_FOUND', 404, `Evidence ${evidenceId} not found.`);
    }
    if (ev.accessClassification === 'RISK_SENSITIVE_ADMIN_ONLY' && actor.role !== 'primary_admin') {
      throw new CoreApiError('FORBIDDEN', 403, 'Primary admin clearance required for sensitive fraud evidence.');
    }
    return ev;
  }

  public async upsertRiskRule(
    actor: AuthenticatedPrincipal,
    input: Omit<RiskRule, 'version' | 'updatedAt' | 'ownerUid'> & { changeReason?: string },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<RiskRule> {
    this.assertRiskAdmin(actor);
    validateStructuredRiskRule(input);
    const now = new Date().toISOString();
    const existing = this.rules.get(input.ruleId);
    const nextVersion = existing ? existing.version + 1 : 1;

    const rule: RiskRule = {
      ...input,
      version: nextVersion,
      ownerUid: actor.uid,
      updatedAt: now,
    };
    this.rules.set(rule.ruleId, rule);
    const history = this.ruleVersions.get(rule.ruleId) ?? [];
    history.push({
      ruleId: rule.ruleId,
      version: nextVersion,
      snapshot: { ...rule },
      changedByUid: actor.uid,
      changeReason: input.changeReason || 'Rule updated',
      recordedAt: now,
    });
    this.ruleVersions.set(rule.ruleId, history);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'RISK_RULE_UPSERTED',
        targetCollection: 'risk_rules',
        targetResourceId: rule.ruleId,
        outcome: 'SUCCESS',
        metadata: { version: rule.version, enabled: rule.enabled },
      }),
    );
    return rule;
  }

  public async ingestRiskSignal(
    actor: AuthenticatedPrincipal,
    input: {
      category: RiskSignalCategory;
      signalType: string;
      sourceModule: string;
      sourceReferenceId: string;
      entityType: RiskEntityType;
      entityId: string;
      severity: RiskSeverity;
      confidence: number;
      reliability: EvidenceReliability;
      evidenceIds?: string[];
      ruleId?: string;
      contextMetadata?: Record<string, string | number | boolean>;
      requiresHumanReview?: boolean;
      deduplicationKey?: string;
      positiveMitigatingFactors?: string[];
      missingDataFieldsNotPenalized?: string[];
    },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<{ signal: RiskSignal; assessment: RiskAssessment; deduplicated: boolean }> {
    this.assertRiskAdmin(actor);

    const dedupeKey =
      input.deduplicationKey ||
      `${input.entityType}::${input.entityId}::${input.category}::${input.signalType}::${input.sourceReferenceId}`;

    if (this.suppressedSignatureKeys.has(dedupeKey)) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'SUPPRESSED_FALSE_POSITIVE_SIGNATURE: Signal matches a confirmed false-positive suppression signature.',
      );
    }

    const existingSignalId = this.signalDedupeIndex.get(dedupeKey);
    if (existingSignalId) {
      this.metrics.signalsDeduplicated++;
      const existingSig = this.signals.get(existingSignalId)!;
      const existingAssessment = await this.recalculateEntityRiskAssessment(
        actor,
        input.entityType,
        input.entityId,
        {
          positiveMitigatingFactors: input.positiveMitigatingFactors,
          missingDataFieldsNotPenalized: input.missingDataFieldsNotPenalized,
        },
        correlationId,
      );
      return { signal: existingSig, assessment: existingAssessment, deduplicated: true };
    }

    const now = new Date().toISOString();
    const rule = input.ruleId ? this.rules.get(input.ruleId) : undefined;
    const ttlHours = rule?.expirationHours ?? this.policy.defaultSignalTtlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const signal: RiskSignal = {
      signalId: `sig_${crypto.randomUUID()}`,
      category: input.category,
      signalType: input.signalType,
      sourceModule: input.sourceModule,
      sourceReferenceId: input.sourceReferenceId,
      entityType: input.entityType,
      entityId: input.entityId,
      detectedAt: now,
      observedAt: now,
      severity: input.severity,
      confidence: Math.max(0.05, Math.min(1, input.confidence)),
      reliability: input.reliability,
      evidenceIds: input.evidenceIds ?? [],
      ruleId: rule?.ruleId ?? input.ruleId ?? 'manual_or_external_signal',
      ruleVersion: rule?.version ?? 1,
      contextMetadata: input.contextMetadata ?? {},
      status: 'ACTIVE',
      expiresAt,
      requiresHumanReview: Boolean(input.requiresHumanReview || rule?.requiresHumanReview),
      relatedSignalIds: [],
      correlationId,
      provenance: `${input.sourceModule}:${input.sourceReferenceId}`,
      deduplicationKey: dedupeKey,
    };

    this.signals.set(signal.signalId, signal);
    this.signalDedupeIndex.set(dedupeKey, signal.signalId);
    this.metrics.signalsProcessed++;

    if (this.deps.onRiskDomainEventPublished) {
      await this.deps.onRiskDomainEventPublished('risk.signal.created', {
        signalId: signal.signalId,
        entityType: signal.entityType,
        entityId: signal.entityId,
        category: signal.category,
      });
    }

    const assessment = await this.recalculateEntityRiskAssessment(
      actor,
      input.entityType,
      input.entityId,
      {
        positiveMitigatingFactors: input.positiveMitigatingFactors,
        missingDataFieldsNotPenalized: input.missingDataFieldsNotPenalized,
      },
      correlationId,
    );

    return { signal, assessment, deduplicated: false };
  }

  public async evaluateDomainEventWithRules(
    actor: AuthenticatedPrincipal,
    event: {
      eventId: string;
      sourceModule: string;
      entityType: RiskEntityType;
      entityId: string;
      payload: Record<string, unknown>;
    },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<{ triggeredSignals: RiskSignal[]; assessment: RiskAssessment; missingFieldsIgnored: string[] }> {
    this.assertRiskAdmin(actor);

    if (this.processedEventIds.has(event.eventId)) {
      const current = await this.recalculateEntityRiskAssessment(actor, event.entityType, event.entityId, {}, correlationId);
      return { triggeredSignals: [], assessment: current, missingFieldsIgnored: [] };
    }
    this.processedEventIds.add(event.eventId);

    const triggeredSignals: RiskSignal[] = [];
    const missingFieldsIgnored = new Set<string>();

    for (const rule of this.rules.values()) {
      this.metrics.ruleEvaluations++;
      const evalResult = evaluateRuleAgainstPayload(rule, event.entityType, event.payload);
      for (const mf of evalResult.missingFields) missingFieldsIgnored.add(mf);

      if (evalResult.triggered) {
        const ingested = await this.ingestRiskSignal(
          actor,
          {
            category: rule.category,
            signalType: `RULE_${rule.ruleId.toUpperCase()}`,
            sourceModule: event.sourceModule,
            sourceReferenceId: event.eventId,
            entityType: event.entityType,
            entityId: event.entityId,
            severity: rule.severity,
            confidence: rule.confidenceContribution,
            reliability: 'CORROBORATED_INTERNAL',
            ruleId: rule.ruleId,
            requiresHumanReview: rule.requiresHumanReview,
            deduplicationKey: `${event.entityType}::${event.entityId}::${rule.ruleId}::${event.eventId}`,
          },
          correlationId,
        );
        triggeredSignals.push(ingested.signal);
      }
    }

    const assessment = await this.recalculateEntityRiskAssessment(
      actor,
      event.entityType,
      event.entityId,
      { missingDataFieldsNotPenalized: Array.from(missingFieldsIgnored) },
      correlationId,
    );

    return {
      triggeredSignals,
      assessment,
      missingFieldsIgnored: Array.from(missingFieldsIgnored),
    };
  }

  public async recalculateEntityRiskAssessment(
    actor: AuthenticatedPrincipal,
    entityType: RiskEntityType,
    entityId: string,
    options?: {
      positiveMitigatingFactors?: string[];
      missingDataFieldsNotPenalized?: string[];
    },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<RiskAssessment> {
    this.assertRiskAdmin(actor);
    const entityKey = `${entityType}::${entityId}`;
    const entitySignals = Array.from(this.signals.values()).filter(
      (s) => s.entityType === entityType && s.entityId === entityId,
    );

    const scored = calculateExplainableRiskScore({
      signals: entitySignals,
      rulesMap: this.rules,
      policy: this.policy,
      positiveMitigatingFactors: options?.positiveMitigatingFactors,
      missingDataFields: options?.missingDataFieldsNotPenalized,
    });

    const requiresHumanReview =
      scored.score >= this.policy.humanReviewThresholdScore ||
      entitySignals.some((s) => s.status === 'ACTIVE' && s.requiresHumanReview);

    const now = new Date().toISOString();
    const prev = this.assessments.get(entityKey);
    const nextStatus: RiskAssessmentStatus = requiresHumanReview ? 'REVIEW_REQUIRED' : 'ASSESSED';

    const history = prev ? [...prev.transitionHistory] : [];
    history.push({
      fromStatus: prev ? prev.status : 'INITIAL',
      toStatus: nextStatus,
      changedByUid: actor.uid,
      reason: 'Automated explainable risk score calculation',
      timestamp: now,
    });

    const assessment: RiskAssessment = {
      assessmentId: prev?.assessmentId ?? `ras_${crypto.randomUUID()}`,
      entityType,
      entityId,
      score: scored.score,
      riskBand: scored.riskBand,
      confidence: scored.confidence,
      status: nextStatus,
      contributingSignals: scored.contributingSignals,
      positiveMitigatingFactors: options?.positiveMitigatingFactors ?? prev?.positiveMitigatingFactors ?? [],
      missingDataFieldsNotPenalized:
        options?.missingDataFieldsNotPenalized ?? prev?.missingDataFieldsNotPenalized ?? [],
      ruleVersionsUsed: scored.ruleVersionsUsed,
      calculatedAt: now,
      scoreVersion: 'emp71-score-v1.0',
      dataFreshnessSeconds: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      requiresHumanReview,
      linkedCaseId: prev?.linkedCaseId,
      assignedReviewerUid: prev?.assignedReviewerUid,
      transitionHistory: history,
    };

    if (requiresHumanReview && !assessment.linkedCaseId && this.deps.onSupportCaseRequested) {
      const supportCaseId = await this.deps.onSupportCaseRequested({
        assessmentId: assessment.assessmentId,
        entityType,
        entityId,
        category: 'FRAUD_RISK_INVESTIGATION',
        priority: scored.riskBand === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      });
      assessment.linkedCaseId = supportCaseId;
      const caseLink: RiskCaseLink = {
        riskCaseLinkId: `rcl_${crypto.randomUUID()}`,
        supportCaseId,
        assessmentId: assessment.assessmentId,
        entityType,
        entityId,
        investigationCategory: 'FRAUD_RISK_INVESTIGATION',
        priority: scored.riskBand === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        assignedTeam: 'risk_investigations',
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };
      this.caseLinks.set(caseLink.riskCaseLinkId, caseLink);
    }

    await runDurableTransaction(
      this.deps.txRunner,
      { operationName: 'risk.saveAssessment' },
      async (tx) => {
        writeDoc(tx, `risk_assessments/${assessment.assessmentId}`, assessment);
      },
    );

    this.assessments.set(entityKey, assessment);
    const snapshots = this.assessmentHistory.get(entityKey) ?? [];
    snapshots.push({ ...assessment });
    this.assessmentHistory.set(entityKey, snapshots);
    this.metrics.assessmentsCalculated++;

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'RISK_ASSESSMENT_CALCULATED',
        targetCollection: 'risk_assessments',
        targetResourceId: assessment.assessmentId,
        outcome: 'SUCCESS',
        metadata: {
          entityType,
          entityId,
          score: assessment.score,
          riskBand: assessment.riskBand,
          requiresHumanReview,
        },
      }),
    );

    if (this.deps.onRiskDomainEventPublished) {
      await this.deps.onRiskDomainEventPublished('risk.assessment.completed', {
        assessmentId: assessment.assessmentId,
        entityType,
        entityId,
        score: assessment.score,
        riskBand: assessment.riskBand,
        requiresHumanReview,
      });
    }

    return assessment;
  }

  public async recordHumanReviewDecision(
    actor: AuthenticatedPrincipal,
    input: {
      entityType: RiskEntityType;
      entityId: string;
      decisionOutcome: RiskDecision['decisionOutcome'];
      reason: string;
      evidenceIds?: string[];
      falsePositiveCategory?: FalsePositiveReasonCategory;
      suppressedSignalIds?: string[];
      highImpactCategory?: string;
      secondApproverUid?: string;
    },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<{ decision: RiskDecision; updatedAssessment: RiskAssessment }> {
    this.assertRiskAdmin(actor);
    const entityKey = `${input.entityType}::${input.entityId}`;
    const assessment = this.assessments.get(entityKey);
    if (!assessment) {
      throw new CoreApiError('NOT_FOUND', 404, 'Risk assessment not found for entity.');
    }

    // Separation of duties: high-impact decisions require a distinct second reviewer
    if (
      input.highImpactCategory &&
      this.policy.secondReviewerRequiredCategories.includes(input.highImpactCategory)
    ) {
      if (!input.secondApproverUid || input.secondApproverUid === actor.uid) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'DUAL_CONTROL_REQUIRED: High-impact risk decisions require a distinct second authorized reviewer.',
        );
      }
    }

    const prevStatus = assessment.status;
    let newStatus: RiskAssessmentStatus = 'RESOLVED';
    let ruleImprovementRef: string | undefined;

    if (input.decisionOutcome === 'CONFIRM_CONCERN') {
      newStatus = 'CONFIRMED_CONCERN';
    } else if (input.decisionOutcome === 'MARK_FALSE_POSITIVE') {
      newStatus = 'FALSE_POSITIVE';
      this.metrics.falsePositivesConfirmed++;
      const targetSigIds =
        input.suppressedSignalIds ?? assessment.contributingSignals.map((cs) => cs.signalId);
      for (const sigId of targetSigIds) {
        const sig = this.signals.get(sigId);
        if (sig) {
          sig.status = 'SUPPRESSED_FALSE_POSITIVE';
          this.signals.set(sigId, sig);
          this.suppressedSignatureKeys.add(sig.deduplicationKey);
          ruleImprovementRef = `rule_imp_${sig.ruleId}_v${sig.ruleVersion}`;
        }
      }
      await this.recalculateEntityRiskAssessment(actor, input.entityType, input.entityId, {}, correlationId);
    } else if (input.decisionOutcome === 'MARK_UNSUBSTANTIATED') {
      newStatus = 'UNSUBSTANTIATED';
    } else if (input.decisionOutcome === 'ESCALATE') {
      newStatus = 'UNDER_REVIEW';
    }

    const refreshed = this.assessments.get(entityKey)!;
    const now = new Date().toISOString();
    refreshed.status = newStatus;
    refreshed.transitionHistory.push({
      fromStatus: prevStatus,
      toStatus: newStatus,
      changedByUid: actor.uid,
      reason: input.reason,
      timestamp: now,
    });
    this.assessments.set(entityKey, refreshed);

    const decision: RiskDecision = {
      decisionId: `rdec_${crypto.randomUUID()}`,
      assessmentId: refreshed.assessmentId,
      entityType: input.entityType,
      entityId: input.entityId,
      reviewerUid: actor.uid,
      secondApproverUid: input.secondApproverUid,
      decisionOutcome: input.decisionOutcome,
      falsePositiveCategory: input.falsePositiveCategory,
      ruleImprovementRef,
      reason: input.reason,
      evidenceIds: input.evidenceIds ?? [],
      previousStatus: prevStatus,
      newStatus,
      decidedAt: now,
    };
    this.decisions.set(decision.decisionId, decision);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: `RISK_REVIEW_DECISION_${input.decisionOutcome}`,
        targetCollection: 'risk_decisions',
        targetResourceId: decision.decisionId,
        outcome: 'SUCCESS',
        metadata: {
          assessmentId: refreshed.assessmentId,
          previousStatus: prevStatus,
          newStatus,
          ruleImprovementRef,
        },
      }),
    );

    return { decision, updatedAssessment: refreshed };
  }

  public async executeProtectiveAction(
    actor: AuthenticatedPrincipal,
    input: {
      entityType: RiskEntityType;
      entityId: string;
      actionType: ProtectiveActionType;
      classification: ProtectiveActionClassification;
      reasonCode: string;
      idempotencyKey: string;
      isAutomatedTrigger: boolean;
      secondApproverUid?: string;
    },
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<RiskActionExecution> {
    this.assertRiskAdmin(actor);

    // Never allow automated irreversible actions or direct ledger/account destruction
    if (PROHIBITED_AUTOMATED_ACTIONS.has(input.actionType) || input.classification === 'IRREVERSIBLE') {
      this.metrics.actionsRejected++;
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `PROHIBITED_IRREVERSIBLE_RISK_ACTION: Action ${input.actionType} cannot be executed by the risk module.`,
      );
    }

    if (input.isAutomatedTrigger && input.classification === 'HIGH_IMPACT') {
      this.metrics.actionsRejected++;
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'HIGH_IMPACT_ACTION_REQUIRES_HUMAN_REVIEW: Automated scoring alone cannot execute high-impact restrictions.',
      );
    }

    const entityKey = `${input.entityType}::${input.entityId}`;
    const assessment = this.assessments.get(entityKey);
    const now = new Date().toISOString();

    const execution: RiskActionExecution = {
      actionId: `ract_${crypto.randomUUID()}`,
      assessmentId: assessment?.assessmentId ?? 'unlinked',
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: input.actionType,
      classification: input.classification,
      reasonCode: input.reasonCode,
      idempotencyKey: input.idempotencyKey,
      requestedByUid: actor.uid,
      secondApproverUid: input.secondApproverUid,
      isAutomatedTrigger: input.isAutomatedTrigger,
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      executedAt: now,
    };

    this.actions.set(execution.actionId, execution);
    this.metrics.actionsExecuted++;

    if (this.deps.onProtectiveActionDispatched) {
      await this.deps.onProtectiveActionDispatched(execution);
    }

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'RISK_PROTECTIVE_ACTION_EXECUTED',
        targetCollection: 'risk_actions',
        targetResourceId: execution.actionId,
        outcome: 'SUCCESS',
        metadata: { actionType: input.actionType, classification: input.classification },
      }),
    );

    return execution;
  }

  public checkCrossModuleOperationRiskGate(params: {
    requestingModule: string;
    operationType: 'HIGH_RISK_MUTATION' | 'LISTING_PUBLISH' | 'TRANSACTION_SETTLEMENT' | 'LOW_IMPACT_READ';
    entityType: RiskEntityType;
    entityId: string;
  }): RiskCheckGateResult {
    // Resilience requirement: NEVER treat an unavailable risk service as a confirmed safe result!
    if (this.serviceUnavailableSimulated) {
      return {
        checkStatus: 'RISK_CHECK_UNAVAILABLE',
        entityType: params.entityType,
        entityId: params.entityId,
        riskBand: 'UNKNOWN_UNAVAILABLE',
        confidence: 0,
        requiresAdditionalReview: true,
        fallbackPolicyApplied:
          params.operationType === 'LOW_IMPACT_READ'
            ? 'ALLOW_LOW_IMPACT_WITH_MONITORING'
            : 'HOLD_FOR_MANUAL_REVIEW',
        reasonCode: 'RISK_ENGINE_UNAVAILABLE_FAIL_SAFE_HOLD',
      };
    }

    const assessment = this.assessments.get(`${params.entityType}::${params.entityId}`);
    if (!assessment || assessment.status === 'FALSE_POSITIVE' || assessment.riskBand === 'MINIMAL' || assessment.riskBand === 'LOW') {
      return {
        checkStatus: 'RISK_CHECK_PASSED',
        entityType: params.entityType,
        entityId: params.entityId,
        riskBand: assessment?.riskBand ?? 'MINIMAL',
        confidence: assessment?.confidence ?? 0.9,
        requiresAdditionalReview: false,
        reasonCode: 'RISK_WITHIN_ACCEPTABLE_BOUNDS',
      };
    }

    if (assessment.status === 'CONFIRMED_CONCERN' || assessment.riskBand === 'CRITICAL') {
      return {
        checkStatus: 'RISK_CHECK_FAILED',
        entityType: params.entityType,
        entityId: params.entityId,
        riskBand: assessment.riskBand,
        confidence: assessment.confidence,
        requiresAdditionalReview: true,
        reasonCode: 'CRITICAL_OR_CONFIRMED_RISK_CONCERN',
      };
    }

    return {
      checkStatus: 'RISK_CHECK_REQUIRES_HUMAN_REVIEW',
      entityType: params.entityType,
      entityId: params.entityId,
      riskBand: assessment.riskBand,
      confidence: assessment.confidence,
      requiresAdditionalReview: true,
      reasonCode: 'ELEVATED_RISK_REQUIRES_MANUAL_REVIEW',
    };
  }

  public registerEntityRelationship(actor: AuthenticatedPrincipal, rel: Omit<RiskRelationship, 'relationshipId' | 'createdAt'>): RiskRelationship {
    this.assertRiskAdmin(actor);
    const record: RiskRelationship = {
      ...rel,
      relationshipId: `rel_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    this.relationships.set(record.relationshipId, record);
    return record;
  }

  public analyzeAssociations(actor: AuthenticatedPrincipal, entityType: RiskEntityType, entityId: string) {
    this.assertRiskAdmin(actor);
    return analyzeEntityAssociationsBounded({
      rootEntityType: entityType,
      rootEntityId: entityId,
      allRelationships: Array.from(this.relationships.values()),
    });
  }

  public detectStatisticalAnomaly(
    actor: AuthenticatedPrincipal,
    params: {
      observedValue: number;
      historicalSampleValues: number[];
      neighborhoodId: string;
      propertyCategory: string;
    },
  ) {
    this.assertRiskAdmin(actor);
    return evaluateNeighborhoodCategoryAnomaly(params);
  }

  public getAdminOverviewAndMetrics(actor: AuthenticatedPrincipal) {
    this.assertRiskAdmin(actor);
    const allAssessments = Array.from(this.assessments.values());
    return {
      totalActiveAssessments: allAssessments.length,
      highAndCriticalCount: allAssessments.filter((a) => a.riskBand === 'HIGH' || a.riskBand === 'CRITICAL').length,
      pendingReviewCount: allAssessments.filter((a) => a.status === 'REVIEW_REQUIRED' || a.status === 'UNDER_REVIEW').length,
      linkedInvestigationCasesCount: this.caseLinks.size,
      metrics: { ...this.metrics },
    };
  }
}
