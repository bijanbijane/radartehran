import type { Express, Request, Response } from 'express'; import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData'; import { sanitizeInput } from './security'; import { resolveCityParamOrReject, validateCityNeighborhoodOwnership } from './geo/cityGeospatialResolver'; import { getValidatedServerConfig, verifyAdminApiAuthorization } from './serverAdminAndTelegramSecurity'; import { pushAuditLog } from './serverMarketPulseEngine'; import { recordAbuseSignal, type RateBucketType } from './serverDeliveryAndAbuseGuard'; import { evaluateCloudflareRuntimePortability } from './cloudflarePortabilityAndCapabilities'; import { OFFICIAL_AI_MODEL_REGISTRY, MANDATORY_AI_SIMULATION_BANNER, globalAiRoutingManager, buildCloudflareAiGatewayEndpoint, parseNaturalPersianHousingQuery, type RadarAiWorkflowId, } from './aiModelRegistryAndGateway'; import { runLiveGeminiGatewayInference } from './serverAiGatewayLive'; import { RADAR_COMMERCIAL_PRODUCTS, REFERENCE_EXCHANGE_RATE, AUTHORIZED_MCP_TOOL_DESCRIPTORS, auditDatasetCommercialEligibility, buildX402PaymentChallenge, globalMonetizationLedger,
  executeAuthorizedMcpTool, } from './dataCommerceMcpAndMonetization'; import { verifyX402PaymentHeaders } from './x402PaymentVerification.server';
