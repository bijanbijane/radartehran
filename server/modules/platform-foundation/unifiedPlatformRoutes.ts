/** @file server/modules/platform-foundation/unifiedPlatformRoutes.ts — Stages 6–28 Fail-Closed Unified Wave-1 & Ecosystem API Router */
import type { Express, Request, Response } from 'express';
import {
  verifyAdminApiAuthorization,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { defaultSocialOutboxWorker } from '../notifications/socialOutboxWorker';
import { defaultSocialDiscoveryAndFeed } from '../search/socialDiscoveryAndFeed';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import { defaultPlatformTelemetryTaxonomy } from '../analytics-research/platformTelemetryAndTaxonomy';
import { defaultRuntimeResilience, FAILURE_ISOLATION_MATRIX_10 } from '../platform-resilience/runtimeResilienceAndIncidents';
import { defaultOpsCostAndReleaseGovernance } from '../platform-resilience/opsCostAndReleaseGovernance';
import { defaultEcosystemLegalGovernance } from '../legal-regulatory/ecosystemLegalGovernance';
import { defaultEcosystemCommercialEngine } from '../marketplace-billing/ecosystemCommercialEngine';
import { defaultProductLifecycleGovernance } from './productLifecycleGovernance';
import { defaultEngineeringScaleGovernance, evaluateSensitiveScopeAccess } from './engineeringScaleGovernance';
import { defaultPlatformIntelligence } from '../analytics-research/platformIntelligenceEngine';
import { defaultAutomationGovernance } from '../distributed-processing/automationGovernanceEngine';
import { defaultIntegrationGatewayPilot } from '../api-governance/integrationGatewayPilot';
import { defaultDataExchangeLifecycle } from '../data-governance/dataExchangeLifecycle';
import { defaultMarketAndUrbanIntelligence } from '../market-intelligence/marketAndUrbanIntelligence';

export interface UnifiedPlatformRouteDeps {
  checkRateLimit?: (ip: string, bucket: 'general', max: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const mountedApps = new WeakSet<Express>();

export function registerUnifiedPlatformWave1Routes(app: Express, deps?: UnifiedPlatformRouteDeps): void {
  if (mountedApps.has(app)) return;
  mountedApps.add(app);

  const getIp = deps?.getClientIp ?? ((req: Request) => req.ip || '127.0.0.1');
  const allowRate = deps?.checkRateLimit ?? (() => true);

  function handleSocialFeedRouteError(res: Response, err: unknown): void {
    if (err instanceof CommunityHttpError) {
      res.status(err.statusCode).json({
        status: 'error',
        code: err.code,
        message: err.messageFa,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    if (err instanceof CommunityDatabaseUnavailableError) {
      res.status(503).json({
        status: 'error',
        code: err.code,
        message: err.message,
      });
      return;
    }
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'خطای داخلی سرور در پردازش درخواست فید اجتماعی.',
    });
  }

  async function requireAdmin(req: Request, res: Response): Promise<{ ok: true; uid: string } | { ok: false }> {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>, process.env, {
      disallowStaticToken: true,
    });
    if (!auth.authorized || !auth.uid) {
      recordAbuseSignal(getIp(req), 'auth_failure');
      res.status(auth.statusCode || 403).json({ status: 'error', code: auth.reason || 'FORBIDDEN' });
      return { ok: false };
    }
    return { ok: true, uid: auth.uid };
  }

  // Stage 6: Social Outbox & DLQ Replay
  app.get('/api/v1/social/outbox/metrics', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', metrics: await defaultSocialOutboxWorker.getZeroPiiMetrics() });
  });
  app.post('/api/v1/social/outbox/:id/replay', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const item = await defaultSocialOutboxWorker.replayDeadLetter(String(req.params.id), a.uid);
    res.status(200).json({ status: 'ok', item });
  });

  // Stage 7: Social Search & Feeds (RT-SOCIAL-IMPL-007 hardened)
  app.get('/api/v1/social/search', async (req, res) => {
    try {
      const ip = getIp(req);
      if (!allowRate(ip, 'general', 90, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMITED' });
        return;
      }
      await communityUnifiedRepository.enforceRateLimit('read', `ip:${ip}`);
      const rawHood = req.query.neighborhoodId;
      const neighborhoodId =
        rawHood !== undefined && rawHood !== '' ? Number(rawHood) : undefined;
      if (
        neighborhoodId !== undefined &&
        (!Number.isInteger(neighborhoodId) || neighborhoodId < 1)
      ) {
        throw new CommunityHttpError(400, 'INVALID_NEIGHBORHOOD_ID', 'شناسه محله نامعتبر است.');
      }
      const rawLimit = req.query.limit;
      const limit = rawLimit !== undefined && rawLimit !== '' ? Number(rawLimit) : undefined;
      const out = await defaultSocialDiscoveryAndFeed.searchSocial({
        q: typeof req.query.q === 'string' ? req.query.q : '',
        neighborhoodId,
        limit,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleSocialFeedRouteError(res, err);
    }
  });

  app.get('/api/v1/social/feed/discover', async (req, res) => {
    try {
      const ip = getIp(req);
      if (!allowRate(ip, 'general', 90, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMITED' });
        return;
      }
      await communityUnifiedRepository.enforceRateLimit('read', `ip:${ip}`);
      const rawLimit = req.query.limit;
      const limit = rawLimit !== undefined && rawLimit !== '' ? Number(rawLimit) : undefined;
      const out = await defaultSocialDiscoveryAndFeed.getDiscoverFeed({
        limit,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleSocialFeedRouteError(res, err);
    }
  });

  app.get('/api/v1/social/feed/neighborhood/:hoodId', async (req, res) => {
    try {
      const ip = getIp(req);
      if (!allowRate(ip, 'general', 90, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMITED' });
        return;
      }
      await communityUnifiedRepository.enforceRateLimit('read', `ip:${ip}`);
      const hoodId = Number(req.params.hoodId);
      if (!Number.isInteger(hoodId) || hoodId < 1) {
        throw new CommunityHttpError(400, 'INVALID_NEIGHBORHOOD_ID', 'شناسه محله نامعتبر است.');
      }
      const rawLimit = req.query.limit;
      const limit = rawLimit !== undefined && rawLimit !== '' ? Number(rawLimit) : undefined;
      const out = await defaultSocialDiscoveryAndFeed.getNeighborhoodFeed(hoodId, {
        limit,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleSocialFeedRouteError(res, err);
    }
  });

  app.get('/api/v1/social/feed/following', async (req, res) => {
    try {
      const auth = await verifyAuthenticatedUserHeader(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!auth.authorized || !auth.uid) {
        res.status(401).json({ status: 'error', code: auth.reason || 'UNAUTHORIZED' });
        return;
      }
      const ip = getIp(req);
      if (!allowRate(ip, 'general', 90, 60_000)) {
        res.status(429).json({ status: 'error', code: 'RATE_LIMITED' });
        return;
      }
      await communityUnifiedRepository.enforceRateLimit('read', auth.uid);
      const rawLimit = req.query.limit;
      const limit = rawLimit !== undefined && rawLimit !== '' ? Number(rawLimit) : undefined;
      const out = await defaultSocialDiscoveryAndFeed.getFollowingFeed(auth.uid, {
        limit,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleSocialFeedRouteError(res, err);
    }
  });

  app.post('/api/v1/social/search/rebuild', async (req, res) => {
    try {
      const a = await requireAdmin(req, res);
      if (!a.ok) return;
      const batchSize =
        typeof req.body?.batchSize === 'number' ? req.body.batchSize : undefined;
      const resumeJobId =
        typeof req.body?.resumeJobId === 'string' ? req.body.resumeJobId : undefined;
      const out = await defaultSocialDiscoveryAndFeed.rebuildDerivedIndex(a.uid, {
        batchSize,
        resumeJobId,
      });
      res.status(200).json({ status: 'ok', ...out });
    } catch (err) {
      handleSocialFeedRouteError(res, err);
    }
  });

  // Stage 8: Taxonomy Telemetry & Rollups
  app.post('/api/v1/governance/telemetry', (req, res) => {
    if (!allowRate(getIp(req), 'general', 120, 60_000)) { res.status(429).json({ status: 'error', code: 'RATE_LIMITED' }); return; }
    const out = defaultPlatformTelemetryTaxonomy.ingestEvent({
      eventCode: String(req.body?.eventCode || ''),
      sessionHint: String(req.body?.sessionHint || getIp(req)),
      neighborhoodId: typeof req.body?.neighborhoodId === 'number' ? req.body.neighborhoodId : undefined,
      engagementScore: typeof req.body?.engagementScore === 'number' ? req.body.engagementScore : undefined,
      label: typeof req.body?.label === 'string' ? req.body.label : undefined,
    });
    res.status(out.accepted ? 202 : 400).json(out);
  });

  // Stages 9-14 + 17-22: Unified Governance Read & Controls
  app.get('/api/v1/governance/overview', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({
      status: 'ok',
      resilience: { ...defaultRuntimeResilience.getHealthTiers(), isolationMatrix: FAILURE_ISOLATION_MATRIX_10, incidents: defaultRuntimeResilience.listIncidents() },
      opsCostRelease: {
        ...defaultOpsCostAndReleaseGovernance.getCostAndCapacityModel(),
        releaseGates: defaultOpsCostAndReleaseGovernance.evaluateTenReleaseGates(),
        featureFlags: defaultOpsCostAndReleaseGovernance.getFeatureFlags(),
        rollout: defaultOpsCostAndReleaseGovernance.getRolloutAndRollbackState(),
      },
      legal: defaultEcosystemLegalGovernance.getLegalReadinessOverview(),
      commercial: defaultEcosystemCommercialEngine.getCommercialReadinessReport(),
      productLifecycle: defaultProductLifecycleGovernance.getProductGovernanceOverview(),
      engineeringScale: defaultEngineeringScaleGovernance.getObservedRepositoryMetrics(),
    });
  });

  app.post('/api/v1/governance/resilience/consistency', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', report: await defaultRuntimeResilience.verifyCrossDomainConsistency() });
  });
  app.post('/api/v1/governance/rollout/rollback', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const lvl = req.body?.level === 3 ? 3 : req.body?.level === 2 ? 2 : 1;
    res.status(200).json({ status: 'ok', rollout: defaultOpsCostAndReleaseGovernance.triggerRollbackLevel(lvl) });
  });
  app.post('/api/v1/governance/engineering/scope-check', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json(evaluateSensitiveScopeAccess(String(req.body?.targetPath || ''), req.body?.agentLevel || 'L2'));
  });

  // Stage 23: Platform Intelligence
  app.get('/api/v1/intelligence/overview', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', ...(await defaultPlatformIntelligence.getIntelligenceSnapshot()) });
  });
  app.post('/api/v1/intelligence/decisions/:id/review', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const dec = req.body?.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const updated = defaultPlatformIntelligence.reviewDecisionSuggestion(String(req.params.id), dec, a.uid);
    if (!updated) { res.status(404).json({ status: 'error', code: 'NOT_FOUND' }); return; }
    res.status(200).json({ status: 'ok', suggestion: updated });
  });

  // Stage 24: Automation & AI Agent Governance
  app.get('/api/v1/automation/status', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', ...defaultAutomationGovernance.getGovernanceOverview() });
  });
  app.post('/api/v1/automation/kill-switch', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', ...defaultAutomationGovernance.setKillSwitch(Boolean(req.body?.engaged), a.uid) });
  });
  app.post('/api/v1/automation/tasks', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const out = defaultAutomationGovernance.submitGovernedTask({
      agentId: String(req.body?.agentId || 'agent-triage-ro'),
      toolName: String(req.body?.toolName || 'read_case'),
      riskClass: req.body?.riskClass || 'A1',
      payload: typeof req.body?.payload === 'object' && req.body.payload ? req.body.payload : {},
      compensationPlanFa: String(req.body?.compensationPlanFa || 'بازگشت خودکار به وضعیت پیشین'),
    });
    res.status(out.ok ? 201 : 400).json(out);
  });

  // Stage 26: Integration Gateway Pilot
  app.get('/api/v1/gateway/providers', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', providers: defaultIntegrationGatewayPilot.listProvidersSanitized() });
  });
  app.post('/api/v1/gateway/sandbox-pilot/:providerId', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const out = defaultIntegrationGatewayPilot.executeSandboxPilotCall(String(req.params.providerId));
    res.status(out.ok ? 200 : 400).json(out);
  });

  // Stage 27: Data Exchange Lifecycle
  app.get('/api/v1/data-exchange/overview', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({ status: 'ok', ...defaultDataExchangeLifecycle.getDataExchangeOverview() });
  });
  app.post('/api/v1/data-exchange/ingest', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    const out = defaultDataExchangeLifecycle.ingestExternalFact({
      sourceId: String(req.body?.sourceId || ''),
      rawCityFa: String(req.body?.rawCityFa || 'تهران'),
      rawAreaSqm: Number(req.body?.rawAreaSqm || 85),
      rawPriceMillion: Number(req.body?.rawPriceMillion || 8500),
      observedAtIso: typeof req.body?.observedAtIso === 'string' ? req.body.observedAtIso : new Date().toISOString(),
    });
    res.status(out.ok ? 201 : 403).json(out);
  });

  // Stage 28: Real Estate & Urban Intelligence
  app.get('/api/v1/market-intelligence/overview', async (req, res) => {
    const a = await requireAdmin(req, res);
    if (!a.ok) return;
    res.status(200).json({
      status: 'ok',
      ...defaultMarketAndUrbanIntelligence.getSpatialClustersAndTrends(),
      sampleHedonicCheck: defaultMarketAndUrbanIntelligence.evaluateResidentialWithHedonic({
        neighborhoodId: 1,
        sqm: 90,
        buildYear: 1398,
        floor: 3,
      }),
    });
  });
}
