/**
 * @file worker/index.ts
 * @description Cloudflare Workers ES Module Entrypoint for Tehran Radar (Phase 1, Phase 2 & Staging Platform).
 * Handles migrated `/api/*` and SEO routes natively at the edge, enforces explicit JSON boundaries
 * for unmigrated `/api/*` endpoints, processes Cloudflare Queues (`RADAR_QUEUE` + `RADAR_DLQ`) and
 * Cron Triggers, and serves the React 19 SPA with dynamic SSR SEO metadata injection via `ASSETS`.
 *
 * Architectural Invariant:
 * This module and its import graph MUST NEVER import `express`, `firebase-admin`, `sharp`,
 * or `src/utils/serverMarketPulseEngine.ts`.
 */
import type { AreaUnit, IntlCurrencyCode } from '../src/utils/areaUnit';
import {
  classifyStaticAssetCachePolicy,
  isStaticAssetPath,
} from '../src/utils/serverDeliveryAndAbuseGuard';
import {
  buildObservabilityRecord,
  createWorkerRequestContext,
  jsonWorkerResponse,
} from './contextAndSecurity';
import {
  buildCanonicalCronEnvelopes,
  createCanonicalQueueJobDispatcher,
} from './queues/jobDispatcher';
import { releaseWorkerMutationPermitIfHeld } from './account-lifecycle/writeBlockWorkerGate';
import { resolveUserDb, resolveResearchDb } from './db/bindingResolver';
import {
  processPendingResearchErasureOutbox,
  resolveDedicatedLifecycleReceiptSecret,
} from './account-lifecycle/workerLifecycleRuntime';
import { resolveD1WritePauseState } from './db/writePause';
import {
  processRadarQueueBatch,
  type RadarQueueEnvelope,
} from './queues/queueAndCronProcessor';
import { dispatchWorkerApiOrSeoRequest } from './router';
import { sanitizeWorkerErrorMessage } from './errorSanitizer';
import {
  injectWorkerDynamicSeoHtml,
  resolveWorkerBaseUrl,
} from './routes/healthAndMetadataRoutes';
import type { MessageBatch, WorkerEnv, WorkerExecutionContext } from './types';

const FALLBACK_SPA_SHELL_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>رادار محله‌های تهران | مقایسه قیمت مسکن، رهن و کیفیت زندگی</title>
    <meta name="description" content="مقایسه تحلیلی محله‌های تهران، کرج، مشهد، اصفهان و شیراز؛ بررسی قیمت مسکن، رهن، ترافیک و کیفیت هوا." />
    <meta property="og:title" content="رادار محله‌های تهران | مقایسه قیمت مسکن، رهن و کیفیت زندگی" />
    <meta property="og:description" content="مقایسه تحلیلی محله‌های تهران، کرج، مشهد، اصفهان و شیراز؛ بررسی قیمت مسکن، رهن، ترافیک و کیفیت هوا." />
    <meta property="og:url" content="https://radartehran.ir/" />
    <link rel="canonical" href="https://radartehran.ir/" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

function applyStaticResponseSecurityHeaders(
  sourceResponse: Response,
  pathname: string,
  correlationId: string
): Response {
  const headers = new Headers(sourceResponse.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=()');
  headers.set('X-Correlation-Id', correlationId);
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', classifyStaticAssetCachePolicy(pathname).cacheControl);
  }
  return new Response(sourceResponse.body, {
    status: sourceResponse.status,
    statusText: sourceResponse.statusText,
    headers,
  });
}

