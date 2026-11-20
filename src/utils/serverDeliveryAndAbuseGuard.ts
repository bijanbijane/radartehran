import type { Request, Response, NextFunction } from 'express'; import zlib from 'node:zlib'; import { validateSafeReturnPath } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type RateBucketType = 'general' | 'sync' | 'ai' | 'lead' | 'tile' | 'upload' | 'download' | 'boundary' | 'call_track'; export type AbuseSignalCategory = 'auth_failure' | 'server_error' | 'not_found_enumeration' | 'bulk_extraction' | 'prompt_injection' | 'rate_limit_exceeded'; interface RateLimitBucket { count: number; resetAtMs: number; } interface AbusePenaltyRecord { strikes: number; blockedUntilMs: number; lastSignalAtMs: number; lastCategory: AbuseSignalCategory; }
const MAX_RATE_LIMIT_KEYS_PER_BUCKET = 20_000; const ABUSE_PENALTY_WINDOW_MS = 15 * 60 * 1000; const bucketMaps: Record<RateBucketType, Map<string, RateLimitBucket>> = { general: new Map(), sync: new Map(), ai: new Map(), lead: new Map(), tile: new Map(), upload: new Map(), download: new Map(), boundary: new Map(), call_track: new Map(), }; const accountQuotaMaps = new Map<string, RateLimitBucket>(); const abusePenaltyMap = new Map<string, AbusePenaltyRecord>(); let totalBlockedRequests = 0; let rateLimitOperations = 0; function removeExpiredEntries(map: Map<string, RateLimitBucket>, now: number): void { for (const [key, entry] of map) { if (now >= entry.resetAtMs) map.delete(key); } } function removeExpiredAbusePenalties(now: number): void { for (const [key, entry] of abusePenaltyMap) { if (now >= entry.blockedUntilMs && now - entry.lastSignalAtMs > ABUSE_PENALTY_WINDOW_MS) { abusePenaltyMap.delete(key); } } }
export function resolveTrustedProxySetting(rawEnvValue = process.env.TRUST_PROXY_HOPS): false | number { const trimmed = typeof rawEnvValue === 'string' ? rawEnvValue.trim() : ''; if (!trimmed || trimmed === '0' || trimmed.toLowerCase() === 'false') return false; const hops = Number(trimmed); return Number.isInteger(hops) && hops >= 1 && hops <= 5 ? hops : false; }
function normalizeIpString(rawIp: string): string { const trimmed = rawIp.trim(); if (!trimmed || trimmed.length > 128) return 'unknown'; const first = trimmed.split(',')[0].trim(); if (!/^[a-fA-F0-9:.]+$/.test(first)) return 'unknown'; return first.startsWith('::ffff:') && /^\d+\.\d+\.\d+\.\d+$/.test(first.slice(7)) ? first.slice(7) : first; }
export function getClientIp(req: Request): string { const trustProxySetting = req.app?.get?.('trust proxy'); const trustProxyEnabled = typeof trustProxySetting === 'number' && trustProxySetting >= 1 && trustProxySetting <= 5; const candidate = trustProxyEnabled ? req.ip || req.socket?.remoteAddress || 'unknown' : req.socket?.remoteAddress || req.ip || 'unknown'; return normalizeIpString(String(candidate || 'unknown')); }
export function isLegitimateCrawlerRequest(req: Request): boolean { if (req.method !== 'GET' && req.method !== 'HEAD') return false; const p = req.path || '/'; if (p !== '/' && p !== '/sitemap.xml' && p !== '/robots.txt' && p !== '/manifest.json') return false; const ua = String(req.headers['user-agent'] || '').toLowerCase(); return /googlebot|bingbot|slurp|duckduckbot|yandexbot|baiduspider|applebot|telegrambot|twitterbot|linkedinbot|whatsapp/i.test(ua); } export function recordAbuseSignal( ip: string, category: AbuseSignalCategory, now = Date.now(),
): { blocked: boolean; blockedUntilMs: number; strikes: number } { if (category === 'server_error') return { blocked: false, blockedUntilMs: 0, strikes: 0 }; if (!ip || ip === 'unknown') { totalBlockedRequests++; return { blocked: true, blockedUntilMs: now + 60_000, strikes: 99 }; } if (abusePenaltyMap.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) { removeExpiredAbusePenalties(now); if (!abusePenaltyMap.has(ip) && abusePenaltyMap.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) { const oldestKey = abusePenaltyMap.keys().next().value; if (oldestKey) abusePenaltyMap.delete(oldestKey); } } const existing = abusePenaltyMap.get(ip); const weight = category === 'prompt_injection' || category === 'bulk_extraction' ? 3 : category === 'auth_failure' ? 2 : 1; const activeStrikes = existing && now - existing.lastSignalAtMs <= ABUSE_PENALTY_WINDOW_MS ? existing.strikes + weight : weight;
  const cooldownMs = activeStrikes >= 10 ? Math.min(30 * 60 * 1000, 60_000 * 2 ** Math.min(5, activeStrikes - 10)) : 0; const blockedUntilMs = cooldownMs > 0 ? now + cooldownMs : existing?.blockedUntilMs ?? 0; abusePenaltyMap.set(ip, { strikes: activeStrikes, blockedUntilMs, lastSignalAtMs: now, lastCategory: category }); if (blockedUntilMs > now) totalBlockedRequests++; return { blocked: blockedUntilMs > now, blockedUntilMs, strikes: activeStrikes }; }
