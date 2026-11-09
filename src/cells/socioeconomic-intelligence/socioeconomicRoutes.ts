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
import { sanitizeInput, validateCityParam } from '../../utils/security';
import {
  computeServerValuationSeal,
  type RawPriceObservation,
} from '../valuation-authority/robustValuationEngine';
import { buildNeighborhoodEpistemicDossier } from '../decision-epistemology/epistemicDecisionEngine';
import {
  aggregateNeighborhoodResearchRollup,
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

  // 1. GET /api/v1/reference/hood/:hoodId/rollup — Retrieve neighborhood research dossier, MAD reference price & CASPER epistemic dossier
  app.get('/api/v1/reference/hood/:hoodId/rollup', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
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
      const cityId = validateCityParam(req.query.cityId, 'tehran');
      const periodKey = typeof req.query.periodKey === 'string' && req.query.periodKey.trim()
        ? sanitizeInput(req.query.periodKey, 24)
        : '1405-08';

      const rollup = await getOrBuildNeighborhoodRollup(hoodId, cityId, periodKey);
      const epistemicDossier = buildNeighborhoodEpistemicDossier({
        cityId,
        hoodId,
        hoodName: rollup.hoodName,
        buyPerSqm: rollup.medianPriceSqm,
      });
      res.status(200).json({
        status: 'ok',
        rollup,
        epistemicDossier,
        referencePriceIntlText: formatMillionTomanAsIntlCurrency(rollup.weightedReferencePriceSqm, 'USD', 'fa'),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ROLLUP_FETCH_FAILED';
      res.status(500).json({ status: 'error', code });
    }
  });

  // 2. POST /api/v1/valuation/verify-seal — Compute and issue server-signed Hedonic valuation seal
  app.post('/api/v1/valuation/verify-seal', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
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

      const seal = computeServerValuationSeal({
        cityId: typeof body.cityId === 'string' ? body.cityId : 'tehran',
        hoodId,
        sqm,
        buildYear,
        renovationStatus: (body.renovationStatus as HedonicRenovationStatus) || 'standard',
        floor: Number.isFinite(Number(body.floor)) ? Number(body.floor) : 2,
        totalFloors: Number.isFinite(Number(body.totalFloors)) ? Number(body.totalFloors) : 5,
        hasElevator: typeof body.hasElevator === 'boolean' ? body.hasElevator : true,
        hasParking: typeof body.hasParking === 'boolean' ? body.hasParking : true,
        hasStorage: typeof body.hasStorage === 'boolean' ? body.hasStorage : true,
        sellerAskingTotalMillion: Number.isFinite(Number(body.sellerAskingTotalMillion))
          ? Number(body.sellerAskingTotalMillion)
          : undefined,
        intlCurrency,
      });

      res.status(200).json({ status: 'ok', seal });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VALUATION_SEAL_FAILED';
      res.status(400).json({ status: 'error', code });
    }
  });

  // 3. POST /api/admin/rollups/trigger — Trigger research rollup aggregation for one or more neighborhoods
  app.post('/api/admin/rollups/trigger', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (options?.checkRateLimit && !options.checkRateLimit(clientIp(req), 'sync', 10, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    if (options?.verifyAdminAuth) {
      const auth = await options.verifyAdminAuth(req);
      if (!auth.ok) {
        res.status(auth.status).json({ status: 'error', code: 'ADMIN_FORBIDDEN', message: auth.message });
        return;
      }
    }
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const cityId = validateCityParam(body.cityId, 'tehran');
      const hoodId = Math.max(1, Math.trunc(Number(body.hoodId) || 1));
      const periodKey = typeof body.periodKey === 'string' && body.periodKey.trim()
        ? sanitizeInput(body.periodKey, 24)
        : '1405-08';

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