async function handleSpaOrStaticAssetRequest(
  request: Request,
  env: WorkerEnv,
  url: URL,
  correlationId: string,
  baseUrl: string
): Promise<Response> {
  const pathname = url.pathname;
  const isAssetFileRequest = isStaticAssetPath(pathname);

  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404 || isAssetFileRequest) {
      const contentType = assetResponse.headers.get('content-type') || '';
      if (
        !isAssetFileRequest &&
        contentType.includes('text/html') &&
        (url.searchParams.has('city') ||
          url.searchParams.has('hood') ||
          url.searchParams.has('compare'))
      ) {
        const rawHtml = await assetResponse.text();
        const areaUnit: AreaUnit = url.searchParams.get('areaUnit') === 'sqft' ? 'sqft' : 'sqm';
        const rawCurr = String(url.searchParams.get('intlCurrency') || '');
        const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED', 'GBP'].includes(rawCurr)
          ? (rawCurr as IntlCurrencyCode)
          : 'USD';
        const enrichedHtml = injectWorkerDynamicSeoHtml(
          rawHtml,
          url,
          baseUrl,
          areaUnit,
          intlCurrency
        );
        const htmlResp = new Response(enrichedHtml, {
          status: assetResponse.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
        return applyStaticResponseSecurityHeaders(htmlResp, '/index.html', correlationId);
      }
      return applyStaticResponseSecurityHeaders(assetResponse, pathname, correlationId);
    }

    // SPA navigation fallback via `/index.html` asset fetch
    const indexUrl = new URL('/index.html', url.origin);
    const spaAssetResponse = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    const rawHtml =
      spaAssetResponse.status === 200 ? await spaAssetResponse.text() : FALLBACK_SPA_SHELL_HTML;
    const areaUnit: AreaUnit = url.searchParams.get('areaUnit') === 'sqft' ? 'sqft' : 'sqm';
    const rawCurr = String(url.searchParams.get('intlCurrency') || '');
    const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED', 'GBP'].includes(rawCurr)
      ? (rawCurr as IntlCurrencyCode)
      : 'USD';
    const enrichedHtml = injectWorkerDynamicSeoHtml(rawHtml, url, baseUrl, areaUnit, intlCurrency);
    const htmlResp = new Response(enrichedHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    return applyStaticResponseSecurityHeaders(htmlResp, '/index.html', correlationId);
  }

  // Fallback when ASSETS binding is not attached in unit test harness
  if (isAssetFileRequest) {
    return new Response('Static asset not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Correlation-Id': correlationId,
      },
    });
  }

  const areaUnit: AreaUnit = url.searchParams.get('areaUnit') === 'sqft' ? 'sqft' : 'sqm';
  const rawCurr = String(url.searchParams.get('intlCurrency') || '');
  const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED', 'GBP'].includes(rawCurr)
    ? (rawCurr as IntlCurrencyCode)
    : 'USD';
  const enrichedHtml = injectWorkerDynamicSeoHtml(
    FALLBACK_SPA_SHELL_HTML,
    url,
    baseUrl,
    areaUnit,
    intlCurrency
  );
  const fallbackHtmlResp = new Response(enrichedHtml, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  return applyStaticResponseSecurityHeaders(fallbackHtmlResp, '/index.html', correlationId);
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv = {},
    _executionCtx?: WorkerExecutionContext
  ): Promise<Response> {
    const reqCtx = createWorkerRequestContext(request, env);
    try {
      const apiOrSeoResult = await dispatchWorkerApiOrSeoRequest(reqCtx);
      if (apiOrSeoResult) {
        buildObservabilityRecord(
          reqCtx,
          apiOrSeoResult.response.status,
          apiOrSeoResult.routePattern,
          apiOrSeoResult.migrationStatus
        );
        return apiOrSeoResult.response;
      }

      const baseUrl = resolveWorkerBaseUrl(reqCtx);
      const staticOrSpaResponse = await handleSpaOrStaticAssetRequest(
        request,
        env,
        reqCtx.url,
        reqCtx.correlationId,
        baseUrl
      );
      buildObservabilityRecord(reqCtx, staticOrSpaResponse.status, 'SPA_OR_STATIC_ASSET', 'VERIFIED');
      return staticOrSpaResponse;
    } catch (err) {
      const errorCategory = err instanceof Error ? err.name : 'UNHANDLED_WORKER_EXCEPTION';
      const safeErrorMessage = err instanceof Error
        ? sanitizeWorkerErrorMessage(err.message)
        : 'Non-Error exception';
      console.error('WORKER_UNHANDLED_EXCEPTION', JSON.stringify({
        correlationId: reqCtx.correlationId,
        method: reqCtx.method,
        pathname: reqCtx.pathname,
        errorCategory,
        errorMessage: safeErrorMessage,
      }));
      buildObservabilityRecord(reqCtx, 500, reqCtx.pathname, 'ERROR', errorCategory);
      return jsonWorkerResponse(reqCtx, 500, {
        status: 'error',
        code: 'INTERNAL_WORKER_ERROR',
        correlationId: reqCtx.correlationId,
        message: 'خطای داخلی در پردازش درخواست در لبه شبکه رخ داد.',
      });
    } finally {
      await releaseWorkerMutationPermitIfHeld(reqCtx);
    }
  },

  async queue(
    batch: MessageBatch<RadarQueueEnvelope>,
    env: WorkerEnv = {},
    _executionCtx?: WorkerExecutionContext
  ): Promise<void> {
    const d1WritePause = resolveD1WritePauseState(env);
    if (d1WritePause.paused) {
      batch.retryAll({ delaySeconds: Math.max(60, d1WritePause.retryAfterSeconds) });
      return;
    }
    await processRadarQueueBatch({
      batch,
      db: resolveUserDb(env),
      dlq: env.RADAR_DLQ,
      executeJob: createCanonicalQueueJobDispatcher(env),
    });
  },

  async scheduled(
    event: { scheduledTime: number; cron: string },
    env: WorkerEnv = {},
    _executionCtx?: WorkerExecutionContext
  ): Promise<void> {
    if (resolveD1WritePauseState(env).paused) return;
    if (event.cron === '0 * * * *') {
      const userDb = resolveUserDb(env);
      if (!userDb) throw new Error('USER_DB_BINDING_UNAVAILABLE_OR_DOMAIN_COLLISION');
      const receiptSecret = resolveDedicatedLifecycleReceiptSecret(env);
      if (!receiptSecret) throw new Error('LIFECYCLE_RECEIPT_HMAC_SECRET_MISSING_WEAK_OR_REUSED');
      await processPendingResearchErasureOutbox({
        userDb,
        researchDb: resolveResearchDb(env),
        receiptSecret,
      });
    }
    if (!env.RADAR_QUEUE) {
      throw new Error('RADAR_QUEUE_BINDING_MISSING_FOR_SCHEDULED_EVENT');
    }
    const envelopes = buildCanonicalCronEnvelopes({
      cron: event.cron,
      scheduledTime: event.scheduledTime,
    });
    for (const envelope of envelopes) {
      await env.RADAR_QUEUE.send(envelope);
    }
  },
};
