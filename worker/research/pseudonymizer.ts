/**
 * @file worker/research/pseudonymizer.ts
 * @description Server-side Web Crypto HMAC-SHA256 subject pseudonymizer for RESEARCH_DB.
 *
 * Privacy Classification:
 * - Output is `PSEUDONYMIZED RESEARCH DATA` (stable keyed pseudonym per key version),
 *   NOT irreversible anonymization.
 * - Secret comes strictly from Cloudflare Worker Secrets (`RESEARCH_HMAC_SECRET`), never D1 or client code.
 * - Supports key versioning (`RESEARCH_HMAC_KEY_VERSION`) and rotation (`RESEARCH_HMAC_PREVIOUS_SECRETS`)
 *   so account deletion can reliably derive and erase all historical subject_key versions.
 * - NEVER returns `subject_key` to frontend clients; NEVER writes raw Firebase UID into RESEARCH_DB.
 */
import type { WorkerEnv } from '../types';

export interface DerivedResearchSubjectKey {
  readonly subjectKey: string;
  readonly subjectKeyVersion: string;
}

export type PseudonymizationResult =
  | { readonly ok: true; readonly derived: DerivedResearchSubjectKey }
  | { readonly ok: false; readonly code: 'RESEARCH_HMAC_SECRET_MISSING' | 'INVALID_UID'; readonly statusCode: 503 | 400 };

const MIN_HMAC_SECRET_LENGTH = 32;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(sig);
}

export async function computeSha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(digest);
}

/**
 * Derives a deterministic, domain-separated, versioned HMAC-SHA256 subject_key for RESEARCH_DB.
 */
export async function deriveResearchSubjectKey(params: {
  uid: string;
  secret: string | undefined;
  keyVersion?: string;
}): Promise<PseudonymizationResult> {
  const uid = String(params.uid || '').trim();
  if (!uid || uid.length > 128) {
    return { ok: false, code: 'INVALID_UID', statusCode: 400 };
  }
  const secret = String(params.secret || '').trim();
  if (secret.length < MIN_HMAC_SECRET_LENGTH) {
    return { ok: false, code: 'RESEARCH_HMAC_SECRET_MISSING', statusCode: 503 };
  }
  const version = String(params.keyVersion || 'v1')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 24) || 'v1';

  const hex = await computeHmacSha256Hex(secret, `rt-research-subject:${version}:${uid}`);
  return {
    ok: true,
    derived: {
      subjectKey: `sk_${version}_${hex}`,
      subjectKeyVersion: version,
    },
  };
}

/**
 * Safely parses `RESEARCH_HMAC_PREVIOUS_SECRETS` JSON map (`{"v1":"<secret>"}`) for key rotation.
 */
export function parsePreviousResearchHmacSecrets(rawJson: string | undefined): Array<{ version: string; secret: string }> {
  if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const results: Array<{ version: string; secret: string }> = [];
    for (const [version, secret] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof secret === 'string' && secret.trim().length >= MIN_HMAC_SECRET_LENGTH) {
        const cleanVer = version.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24);
        if (cleanVer) {
          results.push({ version: cleanVer, secret: secret.trim() });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Derives subject keys across the active key version AND all configured rotated previous versions
 * so account erasure leaves zero orphaned historical research records.
 */
export async function deriveAllSubjectKeysForErasure(params: {
  uid: string;
  env: WorkerEnv;
}): Promise<
  | { readonly ok: true; readonly keys: DerivedResearchSubjectKey[] }
  | { readonly ok: false; readonly code: 'RESEARCH_HMAC_SECRET_MISSING' | 'INVALID_UID'; readonly statusCode: 503 | 400 }
> {
  const activeVersion = String(params.env.RESEARCH_HMAC_KEY_VERSION || 'v1').trim() || 'v1';
  const activeRes = await deriveResearchSubjectKey({
    uid: params.uid,
    secret: params.env.RESEARCH_HMAC_SECRET,
    keyVersion: activeVersion,
  });
  if (activeRes.ok === false) {
    return activeRes;
  }

  const byKey = new Map<string, DerivedResearchSubjectKey>();
  byKey.set(`${activeRes.derived.subjectKeyVersion}:${activeRes.derived.subjectKey}`, activeRes.derived);

  const previous = parsePreviousResearchHmacSecrets(params.env.RESEARCH_HMAC_PREVIOUS_SECRETS);
  for (const prev of previous) {
    const prevRes = await deriveResearchSubjectKey({
      uid: params.uid,
      secret: prev.secret,
      keyVersion: prev.version,
    });
    if (prevRes.ok) {
      byKey.set(`${prevRes.derived.subjectKeyVersion}:${prevRes.derived.subjectKey}`, prevRes.derived);
    }
  }

  return { ok: true, keys: Array.from(byKey.values()) };
}

/** Lifecycle receipt keys are 32-byte hexadecimal secrets, separate from research pseudonymization keys. */
export function isValidLifecycleReceiptSecret(secret?: string): boolean {
  return /^[0-9a-f]{64}$/i.test(String(secret || '').trim());
}

/**
 * Produces a keyed HMAC-SHA256 compliance digest of UID.
 * Classified as a sensitive pseudonymous compliance digest — NEVER treated as full anonymization.
 * Fails closed when the dedicated lifecycle receipt secret is unavailable.
 */
export async function hashUidForComplianceReceipt(uid: string, receiptSecret?: string): Promise<string> {
  const canonical = `rt-lifecycle-receipt-uid:${uid.trim()}`;
  const cleanSecret = String(receiptSecret || '').trim();
  if (!isValidLifecycleReceiptSecret(cleanSecret)) {
    throw new Error('INTERNAL_LIFECYCLE_RPC_SECRET_UNAVAILABLE');
  }
  return computeHmacSha256Hex(cleanSecret, canonical);
}
