/** @file tests/stage4-5-6-7-8-convergence.test.ts — Wave-1 Stages 4a/4b, 5, 6, 7 & 8 Verification Suite */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import http from 'node:http';
import { REGISTERED_API_ROUTES } from '../src/utils/expressRouteCatalog';
import {
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
  CommunityHttpError,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';
import { registerTrustSafetyV1Routes } from '../server/modules/trust-safety/mountTrustSafetyRoutes';
import {
  SocialOutboxWorkerService,
  computeBackoffWithJitterMs,
} from '../server/modules/notifications/socialOutboxWorker';
import {
  SocialDiscoveryAndFeedService,
  computeSocialFeedScore,
  normalizePersianSearchText,
} from '../server/modules/search/socialDiscoveryAndFeed';
import {
  OFFICIAL_EVENT_TAXONOMY,
  PlatformTelemetryTaxonomyService,
  scrubTelemetryPii,
} from '../server/modules/analytics-research/platformTelemetryAndTaxonomy';

test('Stage 4a/4b: Route catalog registered, zero client x-verified-user-id headers, UI retry & load-more wired', () => {
  assert.ok(REGISTERED_API_ROUTES.some((r) => r.path === '/api/v1/trust-safety/cases'));
  assert.ok(REGISTERED_API_ROUTES.some((r) => r.path === '/api/v1/social/search'));
  assert.ok(REGISTERED_API_ROUTES.some((r) => r.path === '/api/v1/market-intelligence/overview'));

  const knowledgeSrc = fs.readFileSync('src/features/knowledge/services/knowledgeApiClient.ts', 'utf8');
  const valuationSrc = fs.readFileSync('src/features/valuation/services/valuationStorageAndApiClient.ts', 'utf8');
  const communitySrc = fs.readFileSync('src/features/community/pages/CommunityHubPage.tsx', 'utf8');
  assert.equal(knowledgeSrc.includes('x-verified-user-id'), false);
  assert.equal(valuationSrc.includes('x-verified-user-id'), false);
  assert.ok(communitySrc.includes('community-error-banner'));
  assert.ok(communitySrc.includes('community-load-more-posts'));
});

test('Stage 5: Trust & Safety report dedupe, claim lease lock, soft-delete sync, SoD appeal rejection, and fail-closed HTTP routes', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  const created = await repo.createDiscussion(
    { uid: 'uid_author', emailVerified: true, displayNameFa: 'نگارنده' },
    { titleFa: 'گزارش وضعیت پارکینگ محله جردن', bodyFa: 'در خیابان ناهید شرقی جای پارک عمومی محدود است و نیاز به بررسی دارد.', neighborhoodId: 8 },
  );

  const lifecycle = new SocialModerationLifecycleService(() => store);
  const firstRep = await lifecycle.submitReport({
    reporterUid: 'uid_rep_1',
    targetType: 'discussion_post',
    targetId: created.item.id,
    reason: 'spam',
    detailsFa: 'این پست تکراری و تبلیغاتی است.',
  });
  assert.equal(firstRep.moderationCase.status, 'OPEN');
  assert.equal(firstRep.moderationCase.reportCount, 1);

  // Duplicate active report rejected with 409
  await assert.rejects(
    () => lifecycle.submitReport({
      reporterUid: 'uid_rep_1',
      targetType: 'discussion_post',
      targetId: created.item.id,
      reason: 'spam',
      detailsFa: 'ارسال گزارش مجدد از همان کاربر',
    }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409,
  );

  // Admin 1 claims the case -> Admin 2 conflict lock
  await lifecycle.claimCase(firstRep.moderationCase.id, 'admin_one');
  await assert.rejects(
    () => lifecycle.claimCase(firstRep.moderationCase.id, 'admin_two'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409,
  );

  // Admin 1 decides soft_delete -> updates socialPosts isDeleted & status
  const decided = await lifecycle.applyDecision({
    caseId: firstRep.moderationCase.id,
    adminUid: 'admin_one',
    actorRole: 'admin',
    decision: 'soft_delete',
    reasonFa: 'تایید اسپم تبلیغاتی و حذف نرم محتوا.',
  });
  assert.equal(decided.status, 'DECIDED');
  const postAfter = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, created.item.id);
  assert.equal(postAfter?.isDeleted, true);
  assert.equal(postAfter?.status, 'hidden');

  // Content owner submits formal appeal before SoD resolution
  const submittedAppeal = await lifecycle.submitAppeal({
    caseId: firstRep.moderationCase.id,
    appellantUid: 'uid_author',
    reasonFa: 'محتوای من تبلیغاتی نبوده و مستندات محله را دارد.',
  });
  assert.equal(submittedAppeal.moderationCase.status, 'APPEALED');

  // SoD: Admin 1 cannot resolve appeal on own decision
  await assert.rejects(
    () => lifecycle.resolveAppealWithSoD({
      caseId: firstRep.moderationCase.id,
      reviewerUid: 'admin_one',
      reviewerRole: 'DELEGATED_ADMIN',
      decision: 'overturned',
      reviewerNoteFa: 'تلاش برای بازبینی تصمیم خود',
    }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409,
  );

  // Independent Admin 2 overturns -> restores post
  const closed = await lifecycle.resolveAppealWithSoD({
    caseId: firstRep.moderationCase.id,
    reviewerUid: 'admin_two',
    reviewerRole: 'TRUST_SAFETY_REVIEWER',
    decision: 'overturned',
    reviewerNoteFa: 'پس از بررسی مستقل محتوا تایید و بازگردانی شد.',
  });
  assert.equal(closed.status, 'CLOSED');
  const postRestored = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, created.item.id);
  assert.equal(postRestored?.isDeleted, false);
  assert.equal(postRestored?.status, 'published');

  // Verify HTTP fail-closed auth on unauthenticated /non-admin caller
  const app = express();
  app.use(express.json());
  registerTrustSafetyV1Routes(app, {
    lifecycle,
    verifyAdmin: async () => ({ authorized: false, statusCode: 403, reason: 'FORBIDDEN' }),
  });
  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/trust-safety/cases`);
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test('Stage 6: SocialOutboxWorker handles self-suppression, hidden-target suppression, backoff->DLQ & replay', async () => {
  const store = new MockFirestoreCommunityStore();
  const outbox = new SocialOutboxWorkerService(() => store);

  assert.ok(computeBackoffWithJitterMs(2, 1000, 60_000, 0.5) >= 1500);

  // Self-only event gets suppressed
  await outbox.enqueueSocialEvent({
    eventType: 'social.comment.created.v1',
    targetId: 'post_visible',
    actorUid: 'u_actor',
    recipientUids: ['u_actor'],
    payloadSummaryFa: 'پاسخ خود کاربر',
  });
  const batch1 = await outbox.processPendingBatch({ nowMs: Date.now() + 1000 });
  assert.equal(batch1.suppressed, 1);

  // Hidden post suppresses delivery
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_hidden', { id: 'post_hidden', isDeleted: true, status: 'hidden' });
  await outbox.enqueueSocialEvent({
    eventType: 'social.comment.created.v1',
    targetId: 'post_hidden',
    actorUid: 'u_actor',
    recipientUids: ['u_other'],
    payloadSummaryFa: 'اعلان روی پست حذف‌شده',
  });
  const batch2 = await outbox.processPendingBatch({ nowMs: Date.now() + 2000 });
  assert.equal(batch2.suppressed, 1);

  // Transient transport failures move item to DEAD_LETTER then replay back to DELIVERED
  outbox.setSimulatedTransportFailure(true);
  const failing = await outbox.enqueueSocialEvent({
    eventType: 'social.question.answered.v1',
    targetId: 'post_visible',
    actorUid: 'u_expert',
    recipientUids: ['u_asker'],
    payloadSummaryFa: 'پاسخ جدید ثبت شد',
    maxAttempts: 2,
  });
  let clock = Date.now() + 5000;
  await outbox.processPendingBatch({ nowMs: clock });
  clock += 120_000;
  const dlqPass = await outbox.processPendingBatch({ nowMs: clock });
  assert.equal(dlqPass.deadLettered, 1);

  outbox.setSimulatedTransportFailure(false);
  const replayed = await outbox.replayDeadLetter(failing.id, 'admin_uid');
  assert.equal(replayed.status, 'PENDING');
  const recovered = await outbox.processPendingBatch({ nowMs: Date.now() + 5000 });
  assert.equal(recovered.delivered, 1);

  const metrics = await outbox.getZeroPiiMetrics();
  assert.equal(metrics.piiStored, false);
  assert.equal(metrics.deliveredCount, 1);
});

test('Stage 7: Persian normalization, diversity-penalized ranking, hidden exclusion & cursor pagination', async () => {
  assert.equal(normalizePersianSearchText('كليد نیم‌فاصله ۱۲۳'), 'کلید نیم فاصله 123');

  const firstAuthorScore = computeSocialFeedScore({ helpfulCount: 10, replyCount: 2, ageHours: 1, sameAuthorConsecutiveRank: 0 });
  const thirdAuthorScore = computeSocialFeedScore({ helpfulCount: 10, replyCount: 2, ageHours: 1, sameAuthorConsecutiveRank: 2 });
  assert.ok(firstAuthorScore.score > thirdAuthorScore.score);

  const store = new MockFirestoreCommunityStore();
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'p1', {
    id: 'p1', recordKind: 'discussion', ownerUserId: 'u1', neighborhoodId: 5, topicId: 'traffic',
    titleFa: 'بررسی كیفیت مترو در سعادت‌آباد', bodyFa: 'دسترسی اتوبوس و تاکسی مناسب است.', helpfulCount: 5, replyCount: 2,
    status: 'published', isDeleted: false, createdAtIso: '2026-11-17T08:00:00.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'p2', {
    id: 'p2', recordKind: 'discussion', ownerUserId: 'u2', neighborhoodId: 5, topicId: 'traffic',
    titleFa: 'متروhidden نباید دیده شود', bodyFa: 'حذف شده', helpfulCount: 99, replyCount: 10,
    status: 'hidden', isDeleted: true, createdAtIso: '2026-11-17T09:00:00.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'p3', {
    id: 'p3', recordKind: 'question', ownerUserId: 'u3', neighborhoodId: 5, topicId: 'legal',
    titleFa: 'سند تک برگ محله', bodyFa: 'نکات حقوقی سند.', helpfulCount: 2, replyCount: 1,
    status: 'published', isDeleted: false, createdAtIso: '2026-11-17T07:00:00.000Z',
  });

  const search = new SocialDiscoveryAndFeedService(() => store);
  const found = await search.searchSocial({ q: 'کیفیت' });
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].id, 'p1');
  assert.equal(found.items.some((i) => i.id === 'p2'), false);

  const page1 = await search.getDiscoverFeed({ limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);
  const page2 = await search.getDiscoverFeed({ limit: 1, cursor: page1.nextCursor });
  assert.equal(page2.items.length, 1);
  assert.notEqual(page2.items[0].id, page1.items[0].id);

  const rebuild = await search.rebuildDerivedIndex('admin_1');
  assert.equal(rebuild.rebuilt, true);
  assert.equal(rebuild.indexedDocsCount, 2);
});

test('Stage 8: Governed Telemetry rejects unknown taxonomy, scrubs PII, clamps scores, enforces k>=5 & flags bots', () => {
  const scrubbed = scrubTelemetryPii('تماس با 09123456789 یا user@example.com و شبا IR123456789012345678901234');
  assert.equal(scrubbed.includes('09123456789'), false);
  assert.equal(scrubbed.includes('user@example.com'), false);
  assert.equal(scrubbed.includes('IR123456789012345678901234'), false);

  const svc = new PlatformTelemetryTaxonomyService();
  assert.equal(svc.ingestEvent({ eventCode: 'rogue.unregistered.event', sessionHint: 's1' }).accepted, false);
  assert.ok(OFFICIAL_EVENT_TAXONOMY.length >= 6);

  const clamped = svc.ingestEvent({
    eventCode: 'radar.map.neighborhood_select',
    sessionHint: 'sess-a',
    engagementScore: 42,
    label: '09123456789',
  });
  assert.equal(clamped.accepted, true);
  assert.equal(clamped.record?.durationScore0To10, 10);
  assert.equal(clamped.record?.sanitizedLabel.includes('0912'), false);

  // k < 5 suppressed
  const rollupSmall = svc.getKAnonymousRollup(5);
  assert.equal(rollupSmall.rollups[0].kSuppressed, true);
  assert.equal(rollupSmall.rollups[0].distinctSessions, null);

  // Add 4 more sessions -> k >= 5 released with epistemic caveat
  for (let i = 0; i < 4; i++) {
    svc.ingestEvent({ eventCode: 'radar.map.neighborhood_select', sessionHint: `sess-extra-${i}`, engagementScore: 6 });
  }
  const rollupReady = svc.getKAnonymousRollup(5);
  assert.equal(rollupReady.rollups[0].kSuppressed, false);
  assert.equal(rollupReady.rollups[0].distinctSessions, 5);

  // Bot velocity spike (> 25 events in 10s window)
  let botFlagged = false;
  for (let i = 0; i < 30; i++) {
    const out = svc.ingestEvent({ eventCode: 'radar.search.query_executed', sessionHint: 'bot-sess', nowMs: 1_700_000_000_000 + i });
    if (out.record?.suspectedBot) botFlagged = true;
  }
  assert.equal(botFlagged, true);
});
