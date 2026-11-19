import "dotenv/config"; import express from "express"; import fs from "fs"; import http from "http"; import os from "os"; import path from "path"; import { createServer as createViteServer } from "vite"; import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS, type CityId } from "./src/data/multiCityData"; import type { SystemHealthData } from "./src/types/models"; import { validateCityParam } from "./src/utils/security"; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from "./src/utils/areaUnit"; import { registerOsmTileProxyRoute } from "./src/utils/osmTileProxy"; import { registerObjectStorageRoutes } from "./src/utils/serverObjectStorage"; import { registerBoundaryProtocolRoutes } from "./src/utils/serverBoundaryProtocol"; import { registerSeoAndSitemapRoutes, injectDynamicSeoMeta } from "./src/utils/serverSeoAndSitemap"; import { getRuntimeEnvConfig, getAdminSafeRuntimeConfigView, updateRuntimeEnvConfig } from "./src/utils/serverRuntimeEnvStore"; import { getValidatedServerConfig, SUPPORTED_CITY_IDS, verifyAdminApiAuthorization } from "./src/utils/serverAdminAndTelegramSecurity";
import { cachedMarketPulseByCity, deepSyncedOverrides, serverAuditLogs, openMeteoLastOk, CITY_AIR_STATIONS, lastAirQualityFetchMs, lastAirQualityFetchSucceeded, airQualityStationSuccessCount, airQualityLastOkByCity, airQualityLastSuccessMsByCity, loadDiskPersistedCache, saveDiskPersistedCache, pushAuditLog, executeDeepMonitoringCycle, getOrUpdateMarketPulse } from "./src/utils/serverMarketPulseEngine"; import { registerUtilityRoutes } from "./src/utils/serverUtilityRoutes"; import { registerSponsorAndBargainRoutes } from "./src/utils/serverSponsorAndBargainRoutes"; import { registerBackupAndChunkUploadRoutes } from "./src/utils/serverBackupAndChunkUploadRoutes"; import { registerPublisherAndPlatformRoutes } from "./src/utils/serverPublisherBargains"; import { registerAiAndCommerceRoutes } from "./src/utils/serverAiAndCommerceRoutes"; import { buildOpenApiSpecification, resolveServerHttpTimeouts } from "./src/utils/serverConfigValidator"; import { flushServerTelemetryToS3Now, startTelemetryFlushTimer, stopTelemetryFlushTimer } from "./src/utils/productAnalyticsEngine"; import { getCasperHubConfigStatus } from "./server/modules/casper-hub/casperHubClient"; import { registerCommunityRoutes } from "./server/modules/community/communityRoutes"; import { registerCommunicationsRoutes } from "./server/modules/communications/commsRoutes"; import { registerKnowledgeRoutes } from "./server/modules/knowledge/knowledgeRoutes"; import { registerGlobalSearchGovernanceAndAnalyticsRoutes } from "./server/modules/search/globalSearchAndGovernanceGateway";
import { checkRateLimit, classifyStaticAssetCachePolicy, compressPayloadIfAccepted, createDeliveryAndAbuseMiddleware, getClientIp, getRateLimitTelemetry, isStaticAssetPath, recordAbuseSignal, resolveApiCacheControlHeader } from "./src/utils/serverDeliveryAndAbuseGuard"; import { globalBackendLifecycle } from "./src/utils/identityLifecycleAndBackendGovernance"; import { registerAccountAdminRoutes } from "./server/modules/account-admin/accountAdminRoutes"; import { registerTrustSafetyV1Routes } from "./server/modules/trust-safety/mountTrustSafetyRoutes"; import { registerUnifiedPlatformWave1Routes } from "./server/modules/platform-foundation/unifiedPlatformRoutes"; import { registerLegalRegulatoryRoutes } from "./server/modules/legal-regulatory/routes"; import { flushAllRepositoriesSync } from "./server/modules/shared/atomicJsonRepository"; let activeHttpServer: http.Server | null = null; let backgroundMonitoringTimer: ReturnType<typeof setInterval> | null = null; let fatalExitScheduled = false; function shutdownAfterFatalError(label: string, reason: unknown): void { console.error(label, reason); if (activeHttpServer?.listening) { pushAuditLog("WARN", `خطای زمان اجرای پس‌زمینه مهار شد (${label})`); return; } if (fatalExitScheduled) return; fatalExitScheduled = true; if (backgroundMonitoringTimer) clearInterval(backgroundMonitoringTimer); stopTelemetryFlushTimer(); void globalBackendLifecycle.initiateGracefulShutdown(() => { saveDiskPersistedCache(); flushAllRepositoriesSync(); void flushServerTelemetryToS3Now().catch(() => undefined); }); if (activeHttpServer) { activeHttpServer.close(() => process.exit(1)); setTimeout(() => process.exit(1), 3000).unref(); } else { process.exit(1); } } function handleGracefulShutdownSignal(signal: "SIGTERM" | "SIGINT"): void { if (fatalExitScheduled) return; fatalExitScheduled = true;
  pushAuditLog("INFO", `دریافت سیگنال خاموش‌سازی امن سرور (${signal})؛ تخلیهٔ کش و بستن اتصالات...`);
  if (backgroundMonitoringTimer) clearInterval(backgroundMonitoringTimer); stopTelemetryFlushTimer(); void globalBackendLifecycle.initiateGracefulShutdown(() => { saveDiskPersistedCache(); flushAllRepositoriesSync(); void flushServerTelemetryToS3Now().catch(() => undefined); }); if (activeHttpServer) { activeHttpServer.close(() => process.exit(0)); setTimeout(() => process.exit(0), 4000).unref(); } else { process.exit(0); } }
