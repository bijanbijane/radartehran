/**
 * @file src/cells/socioeconomic-intelligence/socioeconomicRoutes.ts
 * @description Stage 2.2 — Express REST Routes for Socioeconomic Intelligence & Valuation Seal
 * Registers:
 * - GET  /api/v1/reference/hood/:hoodId/rollup
 * - POST /api/v1/valuation/verify-seal
 * - POST /api/admin/rollups/trigger
 */
import type { Express, Request, Response } from 'express';
import type { HedonicRenovationStatus } from '../../data/hedonicPricingEngine';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { resolveCityIdForNeighborhood } from '../../data/multiCityData';
import { sanitizeInput } from '../../utils/security';
import { resolveCityParamOrReject, validateCityNeighborhoodOwnership } from '../../utils/geo/cityGeospatialResolver';
import {
  computeServerValuationSeal,
  type RawPriceObservation,
} from '../valuation-authority/robustValuationEngine';
import { buildNeighborhoodEpistemicDossier } from '../decision-epistemology/epistemicDecisionEngine';
import { synthesizeExecutiveDecisionReport } from '../decision-epistemology/unifiedDecisionSynthesisEngine';
import { verifyAdminApiAuthorization } from '../../utils/serverAdminAndTelegramSecurity';
import { recordAbuseSignal } from '../../utils/serverDeliveryAndAbuseGuard';
import {
  aggregateNeighborhoodResearchRollup,
  getDefaultRollupPeriodKey,
  getOrBuildNeighborhoodRollup,
} from './socioeconomicRollupEngine';
import type { ResearchBehavioralEvent } from './socioeconomicTypes';

export interface SocioeconomicRouteSecurityOptions {
  verifyAdminAuth?: (req: Request) => Promise<{ ok: boolean; status: number; message: string }>;
  checkRateLimit?: (ip: string, bucket: 'general' | 'sync', maxRequests: number, windowMs: number) => boolean;
  getClientIp?: (req: Request) => string;
}

const registeredSocioeconomicApps = new WeakSet<Express>();

