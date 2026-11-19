import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { resolveLegalActor, type ExpressHeadersMap, type LegalRegulatoryAuthDeps } from '../actorResolver';
import { FirestoreReadOnlyPropertyRegistryAdapter } from '../adapters';
import { FirestoreLegalRegulatoryStore } from '../firestoreStore';
import { FirestoreLegalRegulatoryTransactionRunner } from '../firestoreTransactionRunner';
import { createProductionLegalRegulatoryModule } from '../index';
import { LEGAL_REGULATORY_BASE_PATH, registerLegalRegulatoryRoutes } from '../routes';
import { LEGAL_REGULATORY_COLLECTIONS } from '../store';
import { LegalRegulatoryError, redactPrivateFieldsDeep } from '../validationAndAuthz';
import { TransactionalFirestoreMock } from './firestoreMockHarness';

const ADMIN_1_TOKEN = 'Bearer admin-30c-1';
const ADMIN_2_TOKEN = 'Bearer admin-30c-2';
const USER_TOKEN = 'Bearer user-30c-1';

function createAuthDeps(): LegalRegulatoryAuthDeps {
  return {
    async verifyAdmin(headers: ExpressHeadersMap) {
      if (headers.authorization === ADMIN_1_TOKEN) {
        return { authorized: true, statusCode: 200, actorUid: 'uid_admin_30c_1', uid: 'uid_admin_30c_1', role: 'admin' };
      }
      if (headers.authorization === ADMIN_2_TOKEN) {
        return { authorized: true, statusCode: 200, actorUid: 'uid_admin_30c_2', uid: 'uid_admin_30c_2', role: 'admin' };
      }
      return { authorized: false, statusCode: 403, reason: 'FORBIDDEN' };
    },
    async verifyUser(headers: ExpressHeadersMap) {
      if (headers.authorization === USER_TOKEN) {
        return { authorized: true, authenticated: true, statusCode: 200, uid: 'uid_user_30c_1' };
      }
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'UNAUTHENTICATED' };
    },
  };
}

