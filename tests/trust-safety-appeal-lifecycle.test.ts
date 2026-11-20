/**
 * @file tests/trust-safety-appeal-lifecycle.test.ts
 * @description RT-TS-CRITICAL-029 — Verifies independent Appeal creation (socialModerationAppeals),
 * owner-only appellant authorization, rejection of resolve without prior appeal (404/409),
 * strict Separation of Duties (SoD), authorized reviewer role checks, and atomic overturn + feed sync.
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
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';
import { registerTrustSafetyV1Routes } from '../server/modules/trust-safety/mountTrustSafetyRoutes';
import type { SocialFeedIndexDocument } from '../server/modules/search/socialFeedProjection';

test('RT-TS-029.1: Appeal cannot be resolved without prior appeal; only owner may submit appeal; SoD & atomic overturn sync feed', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);

  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_apl_1', {
    id: 'post_apl_1',
    recordKind: 'discussion',
    ownerUserId: 'author_apl',
    neighborhoodId: 2,
    topicId: 'topic-general',
    titleFa: 'تحلیل بازار مسکن برای تست اعتراض',
    bodyFa: 'متن تحلیلی معتبر کاربر برای بررسی چرخه اعتراض و بازبینی.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    createdAtIso: new Date().toISOString(),
  });

  const rep = await svc.submitReport({
    reporterUid: 'u_rep_apl',
    targetType: 'discussion_post',
    targetId: 'post_apl_1',
    reason: 'misleading_data',
    detailsFa: 'گزارش برای بررسی چرخه کامل اعتراض.',
    idempotencyKey: 'idem-apl-1',
  });
  await svc.claimCase(rep.moderationCase.id, 'mod_decider', 60_000, 'CONTENT_MODERATOR');
  await svc.applyDecision({
    caseId: rep.moderationCase.id,
    adminUid: 'mod_decider',
    actorRole: 'CONTENT_MODERATOR',
    decision: 'hide',
    reasonFa: 'مخفی‌سازی اولیه تا بررسی مدارک.',
  });

  // Resolving appeal before any appeal is submitted -> 404 APPEAL_NOT_FOUND
  await assert.rejects(
    () =>
      svc.resolveAppealWithSoD({
        caseId: rep.moderationCase.id,
        reviewerUid: 'reviewer_independent',
        reviewerRole: 'TRUST_SAFETY_REVIEWER',
        decision: 'overturned',
        reviewerNoteFa: 'تلاش برای حل اعتراض ناموجود.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 404 && err.code === 'APPEAL_NOT_FOUND',
  );

  // Non-owner cannot submit appeal -> 403 APPELLANT_NOT_AUTHORIZED
  await assert.rejects(
    () =>
      svc.submitAppeal({
        caseId: rep.moderationCase.id,
        appellantUid: 'stranger_uid',
        reasonFa: 'کاربر غیرمالک نباید بتواند اعتراض ثبت کند.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403 && err.code === 'APPELLANT_NOT_AUTHORIZED',
  );

  // Content owner submits formal appeal via HTTP endpoint
  let currentAuthUser = 'author_apl';
  let currentAdminAuth = {
    authorized: true,
    uid: 'mod_decider',
    role: 'TRUST_SAFETY_REVIEWER',
    statusCode: 200,
  };
  const app = express();
  app.use(express.json());
  registerTrustSafetyV1Routes(app, {
    lifecycle: svc,
    verifyUser: async () => ({ authorized: true, uid: currentAuthUser, statusCode: 200 }),
    verifyAdmin: async () => currentAdminAuth,
  });

  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const subRes = await fetch(`${baseUrl}/api/v1/trust-safety/cases/${rep.moderationCase.id}/appeals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reasonFa: 'اطلاعات ارائه‌شده کاملاً مستند به معاملات رسمی محله است.',
        evidenceRefs: ['media_doc_1'],
      }),
    });
    assert.equal(subRes.status, 201);
    const subJson = (await subRes.json()) as { appeal: { appealId: string; status: string } };
    assert.equal(subJson.appeal.status, 'SUBMITTED');

    // Original decider trying to resolve appeal -> 409 SEPARATION_OF_DUTIES_VIOLATION
    const sodFailRes = await fetch(`${baseUrl}/api/v1/trust-safety/appeals/${subJson.appeal.appealId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'upheld', reviewerNoteFa: 'تلاش ناظر قبلی برای داوری مجدد.' }),
    });
    assert.equal(sodFailRes.status, 409);

    // CONTENT_MODERATOR lacks appeal review permission -> 403 FORBIDDEN_MODERATION_ROLE
    currentAdminAuth = { authorized: true, uid: 'other_mod', role: 'CONTENT_MODERATOR', statusCode: 200 };
    const roleFailRes = await fetch(`${baseUrl}/api/v1/trust-safety/appeals/${subJson.appeal.appealId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'overturned', reviewerNoteFa: 'تلاش نقش غیرمجاز برای بررسی اعتراض.' }),
    });
    assert.equal(roleFailRes.status, 403);

    // Independent TRUST_SAFETY_REVIEWER overturns appeal -> atomic post restore + feed projection + CLOSED
    currentAdminAuth = { authorized: true, uid: 'reviewer_ind_2', role: 'TRUST_SAFETY_REVIEWER', statusCode: 200 };
    const okRes = await fetch(`${baseUrl}/api/v1/trust-safety/appeals/${subJson.appeal.appealId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'overturned', reviewerNoteFa: 'پس از بررسی مدارک، تصمیم اولیه لغو و محتوا بازگردانی شد.' }),
    });
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as { appeal: { status: string; reviewerRole: string }; case: { status: string } };
    assert.equal(okJson.appeal.status, 'OVERTURNED');
    assert.equal(okJson.appeal.reviewerRole, 'TRUST_SAFETY_REVIEWER');
    assert.equal(okJson.case.status, 'CLOSED');

    const postRestored = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, 'post_apl_1');
    assert.equal(postRestored?.status, 'published');
    const feedIdx = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, 'post_apl_1');
    assert.equal(feedIdx?.visibility, 'discoverable');

    // Outbox & immutable event both recorded atomically
    const events = await svc.listCaseEvents(rep.moderationCase.id);
    assert.ok(events.items.some((e) => e.eventType === 'APPEAL_SUBMITTED'));
    assert.ok(events.items.some((e) => e.eventType === 'APPEAL_RESOLVED' && e.actorRole === 'TRUST_SAFETY_REVIEWER'));
    const outbox = await store.queryDocs(SOCIAL_COLLECTIONS.outbox);
    assert.ok(outbox.items.length >= 2);
  } finally {
    currentAuthUser = '';
    await new Promise<void>((r) => srv.close(() => r()));
  }
});
