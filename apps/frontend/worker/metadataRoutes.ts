/**
 * Frontend Worker: PWA manifest, sitemap, and robots.txt only (no /api/* metadata).
 */
import { tehranSitemapEntries } from '../../../src/data/neighborhoodListingSamples';
import { buildWorkerJsonHeaders } from '../../../worker/contextAndSecurity';
import { escapeXml, resolveWorkerBaseUrl } from '../../../worker/routes/healthAndMetadataRoutes';
import type { WorkerRequestContext } from '../../../worker/types';

export async function handleFrontendMetadataRoute(
  ctx: WorkerRequestContext
): Promise<Response | null> {
  const { method, pathname } = ctx;
  if (method !== 'GET') return null;

  if (pathname === '/manifest.json') {
    const iconSvgDataUri =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#020617"/><circle cx="256" cy="256" r="168" fill="none" stroke="#10b981" stroke-width="28"/><circle cx="256" cy="256" r="96" fill="none" stroke="#34d399" stroke-width="18" stroke-dasharray="32 20"/><circle cx="256" cy="256" r="36" fill="#10b981"/><circle cx="340" cy="180" r="22" fill="#facc15"/></svg>`
      );
    const manifest = {
      id: '/',
      name: 'رادار محله‌های تهران | ابزار تحلیل قیمت مسکن و کیفیت زندگی',
      short_name: 'رادار تهران',
      description:
        'مقایسهٔ محله‌ها، بررسی داده‌های موجود بازار مسکن و استفاده از محاسبه‌گرهای مقدماتی خرید، اجاره و هزینه‌های ملکی.',
      dir: 'rtl',
      lang: 'fa-IR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#020617',
      theme_color: '#10b981',
      categories: ['finance', 'lifestyle', 'navigation'],
      icons: [
        { src: iconSvgDataUri, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: iconSvgDataUri, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      ],
    };
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600',
      extraHeaders: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
    });
    return new Response(JSON.stringify(manifest), { status: 200, headers });
  }

  if (pathname === '/sitemap.xml') {
    const baseUrl = resolveWorkerBaseUrl(ctx);
    const todayIso = new Date().toISOString().split('T')[0];
    const urls = tehranSitemapEntries(baseUrl);
    const xmlItems = urls
      .map(
        (u) =>
          `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${todayIso}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlItems}\n</urlset>`;
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600',
      extraHeaders: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return new Response(xml, { status: 200, headers });
  }

  if (pathname === '/robots.txt') {
    const baseUrl = resolveWorkerBaseUrl(ctx);
    const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`;
    const headers = buildWorkerJsonHeaders(ctx, {
      cacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
      extraHeaders: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
    return new Response(robotsTxt, { status: 200, headers });
  }

  return null;
}