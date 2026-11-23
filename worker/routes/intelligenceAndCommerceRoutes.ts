/**
 * @file worker/routes/intelligenceAndCommerceRoutes.ts
 * @description Phase 2 Group 1B Worker-native handlers for stateless intelligence, commerce,
 * MCP tools, Hedonic valuation seal verification, and public telemetry policy manifest.
 * Preserves 100% API contract parity with Express (`server.ts`).
 */
import { computeServerValuationSeal } from '../../src/cells/valuation-authority/robustValuationEngine';
import type { HedonicRenovationStatus } from '../../src/data/hedonicPricingEngine';
import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../../src/data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../src/data/neighborhoods';
import {
  MANDATORY_AI_SIMULATION_BANNER,
  globalAiRoutingManager,
  parseNaturalPersianHousingQuery,
  type RadarAiWorkflowId,
} from '../../src/utils/aiModelRegistryAndGateway';
import {
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
} from '../../src/utils/areaUnit';
import {
  AUTHORIZED_MCP_TOOL_DESCRIPTORS,
  RADAR_COMMERCIAL_PRODUCTS,
  REFERENCE_EXCHANGE_RATE,
  auditDatasetCommercialEligibility,
  buildX402PaymentChallenge,
  executeAuthorizedMcpTool,
  globalMonetizationLedger,
  verifyX402PaymentHeaders,
} from '../../src/utils/dataCommerceMcpAndMonetization';
import { sanitizeInput, validateCityParam } from '../../src/utils/security';
import { DEFAULT_TELEMETRY_POLICY } from '../../src/utils/telemetryEdgeAggregationEngine';
import {
  checkWorkerRateLimit,
  jsonWorkerResponse,
  readValidatedJsonBody,
} from '../contextAndSecurity';
import type { WorkerRequestContext } from '../types';

