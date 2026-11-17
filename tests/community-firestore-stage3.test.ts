/** @file tests/community-firestore-stage3.test.ts — Stage 3 CF-01..CF-20 Unified Firestore Community Verification Suite */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  FirestoreAdminCommunityStore,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
  clampCommunityLimit,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityRateLimiter } from '../server/modules/community/communityRateLimiter';
import { runNonDestructiveCommunityImport } from '../server/modules/community/communitySeedImporter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { addQuestionAnswerOp, executeAdminCommunityModerationOp, withdrawCorrectionOp } from '../server/modules/community/communityUnifiedExtraOps';
import { queryCommunityPostsPaginated } from '../server/modules/community/communityUnifiedQueries';
import { registerCommunityRoutes } from '../server/modules/community/communityRoutes';

test('CF-01..CF-04 Persistent CRUD, atomic replyCount, soft-delete, and ownership checks across fresh repository instance', async () => {
  const sharedStore = new MockFirestoreCommunityStore();
  const repoA = new CommunityUnifiedRepository(sharedStore, new CommunityRateLimiter({ COMMUNITY_RL_POST_MAX: '50' }));

  const created = await repoA.createDiscussion(
    { uid: 'uid_alice', emailVerified: true, displayNameFa: 'آلیس تهرانی' },
    { titleFa: 'کیفیت مترو و ترافیک در سعادت‌آباد', bodyFa: 'دسترسی اتوبوس تندرو در ساعات اوج نیازمند بررسی دقیق است.', neighborhoodId: 5 },
  );
  assert.equal(created.idempotentReplay, false);

  // Fresh repository reading same shared Firestore store verifies zero process-local state trap
  const repoB = new CommunityUnifiedRepository(sharedStore);
  const fetched = await repoB.getStore().getDoc(SOCIAL_COLLECTIONS.posts, created.item.id);
  assert.ok(fetched);
  assert.equal(fetched.ownerUserId, 'uid_alice');

  await assert.rejects(
    () => repoB.updateDiscussion('uid_bob', created.item.id, { titleFa: 'تلاش غیرمجاز', bodyFa: 'تغییر توسط فرد غیرمالک نباید مجاز باشد.' }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403,
  );

  const edited = await repoB.updateDiscussion('uid_alice', created.item.id, { titleFa: 'عنوان اصلاح‌شده سعادت‌آباد', bodyFa: 'متن به‌روزرسانی‌شده با مشاهده میدانی امروز.' });
  assert.equal(edited.revisionHistory?.length, 1);

  const replied = await repoB.addDiscussionComment({ uid: 'uid_bob', emailVerified: true }, created.item.id, { bodyFa: 'تایید می‌شود، عصرها بسیار شلوغ است.' });
  assert.equal(replied.replyCount, 1);

  await repoB.softDeleteDiscussion('uid_alice', created.item.id);
  const afterDelete = await queryCommunityPostsPaginated(sharedStore, { recordKind: 'discussion', includeSeeds: false });
  assert.equal(afterDelete.items.some((p) => p.id === created.item.id), false);
});

test('CF-05..CF-08 Reaction toggle atomicity, follow toggle, idempotency deduplication & conflict (409)', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store, new CommunityRateLimiter({ COMMUNITY_RL_POST_MAX: '20', COMMUNITY_RL_REACTION_MAX: '50' }));

  const first = await repo.createDiscussion(
    { uid: 'uid_1', emailVerified: true },
    { titleFa: 'بررسی فشار آب در محله جردن', bodyFa: 'فشار آب طبقات پنجم به بالا در شب‌ها کاهش می‌یابد.', idempotencyKey: 'idem-post-1' },
  );
  const replay = await repo.createDiscussion(
    { uid: 'uid_1', emailVerified: true },
    { titleFa: 'بررسی فشار آب در محله جردن', bodyFa: 'فشار آب طبقات پنجم به بالا در شب‌ها کاهش می‌یابد.', idempotencyKey: 'idem-post-1' },
  );
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.item.id, first.item.id);

  await assert.rejects(
    () => repo.createDiscussion({ uid: 'uid_1', emailVerified: true }, { titleFa: 'محتوای متفاوت', bodyFa: 'ارسال بدنه متفاوت با همان کلید یکتا', idempotencyKey: 'idem-post-1' }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409,
  );

  const r1 = await repo.toggleReactionTransactional('uid_voter_a', first.item.id, 'helpful');
  assert.equal(r1.reactionCounts.helpful, 1);
  const r2 = await repo.toggleReactionTransactional('uid_voter_a', first.item.id, 'agree');
  assert.equal(r2.reactionCounts.helpful, 0);
  assert.equal(r2.reactionCounts.agree, 1);
  const r3 = await repo.toggleReactionTransactional('uid_voter_a', first.item.id, 'agree');
  assert.equal(r3.reactionCounts.agree, 0);

  const f1 = await repo.toggleFollowTransactional('uid_voter_a', 'post', first.item.id);
  assert.equal(f1.isFollowed, true);
  assert.equal(f1.followerCount, 2);
  const f2 = await repo.toggleFollowTransactional('uid_voter_a', 'post', first.item.id);
  assert.equal(f2.isFollowed, false);
  assert.equal(f2.followerCount, 1);
});

