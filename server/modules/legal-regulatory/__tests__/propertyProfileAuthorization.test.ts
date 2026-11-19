import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import type { ExpressHeadersMap, LegalRegulatoryAuthDeps } from '../actorResolver';
import {
  FirestoreReadOnlyPropertyRegistryAdapter,
  type ExternalPropertyCharacteristicsSnapshot,
  type PropertyContextReferenceAdapter,
} from '../adapters';
import { FirestoreLegalRegulatoryStore } from '../firestoreStore';
import { FirestoreLegalRegulatoryTransactionRunner } from '../firestoreTransactionRunner';
import { createProductionLegalRegulatoryModule } from '../index';
import { LEGAL_REGULATORY_BASE_PATH, registerLegalRegulatoryRoutes } from '../routes';
import { TransactionalFirestoreMock } from './firestoreMockHarness';

const ADMIN_TOKEN = 'Bearer admin-30b-jwt';
const OWNER_TOKEN = 'Bearer owner-30b-jwt';
const STRANGER_TOKEN = 'Bearer stranger-30b-jwt';

function makeAuthDeps(): LegalRegulatoryAuthDeps {
  return {
    async verifyAdmin(headers: ExpressHeadersMap) {
      if (headers.authorization === ADMIN_TOKEN) {
        return { authorized: true, statusCode: 200, actorUid: 'uid_admin_30b', uid: 'uid_admin_30b', role: 'admin' };
      }
      return { authorized: false, statusCode: 403, reason: 'FORBIDDEN' };
    },
    async verifyUser(headers: ExpressHeadersMap) {
      if (headers.authorization === OWNER_TOKEN) {
        return { authorized: true, authenticated: true, statusCode: 200, uid: 'uid_owner_30b' };
      }
      if (headers.authorization === STRANGER_TOKEN) {
        return { authorized: true, authenticated: true, statusCode: 200, uid: 'uid_stranger_30b' };
      }
      return { authorized: false, authenticated: false, statusCode: 401, reason: 'UNAUTHENTICATED' };
    },
  };
}

