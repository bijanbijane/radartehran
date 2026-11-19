import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import express, { type Express } from 'express';
import { REGISTERED_API_ROUTES } from '../../../../src/utils/expressRouteCatalog';
import {
  resolveLegalRegulatoryActor,
  type ExpressHeadersMap,
  type LegalRegulatoryAuthDeps,
} from '../actorResolver';
import { FirestoreReadOnlyPropertyRegistryAdapter } from '../adapters';
import { FirestoreLegalRegulatoryStore } from '../firestoreStore';
import { FirestoreLegalRegulatoryTransactionRunner } from '../firestoreTransactionRunner';
import { createLegalRegulatoryModuleFacade, createProductionLegalRegulatoryModule } from '../index';
import {
  LEGAL_REGULATORY_BASE_PATH,
  LEGAL_REGULATORY_ROUTE_SPECS,
  registerLegalRegulatoryRoutes,
  verifyLegalRegulatoryRouteCatalogAlignment,
} from '../routes';
import { LEGAL_REGULATORY_COLLECTIONS } from '../store';
import { TransactionalFirestoreMock } from './firestoreMockHarness';

const ADMIN_TOKEN = 'Bearer valid-admin-jwt';
const USER_A_TOKEN = 'Bearer valid-user-a-jwt';
const USER_B_TOKEN = 'Bearer valid-user-b-jwt';
const STATIC_TOKEN = 'Bearer static-secret-admin';
const OUTAGE_TOKEN = 'Bearer auth-outage-jwt';

function createMockAuthDeps(): LegalRegulatoryAuthDeps {
  return {
    async verifyAdmin(headers: ExpressHeadersMap) {
      const auth = String(headers.authorization ?? '');
      if (auth === OUTAGE_TOKEN) {
        return { authorized: false, statusCode: 503, reason: 'AUTH_BACKEND_UNAVAILABLE' };
      }
      if (auth === ADMIN_TOKEN) {
        return {
          authorized: true,
          statusCode: 200,
          actorUid: 'uid_admin_verified_01',
          uid: 'uid_admin_verified_01',
          role: 'admin',
        };
      }
      if (auth === STATIC_TOKEN || headers['x-admin-token']) {
        // Static admin tokens must NEVER authenticate as human admin
        return {
          authorized: true,
          statusCode: 200,
          actorUid: 'server-secret-admin',
          uid: 'server-secret-admin',
        };
      }
      return { authorized: false, statusCode: 403, reason: 'ADMIN_FORBIDDEN' };
    },
    async verifyUser(headers: ExpressHeadersMap) {
      const auth = String(headers.authorization ?? '');
      if (auth === OUTAGE_TOKEN) {
        return { authorized: false, authenticated: false, statusCode: 503, reason: 'AUTH_BACKEND_UNAVAILABLE' };
      }
      if (auth === USER_A_TOKEN) {
        return { authorized: true, authenticated: true, statusCode: 200, uid: 'uid_user_owner_a' };
      }
      if (auth === USER_B_TOKEN) {
        return { authorized: true, authenticated: true, statusCode: 200, uid: 'uid_user_stranger_b' };
      }
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'INVALID_TOKEN' };
    },
  };
}

interface TestServerHarness {
  baseUrl: string;
  mockDb: TransactionalFirestoreMock;
  app: Express;
  close: () => Promise<void>;
  req: (
    method: string,
    subPath: string,
    opts?: { headers?: Record<string, string>; body?: unknown },
  ) => Promise<{ status: number; headers: Headers; json: Record<string, any> }>;
}

