/**
 * Express-side client for authoritative D1 Write Admission via API Worker RPC.
 */

import type { WriteAdmissionDecision } from './writeAdmissionAuthority.ts';
import {
  INTERNAL_WRITE_ADMISSION_RPC_PATH,
  WRITE_ADMISSION_RPC_NONCE_HEADER,
  WRITE_ADMISSION_RPC_SECRET_ENV,
  WRITE_ADMISSION_RPC_SIGNATURE_HEADER,
  WRITE_ADMISSION_RPC_TIMESTAMP_HEADER,
  WRITE_ADMISSION_WORKER_BASE_URL_ENV,
  type WriteAdmissionRpcSuccessBody,
} from './writeAdmissionRpcContract.ts';
import { generateRpcNonce, signWriteAdmissionRpcRequest } from './writeAdmissionRpcAuth.ts';

const DEFAULT_RPC_TIMEOUT_MS = 5_000;

export interface ExpressWriteAdmissionEnv {
  readonly [WRITE_ADMISSION_RPC_SECRET_ENV]?: string;
  readonly [WRITE_ADMISSION_WORKER_BASE_URL_ENV]?: string;
  readonly fetchFn?: typeof fetch;
}

function resolveWorkerBaseUrl(env: ExpressWriteAdmissionEnv): string | null {
  const explicit = env[WRITE_ADMISSION_WORKER_BASE_URL_ENV]?.trim();
  if (!explicit) return null;
  return explicit.replace(/\/$/, '');
}

export async function queryWriteAdmissionViaWorkerRpc(params: {
  targetUid: string;
  env?: ExpressWriteAdmissionEnv;
}): Promise<WriteAdmissionDecision> {
  const env: ExpressWriteAdmissionEnv = params.env ?? {
    [WRITE_ADMISSION_RPC_SECRET_ENV]: process.env[WRITE_ADMISSION_RPC_SECRET_ENV],
    [WRITE_ADMISSION_WORKER_BASE_URL_ENV]: process.env[WRITE_ADMISSION_WORKER_BASE_URL_ENV],
  };
  const secret = env[WRITE_ADMISSION_RPC_SECRET_ENV]?.trim();
  const baseUrl = resolveWorkerBaseUrl(env);
  if (!secret || secret.length < 16 || !baseUrl) {
    return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_RPC_NOT_CONFIGURED' };
  }

  const bodyJson = JSON.stringify({ targetUid: params.targetUid });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateRpcNonce();
  const signature = await signWriteAdmissionRpcRequest({
    secret,
    method: 'POST',
    timestamp,
    nonce,
    bodyJson,
  });

  const url = `${baseUrl}${INTERNAL_WRITE_ADMISSION_RPC_PATH}`;
  const fetchFn = env.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_RPC_TIMEOUT_MS);

  try {
    const res = await fetchFn(url, {
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
    if (!res.ok) {
      return { status: 'UNAVAILABLE', code: `WRITE_ADMISSION_RPC_HTTP_${res.status}` };
    }
    const parsed = (await res.json()) as WriteAdmissionRpcSuccessBody | { status: string; code?: string };
    if (parsed.status !== 'ok' || !('decision' in parsed) || !parsed.decision) {
      return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_RPC_MALFORMED' };
    }
    if (parsed.decision.status !== 'UNAVAILABLE' && parsed.decision.uid !== params.targetUid) {
      return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_RPC_UID_MISMATCH' };
    }
    return parsed.decision;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError'
        ? 'WRITE_ADMISSION_RPC_TIMEOUT'
        : 'WRITE_ADMISSION_RPC_FAILED';
    return { status: 'UNAVAILABLE', code };
  } finally {
    clearTimeout(timer);
  }
}