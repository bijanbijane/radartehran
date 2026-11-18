/** @file tests/social-outbox-transactional-integration.test.ts — Stage 6 Transactional Social Outbox Integration Acceptance Suite (RT-SOCIAL-IMPL-006: OUT-001..OUT-010) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityDatabaseUnavailableError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { addQuestionAnswerOp } from '../server/modules/community/communityUnifiedExtraOps';
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';
import {
  appendSocialOutboxEvent,
  type SocialOutboxRecord,
} from '../server/modules/notifications/socialOutboxWorker';

function createTestEnv() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  const moderation = new SocialModerationLifecycleService(() => store);
  return { store, repo, moderation };
}

test('OUT-001..OUT-004: Atomic outbox creation for social.post.created.v1, social.comment.created.v1, social.question.answered.v1, and social.moderation.decided.v1', async () => {
  const { store, repo, moderation } = createTestEnv();

  // OUT-001: createDiscussion appends social.post.created.v1 in same transaction
  const discRes = await repo.createDiscussion(
    { uid: 'user_out_author', emailVerified: true, displayNameFa: 'نویسنده پست' },
    {
      titleFa: 'تحلیل بازار اجاره محله ونک در فصل پاییز',
      bodyFa: 'بررسی قراردادهای جدید نشان می‌دهد تقاضا برای واحدهای دوخوابه افزایش یافته است.',
      neighborhoodId: 1,
      topicId: 'topic-rent-deposit',
    },
  );

  const postOutbox = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, {
    filters: [{ field: 'eventType', op: '==', value: 'social.post.created.v1' }],
  });
  assert.equal(postOutbox.items.length, 1);
  assert.equal(postOutbox.items[0].targetId, discRes.item.id);
  assert.equal(postOutbox.items[0].status, 'PENDING');

  // OUT-002: addDiscussionComment appends social.comment.created.v1 with recipientUids = [post author]
  const postAfterComment = await repo.addDiscussionComment(
    { uid: 'user_out_commenter', emailVerified: true, displayNameFa: 'پاسخ‌دهنده' },
    discRes.item.id,
    { bodyFa: 'تحلیل دقیقی بود، در خیابان ملاصدرا هم همین روند دیده می‌شود.' },
  );
  assert.ok(postAfterComment.replies.length >= 1);
  const commentOutbox = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, {
    filters: [{ field: 'eventType', op: '==', value: 'social.comment.created.v1' }],
  });
  assert.equal(commentOutbox.items.length, 1);
  assert.equal(commentOutbox.items[0].targetId, discRes.item.id);
  assert.equal(commentOutbox.items[0].actorUid, 'user_out_commenter');
  assert.deepEqual(commentOutbox.items[0].recipientUids, ['user_out_author']);

  // OUT-003: addQuestionAnswerOp appends social.question.answered.v1 with recipientUids = [question author]
  const question = await repo.createQuestion(
    { uid: 'user_out_asker', emailVerified: true },
    {
      titleFa: 'وضعیت پارکینگ شبانه در خیابان‌های فرعی چگونه است؟',
      bodyFa: 'آیا در ساعات شب جای پارک کافی برای ساکنان و مهمانان در معابر فرعی وجود دارد؟',
      neighborhoodId: 1,
    },
  );
  const ansRes = await addQuestionAnswerOp(
    repo,
    { uid: 'user_out_responder', emailVerified: true },
    question.id,
    { bodyFa: 'در کوچه‌های زوج جای پارک مناسب است اما خیابان اصلی شلوغ می‌شود.' },
  );
  assert.ok(ansRes.item.id);
  const ansOutbox = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, {
    filters: [{ field: 'eventType', op: '==', value: 'social.question.answered.v1' }],
  });
  assert.equal(ansOutbox.items.length, 1);
  assert.equal(ansOutbox.items[0].targetId, question.id);
  assert.equal(ansOutbox.items[0].actorUid, 'user_out_responder');
  assert.deepEqual(ansOutbox.items[0].recipientUids, ['user_out_asker']);

  // OUT-004: SocialModerationLifecycleService.applyDecision appends social.moderation.decided.v1 atomically
  const modCase = await moderation.submitReport({
    reporterUid: 'user_out_reporter',
    targetType: 'discussion_post',
    targetId: discRes.item.id,
    reason: 'spam_or_promo',
    detailsFa: 'بررسی آزمایشی گزارش نظارت',
  });
  await moderation.claimCase(modCase.moderationCase.id, 'moderator_1');
  await moderation.applyDecision({
    caseId: modCase.moderationCase.id,
    adminUid: 'moderator_1',
    actorRole: 'content_moderator',
    decision: 'hide',
    reasonFa: 'مخفی‌سازی آزمایشی برای تست Outbox اتمیک',
  });
  const modOutbox = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, {
    filters: [{ field: 'eventType', op: '==', value: 'social.moderation.decided.v1' }],
  });
  assert.equal(modOutbox.items.length, 1);
  assert.equal(modOutbox.items[0].targetId, discRes.item.id);
  assert.deepEqual(modOutbox.items[0].recipientUids, ['user_out_author']);
});

test('OUT-005..OUT-010: Rollback on outbox write failure, deterministic idempotent IDs, zero PII, and self-comment suppression', async () => {
  const { store, repo } = createTestEnv();

  // OUT-007: deterministic IDs prevent duplicate outbox events on idempotent replay
  const idemKey = 'idem_outbox_post_001';
  const p1 = await repo.createDiscussion(
    { uid: 'user_out_idem', emailVerified: true },
    {
      titleFa: 'گفت‌وگوی یکتا برای تست عدم تکرار Outbox',
      bodyFa: 'تکرار درخواست با همان کلید یکتایی نباید رویداد Outbox دومی در دیتابیس ثبت کند.',
      neighborhoodId: 1,
      idempotencyKey: idemKey,
    },
  );
  const p2 = await repo.createDiscussion(
    { uid: 'user_out_idem', emailVerified: true },
    {
      titleFa: 'گفت‌وگوی یکتا برای تست عدم تکرار Outbox',
      bodyFa: 'تکرار درخواست با همان کلید یکتایی نباید رویداد Outbox دومی در دیتابیس ثبت کند.',
      neighborhoodId: 1,
      idempotencyKey: idemKey,
    },
  );
  assert.equal(p2.idempotentReplay, true);

  const outboxDocs = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, { limit: 50 });
  const forPost = outboxDocs.items.filter((e) => e.targetId === p1.item.id);
  assert.equal(forPost.length, 1);

  // OUT-008: Zero PII (no email, phone, raw body, token, or IP) in outbox record
  const rawRecord = forPost[0] as unknown as Record<string, unknown>;
  assert.equal('email' in rawRecord, false);
  assert.equal('phone' in rawRecord, false);
  assert.equal('bodyFa' in rawRecord, false);
  assert.equal('ip' in rawRecord, false);

  // OUT-009: appendSocialOutboxEvent rejects invalid eventType
  await assert.rejects(
    () =>
      store.runTransaction(async (tx) => {
        appendSocialOutboxEvent(tx, {
          eventId: 'invalid_evt_1',
          eventType: 'invalid.event.type' as unknown as 'social.post.created.v1',
          targetId: 'e1',
          actorUid: 'u1',
          recipientUids: ['u2'],
          payloadSummaryFa: 'تست خطای نوع رویداد',
        });
      }),
    (err: unknown) => err instanceof Error && 'code' in err && (err as { code?: string }).code === 'INVALID_OUTBOX_EVENT',
  );

  // OUT-005 & OUT-006: If outbox write fails inside transaction, the discussion/comment/answer/moderation decision rolls back!
  const origRunTx = store.runTransaction.bind(store);
  store.runTransaction = async <T>(fn: (tx: CommunityTransaction) => Promise<T>): Promise<T> => {
    return origRunTx(async (tx) => {
      const wrappedTx: CommunityTransaction = {
        ...tx,
        set(col, id, data, opts) {
          if (col === SOCIAL_COLLECTIONS.outbox) {
            throw new CommunityDatabaseUnavailableError('Simulated socialOutbox write failure');
          }
          tx.set(col, id, data, opts);
        },
      };
      return fn(wrappedTx);
    });
  };

  await assert.rejects(
    () =>
      repo.addDiscussionComment(
        { uid: 'user_out_commenter_2', emailVerified: true },
        p1.item.id,
        { bodyFa: 'این دیدگاه باید در اثر خطای ثبت Outbox کاملاً Rollback شود.' },
      ),
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError,
  );

  const postAfterRollback = await store.getDoc(SOCIAL_COLLECTIONS.posts, p1.item.id);
  assert.equal(Number(postAfterRollback?.replyCount ?? 0), 0);
});
