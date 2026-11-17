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
import { defaultPersonalizationEngine } from '../../../src/features/account/services/personalizationAndPreferencesEngine';
import {
  verifyAdminApiAuthorization,
  verifyAuthenticatedUserHeader,
} from '../../../src/utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { registerDataGovernanceRoutes } from '../data-governance/dgovRoutes';
import { registerAnalyticsResearchRoutes } from '../analytics-research/analyticsRoutes';

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

  app.get(['/api/v1/search', '/api/search'], (req: Request, res: Response) => {
    if (!checkLimit(getIp(req), 'v1-search', 90, 60_000)) {
      res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است.' });
      return;
    }
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const valid = validateRawSearchQuery(rawQuery);
    if (!valid.valid) { res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa }); return; }
    const scope = (typeof req.query.scope === 'string' ? req.query.scope : 'ALL') as SearchScope;
    const sort = (typeof req.query.sort === 'string' ? req.query.sort : 'RELEVANCE') as SearchSortOption;
    res.status(200).json(defaultSearchEngine.executeSearch({ rawQuery, scope, sort, caller: { isAuthenticated: Boolean(req.headers.authorization) } }));
  });

  app.post('/api/v1/search/query', (req: Request, res: Response) => {
    if (!checkLimit(getIp(req), 'v1-search-query', 90, 60_000)) {
      res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است.' });
      return;
    }
    const body = req.body || {};
    const rawQuery = typeof body.q === 'string' ? body.q : '';
    const valid = validateRawSearchQuery(rawQuery);
    if (!valid.valid) { res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa }); return; }
    if (body.filters?.polygon) {
      const geoValid = validateUserPolygonGeometry(body.filters.polygon);
      if (!geoValid.valid) { res.status(400).json({ errorCode: geoValid.errorCode, messageFa: geoValid.messageFa }); return; }
    }
    res.status(200).json(defaultSearchEngine.executeSearch({
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      rawQuery, scope: body.scope || 'ALL', explicitFilters: body.filters || {}, sort: body.sort || 'RELEVANCE',
      caller: { isAuthenticated: Boolean(req.headers.authorization) },
    }));
  });

  app.get(['/api/v1/search/suggest', '/api/search/suggestions'], (req: Request, res: Response) => {
    if (!checkLimit(getIp(req), 'v1-search-suggest', 120, 60_000)) {
      res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های تکمیل خودکار بیش از حد مجاز است.' });
      return;
    }
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

  app.get(['/api/v1/saved-searches', '/api/search/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({ items: defaultSearchWorkspaceService.getSavedSearches() });
  });

  app.post(['/api/v1/saved-searches', '/api/search/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    const body = req.body || {};
    const created = defaultSearchWorkspaceService.createSavedSearch({
      titleFa: String(body.titleFa || body.query || 'جست‌وجوی ذخیره‌شده'),
      query: String(body.query || ''), scope: (body.scope || 'ALL') as SearchScope,
      filters: body.filters || {}, alertFrequency: body.alertFrequency || 'OFF',
    });
    res.status(201).json({ item: created });
  });

  app.get('/api/v1/search-history', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({ items: defaultSearchWorkspaceService.getSearchHistory(), privacy: defaultSearchWorkspaceService.getPrivacySettings() });
  });

  app.delete('/api/v1/search-history', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    defaultSearchWorkspaceService.clearSearchHistory();
    res.status(200).json({ cleared: true });
  });

  app.get('/api/admin/search/overview', async (req: Request, res: Response) => {
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { recordAbuseSignal(getIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json(defaultSearchEngine.getAdminDiagnostics());
  });

  app.post('/api/admin/search/reindex', async (req: Request, res: Response) => {
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized) { res.status(auth.statusCode).json({ status: 'error', code: auth.reason }); return; }
    const scope = (req.body?.scope || 'ALL') as SearchScope;
    res.status(200).json({ job: defaultSearchEngine.triggerReindex(scope) });
  });

  registerDataGovernanceRoutes(app, { getIp });
  registerAnalyticsResearchRoutes(app, { getIp });

  app.get(['/api/account/saved', '/api/v1/personalization/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    const requestedOwner = typeof req.query.userId === 'string' ? req.query.userId : auth.uid;
    const out = defaultPersonalizationEngine.listSavedItems(auth.uid, requestedOwner);
    res.status(out.ok ? 200 : 403).json(out);
  });

  app.post(['/api/account/saved', '/api/v1/personalization/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    const body = req.body || {};
    const created = defaultPersonalizationEngine.saveItem(auth.uid, {
      entityType: body.entityType || 'PROPERTY',
      entityId: String(body.entityId || ''),
      titleFa: String(body.titleFa || 'مورد ذخیره‌شده'),
      subtitleFa: String(body.subtitleFa || ''),
      cityId: String(body.cityId || 'tehran'),
      targetLifecycleStatus: 'ACTIVE',
    });
    res.status(201).json({ item: created });
  });

  app.delete(['/api/account/saved/:id', '/api/v1/personalization/saved/:id'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json(defaultPersonalizationEngine.removeSavedItemWithUndo(auth.uid, String(req.params.id)));
  });

  app.get(['/api/account/preferences', '/api/v1/personalization/preferences'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json(defaultPersonalizationEngine.getPreferences(auth.uid));
  });

  app.patch(['/api/account/preferences', '/api/v1/personalization/preferences'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json(defaultPersonalizationEngine.updatePreferences(auth.uid, req.body || {}));
  });
}
