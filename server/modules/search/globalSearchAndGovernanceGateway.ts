/**
 * Unified Express API Gateway for:
 * - Stage 27 & 30 (RT-UI-SEARCH-001): Global Search, Discovery, Saved Searches & Search History
 * - Stage 28 (RT-UI-DATA-GOV-001): Data Quality, Provenance, Source Registry & Claims Reconciliation
 * - Stage 29 (RT-UI-ANALYTICS-001): Data Platform, Metric Registry, Market/Neighborhood Analytics & Research Workspace
 * - Stage 31 (RT-UI-PERSONALIZATION-001): Personal Workspace, Saved Items & User Preferences
 */

import type { Express, Request, Response } from 'express';
import {
  defaultSearchEngine,
  validateUserPolygonGeometry,
} from '../../../src/features/search/services/searchOrchestratorEngine';
import { validateRawSearchQuery } from '../../../src/features/search/services/searchNormalizerAndPlanner';
import { defaultSearchWorkspaceService } from '../../../src/features/search/services/searchWorkspaceService';
import type { SearchScope, SearchSortOption } from '../../../src/features/search/models/search.types';
import { defaultDataGovernanceEngine } from '../../../src/features/data-governance/services/dataGovernanceEngine';
import { buildPublicProvenanceContract } from '../../../src/features/data-governance/services/claimsAndLineageService';
import {
  defaultAnalyticsPlatformEngine,
  OFFICIAL_METRIC_REGISTRY,
} from '../../../src/features/analytics/services/analyticsPlatformEngine';
import { defaultPersonalizationEngine } from '../../../src/features/account/services/personalizationAndPreferencesEngine';

const registeredApps = new WeakSet<Express>();

