/**
 * @file src/utils/osmTileProxy.ts
 * @description Keyless Free OpenStreetMap Tile Proxy & Multi-Mirror Failover for `server.ts`.
 * Respects provider HTTP caching headers (using the OSM seven-day fallback only when metadata is absent)
 * and returns a genuine HTTP 502 error when all upstream mirrors fail so Leaflet `tileerror`
 * handlers can accurately detect tile failures instead of receiving synthetic 200 SVGs.
 */

import type { Express, Request, Response } from 'express';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export interface UpstreamTileResult {
  buffer: Buffer;
  contentType: string;
  cacheControl: string;
  cacheable: boolean;
  revalidated?: boolean;
  sourceUrl: string;
  etag?: string;
  lastModified?: string;
  expiresAt: number;
}

const TILE_CACHE_MAX_ITEMS = 320;
const MAX_TILE_BYTES = 512 * 1024; // 512 KB hard cap per raster tile
const MAX_INFLIGHT_TILE_REQUESTS = 64;
const ALLOWED_RASTER_TILE_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MIN_SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // OSM fallback only when upstream cache metadata is absent.
const tileMemoryCache = new Map<string, UpstreamTileResult>();
const tileInflightRequests = new Map<string, Promise<UpstreamTileResult | null>>();

function resolveTileProxyReferer(): string {
  const configuredAppUrl = process.env.APP_URL || 'https://tehranradar.ir';
  try {
    const parsed = new URL(configuredAppUrl);
    if (parsed.protocol === 'https:') return parsed.origin + '/';
  } catch {
    // Use the canonical production origin when APP_URL is absent or invalid.
  }
  return 'https://tehranradar.ir/';
}

function hasValidRasterTileMagicBytes(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  return isPng || isJpeg || isWebp;
}

