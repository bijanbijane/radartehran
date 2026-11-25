import type { WorkerEnv } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importEncryptionKey(env: WorkerEnv): Promise<CryptoKey> {
  const encoded = env.MARKET_PII_ENCRYPTION_KEY;
  if (!encoded) throw new Error('MARKET_PII_ENCRYPTION_KEY_MISSING');
  const raw = decodeBase64Url(encoded);
  if (raw.byteLength !== 32) throw new Error('MARKET_PII_ENCRYPTION_KEY_INVALID');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importHashKey(env: WorkerEnv): Promise<CryptoKey> {
  const secret = env.MARKET_PII_HASH_SECRET;
  if (!secret || encoder.encode(secret).byteLength < 32) throw new Error('MARKET_PII_HASH_SECRET_MISSING');
  const encodedEncryptionKey = String(env.MARKET_PII_ENCRYPTION_KEY || '').trim();
  if (encodedEncryptionKey && secret === encodedEncryptionKey) {
    throw new Error('MARKET_PII_ENCRYPTION_AND_HASH_KEYS_MUST_BE_DISTINCT');
  }
  if (encodedEncryptionKey) {
    const encryptionBytes = decodeBase64Url(encodedEncryptionKey);
    const hashBytes = encoder.encode(secret);
    if (
      encryptionBytes.byteLength === hashBytes.byteLength &&
      encryptionBytes.every((byte, index) => byte === hashBytes[index])
    ) {
      throw new Error('MARKET_PII_ENCRYPTION_AND_HASH_KEYS_MUST_BE_DISTINCT');
    }
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function assertIranianMobileE164(phoneE164: string): void {
  if (!/^\+989\d{9}$/.test(phoneE164)) throw new Error('MARKET_PHONE_E164_INVALID');
}

export async function encryptMarketPhone(phoneE164: string, env: WorkerEnv): Promise<string> {
  assertIranianMobileE164(phoneE164);
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(phoneE164));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptMarketPhone(ciphertextValue: string, env: WorkerEnv): Promise<string> {
  const [version, ivValue, dataValue, extra] = ciphertextValue.split('.');
  if (version !== 'v1' || !ivValue || !dataValue || extra !== undefined) throw new Error('MARKET_PII_CIPHERTEXT_INVALID');
  const key = await importEncryptionKey(env);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(ivValue) },
    key,
    decodeBase64Url(dataValue),
  );
  return decoder.decode(plaintext);
}

export async function hashMarketPhone(phoneE164: string, env: WorkerEnv): Promise<string> {
  assertIranianMobileE164(phoneE164);
  const key = await importHashKey(env);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(phoneE164));
  return encodeBase64Url(new Uint8Array(digest));
}

export function maskMarketPhoneLast4(last4: unknown): string {
  const value = String(last4 || '').replace(/\D/g, '').slice(-4);
  return value.length === 4 ? `+98***${value}` : '';
}
