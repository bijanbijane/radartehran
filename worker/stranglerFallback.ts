import type { WorkerEnv } from './types';
import { CLOUDFLARE_SESSION_ASSERTION_HEADER } from './auth/sessionAssertion';

export const WORKER_HOP_HEADER = 'x-radar-worker-hop';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

const NON_FALLBACK_STATUS_CODES = new Set([400, 401, 403, 404, 409, 413, 415, 422, 429]);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface StranglerFallbackDecision {
  allowed: boolean;
  reasonCode:
    | 'FALLBACK_DISABLED'
    | 'ORIGIN_URL_NOT_CONFIGURED'
    | 'RECURSION_HOP_DETECTED'
    | 'CLIENT_OR_AUTH_ERROR_NO_FALLBACK'
    | 'MUTATION_MISSING_IDEMPOTENCY_KEY'
    | 'ALLOWED_SAFE_FALLBACK';
}

export function evaluateStranglerFallbackSafety(params: {
  request: Request;
  env: WorkerEnv;
  workerStatusCode?: number;
}): StranglerFallbackDecision {
  if (String(params.env.STRANGLER_FALLBACK_ENABLED || 'false').toLowerCase() !== 'true') {
    return { allowed: false, reasonCode: 'FALLBACK_DISABLED' };
  }
  const originUrl = String(params.env.STRANGLER_ORIGIN_URL || '').trim();
  if (!originUrl.startsWith('https://')) {
    return { allowed: false, reasonCode: 'ORIGIN_URL_NOT_CONFIGURED' };
  }
  const currentHop = Number(params.request.headers.get(WORKER_HOP_HEADER) || '0');
  if (Number.isFinite(currentHop) && currentHop >= 1) {
    return { allowed: false, reasonCode: 'RECURSION_HOP_DETECTED' };
  }
  if (params.workerStatusCode !== undefined && NON_FALLBACK_STATUS_CODES.has(params.workerStatusCode)) {
    return { allowed: false, reasonCode: 'CLIENT_OR_AUTH_ERROR_NO_FALLBACK' };
  }
  const method = params.request.method.toUpperCase();
  if (MUTATION_METHODS.has(method)) {
    const idempotencyKey = (params.request.headers.get(IDEMPOTENCY_KEY_HEADER) || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return { allowed: false, reasonCode: 'MUTATION_MISSING_IDEMPOTENCY_KEY' };
    }
  }
  return { allowed: true, reasonCode: 'ALLOWED_SAFE_FALLBACK' };
}

export async function executeSafeStranglerFallback(params: {
  request: Request;
  env: WorkerEnv;
  correlationId: string;
  sessionAssertion?: string;
}): Promise<Response> {
  const decision = evaluateStranglerFallbackSafety({ request: params.request, env: params.env });
  if (!decision.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        status: 'error',
        code: decision.reasonCode,
        correlationId: params.correlationId,
      }),
      {
        status: decision.reasonCode === 'RECURSION_HOP_DETECTED' ? 508 : 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Correlation-Id': params.correlationId,
        },
      },
    );
  }

  const incomingUrl = new URL(params.request.url);
  const originBase = new URL(String(params.env.STRANGLER_ORIGIN_URL).trim());
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, originBase.origin);
  const headers = new Headers(params.request.headers);
  // Never forward a client-supplied bridge assertion. Only the verified Worker may mint one.
  headers.delete(CLOUDFLARE_SESSION_ASSERTION_HEADER);
  if (params.sessionAssertion) {
    headers.set(CLOUDFLARE_SESSION_ASSERTION_HEADER, params.sessionAssertion);
  }
  headers.set(WORKER_HOP_HEADER, '1');
  headers.set('X-Correlation-Id', params.correlationId);

  const response = await fetch(targetUrl.toString(), {
    method: params.request.method,
    headers,
    body: ['GET', 'HEAD'].includes(params.request.method.toUpperCase()) ? undefined : params.request.body,
    redirect: 'manual',
  });
  return response;
}
