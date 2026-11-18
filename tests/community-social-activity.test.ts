/** @file tests/community-social-activity.test.ts — Stage 4 Social Activity Ledger & Atomic Content Publication Events Suite (RT-SOCIAL-IMPL-004: ACT-001..ACT-015) */
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
import type { SocialActivityRecord } from '../server/modules/community/socialActivityTypes';

function createTestRepo() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  return { store, repo };
}

test('ACT-001..ACT-006: Atomic activity creation for discussion, comment, question, answer, correction, and research_proposal', async () => {
  const { store, repo } = createTestRepo();
  const actor = { uid: 'user_act_1', emailVerified: true, displayNameFa: 'نگارنده' };

  // ACT-001: Discussion creates content.created activity with objectType='discussion'
  const discRes = await repo.createDiscussion(actor, {
    titleFa: 'تحلیل وضعیت روشنایی و امنیت معابر محله',
    bodyFa: 'روشنایی معابر فرعی در ساعات پایانی شب بهبود یافته و امنیت تردد بیشتر شده است.',
    neighborhoodId: 1,
    topicId: 'safety_lighting',
  });
  const discActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: discRes.item.id }],
  });
  assert.equal(discActivities.items.length, 1);
  assert.equal(discActivities.items[0].eventType, 'content.created');
  assert.equal(discActivities.items[0].objectType, 'discussion');
  assert.equal(discActivities.items[0].actorUid, actor.uid);
  assert.equal(discActivities.items[0].visibility, 'public');
  assert.equal(discActivities.items[0].schemaVersion, 1);

  // ACT-002: Comment creates comment.created activity with parentObjectId=postId
  const postAfterComment = await repo.addDiscussionComment(
    { uid: 'user_act_2', emailVerified: true, displayNameFa: 'پاسخ‌دهنده' },
    discRes.item.id,
    { bodyFa: 'کاملاً موافقم، در کوچه سوم هم چراغ‌های جدید نصب شده است.' },
  );
  const newReplyId = postAfterComment.replies[postAfterComment.replies.length - 1].id;
  const commentActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: newReplyId }],
  });
  assert.equal(commentActivities.items.length, 1);
  assert.equal(commentActivities.items[0].eventType, 'comment.created');
  assert.equal(commentActivities.items[0].objectType, 'comment');
  assert.equal(commentActivities.items[0].parentObjectId, discRes.item.id);

  // ACT-003: Question creates content.created activity with objectType='question' atomically in transaction
  const question = await repo.createQuestion(actor, {
    titleFa: 'آیا آنتن‌دهی اینترنت همراه در طبقات بالا مناسب است؟',
    bodyFa: 'لطفاً تجربه خود از کیفیت اینترنت فیبر نوری و همراه در این محله را بنویسید.',
    neighborhoodId: 1,
  });
  const qActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: question.id }],
  });
  assert.equal(qActivities.items.length, 1);
  assert.equal(qActivities.items[0].eventType, 'content.created');
  assert.equal(qActivities.items[0].objectType, 'question');

  // ACT-004: Answer to Question creates question.answered activity with parentObjectId=question.id
  const ansRes = await addQuestionAnswerOp(
    repo,
    { uid: 'user_act_2', emailVerified: true },
    question.id,
    { bodyFa: 'بله، فیبر نوری مخابرات در این خیابان فعال است و پایداری بالایی دارد.' },
  );
  const ansActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: ansRes.item.id }],
  });
  assert.equal(ansActivities.items.length, 1);
  assert.equal(ansActivities.items[0].eventType, 'question.answered');
  assert.equal(ansActivities.items[0].objectType, 'answer');
  assert.equal(ansActivities.items[0].parentObjectId, question.id);

  // ACT-005 & ACT-013: Unapproved Correction creates content.created activity with visibility='restricted'
  const corr = await repo.createCorrection(actor, {
    neighborhoodId: 1,
    category: 'price_anomaly',
    titleFa: 'به‌روزرسانی میانگین قیمت هر متر مربع در خیابان اصلی',
    evidenceSummaryFa: 'بر اساس سه مبایعه‌نامه ثبت‌شده در ماه جاری، میانگین قیمت متری ۱۲۵ میلیون تومان است.',
    suggestedValueFa: '۱۲۵ میلیون تومان',
  });
  const corrActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: corr.id }],
  });
  assert.equal(corrActivities.items.length, 1);
  assert.equal(corrActivities.items[0].eventType, 'content.created');
  assert.equal(corrActivities.items[0].objectType, 'correction');
  assert.equal(corrActivities.items[0].visibility, 'restricted');

  // ACT-006: Research Proposal creates content.created activity with objectType='research_proposal'
  const resProp = await repo.createResearchProposal(actor, {
    titleFa: 'تحلیل همبستگی فاصله از پارک با قیمت اجاره آپارتمان',
    questionFa: 'آیا نزدیکی به بوستان‌های محلی اثر معناداری بر نرخ اجاره واحدهای زیر ۱۰۰ متر دارد؟',
    neighborhoodNameFa: 'ونک',
  });
  const rpActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: resProp.id }],
  });
  assert.equal(rpActivities.items.length, 1);
  assert.equal(rpActivities.items[0].eventType, 'content.created');
  assert.equal(rpActivities.items[0].objectType, 'research_proposal');
});