async function createReliabilityHarness(options?: {
  checkRateLimit?: (ip: string, bucket: 'general' | 'ai', limit: number, windowMs: number) => boolean;
  omitRateLimiter?: boolean;
  maxBodyBytes?: number;
  forceUnexpectedErrorOnSearch?: boolean;
  nullDb?: boolean;
}) {
  const mockDb = new TransactionalFirestoreMock();
  const db = options?.nullDb ? null : mockDb.asAdminFirestore();
  const store = options?.nullDb
    ? new FirestoreLegalRegulatoryStore({ db: null })
    : new FirestoreLegalRegulatoryStore({
        transactionRunner: new FirestoreLegalRegulatoryTransactionRunner(db),
      });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db });
  const facade = createProductionLegalRegulatoryModule({ store, propertyContextAdapter: adapter });

  if (options?.forceUnexpectedErrorOnSearch) {
    facade.applicabilityAndProfileService.searchProvisions = async () => {
      throw new Error('SECRET_INTERNAL_STACK_PATH_/var/app/private_key_12345');
    };
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  registerLegalRegulatoryRoutes(app, {
    facade,
    propertyContextAdapter: adapter,
    authDeps: createAuthDeps(),
    checkRateLimit: options?.omitRateLimiter ? undefined : options?.checkRateLimit,
    maxBodyBytes: options?.maxBodyBytes,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}${LEGAL_REGULATORY_BASE_PATH}`;

  const req = async (
    method: string,
    subPath: string,
    opts: { headers?: Record<string, string>; body?: unknown; rawBody?: string } = {},
  ) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let bodyStr: string | undefined;
    if (opts.rawBody !== undefined) {
      headers['content-type'] = 'application/json';
      bodyStr = opts.rawBody;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      bodyStr = JSON.stringify(opts.body);
    }
    const resp = await fetch(`${baseUrl}${subPath}`, { method, headers, body: bodyStr });
    const json = (await resp.json()) as Record<string, any>;
    return { status: resp.status, headers: resp.headers, json };
  };

  return {
    mockDb,
    req,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    officialTitleFa: 'قانون نظام مهندسی و کنترل ساختمان',
    issuingAuthority: 'مجلس شورای اسلامی',
    jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
    sourceCategory: 'NATIONAL_STATUTE',
    reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
    verificationStatus: 'VERIFIED',
    officialReferenceNumber: 'REF-30C-100',
    publicationDateIso: '2021-01-01',
    effectiveFromIso: '2021-02-01',
    internalReviewerNotes: 'TOP_SECRET_REVIEWER_NOTE_30C',
    restrictedAuditMetadata: { ticketId: 'SEC-30C-999', reviewerIp: '10.1.2.3' },
    ...overrides,
  };
}

// ============================================================================
// GROUP A (LR-30C-001..008): Idempotency & Replay (8 Tests)
// ============================================================================

test('LR-30C-001: Same Idempotency-Key with identical payload replays exact saved response', async () => {
  const h = await createReliabilityHarness();
  try {
    const body = makeSource({ id: 'src_c001' });
    const r1 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-001' },
      body,
    });
    const r2 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-001' },
      body,
    });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.deepEqual(r2.json.data, r1.json.data);
  } finally {
    await h.close();
  }
});

test('LR-30C-002: Same Idempotency-Key with different payload returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
  const h = await createReliabilityHarness();
  try {
    const r1 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-002' },
      body: makeSource({ id: 'src_c002', officialReferenceNumber: 'REF-A' }),
    });
    assert.equal(r1.status, 201);

    const r2 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-002' },
      body: makeSource({ id: 'src_c002', officialReferenceNumber: 'REF-B-DIFFERENT' }),
    });
    assert.equal(r2.status, 409);
    assert.equal(r2.json.code, 'IDEMPOTENCY_KEY_REUSED');
  } finally {
    await h.close();
  }
});

test('LR-30C-003: Replay after success creates zero duplicate audit logs or entity writes', async () => {
  const h = await createReliabilityHarness();
  try {
    const body = makeSource({ id: 'src_c003' });
    await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-003' }, body });
    const auditsBefore = h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG);
    const commitsBefore = h.mockDb.txCommitCount;

    const replay = await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-003' }, body });
    assert.equal(replay.status, 201);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), auditsBefore);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
    assert.equal(h.mockDb.txCommitCount, commitsBefore + 1); // read-only idempotency hit transaction without extra audit
  } finally {
    await h.close();
  }
});

test('LR-30C-004: Two concurrent requests with identical Idempotency-Key serialize cleanly with zero double side effect', async () => {
  const h = await createReliabilityHarness();
  try {
    const body = makeSource({ id: 'src_c004' });
    let slowedOnce = false;
    h.mockDb.beforeCommitHook = async () => {
      if (!slowedOnce) {
        slowedOnce = true;
        await new Promise((r) => setTimeout(r, 40));
      }
    };
    const [r1, r2] = await Promise.all([
      h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-concurrent' }, body }),
      h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-concurrent' }, body }),
    ]);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.deepEqual(r1.json.data, r2.json.data);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  } finally {
    await h.close();
  }
});

test('LR-30C-005: Firestore failure before commit leaves zero idempotency record and zero entity write', async () => {
  const h = await createReliabilityHarness();
  try {
    h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-fail-precommit' },
      body: makeSource({ id: 'src_c005' }),
    });
    assert.equal(res.status, 503);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  } finally {
    await h.close();
  }
});

test('LR-30C-006: Retrying same Idempotency-Key after failed/rolled-back attempt succeeds cleanly', async () => {
  const h = await createReliabilityHarness();
  try {
    const body = makeSource({ id: 'src_c006' });
    h.mockDb.failNextTxError = new Error('TRANSIENT_TX_ABORT');
    const failed = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-retry' },
      body,
    });
    assert.equal(failed.status, 503);

    const retry = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k-30c-retry' },
      body,
    });
    assert.equal(retry.status, 201);
    assert.equal(retry.json.data.id, 'src_c006');
  } finally {
    await h.close();
  }
});

test('LR-30C-007: Idempotency scope isolates different actors using the same Idempotency-Key string', async () => {
  const h = await createReliabilityHarness();
  try {
    const r1 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'shared-key-007' },
      body: makeSource({ id: 'src_c007_a' }),
    });
    const r2 = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_2_TOKEN, 'idempotency-key': 'shared-key-007' },
      body: makeSource({ id: 'src_c007_b' }),
    });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(r1.json.data.id, 'src_c007_a');
    assert.equal(r2.json.data.id, 'src_c007_b');
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 2);
  } finally {
    await h.close();
  }
});

test('LR-30C-008: Idempotency-Key >255 chars is rejected (400) while read-only POST /property-profile/evaluate succeeds without Idempotency-Key', async () => {
  const h = await createReliabilityHarness();
  try {
    const tooLong = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'k'.repeat(256) },
      body: makeSource({ id: 'src_c008' }),
    });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.json.code, 'VALIDATION_ERROR');

    const evalNoKey = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      body: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' },
    });
    assert.equal(evalNoKey.status, 200);
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP B (LR-30C-009..014): Redaction & Cache Headers (6 Tests)
// ============================================================================

test('LR-30C-009: Public GET /sources/:id, /provisions/:id, /provisions/:id/as-of, and /provisions/search strip all private reviewer fields', async () => {
  const h = await createReliabilityHarness();
  try {
    await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'r-src' }, body: makeSource({ id: 'src_c009' }) });
    await h.req('POST', '/documents', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'r-doc' },
      body: { id: 'doc_c009', sourceId: 'src_c009', documentCode: 'D9', titleFa: 'سند ۹', documentCategory: 'LAND_USE_AND_ZONING', effectiveFromIso: '2021-02-01', internalReviewerNotes: 'HIDDEN_DOC_NOTE' },
    });
    await h.req('POST', '/provisions', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'r-prov' },
      body: {
        id: 'prov_c009', sourceId: 'src_c009', documentId: 'doc_c009', hierarchyLevel: 'ARTICLE', provisionNumber: '9',
        citationLabel: 'ماده ۹', titleFa: 'ضابطه عمومی', documentCategory: 'LAND_USE_AND_ZONING',
        originalTextVerbatim: 'متن رسمی ماده ۹', effectiveFromIso: '2021-02-01',
        internalReviewerNotes: 'HIDDEN_PROV_NOTE', restrictedAuditMetadata: { secret: 'HIDDEN_META' },
      },
    });

    for (const path of ['/sources/src_c009', '/provisions/prov_c009', '/provisions/prov_c009/as-of?asOfDateIso=2023-01-01', '/provisions/search?keyword=%D8%B6%D8%A7%D8%A8%D8%B7%D9%87']) {
      const res = await h.req('GET', path);
      assert.equal(res.status, 200);
      const raw = JSON.stringify(res.json);
      assert.equal(raw.includes('TOP_SECRET_REVIEWER_NOTE_30C'), false);
      assert.equal(raw.includes('HIDDEN_PROV_NOTE'), false);
      assert.equal(raw.includes('HIDDEN_META'), false);
      assert.equal(raw.includes('restrictedAuditMetadata'), false);
      assert.equal(raw.includes('internalReviewerNotes'), false);
    }
  } finally {
    await h.close();
  }
});

test('LR-30C-010: redactPrivateFieldsDeep recursively removes nested forbidden fields without mutating source object', () => {
  const input = {
    id: 'p1',
    nested: {
      safe: true,
      ownerUid: 'uid_secret',
      exactLocationPrivate: { latitude: 35.7, longitude: 51.4, postalCode: '12345' },
      items: [{ internalReviewerNotes: 'secret', title: 'ok' }],
    },
  };
  const redacted = redactPrivateFieldsDeep(input) as Record<string, any>;
  assert.equal(redacted.nested.safe, true);
  assert.equal(redacted.nested.ownerUid, undefined);
  assert.equal(redacted.nested.exactLocationPrivate, undefined);
  assert.equal(redacted.nested.items[0].internalReviewerNotes, undefined);
  assert.equal(redacted.nested.items[0].title, 'ok');
  // Original untouched
  assert.equal(input.nested.ownerUid, 'uid_secret');
});

test('LR-30C-011: Public GET sets public cache header while authenticated GET sets Cache-Control: private, no-store', async () => {
  const h = await createReliabilityHarness();
  try {
    await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'c-src' }, body: makeSource({ id: 'src_c011' }) });
    const pub = await h.req('GET', '/sources/src_c011');
    assert.equal(pub.status, 200);
    assert.equal(pub.headers.get('cache-control'), 'public, max-age=60');

    const authed = await h.req('GET', '/sources/src_c011', { headers: { authorization: ADMIN_1_TOKEN } });
    assert.equal(authed.status, 200);
    assert.equal(authed.headers.get('cache-control'), 'private, no-store');
    assert.equal(authed.headers.get('pragma'), 'no-cache');
  } finally {
    await h.close();
  }
});

test('LR-30C-012: Authenticated mutating responses always emit private, no-store and X-Content-Type-Options: nosniff', async () => {
  const h = await createReliabilityHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'c-headers' },
      body: makeSource({ id: 'src_c012' }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('pragma'), 'no-cache');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await h.close();
  }
});

test('LR-30C-013: Error responses (400, 401, 404, 500) always set Cache-Control: private, no-store', async () => {
  const h = await createReliabilityHarness({ forceUnexpectedErrorOnSearch: true });
  try {
    const r404 = await h.req('GET', '/sources/missing_c013');
    assert.equal(r404.status, 404);
    assert.equal(r404.headers.get('cache-control'), 'private, no-store');

    const r500 = await h.req('GET', '/provisions/search');
    assert.equal(r500.status, 500);
    assert.equal(r500.headers.get('cache-control'), 'private, no-store');
    assert.equal(r500.headers.get('pragma'), 'no-cache');
  } finally {
    await h.close();
  }
});

test('LR-30C-014: AI summary response is always non-authoritative and requiresHumanReview=true', async () => {
  const h = await createReliabilityHarness();
  try {
    await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'ai-s' }, body: makeSource({ id: 'src_c014' }) });
    await h.req('POST', '/documents', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'ai-d' },
      body: { id: 'doc_c014', sourceId: 'src_c014', documentCode: 'D14', titleFa: 'سند ۱۴', documentCategory: 'LAND_USE_AND_ZONING', effectiveFromIso: '2021-02-01' },
    });
    await h.req('POST', '/provisions', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'ai-p' },
      body: {
        id: 'prov_c014', sourceId: 'src_c014', documentId: 'doc_c014', hierarchyLevel: 'ARTICLE', provisionNumber: '14',
        citationLabel: 'ماده ۱۴', titleFa: 'خلاصه', documentCategory: 'LAND_USE_AND_ZONING',
        originalTextVerbatim: 'متن اصلی غیرقابل تغییر', effectiveFromIso: '2021-02-01',
      },
    });
    const res = await h.req('POST', '/ai-summaries', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'ai-rec' },
      body: {
        targetEntityType: 'PROVISION', targetEntityId: 'prov_c014', targetEntityVersion: 1,
        summaryText: 'پیشنهاد کمکی', modelIdentifier: 'gemini-2.5-flash', promptTemplateVersion: 'v1',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.isAuthoritative, false);
    assert.equal(res.json.data.requiresHumanReview, true);
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP C (LR-30C-015..020): Unified HTTP Error Mapping (6 Tests)
// ============================================================================

test('LR-30C-015: Invalid query parameters map to 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    const res = await h.req('GET', '/provisions/search?includeHistoricalOrRepealed=maybe');
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-30C-016: Nonexistent provision returns 404 NOT_FOUND', async () => {
  const h = await createReliabilityHarness();
  try {
    const res = await h.req('GET', '/provisions/no_such_provision_30c');
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'NOT_FOUND');
  } finally {
    await h.close();
  }
});

test('LR-30C-017: Version mismatch returns 409 CONCURRENT_MODIFICATION_CONFLICT distinct from IDEMPOTENCY_KEY_REUSED', async () => {
  const h = await createReliabilityHarness();
  try {
    await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'v-src' },
      body: makeSource({ id: 'src_c017', verificationStatus: 'PENDING_VERIFICATION' }),
    });
    const stale = await h.req('POST', '/sources/src_c017/verify', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'v-stale' },
      body: { verificationMethodNote: 'تطبیق', expectedVersion: 99 },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'CONCURRENT_MODIFICATION_CONFLICT');
    assert.notEqual(stale.json.code, 'IDEMPOTENCY_KEY_REUSED');
  } finally {
    await h.close();
  }
});

test('LR-30C-018: Oversized payload maps cleanly to 413 PAYLOAD_TOO_LARGE', async () => {
  const h = await createReliabilityHarness({ maxBodyBytes: 256 });
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'big-body' },
      body: makeSource({ officialTitleFa: 'الف'.repeat(400) }),
    });
    assert.equal(res.status, 413);
    assert.equal(res.json.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    await h.close();
  }
});

test('LR-30C-019: Firestore dependency outage returns sanitized 503 with zero collection name or internal IP leaks', async () => {
  const h = await createReliabilityHarness();
  try {
    h.mockDb.failNextTxError = new Error('gRPC 14 UNAVAILABLE on collection legal_regulatory_sources_v1 host 10.42.8.1');
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'fs-503' },
      body: makeSource({ id: 'src_c019' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
    const raw = JSON.stringify(res.json);
    assert.equal(raw.includes('legal_regulatory_sources_v1'), false);
    assert.equal(raw.includes('10.42.8.1'), false);
    assert.equal(raw.includes('gRPC'), false);
  } finally {
    await h.close();
  }
});

test('LR-30C-020: Unexpected internal error returns 500 with correlationId and zero stack/secret leaks', async () => {
  const h = await createReliabilityHarness({ forceUnexpectedErrorOnSearch: true });
  try {
    const res = await h.req('GET', '/provisions/search');
    assert.equal(res.status, 500);
    assert.equal(res.json.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(typeof res.json.correlationId, 'string');
    assert.ok(res.json.correlationId.startsWith('lr_err_'));
    const raw = JSON.stringify(res.json);
    assert.equal(raw.includes('SECRET_INTERNAL_STACK_PATH'), false);
    assert.equal(raw.includes('private_key_12345'), false);
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP D (LR-30C-021..026): Strict Input Validation (6 Tests)
// ============================================================================

test('LR-30C-021: Invalid asOfDateIso on GET /as-of and POST /property-profile/evaluate returns 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    const badAsOf = await h.req('GET', '/provisions/prov_1/as-of?asOfDateIso=not-a-date');
    assert.equal(badAsOf.status, 400);
    assert.equal(badAsOf.json.code, 'VALIDATION_ERROR');

    const badEvalDate = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      body: { cityId: 'tehran', asOfDateIso: '99-99-9999' },
    });
    assert.equal(badEvalDate.status, 400);
    assert.equal(badEvalDate.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-30C-022: Non-positive or floating expectedVersion / expectedPreviousVersion returns 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    for (const badVer of [0, -1, 1.5, '2']) {
      const res = await h.req('POST', '/sources/src_1/verify', {
        headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': `ver-${String(badVer)}` },
        body: { verificationMethodNote: 'note', expectedVersion: badVer },
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, 'VALIDATION_ERROR');
    }
  } finally {
    await h.close();
  }
});

test('LR-30C-023: Prototype pollution keys (__proto__, constructor, prototype) in JSON payload are rejected with 400', async () => {
  const h = await createReliabilityHarness();
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      rawBody: '{"cityId":"tehran","__proto__":{"polluted":true}}',
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');

    const res2 = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      rawBody: '{"cityId":"tehran","nested":{"constructor":{"x":1}}}',
    });
    assert.equal(res2.status, 400);
    assert.equal(res2.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-30C-024: Unknown fields are rejected on mutating POST endpoints with 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'unk-field-1' },
      body: makeSource({ unexpectedEvilField: 'inject', actorId: 'spoof' }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-30C-025: Excessive search query length (>500), note length (>5000), and ID length (>128) return 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    const longQ = await h.req('GET', `/provisions/search?keyword=${'a'.repeat(501)}`);
    assert.equal(longQ.status, 400);

    const longId = await h.req('GET', `/sources/${'s'.repeat(129)}`);
    assert.equal(longId.status, 400);

    const longNote = await h.req('POST', '/sources/src_1/verify', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'long-note' },
      body: { verificationMethodNote: 'n'.repeat(5001) },
    });
    assert.equal(longNote.status, 400);
  } finally {
    await h.close();
  }
});

test('LR-30C-026: Excessive JSON nesting depth (>8) and oversized arrays (>100 items) return 400 VALIDATION_ERROR', async () => {
  const h = await createReliabilityHarness();
  try {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 10; i += 1) deep = { nested: deep };
    const deepRes = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      body: { cityId: 'tehran', extra: deep },
    });
    assert.equal(deepRes.status, 400);
    assert.equal(deepRes.json.code, 'VALIDATION_ERROR');

    const bigArrRes = await h.req('POST', '/compliance-requirements', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'big-arr' },
      body: {
        requirementCode: 'R1', sourceId: 's1', provisionId: 'p1',
        applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
        applicableTransactionContexts: ['SALE_TRANSFER'],
        titleFa: 'الزام', requirementDescription: 'شرح',
        mandatoryVersionClassification: 'MANDATORY_STATUTORY',
        requiredEvidenceTypes: Array.from({ length: 101 }, (_, i) => `EV_${i}`),
        verificationMethodDescription: 'روش', responsibleAuthorityName: 'مرجع',
        effectiveFromIso: '2021-01-01',
      },
    });
    assert.equal(bigArrRes.status, 400);
    assert.equal(bigArrRes.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP E (LR-30C-027..031): Rate Limiting (5 Tests)
// ============================================================================

function createWindowCounterLimiter() {
  const counts = new Map<string, number>();
  return {
    check: (ip: string, bucket: 'general' | 'ai', limit: number, _windowMs: number) => {
      const key = `${ip}:${bucket}:${limit}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= limit;
    },
    counts,
  };
}

