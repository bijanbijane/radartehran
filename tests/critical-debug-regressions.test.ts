import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { SearchWorkspaceStateManager } from '../src/features/search/services/searchWorkspaceService';
import { registerAnalyticsResearchRoutes } from '../server/modules/analytics-research/analyticsRoutes';
import { getAnalyticsState } from '../server/modules/analytics-research/analyticsRepository';
import { registerKnowledgeRoutes } from '../server/modules/knowledge/knowledgeRoutes';
import { knowledgeServerStore } from '../server/modules/knowledge/knowledgeStore';
import { commitSponsorExtendViaRest } from '../src/utils/serverSponsorFirestoreHelper';

async function withServer(setup: (app: express.Express) => void, fn: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  setup(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('SearchWorkspaceStateManager isolates saved searches, history, autocomplete, and recommendations per userId', () => {
  const ws = new SearchWorkspaceStateManager();
  ws.createSavedSearch({
    userId: 'user-a',
    titleFa: 'راز اختصاصی کاربر الف در سعادت‌آباد',
    query: 'سعادت‌آباد',
    scope: 'PROPERTIES',
    filters: { cityId: 'tehran' },
  });
  ws.recordSearchHistory({ userId: 'user-a', rawQuery: 'آپارتمان مخفی کاربر الف', scope: 'ALL', resultCount: 3 });

  for (let i = 0; i < 30; i++) {
    ws.recordSearchHistory({ userId: 'user-b', rawQuery: `پونک جستجو ${i}`, scope: 'ALL', resultCount: 1 });
  }

  assert.equal(ws.getSearchHistory('user-a').length, 1);
  assert.equal(ws.getSearchHistory('user-b').length, 25);
  assert.equal(ws.getSavedSearches('user-a').length, 1);
  assert.equal(ws.getSavedSearches('user-b').length, 0);

  ws.clearSearchHistory('user-b');
  assert.equal(ws.getSearchHistory('user-b').length, 0);
  assert.equal(ws.getSearchHistory('user-a').length, 1);

  const anonSuggestions = ws.getAutocompleteSuggestions('', 'tehran', null);
  assert.equal(anonSuggestions.some((s) => s.category === 'RECENT' || s.category === 'SAVED'), false);

  const userBSuggestions = ws.getAutocompleteSuggestions('', 'tehran', 'user-b');
  assert.equal(userBSuggestions.some((s) => s.titleFa.includes('کاربر الف')), false);

  const anonRecs = ws.getDiscoveryRecommendations({ cityId: 'tehran', userId: null });
  assert.equal(anonRecs.some((r) => r.category === 'SAVED_SEARCH_MATCH'), false);
});

test('Analytics export download enforces auth on INTERNAL/RESTRICTED exports and sanitizes Content-Disposition', async () => {
  await withServer(
    (app) => registerAnalyticsResearchRoutes(app, { getIp: () => '127.0.0.1' }),
    async (baseUrl) => {
      const state = getAnalyticsState();
      state.exportJobs.unshift(
        {
          exportId: 'exp-test-restricted',
          placeId: 'bad";filename="evil.exe',
          format: 'csv',
          requestedByUid: 'admin-uid',
          callerRole: 'ADMIN',
          datasetClassification: 'RESTRICTED',
          sampleCount: 20,
          status: 'READY',
          fileName: 'radar-analytics-bad";evil.csv',
          mimeType: 'text/csv; charset=utf-8',
          contentText: 'col\nval',
          limitationsFa: [],
          createdAtIso: new Date().toISOString(),
        },
        {
          exportId: 'exp-test-internal',
          placeId: 'punak',
          format: 'csv',
          requestedByUid: 'uid-owner-1',
          callerRole: 'RESEARCHER',
          datasetClassification: 'INTERNAL',
          sampleCount: 15,
          status: 'READY',
          fileName: 'radar-analytics-punak.csv',
          mimeType: 'text/csv; charset=utf-8',
          contentText: 'col\nval',
          limitationsFa: [],
          createdAtIso: new Date().toISOString(),
        },
        {
          exportId: 'exp-test-public-unsafe-name',
          placeId: 'saadat',
          format: 'csv',
          requestedByUid: 'public',
          callerRole: 'PUBLIC_USER',
          datasetClassification: 'PUBLIC',
          sampleCount: 15,
          status: 'READY',
          fileName: 'radar-analytics-foo";bar.csv',
          mimeType: 'text/csv; charset=utf-8',
          contentText: 'col\nval',
          limitationsFa: [],
          createdAtIso: new Date().toISOString(),
        },
      );

      const restrictedRes = await fetch(`${baseUrl}/api/v1/analytics/exports/exp-test-restricted/download`);
      assert.ok(restrictedRes.status === 401 || restrictedRes.status === 403);

      const internalRes = await fetch(`${baseUrl}/api/v1/analytics/exports/exp-test-internal/download`);
      assert.equal(internalRes.status, 401);

      const publicRes = await fetch(`${baseUrl}/api/v1/analytics/exports/exp-test-public-unsafe-name/download`);
      assert.equal(publicRes.status, 200);
      const disp = publicRes.headers.get('content-disposition') || '';
      assert.equal(disp, 'attachment; filename="radar-analytics-foo__bar.csv"');

      // Clean up injected test jobs
      state.exportJobs = state.exportJobs.filter((j) => !j.exportId.startsWith('exp-test-'));
    },
  );
});

test('Knowledge status endpoint does not expose non-public draft publications to unauthenticated callers', async () => {
  await withServer(
    (app) => registerKnowledgeRoutes(app),
    async (baseUrl) => {
      const firstPub = knowledgeServerStore.publications[0];
      assert.ok(firstPub);
      const prevStatus = firstPub.status;
      firstPub.status = 'draft';
      try {
        const res = await fetch(`${baseUrl}/api/knowledge/publications/${encodeURIComponent(firstPub.id)}/status`);
        assert.equal(res.status, 404);
      } finally {
        firstPub.status = prevStatus;
      }
    },
  );
});

test('commitSponsorExtendViaRest builds valid Firestore REST commit payload and requires bearer token', async () => {
  await assert.rejects(
    () =>
      commitSponsorExtendViaRest(
        {
          hoodId: 5,
          buyPerSqm: 120,
          rahn80m: 950,
          sponsor: { name: 'املاک نمونه', phone: '09121234567', specialty: 'مسکونی', experienceYears: 8, expiresAtIso: '2027-01-01T00:00:00Z', planType: 'paid_1m' },
          manualLockUntilMs: Date.now() + 86400000,
        },
        undefined,
      ),
    /FIREBASE_REST_BEARER_MISSING/,
  );

  let capturedBody = '';
  await commitSponsorExtendViaRest(
    {
      hoodId: 5,
      buyPerSqm: 120,
      rahn80m: 950,
      sponsor: { name: 'املاک نمونه', phone: '09121234567', specialty: 'مسکونی', experienceYears: 8, expiresAtIso: '2027-01-01T00:00:00Z', planType: 'paid_1m' },
      manualLockUntilMs: 1800000000000,
    },
    'Bearer test-token-123',
    async (_input, init) => {
      capturedBody = String(init?.body || '');
      return new Response('{}', { status: 200 });
    },
  );
  assert.ok(capturedBody.includes('neighborhoodOverrides/5'));
  assert.ok(capturedBody.includes('2027-01-01T00:00:00Z'));
});
