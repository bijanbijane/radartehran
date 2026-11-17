/** @file tests/stage9-to-28-governance-intelligence.test.ts — Wave-1 Stages 9–28 Verification Suite */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_ISOLATION_MATRIX_10,
  RuntimeResilienceAndIncidentsService,
} from '../server/modules/platform-resilience/runtimeResilienceAndIncidents';
import { OpsCostAndReleaseGovernanceService } from '../server/modules/platform-resilience/opsCostAndReleaseGovernance';
import { EcosystemLegalGovernanceService } from '../server/modules/legal-regulatory/ecosystemLegalGovernance';
import { EcosystemCommercialEngine } from '../server/modules/marketplace-billing/ecosystemCommercialEngine';
import {
  ProductLifecycleGovernanceService,
  computeAdjustedRiceScore,
} from '../server/modules/platform-foundation/productLifecycleGovernance';
import {
  EngineeringScaleGovernanceService,
  evaluateSensitiveScopeAccess,
} from '../server/modules/platform-foundation/engineeringScaleGovernance';
import { PlatformIntelligenceEngine } from '../server/modules/analytics-research/platformIntelligenceEngine';
import {
  AutomationGovernanceEngine,
  computePayloadDigest,
} from '../server/modules/distributed-processing/automationGovernanceEngine';
import { IntegrationGatewayPilotService } from '../server/modules/api-governance/integrationGatewayPilot';
import {
  DataExchangeLifecycleService,
  evaluateDuplicateMatch,
} from '../server/modules/data-governance/dataExchangeLifecycle';
import { MarketAndUrbanIntelligenceService } from '../server/modules/market-intelligence/marketAndUrbanIntelligence';

test('Stages 9–14: 10-domain matrix, circuit degradation, honest NOT_MEASURED costs, release gates, sandbox load & rollback', async () => {
  assert.equal(FAILURE_ISOLATION_MATRIX_10.length, 10);
  const res = new RuntimeResilienceAndIncidentsService();
  assert.equal(res.getHealthTiers().overallTier, 'READY');
  for (let i = 0; i < 3; i++) res.recordDependencyFailure('trust-safety');
  assert.equal(res.getHealthTiers().overallTier, 'DEGRADED');
  assert.ok(res.getHealthTiers().openCircuits.includes('trust-safety'));

  const inc = res.openIncident({ severity: 'SEV-2', domainId: 'trust-safety', summaryFa: 'کندی صف بررسی' });
  assert.equal(inc.status, 'OPEN');
  assert.equal(res.resolveIncident(inc.id)?.status, 'RESOLVED');

  const ops = new OpsCostAndReleaseGovernanceService();
  const costModel = ops.getCostAndCapacityModel();
  assert.equal(costModel.status, 'INSUFFICIENT_PRODUCTION_DATA');
  assert.ok(costModel.costEntries.some((c) => c.status === 'COST_NOT_MEASURED'));

  const gates = ops.evaluateTenReleaseGates(true);
  assert.equal(gates.gates.length, 10);
  assert.equal(gates.overallStatus, 'PASS_WITH_LIMITATIONS');

  const sandbox = ops.runSandboxLoadCheck(20);
  assert.equal(sandbox.productionSlaVerified, false);
  assert.equal(sandbox.verdict, 'INSUFFICIENT_PRODUCTION_DATA');

  const rolled = ops.triggerRollbackLevel(3);
  assert.equal(rolled.rollbackLevel, 3);
  assert.equal(ops.getFeatureFlags().enableSocialV1Feed, false);

  const change = ops.recordAiChange({ riskTier: 'C2', actorType: 'ai_agent', summaryFa: 'افزودن تست مرحله ۹ تا ۱۴', touchedFilesCount: 1 });
  assert.equal(change.riskTier, 'C2');
});

