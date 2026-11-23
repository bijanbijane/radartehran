/**
 * SPA shell, static asset security headers, and dynamic SEO injection for the frontend Worker.
 */
import type { AreaUnit, IntlCurrencyCode } from '../../../src/utils/areaUnit';
import {
  classifyStaticAssetCachePolicy,
  isStaticAssetPath,
} from '../../../src/utils/serverDeliveryAndAbuseGuard';
import { injectWorkerDynamicSeoHtml } from '../../../worker/routes/healthAndMetadataRoutes';
import type { WorkerEnv } from '../../../worker/types';

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

function resolveAreaAndCurrency(url: URL): { areaUnit: AreaUnit; intlCurrency: IntlCurrencyCode } {
  const areaUnit: AreaUnit = url.searchParams.get('areaUnit') === 'sqft' ? 'sqft' : 'sqm';
  const rawCurr = String(url.searchParams.get('intlCurrency') || '');
  const intlCurrency: IntlCurrencyCode = ['IRT', 'USD', 'EUR', 'AED', 'GBP'].includes(rawCurr)
    ? (rawCurr as IntlCurrencyCode)
    : 'USD';
  return { areaUnit, intlCurrency };
}

export async function handleFrontendSpaOrStaticAssetRequest(
  request: Request,
  env: WorkerEnv,
  url: URL,
  correlationId: string,
  baseUrl: string
): Promise<Response> {
  const pathname = url.pathname;
  const isAssetFileRequest = isStaticAssetPath(pathname);
  const { areaUnit, intlCurrency } = resolveAreaAndCurrency(url);

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
        const enrichedHtml = injectWorkerDynamicSeoHtml(rawHtml, url, baseUrl, areaUnit, intlCurrency);
        const htmlResp = new Response(enrichedHtml, {
          status: assetResponse.status,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
        return applyStaticResponseSecurityHeaders(htmlResp, '/index.html', correlationId);
      }
      return applyStaticResponseSecurityHeaders(assetResponse, pathname, correlationId);
    }

    const indexUrl = new URL('/index.html', url.origin);
    const spaAssetResponse = await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    const rawHtml =
      spaAssetResponse.status === 200 ? await spaAssetResponse.text() : FALLBACK_SPA_SHELL_HTML;
    const enrichedHtml = injectWorkerDynamicSeoHtml(rawHtml, url, baseUrl, areaUnit, intlCurrency);
    const htmlResp = new Response(enrichedHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    return applyStaticResponseSecurityHeaders(htmlResp, '/index.html', correlationId);
  }

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