export function registerSocioeconomicRoutes(
  app: Express,
  options?: SocioeconomicRouteSecurityOptions,
): void {
  if (registeredSocioeconomicApps.has(app)) return;
  registeredSocioeconomicApps.add(app);
  const clientIp = (req: Request): string =>
    options?.getClientIp ? options.getClientIp(req) : req.ip || '127.0.0.1';
  const applySecurityHeaders = (res: Response): void => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  };

  // 1. GET /api/v1/reference/hood/:hoodId/rollup — Retrieve neighborhood research dossier, MAD reference price & CASPER epistemic dossier
  app.get('/api/v1/reference/hood/:hoodId/rollup', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 60, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    try {
      const hoodId = Math.trunc(Number(req.params.hoodId));
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
        res.status(400).json({ status: 'error', code: 'INVALID_HOOD_ID' });
        return;
      }
      const cityRes = resolveCityParamOrReject(req.query.cityId, { allowOmittedDefault: 'tehran' });
      if (!cityRes.ok) {
        res.status(400).json({ status: 'error', code: cityRes.code, message: cityRes.messageFa });
        return;
      }
      const cityId = cityRes.cityId;
      const ownership = validateCityNeighborhoodOwnership(cityId, hoodId, resolveCityIdForNeighborhood);
      if (ownership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
        res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa });
        return;
      }
      const periodKey = typeof req.query.periodKey === 'string' && req.query.periodKey.trim()
        ? sanitizeInput(req.query.periodKey, 24)
        : getDefaultRollupPeriodKey();
      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(req.query.intlCurrency))
        ? (String(req.query.intlCurrency) as IntlCurrencyCode)
        : 'USD';

      const rollup = await getOrBuildNeighborhoodRollup(hoodId, cityId, periodKey, intlCurrency);
      const epistemicDossier = buildNeighborhoodEpistemicDossier({
        cityId,
        hoodId,
        hoodName: rollup.hoodName,
        buyPerSqm: rollup.medianPriceSqm,
        intlCurrency,
      });
      const executiveSynthesis = synthesizeExecutiveDecisionReport(
        hoodId,
        rollup.hoodName,
        cityId,
        rollup.weightedReferencePriceSqm,
        rollup.medianPriceSqm,
        85,
        intlCurrency,
      );
      res.status(200).json({
        status: 'ok',
        rollup,
        epistemicDossier,
        executiveSynthesis,
        referencePriceIntlText: formatMillionTomanAsIntlCurrency(rollup.weightedReferencePriceSqm, intlCurrency, 'fa'),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ROLLUP_FETCH_FAILED';
      res.status(500).json({ status: 'error', code });
    }
  });

  // 2. POST /api/v1/valuation/verify-seal — Compute and issue server-signed Hedonic valuation seal
  app.post('/api/v1/valuation/verify-seal', (req: Request, res: Response) => {
    applySecurityHeaders(res);
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'general', 30, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const hoodId = Math.trunc(Number(body.hoodId || 1));
      const sqm = Number(body.sqm || 90);
      const buildYear = Math.trunc(Number(body.buildYear || 1400));
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999 || !Number.isFinite(sqm) || sqm < 15) {
        res.status(400).json({ status: 'error', code: 'INVALID_VALUATION_INPUT' });
        return;
      }

      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(body.intlCurrency))
        ? (body.intlCurrency as IntlCurrencyCode)
        : 'USD';

      const cityRes = resolveCityParamOrReject(body.cityId, { allowOmittedDefault: 'tehran' });
      if (!cityRes.ok) {
        res.status(400).json({ status: 'error', code: cityRes.code, message: cityRes.messageFa });
        return;
      }
      const ownership = validateCityNeighborhoodOwnership(cityRes.cityId, hoodId, resolveCityIdForNeighborhood);
      if (ownership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
        res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa });
        return;
      }

      const seal = computeServerValuationSeal({
        cityId: cityRes.cityId,
        hoodId,
        sqm,
        buildYear,
        renovationStatus: (body.renovationStatus as HedonicRenovationStatus) || 'standard',
        floor: Number.isFinite(Number(body.floor)) ? Number(body.floor) : 2,
        totalFloors: Number.isFinite(Number(body.totalFloors)) ? Number(body.totalFloors) : 5,
        hasElevator: typeof body.hasElevator === 'boolean' ? body.hasElevator : true,
        hasParking: typeof body.hasParking === 'boolean' ? body.hasParking : true,
        hasStorage: typeof body.hasStorage === 'boolean' ? body.hasStorage : true,
        sellerAskingTotalMillion: Number.isFinite(Number(body.sellerAskingTotalMillion)) && Number(body.sellerAskingTotalMillion) > 0
          ? Number(body.sellerAskingTotalMillion)
          : undefined,
        intlCurrency,
      });

      res.status(200).json({ status: 'ok', seal });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VALUATION_SEAL_FAILED';
      res.status(code === 'VALUATION_SEAL_SECRET_MISSING_OR_WEAK' ? 503 : 400).json({ status: 'error', code });
    }
  });

  // 3. POST /api/admin/rollups/trigger — Trigger research rollup aggregation for one or more neighborhoods
  app.post('/api/admin/rollups/trigger', async (req: Request, res: Response) => {
    applySecurityHeaders(res);
    const ip = clientIp(req);
    if (options?.checkRateLimit && !options.checkRateLimit(ip, 'sync', 10, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (options?.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        recordAbuseSignal(ip, 'auth_failure');
        res.status(auth.status).json({ status: 'error', code: 'ADMIN_FORBIDDEN', message: auth.message });
        return;
      }
    } else {
      const fallbackAuth = await verifyAdminApiAuthorization(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!fallbackAuth.authorized) {
        recordAbuseSignal(ip, 'auth_failure');
        res.status(fallbackAuth.statusCode).json({
          status: 'error',
          code: fallbackAuth.reason || 'ADMIN_FORBIDDEN',
          message: 'اجرای دستی تجمیع پژوهشی محلات نیازمند احراز هویت مدیر سیستم است.',
        });
        return;
      }
    }
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const cityRes = resolveCityParamOrReject(body.cityId, { allowOmittedDefault: 'tehran' });
      if (!cityRes.ok) {
        res.status(400).json({ status: 'error', code: cityRes.code, message: cityRes.messageFa });
        return;
      }
      const cityId = cityRes.cityId;
      const hoodId = Math.max(1, Math.trunc(Number(body.hoodId) || 1));
      const ownership = validateCityNeighborhoodOwnership(cityId, hoodId, resolveCityIdForNeighborhood);
      if (ownership.code === 'CITY_NEIGHBORHOOD_MISMATCH') {
        res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa });
        return;
      }
      const periodKey = typeof body.periodKey === 'string' && body.periodKey.trim()
        ? sanitizeInput(body.periodKey, 24)
        : getDefaultRollupPeriodKey();
      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(body.intlCurrency))
        ? (body.intlCurrency as IntlCurrencyCode)
        : 'USD';

      const priceObservations = Array.isArray(body.priceObservations)
        ? (body.priceObservations as RawPriceObservation[])
        : undefined;
      const behavioralEvents = Array.isArray(body.behavioralEvents)
        ? (body.behavioralEvents as ResearchBehavioralEvent[])
        : undefined;

      const { rollup, priceSummary } = await aggregateNeighborhoodResearchRollup({
        cityId,
        hoodId,
        periodKey,
        priceObservations,
        behavioralEvents,
        intlCurrency,
      });

      res.status(200).json({
        status: 'ok',
        rollup,
        priceSummary: {
          medianPriceSqm: priceSummary.medianPriceSqm,
          madValue: priceSummary.madValue,
          weightedReferencePriceSqm: priceSummary.weightedReferencePriceSqm,
          inlierCount: priceSummary.inlierCount,
          outlierCount: priceSummary.outlierCount,
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ROLLUP_TRIGGER_FAILED';
      res.status(400).json({ status: 'error', code });
    }
  });
}