test('Stages 17–22: Legal readiness, commercial gate NOT_VERIFIED, RICE blocker override & L0..L6 sensitive lock', () => {
  const legal = new EcosystemLegalGovernanceService();
  const readiness = legal.getLegalReadinessOverview();
  assert.equal(readiness.readinessStatus, 'LEGAL_READY_WITH_LIMITATIONS');
  assert.ok(readiness.regulatoryMatrix.some((r) => r.counselReviewRequired));

  legal.placeLegalHold('post_123', 'درخواست دادرسی موقت');
  assert.equal(legal.isUnderLegalHold('post_123'), true);

  const commercial = new EcosystemCommercialEngine();
  const crep = commercial.getCommercialReadinessReport();
  assert.equal(crep.commercialStatus, 'COMMERCIAL_READY_WITH_LIMITATIONS');
  assert.equal(crep.commercialEntryGate, 'NOT_VERIFIED');
  assert.equal(crep.liveBillingEnabled, false);
  assert.ok(crep.selectedMarketsCount <= crep.maxPilotMarketsConstraint);

  const blockedRice = computeAdjustedRiceScore({ reach: 100, impact: 3, confidencePct: 90, effortPersonWeeks: 1, securityOrLegalBlocker: true });
  assert.equal(blockedRice.riceScore, 0);
  assert.equal(blockedRice.overriddenByGate, true);

  const prod = new ProductLifecycleGovernanceService();
  assert.equal(prod.evaluateExperiment(50, 25).status, 'INCONCLUSIVE');
  assert.equal(prod.evaluateExperiment(400, 12).status, 'SIGNIFICANT_GAIN');

  const scale = new EngineeringScaleGovernanceService();
  const metrics = scale.getObservedRepositoryMetrics();
  assert.equal(metrics.architectureTopology, 'MODULAR_MONOLITH');
  assert.ok(metrics.observedTrackedLegacyFilesCount > 0);
  assert.equal(evaluateSensitiveScopeAccess('firestore.rules', 'L2').allowed, false);
  assert.equal(evaluateSensitiveScopeAccess('firestore.rules', 'L5').allowed, true);
});

test('Stage 23: Dual telemetry convergence, NOT_AVAILABLE when empty, alert dedupe & human-gated decisions', async () => {
  const intel = new PlatformIntelligenceEngine();
  const audit = intel.auditDualTelemetryPipelines();
  assert.equal(audit.v1IngestEndpoint, '/api/v1/telemetry/ingest');
  assert.equal(audit.v2DurabilityEndpoint, '/api/v2/telemetry/events');
  assert.equal(audit.piiScrubbed, true);

  const snap = await intel.getIntelligenceSnapshot();
  assert.equal(snap.healthScoreStatus, 'NOT_AVAILABLE');
  assert.equal(snap.healthScore0To100, null);
  assert.equal(snap.selfEvaluationStatus, 'NOT_MEASURED');

  const a1 = intel.raiseOrDeduplicateAlert({ priority: 'P1', dedupeKey: 'outbox-stall', titleFa: 'تاخیر صف', rootCauseStatus: 'PROBABLE' });
  const a2 = intel.raiseOrDeduplicateAlert({ priority: 'P0', dedupeKey: 'outbox-stall', titleFa: 'توقف صف', rootCauseStatus: 'PROVEN' });
  assert.equal(a1.id, a2.id);
  assert.equal(a2.correlatedCount, 2);

  const reviewed = intel.reviewDecisionSuggestion('dec_outbox_dlq_review', 'APPROVED', 'admin_1');
  assert.equal(reviewed?.status, 'APPROVED');
  assert.ok(reviewed?.reversalPlanFa);
});