export async function handleIntelligenceAndCommerceRoute(
  ctx: WorkerRequestContext,
  params: Record<string, string>
): Promise<Response | null> {
  const { method, pathname, url, request } = ctx;

  // 1. POST /api/v1/ai/intelligent-search
  if (method === 'POST' && pathname === '/api/v1/ai/intelligent-search') {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'ai', 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(
        ctx,
        429,
        {
          status: 'error',
          code: 'AI_SEARCH_RATE_LIMIT',
          message: 'تعداد درخواست‌های جست‌وجوی هوشمند بیش از حد مجاز است.',
        },
        { extraHeaders: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const parsedBody = await readValidatedJsonBody(request);
    if (!parsedBody.ok) {
      return jsonWorkerResponse(ctx, parsedBody.status, {
        status: 'error',
        code: parsedBody.code,
        message: parsedBody.messageFa,
      });
    }

    const body = parsedBody.body;
    const queryText = sanitizeInput(body.query || '', 400);
    if (queryText.length < 3) {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error',
        code: 'QUERY_TOO_SHORT',
        message: 'لطفاً عبارت جست‌وجوی فارسی را وارد کنید (حداقل ۳ کاراکتر).',
      });
    }

    const structured = parseNaturalPersianHousingQuery(queryText, { isLiveModelVerified: false });
    const areaUnit: AreaUnit = body.areaUnit === 'sqft' ? 'sqft' : 'sqm';
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(
      String(body.currency)
    )
      ? (body.currency as IntlCurrencyCode)
      : 'USD';

    const hoods =
      structured.cityId === 'tehran'
        ? INITIAL_NEIGHBORHOODS
        : MULTI_CITY_CONFIGS[structured.cityId].neighborhoods;

    const matchedNeighborhoods = hoods
      .filter((h) => {
        if (structured.targetZone !== null) {
          const zoneDigits = h.zone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
          if (!new RegExp(`\\b${structured.targetZone}\\b`).test(zoneDigits)) return false;
        }
        if (
          structured.maxBuyPerSqmMillions !== null &&
          h.buyPerSqm > structured.maxBuyPerSqmMillions
        ) {
          return false;
        }
        if (structured.maxRahnMillions !== null && h.rahn80m > structured.maxRahnMillions) {
          return false;
        }
        if (structured.positiveGrowthOnly && h.security < 7) return false;
        return true;
      })
      .slice(0, 8)
      .map((h) => ({
        id: h.id,
        name: h.name,
        zone: h.zone,
        buyPerSqm: h.buyPerSqm,
        rahn80m: h.rahn80m,
        securityScore: h.security,
        displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
        buyPerSqmIntlText: formatMillionTomanAsIntlCurrency(h.buyPerSqm, intlCurrency, 'en'),
      }));

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      structuredQuery: structured,
      matchedCount: matchedNeighborhoods.length,
      matchedNeighborhoods,
    });
  }

  // 2. POST /api/ai/gateway/infer & /api/v1/ai/gateway/infer
  if (
    method === 'POST' &&
    (pathname === '/api/ai/gateway/infer' || pathname === '/api/v1/ai/gateway/infer')
  ) {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'ai', 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(
        ctx,
        429,
        { status: 'error', code: 'AI_GATEWAY_RATE_LIMIT' },
        { extraHeaders: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const parsedBody = await readValidatedJsonBody(request);
    if (!parsedBody.ok) {
      return jsonWorkerResponse(ctx, parsedBody.status, {
        status: 'error',
        code: parsedBody.code,
        message: parsedBody.messageFa,
      });
    }

    const body = parsedBody.body;
    const rawWorkflow = sanitizeInput(
      body.workflow || 'intelligent_search',
      60
    ) as RadarAiWorkflowId;
    const prompt = sanitizeInput(body.prompt || body.query || '', 600);
    const routing = globalAiRoutingManager.getCurrentConfig();
    const validWorkflow: RadarAiWorkflowId =
      rawWorkflow in routing.routes ? rawWorkflow : 'intelligent_search';
    const targetModelId = routing.routes[validWorkflow];
    const parsed = parseNaturalPersianHousingQuery(prompt || 'آپارتمان در منطقه ۵ تهران', {
      isLiveModelVerified: false,
      modelId: targetModelId,
    });

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      workflow: validWorkflow,
      routedModelId: targetModelId,
      resolvedEngineId: parsed.resolvedModelId,
      isSimulated: parsed.isSimulated,
      simulationBanner: MANDATORY_AI_SIMULATION_BANNER,
      structuredOutput: parsed,
    });
  }

  // 3. GET /api/v1/commerce/catalog
  if (method === 'GET' && pathname === '/api/v1/commerce/catalog') {
    return jsonWorkerResponse(
      ctx,
      200,
      {
        status: 'ok',
        version: 'v1',
        exchangeRateReference: REFERENCE_EXCHANGE_RATE,
        products: RADAR_COMMERCIAL_PRODUCTS,
      },
      { cacheControl: 'public, max-age=300' }
    );
  }

  // 4. GET /api/v1/commerce/neighborhood-index
  if (method === 'GET' && pathname === '/api/v1/commerce/neighborhood-index') {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'general', 30, 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(ctx, 429, {
        status: 'error',
        code: 'COMMERCE_RATE_LIMIT_EXCEEDED',
      });
    }

    const requestedDataset = sanitizeInput(
      url.searchParams.get('dataset') || 'tehran_neighborhood_price_index_v1',
      80
    );
    const eligibility = auditDatasetCommercialEligibility(requestedDataset);
    if (!eligibility.distributable) {
      globalMonetizationLedger.recordRejection();
      return jsonWorkerResponse(ctx, eligibility.httpStatusIfRequested, {
        status: 'error',
        code: eligibility.reasonCode,
        message:
          'این مجموعه داده حاوی اطلاعات خصوصی یا غیرقابل واگذاری تجاری است (403 Forbidden).',
      });
    }

    if (url.searchParams.get('simulate') === '1') {
      const sim = globalMonetizationLedger.runPaymentSimulation(requestedDataset);
      const city = validateCityParam(url.searchParams.get('city'), 'tehran');
      const hoods =
        city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        simulation: sim,
        provenance: eligibility.provenance,
        city,
        sampleRecords: hoods.slice(0, 3).map((h) => ({
          id: h.id,
          name: h.name,
          zone: h.zone,
          simulationRedacted: true,
        })),
      });
    }

    const verification = verifyX402PaymentHeaders({
      paymentContextHeader:
        request.headers.get('payment-context') ??
        request.headers.get('x-payment-context') ??
        undefined,
      paymentSignatureHeader:
        request.headers.get('payment-signature') ??
        request.headers.get('x-payment-signature') ??
        undefined,
      expectedProductId: requestedDataset,
    });

    if (!verification.verified) {
      globalMonetizationLedger.recordChallenge();
      const challenge = buildX402PaymentChallenge(requestedDataset);
      return jsonWorkerResponse(
        ctx,
        challenge.httpStatus,
        {
          ...challenge.body,
          failureCode: verification.failureCode,
        },
        { extraHeaders: { 'PAYMENT-REQUIRED': challenge.headers['PAYMENT-REQUIRED'] } }
      );
    }

    const product =
      RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === requestedDataset) ||
      RADAR_COMMERCIAL_PRODUCTS[0];
    globalMonetizationLedger.recordAuthorizedPayment(product.pricePerRequestUsdMicros);
    const city = validateCityParam(url.searchParams.get('city'), 'tehran');
    const hoods =
      city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      paymentState: 'AUTHORIZED_PENDING_SETTLEMENT',
      provenance: eligibility.provenance,
      city,
      records: hoods.map((h) => ({
        id: h.id,
        name: h.name,
        zone: h.zone,
        buyPerSqm: h.buyPerSqm,
        rahn80m: h.rahn80m,
      })),
    });
  }

  // 5. GET /api/v1/commerce/neighborhood-dossier/:hoodId
  if (method === 'GET' && pathname.startsWith('/api/v1/commerce/neighborhood-dossier/')) {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'general', 30, 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(ctx, 429, {
        status: 'error',
        code: 'COMMERCE_RATE_LIMIT_EXCEEDED',
      });
    }

    const hoodId = Math.max(1, Number(params.hoodId) || 1);
    const city = validateCityParam(url.searchParams.get('city'), 'tehran');
    const hoods =
      city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
    const hood =
      hoods.find((h) => h.id === hoodId) ||
      getAllMultiCityNeighborhoods().find((h) => h.id === hoodId) ||
      hoods[0];
    const productId = 'tehran_neighborhood_price_index_v1';

    if (url.searchParams.get('simulate') === '1') {
      const sim = globalMonetizationLedger.runPaymentSimulation(productId);
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        simulation: sim,
        dossier: {
          id: hood.id,
          name: hood.name,
          zone: hood.zone,
          buyPerSqm: null,
          rahn80m: null,
          simulationRedacted: true,
        },
      });
    }

    const verification = verifyX402PaymentHeaders({
      paymentContextHeader:
        request.headers.get('payment-context') ??
        request.headers.get('x-payment-context') ??
        undefined,
      paymentSignatureHeader:
        request.headers.get('payment-signature') ??
        request.headers.get('x-payment-signature') ??
        undefined,
      expectedProductId: productId,
    });

    if (!verification.verified) {
      globalMonetizationLedger.recordChallenge();
      const challenge = buildX402PaymentChallenge(productId);
      return jsonWorkerResponse(
        ctx,
        challenge.httpStatus,
        {
          ...challenge.body,
          failureCode: verification.failureCode,
        },
        { extraHeaders: { 'PAYMENT-REQUIRED': challenge.headers['PAYMENT-REQUIRED'] } }
      );
    }

    globalMonetizationLedger.recordAuthorizedPayment(5_000);
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      paymentState: 'AUTHORIZED_PENDING_SETTLEMENT',
      dossier: {
        id: hood.id,
        name: hood.name,
        zone: hood.zone,
        buyPerSqm: hood.buyPerSqm,
        rahn80m: hood.rahn80m,
      },
    });
  }

  // 6. GET /api/mcp/tools & /api/v1/mcp/tools
  if (method === 'GET' && (pathname === '/api/mcp/tools' || pathname === '/api/v1/mcp/tools')) {
    return jsonWorkerResponse(
      ctx,
      200,
      {
        status: 'ok',
        protocol: 'MCP-ReadOnly-v1',
        zeroPiiEnforced: true,
        tools: AUTHORIZED_MCP_TOOL_DESCRIPTORS,
      },
      { cacheControl: 'public, max-age=300' }
    );
  }

  // 7. POST /api/v1/mcp/execute & /api/mcp/invoke
  if (
    method === 'POST' &&
    (pathname === '/api/v1/mcp/execute' || pathname === '/api/mcp/invoke')
  ) {
    const rl = checkWorkerRateLimit(ctx.clientIp, 'general', 30, 60 * 1000);
    if (!rl.allowed) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'MCP_RATE_LIMIT' });
    }

    const parsedBody = await readValidatedJsonBody(request);
    if (!parsedBody.ok) {
      return jsonWorkerResponse(ctx, parsedBody.status, {
        status: 'error',
        code: parsedBody.code,
        message: parsedBody.messageFa,
      });
    }

    const body = parsedBody.body;
    const toolName = sanitizeInput(body.toolName || body.tool || '', 80);
    const args =
      body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? (body.args as Record<string, unknown>)
        : {};

    try {
      const output = executeAuthorizedMcpTool({ toolName, args });
      return jsonWorkerResponse(ctx, 200, output);
    } catch (err) {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error',
        code: err instanceof Error ? err.message : 'MCP_EXECUTION_REJECTED',
        message: 'ابزار MCP درخواستی مجاز نیست یا پارامترهای ورودی نامعتبر است.',
      });
    }
  }

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
      if (sealSecret.length < 32) {
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
