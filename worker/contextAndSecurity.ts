/**
 * @file worker/contextAndSecurity.ts
 * @description Request context builder, CF-Connecting-IP trust boundary enforcement,
 * isolate-level sliding-window rate limiter, security header helpers, and safe JSON body parser.
 */
import {
  resolveCanonicalBaseUrl,
  type RateBucketType,
} from '../src/utils/serverDeliveryAndAbuseGuard';
import type {
  DeploymentEnvironmentName,
  WorkerEnv,
  WorkerObservabilityRecord,
  WorkerRequestContext,
} from './types';

const SAFE_CORRELATION_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveWorkerEnvironment(env: WorkerEnv): DeploymentEnvironmentName {
  const raw = (env.ENVIRONMENT || env.APP_ENV || env.WORKER_ENV || 'development').trim().toLowerCase();
  if (raw === 'production' || raw === 'staging' || raw === 'preview') {
    return raw;
  }
  return 'development';
}

export function resolveWorkerCanonicalBaseUrl(env: WorkerEnv): string {
  const envName = resolveWorkerEnvironment(env);
  const nodeEnv = envName === 'production' ? 'production' : 'development';
  return resolveCanonicalBaseUrl(env.APP_URL, nodeEnv);
}

export function resolveAllowedCorsOrigin(
  originHeader?: string,
  configuredAppUrl?: string,
  nodeEnv: 'production' | 'development' = 'production'
): string | null {
  if (!originHeader) return null;
  const trimmed = originHeader.trim();
  const canonical = resolveCanonicalBaseUrl(configuredAppUrl, nodeEnv);
  if (trimmed === canonical) return trimmed;
  if (
    nodeEnv !== 'production' &&
    (trimmed === 'http://localhost:3000' ||
      trimmed === 'http://127.0.0.1:3000' ||
      /^https:\/\/radartehran-(?:staging|preview)(?:\.[a-z0-9_-]+)?\.workers\.dev$/i.test(trimmed))
  ) {
    return trimmed;
  }
  return null;
}

/**
 * Extracts client IP strictly from Cloudflare's edge-verified `CF-Connecting-IP` header.
 * Never trusts client-spoofed `X-Forwarded-For` headers when `CF-Connecting-IP` is absent.
 */
export function extractTrustedWorkerClientIp(request: Request): {
  ip: string;
  trustedEdgeIp: boolean;
} {
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp && cfIp.length <= 64 && !cfIp.includes(',')) {
    return { ip: cfIp, trustedEdgeIp: true };
  }
  return { ip: '127.0.0.1', trustedEdgeIp: false };
}

export function createWorkerRequestContext(
  request: Request,
  env: WorkerEnv = {}
): WorkerRequestContext {
  const url = new URL(request.url);
  const incomingCorrelation =
    request.headers.get('x-correlation-id')?.trim() ||
    request.headers.get('x-request-id')?.trim() ||
    '';
  const correlationId = SAFE_CORRELATION_ID_RE.test(incomingCorrelation)
    ? incomingCorrelation
    : `cf_${crypto.randomUUID()}`;
  const { ip, trustedEdgeIp } = extractTrustedWorkerClientIp(request);

  return {
    request,
    env,
    url,
    requestId: `req_${crypto.randomUUID()}`,
    correlationId,
    method: request.method.toUpperCase(),
    pathname: url.pathname,
    clientIp: ip,
    trustedEdgeIp,
    environment: resolveWorkerEnvironment(env),
    startedAtMs: Date.now(),
    routeId: 'UNMATCHED',
    implementationId: 'worker-foundation-v1',
  };
}

interface IsolateRateWindow {
  timestamps: number[];
}

const isolateRateBuckets = new Map<string, IsolateRateWindow>();
const MAX_TRACKED_ISOLATE_KEYS = 2_500;

export function checkWorkerRateLimit(
  ip: string,
  bucket: RateBucketType,
  maxRequests: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  if (isolateRateBuckets.size > MAX_TRACKED_ISOLATE_KEYS) {
    isolateRateBuckets.clear();
  }
  const key = `${bucket}:${ip}`;
  const cutoff = nowMs - windowMs;
  const entry = isolateRateBuckets.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0] ?? nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    isolateRateBuckets.set(key, entry);
    return { allowed: false, retryAfterSeconds };
  }

  entry.timestamps.push(nowMs);
  isolateRateBuckets.set(key, entry);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetWorkerRateLimitWindowsForTests(): void {
  isolateRateBuckets.clear();
}

