import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';
import { decryptMarketPhone, encryptMarketPhone, hashMarketPhone } from '../worker/marketplace/marketPiiCrypto';
import type { WorkerEnv } from '../worker/types';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

import {
  maskPhoneForPublic,
  ownerUidVisible,
  sanitizeSponsorForPublic,
} from '../worker/marketplace/d1MarketplaceRepository';

const TEST_MARKET_ENV = {
  MARKET_PII_ENCRYPTION_KEY: Buffer.alloc(32, 0x11).toString('base64url'),
  MARKET_PII_HASH_SECRET: 'market-pii-test-hmac-secret-with-at-least-32-bytes',
} as WorkerEnv;

describe('public marketplace privacy projections', () => {
  it('never exposes another user UID to a public or non-admin caller', () => {
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran' }), '');
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran', uid: 'viewer-1' }), '');
    assert.equal(ownerUidVisible('viewer-1', { cityId: 'tehran', uid: 'viewer-1' }), 'viewer-1');
    assert.equal(ownerUidVisible('owner-1', { cityId: 'tehran', includeAdminRecords: true }), 'owner-1');
  });

  it('masks sponsor phone numbers in public marketplace state', () => {
    assert.equal(maskPhoneForPublic('+989121234567'), '+98***4567');
    assert.equal(maskPhoneForPublic('09121234567'), '+98***4567');
    assert.equal(maskPhoneForPublic('invalid'), '');
  });

  it('allowlists public sponsor fields and preserves full fields only for admins', () => {
    const raw = {
      name: 'Agency',
      agencyName: 'Agency Group',
      specialty: 'Residential',
      experienceYears: 8,
      planType: 'paid_1m',
      phone: '+989121234567',
      email: 'private@example.com',
      trackingCode: 'secret-tracking-code',
    };
    const publicRecord = sanitizeSponsorForPublic(raw, false);
    assert.deepEqual(publicRecord, {
      name: 'Agency',
      agencyName: 'Agency Group',
      specialty: 'Residential',
      experienceYears: 8,
      planType: 'paid_1m',
    });
    assert.equal(sanitizeSponsorForPublic(raw, true)?.phone, '+989121234567');
  });
});


describe('marketplace contact PII cryptography', () => {
  it('encrypts phone numbers with randomized AES-GCM ciphertext and round-trips correctly', async () => {
    const phone = '+989121234567';
    const first = await encryptMarketPhone(phone, TEST_MARKET_ENV);
    const second = await encryptMarketPhone(phone, TEST_MARKET_ENV);
    assert.match(first, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.notEqual(first, second);
    assert.equal(first.includes(phone), false);
    assert.equal(await decryptMarketPhone(first, TEST_MARKET_ENV), phone);
  });

  it('fails closed when ciphertext is tampered with or decrypted using another key', async () => {
    const ciphertext = await encryptMarketPhone('+989121234567', TEST_MARKET_ENV);
    const [version, iv, data] = ciphertext.split('.');
    const replacement = data[0] === 'A' ? 'B' : 'A';
    const tampered = `${version}.${iv}.${replacement}${data.slice(1)}`;
    await assert.rejects(() => decryptMarketPhone(tampered, TEST_MARKET_ENV));

    const wrongKeyEnv = {
      ...TEST_MARKET_ENV,
      MARKET_PII_ENCRYPTION_KEY: Buffer.alloc(32, 0x22).toString('base64url'),
    } as WorkerEnv;
    await assert.rejects(() => decryptMarketPhone(ciphertext, wrongKeyEnv));
  });

  it('uses keyed deterministic HMAC for normalized phone lookup without exposing plaintext', async () => {
    const phone = '+989121234567';
    const first = await hashMarketPhone(phone, TEST_MARKET_ENV);
    const second = await hashMarketPhone(phone, TEST_MARKET_ENV);
    const other = await hashMarketPhone('+989121234568', TEST_MARKET_ENV);
    assert.equal(first, second);
    assert.notEqual(first, other);
    assert.equal(first.includes(phone), false);
  });

  it('rejects reuse of the same raw key material for encryption and HMAC', async () => {
    const rawKey = Buffer.alloc(32, 0x11);
    const reusedKeyEnv = {
      MARKET_PII_ENCRYPTION_KEY: rawKey.toString('base64url'),
      MARKET_PII_HASH_SECRET: rawKey.toString('utf8'),
    } as WorkerEnv;
    await assert.rejects(
      () => hashMarketPhone('+989121234567', reusedKeyEnv),
      /MARKET_PII_ENCRYPTION_AND_HASH_KEYS_MUST_BE_DISTINCT/,
    );
  });

  it('rejects non-Iranian or malformed phone values before encryption or hashing', async () => {
    await assert.rejects(() => encryptMarketPhone('+15551234567', TEST_MARKET_ENV), /MARKET_PHONE_E164_INVALID/);
    await assert.rejects(() => hashMarketPhone('09121234567', TEST_MARKET_ENV), /MARKET_PHONE_E164_INVALID/);
  });

  it('rejects missing or malformed encryption and HMAC secrets', async () => {
    await assert.rejects(() => encryptMarketPhone('+989121234567', {} as WorkerEnv), /MARKET_PII_ENCRYPTION_KEY_MISSING/);
    await assert.rejects(() => encryptMarketPhone('+989121234567', {
      MARKET_PII_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64url'),
    } as WorkerEnv), /MARKET_PII_ENCRYPTION_KEY_INVALID/);
    await assert.rejects(() => hashMarketPhone('+989121234567', {
      MARKET_PII_HASH_SECRET: 'short',
    } as WorkerEnv), /MARKET_PII_HASH_SECRET_MISSING/);
  });
});