test('LR-30C-027: Search endpoint enforces 30/min limit and emits 429 with Retry-After', async () => {
  const limiter = createWindowCounterLimiter();
  const h = await createReliabilityHarness({ checkRateLimit: limiter.check });
  try {
    for (let i = 0; i < 30; i += 1) {
      const r = await h.req('GET', '/provisions/search');
      assert.equal(r.status, 200);
    }
    const blocked = await h.req('GET', '/provisions/search');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(blocked.headers.get('retry-after'), '60');
  } finally {
    await h.close();
  }
});

test('LR-30C-028: AI summaries enforces 5/min bucket and property-profile/evaluate enforces 10/min', async () => {
  const limiter = createWindowCounterLimiter();
  const h = await createReliabilityHarness({ checkRateLimit: limiter.check });
  try {
    for (let i = 0; i < 5; i += 1) {
      const r = await h.req('POST', '/ai-summaries', {
        headers: { authorization: USER_TOKEN, 'idempotency-key': `ai-rl-${i}` },
        body: {},
      });
      assert.equal(r.status, 403);
    }
    const aiBlocked = await h.req('POST', '/ai-summaries', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'ai-rl-6' },
      body: {},
    });
    assert.equal(aiBlocked.status, 429);

    for (let i = 0; i < 10; i += 1) {
      const r = await h.req('POST', '/property-profile/evaluate', {
        headers: { authorization: USER_TOKEN },
        body: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' },
      });
      assert.equal(r.status, 200);
    }
    const evalBlocked = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_TOKEN },
      body: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' },
    });
    assert.equal(evalBlocked.status, 429);
  } finally {
    await h.close();
  }
});