test('Stage 24: Automation SHA-256 input-bound approval gate, tool permission check & Kill Switch', () => {
  const auto = new AutomationGovernanceEngine();
  assert.equal(auto.submitGovernedTask({
    agentId: 'agent-triage-ro',
    toolName: 'hide_post',
    riskClass: 'A4',
    payload: { postId: 'p1' },
    compensationPlanFa: 'unhide',
  }).code, 'TOOL_PERMISSION_DENIED');

  const payload = { postId: 'p_target', reason: 'spam' };
  const submitted = auto.submitGovernedTask({
    agentId: 'agent-policy-exec',
    toolName: 'hide_post',
    riskClass: 'A4',
    payload,
    compensationPlanFa: 'بازگردانی نمایش پست',
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.task?.state, 'AWAITING_APPROVAL');
  assert.equal(submitted.approvalRequired?.boundPayloadSha256, computePayloadDigest(payload));

  // Mutated payload after approval must be rejected
  const tampered = auto.executeApprovedTask({
    taskId: submitted.task!.id,
    approvalId: submitted.approvalRequired!.approvalId,
    currentPayload: { postId: 'p_OTHER', reason: 'spam' },
    executorUid: 'admin_1',
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.code, 'APPROVAL_PAYLOAD_HASH_MISMATCH');

  const validExec = auto.executeApprovedTask({
    taskId: submitted.task!.id,
    approvalId: submitted.approvalRequired!.approvalId,
    currentPayload: payload,
    executorUid: 'admin_1',
  });
  assert.equal(validExec.ok, true);
  assert.equal(validExec.task?.state, 'SUCCEEDED');

  auto.setKillSwitch(true, 'admin_sec');
  const blocked = auto.submitGovernedTask({
    agentId: 'agent-triage-ro',
    toolName: 'read_case',
    riskClass: 'A1',
    payload: {},
    compensationPlanFa: 'noop',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'AUTOMATION_KILL_SWITCH_ENGAGED');
});

test('Stages 26–28: SSRF gateway block, unlicensed ingest block, duplicate review & epistemic asking vs transaction price', () => {
  const gw = new IntegrationGatewayPilotService();
  assert.equal(gw.validateOutboundRequestContract({ providerId: 'mock-openmeteo-air', targetUrl: 'http://127.0.0.1:8080/internal' }).allowed, false);
  assert.equal(gw.listProvidersSanitized().every((p) => p.secretValueExposed === false), true);
  const pilot = gw.executeSandboxPilotCall('mock-openmeteo-air', '2026-11-17T08:00:00.000Z');
  assert.equal(pilot.ok, true);
  assert.ok(pilot.envelope?.retrievedAtIso);
  assert.equal(pilot.envelope?.observedAtIso, '2026-11-17T08:00:00.000Z');

  const dx = new DataExchangeLifecycleService();
  const blockedIngest = dx.ingestExternalFact({ sourceId: 'unlicensed-scrape-blocked', rawCityFa: 'تهران', rawAreaSqm: 85, rawPriceMillion: 8000 });
  assert.equal(blockedIngest.ok, false);
  const okIngest = dx.ingestExternalFact({ sourceId: 'licensed-municipal-open', rawCityFa: 'تهران', rawAreaSqm: 85, rawPriceMillion: 8500, observedAtIso: new Date().toISOString() });
  assert.equal(okIngest.ok, true);
  assert.ok(okIngest.fact?.provenanceHash);

  const dupCheck = evaluateDuplicateMatch({ neighborhoodFa: 'سعادت‌آباد', sqm: 90, floor: 2 }, { neighborhoodFa: 'سعادت آباد', sqm: 92, floor: 3 });
  assert.equal(dupCheck.verdict, 'REQUIRES_REVIEW');
  assert.equal(dupCheck.autoMergeAllowed, false);

  const conflict = dx.resolveFieldConflictPreservingHistory('buyPerSqm', 120, 125);
  assert.equal(conflict.overwrittenValue, 120);
  assert.equal(conflict.winningValue, 125);

  const mi = new MarketAndUrbanIntelligenceService();
  const hed = mi.evaluateResidentialWithHedonic({ neighborhoodId: 1, sqm: 95, buildYear: 1399, floor: 3 });
  assert.equal(hed.priceEvidenceKind, 'ASKING_PRICE');
  assert.equal(hed.transactionDataStatus, 'NOT_AVAILABLE');
  assert.ok(hed.valuation.hedonicTotalMillion > 0);
  assert.equal(mi.appendNonDestructiveHistorySnapshot('v1').version, 'v1');
});