export function isIpInAbuseCooldown( ip: string, now = Date.now(), ): { blocked: boolean; retryAfterSec: number; category?: AbuseSignalCategory } { const entry = abusePenaltyMap.get(ip); if (!entry || now >= entry.blockedUntilMs) return { blocked: false, retryAfterSec: 0 };
  return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000)), category: entry.lastCategory }; }
export function checkRateLimit( ip: string, bucketType: RateBucketType, maxRequests: number, windowMs: number, now = Date.now(), ): boolean { const map = bucketMaps[bucketType] ?? bucketMaps.general;
  if (!ip || ip === 'unknown' || !Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isFinite(windowMs) || windowMs < 1000) { totalBlockedRequests++; return false; }
  if (isIpInAbuseCooldown(ip, now).blocked) { totalBlockedRequests++; return false; }
  rateLimitOperations++; if (rateLimitOperations % 200 === 0 || map.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) { removeExpiredEntries(map, now); }
  const current = map.get(ip); if (current && now < current.resetAtMs) { if (current.count >= maxRequests) { totalBlockedRequests++;
      recordAbuseSignal(ip, 'rate_limit_exceeded', now); return false; }
    current.count++; return true; }
  if (!current && map.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) { totalBlockedRequests++; return false;
  }
  map.set(ip, { count: 1, resetAtMs: now + windowMs }); return true;
}
export function checkAccountQuota(uid: string, actionKey: string, maxRequests: number, windowMs: number, now = Date.now()): boolean {
  const normalizedUid = typeof uid === 'string' ? uid.trim() : '';
  if (!normalizedUid || normalizedUid.length > 128 || maxRequests < 1 || windowMs < 1000) return false;
  if (accountQuotaMaps.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) removeExpiredEntries(accountQuotaMaps, now);
  const compositeKey = `${actionKey}:${normalizedUid}`;
  const current = accountQuotaMaps.get(compositeKey);
  if (current && now < current.resetAtMs) {
    if (current.count >= maxRequests) { totalBlockedRequests++; return false; }
    current.count++; return true;
  }
  if (!current && accountQuotaMaps.size >= MAX_RATE_LIMIT_KEYS_PER_BUCKET) { totalBlockedRequests++; return false; }
  accountQuotaMaps.set(compositeKey, { count: 1, resetAtMs: now + windowMs });
  return true;
}
export function getRateLimitTelemetry(areaUnit: AreaUnit = 'sqm', intlCurrency: IntlCurrencyCode = 'USD', now = Date.now()): {
  activeTrackedIps: number; totalBlockedRequests: number; activeAbuseCooldowns: number;
  displayAreaUnitLabel?: string; referenceValuationIntlText?: string;
} {
  removeExpiredEntries(bucketMaps.general, now); removeExpiredAbusePenalties(now);
  return {
    activeTrackedIps: bucketMaps.general.size, totalBlockedRequests, activeAbuseCooldowns: abusePenaltyMap.size,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(120, intlCurrency, 'en'),
  };
}
export function resetRateLimitStateForTests(): void {
  for (const map of Object.values(bucketMaps)) map.clear();
  accountQuotaMaps.clear(); abusePenaltyMap.clear();
  totalBlockedRequests = 0; rateLimitOperations = 0;
}
export type StaticAssetCacheTier = 'immutable_hashed' | 'mutable_entry' | 'public_metadata' | 'private_api' | 'public_api';
export function classifyStaticAssetCachePolicy(urlPath: string): { tier: StaticAssetCacheTier; cacheControl: string } {
  const cleanPath = (urlPath || '/').split('?')[0].trim();
  if (/^\/assets\/.+-[a-zA-Z0-9_-]{6,}\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|gif)$/i.test(cleanPath)) return { tier: 'immutable_hashed', cacheControl: 'public, max-age=31536000, immutable' };
  if (cleanPath === '/' || cleanPath === '/index.html' || cleanPath.endsWith('.html') || cleanPath === '/sw.js' || cleanPath === '/service-worker.js') return { tier: 'mutable_entry', cacheControl: 'no-cache, no-store, must-revalidate' };
  if (cleanPath === '/manifest.json' || cleanPath === '/sitemap.xml' || cleanPath === '/robots.txt') return { tier: 'public_metadata', cacheControl: 'public, max-age=3600, stale-while-revalidate=86400' };
  return { tier: 'mutable_entry', cacheControl: 'public, max-age=300, must-revalidate' };
}
export function isStaticAssetPath(urlPath: string): boolean {
  const cleanPath = (urlPath || '').split('?')[0].trim();
  if (cleanPath.startsWith('/assets/')) return true;
  return /\.(js|mjs|css|map|woff2?|ttf|otf|eot|png|jpe?g|webp|avif|gif|ico|svg|mp4|webm|wasm)$/i.test(cleanPath);
}
export function resolveCanonicalBaseUrl(
  configuredAppUrl?: string | null,
  nodeEnv = process.env.NODE_ENV,
): string {
  const raw = typeof configuredAppUrl === 'string' ? configuredAppUrl.trim() : '';
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'https:' || (nodeEnv !== 'production' && parsed.protocol === 'http:')) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
    }
  }
  return nodeEnv === 'production' ? 'https://radartehran.ir' : 'http://localhost:3000';
}
export function resolveCanonicalRedirectUrl(
  req: Request,
  configuredAppUrl?: string | null,
  nodeEnv = process.env.NODE_ENV,
): string | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (req.path.startsWith('/api/') || !configuredAppUrl) return null;
  let canonicalOrigin: URL;
  try {
    canonicalOrigin = new URL(configuredAppUrl);
    if (canonicalOrigin.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const canonicalHost = canonicalOrigin.host.toLowerCase();
  if (!canonicalHost || canonicalHost.startsWith('localhost') || canonicalHost.startsWith('127.0.0.1')) return null;
  const rawHost = String(req.headers.host || '').trim().toLowerCase();
  if (!rawHost || rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1')) return null;
  const trustProxy = Boolean(req.app?.get?.('trust proxy'));
  const forwardedProto = trustProxy
    ? String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim().toLowerCase()
    : String(req.protocol || 'https').toLowerCase();
  const isWwwVariant = rawHost === `www.${canonicalHost}`;
  const isHttpOnCanonical = nodeEnv === 'production' && rawHost === canonicalHost && forwardedProto === 'http';
  if (!isWwwVariant && !isHttpOnCanonical) return null;
  const safePath = validateSafeReturnPath(req.originalUrl || req.url || '/', '/');
  return `https://${canonicalHost}${safePath}`;
}
export function buildProductionContentSecurityPolicyHeader(
  frameAncestors = "'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com",
): string {
  const safeFrameAncestors = frameAncestors.trim() || "'none'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' ws: wss: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://nominatim.openstreetmap.org https://overpass-api.de https://unpkg.com https://api.open-meteo.com https://air-quality-api.open-meteo.com",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    `frame-ancestors ${safeFrameAncestors}`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}
export function applyDeliveryBoundarySecurityHeaders(
  req: Request,
  res: Response,
  nodeEnv = process.env.NODE_ENV,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.path?.startsWith('/api/')) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Permissions-Policy', 'accelerometer=(), autoplay=(), camera=(), encrypted-media=(), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), sync-xhr=(), usb=(), xr-spatial-tracking=()');
  res.setHeader('Content-Security-Policy', buildProductionContentSecurityPolicyHeader());
  if (nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}
export function hasAuthenticationHeaders(req: Request): boolean {
  for (const [key, val] of Object.entries(req.headers || {})) {
    const lower = key.toLowerCase();
    if ((lower === 'authorization' || lower === 'x-admin-token' || lower === 'x-payment-context' || lower === 'x-payment-signature' || lower === 'payment-context' || lower === 'payment-signature') && val !== undefined && val !== '') return true;
  }
  return false;
}
export function resolveApiCacheControlHeader(req: Request): string {
  if (hasAuthenticationHeaders(req) || req.method !== 'GET' || req.query?.refresh !== undefined) {
    return 'private, no-store, no-cache, must-revalidate';
  }
  if (
    req.path.startsWith('/api/admin/') ||
    req.path === '/api/system-health' ||
    req.path.startsWith('/api/object-storage/') ||
    req.path.startsWith('/api/buyer-alerts') ||
    req.path.startsWith('/api/sponsors/') ||
    req.path.startsWith('/api/bargains/') ||
    req.path.startsWith('/api/my-') ||
    req.path.startsWith('/api/publisher/')
  ) {
    return 'private, no-store, no-cache, must-revalidate';
  }
  if (req.path === '/api/market-pulse') return 'public, max-age=30, stale-while-revalidate=60';
  if (req.path === '/api/air-quality' || req.path === '/api/openapi.json') {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  return 'no-store';
}
const FORBIDDEN_QUERY_CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  'token', 'id_token', 'idtoken', 'access_token', 'accesstoken', 'admin_token', 'admintoken',
  'x_admin_token', 'x-admin-token', 'api_key', 'apikey', 'secret', 'password', 'bottoken', 'bot_token',
]);
const SINGLE_VALUE_QUERY_KEYS: ReadonlySet<string> = new Set([
  'city', 'hood', 'hoodid', 'id', 'mode', 'refresh', 'objectid', 'key', 'returnto', 'redirect', 'next', 'lat', 'lng', 'compare', 'areaunit', 'intlcurrency', 'limit', 'offset', 'pages',
]);
export function validateQueryParametersAndRejectCreds(
  queryObj: Record<string, unknown> | undefined,
): { ok: true; code?: 'CREDENTIALS_IN_QUERY_FORBIDDEN' | 'DUPLICATE_QUERY_PARAMETER'; key?: string } | { ok: false; code: 'CREDENTIALS_IN_QUERY_FORBIDDEN' | 'DUPLICATE_QUERY_PARAMETER'; key: string } {
  if (!queryObj || typeof queryObj !== 'object') return { ok: true };
  for (const [rawKey, val] of Object.entries(queryObj)) {
    const lowerKey = rawKey.toLowerCase();
    if (FORBIDDEN_QUERY_CREDENTIAL_KEYS.has(lowerKey) || lowerKey === '__proto__' || lowerKey === 'constructor' || lowerKey === 'prototype' || lowerKey.includes('__proto__') || lowerKey.includes('prototype')) {
      return { ok: false, code: 'CREDENTIALS_IN_QUERY_FORBIDDEN', key: rawKey };
    }
    if (Array.isArray(val) && SINGLE_VALUE_QUERY_KEYS.has(lowerKey)) {
      return { ok: false, code: 'DUPLICATE_QUERY_PARAMETER', key: rawKey };
    }
  }
  return { ok: true };
}
export function compressPayloadIfAccepted(
  req: Request,
  res: Response,
  body: string | Buffer,
  contentType: string,
): Buffer | string {
  const rawBuffer = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body;
  if (rawBuffer.byteLength < 1024 || hasAuthenticationHeaders(req) || req.path?.startsWith('/api/admin/')) {
    res.setHeader('Content-Type', contentType);
    return body;
  }
  const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', contentType);
  if (/\bbr\b/.test(acceptEncoding)) {
    res.setHeader('Content-Encoding', 'br');
    return zlib.brotliCompressSync(rawBuffer, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
  }
  if (/\bgzip\b/.test(acceptEncoding)) {
    res.setHeader('Content-Encoding', 'gzip');
    return zlib.gzipSync(rawBuffer, { level: 6 });
  }
  return body;
}
export function createDeliveryAndAbuseMiddleware(options?: { getAppUrl?: () => string | null | undefined }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    applyDeliveryBoundarySecurityHeaders(req, res);
    const queryCheck = validateQueryParametersAndRejectCreds(req.query as Record<string, unknown> | undefined);
    if (!queryCheck.ok) {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.status(400).json({
        status: 'error',
        code: queryCheck.code,
        message:
          queryCheck.code === 'CREDENTIALS_IN_QUERY_FORBIDDEN'
            ? 'ارسال اطلاعات احراز هویت در Query String مجاز نیست.'
            : `پارامتر تکراری غیرمجاز در آدرس درخواست: ${queryCheck.key}`,
      });
      return;
    }
    const canonicalRedirect = resolveCanonicalRedirectUrl(req, options?.getAppUrl?.());
    if (canonicalRedirect) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(308, canonicalRedirect);
      return;
    }
    const ip = getClientIp(req);
    if (req.path.startsWith('/api/osm-tile/')) {
      if (!checkRateLimit(ip, 'tile', 360, 60 * 1000)) {
        res.status(429).end();
        return;
      }
      next();
      return;
    }
    if ((req.path === '/api/object-storage/upload' || req.path === '/api/object-storage/upload-init' || req.path === '/api/object-storage/upload-complete') && req.method === 'POST') {
      if (!checkRateLimit(ip, 'upload', 8, 10 * 60 * 1000)) {
        res.status(429).json({ status: 'error', code: 'UPLOAD_RATE_LIMIT_EXCEEDED', message: 'تعداد آپلودهای شما بیش از حد مجاز است.' });
        return;
      }
    }
    if (req.path.startsWith('/api/object-storage/file/') && req.method === 'GET') {
      if (!checkRateLimit(ip, 'download', 120, 60 * 1000)) {
        res.status(429).json({ status: 'error', code: 'DOWNLOAD_RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌های دریافت فایل بیش از حد مجاز است.' });
        return;
      }
    }
    if (req.path === '/api/neighborhood-boundaries/resolve' && req.method === 'POST') {
      if (!checkRateLimit(ip, 'boundary', 30, 60 * 1000)) {
        res.status(429).json({ status: 'error', code: 'BOUNDARY_RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌های دریافت مرز محله بیش از حد مجاز است.' });
        return;
      }
    }
    if (req.path === '/api/healthz' || req.path === '/api/health/liveness' || req.path === '/api/health/readiness') { next(); return; }
    if (req.path.startsWith('/api/')) {
      if (hasAuthenticationHeaders(req) || req.path.startsWith('/api/admin/')) {
        res.setHeader('Vary', 'Origin, Authorization, X-Admin-Token, Accept-Encoding');
      }
      const cooldown = isIpInAbuseCooldown(ip);
      if (cooldown.blocked) {
        res.setHeader('Retry-After', String(cooldown.retryAfterSec));
        res.status(429).json({ status: 'error', code: 'ABUSE_COOLDOWN_ACTIVE', message: 'به دلیل الگوی درخواست‌های غیرعادی، دسترسی موقتاً محدود شده است.' }); return; } if (!checkRateLimit(ip, 'general', 180, 60 * 1000)) { res.status(429).json({ status: 'error', code: 'GENERAL_RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌ها بیش از حد مجاز است.' }); return; } } next(); }; }