export function registerGlobalSearchGovernanceAndAnalyticsRoutes(
  app: Express,
  deps?: {
    checkRateLimit?: (ip: string, bucket: string, max: number, windowMs: number) => boolean;
    getClientIp?: (req: Request) => string;
  }
): void {
  if (registeredApps.has(app)) return;
  registeredApps.add(app);

  const getIp = deps?.getClientIp || ((req: Request) => req.ip || '127.0.0.1');
  const checkLimit = deps?.checkRateLimit || (() => true);

  // STAGE 27 & 30: GLOBAL SEARCH, DISCOVERY & SAVED SEARCHES
  app.get(['/api/v1/search', '/api/search'], (req: Request, res: Response) => {
    if (!checkLimit(getIp(req), 'v1-search', 90, 60_000)) {
      res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است.' });
      return;
    }
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const valid = validateRawSearchQuery(rawQuery);
    if (!valid.valid) {
      res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa });
      return;
    }
    const scope = (typeof req.query.scope === 'string' ? req.query.scope : 'ALL') as SearchScope;
    const sort = (typeof req.query.sort === 'string' ? req.query.sort : 'RELEVANCE') as SearchSortOption;
    const response = defaultSearchEngine.executeSearch({
      rawQuery,
      scope,
      sort,
      caller: { isAuthenticated: Boolean(req.headers.authorization) },
    });
    res.status(200).json(response);
  });

  app.post('/api/v1/search/query', (req: Request, res: Response) => {
    const body = req.body || {};
    const rawQuery = typeof body.q === 'string' ? body.q : '';
    const valid = validateRawSearchQuery(rawQuery);
    if (!valid.valid) {
      res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa });
      return;
    }
    if (body.filters?.polygon) {
      const geoValid = validateUserPolygonGeometry(body.filters.polygon);
      if (!geoValid.valid) {
        res.status(400).json({ errorCode: geoValid.errorCode, messageFa: geoValid.messageFa });
        return;
      }
    }
    const response = defaultSearchEngine.executeSearch({
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      rawQuery,
      scope: body.scope || 'ALL',
      explicitFilters: body.filters || {},
      sort: body.sort || 'RELEVANCE',
      caller: { isAuthenticated: Boolean(req.headers.authorization) },
    });
    res.status(200).json(response);
  });

  app.get(['/api/v1/search/suggest', '/api/search/suggestions'], (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.status(200).json({ suggestions: defaultSearchWorkspaceService.getAutocompleteSuggestions(q) });
  });

  app.get(['/api/v1/search/facets', '/api/search/filters'], (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const out = defaultSearchEngine.executeSearch({ rawQuery: q });
    res.status(200).json({ facets: out.facets, groupedCounts: out.groupedCounts });
  });

  app.get('/api/v1/search/recommendations', (req: Request, res: Response) => {
    const hood = typeof req.query.hood === 'string' ? req.query.hood : 'سعادت‌آباد';
    res.status(200).json({
      recommendations: defaultSearchWorkspaceService.getDiscoveryRecommendations(hood),
      privacy: defaultSearchWorkspaceService.getPrivacySettings(),
    });
  });

  app.get(['/api/v1/saved-searches', '/api/search/saved'], (_req: Request, res: Response) => {
    res.status(200).json({ items: defaultSearchWorkspaceService.getSavedSearches() });
  });

  app.post(['/api/v1/saved-searches', '/api/search/saved'], (req: Request, res: Response) => {
    const body = req.body || {};
    const created = defaultSearchWorkspaceService.createSavedSearch({
      titleFa: String(body.titleFa || body.query || 'جست‌وجوی ذخیره‌شده'),
      query: String(body.query || ''),
      scope: (body.scope || 'ALL') as SearchScope,
      filters: body.filters || {},
      alertFrequency: body.alertFrequency || 'OFF',
    });
    res.status(201).json({ item: created });
  });

  app.get('/api/v1/search-history', (_req: Request, res: Response) => {
    res.status(200).json({
      items: defaultSearchWorkspaceService.getSearchHistory(),
      privacy: defaultSearchWorkspaceService.getPrivacySettings(),
    });
  });

  app.delete('/api/v1/search-history', (_req: Request, res: Response) => {
    defaultSearchWorkspaceService.clearSearchHistory();
    res.status(200).json({ cleared: true });
  });

  app.get('/api/admin/search/overview', (_req: Request, res: Response) => {
    res.status(200).json(defaultSearchEngine.getAdminDiagnostics());
  });

  app.post('/api/admin/search/reindex', (req: Request, res: Response) => {
    const scope = (req.body?.scope || 'ALL') as SearchScope;
    res.status(200).json({ job: defaultSearchEngine.triggerReindex(scope) });
  });

  // STAGE 28: DATA GOVERNANCE, PROVENANCE, SOURCE REGISTRY & CLAIMS
  app.get('/api/v1/data-governance/sources', (_req: Request, res: Response) => {
    res.status(200).json({ sources: defaultDataGovernanceEngine.getSources() });
  });

  app.post('/api/v1/data-governance/sources', (req: Request, res: Response) => {
    const result = defaultDataGovernanceEngine.registerSource(req.body || {});
    res.status(result.ok ? 201 : 400).json(result);
  });

  app.get('/api/v1/data-governance/claims', (_req: Request, res: Response) => {
    res.status(200).json({
      claims: defaultDataGovernanceEngine.getClaims(),
      reconciliationCases: defaultDataGovernanceEngine.getReconciliationCases(),
    });
  });

  app.get('/api/v1/data-governance/lineage/:type/:id', (req: Request, res: Response) => {
    res.status(200).json({ entityId: req.params.id, edges: defaultDataGovernanceEngine.getLineageForEntity(String(req.params.id)) });
  });

  app.get('/api/v1/data-governance/versions/:type/:id', (req: Request, res: Response) => {
    res.status(200).json({ entityId: req.params.id, versions: defaultDataGovernanceEngine.getEntityVersions(String(req.params.id)) });
  });

  app.get('/api/v1/data-governance/provenance/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || 'saadat-abad');
    res.status(200).json(buildPublicProvenanceContract({ entityId: id, neighborhoodNameFa: id === 'punak' ? 'پونک' : 'سعادت‌آباد', sampleCount: 124, uniqueEntityCount: 98 }));
  });

  app.get('/api/v1/data-corrections', (_req: Request, res: Response) => {
    res.status(200).json({ proposals: defaultDataGovernanceEngine.getCorrectionProposals() });
  });

  app.post('/api/v1/data-governance/reconciliation/resolve', (req: Request, res: Response) => {
    const body = req.body || {};
    const out = defaultDataGovernanceEngine.resolveConflictCase({
      caseId: String(body.caseId || ''),
      reviewerId: String(body.reviewerId || 'reviewer-steward-1'),
      resolutionValue: body.resolutionValue,
      resolutionReasonFa: String(body.resolutionReasonFa || ''),
      isAutomatedAttempt: Boolean(body.isAutomatedAttempt),
    });
    res.status(out.ok ? 200 : 400).json(out);
  });

  // STAGE 29: ANALYTICS PLATFORM, METRIC REGISTRY & RESEARCH WORKSPACE
  app.get('/api/v1/analytics/metrics', (_req: Request, res: Response) => {
    res.status(200).json({ metrics: OFFICIAL_METRIC_REGISTRY });
  });

  app.get('/api/v1/analytics/metrics/:code', (req: Request, res: Response) => {
    const metric = OFFICIAL_METRIC_REGISTRY.find((m) => m.metricCode === req.params.code);
    if (!metric) {
      res.status(404).json({ errorFa: 'شاخص در Metric Registry یافت نشد.' });
      return;
    }
    res.status(200).json({ metric, snapshot: defaultAnalyticsPlatformEngine.getMetricSnapshotForPlace('saadat-abad', 142) });
  });

  app.get('/api/v1/analytics/market', (req: Request, res: Response) => {
    const placeId = typeof req.query.placeId === 'string' ? req.query.placeId : 'saadat-abad';
    res.status(200).json(defaultAnalyticsPlatformEngine.getOverviewBundle(placeId, 142));
  });

  app.get('/api/v1/analytics/neighborhoods/:id', (req: Request, res: Response) => {
    res.status(200).json(defaultAnalyticsPlatformEngine.getOverviewBundle(String(req.params.id || 'saadat-abad'), 142));
  });

  app.get('/api/v1/research/workspace', (_req: Request, res: Response) => {
    const bundle = defaultAnalyticsPlatformEngine.getOverviewBundle('saadat-abad', 142);
    res.status(200).json({
      savedAnalyses: bundle.savedAnalyses,
      modelRegistry: bundle.modelRegistry,
      metricsRegistry: bundle.metricsRegistry,
      placeDimensionsScd2: bundle.placeDimensionsScd2,
    });
  });

  // STAGE 31: PERSONAL WORKSPACE, SAVED ITEMS & USER PREFERENCES
  app.get(['/api/account/saved', '/api/v1/personalization/saved'], (req: Request, res: Response) => {
    const callerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : 'usr-current';
    const requestedOwner = typeof req.query.userId === 'string' ? req.query.userId : callerUserId;
    const out = defaultPersonalizationEngine.listSavedItems(callerUserId, requestedOwner);
    res.status(out.ok ? 200 : 403).json(out);
  });

  app.post(['/api/account/saved', '/api/v1/personalization/saved'], (req: Request, res: Response) => {
    const callerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : 'usr-current';
    const body = req.body || {};
    const created = defaultPersonalizationEngine.saveItem(callerUserId, {
      entityType: body.entityType || 'PROPERTY',
      entityId: String(body.entityId || 'prop-saadat-105'),
      titleFa: String(body.titleFa || 'مورد ذخیره‌شده'),
      subtitleFa: String(body.subtitleFa || ''),
      cityId: String(body.cityId || 'tehran'),
      targetLifecycleStatus: 'ACTIVE',
    });
    res.status(201).json({ item: created });
  });

  app.delete(['/api/account/saved/:id', '/api/v1/personalization/saved/:id'], (req: Request, res: Response) => {
    const callerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : 'usr-current';
    res.status(200).json(defaultPersonalizationEngine.removeSavedItemWithUndo(callerUserId, String(req.params.id)));
  });

  app.get(['/api/account/preferences', '/api/v1/personalization/preferences'], (req: Request, res: Response) => {
    const callerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : 'usr-current';
    res.status(200).json(defaultPersonalizationEngine.getPreferences(callerUserId));
  });

  app.patch(['/api/account/preferences', '/api/v1/personalization/preferences'], (req: Request, res: Response) => {
    const callerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : 'usr-current';
    res.status(200).json(defaultPersonalizationEngine.updatePreferences(callerUserId, req.body || {}));
  });
}