process.on("SIGTERM", () => handleGracefulShutdownSignal("SIGTERM")); process.on("SIGINT", () => handleGracefulShutdownSignal("SIGINT")); process.on("uncaughtException", (error: Error) => { shutdownAfterFatalError("[CRITICAL BOOT EXCEPTION] Uncaught exception:", error); }); process.on("unhandledRejection", (reason: unknown) => { shutdownAfterFatalError("[CRITICAL BOOT REJECTION] Unhandled rejection:", reason); }); const MONITORING_INTERVAL_MS = 2 * 60 * 60 * 1000; const ALL_SYSTEM_NEIGHBORHOODS = getAllMultiCityNeighborhoods();
async function startServer() { console.log("[DIAGNOSTIC BOOTSTRAP] Initializing Tehran Housing Radar backend server..."); getRuntimeEnvConfig(process.env); loadDiskPersistedCache(); pushAuditLog("INFO", "راه‌اندازی سرور رادار هوشمند مسکن و رهن ایران"); const app = express(); const rawTrustProxyHops = process.env.TRUST_PROXY_HOPS; const trustProxyHops =
    typeof rawTrustProxyHops === "string" && /^\d+$/.test(rawTrustProxyHops) && Number(rawTrustProxyHops) >= 1 && Number(rawTrustProxyHops) <= 5
      ? Number(rawTrustProxyHops) : process.env.K_SERVICE || process.env.NODE_ENV === "production" ? 1 : false; app.set("trust proxy", trustProxyHops); const server = http.createServer(app); const httpTimeouts = resolveServerHttpTimeouts(process.env);
  server.keepAliveTimeout = httpTimeouts.keepAliveTimeoutMs; server.headersTimeout = httpTimeouts.headersTimeoutMs; server.requestTimeout = httpTimeouts.requestTimeoutMs; server.maxRequestsPerSocket = 1000;
  activeHttpServer = server; const serverCfg = getValidatedServerConfig(); const portArgIdx = process.argv.indexOf("--port"); const cliPort = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1], 10) : NaN;
  const rawPort = Number.isInteger(cliPort) && cliPort > 0 ? cliPort : (serverCfg.port || 3000); const PORT = rawPort === 8080 ? 3000 : rawPort;
  console.log(`[DIAGNOSTIC BOOTSTRAP] Resolved server PORT=${PORT} (cliPort=${cliPort || "none"}, serverCfg=${serverCfg.port})`);
  app.use( createDeliveryAndAbuseMiddleware({ getAppUrl: () => getValidatedServerConfig().appUrl, }) ); app.use("/api/v1/telemetry/ingest", express.json({ limit: "64kb" })); app.use(["/api/object-storage/upload", "/api/admin/backup/restore"], express.json({ limit: "8mb" })); registerObjectStorageRoutes(app, pushAuditLog); app.use(express.json({ limit: "128kb" })); registerOsmTileProxyRoute(app);
  registerBoundaryProtocolRoutes(app); registerSeoAndSitemapRoutes(app);
  app.get("/api/healthz", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.status(200).json({ status: "ok", uptimeSeconds: Math.round(process.uptime()), timestampIso: new Date().toISOString(), displayAreaUnitLabel: formatAreaUnitLabel("sqm"), referenceValuationIntlText: formatMillionTomanAsIntlCurrency(100, "USD") }); });
  app.get("/api/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(buildOpenApiSpecification());
  });
  const adminEnvRoutes = ["/api/admin/env-config", "/api/admin/runtime-config", "/api/admin/runtime-env"];
  app.get(adminEnvRoutes, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const authCheck = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>
    );
    if (!authCheck.authorized) {
      if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), "auth_failure");
      res.status(authCheck.statusCode).json({
        status: "error", code: authCheck.reason,
        message: "مشاهدهٔ تنظیمات محیطی نیازمند احراز هویت مدیر سیستم است.",
      });
      return;
    }
    const view = getAdminSafeRuntimeConfigView();
    res.status(200).json({ ...view, items: view.fieldList });
  });
  app.post(adminEnvRoutes, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>, process.env, { disallowStaticToken: true });
    if (!authCheck.authorized) {
      if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), "auth_failure");
      res.status(authCheck.statusCode).json({
        status: "error", code: authCheck.reason,
        message: "تغییر تنظیمات محیطی سرور نیازمند احراز هویت مدیر سیستم است.",
      });
      return;
    }
    const updates = req.body?.updates ?? req.body?.values ?? req.body ?? {};
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      res.status(400).json({
        status: "error", code: "INVALID_CONFIG_PAYLOAD",
        message: "ساختار تنظیمات ارسالی معتبر نیست.",
      });
      return;
    }
    const result = updateRuntimeEnvConfig(updates);
    pushAuditLog("INFO", `بروزرسانی تنظیمات محیطی سرور توسط ادمین (${result.updatedKeys.join(", ") || "بدون تغییر"})`);
    saveDiskPersistedCache();
    res.status(200).json({ ...result.view, report: result.view, updatedKeys: result.updatedKeys, items: result.view.fieldList });
  });
  app.get("/api/system-health", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const authCheck = await verifyAdminApiAuthorization(
      req.headers as Record<string, string | string[] | undefined>
    );
    if (!authCheck.authorized) {
      if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), "auth_failure");
      res.status(authCheck.statusCode).json({
        status: "error", code: authCheck.reason,
        message: "مشاهدهٔ جزئیات سلامت سرور نیازمند احراز هویت مدیر است.",
      });
      return;
    }
    const uptimeSeconds = Math.round(process.uptime());
    const rssBytes = process.memoryUsage().rss;
    const cfg = getValidatedServerConfig();
    const tehranPulse = cachedMarketPulseByCity.tehran;
    const redactLogEvent = (value: string): string =>
      value
        .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/\b(?:AIza[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED_KEY]")
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
        .replace(/[0۰٠][9۹٩][0-9۰-۹٠-٩]{9}/g, "[REDACTED_PHONE]")
        .replace(/\b\d{10,}\b/g, "[REDACTED_NUMBER]")
        .slice(0, 240);
    const payload: SystemHealthData = {
      status: "ok", uptimeSeconds, uptimeMinutes: Math.round(uptimeSeconds / 60),
      uptimeHours: Number((uptimeSeconds / 3600).toFixed(1)), memoryRssBytes: rssBytes,
      memoryRssMb: Number((rssBytes / (1024 * 1024)).toFixed(1)),
      cacheStatus: {
        state: tehranPulse ? "ACTIVE" : "WARMING_UP",
        lastUpdatedIso: tehranPulse?.lastUpdatedIso ?? new Date().toISOString(),
        lastUpdatedTimeFa: tehranPulse?.lastUpdatedTimeFa ?? "نامشخص",
        nextScheduledTimeFa: tehranPulse?.nextScheduledTimeFa ?? "نامشخص",
        totalCachedNeighborhoods: ALL_SYSTEM_NEIGHBORHOODS.length,
        deepSyncedOverridesCount: Object.values(deepSyncedOverrides).reduce(
          (total, cityOverrides) => total + Object.keys(cityOverrides ?? {}).length, 0
        ),
      },
      apiConnectivity: {
        openMeteoStatus: openMeteoLastOk ? "OK" : "FALLBACK",
        airQualityByCity: Object.fromEntries(
          Object.keys(MULTI_CITY_CONFIGS).map((cityId) => [
            cityId,
            {
              status: airQualityLastOkByCity[cityId as CityId] === true ? "OK" : "FALLBACK",
              lastSuccessMs: airQualityLastSuccessMsByCity[cityId as CityId] ?? null,
            },
          ])
        ),
        geminiConfigured: cfg.geminiConfigured,
        casperHubConfigured: getCasperHubConfigStatus().configured,
      },
      securityMetrics: {
        payloadLimit: "250kb", generalRateLimit: "180 req / min", heavySyncRateLimit: "3 req / 10 min",
        activeTrackedIps: getRateLimitTelemetry().activeTrackedIps,
        totalBlockedRequests: getRateLimitTelemetry().totalBlockedRequests,
      },
      recentLogs: serverAuditLogs.slice(0, 20).map((entry) => ({
        ...entry, event: redactLogEvent(entry.event),
      })),
    };
    res.status(200).json(payload);
  });
  app.get("/api/market-pulse", async (req, res) => {
    res.setHeader("Cache-Control", resolveApiCacheControlHeader(req));
    try {
      const city = validateCityParam(req.query.city, "tehran");
      const requestedRefresh = req.query.refresh === "1";
      if (requestedRefresh) {
        const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
        if (!authCheck.authorized) {
          if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), "auth_failure");
          res.status(authCheck.statusCode).json({
            status: "error", code: authCheck.reason, message: "بهروزرسانی اجباری بازار فقط برای مدیر مجاز است.",
          });
          return;
        }
        const ip = getClientIp(req);
        if (!checkRateLimit(ip, "sync", 3, 10 * 60 * 1000)) {
          const cached = cachedMarketPulseByCity[city];
          if (cached) {
            res.status(200).json({ ...cached, cacheStatus: "HIT" });
            return;
          }
          res.setHeader("Retry-After", "600");
          res.status(429).json({
            status: "error", code: "MARKET_REFRESH_RATE_LIMIT", message: "درخواستهای بهروزرسانی بازار بیش از حد مجاز است.",
          });
          return;
        }
      }
      const pulse = await getOrUpdateMarketPulse(city, requestedRefresh);
      res.status(200).json(pulse);
    } catch {
      res.status(500).json({ status: "error", code: "MARKET_PULSE_FAILED", message: "خطا در دریافت نبض بازار مسکن." });
    }
  });
  app.post(["/api/sync-real-prices", "/api/market-pulse/deep-sync", "/api/market-pulse/refresh"], async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const authCheck = await verifyAdminApiAuthorization(req.headers as Record<string, string | string[] | undefined>);
    if (!authCheck.authorized) {
      if (authCheck.statusCode === 401 || authCheck.statusCode === 403) recordAbuseSignal(getClientIp(req), "auth_failure");
      res.status(authCheck.statusCode).json({
        status: "error", code: authCheck.reason, message: "اجرای همگامسازی عمیق بازار فقط برای مدیر مجاز است.",
      });
      return;
    }
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, "sync", 3, 10 * 60 * 1000)) {
      res.setHeader("Retry-After", "600");
      res.status(429).json({
        status: "error", code: "DEEP_SYNC_RATE_LIMIT",
        message: "تعداد همگامسازیهای عمیق بیش از حد مجاز است. لطفاً بعداً تلاش کنید.",
      });
      return;
    }
    try {
      const city = validateCityParam(req.body?.city ?? req.query.city, "tehran");
      const pulse = await executeDeepMonitoringCycle(city, true);
      res.status(200).json({ ...pulse, pulse });
    } catch {
      pushAuditLog("WARN", "اجرای همگامسازی عمیق بازار با خطا مواجه شد.");
      res.status(500).json({
        status: "error", code: "DEEP_SYNC_FAILED",
        message: "همگامسازی عمیق بازار انجام نشد. اطلاعات قبلی ممکن است همچنان در دسترس باشد.",
      });
    }
  });
  app.get("/api/air-quality", async (req, res) => {
    try {
      if (!checkRateLimit(getClientIp(req), "general", 60, 60 * 1000)) { res.status(429).json({ status: "error", code: "RATE_LIMIT_EXCEEDED", message: "تعداد درخواست‌ها بیش از حد مجاز است." }); return; }
      const city = validateCityParam(req.query.city, "tehran"); const pulse = await getOrUpdateMarketPulse(city, false);
      const cityZones = CITY_AIR_STATIONS[city] || CITY_AIR_STATIONS.tehran; const totalStations = Object.keys(cityZones).length;
      const successfulStations = airQualityStationSuccessCount[city] ?? 0;
      const sourceStatus = lastAirQualityFetchSucceeded[city] === true ? "LIVE_OR_PARTIAL" : lastAirQualityFetchMs[city] ? "STALE" : "SEED";
      res.setHeader("Cache-Control", resolveApiCacheControlHeader(req));
      res.status(200).json({
        status: "ok", city, sourceStatus, lastUpdatedIso: pulse.lastUpdatedIso,
        lastAttemptMs: lastAirQualityFetchMs[city] ?? null, successfulStations, totalStations,
        airQuality: pulse.airQuality, zones: cityZones,
      });
    } catch { res.status(500).json({ status: "error", code: "AIR_QUALITY_FAILED", message: "خطا در دریافت وضعیت کیفیت هوا." }); }
  });
  registerUtilityRoutes(app, { checkRateLimit, getClientIp });
  registerSponsorAndBargainRoutes(app, { checkRateLimit, getClientIp });
  registerBackupAndChunkUploadRoutes(app);
  registerPublisherAndPlatformRoutes(app);
  registerAiAndCommerceRoutes(app, { checkRateLimit, getClientIp }); registerCommunityRoutes(app, { checkRateLimit, getClientIp }); registerKnowledgeRoutes(app, { checkRateLimit, getClientIp }); registerCommunicationsRoutes(app, { checkRateLimit, getClientIp }); registerGlobalSearchGovernanceAndAnalyticsRoutes(app, { checkRateLimit, getClientIp }); registerAccountAdminRoutes(app, { getIp: getClientIp }); registerTrustSafetyV1Routes(app, { checkRateLimit, getClientIp }); registerUnifiedPlatformWave1Routes(app, { checkRateLimit, getClientIp }); registerLegalRegulatoryRoutes(app, { checkRateLimit, getClientIp });
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DIAGNOSTIC BOOTSTRAP] Creating Vite server in middlewareMode on port ${PORT}...`);
    const vite = await createViteServer({
      server: {
        middlewareMode: true, host: true, allowedHosts: true, port: PORT,
        watch: { ignored: ["**/node_modules/**", "**/.git/**", "**/.cache-data.json*", "**/.runtime-config.json*", "**/.osm-boundaries-cache.json*", "**/.object-storage-bucket/**", "**/.cache/**"] },
        hmr: process.env.DISABLE_HMR === "true" ? false : { server },
      },
      appType: "custom",
    });
    console.log("[DIAGNOSTIC BOOTSTRAP] Vite middleware server initialized successfully.");
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      if (req.headers.upgrade === "websocket" || req.path.startsWith("/api/")) return next();
      if (isStaticAssetPath(req.path)) {
        res.status(404).setHeader("Cache-Control", "no-store").end();
        return;
      }
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        const template = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(indexPath, "utf-8"));
        const enriched = injectDynamicSeoMeta(template, req);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        const payload = compressPayloadIfAccepted(req, res, enriched, "text/html; charset=utf-8");
        res.status(200).send(payload);
      } catch (e) { next(e); }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const serveProdIndex = (req: express.Request, res: express.Response, notFoundMsg: string) => {
      if (isStaticAssetPath(req.path)) {
        res.status(404).setHeader("Cache-Control", "no-store").send("Asset Not Found");
        return;
      }
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        const enriched = injectDynamicSeoMeta(fs.readFileSync(indexPath, "utf-8"), req);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        const payload = compressPayloadIfAccepted(req, res, enriched, "text/html; charset=utf-8");
        res.status(200).send(payload);
        return;
      }
      res.status(404).send(notFoundMsg);
    };
    app.get("/", (req, res) => serveProdIndex(req, res, "Build artifacts not found"));
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          const relPath = "/" + path.relative(distPath, filePath).replace(/\\/g, "/");
          const policy = classifyStaticAssetCachePolicy(relPath);
          res.setHeader("Cache-Control", policy.cacheControl);
        },
      })
    );
    app.get("*all", (req, res) => serveProdIndex(req, res, "Not Found"));
  }
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && "status" in err && (err as { status: number }).status === 400) {
      if (!res.headersSent) {
        res.setHeader("Cache-Control", "no-store");
        res.status(400).json({ status: "error", code: "INVALID_JSON_BODY", message: "ساختار بدنه درخواست نامعتبر است." });
      }
      return;
    }
    recordAbuseSignal(getClientIp(req), "server_error"); pushAuditLog("WARN", `خطای مهارشده سرور در مسیر ${req.path}`);
    if (!res.headersSent) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Pragma", "no-cache"); res.status(500).json({ status: "error", code: "INTERNAL_SERVER_ERROR", message: "خطای داخلی در سرور رخ داد." }); }
  });
  server.listen(PORT, "0.0.0.0", () => {
    const boundIps = Object.values(os.networkInterfaces()).flat()
      .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && !i.internal && i.family === "IPv4"))
      .map((i) => i.address);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/ (interfaces: ${boundIps.join(", ") || "all"})`);
    console.log(`Server running on http://0.0.0.0:${PORT} [Vite Middleware Mode]`);
    setTimeout(() => { void (async () => { for (const c of SUPPORTED_CITY_IDS) { await getOrUpdateMarketPulse(c, false).catch(() => {}); } })(); }, 1200).unref();
    startTelemetryFlushTimer(30_000);
    backgroundMonitoringTimer = setInterval(() => { void (async () => { for (const c of SUPPORTED_CITY_IDS) { await executeDeepMonitoringCycle(c, false).catch(() => {}); } })(); }, MONITORING_INTERVAL_MS); backgroundMonitoringTimer.unref(); }); server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") console.error(`[DIAGNOSTIC PORT CONFLICT] Port ${PORT} is already in use.`);
    else if (err.code === "EACCES") console.error(`[DIAGNOSTIC PERMISSION ERROR] Permission denied on 0.0.0.0:${PORT}.`);
    else console.error(`[DIAGNOSTIC NETWORK ERROR] Server failed to bind on 0.0.0.0:${PORT} - ${err.code}: ${err.message}`);
  }); } startServer().catch((err) => { console.error("[DIAGNOSTIC BOOTSTRAP FATAL] Error during startServer:", err); process.exit(1); });