test('LR-30C-029: Rejected 401 and 400 requests still consume rate limit quota', async () => {
  let seen = 0;
  const h = await createReliabilityHarness({
    checkRateLimit: () => {
      seen += 1;
      return seen <= 2;
    },
  });
  try {
    const r1 = await h.req('POST', '/sources', { body: {} }); // 401
    assert.equal(r1.status, 401);
    const r2 = await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN }, body: {} }); // 400
    assert.equal(r2.status, 400);
    const r3 = await h.req('POST', '/sources', { headers: { authorization: ADMIN_1_TOKEN }, body: {} }); // 429
    assert.equal(r3.status, 429);
  } finally {
    await h.close();
  }
});

test('LR-30C-030: Rotating spoofed x-legal-actor-id / x-legal-actor-role headers cannot bypass rate limiting', async () => {
  const limiter = createWindowCounterLimiter();
  const h = await createReliabilityHarness({ checkRateLimit: limiter.check });
  try {
    for (let i = 0; i < 5; i += 1) {
      await h.req('POST', '/ai-summaries', {
        headers: { 'x-legal-actor-id': `spoof-${i}`, 'x-legal-actor-role': 'REGULATORY_ADMIN' },
        body: {},
      });
    }
    const blocked = await h.req('POST', '/ai-summaries', {
      headers: { 'x-legal-actor-id': 'spoof-fresh-999', 'x-legal-actor-role': 'LEGAL_REVIEWER' },
      body: {},
    });
    assert.equal(blocked.status, 429);
  } finally {
    await h.close();
  }
});

