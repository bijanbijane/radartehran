/**
 * HMAC authentication for lifecycle internal Write Admission RPC (Node + Worker Web Crypto).
 */

import { INTERNAL_WRITE_ADMISSION_RPC_PATH } from './writeAdmissionRpcContract.ts';

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256BodyDigestHex(bodyJson: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(bodyJson));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildWriteAdmissionRpcSignaturePayload(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyDigestHex: string;
}): string {
  return `${params.method}\n${params.path}\n${params.timestamp}\n${params.nonce}\n${params.bodyDigestHex}`;
}

export async function signWriteAdmissionRpcRequest(params: {
  secret: string;
  method: string;
  timestamp: string;
  nonce: string;
  bodyJson: string;
}): Promise<string> {
  const bodyDigestHex = await sha256BodyDigestHex(params.bodyJson);
  const canonical = buildWriteAdmissionRpcSignaturePayload({
    method: params.method,
    path: INTERNAL_WRITE_ADMISSION_RPC_PATH,
    timestamp: params.timestamp,
    nonce: params.nonce,
    bodyDigestHex,
  });
  return hmacSha256Hex(params.secret, canonical);
}

export async function verifyWriteAdmissionRpcRequest(params: {
  secret: string;
  method: string;
  timestamp: string;
  nonce: string;
  bodyJson: string;
  providedSignature: string;
  nowUnixSeconds?: number;
  maxSkewSeconds?: number;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!params.secret || params.secret.length < 16) {
    return { ok: false, code: 'RPC_SECRET_NOT_CONFIGURED' };
  }
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, code: 'RPC_TIMESTAMP_INVALID' };
  }
  const now = params.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  const skew = params.maxSkewSeconds ?? 60;
  if (ts < now - skew || ts > now + skew) {
    return { ok: false, code: 'RPC_TIMESTAMP_OUT_OF_WINDOW' };
  }
  const expected = await signWriteAdmissionRpcRequest({
    secret: params.secret,
    method: params.method,
    timestamp: params.timestamp,
    nonce: params.nonce,
    bodyJson: params.bodyJson,
  });
  if (expected.length !== params.providedSignature.length) {
    return { ok: false, code: 'RPC_SIGNATURE_INVALID' };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ params.providedSignature.charCodeAt(i);
  }
  if (diff !== 0) {
    return { ok: false, code: 'RPC_SIGNATURE_INVALID' };
  }
  return { ok: true };
}

export function generateRpcNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const randomHex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `rpc_${randomHex}`;
}