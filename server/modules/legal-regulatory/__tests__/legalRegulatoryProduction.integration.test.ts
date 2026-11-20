import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import express, { type Express } from 'express';
import { REGISTERED_API_ROUTES } from '../../../../src/utils/expressRouteCatalog';
import type { ExpressHeadersMap, LegalRegulatoryAuthDeps } from '../actorResolver';
import { FirestoreReadOnlyPropertyRegistryAdapter } from '../adapters';
import { FirestoreLegalRegulatoryStore } from '../firestoreStore';
import { FirestoreLegalRegulatoryTransactionRunner } from '../firestoreTransactionRunner';
import { createProductionLegalRegulatoryModule } from '../index';
import {
  extractMountedExpressRoutes,
  LEGAL_REGULATORY_BASE_PATH,
  LEGAL_REGULATORY_ROUTE_SPECS,
  registerLegalRegulatoryRoutes,
  verifyLegalRegulatoryRouteCatalogAlignment,
} from '../routes';
import { LEGAL_REGULATORY_COLLECTIONS } from '../store';
import { TransactionalFirestoreMock } from './firestoreMockHarness';

/**
 * Stage 30-D — End-to-End Production HTTP, Property Registry & Route Catalog Integration Suite
 * IDs: LR-30D-015 .. LR-30D-022 (Property Registry Real HTTP Chain)
 *      LR-30D-028 .. LR-30D-041 (All 14 Official Endpoints End-to-End + Idempotency/Rollback)
 *      LR-30D-042 .. LR-30D-047 (Route Catalog & Real Express Mount Consistency)
 */

const ADMIN_TOKEN = 'Bearer valid-prod-admin-jwt';
const OWNER_TOKEN = 'Bearer valid-prod-owner-jwt';
const STRANGER_TOKEN = 'Bearer valid-prod-stranger-jwt';
const ACTIVE_REP_TOKEN = 'Bearer valid-prod-active-rep-jwt';
const EXPIRED_REP_TOKEN = 'Bearer valid-prod-expired-rep-jwt';
const REVOKED_REP_TOKEN = 'Bearer valid-prod-revoked-rep-jwt';

const UID_ADMIN = 'uid_30d_admin';
const UID_OWNER = 'uid_30d_owner';
const UID_STRANGER = 'uid_30d_stranger';
const UID_ACTIVE_REP = 'uid_30d_active_rep';
const UID_EXPIRED_REP = 'uid_30d_expired_rep';
const UID_REVOKED_REP = 'uid_30d_revoked_rep';

const FIXED_NOW = () => new Date('2025-06-01T12:00:00.000Z');

function createAuthDeps(): LegalRegulatoryAuthDeps {
  return {
    async verifyAdmin(headers: ExpressHeadersMap) {
      if (String(headers.authorization ?? '') === ADMIN_TOKEN) {
        return { authorized: true, statusCode: 200, actorUid: UID_ADMIN, uid: UID_ADMIN, role: 'admin' };
      }
      return { authorized: false, statusCode: 403, reason: 'ADMIN_FORBIDDEN' };
    },
    async verifyUser(headers: ExpressHeadersMap) {
      const auth = String(headers.authorization ?? '');
      const tokenToUid: Record<string, string> = {
        [OWNER_TOKEN]: UID_OWNER,
        [STRANGER_TOKEN]: UID_STRANGER,
        [ACTIVE_REP_TOKEN]: UID_ACTIVE_REP,
        [EXPIRED_REP_TOKEN]: UID_EXPIRED_REP,
        [REVOKED_REP_TOKEN]: UID_REVOKED_REP,
        [ADMIN_TOKEN]: UID_ADMIN,
      };
      const uid = tokenToUid[auth];
      if (uid) return { authorized: true, authenticated: true, statusCode: 200, uid };
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'UNAUTHORIZED' };
    },
  };
}

interface HttpProductionHarness {
  baseUrl: string;
  dbHarness: TransactionalFirestoreMock;
  app: Express;
  router: express.Router;
  close: () => Promise<void>;
  req: (
    method: string,
    subPath: string,
    opts?: { headers?: Record<string, string>; body?: unknown },
  ) => Promise<{ status: number; headers: Headers; json: Record<string, any> }>;
}