export const resetWorkerRateLimiterForTests = resetWorkerRateLimitWindowsForTests;

export interface WorkerJsonHeaderOptions {
  readonly cacheControl?: string;
  readonly extraHeaders?: Record<string, string>;
}

export function buildWorkerJsonHeaders(
  ctx: WorkerRequestContext,
  options?: WorkerJsonHeaderOptions
): Headers {
  const cacheControl = options?.cacheControl ?? 'no-store';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=()',
    'X-Correlation-Id': ctx.correlationId,
    'X-Request-Id': ctx.requestId,
    'X-Radar-Runtime': 'cloudflare-worker',
    ...(options?.extraHeaders ?? {}),
  });
  if (cacheControl === 'no-store') {
    headers.set('Pragma', 'no-cache');
  }

  const originHeader = ctx.request.headers.get('origin') ?? undefined;
  const allowedOrigin = resolveAllowedCorsOrigin(
    originHeader,
    ctx.env.APP_URL,
    ctx.environment === 'production' ? 'production' : 'development'
  );
  // Cacheable CORS responses must vary by Origin even when the current request
  // has no Origin or presents a disallowed Origin. Otherwise a no-Origin cache
  // entry could be reused for a browser request without the required CORS headers.
  const existingVary = (headers.get('Vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!existingVary.includes('*') && !existingVary.some((value) => value.toLowerCase() === 'origin')) {
    existingVary.push('Origin');
    headers.set('Vary', existingVary.join(', '));
  }

  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Firebase-AppCheck, X-Correlation-Id, PAYMENT-CONTEXT, PAYMENT-SIGNATURE'
    );
  }
  return headers;
}

export function jsonWorkerResponse(
  ctx: WorkerRequestContext,
  status: number,
  payload: unknown,
  options?: WorkerJsonHeaderOptions
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildWorkerJsonHeaders(ctx, options),
  });
}

export interface ValidatedJsonBodyResult {
  readonly ok: boolean;
  readonly body: Record<string, unknown>;
  readonly status: 200 | 400 | 413 | 415;
  readonly code: string;
  readonly messageFa: string;
}

/**
 * Safely reads and parses a JSON request body while enforcing a strict byte ceiling
 * and Content-Type check to prevent memory exhaustion on Worker isolates.
 */
export async function readValidatedJsonBody(
  request: Request,
  maxBytes = 32 * 1024
): Promise<ValidatedJsonBodyResult> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      body: {},
      status: 415,
      code: 'INVALID_CONTENT_TYPE',
      messageFa: 'قالب درخواست باید application/json باشد.',
    };
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
    return {
      ok: false,
      body: {},
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      messageFa: 'حجم بدنه درخواست بیش از سقف مجاز است.',
    };
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      body: {},
      status: 400,
      code: 'BODY_READ_FAILED',
      messageFa: 'خواندن بدنه درخواست ناموفق بود.',
    };
  }

  const byteLength = new TextEncoder().encode(rawText).byteLength;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      body: {},
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      messageFa: 'حجم بدنه درخواست بیش از سقف مجاز است.',
    };
  }

  if (!rawText.trim()) {
    return { ok: true, body: {}, status: 200, code: 'OK', messageFa: '' };
  }

  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        body: {},
        status: 400,
        code: 'INVALID_JSON_BODY',
        messageFa: 'ساختار JSON ارسالی باید یک شیء (Object) معتبر باشد.',
      };
    }
    return {
      ok: true,
      body: parsed as Record<string, unknown>,
      status: 200,
      code: 'OK',
      messageFa: '',
    };
  } catch {
    return {
      ok: false,
      body: {},
      status: 400,
      code: 'INVALID_JSON_BODY',
      messageFa: 'ساختار JSON ارسالی نامعتبر است.',
    };
  }
}

export function buildObservabilityRecord(
  ctx: WorkerRequestContext,
  status: number,
  routePattern: string,
  migrationStatus: string,
  errorClassification?: string
): WorkerObservabilityRecord {
  return {
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    routeId: routePattern,
    method: ctx.method,
    pathname: ctx.pathname,
    status,
    durationMs: Math.max(0, Date.now() - ctx.startedAtMs),
    migrationStatus,
    ...(errorClassification ? { errorClassification } : {}),
    implementationId: ctx.implementationId,
    timestampIso: new Date().toISOString(),
  };
}