async function createProfileHarness(customAdapter?: PropertyContextReferenceAdapter) {
  const mockDb = new TransactionalFirestoreMock();
  const db = mockDb.asAdminFirestore();
  const runner = new FirestoreLegalRegulatoryTransactionRunner(db);
  const store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  const adapter = customAdapter ?? new FirestoreReadOnlyPropertyRegistryAdapter({ db });
  const facade = createProductionLegalRegulatoryModule({ store, propertyContextAdapter: adapter });

  const app = express();
  app.use(express.json({ limit: '128kb' }));
  registerLegalRegulatoryRoutes(app, { facade, propertyContextAdapter: adapter, authDeps: makeAuthDeps() });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}${LEGAL_REGULATORY_BASE_PATH}`;

  const req = async (method: string, subPath: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let bodyStr: string | undefined;
    if (opts.body !== undefined) {
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

async function seedRuleAndProperty(
  h: Awaited<ReturnType<typeof createProfileHarness>>,
  options: {
    ruleConditions: Record<string, unknown>;
    ruleScope?: Record<string, unknown>;
    ruleEffectiveFrom?: string;
    propertyOverrides?: Record<string, unknown>;
    complianceContexts?: string[];
  },
) {
  await h.req('POST', '/sources', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'src-30b' },
    body: {
      id: 'src_30b',
      officialTitleFa: 'ضابطه شهرسازی تهران',
      issuingAuthority: 'شورای عالی شهرسازی',
      jurisdictionScope: { level: 'NATIONAL', countryCode: 'IR' },
      sourceCategory: 'MUNICIPAL_ZONING_PLAN',
      reliabilityTier: 'PRIMARY_OFFICIAL_STATUTE',
      verificationStatus: 'VERIFIED',
      officialReferenceNumber: 'REF-30B-01',
      publicationDateIso: '2020-01-01',
      effectiveFromIso: '2020-01-01',
      internalReviewerNotes: 'PRIVATE_30B_NOTE',
    },
  });
  await h.req('POST', '/documents', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'doc-30b' },
    body: {
      id: 'doc_30b',
      sourceId: 'src_30b',
      documentCode: 'DOC-30B',
      titleFa: 'طرح تفصیلی منطقه ۱',
      documentCategory: 'LAND_USE_AND_ZONING',
      effectiveFromIso: '2020-01-01',
    },
  });
  await h.req('POST', '/provisions', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'prov-30b' },
    body: {
      id: 'prov_30b',
      sourceId: 'src_30b',
      documentId: 'doc_30b',
      hierarchyLevel: 'ARTICLE',
      provisionNumber: '1',
      citationLabel: 'بند ۱ طرح تفصیلی',
      titleFa: 'محدودیت تراکم و کاربری',
      documentCategory: 'LAND_USE_AND_ZONING',
      originalTextVerbatim: 'حداقل مساحت قطعه و تعداد طبقات طبق ضوابط پهنه کنترل می‌شود.',
      effectiveFromIso: options.ruleEffectiveFrom ?? '2020-01-01',
      internalReviewerNotes: 'PRIVATE_PROV_NOTE_30B',
    },
  });
  await h.req('POST', '/applicability-rules', {
    headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'rule-30b' },
    body: {
      id: 'rule_30b',
      provisionId: 'prov_30b',
      sourceId: 'src_30b',
      ruleName: 'قاعده ارزیابی ملک ثبت‌شده',
      jurisdictionScope: options.ruleScope ?? {
        level: 'DISTRICT',
        countryCode: 'IR',
        provinceId: 'tehran',
        cityId: 'tehran',
        districtNumber: 1,
      },
      conditions: options.ruleConditions,
      restrictionOrObligationSummary: 'ملک مشمول ضابطه ویژه است.',
      mandatoryClassification: 'MANDATORY_STATUTORY',
      effectiveFromIso: options.ruleEffectiveFrom ?? '2020-01-01',
    },
  });
  if (options.complianceContexts) {
    await h.req('POST', '/compliance-requirements', {
      headers: { authorization: ADMIN_TOKEN, 'idempotency-key': 'comp-30b' },
      body: {
        id: 'comp_30b',
        requirementCode: 'REQ-30B',
        sourceId: 'src_30b',
        provisionId: 'prov_30b',
        applicablePropertyCategories: ['RESIDENTIAL_APARTMENT'],
        applicableTransactionContexts: options.complianceContexts,
        titleFa: 'استعلام ویژه پیش‌فروش',
        requirementDescription: 'نیازمند تأییدیه رسمی برای پیش‌فروش',
        mandatoryVersionClassification: 'MANDATORY_STATUTORY',
        requiredEvidenceTypes: ['OFFICIAL_CLEARANCE'],
        verificationMethodDescription: 'استعلام سیستمی',
        responsibleAuthorityName: 'شهرداری تهران',
        effectiveFromIso: '2020-01-01',
        internalReviewerNotes: 'PRIVATE_COMP_NOTE_30B',
      },
    });
  }

  await h.mockDb.collection('property_registry_entities').doc('prop_30b_01').set({
    id: 'prop_30b_01',
    canonicalId: 'prop_30b_01',
    ownerUid: 'uid_owner_30b',
    category: 'residential_apartment',
    landUseCategory: 'RESIDENTIAL_TARAKOM_ZIYAD',
    geographicRef: { provinceId: 'tehran', cityId: 'tehran', districtNumber: 1, neighborhoodCompositeId: 'نیاوران' },
    totalFloors: 7,
    landAreaSqm: 500,
    buildingAgeYears: 12,
    exactLocationPrivate: { latitude: 35.815, longitude: 51.468, postalCode: '1977988888', exactUnitAddress: 'آدرس محرمانه تست' },
    ...(options.propertyOverrides ?? {}),
  });
}

// ============================================================================
// STAGE 30-B PROFILE AUTHORIZATION & CANONICAL INPUT TESTS (LR-30B-019 .. 036)
// ============================================================================

test('LR-30B-019: Authorized property snapshot produces confirmed regulatory profile', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { propertyCategories: ['RESIDENTIAL_APARTMENT'], minPlotAreaSqm: 400, requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.propertyId, 'prop_30b_01');
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-020: Caller cannot override plotAreaSqm when propertyId is supplied', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { minPlotAreaSqm: 450, requiredContextFields: [] } });
    // Registry has 500 sqm; caller tries to forge 100 sqm to evade rule
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', plotAreaSqm: 100 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-021: Caller cannot override propertyCategory when propertyId is supplied', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { propertyCategories: ['RESIDENTIAL_APARTMENT'], requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', propertyCategory: 'INDUSTRIAL' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-022: Caller cannot override landUseCategory when propertyId is supplied', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { landUseCategories: ['RESIDENTIAL_TARAKOM_ZIYAD'], requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', landUseCategory: 'GREEN_SPACE_OR_GARDEN' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-023: Caller cannot override cityId, provinceId, districtNumber, or neighborhoodId when propertyId is supplied', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', provinceId: 'fars', cityId: 'shiraz', districtNumber: 9, neighborhoodId: 'معالی‌آباد' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
    assert.equal(res.json.data.resolvedGeography.districtNumber, 1);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
  } finally {
    await h.close();
  }
});

test('LR-30B-024: Caller cannot override floorsCount or buildingAgeYears when propertyId is supplied', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { minFloorsCount: 6, minBuildingAgeYears: 10, requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', floorsCount: 1, buildingAgeYears: 0 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.landUseRestrictions.length, 1);
    assert.equal(res.json.data.landUseRestrictions[0].outcomeState, 'CONFIRMED_APPLICABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-025: Missing propertyId halts evaluation cleanly with 404 NOT_FOUND', async () => {
  const h = await createProfileHarness();
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_unknown_404', cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' },
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'NOT_FOUND');
  } finally {
    await h.close();
  }
});

test('LR-30B-026: Unauthorized caller AND backend admin without ownership are blocked with 403 FORBIDDEN', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { requiredContextFields: [] } });
    const strangerRes = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: STRANGER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(strangerRes.status, 403);
    assert.equal(strangerRes.json.code, 'FORBIDDEN');

    // Admin role alone MUST NOT grant access to another user's private property
    const adminRes = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: ADMIN_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(adminRes.status, 403);
    assert.equal(adminRes.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});

test('LR-30B-027: Mismatched snapshot propertyId halts evaluation with 422 SNAPSHOT_INCONSISTENT', async () => {
  const mismatchedAdapter: PropertyContextReferenceAdapter = {
    async getPropertyCharacteristicsById() {
      return { status: 'FOUND', snapshot: { propertyId: 'prop_tampered_other', cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT' } };
    },
  };
  const h = await createProfileHarness(mismatchedAdapter);
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_requested_1' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.json.code, 'SNAPSHOT_INCONSISTENT');
  } finally {
    await h.close();
  }
});

test('LR-30B-028: Incomplete snapshot emits warning and never produces false CONFIRMED_APPLICABLE', async () => {
  const incompleteAdapter: PropertyContextReferenceAdapter = {
    async getPropertyCharacteristicsById({ propertyId }) {
      return { status: 'FOUND', snapshot: { propertyId, cityId: 'tehran' } }; // missing propertyCategory, plotAreaSqm, floorsCount
    },
  };
  const h = await createProfileHarness(incompleteAdapter);
  try {
    await seedRuleAndProperty(h, {
      ruleScope: { level: 'CITY', countryCode: 'IR', provinceId: 'tehran', cityId: 'tehran' },
      ruleConditions: { requiredContextFields: [] },
    });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_incomplete_1' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.incompleteOrMissingDataWarnings.length > 0);
    for (const r of res.json.data.landUseRestrictions) {
      assert.notEqual(r.outcomeState, 'CONFIRMED_APPLICABLE');
    }
  } finally {
    await h.close();
  }
});

test('LR-30B-029: Property Registry outage halts evaluation with 503 PERSISTENCE_UNAVAILABLE', async () => {
  const h = await createProfileHarness();
  try {
    h.mockDb.failNextReadError = new Error('REGISTRY_CLUSTER_UNREACHABLE');
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.code, 'PERSISTENCE_UNAVAILABLE');
  } finally {
    await h.close();
  }
});

test('LR-30B-030: Corrupt snapshot attributes (negative plotAreaSqm / invalid category) halt with 422 SNAPSHOT_INCONSISTENT', async () => {
  const corruptAdapter: PropertyContextReferenceAdapter = {
    async getPropertyCharacteristicsById({ propertyId }) {
      return {
        status: 'FOUND',
        snapshot: {
          propertyId,
          cityId: 'tehran',
          plotAreaSqm: -250,
          propertyCategory: 'INVALID_CATEGORY' as ExternalPropertyCharacteristicsSnapshot['propertyCategory'],
        },
      };
    },
  };
  const h = await createProfileHarness(corruptAdapter);
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_corrupt_1' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.json.code, 'SNAPSHOT_INCONSISTENT');
  } finally {
    await h.close();
  }
});

test('LR-30B-031: Allowed caller control parameters (transactionContext, asOfDateIso) are preserved with snapshot', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, {
      ruleEffectiveFrom: '2024-06-01',
      ruleConditions: { requiredContextFields: [] },
      complianceContexts: ['PRE_SALE_PISH_FOROOSH'],
    });
    const beforeEffective = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', transactionContext: 'PRE_SALE_PISH_FOROOSH', asOfDateIso: '2022-01-01' },
    });
    assert.equal(beforeEffective.status, 200);
    assert.equal(beforeEffective.json.data.evaluatedAsOfDateIso, '2022-01-01');
    assert.equal(beforeEffective.json.data.landUseRestrictions.length, 0);
    assert.equal(beforeEffective.json.data.applicableComplianceRequirements.length, 1);

    const afterEffective = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', transactionContext: 'LEASE_RENTAL', asOfDateIso: '2025-01-01' },
    });
    assert.equal(afterEffective.status, 200);
    assert.equal(afterEffective.json.data.landUseRestrictions.length, 1);
    assert.equal(afterEffective.json.data.applicableComplianceRequirements.length, 0);
  } finally {
    await h.close();
  }
});

test('LR-30B-032: Hypothetical evaluation without propertyId is isolated and never queries Property Registry', async () => {
  let adapterCalls = 0;
  const spyAdapter: PropertyContextReferenceAdapter = {
    async getPropertyCharacteristicsById() {
      adapterCalls += 1;
      return { status: 'NOT_FOUND' };
    },
  };
  const h = await createProfileHarness(spyAdapter);
  try {
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { cityId: 'tehran', districtNumber: 5, propertyCategory: 'RESIDENTIAL_APARTMENT', floorsCount: 4 },
    });
    assert.equal(res.status, 200);
    assert.equal(adapterCalls, 0);
    assert.equal(res.json.data.propertyId, undefined);
    assert.equal(res.json.data.resolvedGeography.cityId, 'tehran');
  } finally {
    await h.close();
  }
});

test('LR-30B-033: Profile HTTP response leaks zero private PII, coordinates, address, or internalReviewerNotes', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, {
      ruleConditions: { requiredContextFields: [] },
      complianceContexts: ['SALE_TRANSFER'],
    });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01', transactionContext: 'SALE_TRANSFER' },
    });
    assert.equal(res.status, 200);
    const raw = JSON.stringify(res.json);
    assert.equal(raw.includes('1977988888'), false);
    assert.equal(raw.includes('35.815'), false);
    assert.equal(raw.includes('آدرس محرمانه'), false);
    assert.equal(raw.includes('uid_owner_30b'), false);
    assert.equal(raw.includes('PRIVATE_30B_NOTE'), false);
    assert.equal(raw.includes('PRIVATE_COMP_NOTE_30B'), false);
  } finally {
    await h.close();
  }
});

test('LR-30B-034: Property profile evaluation executes ZERO write/transaction operations', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { requiredContextFields: [] } });
    const txCommitsBefore = h.mockDb.txCommitCount;
    const propBefore = h.mockDb.getRawDoc('property_registry_entities', 'prop_30b_01');

    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(res.status, 200);
    assert.equal(h.mockDb.txCommitCount, txCommitsBefore);
    assert.deepEqual(h.mockDb.getRawDoc('property_registry_entities', 'prop_30b_01'), propBefore);
  } finally {
    await h.close();
  }
});

test('LR-30B-035: POST /property-profile/evaluate always returns Cache-Control: private, no-store and Pragma: no-cache', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { requiredContextFields: [] } });
    const okRes = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: OWNER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('cache-control'), 'private, no-store');
    assert.equal(okRes.headers.get('pragma'), 'no-cache');

    const forbiddenRes = await h.req('POST', '/property-profile/evaluate', {
      headers: { authorization: STRANGER_TOKEN },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.headers.get('cache-control'), 'private, no-store');
    assert.equal(forbiddenRes.headers.get('pragma'), 'no-cache');
  } finally {
    await h.close();
  }
});

test('LR-30B-036: Spoofed x-legal-actor-id and x-legal-actor-role headers cannot bypass property ownership check', async () => {
  const h = await createProfileHarness();
  try {
    await seedRuleAndProperty(h, { ruleConditions: { requiredContextFields: [] } });
    const res = await h.req('POST', '/property-profile/evaluate', {
      headers: {
        authorization: STRANGER_TOKEN,
        'x-legal-actor-id': 'uid_owner_30b',
        'x-legal-actor-role': 'REGULATORY_ADMIN',
      },
      body: { propertyId: 'prop_30b_01' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'FORBIDDEN');
  } finally {
    await h.close();
  }
});