async function createHttpHarness(options?: {
  checkRateLimit?: (ip: string, bucket: 'general' | 'ai', limit: number, windowMs: number) => boolean;
  omitPropertyAdapter?: boolean;
}): Promise<TestServerHarness> {
  const mockDb = new TransactionalFirestoreMock();
  const db = mockDb.asAdminFirestore();
  const runner = new FirestoreLegalRegulatoryTransactionRunner(db);
  const store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  const propertyAdapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db });
  const facade = options?.omitPropertyAdapter
    ? createLegalRegulatoryModuleFacade({ store })
    : createProductionLegalRegulatoryModule({
        store,
        propertyContextAdapter: propertyAdapter,
      });

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  registerLegalRegulatoryRoutes(app, {
    facade,
    propertyContextAdapter: options?.omitPropertyAdapter ? undefined : propertyAdapter,
    authDeps: createMockAuthDeps(),
    checkRateLimit: options?.checkRateLimit,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}${LEGAL_REGULATORY_BASE_PATH}`;

  const req: TestServerHarness['req'] = async (method, subPath, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let bodyStr: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      bodyStr = JSON.stringify(opts.body);
    }
    const resp = await fetch(`${baseUrl}${subPath}`, {
      method,
      headers,
      body: bodyStr,
    });
    const json = (await resp.json()) as Record<string, any>;
    return { status: resp.status, headers: resp.headers, json };
  };

  return {
    baseUrl,
    mockDb,
    app,
    req,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function makeSourceBody(overrides: Record<string, unknown> = {}) {
  return {
    officialTitleFa: 'قانون پیش‌فروش ساختمان مصوب ۱۳۸۹',
    issuingAuthority: 'مجلس شورای اسلامی',
    jurisdictionScope: { countryCode: 'IR', provinceId: 'tehran', cityId: 'tehran' },
    sourceCategory: 'PARLIAMENT_STATUTE',
    reliabilityTier: 'OFFICIAL_PRIMARY_GAZETTE',
    verificationStatus: 'VERIFIED',
    officialReferenceNumber: 'REF-1389-01',
    publicationDateIso: '2020-01-01',
    effectiveFromIso: '2020-02-01',
    internalReviewerNotes: 'CONFIDENTIAL_INTERNAL_LEGAL_NOTE_XYZ',
    restrictedAuditMetadata: { reviewTicket: 'SEC-9991' },
    ...overrides,
  };
}

async function seedSourceDocProvision(h: TestServerHarness, suffix = '1') {
  const srcRes = await h.req('POST', '/sources', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': `seed-src-${suffix}` },
    body: makeSourceBody({ id: `src_${suffix}` }),
  });
  assert.equal(srcRes.status, 201);

  const docRes = await h.req('POST', '/documents', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': `seed-doc-${suffix}` },
    body: {
      id: `doc_${suffix}`,
      sourceId: `src_${suffix}`,
      documentCode: `DOC-${suffix}`,
      titleFa: 'آیین‌نامه اجرایی قانون مسکن',
      documentCategory: 'LAND_USE_AND_ZONING',
      effectiveFromIso: '2020-02-01',
    },
  });
  assert.equal(docRes.status, 201);

  const provRes = await h.req('POST', '/provisions', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': `seed-prov-${suffix}` },
    body: {
      id: `prov_${suffix}`,
      sourceId: `src_${suffix}`,
      documentId: `doc_${suffix}`,
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '12',
      citationLabel: `ماده ۱۲ ضابطه ${suffix}`,
      titleFa: 'محدودیت تراکم و ارتفاع بافت مسکونی',
      documentCategory: 'LAND_USE_AND_ZONING',
      originalTextVerbatim: 'حداکثر تعداد طبقات مجاز در پهنه R122 پنج طبقه است.',
      effectiveFromIso: '2020-02-01',
      internalReviewerNotes: 'PRIVATE_PROV_REVIEWER_NOTE_777',
      restrictedAuditMetadata: { internalCode: 'CONF-777' },
    },
  });
  assert.equal(provRes.status, 201);

  return { src: srcRes.json.data, doc: docRes.json.data, prov: provRes.json.data };
}

async function seedPropertyInMockDb(
  mockDb: TransactionalFirestoreMock,
  propertyId: string,
  ownerUid: string,
  overrides: Record<string, unknown> = {},
) {
  await mockDb.collection('property_registry_entities').doc(propertyId).set({
    id: propertyId,
    ownerUid,
    category: 'residential_apartment',
    geographicRef: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 1,
      neighborhoodCompositeId: 'نیاوران',
    },
    totalFloors: 6,
    landAreaSqm: 420,
    isWornOutTextureBaftFarsoodeh: false,
    exactLocationPrivate: {
      latitude: 35.8171,
      longitude: 51.4692,
      postalCode: '1977911111',
      exactUnitAddress: 'تهران، نیاوران، پلاک محرمانه ۴۲، واحد ۸',
    },
    ...overrides,
  });
}

// ============================================================================
// GROUP 1 (LR-API-001..008): Authentication & Actor Identity (8 Tests)
// ============================================================================

test('LR-API-001: Anonymous request resolves to PUBLIC_READER without authentication', async () => {
  const actor = await resolveLegalRegulatoryActor(
    { headers: {} } as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'PUBLIC_READER');
  assert.equal(actor.isAuthenticated, false);
  assert.equal(actor.actorId, 'anonymous-public-reader');
});

test('LR-API-002: Spoofed x-legal-actor-id header is completely ignored for admin identity', async () => {
  const actor = await resolveLegalRegulatoryActor(
    {
      headers: {
        authorization: ADMIN_TOKEN,
        'x-legal-actor-id': 'spoofed-evil-uid',
      },
    } as unknown as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'REGULATORY_ADMIN');
  assert.equal(actor.actorId, 'uid_admin_verified_01');
  assert.notEqual(actor.actorId, 'spoofed-evil-uid');
});

test('LR-API-003: Spoofed x-legal-actor-id header is completely ignored for regular authenticated user', async () => {
  const actor = await resolveLegalRegulatoryActor(
    {
      headers: {
        authorization: USER_A_TOKEN,
        'x-legal-actor-id': 'uid_admin_verified_01',
      },
    } as unknown as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'AUTHENTICATED_USER');
  assert.equal(actor.actorId, 'uid_user_owner_a');
});

test('LR-API-004: Static admin token returning server-secret-admin is rejected and never yields REGULATORY_ADMIN', async () => {
  const actor = await resolveLegalRegulatoryActor(
    {
      headers: {
        authorization: STATIC_TOKEN,
        'x-admin-token': 'some-static-key',
      },
    } as unknown as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'PUBLIC_READER');
  assert.equal(actor.isAuthenticated, false);
  assert.notEqual(actor.actorId, 'system-admin-key');
  assert.notEqual(actor.actorId, 'server-secret-admin');
});

test('LR-API-005: Unauthenticated request with x-legal-actor-id and x-legal-actor-role headers stays PUBLIC_READER', async () => {
  const actor = await resolveLegalRegulatoryActor(
    {
      headers: {
        'x-legal-actor-id': 'forged-uid',
        'x-legal-actor-role': 'REGULATORY_ADMIN',
      },
    } as unknown as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'PUBLIC_READER');
  assert.equal(actor.isAuthenticated, false);
});

test('LR-API-006: Auth service 503 outage propagates fail-closed 503 PERSISTENCE_UNAVAILABLE', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: OUTAGE_TOKEN, 'idempotency-key': 'outage-1' },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await h.close();
  }
});

test('LR-API-007: Created regulatory source records verified server admin UID and ignores header actor spoofing', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: {
        authorization: ADMIN_TOKEN,
        'x-legal-actor-id': 'spoof-actor-header',
        'x-legal-actor-role': 'LEGAL_REVIEWER',
        'idempotency-key': 'idem-actor-audit-1',
      },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.provenance.recordedByActorId, 'uid_admin_verified_01');
  } finally {
    await h.close();
  }
});

test('LR-API-008: Invalid bearer token falls back to unauthenticated and fails with 401 on protected endpoint', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: 'Bearer invalid-expired-token' },
      body: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'UNAUTHENTICATED');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 2 (LR-API-009..016): Authorization & Role (8 Tests)
// ============================================================================

test('LR-API-009: Regular user attempting to spoof REGULATORY_ADMIN via header is rejected with 403', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: {
        authorization: USER_A_TOKEN,
        'x-legal-actor-role': 'REGULATORY_ADMIN',
        'idempotency-key': 'idem-spoof-admin',
      },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-010: Regular user attempting to spoof LEGAL_REVIEWER via header is rejected with 403 (fail-closed)', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: {
        authorization: USER_A_TOKEN,
        'x-legal-actor-role': 'LEGAL_REVIEWER',
        'idempotency-key': 'idem-spoof-reviewer',
      },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-011: Admin sending x-legal-actor-role=LEGAL_REVIEWER remains strictly REGULATORY_ADMIN (header ignored)', async () => {
  const actor = await resolveLegalRegulatoryActor(
    {
      headers: {
        authorization: ADMIN_TOKEN,
        'x-legal-actor-role': 'LEGAL_REVIEWER',
      },
    } as unknown as express.Request,
    createMockAuthDeps(),
  );
  assert.equal(actor.role, 'REGULATORY_ADMIN');
});

test('LR-API-012: Unauthenticated POST /sources returns 401 UNAUTHENTICATED', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: { 'idempotency-key': 'anon-create' },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'UNAUTHENTICATED');
  } finally {
    await h.close();
  }
});

test('LR-API-013: Unauthenticated POST /sources/:id/verify returns 401 UNAUTHENTICATED', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources/src_1/verify', {
      headers: { 'idempotency-key': 'anon-verify' },
      body: { verificationMethodNote: 'verified' },
    });
    assert.equal(res.status, 401);
  } finally {
    await h.close();
  }
});

test('LR-API-014: Regular user calling POST /provisions returns 403 FORBIDDEN', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/provisions', {
      headers: { authorization: USER_A_TOKEN, 'idempotency-key': 'user-prov' },
      body: { sourceId: 's1', documentId: 'd1' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-015: Regular user calling POST /ai-summaries returns 403 FORBIDDEN', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/ai-summaries', {
      headers: { authorization: USER_A_TOKEN, 'idempotency-key': 'user-ai' },
      body: { targetEntityType: 'PROVISION', targetEntityId: 'p1', targetEntityVersion: 1 },
    });
    assert.equal(res.status, 403);
  } finally {
    await h.close();
  }
});

test('LR-API-016: Unauthenticated POST /property-profile/evaluate returns 401 UNAUTHENTICATED', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      body: { propertyId: 'prop_1' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'UNAUTHENTICATED');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 3 (LR-API-017..030): All 14 Official Endpoints End-to-End & Validation
// ============================================================================

test('LR-API-017: [EP 01] GET /provisions/search returns paginated verified provisions and rejects invalid limit', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep01');
    const ok = await h.req('GET', '/provisions/search?keyword=%D8%AA%D8%B1%D8%A7%DA%A9%D9%85&limit=10');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.items.length, 1);

    const bad = await h.req('GET', '/provisions/search?limit=abc');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-API-018: [EP 02] GET /sources/:sourceId returns verified source publicly and 404 for unknown ID', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep02');
    const ok = await h.req('GET', '/sources/src_ep02');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.id, 'src_ep02');

    const miss = await h.req('GET', '/sources/does-not-exist');
    assert.equal(miss.status, 404);
    assert.equal(miss.json.code, 'NOT_FOUND');
  } finally {
    await h.close();
  }
});

test('LR-API-019: [EP 03] POST /sources creates source atomically and rejects invalid empty officialTitleFa', async () => {
  const h = await createHttpHarness();
  try {
    const ok = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep03-ok' },
      body: makeSourceBody({ id: 'src_ep03' }),
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.version, 1);

    const bad = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep03-bad' },
      body: makeSourceBody({ officialTitleFa: '' }),
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-API-020: [EP 04] POST /sources/:sourceId/verify verifies pending source and enforces expectedVersion CAS', async () => {
  const h = await createHttpHarness();
  try {
    const createRes = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep04-create' },
      body: makeSourceBody({ id: 'src_ep04', verificationStatus: 'PENDING_VERIFICATION' }),
    });
    assert.equal(createRes.status, 201);

    const verifyRes = await h.req('POST', '/sources/src_ep04/verify', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep04-verify' },
      body: { verificationMethodNote: 'تطبیق با روزنامه رسمی شماره ۴۴۱۲', expectedVersion: 1 },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.json.data.verificationStatus, 'VERIFIED');
    assert.equal(verifyRes.json.data.version, 2);

    const stale = await h.req('POST', '/sources/src_ep04/verify', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep04-stale' },
      body: { verificationMethodNote: 'تکرار با نسخه قدیمی', expectedVersion: 1 },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'CONCURRENT_MODIFICATION_CONFLICT');
  } finally {
    await h.close();
  }
});

test('LR-API-021: [EP 05] POST /documents creates document under source and returns 404 for unknown parent source', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep05');
    const ok = await h.req('POST', '/documents', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep05-ok' },
      body: {
        id: 'doc_ep05_extra',
        sourceId: 'src_ep05',
        documentCode: 'DOC-EXTRA',
        titleFa: 'شیوه‌نامه تفصیلی شهرسازی',
        documentCategory: 'CONSTRUCTION_AND_DENSITY',
        effectiveFromIso: '2021-01-01',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.sourceId, 'src_ep05');

    const miss = await h.req('POST', '/documents', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep05-miss' },
      body: {
        sourceId: 'nonexistent_source',
        documentCode: 'DOC-X',
        titleFa: 'سند یتیم',
        documentCategory: 'CONSTRUCTION_AND_DENSITY',
        effectiveFromIso: '2021-01-01',
      },
    });
    assert.equal(miss.status, 404);
  } finally {
    await h.close();
  }
});

test('LR-API-022: [EP 06] GET /provisions/:provisionId returns verified provision publicly and 404 when missing', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep06');
    const ok = await h.req('GET', '/provisions/prov_ep06');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.id, 'prov_ep06');

    const miss = await h.req('GET', '/provisions/prov_missing');
    assert.equal(miss.status, 404);
  } finally {
    await h.close();
  }
});

test('LR-API-023: [EP 07] GET /provisions/:provisionId/as-of resolves date snapshot and requires asOfDateIso', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep07');
    const ok = await h.req('GET', '/provisions/prov_ep07/as-of?asOfDateIso=2023-05-01');
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.isInForceAtDate, true);
    assert.equal(ok.json.data.matchedSnapshot.versionNumber, 1);

    const bad = await h.req('GET', '/provisions/prov_ep07/as-of');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'VALIDATION_ERROR');
  } finally {
    await h.close();
  }
});

test('LR-API-024: [EP 08] POST /provisions creates provision and validates document-source ownership', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep08a');
    await seedSourceDocProvision(h, 'ep08b');
    const bad = await h.req('POST', '/provisions', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep08-mismatch' },
      body: {
        sourceId: 'src_ep08a',
        documentId: 'doc_ep08b',
        hierarchyLevel: 'ARTICLE',
        provisionNumber: '2',
        citationLabel: 'ماده ۲',
        titleFa: 'ماده ناسازگار',
        documentCategory: 'LAND_USE_AND_ZONING',
        originalTextVerbatim: 'متن آزمایشی',
        effectiveFromIso: '2022-01-01',
      },
    });
    assert.equal(bad.status, 400);
  } finally {
    await h.close();
  }
});

test('LR-API-025: [EP 09] POST /provisions/:provisionId/changes bumps provision version atomically and appends history', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep09');
    const res = await h.req('POST', '/provisions/prov_ep09/changes', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep09-chg' },
      body: {
        changeType: 'AMENDMENT',
        enactingSourceId: 'src_ep09',
        newOriginalTextVerbatim: 'متن اصلاح‌شده ماده ۱۲ با سقف شش طبقه.',
        effectiveFromIso: '2024-01-01',
        changeSummary: 'اصلاح سقف ارتفاع طبق مصوبه ۱۴۰۲',
        expectedPreviousVersion: 1,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.updatedProvision.version, 2);
    assert.equal(res.json.data.changeRecord.newProvisionVersion, 2);
  } finally {
    await h.close();
  }
});

test('LR-API-026: [EP 10] POST /conflicts registers conflict between two provisions and rejects self-conflict', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep10a');
    await seedSourceDocProvision(h, 'ep10b');
    const ok = await h.req('POST', '/conflicts', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep10-ok' },
      body: {
        provisionIdA: 'prov_ep10a',
        provisionIdB: 'prov_ep10b',
        conflictSeverity: 'HIGH',
        conflictDescription: 'تعارض سقف تراکم بین طرح تفصیلی و مصوبه کمیسیون ماده ۵',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.status, 'OPEN_UNRESOLVED');

    const selfConflict = await h.req('POST', '/conflicts', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep10-self' },
      body: {
        provisionIdA: 'prov_ep10a',
        provisionIdB: 'prov_ep10a',
        conflictSeverity: 'LOW',
        conflictDescription: 'تعارض با خود',
      },
    });
    assert.equal(selfConflict.status, 400);
  } finally {
    await h.close();
  }
});

test('LR-API-027: [EP 11] POST /applicability-rules creates rule linked to provision and source', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep11');
    const res = await h.req('POST', '/applicability-rules', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep11-rule' },
      body: {
        provisionId: 'prov_ep11',
        sourceId: 'src_ep11',
        ruleName: 'ضابطه ارتفاع منطقه ۱ تهران',
        conditions: { requiredPropertyCategories: ['RESIDENTIAL_APARTMENT'], minFloors: 5, requiredContextFields: [] },
        restrictionOrObligationSummary: 'نیازمند تأییدیه آتش‌نشانی برای ساختمان‌های ۵ طبقه و بالاتر',
        mandatoryClassification: 'MANDATORY_STATUTORY',
        effectiveFromIso: '2020-02-01',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.provisionId, 'prov_ep11');
  } finally {
    await h.close();
  }
});

test('LR-API-028: [EP 12] POST /compliance-requirements creates requirement and enforces non-empty requiredEvidenceTypes', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep12');
    const ok = await h.req('POST', '/compliance-requirements', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep12-ok' },
      body: {
        requirementCode: 'REQ-TEH-FIRE-01',
        sourceId: 'src_ep12',
        provisionId: 'prov_ep12',
        applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
        applicableTransactionContexts: ['BUY_SALE_TRANSFER'],
        titleFa: 'گواهی پایان کار و ایمنی آتش‌نشانی',
        requirementDescription: 'ارائه گواهی معتبر پایان کار قبل از انتقال سند رسمی الزامی است.',
        mandatoryVersionClassification: 'MANDATORY_STATUTORY',
        requiredEvidenceTypes: ['MUNICIPAL_COMPLETION_CERTIFICATE'],
        verificationMethodDescription: 'استعلام سامانه شهرسازی شهرداری',
        responsibleAuthorityName: 'شهرداری تهران',
        effectiveFromIso: '2020-02-01',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.requirementCode, 'REQ-TEH-FIRE-01');

    const bad = await h.req('POST', '/compliance-requirements', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep12-bad' },
      body: {
        requirementCode: 'REQ-EMPTY',
        sourceId: 'src_ep12',
        provisionId: 'prov_ep12',
        applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
        applicableTransactionContexts: ['BUY_SALE_TRANSFER'],
        titleFa: 'الزام ناقص',
        requirementDescription: 'توضیح',
        mandatoryVersionClassification: 'MANDATORY_STATUTORY',
        requiredEvidenceTypes: [],
        verificationMethodDescription: 'روش',
        responsibleAuthorityName: 'مرجع',
        effectiveFromIso: '2020-02-01',
      },
    });
    assert.equal(bad.status, 400);
  } finally {
    await h.close();
  }
});

test('LR-API-029: [EP 13] POST /property-profile/evaluate supports general non-personal evaluation and rejects empty payload', async () => {
  const h = await createHttpHarness();
  try {
    const ok = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionContext: 'BUY_SALE_TRANSFER' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.resolvedGeography.cityId, 'tehran');

    const bad = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: {},
    });
    assert.equal(bad.status, 400);
  } finally {
    await h.close();
  }
});

test('LR-API-030: [EP 14] POST /ai-summaries records non-authoritative AI suggestion for admin', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ep14');
    const ok = await h.req('POST', '/ai-summaries', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ep14-ai' },
      body: {
        targetEntityType: 'PROVISION',
        targetEntityId: 'prov_ep14',
        targetEntityVersion: 1,
        summaryText: 'خلاصه پیشنهادی غیرمرجع برای بازبینی کارشناس حقوقی',
        modelIdentifier: 'gemini-2.5-flash',
        promptTemplateVersion: 'v1.0',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.isAuthoritative, false);
    assert.equal(ok.json.data.requiresHumanReview, true);
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 4 (LR-API-031..035): Property Registry & Ownership Control (5 Tests)
// ============================================================================

test('LR-API-031: Unauthorized user attempting to evaluate another user property receives 403 FORBIDDEN', async () => {
  const h = await createHttpHarness();
  try {
    await seedPropertyInMockDb(h.mockDb, 'prop_owned_by_a', 'uid_user_owner_a');
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_B_TOKEN },
      body: { propertyId: 'prop_owned_by_a', ownerUid: 'uid_user_stranger_b' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-032: Verified property owner receives 200 and authoritative Registry snapshot evaluation', async () => {
  const h = await createHttpHarness();
  try {
    await seedPropertyInMockDb(h.mockDb, 'prop_owner_ok', 'uid_user_owner_a');
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: { propertyId: 'prop_owner_ok', transactionContext: 'BUY_SALE_TRANSFER' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.propertyId, 'prop_owner_ok');
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.equal(res.json.data.resolvedGeography.districtNumber, 1);
  } finally {
    await h.close();
  }
});

test('LR-API-033: Non-existent propertyId returns 404 NOT_FOUND and NEVER evaluates with fake caller attributes', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: {
        propertyId: 'prop_nonexistent_999',
        cityId: 'tehran',
        districtNumber: 2,
        propertyCategory: 'RESIDENTIAL_APARTMENT',
      },
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'NOT_FOUND');
  } finally {
    await h.close();
  }
});

test('LR-API-034: Caller rawInput attributes CANNOT overwrite authoritative Property Registry snapshot', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'snap');
    // Seed a rule that ONLY triggers in Tehran District 1 for >= 6 floors
    await h.req('POST', '/applicability-rules', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'snap-rule' },
      body: {
        provisionId: 'prov_snap',
        sourceId: 'src_snap',
        ruleName: 'قانون ساختمان بلندمرتبه منطقه ۱',
        jurisdictionScope: {
          level: 'DISTRICT',
          countryCode: 'IR',
          provinceId: 'tehran',
          cityId: 'tehran',
          districtNumber: 1,
        },
        conditions: { minFloors: 6, requiredContextFields: [] },
        restrictionOrObligationSummary: 'الزام سیستم اعلام حریق هوشمند',
        mandatoryClassification: 'MANDATORY_STATUTORY',
        effectiveFromIso: '2020-02-01',
      },
    });

    // Registry holds District 1, 6 floors; caller tries to forge District 22 & 1 floor!
    await seedPropertyInMockDb(h.mockDb, 'prop_snap_guard', 'uid_user_owner_a', {
      totalFloors: 6,
      geographicRef: { provinceId: 'tehran', cityId: 'tehran', districtNumber: 1 },
    });

    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: {
        propertyId: 'prop_snap_guard',
        cityId: 'shiraz',
        districtNumber: 22,
        floorsCount: 1,
        propertyCategory: 'COMMERCIAL_RETAIL',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.equal(res.json.data.resolvedGeography.districtNumber, 1);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-API-035: Property Registry evaluation never leaks exactLocationPrivate, postalCode, or coordinates & adapter has zero write methods', async () => {
  const h = await createHttpHarness();
  try {
    await seedPropertyInMockDb(h.mockDb, 'prop_priv_check', 'uid_user_owner_a');
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: { propertyId: 'prop_priv_check' },
    });
    assert.equal(res.status, 200);
    const serialized = JSON.stringify(res.json);
    assert.equal(serialized.includes('1977911111'), false);
    assert.equal(serialized.includes('35.8171'), false);
    assert.equal(serialized.includes('پلاک محرمانه'), false);

    // Verify read-only adapter exposes zero write/mutate methods
    const adapterMethods = Object.getOwnPropertyNames(FirestoreReadOnlyPropertyRegistryAdapter.prototype);
    assert.equal(
      adapterMethods.some((m) => /^(set|put|save|create|update|delete|write|remove)/i.test(m)),
      false,
    );
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 5 (LR-API-036..039): Privacy & Redaction (4 Tests)
// ============================================================================

test('LR-API-036: Public GET /sources/:id blocks UNVERIFIED source with 403 FORBIDDEN', async () => {
  const h = await createHttpHarness();
  try {
    const createRes = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'unver-src' },
      body: makeSourceBody({
        id: 'src_unverified_1',
        reliabilityTier: 'UNVERIFIED_EXTERNAL_REFERENCE',
        verificationStatus: 'UNVERIFIED',
      }),
    });
    assert.equal(createRes.status, 201);

    const publicRes = await h.req('GET', '/sources/src_unverified_1');
    assert.equal(publicRes.status, 403);
    assert.equal(publicRes.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-037: Public GET /sources/:id and GET /provisions/:id redact internalReviewerNotes and restrictedAuditMetadata', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'redact');
    const srcPub = await h.req('GET', '/sources/src_redact');
    assert.equal(srcPub.status, 200);
    assert.equal(srcPub.json.data.internalReviewerNotes, undefined);
    assert.equal(srcPub.json.data.restrictedAuditMetadata, undefined);
    assert.equal(JSON.stringify(srcPub.json).includes('CONFIDENTIAL_INTERNAL_LEGAL_NOTE_XYZ'), false);

    const provPub = await h.req('GET', '/provisions/prov_redact');
    assert.equal(provPub.status, 200);
    assert.equal(provPub.json.data.internalReviewerNotes, undefined);
    assert.equal(provPub.json.data.restrictedAuditMetadata, undefined);
    assert.equal(JSON.stringify(provPub.json).includes('PRIVATE_PROV_REVIEWER_NOTE_777'), false);
  } finally {
    await h.close();
  }
});

test('LR-API-038: Public GET /provisions/:id/as-of blocks UNVERIFIED / DRAFT_UNVERIFIED provision with 403', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'asof_priv');
    const draftProv = await h.req('POST', '/provisions', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'draft-asof' },
      body: {
        id: 'prov_draft_unver',
        sourceId: 'src_asof_priv',
        documentId: 'doc_asof_priv',
        hierarchyLevel: 'ARTICLE',
        provisionNumber: '99',
        citationLabel: 'ماده ۹۹ پیش‌نویس',
        titleFa: 'پیش‌نویس تأییدنشده',
        documentCategory: 'LAND_USE_AND_ZONING',
        originalTextVerbatim: 'متن محرمانه پیش‌نویس',
        lifecycleStatus: 'DRAFT_UNVERIFIED',
        verificationStatus: 'UNVERIFIED',
        effectiveFromIso: '2022-01-01',
      },
    });
    assert.equal(draftProv.status, 201);

    const pub = await h.req('GET', '/provisions/prov_draft_unver/as-of?asOfDateIso=2023-01-01');
    assert.equal(pub.status, 403);
    assert.equal(pub.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-API-039: POST /ai-summaries rejects authoritative/overwrite AI attempts with 422 AUTHORITATIVE_AI_VIOLATION', async () => {
  const h = await createHttpHarness();
  try {
    await seedSourceDocProvision(h, 'ai422');
    const res = await h.req('POST', '/ai-summaries', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'ai-422-guard' },
      body: {
        targetEntityType: 'PROVISION',
        targetEntityId: 'prov_ai422',
        targetEntityVersion: 1,
        summaryText: 'تلاش برای ثبت متن مرجع توسط هوش مصنوعی',
        modelIdentifier: 'gemini-2.5-flash',
        promptTemplateVersion: 'v1.0',
        attemptSetAuthoritative: true,
      },
    });
    assert.equal(res.status, 422);
    assert.equal(res.json.code, 'AUTHORITATIVE_AI_VIOLATION');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 6 (LR-API-040..042): Idempotency & Rate Limit (3 Tests)
// ============================================================================

test('LR-API-040: Mutating POST without Idempotency-Key returns 400 VALIDATION_ERROR and sets Cache-Control: private, no-store', async () => {
  const h = await createHttpHarness();
  try {
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN },
      body: makeSourceBody(),
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'VALIDATION_ERROR');
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  } finally {
    await h.close();
  }
});

test('LR-API-041: Identical Idempotency-Key replay returns same payload with zero duplicate audit; different payload returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
  const h = await createHttpHarness();
  try {
    const body1 = makeSourceBody({ id: 'src_idem_http' });
    const first = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'http-idem-key-1' },
      body: body1,
    });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('cache-control'), 'private, no-store');
    const auditsAfterFirst = h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG);

    const replay = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'http-idem-key-1' },
      body: body1,
    });
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.json.data, first.json.data);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), auditsAfterFirst);

    const conflict = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'http-idem-key-1' },
      body: makeSourceBody({ id: 'src_idem_http', officialTitleFa: 'عنوان متفاوت برای کلید تکراری' }),
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.json.code, 'IDEMPOTENCY_KEY_REUSED');
  } finally {
    await h.close();
  }
});

test('LR-API-042: Exceeding per-route rate limit returns 429 RATE_LIMIT_EXCEEDED with Retry-After and private no-store', async () => {
  let calls = 0;
  const h = await createHttpHarness({
    checkRateLimit: () => {
      calls += 1;
      return calls <= 1;
    },
  });
  try {
    const ok = await h.req('GET', '/provisions/search');
    assert.equal(ok.status, 200);
    const limited = await h.req('GET', '/provisions/search');
    assert.equal(limited.status, 429);
    assert.equal(limited.json.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal(limited.headers.get('cache-control'), 'private, no-store');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 7 (LR-API-043..045): Firestore & HTTP Errors (3 Tests)
// ============================================================================

test('LR-API-043: Firestore outage returns 503 PERSISTENCE_UNAVAILABLE with zero memory fallback and zero raw stack/internal leak', async () => {
  const h = await createHttpHarness();
  try {
    h.mockDb.failNextTxError = new Error('INTERNAL_SECRET_FIRESTORE_NODE_10.0.4.9: DEADLINE_EXCEEDED');
    const res = await h.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'outage-fs-1' },
      body: makeSourceBody({ id: 'src_should_not_persist' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
    const raw = JSON.stringify(res.json);
    assert.equal(raw.includes('10.0.4.9'), false);
    assert.equal(raw.includes('DEADLINE_EXCEEDED'), false);
    assert.equal(h.mockDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 0);
  } finally {
    await h.close();
  }
});

test('LR-API-044: Firestore outage during property ownership verification returns fail-closed 503', async () => {
  const h = await createHttpHarness();
  try {
    h.mockDb.failNextReadError = new Error('INTERNAL_PROP_DB_DOWN');
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: { propertyId: 'prop_any_1' },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(JSON.stringify(res.json).includes('INTERNAL_PROP_DB_DOWN'), false);
  } finally {
    await h.close();
  }
});

test('LR-API-045: Missing Property Registry adapter fails closed with 503 when propertyId is supplied', async () => {
  const h = await createHttpHarness({ omitPropertyAdapter: true });
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: USER_A_TOKEN },
      body: { propertyId: 'prop_no_adapter' },
    });
    // Default FirestoreReadOnlyPropertyRegistryAdapter is instantiated when options.propertyAccessAdapter is omitted,
    // and fails closed with 503 when Admin Firestore is uninitialized in test environment.
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await h.close();
  }
});

// ============================================================================
// GROUP 8 (LR-API-046..048): Route Catalog Alignment & Mount Guards (3 Tests)
// ============================================================================

test('LR-API-046: Exact 14-route 3-way alignment between mounted Express router, LEGAL_REGULATORY_ROUTE_SPECS, and REGISTERED_API_ROUTES', () => {
  assert.equal(LEGAL_REGULATORY_ROUTE_SPECS.length, 14);
  const app = express();
  const mockDb = new TransactionalFirestoreMock();
  const db = mockDb.asAdminFirestore();
  const store = new FirestoreLegalRegulatoryStore({
    transactionRunner: new FirestoreLegalRegulatoryTransactionRunner(db),
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db });
  const facade = createProductionLegalRegulatoryModule({ store, propertyContextAdapter: adapter });
  const mounted = registerLegalRegulatoryRoutes(app, { facade, propertyContextAdapter: adapter });
  assert.ok(mounted.router);

  const report = verifyLegalRegulatoryRouteCatalogAlignment(REGISTERED_API_ROUTES, mounted.router);
  assert.equal(report.expectedCount, 14);
  assert.equal(report.catalogCount, 14);
  assert.equal(report.mountedCount, 14);
  assert.deepEqual(report.missingInCatalog, []);
  assert.deepEqual(report.extraInCatalog, []);
  assert.deepEqual(report.unmountedInRouter, []);
  assert.deepEqual(report.mismatches, []);
  assert.equal(report.aligned, true);

  // Verify drift detection actually catches missing/mismatched catalog entries
  const drifted = verifyLegalRegulatoryRouteCatalogAlignment(REGISTERED_API_ROUTES.slice(0, -1), mounted.router);
  assert.equal(drifted.aligned, false);
  assert.equal(drifted.missingInCatalog.length, 1);
});

test('LR-API-047: registerLegalRegulatoryRoutes prevents duplicate mounting on the same Express app instance', () => {
  const app = express();
  const mockDb = new TransactionalFirestoreMock();
  const db = mockDb.asAdminFirestore();
  const store = new FirestoreLegalRegulatoryStore({
    transactionRunner: new FirestoreLegalRegulatoryTransactionRunner(db),
  });
  const adapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db });
  const facade = createProductionLegalRegulatoryModule({ store, propertyContextAdapter: adapter });

  const first = registerLegalRegulatoryRoutes(app, { facade, propertyContextAdapter: adapter });
  const second = registerLegalRegulatoryRoutes(app, { facade, propertyContextAdapter: adapter });
  assert.equal(first.mounted, true);
  assert.equal(first.routeCount, 14);
  assert.equal(second.mounted, false);
});

test('LR-API-048: server.ts mounts Legal-Regulatory exactly once and unifiedPlatformRoutes.ts defines zero parallel routes', () => {
  const root = process.cwd();
  const serverText = fs.readFileSync(path.resolve(root, 'server.ts'), 'utf8');
  const unifiedText = fs.readFileSync(
    path.resolve(root, 'server/modules/platform-foundation/unifiedPlatformRoutes.ts'),
    'utf8',
  );
  const mountCalls = serverText.match(/registerLegalRegulatoryRoutes\(/g) ?? [];
  assert.equal(mountCalls.length, 1);
  assert.equal(
    unifiedText.includes('/api/v1/legal-regulatory') ||
      unifiedText.includes('/api/legal-regulatory') ||
      unifiedText.includes('registerLegalRegulatoryRoutes'),
    false,
  );
});