export const FREE_OSM_UPSTREAM_MIRRORS: readonly ((z: number, x: number, y: number) => string)[] = [
  // OSM Standard's exact supported endpoint. Other free mirrors have separate terms
  // and are not eligible for automatic failover without provider approval.
  (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
];

/**
 * Honors upstream cache directives for the shared server-side tile cache.
 * The OSM seven-day fallback is used only when no usable Cache-Control/Expires
 * metadata is supplied; it must never override private/no-store/no-cache or a
 * shorter explicit freshness lifetime.
 */
export function resolveUpstreamTileCachePolicy(
  headers: {
    get(name: string): string | null;
  },
  nowMs: number = Date.now(),
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
  referenceValuationMillionToman = 10000,
  fallbackTtlSeconds = 0,
): { cacheControl: string; cacheable: boolean; expiresAt: number; etag?: string; lastModified?: string; displayAreaUnitLabel: string; referenceValuationIntlText: string } {
  const rawCacheControl = (headers.get('cache-control') || '').replace(/[\r\n\u0000-\u001F\u007F]/g, '').trim();
  const rawExpires = (headers.get('expires') || '').replace(/[\r\n\u0000-\u001F\u007F]/g, '').trim();
  const etag = (headers.get('etag') || '').replace(/[\r\n\u0000-\u001F\u007F]/g, '').trim() || undefined;
  const lastModified = (headers.get('last-modified') || '').replace(/[\r\n\u0000-\u001F\u007F]/g, '').trim() || undefined;
  const directives = rawCacheControl.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const hasDirective = (name: string): boolean => directives.some((entry) => entry === name || entry.startsWith(`${name}=`));

  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(referenceValuationMillionToman, intlCurrency, 'en');
  const forbidsSharedStorage = hasDirective('private') || hasDirective('no-store') || hasDirective('no-cache');
  if (forbidsSharedStorage) {
    return {
      cacheControl: rawCacheControl || 'no-store',
      cacheable: false,
      expiresAt: nowMs,
      etag,
      lastModified,
      displayAreaUnitLabel,
      referenceValuationIntlText,
    };
  }

  const sMaxAgeMatch = rawCacheControl.match(/(?:^|,)\s*s-maxage=(\d+)/i);
  const maxAgeMatch = rawCacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  let ttlSeconds: number | null = null;
  if (sMaxAgeMatch) {
    ttlSeconds = Number.parseInt(sMaxAgeMatch[1], 10);
  } else if (maxAgeMatch) {
    ttlSeconds = Number.parseInt(maxAgeMatch[1], 10);
  } else if (rawExpires) {
    const parsedExpires = Date.parse(rawExpires);
    if (Number.isFinite(parsedExpires)) {
      ttlSeconds = Math.floor((parsedExpires - nowMs) / 1000);
    }
  }

  const usedFallback = ttlSeconds === null;
  if (usedFallback) ttlSeconds = Math.max(0, Math.floor(fallbackTtlSeconds));
  const safeTtlSeconds = Math.max(0, Number.isFinite(ttlSeconds) ? ttlSeconds : 0);
  const cacheable = safeTtlSeconds > 0;
  const cacheControl = rawCacheControl || (usedFallback && safeTtlSeconds > 0
    ? 'public, max-age=' + safeTtlSeconds
    : safeTtlSeconds > 0
      ? 'public, max-age=' + safeTtlSeconds
      : 'no-store');

  return {
    cacheControl,
    cacheable,
    expiresAt: nowMs + safeTtlSeconds * 1000,
    etag,
    lastModified,
    displayAreaUnitLabel,
    referenceValuationIntlText,
  };
}

export async function fetchTileFromMirror(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  cached?: UpstreamTileResult,
): Promise<UpstreamTileResult | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const requestHeaders: Record<string, string> = {
      'User-Agent': 'TehranHousingRadar/2.0 (https://tehranradar.ir; Free OpenStreetMap Client)',
      Referer: resolveTileProxyReferer(),
      Accept: 'image/png,image/webp,image/*;q=0.8',
    };
    if (cached?.etag) requestHeaders['If-None-Match'] = cached.etag;
    if (cached?.lastModified) requestHeaders['If-Modified-Since'] = cached.lastModified;
    const resp = await fetchImpl(url, {
      headers: requestHeaders,
      signal: controller.signal,
    });
    const upstreamHost = new URL(url).hostname.toLowerCase();
    const osmStandardFallbackTtl = upstreamHost === 'tile.openstreetmap.org' ? MIN_SEVEN_DAYS_SECONDS : 0;
    if (resp.status === 304) {
      if (!cached) return null;
      const revalidatedHeaders = {
        get(name: string): string | null {
          const responseValue = resp.headers.get(name);
          if (responseValue !== null) return responseValue;
          const normalizedName = name.toLowerCase();
          if (normalizedName === 'cache-control') return cached.cacheControl;
          if (normalizedName === 'etag') return cached.etag ?? null;
          if (normalizedName === 'last-modified') return cached.lastModified ?? null;
          return null;
        },
      };
      const cachePolicy = resolveUpstreamTileCachePolicy(
        revalidatedHeaders,
        Date.now(),
        'sqm',
        'USD',
        10000,
        osmStandardFallbackTtl,
      );
      return {
        ...cached,
        cacheControl: cachePolicy.cacheControl,
        cacheable: cachePolicy.cacheable,
        revalidated: true,
        sourceUrl: url,
        etag: cachePolicy.etag ?? cached.etag,
        lastModified: cachePolicy.lastModified ?? cached.lastModified,
        expiresAt: cachePolicy.expiresAt,
      };
    }
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_RASTER_TILE_MIMES.has(contentType)) return null;
    const declaredLength = Number.parseInt(resp.headers.get('content-length') || '0', 10);
    if (declaredLength > MAX_TILE_BYTES) return null;
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength < 64 || arrayBuf.byteLength > MAX_TILE_BYTES) return null;
    const buffer = Buffer.from(arrayBuf);
    if (!hasValidRasterTileMagicBytes(buffer)) return null;

    const cachePolicy = resolveUpstreamTileCachePolicy(
      resp.headers,
      Date.now(),
      'sqm',
      'USD',
      10000,
      osmStandardFallbackTtl,
    );
    return {
      buffer,
      contentType,
      cacheControl: cachePolicy.cacheControl,
      cacheable: cachePolicy.cacheable,
      revalidated: false,
      sourceUrl: url,
      etag: cachePolicy.etag,
      lastModified: cachePolicy.lastModified,
      expiresAt: cachePolicy.expiresAt,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function clearOsmTileMemoryCacheForTests(): void {
  tileMemoryCache.clear();
  tileInflightRequests.clear();
}

/**
 * Registers `GET /api/osm-tile/:z/:x/:y` on the Express server for keyless OpenStreetMap tile delivery.
 */
const registeredOsmTileApps = new WeakSet<Express>();
export function registerOsmTileProxyRoute(app: Express, fetchImpl: typeof fetch = fetch): void {
  if (registeredOsmTileApps.has(app)) return;
  registeredOsmTileApps.add(app);
  app.get('/api/osm-tile/:z/:x/:y', async (req: Request, res: Response) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const rawZ = String(req.params.z || '');
      const rawX = String(req.params.x || '');
      const rawY = String(req.params.y || '').replace(/(@2x)?\.(png|webp|jpg)$/i, '');

      if (!/^\d{1,2}$/.test(rawZ) || !/^\d{1,7}$/.test(rawX) || !/^\d{1,7}$/.test(rawY)) { res.status(400).end(); return; }
      const z = Number.parseInt(rawZ, 10); const x = Number.parseInt(rawX, 10); const y = Number.parseInt(rawY, 10);
      if (z < 0 || z > 19) { res.status(400).end(); return; }
      const maxCoord = (1 << z) - 1;
      if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) { res.status(400).end(); return; }

      const cacheKey = `${z}/${x}/${y}`;
      const now = Date.now();
      const cached = tileMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        res.setHeader('Content-Type', cached.contentType); res.setHeader('X-Tile-Cache', 'HIT'); res.setHeader('Cache-Control', cached.cacheControl);
        if (cached.etag) res.setHeader('ETag', cached.etag);
        if (cached.lastModified) res.setHeader('Last-Modified', cached.lastModified);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send(cached.buffer);
        return;
      }

      const staleCached = cached && cached.expiresAt <= now ? cached : undefined;

      let pending = tileInflightRequests.get(cacheKey);
      if (!pending) {
        if (tileInflightRequests.size >= MAX_INFLIGHT_TILE_REQUESTS) {
          res.status(429).json({ error: 'Too many concurrent upstream tile requests' });
          return;
        }
        pending = (async () => {
          for (const buildUrl of FREE_OSM_UPSTREAM_MIRRORS) {
            const tileUrl = buildUrl(z, x, y);
            const conditionalCache = staleCached?.sourceUrl === tileUrl ? staleCached : undefined;
            const result = await fetchTileFromMirror(tileUrl, 3200, fetchImpl, conditionalCache);
            if (result) return result;
          }
          return null;
        })().finally(() => { tileInflightRequests.delete(cacheKey); });
        tileInflightRequests.set(cacheKey, pending);
      }

      const result = await pending;
      if (result) {
        if (tileMemoryCache.size >= TILE_CACHE_MAX_ITEMS) {
          const pruneNow = Date.now();
          for (const [k, v] of tileMemoryCache) { if (v.expiresAt <= pruneNow) tileMemoryCache.delete(k); }
          if (tileMemoryCache.size >= TILE_CACHE_MAX_ITEMS) {
            const oldestKey = tileMemoryCache.keys().next().value;
            if (oldestKey) tileMemoryCache.delete(oldestKey);
          }
        }
        if (result.cacheable) tileMemoryCache.set(cacheKey, result);
        else tileMemoryCache.delete(cacheKey);
        res.setHeader('Content-Type', result.contentType); res.setHeader('X-Tile-Cache', result.revalidated ? 'REVALIDATED' : result.cacheable ? 'MISS' : 'BYPASS'); res.setHeader('Cache-Control', result.cacheControl);
        if (result.etag) res.setHeader('ETag', result.etag);
        if (result.lastModified) res.setHeader('Last-Modified', result.lastModified);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send(result.buffer);
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Tile-Cache', 'UPSTREAM_ERROR');
      res.status(502).json({ error: 'All upstream OpenStreetMap tile mirrors failed' });
    } catch {
      if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({ error: 'All upstream OpenStreetMap tile mirrors failed' });
      }
    }
  });
}
