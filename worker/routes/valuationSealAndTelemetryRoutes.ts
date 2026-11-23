/**
 * @file worker/routes/valuationSealAndTelemetryRoutes.ts
 * @description Worker-native valuation seal verification and public telemetry policy routes.
 */
import { computeServerValuationSeal } from '../../src/cells/valuation-authority/robustValuationEngine';
import type { HedonicRenovationStatus } from '../../src/data/hedonicPricingEngine';
import type { IntlCurrencyCode } from '../../src/utils/areaUnit';
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
      const hoodId = Math.trunc(Number(body.hoodId || 1));
      const sqm = Number(body.sqm || 90);
      const buildYear = Math.trunc(Number(body.buildYear || 1400));
      if (
        !Number.isInteger(hoodId) ||
        hoodId < 1 ||
        hoodId > 9999 ||
        !Number.isFinite(sqm) ||
        sqm < 15
      ) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_VALUATION_INPUT',
        });
      }

      const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(
        String(body.intlCurrency)
      )
        ? (body.intlCurrency as IntlCurrencyCode)
        : 'USD';

      const sealSecret = String(ctx.env.VALUATION_SEAL_SECRET || '').trim();
      if (!/^[0-9a-f]{64}$/i.test(sealSecret)) {
        return jsonWorkerResponse(ctx, 503, {
          status: 'error',
          code: 'VALUATION_SEAL_SECRET_UNAVAILABLE',
        });
      }

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
      }, { sealSecret });

      return jsonWorkerResponse(ctx, 200, { status: 'ok', seal });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VALUATION_SEAL_FAILED';
      return jsonWorkerResponse(ctx, 400, { status: 'error', code });
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
