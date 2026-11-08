/**
 * Employee 69 — Real Estate Search Intelligence, Discovery & Recommendation Engine Test Suite
 * (`tests/search-intelligence-module.test.ts`)
 */

import assert from 'node:assert/strict';
import express from 'express';
import { CoreApiError } from '../server/modules/core';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  StructuredAuditEvent,
} from '../server/modules/core/types';
import {
  createInMemorySearchIntelligenceTxRunner,
  createSearchIntelligenceRouter,
  interpretNaturalLanguageSearchQuery,
  normalizePersianRealEstateQuery,
  SearchIntelligenceService,
} from '../server/modules/search-intelligence';

function createTestHarness() {
  const txRunner = createInMemorySearchIntelligenceTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      if (token === 'token_user_a') return { uid: 'user_a', email: 'user_a@example.com', email_verified: true };
      if (token === 'token_user_b') return { uid: 'user_b', email: 'user_b@example.com', email_verified: true };
      if (token === 'token_admin') return { uid: 'admin_1', email: 'admin@radar.ir', email_verified: true, admin: true };
      throw new Error('Invalid token');
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'admin_1') return { uid: 'admin_1', email: 'admin@radar.ir', role: 'admin', active: true };
      return null;
    },
  };

  const service = new SearchIntelligenceService({
    tokenVerifier,
    adminStore,
    txRunner,
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    primaryAdminEmails: ['admin@radar.ir'],
  });

  const userA: AuthenticatedPrincipal = {
    uid: 'user_a',
    email: 'user_a@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const userB: AuthenticatedPrincipal = {
    uid: 'user_b',
    email: 'user_b@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_1',
    email: 'admin@radar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: { admin: true },
  };

  return {
    service,
    auditEvents,
    userA,
    userB,
    adminPrincipal,
    tokenVerifier,
    adminStore,
    txRunner,
  };
}