import { readAndReconcileExecutionState } from './rmepExecutionStateEngine'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; const registeredAiCommerceApps = new WeakSet<Express>(); export function registerAiAndCommerceRoutes( app: Express, deps: { checkRateLimit: (ip: string, bucket: RateBucketType, max: number, windowMs: number) => boolean; getClientIp: (req: Request) => string; }
): void { if (registeredAiCommerceApps.has(app)) return; registeredAiCommerceApps.add(app); const { checkRateLimit, getClientIp } = deps; app.get('/api/admin/rmep-status', (req: Request, res: Response) => { void (async () => { res.setHeader('Cache-Control', 'no-store'); const auth = await verifyAdminApiAuthorization( req.headers as Record<string, string | string[] | undefined>, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true } ); if (!auth.authorized) { recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error',
        code: auth.reason, message: 'مشاهده وضعیت اجرای مهندسی RMEP-001 نیازمند احراز هویت مدیر سیستم است.', }); return; } const rmep = readAndReconcileExecutionState();
    res.status(200).json({ status: 'ok', ...rmep }); })().catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' }); }); }); app.get('/api/admin/architecture-and-ai-registry', (req: Request, res: Response) => { void (async () => { res.setHeader('Cache-Control', 'no-store'); const auth = await verifyAdminApiAuthorization( req.headers as Record<string, string | string[] | undefined>, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true }
    ); if (!auth.authorized) { recordAbuseSignal(getClientIp(req), 'auth_failure'); res.status(auth.statusCode).json({ status: 'error', code: auth.reason, message: 'مشاهده مرکز هوش مصنوعی و تجارت داده نیازمند احراز هویت مدیر سیستم است.', }); return; }
    const routing = globalAiRoutingManager.getCurrentConfig(); const gatewayPreview = buildCloudflareAiGatewayEndpoint({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, gatewayId: process.env.CLOUDFLARE_AI_GATEWAY_ID, provider: 'google-ai-studio', modelId: routing.routes.intelligent_search, }); res.status(200).json({
      status: 'ok', cloudflareAndPortability: evaluateCloudflareRuntimePortability(process.env), aiModels: OFFICIAL_AI_MODEL_REGISTRY, aiRouting: routing,
      aiRoutingAuditTrail: globalAiRoutingManager.getAuditTrail().slice(0, 15), aiGatewayPreview: gatewayPreview, commercialProducts: RADAR_COMMERCIAL_PRODUCTS, exchangeRateReference: REFERENCE_EXCHANGE_RATE,
      monetizationSummary: globalMonetizationLedger.getSummary(), rmepExecutionSummary: readAndReconcileExecutionState(), }); })().catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' }); }); });
  app.post('/api/admin/ai-routing', (req: Request, res: Response) => { void (async () => { res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true });
    if (!auth.authorized) {
      recordAbuseSignal(getClientIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason, message: 'تغییر مسیریابی مدل‌های هوش مصنوعی فقط برای مدیر مجاز است.' });
      return;
    }
    try {
      const actor = auth.actorEmail || auth.email || auth.actorUid || auth.uid || 'verified-primary-admin';
      const updated = globalAiRoutingManager.updateRouting({
        actorEmail: actor,
        aiGatewayEnabled: typeof req.body?.aiGatewayEnabled === 'boolean' ? req.body.aiGatewayEnabled : undefined,
        routes: req.body?.routes as Partial<Record<RadarAiWorkflowId, string>> | undefined,
      });
      pushAuditLog('INFO', `بروزرسانی مسیریابی مدل‌های هوش مصنوعی به نسخه v${updated.version}`);
      res.status(200).json({ status: 'ok', aiRouting: updated, aiRoutingAuditTrail: globalAiRoutingManager.getAuditTrail().slice(0, 15) });
    } catch (err) {
      res.status(400).json({ status: 'error', code: err instanceof Error ? err.message : 'INVALID_AI_ROUTING_UPDATE', message: 'شناسه مدل یا جریان کاری انتخاب‌شده معتبر نیست.' });
    }
  })().catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' }); }); });
  app.post('/api/admin/ai-routing/rollback', (req: Request, res: Response) => { void (async () => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>, process.env, { requirePrimaryBootstrapAdmin: true, disallowStaticToken: true });
    if (!auth.authorized) {
      recordAbuseSignal(getClientIp(req), 'auth_failure');
      res.status(auth.statusCode).json({ status: 'error', code: auth.reason, message: 'بازگردانی تنظیمات هوش مصنوعی فقط برای مدیر مجاز است.' });
      return;
    }
    try {
      const actor = auth.actorEmail || auth.email || auth.actorUid || auth.uid || 'verified-primary-admin';
      const restored = globalAiRoutingManager.rollbackToPreviousConfig(actor);
      pushAuditLog('WARN', `بازگشت (Rollback) تنظیمات مسیریابی هوش مصنوعی به نسخه v${restored.version}`);
      res.status(200).json({ status: 'ok', aiRouting: restored, aiRoutingAuditTrail: globalAiRoutingManager.getAuditTrail().slice(0, 15) });
    } catch (err) {
      res.status(400).json({ status: 'error', code: err instanceof Error ? err.message : 'ROLLBACK_UNAVAILABLE', message: 'نسخه قبلی برای بازگشت (Rollback) ثبت نشده است.' });
    }
  })().catch(() => { if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' }); }); });
  app.post('/api/v1/ai/intelligent-search', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'ai', 20, 10 * 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'AI_SEARCH_RATE_LIMIT', message: 'تعداد درخواست‌های جست‌وجوی هوشمند بیش از حد مجاز است.' });
      return;
    }
    const queryText = sanitizeInput(req.body?.query || '', 400);
    if (queryText.length < 3) {
      res.status(400).json({ status: 'error', code: 'QUERY_TOO_SHORT', message: 'لطفاً عبارت جست‌وجوی فارسی را وارد کنید (حداقل ۳ کاراکتر).' });
      return;
    }
    const structured = parseNaturalPersianHousingQuery(queryText, { isLiveModelVerified: false });
    const areaUnit: AreaUnit = req.body?.areaUnit === 'sqft' ? 'sqft' : 'sqm';
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED'].includes(String(req.body?.currency)) ? (req.body.currency as IntlCurrencyCode) : 'USD';
    const hoods = structured.cityId === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[structured.cityId].neighborhoods;
    const matchedNeighborhoods = hoods
      .filter((h) => {
        if (structured.targetZone !== null) {
          const zoneDigits = h.zone.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
          if (!new RegExp(`\\b${structured.targetZone}\\b`).test(zoneDigits)) return false;
        }
        if (structured.maxBuyPerSqmMillions !== null && h.buyPerSqm > structured.maxBuyPerSqmMillions) return false;
        if (structured.maxRahnMillions !== null && h.rahn80m > structured.maxRahnMillions) return false;
        if (structured.positiveGrowthOnly && h.security < 7) return false;
        return true;
      })
      .slice(0, 8)
      .map((h) => ({
        id: h.id, name: h.name, zone: h.zone, buyPerSqm: h.buyPerSqm, rahn80m: h.rahn80m, securityScore: h.security,
        displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
        buyPerSqmIntlText: formatMillionTomanAsIntlCurrency(h.buyPerSqm, intlCurrency, 'en', REFERENCE_EXCHANGE_RATE),
      }));
    res.status(200).json({ status: 'ok', structuredQuery: structured, matchedCount: matchedNeighborhoods.length, matchedNeighborhoods });
  });
  app.get('/api/v1/commerce/catalog', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      status: 'ok',
      version: 'v1',
      exchangeRateReference: REFERENCE_EXCHANGE_RATE,
      products: RADAR_COMMERCIAL_PRODUCTS,
    });
  });
  app.get('/api/v1/commerce/neighborhood-index', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'general', 30, 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'COMMERCE_RATE_LIMIT_EXCEEDED' });
      return;
    }
    const requestedDataset = sanitizeInput(
      (req.query.dataset as string) || 'tehran_neighborhood_price_index_v1',
      80
    );
    const eligibility = auditDatasetCommercialEligibility(requestedDataset);
    if (!eligibility.distributable) {
      globalMonetizationLedger.recordRejection();
      res.status(eligibility.httpStatusIfRequested).json({
        status: 'error',
        code: eligibility.reasonCode,
        message: 'این مجموعه داده حاوی اطلاعات خصوصی یا غیرقابل واگذاری تجاری است (403 Forbidden).',
      });
      return;
    }
    const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) {
      res.status(400).json({ status: 'error', code: cityCheck.code, message: cityCheck.messageFa });
      return;
    }
    const city = cityCheck.cityId;
    if (req.query.simulate === '1') {
      const sim = globalMonetizationLedger.runPaymentSimulation(requestedDataset);
      const hoods = city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
      res.status(200).json({
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
      return;
    }
    const verification = verifyX402PaymentHeaders({
      paymentContextHeader: (req.headers['payment-context'] ?? req.headers['x-payment-context']) as string | undefined,
      paymentSignatureHeader: (req.headers['payment-signature'] ?? req.headers['x-payment-signature']) as string | undefined,
      expectedProductId: requestedDataset,
    });
    if (!verification.verified) {
      globalMonetizationLedger.recordChallenge();
      const challenge = buildX402PaymentChallenge(requestedDataset);
      res.setHeader('PAYMENT-REQUIRED', challenge.headers['PAYMENT-REQUIRED']);
      res.status(challenge.httpStatus).json({
        ...challenge.body,
        failureCode: verification.failureCode,
      });
      return;
    }
    const product =
      RADAR_COMMERCIAL_PRODUCTS.find((p) => p.productId === requestedDataset) ||
      RADAR_COMMERCIAL_PRODUCTS[0];
    globalMonetizationLedger.recordAuthorizedPayment(product.pricePerRequestUsdMicros);
    const hoods = city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
    res.status(200).json({
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
  });
  app.get(['/api/mcp/tools', '/api/v1/mcp/tools'], (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      status: 'ok',
      protocol: 'MCP-ReadOnly-v1',
      zeroPiiEnforced: true,
      tools: AUTHORIZED_MCP_TOOL_DESCRIPTORS,
    });
  });
  app.post(['/api/v1/mcp/execute', '/api/mcp/invoke'], (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'general', 30, 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'MCP_RATE_LIMIT' });
      return;
    }
    const toolName = sanitizeInput(req.body?.toolName || req.body?.tool || '', 80);
    const args =
      req.body?.args && typeof req.body.args === 'object' && !Array.isArray(req.body.args)
        ? (req.body.args as Record<string, unknown>)
        : {};
    try {
      const output = executeAuthorizedMcpTool({ toolName, args });
      res.status(200).json(output);
    } catch (err) {
      res.status(400).json({
        status: 'error',
        code: err instanceof Error ? err.message : 'MCP_EXECUTION_REJECTED',
        message: 'ابزار MCP درخواستی مجاز نیست یا پارامترهای ورودی نامعتبر است.',
      });
    }
  });
  app.post(['/api/ai/gateway/infer', '/api/v1/ai/gateway/infer'], (req: Request, res: Response) => {
    void (async () => {
      res.setHeader('Cache-Control', 'no-store');
      const ip = getClientIp(req);
      if (!checkRateLimit(ip, 'ai', 20, 10 * 60 * 1000)) {
        res.status(429).json({ status: 'error', code: 'AI_GATEWAY_RATE_LIMIT' });
        return;
      }
      const rawWorkflow = sanitizeInput(req.body?.workflow || 'intelligent_search', 60) as RadarAiWorkflowId;
      const prompt = sanitizeInput(req.body?.prompt || req.body?.query || '', 600);
      const routing = globalAiRoutingManager.getCurrentConfig();
      const validWorkflow: RadarAiWorkflowId =
        rawWorkflow in routing.routes ? rawWorkflow : 'intelligent_search';
      const targetModelId = routing.routes[validWorkflow];
      const effectivePrompt = prompt || 'آپارتمان در منطقه ۵ تهران';
      const parsed = parseNaturalPersianHousingQuery(effectivePrompt, {
        isLiveModelVerified: false,
        modelId: targetModelId,
      });
      const cfg = getValidatedServerConfig(process.env);
      const shouldTryLive =
        Boolean(cfg.geminiApiKey) &&
        req.body?.forceSimulate !== true &&
        targetModelId !== 'local-deterministic-rule-engine-v1';

      if (shouldTryLive && cfg.geminiApiKey) {
        const liveRes = await runLiveGeminiGatewayInference({
          workflow: validWorkflow,
          prompt: effectivePrompt,
          routedModelId: targetModelId,
          apiKey: cfg.geminiApiKey,
          envModel: cfg.geminiModel,
        });
        if (liveRes.ok) {
          res.status(200).json({
            status: 'ok',
            workflow: validWorkflow,
            routedModelId: targetModelId,
            resolvedEngineId: liveRes.modelUsed,
            isSimulated: false,
            isLiveModelVerified: true,
            simulationBanner: null,
            liveSummaryFa: liveRes.liveSummaryFa,
            structuredOutput: {
              ...parsed,
              ...liveRes.structuredPatch,
              isSimulated: false,
              simulationBanner: null,
              resolvedModelId: liveRes.modelUsed,
            },
          });
          return;
        }
      }

      res.status(200).json({
        status: 'ok',
        workflow: validWorkflow,
        routedModelId: targetModelId,
        resolvedEngineId: parsed.resolvedModelId,
        isSimulated: parsed.isSimulated,
        isLiveModelVerified: false,
        simulationBanner: MANDATORY_AI_SIMULATION_BANNER,
        structuredOutput: parsed,
      });
    })().catch(() => {
      if (!res.headersSent) res.status(500).json({ status: 'error', code: 'INTERNAL_SERVER_ERROR' });
    });
  });
  app.get('/api/v1/commerce/neighborhood-dossier/:hoodId', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, 'general', 30, 60 * 1000)) {
      res.status(429).json({ status: 'error', code: 'COMMERCE_RATE_LIMIT_EXCEEDED' });
      return;
    }
    const hoodId = Math.max(1, Number(req.params.hoodId) || 1);
    const cityCheck = resolveCityParamOrReject(req.query.city, { allowOmittedDefault: 'tehran' });
    if (!cityCheck.ok) {
      res.status(400).json({ status: 'error', code: cityCheck.code, message: cityCheck.messageFa });
      return;
    }
    const city = cityCheck.cityId;
    if (!cityCheck.wasOmitted) {
      const ownership = validateCityNeighborhoodOwnership(city, hoodId, resolveCityIdForNeighborhood);
      if (!ownership.ok) {
        res.status(400).json({ status: 'error', code: ownership.code, message: ownership.messageFa });
        return;
      }
    }
    const hoods = city === 'tehran' ? INITIAL_NEIGHBORHOODS : MULTI_CITY_CONFIGS[city].neighborhoods;
    const hood = cityCheck.wasOmitted
      ? (hoods.find((h) => h.id === hoodId) || getAllMultiCityNeighborhoods().find((h) => h.id === hoodId))
      : hoods.find((h) => h.id === hoodId);
    if (!hood) {
      res.status(404).json({ status: 'error', code: 'UNKNOWN_NEIGHBORHOOD', message: 'محله درخواستی یافت نشد.' });
      return;
    }
    const productId = 'tehran_neighborhood_price_index_v1';
    if (req.query.simulate === '1') {
      const sim = globalMonetizationLedger.runPaymentSimulation(productId);
      res.status(200).json({
        status: 'ok',
        simulation: sim,
        dossier: { id: hood.id, name: hood.name, zone: hood.zone, buyPerSqm: null, rahn80m: null, simulationRedacted: true },
      });
      return;
    }
    const verification = verifyX402PaymentHeaders({
      paymentContextHeader: (req.headers['payment-context'] ?? req.headers['x-payment-context']) as string | undefined,
      paymentSignatureHeader: (req.headers['payment-signature'] ?? req.headers['x-payment-signature']) as string | undefined,
      expectedProductId: productId,
    });
    if (!verification.verified) {
      globalMonetizationLedger.recordChallenge();
      const challenge = buildX402PaymentChallenge(productId);
      res.setHeader('PAYMENT-REQUIRED', challenge.headers['PAYMENT-REQUIRED']);
      res.status(challenge.httpStatus).json({ ...challenge.body, failureCode: verification.failureCode }); return; } globalMonetizationLedger.recordAuthorizedPayment(5_000); res.status(200).json({ status: 'ok', paymentState: 'AUTHORIZED_PENDING_SETTLEMENT', dossier: { id: hood.id, name: hood.name, zone: hood.zone, buyPerSqm: hood.buyPerSqm, rahn80m: hood.rahn80m }, }); }); }