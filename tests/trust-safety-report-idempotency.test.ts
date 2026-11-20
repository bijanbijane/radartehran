/**
 * @file tests/trust-safety-report-idempotency.test.ts
 * @description RT-TS-CRITICAL-027 — Verifies concurrent report race-condition prevention,
 * mandatory Idempotency-Key (replay + 409 mismatch), collision-free SHA-256 Case IDs,
 * bounded Case docs (no reportIds[]), legacy case migration, and >50 cursor pagination.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import {
  buildCanonicalCaseId,
  migrateLegacyModerationCases,
  SocialModerationLifecycleService,
} from '../server/modules/trust-safety/socialModerationLifecycle';
import { registerTrustSafetyV1Routes } from '../server/modules/trust-safety/mountTrustSafetyRoutes';

async function seedPost(store: MockFirestoreCommunityStore, id: string, owner = 'author_idem') {
  await store.setDoc(SOCIAL_COLLECTIONS.posts, id, {
    id,
    recordKind: 'discussion',
    ownerUserId: owner,
    neighborhoodId: 1,
    topicId: 'topic-general',
    titleFa: `پست آزمایشی ${id}`,
    bodyFa: 'متن آزمایشی برای بررسی یکتایی گزارش و صفحه‌بندی.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    createdAtIso: new Date().toISOString(),
  });
}

test('RT-TS-027.1: Concurrent identical reports from same user never create duplicates (transactional Active Report Uniqueness)', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);
  await seedPost(store, 'post_race_1');

  const results = await Promise.allSettled([
    svc.submitReport({
      reporterUid: 'same_user',
      targetType: 'discussion_post',
      targetId: 'post_race_1',
      reason: 'spam',
      detailsFa: 'گزارش هم‌زمان شماره یک با کلید متفاوت.',
      idempotencyKey: 'idem-race-key-1',
    }),
    svc.submitReport({
      reporterUid: 'same_user',
      targetType: 'discussion_post',
      targetId: 'post_race_1',
      reason: 'spam',
      detailsFa: 'گزارش هم‌زمان شماره دو با کلید متفاوت.',
      idempotencyKey: 'idem-race-key-2',
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof CommunityHttpError);
  assert.equal((rejected[0].reason as CommunityHttpError).code, 'DUPLICATE_ACTIVE_REPORT');

  const reports = await store.queryDocs(SOCIAL_COLLECTIONS.reports);
  assert.equal(reports.items.length, 1);
});

test('RT-TS-027.2: Idempotency-Key replays exact response on same payload, returns 409 on payload mismatch, and HTTP route requires header', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);
  await seedPost(store, 'post_idem_http');

  const app = express();
  app.use(express.json());
  registerTrustSafetyV1Routes(app, {
    lifecycle: svc,
    verifyUser: async () => ({ authorized: true, uid: 'u_http_rep', statusCode: 200 }),
  });

  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Missing Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED
    const missingRes = await fetch(`${baseUrl}/api/v1/trust-safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'discussion_post',
        targetId: 'post_idem_http',
        reason: 'spam',
        detailsFa: 'درخواست بدون هدر یکتا باید رد شود.',
      }),
    });
    assert.equal(missingRes.status, 400);
    const missingBody = (await missingRes.json()) as { code?: string };
    assert.equal(missingBody.code, 'IDEMPOTENCY_KEY_REQUIRED');

    // First valid request -> 201
    const payload = {
      targetType: 'discussion_post',
      targetId: 'post_idem_http',
      reason: 'spam',
      detailsFa: 'گزارش معتبر دارای کلید یکتا.',
    };
    const firstRes = await fetch(`${baseUrl}/api/v1/trust-safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ts-idem-valid-001' },
      body: JSON.stringify(payload),
    });
    assert.equal(firstRes.status, 201);
    const firstJson = (await firstRes.json()) as { report: { id: string }; moderationCase: Record<string, unknown> };
    assert.equal('reportIds' in firstJson.moderationCase, false, 'Case must not contain unbounded reportIds array');

    // Replay same key + same payload -> 200 with exact same report ID
    const replayRes = await fetch(`${baseUrl}/api/v1/trust-safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ts-idem-valid-001' },
      body: JSON.stringify(payload),
    });
    assert.equal(replayRes.status, 200);
    const replayJson = (await replayRes.json()) as { report: { id: string }; replayed?: boolean };
    assert.equal(replayJson.report.id, firstJson.report.id);
    assert.equal(replayJson.replayed, true);

    // Same key + DIFFERENT payload -> 409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD
    const conflictRes = await fetch(`${baseUrl}/api/v1/trust-safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ts-idem-valid-001' },
      body: JSON.stringify({ ...payload, detailsFa: 'محتوای کاملاً متفاوت با همان کلید یکتا!' }),
    });
    assert.equal(conflictRes.status, 409);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test('RT-TS-027.3: Collision-free SHA-256 Case IDs prevent punctuation/truncation collisions & migrate legacy cases cleanly', async () => {
  const idA = buildCanonicalCaseId('discussion_post', 'a'.repeat(70) + ':1');
  const idB = buildCanonicalCaseId('discussion_post', 'a'.repeat(70) + ':2');
  const idC = buildCanonicalCaseId('discussion_post', 'post:alpha');
  const idD = buildCanonicalCaseId('discussion_post', 'post_alpha');
  assert.notEqual(idA, idB);
  assert.notEqual(idC, idD);
  assert.match(idA, /^case_[a-f0-9]{40}$/);

  const store = new MockFirestoreCommunityStore();
  await store.setDoc(SOCIAL_COLLECTIONS.moderationCases, 'case_discussion_post_legacy_1', {
    id: 'case_discussion_post_legacy_1',
    targetType: 'discussion_post',
    targetId: 'legacy_1',
    status: 'OPEN',
    reportIds: ['rep_leg_1', 'rep_leg_2'],
    reportCount: 2,
    createdAtIso: '2026-01-01T00:00:00.000Z',
    updatedAtIso: '2026-01-01T00:00:00.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.reports, 'rep_leg_1', {
    id: 'rep_leg_1',
    caseId: 'case_discussion_post_legacy_1',
    targetId: 'legacy_1',
  });

  const dry = await migrateLegacyModerationCases(store, 'DRY_RUN');
  assert.equal(dry.migratedCases, 1);
  const applied = await migrateLegacyModerationCases(store, 'APPLY');
  assert.equal(applied.migratedCases, 1);
  assert.equal(applied.relinkedReports, 1);

  const canonicalId = buildCanonicalCaseId('discussion_post', 'legacy_1');
  const migrated = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.moderationCases, canonicalId);
  assert.ok(migrated);
  assert.equal('reportIds' in migrated, false);
  assert.equal(migrated.reportCount, 2);
});

test('RT-TS-027.4: Cursor pagination retrieves >50 cases and >50 events with status filtering pushed to query', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);

  for (let i = 1; i <= 65; i++) {
    const pid = `post_pg_${String(i).padStart(3, '0')}`;
    await seedPost(store, pid, `owner_${i}`);
    const r = await svc.submitReport({
      reporterUid: `rep_${i}`,
      targetType: 'discussion_post',
      targetId: pid,
      reason: 'spam',
      detailsFa: `گزارش صفحه‌بندی شماره ${i} برای عبور از سقف ۵۰ پرونده.`,
      idempotencyKey: `idem-pg-${i}`,
    });
    if (i <= 10) {
      await svc.claimCase(r.moderationCase.id, 'mod_pg', 60_000, 'DELEGATED_ADMIN');
    }
  }

  // Paginate all 65 cases
  const allCollected: string[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < 10; p++) {
    const page = await svc.listCases({ limit: 20, cursor });
    allCollected.push(...page.items.map((c) => c.id));
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  assert.equal(new Set(allCollected).size, 65);

  // Filter by status=CLAIMED pushed directly to query
  const claimedPage = await svc.listCases({ status: 'CLAIMED', limit: 25 });
  assert.equal(claimedPage.items.length, 10);
  assert.ok(claimedPage.items.every((c) => c.status === 'CLAIMED'));

  // >50 events on a single case
  const bigPostId = 'post_big_events';
  await seedPost(store, bigPostId, 'owner_big');
  let bigCaseId = '';
  for (let i = 1; i <= 55; i++) {
    const res = await svc.submitReport({
      reporterUid: `u_ev_${i}`,
      targetType: 'discussion_post',
      targetId: bigPostId,
      reason: 'spam',
      detailsFa: `گزارش رویداد شماره ${i} برای عبور از ۵۰ رویداد.`,
      idempotencyKey: `idem-ev-${i}`,
    });
    bigCaseId = res.moderationCase.id;
  }

  const allEvents: string[] = [];
  let evCursor: string | null = null;
  for (let p = 0; p < 10; p++) {
    const evPage = await svc.listCaseEvents(bigCaseId, { limit: 20, cursor: evCursor });
    allEvents.push(...evPage.items.map((e) => e.id));
    if (!evPage.hasMore) break;
    evCursor = evPage.nextCursor;
  }
  assert.equal(new Set(allEvents).size, 55);
});