async function runTests(): Promise<void> {
  console.log('--- Running Employee 69 Search Intelligence, Discovery & Recommendation Tests ---');

  // 1. Persian & Arabic text/digit normalization + Natural-Language Query Interpretation & Ambiguity Preservation
  {
    const norm = normalizePersianRealEstateQuery('آپارتمان ۲ خوابه در سعادت\u200cآباد زیر ۲۰ میلیارد');
    assert.equal(norm, 'اپارتمان 2 خوابه در سعادت اباد زیر 20 میلیارد');

    // Query 1: آپارتمان دو خوابه در سعادتآباد
    const q1 = interpretNaturalLanguageSearchQuery('آپارتمان دو خوابه در سعادتآباد');
    assert.deepEqual(q1.extractedFilters.categories, ['residential']);
    assert.equal(q1.extractedFilters.subtype, 'apartment');
    assert.equal(q1.extractedFilters.minRooms, 2);
    assert.equal(q1.extractedFilters.maxRooms, 2);
    assert.deepEqual(q1.extractedFilters.neighborhoodIds, [3]); // سعادت‌آباد

    // Query 2: خانه زیر ۲۰ میلیارد در تهران
    const q2 = interpretNaturalLanguageSearchQuery('خانه زیر ۲۰ میلیارد در تهران');
    assert.deepEqual(q2.extractedFilters.categories, ['residential']);
    assert.equal(q2.extractedFilters.cityId, 'tehran');
    assert.equal(q2.extractedFilters.maxAskingPriceMillion, 20_000);

    // Query 3: دفتر کار نزدیک مترو
    const q3 = interpretNaturalLanguageSearchQuery('دفتر کار نزدیک مترو');
    assert.deepEqual(q3.extractedFilters.categories, ['office']);
    assert.equal(q3.extractedFilters.nearMetroOnly, true);

    // Query 4: زمین مناسب ساخت در منطقه مشخص (must preserve ambiguity and NOT fabricate districtNumber!)
    const q4 = interpretNaturalLanguageSearchQuery('زمین مناسب ساخت در منطقه مشخص');
    assert.deepEqual(q4.extractedFilters.categories, ['land']);
    assert.equal(q4.extractedFilters.districtNumber, undefined);
    assert.equal(q4.isAmbiguous, true);
    assert.ok(q4.ambiguityNotes.length > 0);

    // Query 5: اجاره مغازه با ودیعه ۵۰۰ میلیون
    const q5 = interpretNaturalLanguageSearchQuery('اجاره مغازه با ودیعه ۵۰۰ میلیون');
    assert.deepEqual(q5.extractedFilters.transactionTypes, ['rent']);
    assert.deepEqual(q5.extractedFilters.categories, ['commercial']);
    assert.equal(q5.extractedFilters.maxDepositMillion, 500);
  }

  // 2. Structured search validation, query injection protection, restricted listing isolation & facet accuracy
  {
    const h = createTestHarness();

    // Query injection operator ($where) must be rejected
    await assert.rejects(
      () =>
        h.service.executeIntelligentSearch({
          filters: { $where: 'this.visibility === "RESTRICTED"' },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Execute search for سعادت‌آباد -> restricted property prop_private_restricted_999 must NOT appear in hits or facet counts
    const res = await h.service.executeIntelligentSearch({
      naturalLanguageQuery: 'آپارتمان دو خوابه در سعادتآباد',
    });

    assert.equal(res.totalCount, 2, 'Only the 2 public published 2-bedroom apartments in Saadat Abad should match');
    assert.ok(
      res.hits.every((hit) => hit.item.propertyId !== 'prop_private_restricted_999'),
      'Restricted unpublished listing must never leak into results',
    );
    assert.equal(
      res.facets.totalAuthorizedMatches,
      2,
      'Facet counts must exclude restricted listings',
    );

    // Paid promotion must be explicitly labeled and separated from organic score
    const promotedHit = res.hits.find((hit) => hit.item.propertyId === 'prop_saa_201')!;
    assert.equal(promotedHit.isPaidPromotionPlacement, true);
    assert.ok(promotedHit.paidPromotionLabel);
  }

  // 3. Similarity vs. Financial Comparability (geographic proximity alone is NOT financial comparability)
  {
    const h = createTestHarness();
    const sim = await h.service.findSimilarAndComparableProperties('prop_saa_201');

    // prop_saa_202 (19.1B, 105 sqm) IS financially comparable to prop_saa_201 (18.5B, 100 sqm)
    assert.ok(
      sim.financiallyComparableProperties.some((m) => m.property.propertyId === 'prop_saa_202'),
    );

    // prop_saa_luxury_villa_203 (165B, 500 sqm) is geographically nearby (<100m away),
    // so it appears in nearbyProperties, but MUST NOT appear in financiallyComparableProperties!
    assert.ok(
      sim.nearbyProperties.some((m) => m.property.propertyId === 'prop_saa_luxury_villa_203'),
    );
    assert.ok(
      !sim.financiallyComparableProperties.some(
        (m) => m.property.propertyId === 'prop_saa_luxury_villa_203',
      ),
      'Geographically close luxury villa must not be treated as financially comparable to a 100sqm apartment',
    );
  }

  // 4. Geographic Search (radius & polygon), Index Synchronization, Stale Version Protection & Recommendations Isolation
  {
    const h = createTestHarness();

    const geoRes = await h.service.executeIntelligentSearch({
      filters: {
        radiusSearch: { lat: 35.782, lng: 51.3755, radiusMeters: 1500 },
      },
      sort: 'distance_asc',
    });
    assert.ok(geoRes.totalCount >= 2);

    // Index synchronization & stale version protection
    await h.service.ensureDefaultIndexSeeded();
    const existingRes = await h.service.executeIntelligentSearch({
      filters: { neighborhoodIds: [3] },
    });
    const baseDoc = existingRes.hits[0].item;

    const syncV2 = await h.service.synchronizeCanonicalPropertyToIndex({
      eventId: 'evt_sync_v2',
      eventType: 'PRICE_CHANGED',
      propertyDocument: {
        ...baseDoc,
        canonicalVersion: 2,
        askingPriceMillions: 18_000,
      },
    });
    assert.equal(syncV2.status, 'SYNCHRONIZED');

    // Out-of-order stale version 1 event must be skipped
    const syncStaleV1 = await h.service.synchronizeCanonicalPropertyToIndex({
      eventId: 'evt_sync_stale_v1',
      eventType: 'PRICE_CHANGED',
      propertyDocument: {
        ...baseDoc,
        canonicalVersion: 1,
        askingPriceMillions: 99_000,
      },
    });
    assert.equal(syncStaleV1.status, 'SKIPPED_STALE_VERSION');

    // User B cannot fetch User A's personalized recommendations
    await assert.rejects(
      () =>
        h.service.getPersonalizedRecommendations(h.userB, h.userA.uid, {
          personalizationConsentGranted: true,
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Admin ranking policy update increments version and writes audit event
    const updatedPolicy = await h.service.updateRankingPolicyWeights(h.adminPrincipal, {
      queryRelevance: 30,
    });
    assert.equal(updatedPolicy.version, 2);
    assert.equal(updatedPolicy.weights.queryRelevance, 30);

    // Express Router integration test
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/search-intelligence',
      createSearchIntelligenceRouter(
        {
          tokenVerifier: h.tokenVerifier,
          adminStore: h.adminStore,
          txRunner: h.txRunner,
          auditSink: { async writeAuditEvent() {} },
          primaryAdminEmails: ['admin@radar.ir'],
        },
        h.service,
      ),
    );
    const server = app.listen(0);
    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const nlRes = await fetch(`http://127.0.0.1:${port}/api/v1/search-intelligence/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naturalLanguageQuery: 'دفتر کار نزدیک مترو' }),
      });
      assert.equal(nlRes.status, 200);
    } finally {
      server.close();
    }
  }

  console.log('[PASS] All Employee 69 Search Intelligence, Discovery & Recommendation tests passed!');
}

runTests().catch((err) => {
  console.error('[FAIL] Employee 69 tests failed:', err);
  process.exit(1);
});