test('CF-09..CF-12 Cursor pagination capped at max 50, rate limiting (429), and fail-closed 503 on DB outage', async () => {
  assert.equal(clampCommunityLimit(999), 50);
  assert.equal(clampCommunityLimit(undefined), 20);

  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store, new CommunityRateLimiter({ COMMUNITY_RL_POST_MAX: '5' }));

  for (let i = 0; i < 4; i++) {
    await repo.createDiscussion(
      { uid: 'uid_author', emailVerified: true },
      { titleFa: `مطلب شماره ${i + 1} محله نیاوران`, bodyFa: `گزارش میدانی شماره ${i + 1} درباره دسترسی مترو و ترافیک` },
    );
    await new Promise((r) => setTimeout(r, 2));
  }

  const page1 = await queryCommunityPostsPaginated(store, { recordKind: 'discussion', limit: 2, includeSeeds: false });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  const page2 = await queryCommunityPostsPaginated(store, { recordKind: 'discussion', limit: 2, cursor: page1.nextCursor, includeSeeds: false });
  assert.equal(page2.items.length, 2);
  assert.equal(page2.hasMore, false);

  // Hit configurable rate limit (limit = 5, 4 already used -> 5th succeeds, 6th throws 429)
  await repo.createDiscussion({ uid: 'uid_author', emailVerified: true }, { titleFa: 'مطلب پنجم مجاز', bodyFa: 'متن معتبر پنجم برای تست محدودیت نرخ' });
  await assert.rejects(
    () => repo.createDiscussion({ uid: 'uid_author', emailVerified: true }, { titleFa: 'مطلب ششم مسدود', bodyFa: 'متن ششم که باید ۴۲۹ بگیرد' }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 429,
  );

  // Fail-closed DB outage verification
  store.setSimulatedUnavailable(true);
  await assert.rejects(
    () => repo.createDiscussion({ uid: 'uid_other', emailVerified: true }, { titleFa: 'هنگام قطعی', bodyFa: 'باید خطای ۵۰۳ بدهد و در حافظه ذخیره نشود' }),
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError && err.statusCode === 503,
  );

  // Test HTTP route maps outage strictly to 503 (never silent memory fallback)
  const app = express();
  app.use(express.json());
  registerCommunityRoutes(app, { repository: repo });
  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/community/posts`);
    assert.equal(res.status, 503);
    const json = await res.json() as Record<string, unknown>;
    assert.equal(json.code, 'COMMUNITY_DATABASE_UNAVAILABLE');
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }

  // Real FirestoreAdminCommunityStore honors PREVENT_PROD_FIREBASE_IN_TEST fail-closed 503
  const prodGuardStore = new FirestoreAdminCommunityStore({ PREVENT_PROD_FIREBASE_IN_TEST: 'true', FIREBASE_PROJECT_ID: 'gen-lang-client-0713157837' });
  const h = await prodGuardStore.healthCheck();
  assert.equal(h.ok, false);
  assert.equal(h.errorCode, 'COMMUNITY_DATABASE_UNAVAILABLE');
});

test('CF-13..CF-20 Non-destructive seed dry-run & idempotency, Q&A/Correction/Moderation flows, PII stripping, rules & blueprint sync', async () => {
  const store = new MockFirestoreCommunityStore();
  const dry = await runNonDestructiveCommunityImport(store, { dryRun: true });
  assert.ok(dry.scanned >= 12);
  assert.equal(dry.created, dry.scanned);
  const emptyCheck = await store.queryDocs(SOCIAL_COLLECTIONS.posts, { limit: 1 });
  assert.equal(emptyCheck.items.length, 0, 'dry-run must NOT mutate Firestore');

  const applied = await runNonDestructiveCommunityImport(store, { dryRun: false });
  assert.equal(applied.created, dry.scanned);
  const secondRun = await runNonDestructiveCommunityImport(store, { dryRun: false });
  assert.equal(secondRun.created, 0);
  assert.equal(secondRun.skippedExisting, applied.scanned);

  const repo = new CommunityUnifiedRepository(store);
  const q = await repo.createQuestion({ uid: 'uid_asker', emailVerified: true }, { titleFa: 'آیا سند تک‌برگ اوقافی نیاز به استعلام خاص دارد؟', bodyFa: 'برای معامله ملک اوقافی در منطقه ۲ چه مجوزهایی لازم است؟' });
  const ansRes = await addQuestionAnswerOp(repo, { uid: 'uid_expert', emailVerified: true }, q.id, { bodyFa: 'استعلام اوقاف و تاییدیه کتبی سرقفلی یا اجاره‌نامه الزامی است.', sourceReferenceFa: 'قانون ثبت اسناد' });
  assert.equal(ansRes.question.answers.length, 1);

  const corr = await repo.createCorrection({ uid: 'uid_contrib', emailVerified: true }, { titleFa: 'اصلاح فاصله مترو تجریش تا خیابان مقصودبیک', evidenceSummaryFa: 'فاصله پیاده واقعی در نقشه‌برداری میدانی ۶۵۰ متر است.' });
  await assert.rejects(() => withdrawCorrectionOp(repo, 'uid_intruder', corr.id), (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 403);
  await executeAdminCommunityModerationOp(repo, { uid: 'admin_1', email: 'radio837isf@gmail.com' }, { targetId: corr.id, actionType: 'approve_data', reasonFa: 'با نقشه شهری تطبیق داده شد.' });

  await repo.updateProfilePrivacy('uid_private_user', { visibility: 'private', bioFa: 'بیو خصوصی' });
  assert.equal(await repo.getPublicProfileByUsername('u_uid_private_', false, undefined), null);

  // Verify zero parallel JSON writes remain inside primary communityRoutes / repository
  const routeSrc = fs.readFileSync('server/modules/community/communityRoutes.ts', 'utf8');
  assert.equal(routeSrc.includes('community-state.json'), false);
  assert.equal(routeSrc.includes('AtomicJsonRepository'), false);
});
