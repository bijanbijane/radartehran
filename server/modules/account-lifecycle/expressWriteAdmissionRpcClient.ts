/**
 * Express-side client for authoritative D1 Write Admission via API Worker RPC.
 * Mutations acquire durable USER_DB permits; response finish/close releases them.
 */
import type { WriteAdmissionDecision } from './writeAdmissionAuthority.ts';
import {
  INTERNAL_WRITE_ADMISSION_RPC_PATH,
  WRITE_ADMISSION_RPC_NONCE_HEADER,
  WRITE_ADMISSION_RPC_SECRET_ENV,
  WRITE_ADMISSION_RPC_SIGNATURE_HEADER,
  WRITE_ADMISSION_RPC_TIMESTAMP_HEADER,
  WRITE_ADMISSION_WORKER_BASE_URL_ENV,
  type WriteAdmissionRpcRequestBody,
} from './writeAdmissionRpcContract.ts';
import { generateRpcNonce, signWriteAdmissionRpcRequest } from './writeAdmissionRpcAuth.ts';

const DEFAULT_RPC_TIMEOUT_MS = 5_000;

export interface ExpressWriteAdmissionEnv {
  readonly [WRITE_ADMISSION_RPC_SECRET_ENV]?: string;
  readonly [WRITE_ADMISSION_WORKER_BASE_URL_ENV]?: string;
  readonly fetchFn?: typeof fetch;
}

export type MutationPermitAcquisition =
  | { readonly ok: true; readonly permitId: string; readonly expiresAtMs: number }
  | { readonly ok: false; readonly statusCode: 423 | 503; readonly code: string };

function resolveWorkerBaseUrl(env: ExpressWriteAdmissionEnv): string | null {
  const explicit = env[WRITE_ADMISSION_WORKER_BASE_URL_ENV]?.trim();
  if (!explicit) return null;
  return explicit.replace(/\/$/, '');
}

async function postWriteAdmissionRpc(params: {
  body: WriteAdmissionRpcRequestBody;
  env?: ExpressWriteAdmissionEnv;
}): Promise<Response> {
  const env = params.env ?? process.env;
  const secret = env[WRITE_ADMISSION_RPC_SECRET_ENV]?.trim();
  const baseUrl = resolveWorkerBaseUrl(env);
  if (!secret || secret.length < 16 || !baseUrl) {
    throw new Error('WRITE_ADMISSION_RPC_NOT_CONFIGURED');
  }

  const bodyJson = JSON.stringify(params.body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateRpcNonce();
  const signature = await signWriteAdmissionRpcRequest({
    secret, method: 'POST', timestamp, nonce, bodyJson,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_RPC_TIMEOUT_MS);
  const fetchFn = env.fetchFn ?? fetch;
  try {
    return await fetchFn(`${baseUrl}${INTERNAL_WRITE_ADMISSION_RPC_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WRITE_ADMISSION_RPC_TIMESTAMP_HEADER]: timestamp,
        [WRITE_ADMISSION_RPC_NONCE_HEADER]: nonce,
        [WRITE_ADMISSION_RPC_SIGNATURE_HEADER]: signature,
      },
      body: bodyJson,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function queryWriteAdmissionViaWorkerRpc(params: {
  targetUid: string;
  env?: ExpressWriteAdmissionEnv;
}): Promise<WriteAdmissionDecision> {
  try {
    const res = await postWriteAdmissionRpc({
      body: { targetUid: params.targetUid, action: 'check' },
      env: params.env,
    });
    const parsed = await readJson(res);
    if (!res.ok) return { status: 'UNAVAILABLE', code: `WRITE_ADMISSION_RPC_HTTP_${res.status}` };
    if (parsed.status !== 'ok' || !('decision' in parsed) || !parsed.decision) {
      return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_RPC_MALFORMED' };
    }
    const decision = parsed.decision as WriteAdmissionDecision;
    if (decision.status !== 'UNAVAILABLE' && decision.uid !== params.targetUid) {
      return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_RPC_UID_MISMATCH' };
    }
    return decision;
  } catch (err) {
    const code = err && typeof err === 'object' && 'name' in err &&
      (err as { name: string }).name === 'AbortError'
      ? 'WRITE_ADMISSION_RPC_TIMEOUT'
      : err instanceof Error && err.message === 'WRITE_ADMISSION_RPC_NOT_CONFIGURED'
        ? 'WRITE_ADMISSION_RPC_NOT_CONFIGURED'
        : 'WRITE_ADMISSION_RPC_FAILED';
    return { status: 'UNAVAILABLE', code };
  }
}

export async function acquireMutationPermitViaWorkerRpc(params: {
  targetUid: string;
  operationName: string;
  env?: ExpressWriteAdmissionEnv;
}): Promise<MutationPermitAcquisition> {
  try {
    const res = await postWriteAdmissionRpc({
      body: {
        targetUid: params.targetUid,
        action: 'acquire',
        operationName: params.operationName,
      },
      env: params.env,
    });
    const parsed = await readJson(res);
    if (res.status === 423) {
      return { ok: false, statusCode: 423, code: String(parsed.code || 'ACCOUNT_WRITE_BLOCKED') };
    }
    if (!res.ok) {
      return { ok: false, statusCode: 503, code: String(parsed.code || `WRITE_ADMISSION_RPC_HTTP_${res.status}`) };
    }
    const permitId = typeof parsed.permitId === 'string' ? parsed.permitId : '';
    const expiresAtMs = Number(parsed.expiresAtMs);
    if (parsed.status !== 'ok' || parsed.action !== 'acquired' ||
        !permitId || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now()) {
      return { ok: false, statusCode: 503, code: 'WRITE_ADMISSION_RPC_MALFORMED_PERMIT' };
    }
    return { ok: true, permitId, expiresAtMs };
  } catch (err) {
    const code = err instanceof Error && err.message === 'WRITE_ADMISSION_RPC_NOT_CONFIGURED'
      ? 'WRITE_ADMISSION_RPC_NOT_CONFIGURED'
      : err && typeof err === 'object' && 'name' in err &&
        (err as { name: string }).name === 'AbortError'
        ? 'WRITE_ADMISSION_RPC_TIMEOUT'
        : 'WRITE_ADMISSION_RPC_FAILED';
    return { ok: false, statusCode: 503, code };
  }
}

export async function releaseMutationPermitViaWorkerRpc(params: {
  targetUid: string;
  permitId: string;
  env?: ExpressWriteAdmissionEnv;
}): Promise<void> {
  const res = await postWriteAdmissionRpc({
    body: { targetUid: params.targetUid, action: 'release', permitId: params.permitId },
    env: params.env,
  });
  const parsed = await readJson(res);
  if (!res.ok || parsed.status !== 'ok' || parsed.action !== 'released') {
    throw new Error(String(parsed.code || `WRITE_ADMISSION_RPC_RELEASE_HTTP_${res.status}`));
  }
}