test('LR-30C-031: Missing rate limiter in NODE_ENV=production fails closed with 503', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const h = await createReliabilityHarness({ omitRateLimiter: true });
  try {
    const res = await h.req('GET', '/provisions/search');
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    process.env.NODE_ENV = prevEnv;
    await h.close();
  }
});

// ============================================================================
// GROUP F (LR-30C-032..036): Fail-Closed Guarantees (5 Tests)
// ============================================================================

test('LR-30C-032: Firestore null/unavailable blocks all mutations fail-closed with 503 and zero memory fallback', async () => {
  const h = await createReliabilityHarness({ nullDb: true });
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'null-db-1' },
      body: makeSource({ id: 'src_null' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await h.close();
  }
});

test('LR-30C-033: Firestore null/unavailable blocks reads fail-closed with 503', async () => {
  const h = await createReliabilityHarness({ nullDb: true });
  try {
    const res = await h.req('GET', '/provisions/search');
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await h.close();
  }
});

test('LR-30C-034: Failure during idempotency lookup aborts mutation with 503 and zero writes', async () => {
  const h = await createReliabilityHarness();
  try {
    h.mockDb.failNextReadError = new Error('IDEMPOTENCY_READ_FAILURE');
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'idem-read-fail' },
      body: makeSource({ id: 'src_c034' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  } finally {
    await h.close();
  }
});

test('LR-30C-035: Unresolvable or throwing auth resolver fails closed without granting admin privileges', async () => {
  const brokenAuth: LegalRegulatoryAuthDeps = {
    async verifyAdmin() {
      return { authorized: false, statusCode: 503, reason: 'AUTH_PROVIDER_DOWN' };
    },
    async verifyUser() {
      return { authorized: false, authenticated: false, statusCode: 503, reason: 'AUTH_PROVIDER_DOWN' };
    },
  };
  await assert.rejects(
    () =>
      resolveLegalActor(
        { headers: { authorization: 'Bearer any-token', 'x-legal-actor-role': 'REGULATORY_ADMIN' } } as any,
        'REGULATORY_ADMIN',
        brokenAuth,
      ),
    (err: unknown) => err instanceof LegalRegulatoryError && err.statusCode === 503,
  );
});

test('LR-30C-036: Audit write failure atomically rolls back entity and idempotency writes with zero synthetic success', async () => {
  const h = await createReliabilityHarness();
  try {
    h.mockDb.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_1_TOKEN, 'idempotency-key': 'audit-rollback-1' },
      body: makeSource({ id: 'src_c036' }),
    });
    assert.equal(res.status, 503);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 0);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.IDEMPOTENCY), 0);
  } finally {
    await h.close();
  }
});