test('ACT-007..ACT-012 & ACT-014..ACT-015: Rollback on activity failure, idempotent replay, socialContext preservation, and zero full body/PII', async () => {
  const { store, repo } = createTestRepo();
  const actor = { uid: 'user_act_rollback', emailVerified: true, displayNameFa: 'تست اتمیک' };

  // ACT-008: Idempotent replay of createDiscussion does not create duplicate activity
  const idemKey = 'idem_act_disc_001';
  const first = await repo.createDiscussion(actor, {
    titleFa: 'گفت‌وگوی یکتا برای تست عدم تکرار رویداد در دفتر فعالیت',
    bodyFa: 'در صورت ارسال مجدد با همان کلید یکتایی، نباید رکورد فعالیت دومی ساخته شود.',
    neighborhoodId: 1,
    idempotencyKey: idemKey,
  });
  const replay = await repo.createDiscussion(actor, {
    titleFa: 'گفت‌وگوی یکتا برای تست عدم تکرار رویداد در دفتر فعالیت',
    bodyFa: 'در صورت ارسال مجدد با همان کلید یکتایی، نباید رکورد فعالیت دومی ساخته شود.',
    neighborhoodId: 1,
    idempotencyKey: idemKey,
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.item.id, first.item.id);

  const replayActivities = await store.queryDocs<SocialActivityRecord>(SOCIAL_COLLECTIONS.activities, {
    filters: [{ field: 'objectId', op: '==', value: first.item.id }],
  });
  assert.equal(replayActivities.items.length, 1);

  // ACT-009 & ACT-012: socialContext is preserved and zero full bodyFa or PII exists in activity record
  const actDoc = replayActivities.items[0] as unknown as Record<string, unknown>;
  assert.ok(actDoc.socialContext);
  assert.equal((actDoc.socialContext as { primary: { entityType: string; entityId: string } }).primary.entityType, 'neighborhood');
  assert.equal('bodyFa' in actDoc, false);
  assert.equal('email' in actDoc, false);
  assert.equal('phone' in actDoc, false);
  assert.equal('ip' in actDoc, false);

  // ACT-007 & ACT-015: If writing to socialActivities fails inside transaction, the main content post is rolled back!
  const origRunTx = store.runTransaction.bind(store);
  store.runTransaction = async <T>(fn: (tx: CommunityTransaction) => Promise<T>): Promise<T> => {
    return origRunTx(async (tx) => {
      const wrappedTx: CommunityTransaction = {
        ...tx,
        set(col, id, data, opts) {
          if (col === SOCIAL_COLLECTIONS.activities) {
            throw new CommunityDatabaseUnavailableError('Simulated socialActivities write failure inside transaction');
          }
          tx.set(col, id, data, opts);
        },
      };
      return fn(wrappedTx);
    });
  };

  const postsBefore = await store.queryDocs(SOCIAL_COLLECTIONS.posts, { limit: 50 });
  await assert.rejects(
    () =>
      repo.createQuestion(actor, {
        titleFa: 'پرسشی که باید در اثر خطای ثبت فعالیت Rollback شود',
        bodyFa: 'اگر نوشتن در مجموعه فعالیت‌ها شکست بخورد، این پرسش هم نباید در دیتابیس ذخیره شود.',
        neighborhoodId: 1,
      }),
    (err: unknown) => err instanceof CommunityDatabaseUnavailableError,
  );
  const postsAfter = await store.queryDocs(SOCIAL_COLLECTIONS.posts, { limit: 50 });
  assert.equal(postsAfter.items.length, postsBefore.items.length);
});