async function startProductionHttpServer(options?: {
  sharedDb?: TransactionalFirestoreMock;
  propertyDb?: TransactionalFirestoreMock | null;
}): Promise<HttpProductionHarness> {
  const dbHarness = options?.sharedDb ?? new TransactionalFirestoreMock();
  const propDb = options?.propertyDb === undefined ? dbHarness.asAdminFirestore() : options.propertyDb ? options.propertyDb.asAdminFirestore() : null;
  const runner = new FirestoreLegalRegulatoryTransactionRunner(dbHarness.asAdminFirestore());
  const store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  const propertyAdapter = new FirestoreReadOnlyPropertyRegistryAdapter({ db: propDb, nowFn: FIXED_NOW });
  const facade = createProductionLegalRegulatoryModule({
    store,
    propertyContextAdapter: propertyAdapter,
  });

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const mountResult = registerLegalRegulatoryRoutes(app, {
    facade,
    propertyContextAdapter: propertyAdapter,
    authDeps: createAuthDeps(),
    checkRateLimit: () => true,
  });
  assert.equal(mountResult.mounted, true);
  assert.ok(mountResult.router);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}${LEGAL_REGULATORY_BASE_PATH}`;

  const req: HttpProductionHarness['req'] = async (method, subPath, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = headers['content-type'] ?? 'application/json';
      body = JSON.stringify(opts.body);
    }
    const resp = await fetch(`${baseUrl}${subPath}`, { method, headers, body });
    const text = await resp.text();
    let json: Record<string, any> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: resp.status, headers: resp.headers, json };
  };

  return {
    baseUrl,
    dbHarness,
    app,
    router: mountResult.router,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    req,
  };
}

async function seedPropertyWithReps(db: TransactionalFirestoreMock, propertyId = 'prop_30d_01') {
  await db.collection('property_registry_entities').doc(propertyId).set({
    id: propertyId,
    canonicalId: propertyId,
    ownerUid: UID_OWNER,
    ownerFullName: 'مالک محرمانه تست',
    ownerPhone: '09121112233',
    ownerNationalId: '0099887766',
    deedNumber: 'DEED-SECRET-30D',
    category: 'residential_apartment',
    landUseCategory: 'RESIDENTIAL_TARAKOM_MOTAVASET',
    geographicRef: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 5,
      neighborhoodCompositeId: 'پونک',
    },
    totalFloors: 6,
    landAreaSqm: 420,
    constructionYear: 1397,
    isWornOutTextureBaftFarsoodeh: false,
    isNearActiveFaultLine: false,
    authorizedRepresentatives: [
      { actorUid: UID_ACTIVE_REP, status: 'ACTIVE', expiresAtIso: '2026-01-01T00:00:00.000Z' },
      { actorUid: UID_EXPIRED_REP, status: 'ACTIVE', expiresAtIso: '2024-01-01T00:00:00.000Z' },
      { actorUid: UID_REVOKED_REP, status: 'REVOKED', expiresAtIso: '2027-01-01T00:00:00.000Z' },
    ],
    exactLocationPrivate: {
      latitude: 35.7611,
      longitude: 51.3311,
      postalCode: '1476699999',
      exactUnitAddress: 'تهران، پونک، کوچه محرمانه ۹، پلاک ۷۷، واحد ۳',
    },
  });
}

async function seedFullVerifiedRegulatoryChain(srv: HttpProductionHarness) {
  const s = await srv.req('POST', '/sources', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-src' },
    body: {
      id: 'src_chain_01',
      officialTitleFa: 'مبحث سوم مقررات ملی ساختمان',
      issuingAuthority: 'وزارت راه و شهرسازی',
      jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
      sourceCategory: 'NATIONAL_BUILDING_CODE_MABHAS',
      reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
      verificationStatus: 'PENDING_VERIFICATION',
      officialReferenceNumber: 'M3-30D-01',
      publicationDateIso: '2024-01-10',
      effectiveFromIso: '2024-02-01',
      internalReviewerNotes: 'یادداشت داخلی ممیزی محرمانه',
      isSyntheticTestFixture: true,
    },
  });
  assert.equal(s.status, 201);

  const sv = await srv.req('POST', '/sources/src_chain_01/verify', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-verify' },
    body: {
      verificationMethodNote: 'تأیید رسمی با روزنامه رسمی',
    },
  });
  assert.equal(sv.status, 200);

  const d = await srv.req('POST', '/documents', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-doc' },
    body: {
      id: 'doc_chain_01',
      sourceId: 'src_chain_01',
      documentCode: 'DOC-M3-30D',
      titleFa: 'سند رسمی مبحث سوم',
      documentCategory: 'BUILDING_CODE_SAFETY',
      effectiveFromIso: '2024-02-01',
    },
  });
  assert.equal(d.status, 201);

  const p = await srv.req('POST', '/provisions', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-prov' },
    body: {
      id: 'prov_chain_01',
      sourceId: 'src_chain_01',
      documentId: 'doc_chain_01',
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '3-1-1',
      citationLabel: 'مبحث ۳، بند ۳-۱-۱',
      titleFa: 'راه خروج اضطراری ساختمان‌های بالای ۵ طبقه',
      documentCategory: 'BUILDING_CODE_SAFETY',
      originalTextVerbatim: 'ساختمان‌های مسکونی با بیش از ۵ طبقه ملزم به راه خروج اضطراری هستند.',
      effectiveFromIso: '2024-02-01',
    },
  });
  assert.equal(p.status, 201);

  const r = await srv.req('POST', '/applicability-rules', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-rule' },
    body: {
      id: 'rule_chain_01',
      sourceId: 'src_chain_01',
      provisionId: 'prov_chain_01',
      ruleName: 'الزام خروج اضطراری مسکونی بالای ۵ طبقه',
      jurisdictionScope: {
        level: 'DISTRICT',
        countryCode: 'IR',
        provinceId: 'tehran',
        cityId: 'tehran',
        districtNumber: 5,
      },
      conditions: {
        requiredPropertyCategories: ['RESIDENTIAL_APARTMENT'],
        minFloors: 5,
        requiredContextFields: ['propertyCategory', 'floorsCount'],
      },
      restrictionOrObligationSummary: 'الزام راه خروج اضطراری استاندارد',
      mandatoryClassification: 'MANDATORY_STATUTORY',
      effectiveFromIso: '2024-02-01',
    },
  });
  assert.equal(r.status, 201);

  const c = await srv.req('POST', '/compliance-requirements', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-chain-comp' },
    body: {
      id: 'comp_chain_01',
      requirementCode: 'FIRE-30D-01',
      sourceId: 'src_chain_01',
      provisionId: 'prov_chain_01',
      applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
      applicableTransactionContexts: ['CONSTRUCTION_PARTNERSHIP_MOSHAREKAT'],
      titleFa: 'گواهی ایمنی آتش‌نشانی',
      requirementDescription: 'ارائه گواهی ایمنی قبل از پایان کار',
      mandatoryVersionClassification: 'MANDATORY_STATUTORY',
      requiredEvidenceTypes: ['FIRE_DEPT_CERTIFICATE'],
      verificationMethodDescription: 'استعلام سامانه آتش‌نشانی',
      responsibleAuthorityName: 'سازمان آتش‌نشانی',
      effectiveFromIso: '2024-02-01',
    },
  });
  assert.equal(c.status, 201);
}

// ============================================================================
// Section A: LR-30D-015 .. LR-30D-022 — Real HTTP Property Registry Chain
// ============================================================================

test('LR-30D-015: Authorized property owner evaluates regulatory profile end-to-end (200)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_015');

    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30d_015', transactionContext: 'CONSTRUCTION_PARTNERSHIP_MOSHAREKAT' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.data.propertyId, 'prop_30d_015');
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.equal(res.json.data.resolvedGeography.districtNumber, 5);
    assert.ok(res.json.data.buildingUseAndSafetyRules.length >= 1);
    assert.ok(res.json.data.applicableComplianceRequirements.length >= 1);
  } finally {
    await srv.close();
  }
});

test('LR-30D-016: Non-owner user AND non-owner backend admin are blocked from private property evaluation (403)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_016');

    const strangerRes = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: STRANGER_TOKEN },
      body: { propertyId: 'prop_30d_016' },
    });
    assert.equal(strangerRes.status, 403);
    assert.equal(strangerRes.json.code, 'FORBIDDEN');

    const adminRes = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: ADMIN_TOKEN },
      body: { propertyId: 'prop_30d_016' },
    });
    assert.equal(adminRes.status, 403);
    assert.equal(adminRes.json.code, 'FORBIDDEN');
  } finally {
    await srv.close();
  }
});

test('LR-30D-017: Active non-expired authorized representative evaluates property profile (200)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_017');

    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: ACTIVE_REP_TOKEN },
      body: { propertyId: 'prop_30d_017' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.propertyId, 'prop_30d_017');
  } finally {
    await srv.close();
  }
});

test('LR-30D-018: Expired or revoked representative is strictly rejected (403)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_018');

    const expiredRes = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: EXPIRED_REP_TOKEN },
      body: { propertyId: 'prop_30d_018' },
    });
    assert.equal(expiredRes.status, 403);

    const revokedRes = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: REVOKED_REP_TOKEN },
      body: { propertyId: 'prop_30d_018' },
    });
    assert.equal(revokedRes.status, 403);
  } finally {
    await srv.close();
  }
});

test('LR-30D-019: Nonexistent propertyId halts evaluation with 404 NOT_FOUND', async () => {
  const srv = await startProductionHttpServer();
  try {
    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_does_not_exist_30d' },
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'NOT_FOUND');
  } finally {
    await srv.close();
  }
});

test('LR-30D-020: Property Registry outage fails closed with 503 PERSISTENCE_UNAVAILABLE', async () => {
  const srv = await startProductionHttpServer({ propertyDb: null });
  try {
    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30d_outage' },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await srv.close();
  }
});

test('LR-30D-021: Caller cannot override canonical Property Registry attributes when evaluating by propertyId', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_021');

    // Attempt to spoof cityId/districtNumber/floorsCount to evade district 5 + >=5 floors rule
    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: {
        propertyId: 'prop_30d_021',
        cityId: 'shiraz',
        districtNumber: 1,
        floorsCount: 1,
        propertyCategory: 'RAW_URBAN_LAND',
      },
    });
    assert.equal(res.status, 200);
    // Authoritative Registry values (tehran, district 5, 6 floors, RESIDENTIAL_APARTMENT) must prevail
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.equal(res.json.data.resolvedGeography.districtNumber, 5);
    assert.ok(
      res.json.data.buildingUseAndSafetyRules.some((p: { provisionId: string }) => p.provisionId === 'prov_chain_01'),
      'Rule matching authoritative 6-floor Tehran district 5 property must still trigger',
    );
  } finally {
    await srv.close();
  }
});

test('LR-30D-022: Property profile HTTP response leaks zero private owner PII, coordinates, postalCode, or exact address', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedPropertyWithReps(srv.dbHarness, 'prop_30d_022');
    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30d_022' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const serialized = JSON.stringify(res.json);
    for (const forbidden of [
      'مالک محرمانه تست',
      '09121112233',
      '0099887766',
      'DEED-SECRET-30D',
      '1476699999',
      'کوچه محرمانه',
      '35.7611',
      '51.3311',
      'exactLocationPrivate',
      'ownerNationalId',
    ]) {
      assert.equal(serialized.includes(forbidden), false, `Response must not leak '${forbidden}'`);
    }
  } finally {
    await srv.close();
  }
});

// ============================================================================
// Section B: LR-30D-028 .. LR-30D-041 — Full End-to-End Tests for All 14 APIs
//            (Including Section 8 Idempotency, Disconnect & Rebuild Durability)
// ============================================================================

test('LR-30D-028: [Endpoint 01] GET /provisions/search works end-to-end with verified-only public filter & pagination', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const res = await srv.req('GET', '/provisions/search?keyword=%D8%AE%D8%B1%D9%88%D8%AC&limit=10');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
    assert.ok(Array.isArray(res.json.data.items));
    assert.equal(res.json.data.items.length, 1);
    assert.equal(res.json.data.items[0].id, 'prov_chain_01');
  } finally {
    await srv.close();
  }
});

test('LR-30D-029: [Endpoint 02] GET /sources/:sourceId redacts internal notes for public and reveals for admin', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const pubRes = await srv.req('GET', '/sources/src_chain_01');
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.json.data.id, 'src_chain_01');
    assert.equal(pubRes.json.data.internalReviewerNotes, undefined);

    const admRes = await srv.req('GET', '/sources/src_chain_01', { headers: { authorization: ADMIN_TOKEN } });
    assert.equal(admRes.status, 200);
    assert.equal(admRes.headers.get('cache-control'), 'private, no-store');
    assert.equal(admRes.json.data.internalReviewerNotes, 'یادداشت داخلی ممیزی محرمانه');
  } finally {
    await srv.close();
  }
});

test('LR-30D-030: [Endpoint 03] POST /sources enforces admin auth, mandatory Idempotency-Key & cross-server rebuild replay', async () => {
  const sharedDb = new TransactionalFirestoreMock();
  const srv1 = await startProductionHttpServer({ sharedDb });
  const body = {
    id: 'src_e2e_030',
    officialTitleFa: 'قانون پیش‌فروش ساختمان',
    issuingAuthority: 'مجلس شورای اسلامی',
    jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
    sourceCategory: 'PARLIAMENTARY_STATUTE',
    reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
    verificationStatus: 'PENDING_VERIFICATION',
    officialReferenceNumber: 'STAT-30D-030',
    publicationDateIso: '2024-01-01',
    effectiveFromIso: '2024-01-15',
    isSyntheticTestFixture: true,
  };
  let createdOnSrv1: Record<string, unknown>;
  try {
    // Missing Idempotency-Key -> 400
    const noKey = await srv1.req('POST', '/sources', { headers: { authorization: ADMIN_TOKEN }, body });
    assert.equal(noKey.status, 400);

    // Commit on Server Instance #1
    const res1 = await srv1.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-030-rebuild' },
      body,
    });
    assert.equal(res1.status, 201);
    createdOnSrv1 = res1.json.data;
  } finally {
    await srv1.close();
  }

  // Server Instance #2 on SAME persistent DB (simulates client disconnect / server restart after commit)
  const srv2 = await startProductionHttpServer({ sharedDb });
  try {
    const res2 = await srv2.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-030-rebuild' },
      body,
    });
    assert.equal(res2.status, 201);
    assert.deepEqual(res2.json.data, createdOnSrv1);
    assert.equal(sharedDb.lastTxOps.includes('WRITE'), false);
    assert.equal(sharedDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.SOURCES), 1);
    assert.equal(sharedDb.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG), 1);
  } finally {
    await srv2.close();
  }
});

test('LR-30D-031: [Endpoint 04] POST /sources/:sourceId/verify updates status atomically and enforces admin auth', async () => {
  const srv = await startProductionHttpServer();
  try {
    const createRes = await srv.req('POST', '/sources', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-031-src' },
      body: {
        id: 'src_e2e_031',
        officialTitleFa: 'بخشنامه آزمایشی تأیید',
        issuingAuthority: 'شهرداری تهران',
        jurisdictionScope: { level: 'CITY', countryCode: 'IR', provinceId: 'tehran', cityId: 'tehran' },
        sourceCategory: 'MUNICIPAL_ZONING_TARH_TAFSILI',
        reliabilityTier: 'OFFICIAL_MUNICIPAL_CIRCULAR',
        verificationStatus: 'PENDING_VERIFICATION',
        officialReferenceNumber: 'MUN-30D-031',
        publicationDateIso: '2024-03-01',
        effectiveFromIso: '2024-03-10',
        isSyntheticTestFixture: true,
      },
    });
    assert.equal(createRes.status, 201);

    const userForbidden = await srv.req('POST', '/sources/src_e2e_031/verify', {
      headers: { authorization: OWNER_TOKEN, 'idempotency-key': 'idem-e2e-031-unauth' },
      body: { verificationMethodNote: 'تلاش غیرمجاز' },
    });
    assert.equal(userForbidden.status, 403);

    const verified = await srv.req('POST', '/sources/src_e2e_031/verify', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-031-ok' },
      body: { verificationMethodNote: 'تأیید شد' },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.json.data.verificationStatus, 'VERIFIED');
    assert.equal(verified.json.data.version, 2);
  } finally {
    await srv.close();
  }
});

test('LR-30D-032: [Endpoint 05] POST /documents validates parent sourceId and persists atomically', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const res = await srv.req('POST', '/documents', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-032' },
      body: {
        id: 'doc_e2e_032',
        sourceId: 'src_chain_01',
        documentCode: 'DOC-E2E-032',
        titleFa: 'سند مکمل ایمنی',
        documentCategory: 'BUILDING_SAFETY_CODE',
        effectiveFromIso: '2024-04-01',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.id, 'doc_e2e_032');
    assert.equal(res.json.data.sourceId, 'src_chain_01');
  } finally {
    await srv.close();
  }
});

test('LR-30D-033: [Endpoint 06] GET /provisions/:provisionId returns verified provision and hides unverified drafts from public', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const pub = await srv.req('GET', '/provisions/prov_chain_01');
    assert.equal(pub.status, 200);
    assert.equal(pub.json.data.id, 'prov_chain_01');
    assert.equal(pub.json.data.createdByActorId, undefined);
  } finally {
    await srv.close();
  }
});

test('LR-30D-034: [Endpoint 07] GET /provisions/:provisionId/as-of returns exact historical snapshot as of date', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const chg = await srv.req('POST', '/provisions/prov_chain_01/changes', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-034-chg' },
      body: {
        changeType: 'AMENDMENT',
        enactingSourceId: 'src_chain_01',
        newOriginalTextVerbatim: 'متن اصلاح‌شده نسخه دوم از ابتدای ۲۰۲۵',
        effectiveFromIso: '2025-01-01',
        changeSummary: 'اصلاحیه ۲۰۲۵',
      },
    });
    assert.equal(chg.status, 201);

    const v1 = await srv.req('GET', '/provisions/prov_chain_01/as-of?asOfDateIso=2024-06-01');
    assert.equal(v1.status, 200);
    assert.equal(v1.json.data.isInForceAtDate, true);
    assert.equal(v1.json.data.matchedSnapshot.versionNumber, 1);

    const v2 = await srv.req('GET', '/provisions/prov_chain_01/as-of?asOfDateIso=2025-06-01');
    assert.equal(v2.status, 200);
    assert.equal(v2.json.data.isInForceAtDate, true);
    assert.equal(v2.json.data.matchedSnapshot.versionNumber, 2);
  } finally {
    await srv.close();
  }
});

test('LR-30D-035: [Endpoint 08] POST /provisions creates provision and rejects concurrent duplicate key cleanly', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const payload = {
      id: 'prov_e2e_035',
      sourceId: 'src_chain_01',
      documentId: 'doc_chain_01',
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '3-35',
      citationLabel: 'مبحث ۳، بند ۳-۳۵',
      titleFa: 'ضابطه تهویه پارکینگ',
      documentCategory: 'BUILDING_SAFETY_CODE',
      originalTextVerbatim: 'پارکینگ‌های زیرزمینی ملزم به تهویه مکانیکی استاندارد هستند.',
      effectiveFromIso: '2024-05-01',
    };

    const [a, b] = await Promise.all([
      srv.req('POST', '/provisions', {
        headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-035-concurrent' },
        body: payload,
      }),
      srv.req('POST', '/provisions', {
        headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-035-concurrent' },
        body: payload,
      }),
    ]);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.deepEqual(a.json.data, b.json.data);
    assert.equal(srv.dbHarness.getCollectionSize(LEGAL_REGULATORY_COLLECTIONS.PROVISIONS), 2); // prov_chain_01 + prov_e2e_035
  } finally {
    await srv.close();
  }
});

test('LR-30D-036: [Endpoint 09] POST /provisions/:provisionId/changes handles version race (409) & audit rollback (503)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);

    // Simulate audit write failure -> full rollback (503)
    srv.dbHarness.failOnCollectionWrite = LEGAL_REGULATORY_COLLECTIONS.AUDIT_LOG;
    const failed = await srv.req('POST', '/provisions/prov_chain_01/changes', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-036-fail' },
      body: {
        changeType: 'AMENDMENT',
        enactingSourceId: 'src_chain_01',
        newOriginalTextVerbatim: 'تغییر ناموفق به دلیل خطای لاگ ممیزی',
        effectiveFromIso: '2025-02-01',
        changeSummary: 'تست بازگشت تراکنش',
      },
    });
    assert.equal(failed.status, 503);

    // Provision must still be at version 1
    const check = await srv.req('GET', '/provisions/prov_chain_01');
    assert.equal(check.json.data.version, 1);

    // Now valid change bumps 1 -> 2
    const ok = await srv.req('POST', '/provisions/prov_chain_01/changes', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-036-ok' },
      body: {
        changeType: 'AMENDMENT',
        enactingSourceId: 'src_chain_01',
        expectedPreviousVersion: 1,
        newOriginalTextVerbatim: 'نسخه دوم معتبر',
        effectiveFromIso: '2025-02-01',
        changeSummary: 'اصلاحیه معتبر',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.updatedProvision.version, 2);

    // Stale expectedPreviousVersion=1 returns 409
    const stale = await srv.req('POST', '/provisions/prov_chain_01/changes', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-036-stale' },
      body: {
        changeType: 'AMENDMENT',
        enactingSourceId: 'src_chain_01',
        expectedPreviousVersion: 1,
        newOriginalTextVerbatim: 'نسخه متعارض',
        effectiveFromIso: '2025-03-01',
        changeSummary: 'تغییر قدیمی',
      },
    });
    assert.equal(stale.status, 409);
  } finally {
    await srv.close();
  }
});

test('LR-30D-037: [Endpoint 10] POST /conflicts registers conflict end-to-end between two provisions', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    await srv.req('POST', '/provisions', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-037-p2' },
      body: {
        id: 'prov_chain_02',
        sourceId: 'src_chain_01',
        documentId: 'doc_chain_01',
        hierarchyLevel: 'ARTICLE',
        provisionNumber: '3-2',
        citationLabel: 'مبحث ۳، بند ۳-۲',
        titleFa: 'بند دوم برای آزمون تعارض',
        documentCategory: 'BUILDING_SAFETY_CODE',
        originalTextVerbatim: 'مفاد متعارض آزمایشی برای بررسی ثبت تعارض',
        effectiveFromIso: '2024-02-01',
      },
    });

    const res = await srv.req('POST', '/conflicts', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-037-conf' },
      body: {
        id: 'conf_e2e_037',
        provisionIdA: 'prov_chain_01',
        provisionIdB: 'prov_chain_02',
        conflictSeverity: 'HIGH_DIRECT_CONTRADICTION',
        conflictDescription: 'تعارض ثبت‌شده در آزمون یکپارچه',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.id, 'conf_e2e_037');
  } finally {
    await srv.close();
  }
});

test('LR-30D-038: [Endpoint 11] POST /applicability-rules persists rule end-to-end with strict validation', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const bad = await srv.req('POST', '/applicability-rules', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-038-bad' },
      body: {
        id: 'rule_bad',
        sourceId: 'src_chain_01',
        provisionId: 'prov_chain_01',
        unknownField: 'should-reject',
      },
    });
    assert.equal(bad.status, 400);

    const ok = await srv.req('POST', '/applicability-rules', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-038-ok' },
      body: {
        id: 'rule_e2e_038',
        sourceId: 'src_chain_01',
        provisionId: 'prov_chain_01',
        ruleName: 'قاعده آزمون یکپارچه',
        conditions: { cityId: 'tehran', propertyCategories: ['RESIDENTIAL_APARTMENT'] },
        restrictionOrObligationSummary: 'الزام بررسی ایمنی',
        mandatoryClassification: 'MANDATORY_STATUTORY',
        effectiveFromIso: '2024-02-01',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.id, 'rule_e2e_038');
  } finally {
    await srv.close();
  }
});

test('LR-30D-039: [Endpoint 12] POST /compliance-requirements persists compliance requirement end-to-end', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const res = await srv.req('POST', '/compliance-requirements', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-039' },
      body: {
        id: 'comp_e2e_039',
        requirementCode: 'CERT-30D-039',
        sourceId: 'src_chain_01',
        provisionId: 'prov_chain_01',
        applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
        applicableTransactionContexts: ['OWNERSHIP_TRANSFER'],
        titleFa: 'گواهی پایان کار معتبر',
        requirementDescription: 'ارائه گواهی پایان کار معتبر در زمان انتقال مالکیت',
        mandatoryVersionClassification: 'MANDATORY_STATUTORY',
        requiredEvidenceTypes: ['COMPLETION_CERTIFICATE'],
        verificationMethodDescription: 'استعلام شهرداری',
        responsibleAuthorityName: 'شهرداری تهران',
        effectiveFromIso: '2024-02-01',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.id, 'comp_e2e_039');
  } finally {
    await srv.close();
  }
});

test('LR-30D-040: [Endpoint 13] POST /property-profile/evaluate rejects unauthenticated (401) and allows authenticated general geographic evaluation (200)', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const anonRes = await srv.req('POST', '/property-profile/evaluate', {
      body: {
        cityId: 'tehran',
        districtNumber: 5,
        propertyCategory: 'RESIDENTIAL_APARTMENT',
        floorsCount: 7,
      },
    });
    assert.equal(anonRes.status, 401);

    const res = await srv.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: {
        cityId: 'tehran',
        districtNumber: 5,
        propertyCategory: 'RESIDENTIAL_APARTMENT',
        floorsCount: 7,
        transactionContext: 'CONSTRUCTION_PARTNERSHIP_MOSHAREKAT',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.ok(res.json.data.buildingUseAndSafetyRules.length >= 1);
  } finally {
    await srv.close();
  }
});

test('LR-30D-041: [Endpoint 14] POST /ai-summaries records non-authoritative AI suggestion with mandatory disclaimer', async () => {
  const srv = await startProductionHttpServer();
  try {
    await seedFullVerifiedRegulatoryChain(srv);
    const res = await srv.req('POST', '/ai-summaries', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'idem-e2e-041' },
      body: {
        targetEntityType: 'PROVISION',
        targetEntityId: 'prov_chain_01',
        modelIdentifier: 'gemini-2.5-flash',
        promptTemplateVersion: 'v1.0',
        summaryText: 'خلاصه پیشنهادی غیرالزام‌آور درباره راه خروج اضطراری',
        suggestedCategoryTags: ['ایمنی', 'آتش‌نشانی'],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.isAuthoritative, false);
    assert.equal(res.json.data.requiresHumanReview, true);
    assert.equal(res.json.data.humanReviewStatus, 'UNREVIEWED');
    assert.ok(typeof res.json.data.disclaimer === 'string' && res.json.data.disclaimer.length > 10);
  } finally {
    await srv.close();
  }
});

// ============================================================================
// Section C: LR-30D-042 .. LR-30D-047 — Route Catalog & Real Mount Consistency
// ============================================================================

test('LR-30D-042: Mounted Express router exposes exactly 14 operational legal-regulatory routes', async () => {
  const srv = await startProductionHttpServer();
  try {
    const mounted = extractMountedExpressRoutes(srv.router, LEGAL_REGULATORY_BASE_PATH);
    assert.equal(mounted.length, 14);
    assert.equal(LEGAL_REGULATORY_ROUTE_SPECS.length, 14);
  } finally {
    await srv.close();
  }
});

test('LR-30D-043: REGISTERED_API_ROUTES catalog contains exactly 14 legal-regulatory routes', () => {
  const lrCatalog = REGISTERED_API_ROUTES.filter((r) => r.path.startsWith(LEGAL_REGULATORY_BASE_PATH));
  assert.equal(lrCatalog.length, 14);
});

test('LR-30D-044: HTTP methods match 100% across mounted Express router, route specs, and REGISTERED_API_ROUTES', async () => {
  const srv = await startProductionHttpServer();
  try {
    const mounted = new Set(extractMountedExpressRoutes(srv.router, LEGAL_REGULATORY_BASE_PATH));
    const catalog = new Set(
      REGISTERED_API_ROUTES.filter((r) => r.path.startsWith(LEGAL_REGULATORY_BASE_PATH)).map((r) => `${r.method} ${r.path}`),
    );
    const specs = new Set(LEGAL_REGULATORY_ROUTE_SPECS.map((s) => `${s.method} ${s.fullPath}`));
    assert.deepEqual(mounted, specs);
    assert.deepEqual(catalog, specs);
  } finally {
    await srv.close();
  }
});

test('LR-30D-045: Full route paths, access policies, and rate limits align 100% between Express router and catalog', async () => {
  const srv = await startProductionHttpServer();
  try {
    const report = verifyLegalRegulatoryRouteCatalogAlignment(REGISTERED_API_ROUTES, srv.router);
    assert.equal(report.aligned, true, `Mismatches: ${JSON.stringify(report)}`);
    assert.equal(report.expectedCount, 14);
    assert.equal(report.catalogCount, 14);
    assert.equal(report.mountedCount, 14);
    assert.deepEqual(report.missingInCatalog, []);
    assert.deepEqual(report.extraInCatalog, []);
    assert.deepEqual(report.unmountedInRouter, []);
    assert.deepEqual(report.mismatches, []);
  } finally {
    await srv.close();
  }
});

test('LR-30D-046: Zero duplicate routes and drift detection catches missing or unregistered routes', async () => {
  const srv = await startProductionHttpServer();
  try {
    const mounted = extractMountedExpressRoutes(srv.router, LEGAL_REGULATORY_BASE_PATH);
    assert.equal(new Set(mounted).size, mounted.length);

    // Negative check: removing one catalog entry MUST cause verifyLegalRegulatoryRouteCatalogAlignment to fail
    const prunedCatalog = REGISTERED_API_ROUTES.filter((r) => r.path !== `${LEGAL_REGULATORY_BASE_PATH}/ai-summaries`);
    const driftReport = verifyLegalRegulatoryRouteCatalogAlignment(prunedCatalog, srv.router);
    assert.equal(driftReport.aligned, false);
    assert.deepEqual(driftReport.missingInCatalog, [`POST ${LEGAL_REGULATORY_BASE_PATH}/ai-summaries`]);
  } finally {
    await srv.close();
  }
});

test('LR-30D-047: Single-mount guard prevents double registration; server.ts mounts once; unifiedPlatformRoutes has zero parallel routes', async () => {
  const srv = await startProductionHttpServer();
  try {
    // Calling registerLegalRegulatoryRoutes a second time on the same Express app must be a no-op
    const secondMount = registerLegalRegulatoryRoutes(srv.app);
    assert.equal(secondMount.mounted, false);

    // Inspect real server.ts mount count
    const serverTs = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const mountCalls = serverTs.match(/registerLegalRegulatoryRoutes\s*\(/g) ?? [];
    assert.equal(mountCalls.length, 1, 'server.ts must mount registerLegalRegulatoryRoutes exactly once');

    // Inspect unifiedPlatformRoutes.ts to ensure zero parallel legal-regulatory router
    const unifiedPath = path.resolve(process.cwd(), 'server/unifiedPlatformRoutes.ts');
    if (fs.existsSync(unifiedPath)) {
      const unifiedSrc = fs.readFileSync(unifiedPath, 'utf8');
      assert.equal(unifiedSrc.includes('/api/v1/legal-regulatory'), false);
    }
  } finally {
    await srv.close();
  }
});
