/**
 * @file tests/trust-safety-moderation-target-resolution.test.ts
 * @description RT-TS-CRITICAL-028 — Verifies runtime TargetType validation, exact collection mapping
 * (discussion_post, question, comment, user), unsupported action rejection, explicit Case Status
 * State Machine + Revision CAS, and server-derived authoritative actorRole (never hardcoded).
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

test('RT-TS-028.1: Rejects invalid targetType at runtime and routes comment/user targets to exact canonical collections', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);

  await assert.rejects(
    () =>
      svc.submitReport({
        reporterUid: 'u1',
        targetType: 'invalid_entity_type' as 'discussion_post',
        targetId: 'id_1',
        reason: 'spam',
        detailsFa: 'گزارش با نوع نامعتبر باید با 400 رد شود.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_MODERATION_TARGET_TYPE',
  );

  // Seed a comment in socialComments and a user profile in socialProfiles
  await store.setDoc(SOCIAL_COLLECTIONS.comments, 'cmt_target_1', {
    id: 'cmt_target_1',
    postId: 'post_parent_1',
    ownerUserId: 'comment_owner_1',
    bodyFa: 'دیدگاه نامناسب برای بررسی نظارت.',
    status: 'published',
    visibility: 'discoverable',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.profiles, 'user_target_1', {
    id: 'user_target_1',
    userId: 'user_target_1',
    displayNameFa: 'کاربر آزمایشی',
    visibility: 'public',
  });

  // Hide on comment updates socialComments (NOT socialPosts!)
  const repCmt = await svc.submitReport({
    reporterUid: 'u_rep_cmt',
    targetType: 'comment',
    targetId: 'cmt_target_1',
    reason: 'harassment',
    detailsFa: 'این دیدگاه دارای توهین است.',
    idempotencyKey: 'idem-cmt-1',
  });
  await svc.claimCase(repCmt.moderationCase.id, 'mod_cmt', 60_000, 'CONTENT_MODERATOR');

  // Comment does NOT support 'lock' -> rejected with 409 UNSUPPORTED_ACTION_FOR_TARGET_TYPE
  await assert.rejects(
    () =>
      svc.applyDecision({
        caseId: repCmt.moderationCase.id,
        adminUid: 'mod_cmt',
        actorRole: 'CONTENT_MODERATOR',
        decision: 'lock',
        reasonFa: 'تلاش نامعتبر برای قفل دیدگاه.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'UNSUPPORTED_ACTION_FOR_TARGET_TYPE',
  );

  await svc.applyDecision({
    caseId: repCmt.moderationCase.id,
    adminUid: 'mod_cmt',
    actorRole: 'CONTENT_MODERATOR',
    decision: 'hide',
    reasonFa: 'مخفی‌سازی دیدگاه متخلف در کالکشن دیدگاه‌ها.',
  });
  const cmtAfter = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.comments, 'cmt_target_1');
  assert.equal(cmtAfter?.status, 'hidden');
  assert.equal(await store.getDoc(SOCIAL_COLLECTIONS.posts, 'cmt_target_1'), null);

  // User target rejects 'hide' (409) and allows 'warn_author' updating socialProfiles
  const repUsr = await svc.submitReport({
    reporterUid: 'u_rep_usr',
    targetType: 'user',
    targetId: 'user_target_1',
    reason: 'spam',
    detailsFa: 'ارسال مکرر هرزنامه توسط این حساب کاربری.',
    idempotencyKey: 'idem-usr-1',
  });
  await svc.claimCase(repUsr.moderationCase.id, 'mod_usr', 60_000, 'DELEGATED_ADMIN');
  await assert.rejects(
    () =>
      svc.applyDecision({
        caseId: repUsr.moderationCase.id,
        adminUid: 'mod_usr',
        actorRole: 'DELEGATED_ADMIN',
        decision: 'hide',
        reasonFa: 'تلاش نامعتبر برای hide کردن پروفایل کاربر.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.code === 'UNSUPPORTED_ACTION_FOR_TARGET_TYPE',
  );
  await svc.applyDecision({
    caseId: repUsr.moderationCase.id,
    adminUid: 'mod_usr',
    actorRole: 'DELEGATED_ADMIN',
    decision: 'warn_author',
    reasonFa: 'ثبت اخطار رسمی روی حساب کاربری.',
  });
  const usrAfter = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, 'user_target_1');
  assert.equal(usrAfter?.moderationWarningCount, 1);
});

test('RT-TS-028.2: Case Status State Machine blocks invalid transitions, closed-case decisions, and stale Revision CAS', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_sm_1', {
    id: 'post_sm_1',
    recordKind: 'discussion',
    ownerUserId: 'author_sm',
    status: 'published',
  });

  const rep = await svc.submitReport({
    reporterUid: 'u_sm',
    targetType: 'discussion_post',
    targetId: 'post_sm_1',
    reason: 'spam',
    detailsFa: 'گزارش برای بررسی ماشین وضعیت پرونده.',
    idempotencyKey: 'idem-sm-1',
  });

  // Cannot apply decision directly from OPEN without claiming -> 409 INVALID_CASE_STATUS_TRANSITION
  await assert.rejects(
    () =>
      svc.applyDecision({
        caseId: rep.moderationCase.id,
        adminUid: 'mod_1',
        actorRole: 'CONTENT_MODERATOR',
        decision: 'hide',
        reasonFa: 'تصمیم مستقیم روی پرونده OPEN غیرمجاز است.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'INVALID_CASE_STATUS_TRANSITION',
  );

  const claimed = await svc.claimCase(rep.moderationCase.id, 'mod_1', 60_000, 'CONTENT_MODERATOR');
  assert.equal(claimed.revision, 2);

  // Stale expectedRevision -> 409 CASE_REVISION_CONFLICT
  await assert.rejects(
    () =>
      svc.applyDecision({
        caseId: rep.moderationCase.id,
        adminUid: 'mod_1',
        actorRole: 'CONTENT_MODERATOR',
        decision: 'hide',
        reasonFa: 'تست تعارض نسخه CAS.',
        expectedRevision: 1,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'CASE_REVISION_CONFLICT',
  );

  // Valid CAS succeeds -> DECIDED (revision 3)
  const decided = await svc.applyDecision({
    caseId: rep.moderationCase.id,
    adminUid: 'mod_1',
    actorRole: 'CONTENT_MODERATOR',
    decision: 'hide',
    reasonFa: 'تصمیم معتبر با نسخه CAS صحیح.',
    expectedRevision: 2,
  });
  assert.equal(decided.status, 'DECIDED');
  assert.equal(decided.revision, 3);

  // Second decision on DECIDED case -> 409 INVALID_CASE_STATUS_TRANSITION
  await assert.rejects(
    () =>
      svc.applyDecision({
        caseId: rep.moderationCase.id,
        adminUid: 'mod_1',
        actorRole: 'CONTENT_MODERATOR',
        decision: 'dismiss',
        reasonFa: 'تصمیم مجدد روی پرونده DECIDED مجاز نیست.',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'INVALID_CASE_STATUS_TRANSITION',
  );
});

test('RT-TS-028.3: HTTP route derives authoritative actorRole from server auth (never hardcoded delegated_admin)', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_role_1', {
    id: 'post_role_1',
    recordKind: 'discussion',
    ownerUserId: 'author_role',
    status: 'published',
  });

  const rep = await svc.submitReport({
    reporterUid: 'u_role_rep',
    targetType: 'discussion_post',
    targetId: 'post_role_1',
    reason: 'spam',
    detailsFa: 'گزارش برای بررسی ثبت نقش واقعی در Audit Event.',
    idempotencyKey: 'idem-role-1',
  });
  await svc.claimCase(rep.moderationCase.id, 'primary_uid', 60_000, 'PRIMARY_ADMIN');

  const app = express();
  app.use(express.json());
  registerTrustSafetyV1Routes(app, {
    lifecycle: svc,
    verifyAdmin: async () => ({
      authorized: true,
      uid: 'primary_uid',
      email: 'bijan.afshari@gmail.com',
      reason: 'AUTHORIZED_BOOTSTRAP_ADMIN',
      statusCode: 200,
    }),
  });

  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/trust-safety/cases/${rep.moderationCase.id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'hide',
        reasonFa: 'تصمیم ثبت‌شده توسط مدیر اصلی.',
        actorRole: 'spoofed_role_from_client',
      }),
    });
    assert.equal(res.status, 200);
    const events = await svc.listCaseEvents(rep.moderationCase.id);
    const decidedEvent = events.items.find((e) => e.eventType === 'CASE_DECIDED');
    assert.equal(decidedEvent?.actorRole, 'PRIMARY_ADMIN');
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});
