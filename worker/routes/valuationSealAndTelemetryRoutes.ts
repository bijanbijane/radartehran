/**
 * @file worker/routes/valuationSealAndTelemetryRoutes.ts
 * @description Worker-native valuation seal verification and public telemetry policy routes.
 */
import { computeServerValuationSeal } from '../../src/cells/valuation-authority/robustValuationEngine';
import { getCurrentJalaliYear, type HedonicRenovationStatus } from '../../src/data/hedonicPricingEngine';
import { MULTI_CITY_CONFIGS } from '../../src/data/multiCityData';
import type { IntlCurrencyCode } from '../../src/utils/areaUnit';
import { isValidCityId } from '../../src/types/typeGuards';
import { DEFAULT_TELEMETRY_POLICY } from '../../src/utils/telemetryEdgeAggregationEngine';
import {
  checkWorkerRateLimit,
  jsonWorkerResponse,
  readValidatedJsonBody,
} from '../contextAndSecurity';
import type { WorkerRequestContext } from '../types';

export async function handleValuationAndTelemetryRoute(
  ctx: WorkerRequestContext,
): Promise<Response | null> {
  const request = ctx.request;
  const method = request.method;
  const pathname = ctx.url.pathname;
  // 8. POST /api/v1/valuation/verify-seal
  if (method === 'POST' && pathname === '/api/v1/valuation/verify-seal') {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'general', 60, 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'VALUATION_RATE_LIMIT' });
    }

    const parsedBody = await readValidatedJsonBody(request);
    if (!parsedBody.ok) {
      return jsonWorkerResponse(ctx, parsedBody.status, {
        status: 'error',
        code: parsedBody.code,
        message: parsedBody.messageFa,
      });
    }

    try {
      const body = parsedBody.body;
      const cityId = body.cityId === undefined
        ? 'tehran'
        : typeof body.cityId === 'string'
          ? body.cityId.trim().toLowerCase()
          : '';
      const cityConfig = isValidCityId(cityId) ? MULTI_CITY_CONFIGS[cityId] : undefined;
      const hoodId = typeof body.hoodId === 'number' ? body.hoodId : Number.NaN;
      const sqm = typeof body.sqm === 'number' ? body.sqm : Number.NaN;
      const buildYear = typeof body.buildYear === 'number' ? body.buildYear : Number.NaN;
      const currentJalaliYear = getCurrentJalaliYear();
      const renovationStatuses: readonly HedonicRenovationStatus[] = [
        'luxury_renovated',
        'renovated',
        'standard',
        'needs_renovation',
      ];
      const rawRenovationStatus = body.renovationStatus === undefined ? 'standard' : body.renovationStatus;
      const renovationStatus =
        typeof rawRenovationStatus === 'string' &&
        renovationStatuses.includes(rawRenovationStatus as HedonicRenovationStatus)
          ? rawRenovationStatus as HedonicRenovationStatus
          : null;
      const floor = body.floor === undefined
        ? 2
        : typeof body.floor === 'number'
          ? body.floor
          : Number.NaN;
      const totalFloors = body.totalFloors === undefined
        ? 5
        : typeof body.totalFloors === 'number'
          ? body.totalFloors
          : Number.NaN;
      const hasElevator = body.hasElevator === undefined ? true : body.hasElevator;
      const hasParking = body.hasParking === undefined ? true : body.hasParking;
      const hasStorage = body.hasStorage === undefined ? true : body.hasStorage;
      const sellerAskingTotalMillion = body.sellerAskingTotalMillion;
      const rawIntlCurrency = body.intlCurrency === undefined ? 'USD' : body.intlCurrency;
      const currencies: readonly IntlCurrencyCode[] = ['IRT', 'USD', 'EUR', 'AED'];
      const intlCurrency =
        typeof rawIntlCurrency === 'string' && currencies.includes(rawIntlCurrency as IntlCurrencyCode)
          ? rawIntlCurrency as IntlCurrencyCode
          : null;

      if (
        !cityConfig ||
        !Number.isInteger(hoodId) ||
        !cityConfig.neighborhoods.some((hood) => hood.id === hoodId) ||
        !Number.isFinite(sqm) ||
        sqm < 30 ||
        sqm > 600 ||
        !Number.isInteger(buildYear) ||
        buildYear < 1365 ||
        buildYear > currentJalaliYear + 1 ||
        !renovationStatus ||
        !Number.isInteger(floor) ||
        floor < -1 ||
        !Number.isInteger(totalFloors) ||
        totalFloors < 1 ||
        totalFloors > 40 ||
        floor > totalFloors ||
        typeof hasElevator !== 'boolean' ||
        typeof hasParking !== 'boolean' ||
        typeof hasStorage !== 'boolean' ||
        (sellerAskingTotalMillion !== undefined &&
          (typeof sellerAskingTotalMillion !== 'number' ||
            !Number.isFinite(sellerAskingTotalMillion) ||
            sellerAskingTotalMillion <= 0)) ||
        !intlCurrency
      ) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_VALUATION_INPUT',
        });
      }

      const sealSecret = String(ctx.env.VALUATION_SEAL_SECRET || '').trim();
      if (!/^[0-9a-f]{64}$/i.test(sealSecret)) {
        return jsonWorkerResponse(ctx, 503, {
          status: 'error',
          code: 'VALUATION_SEAL_SECRET_UNAVAILABLE',
        });
      }

      const seal = computeServerValuationSeal({
        cityId,
        hoodId,
        sqm,
        buildYear,
        renovationStatus,
        floor,
        totalFloors,
        hasElevator,
        hasParking,
        hasStorage,
        sellerAskingTotalMillion: sellerAskingTotalMillion as number | undefined,
        intlCurrency,
      }, { sealSecret });

      return jsonWorkerResponse(ctx, 200, { status: 'ok', seal });
    } catch {
      return jsonWorkerResponse(ctx, 500, { status: 'error', code: 'VALUATION_SEAL_FAILED' });
    }
  }

  // 9. GET /api/v1/telemetry/policy
  if (method === 'GET' && pathname === '/api/v1/telemetry/policy') {
    return jsonWorkerResponse(
      ctx,
      200,
      {
        status: 'ok',
        policy: { ...DEFAULT_TELEMETRY_POLICY },
      },
      { cacheControl: 'public, max-age=60' }
    );
  }

  return null;
}
