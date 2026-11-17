/** @file server/modules/analytics-research/platformIntelligenceEngine.ts — Stage 23 Unified Platform Intelligence & Decision Governance */
import crypto from 'node:crypto';
import { defaultPlatformTelemetryTaxonomy } from './platformTelemetryAndTaxonomy';
import { defaultRuntimeResilience } from '../platform-resilience/runtimeResilienceAndIncidents';
import { defaultSocialOutboxWorker } from '../notifications/socialOutboxWorker';

export type MetricGroupId = 'TECHNICAL' | 'PRODUCT' | 'SOCIAL' | 'ECONOMIC' | 'TRUST_SAFETY' | 'AI_AUTOMATION' | 'ECOSYSTEM';
export type RootCauseConfidence = 'PROVEN' | 'PROBABLE' | 'UNKNOWN';
export type AlertPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface UnifiedMetricDescriptor {
  code: string;
  group: MetricGroupId;
  value: number | null;
  status: 'OBSERVED' | 'NOT_AVAILABLE' | 'NOT_MEASURED';
  sourceEndpoint: string;
  epistemicTag: '[Observed Fact]' | '[Unknown]';
}

export interface CorrelatedAlertItem {
  id: string;
  priority: AlertPriority;
  dedupeKey: string;
  titleFa: string;
  rootCauseStatus: RootCauseConfidence;
  correlatedCount: number;
  createdAtIso: string;
}

export interface DecisionSuggestionItem {
  id: string;
  titleFa: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresHumanApproval: true;
  approvedByUid: string | null;
  status: 'PENDING_HUMAN_REVIEW' | 'APPROVED' | 'REJECTED';
  reversalPlanFa: string;
}

export class PlatformIntelligenceEngine {
  private readonly alerts: CorrelatedAlertItem[] = [];
  private readonly suggestions: DecisionSuggestionItem[] = [
    {
      id: 'dec_outbox_dlq_review',
      titleFa: 'بازبینی دستی رویدادهای DLQ و بررسی سلامت فرستنده اعلان',
      riskTier: 'MEDIUM',
      requiresHumanApproval: true,
      approvedByUid: null,
      status: 'PENDING_HUMAN_REVIEW',
      reversalPlanFa: 'توقف بازپخش و برگرداندن رویداد به DEAD_LETTER با دستور Kill Switch.',
    },
  ];

  auditDualTelemetryPipelines() {
    return {
      v1IngestEndpoint: '/api/v1/telemetry/ingest',
      v2DurabilityEndpoint: '/api/v2/telemetry/events',
      governanceOwner: 'platformTelemetryAndTaxonomy.ts + telemetryRoutes.ts',
      conflictStatus: 'CONVERGED_READONLY_VIEW',
      piiScrubbed: true,
    };
  }

  raiseOrDeduplicateAlert(params: {
    priority: AlertPriority;
    dedupeKey: string;
    titleFa: string;
    rootCauseStatus: RootCauseConfidence;
  }): CorrelatedAlertItem {
    const existing = this.alerts.find((a) => a.dedupeKey === params.dedupeKey);
    if (existing) {
      existing.correlatedCount += 1;
      existing.priority = params.priority;
      return existing;
    }
    const created: CorrelatedAlertItem = {
      id: `alt_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      priority: params.priority,
      dedupeKey: params.dedupeKey,
      titleFa: params.titleFa.slice(0, 180),
      rootCauseStatus: params.rootCauseStatus,
      correlatedCount: 1,
      createdAtIso: new Date().toISOString(),
    };
    this.alerts.unshift(created);
    return created;
  }

  async getIntelligenceSnapshot() {
    const telemetryRollup = defaultPlatformTelemetryTaxonomy.getKAnonymousRollup();
    const health = defaultRuntimeResilience.getHealthTiers();
    const outboxMetrics = await defaultSocialOutboxWorker.getZeroPiiMetrics();

    const missingTelemetry = telemetryRollup.totalIngestedEvents === 0;
    const compositeHealthScoreStatus = missingTelemetry ? 'NOT_AVAILABLE' : 'COMPUTED';
    const compositeHealthScore = missingTelemetry
      ? null
      : Math.max(0, 100 - health.openCircuits.length * 15 - health.openIncidentsCount * 20 - outboxMetrics.deadLetterCount * 5);

    const metricsCatalog: UnifiedMetricDescriptor[] = [
      { code: 'tech.open_circuits', group: 'TECHNICAL', value: health.openCircuits.length, status: 'OBSERVED', sourceEndpoint: '/api/v1/intelligence/overview', epistemicTag: '[Observed Fact]' },
      { code: 'product.telemetry_events', group: 'PRODUCT', value: telemetryRollup.totalIngestedEvents, status: telemetryRollup.totalIngestedEvents > 0 ? 'OBSERVED' : 'NOT_MEASURED', sourceEndpoint: '/api/v1/telemetry/ingest', epistemicTag: telemetryRollup.totalIngestedEvents > 0 ? '[Observed Fact]' : '[Unknown]' },
      { code: 'social.outbox_delivered', group: 'SOCIAL', value: outboxMetrics.deliveredCount, status: 'OBSERVED', sourceEndpoint: '/api/v1/social/outbox/metrics', epistemicTag: '[Observed Fact]' },
      { code: 'economic.verified_wtp', group: 'ECONOMIC', value: null, status: 'NOT_MEASURED', sourceEndpoint: '/api/v1/governance/commercial', epistemicTag: '[Unknown]' },
      { code: 'trust.open_incidents', group: 'TRUST_SAFETY', value: health.openIncidentsCount, status: 'OBSERVED', sourceEndpoint: '/api/v1/trust-safety/cases', epistemicTag: '[Observed Fact]' },
      { code: 'ai.automation_token_cost_usd', group: 'AI_AUTOMATION', value: null, status: 'NOT_MEASURED', sourceEndpoint: '/api/v1/automation/status', epistemicTag: '[Unknown]' },
      { code: 'ecosystem.verified_partners', group: 'ECOSYSTEM', value: null, status: 'NOT_MEASURED', sourceEndpoint: '/api/v1/gateway/providers', epistemicTag: '[Unknown]' },
    ];

    return {
      telemetryAudit: this.auditDualTelemetryPipelines(),
      healthScoreStatus: compositeHealthScoreStatus,
      healthScore0To100: compositeHealthScore,
      independentCriticalAlerts: this.alerts.filter((a) => a.priority === 'P0' || a.priority === 'P1'),
      allCorrelatedAlerts: this.alerts,
      metricsCatalog,
      decisionSuggestions: this.suggestions,
      selfEvaluationStatus: 'NOT_MEASURED',
    };
  }

  reviewDecisionSuggestion(decisionId: string, decision: 'APPROVED' | 'REJECTED', reviewerUid: string): DecisionSuggestionItem | null {
    const item = this.suggestions.find((s) => s.id === decisionId);
    if (!item) return null;
    item.status = decision;
    item.approvedByUid = reviewerUid;
    return item;
  }
}

export const defaultPlatformIntelligence = new PlatformIntelligenceEngine();
