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
import { resolveCityParamOrReject } from '../../../src/utils/geo/cityGeospatialResolver';
import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';
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

  const resolveOptionalAuthUid = async (req: Request): Promise<string | null> => {
    if (!req.headers.authorization) return null;
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    return auth.authorized && auth.uid ? auth.uid : null;
  };

  app.get(['/api/v1/search', '/api/search'], async (req: Request, res: Response) => {
    try {
      if (!checkLimit(getIp(req), 'v1-search', 90, 60_000)) {
        res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است.' });
        return;
      }
      const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
      if (!cityCheck.ok) { res.status(400).json({ errorCode: cityCheck.code, messageFa: cityCheck.messageFa }); return; }
      const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
      const valid = validateRawSearchQuery(rawQuery);
      if (!valid.valid) { res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa }); return; }
      const scope = (typeof req.query.scope === 'string' ? req.query.scope : 'ALL') as SearchScope;
      const sort = (typeof req.query.sort === 'string' ? req.query.sort : 'RELEVANCE') as SearchSortOption;
      const verifiedUid = await resolveOptionalAuthUid(req);
      const explicitFilters = cityCheck.wasOmitted ? undefined : { cityId: cityCheck.cityId };
      const searchOut = defaultSearchEngine.executeSearch({ rawQuery, scope, sort, explicitFilters, caller: { isAuthenticated: Boolean(verifiedUid) } });
      res.status(200).json({ ...searchOut, cityId: cityCheck.wasOmitted ? undefined : cityCheck.cityId });
    } catch {
      if (!res.headersSent) res.status(500).json({ errorCode: 'SEARCH_FAILED', messageFa: 'خطا در اجرای جست‌وجو.' });
    }
  });

  app.post('/api/v1/search/query', async (req: Request, res: Response) => {
    try {
      if (!checkLimit(getIp(req), 'v1-search-query', 90, 60_000)) {
        res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های جست‌وجو بیش از حد مجاز است.' });
        return;
      }
      const body = req.body || {};
      const rawQuery = typeof body.q === 'string' ? body.q : '';
      const valid = validateRawSearchQuery(rawQuery);
      if (!valid.valid) { res.status(400).json({ errorCode: valid.errorCode, messageFa: valid.messageFa }); return; }
      const nextFilters = { ...(body.filters || {}) };
      if (nextFilters.cityId !== undefined && nextFilters.cityId !== null && String(nextFilters.cityId).trim() !== '') {
        const cityCheck = resolveCityParamOrReject(nextFilters.cityId);
        if (!cityCheck.ok) { res.status(400).json({ errorCode: cityCheck.code, messageFa: cityCheck.messageFa }); return; }
        nextFilters.cityId = cityCheck.cityId;
      }
      if (nextFilters.polygon) {
        const geoValid = validateUserPolygonGeometry(nextFilters.polygon);
        if (!geoValid.valid) { res.status(400).json({ errorCode: geoValid.errorCode, messageFa: geoValid.messageFa }); return; }
      }
      const verifiedUid = await resolveOptionalAuthUid(req);
      res.status(200).json(defaultSearchEngine.executeSearch({
        requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
        rawQuery, scope: body.scope || 'ALL', explicitFilters: nextFilters, sort: body.sort || 'RELEVANCE',
        caller: { isAuthenticated: Boolean(verifiedUid) },
      }));
    } catch {
      if (!res.headersSent) res.status(500).json({ errorCode: 'SEARCH_FAILED', messageFa: 'خطا در اجرای جست‌وجو.' });
    }
  });

  app.get(['/api/v1/search/suggest', '/api/search/suggestions'], async (req: Request, res: Response) => {
    try {
      if (!checkLimit(getIp(req), 'v1-search-suggest', 120, 60_000)) {
        res.status(429).json({ errorCode: 'RATE_LIMITED', messageFa: 'تعداد درخواست‌های تکمیل خودکار بیش از حد مجاز است.' });
        return;
      }
      const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
      if (!cityCheck.ok) { res.status(400).json({ errorCode: cityCheck.code, messageFa: cityCheck.messageFa }); return; }
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const verifiedUid = await resolveOptionalAuthUid(req);
      res.status(200).json({ cityId: cityCheck.cityId, suggestions: defaultSearchWorkspaceService.getAutocompleteSuggestions(q, cityCheck.cityId, verifiedUid) });
    } catch {
      if (!res.headersSent) res.status(500).json({ errorCode: 'SUGGEST_FAILED', messageFa: 'خطا در دریافت پیشنهادهای جست‌وجو.' });
    }
  });

  app.get(['/api/v1/search/facets', '/api/search/filters'], (req: Request, res: Response) => {
    const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) { res.status(400).json({ errorCode: cityCheck.code, messageFa: cityCheck.messageFa }); return; }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const out = defaultSearchEngine.executeSearch({ rawQuery: q, explicitFilters: cityCheck.wasOmitted ? undefined : { cityId: cityCheck.cityId } });
    res.status(200).json({ cityId: cityCheck.wasOmitted ? undefined : cityCheck.cityId, facets: out.facets, groupedCounts: out.groupedCounts });
  });

  app.get('/api/v1/search/recommendations', async (req: Request, res: Response) => {
    try {
      const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
      if (!cityCheck.ok) { res.status(400).json({ errorCode: cityCheck.code, messageFa: cityCheck.messageFa }); return; }
      const defaultHoodName = MULTI_CITY_CONFIGS[cityCheck.cityId]?.neighborhoods[0]?.name || 'سعادت‌آباد';
      const hood = typeof req.query.hood === 'string' && req.query.hood.trim() ? req.query.hood : defaultHoodName;
      const verifiedUid = await resolveOptionalAuthUid(req);
      res.status(200).json({
        cityId: cityCheck.cityId,
        recommendations: defaultSearchWorkspaceService.getDiscoveryRecommendations({ cityId: cityCheck.cityId, neighborhoodName: hood, userId: verifiedUid }),
        privacy: defaultSearchWorkspaceService.getPrivacySettings(),
      });
    } catch {
      if (!res.headersSent) res.status(500).json({ errorCode: 'RECOMMENDATIONS_FAILED', messageFa: 'خطا در دریافت پیشنهادها.' });
    }
  });

  app.get(['/api/v1/saved-searches', '/api/search/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({ items: defaultSearchWorkspaceService.getSavedSearches(auth.uid) });
  });

  app.post(['/api/v1/saved-searches', '/api/search/saved'], async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    const body = req.body || {};
    const created = defaultSearchWorkspaceService.createSavedSearch({
      userId: auth.uid,
      titleFa: String(body.titleFa || body.query || 'جست‌وجوی ذخیره‌شده'),
      query: String(body.query || ''), scope: (body.scope || 'ALL') as SearchScope,
      filters: body.filters || {}, alertFrequency: body.alertFrequency || 'OFF',
    });
    res.status(201).json({ item: created });
  });

  app.get('/api/v1/search-history', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    res.status(200).json({ items: defaultSearchWorkspaceService.getSearchHistory(auth.uid), privacy: defaultSearchWorkspaceService.getPrivacySettings() });
  });

  app.delete('/api/v1/search-history', async (req: Request, res: Response) => {
    const auth = await verifyAuthenticatedUserHeader(req.headers as Record<string, string | string[] | undefined>);
    if (!auth.authorized || !auth.uid) { res.status(401).json({ status: 'error', code: auth.reason }); return; }
    defaultSearchWorkspaceService.clearSearchHistory(auth.uid);
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
    const cityCheck = resolveCityParamOrReject(body.cityId, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) { res.status(400).json({ status: 'error', code: cityCheck.code, message: cityCheck.messageFa }); return; }
    const created = defaultPersonalizationEngine.saveItem(auth.uid, {
      entityType: body.entityType || 'PROPERTY',
      entityId: String(body.entityId || ''),
      titleFa: String(body.titleFa || 'مورد ذخیره‌شده'),
      subtitleFa: String(body.subtitleFa || ''),
      cityId: cityCheck.cityId,
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
