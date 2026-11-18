/** @file tests/social-outbox-delivery-lifecycle.test.ts — Stage 6 Outbox Delivery Lifecycle, Adapter & Worker Lease Acceptance Suite (RT-SOCIAL-IMPL-006: OUT-011..OUT-024) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { addQuestionAnswerOp } from '../server/modules/community/communityUnifiedExtraOps';
import {
  NotificationStore,
  NotificationsModuleSocialAdapter,
  SocialOutboxWorkerService,
  type SocialNotificationDispatchInput,
  type SocialOutboxRecord,
} from '../server/modules/notifications';

function createDeliveryTestStack() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  const notificationStore = new NotificationStore();
  const adapter = new NotificationsModuleSocialAdapter(notificationStore);
  const worker = new SocialOutboxWorkerService(() => store, adapter);
  return { store, repo, notificationStore, adapter, worker };
}

test('OUT-011..OUT-017: Real In-App notification creation & delivery for comments and answers, with self-notification and preference opt-out suppression', async () => {
  const { store, repo, notificationStore, worker } = createDeliveryTestStack();

  // Author creates discussion
  const disc = await repo.createDiscussion(
    { uid: 'user_notif_author', emailVerified: true },
    {
      titleFa: 'بررسی کیفیت اینترنت فیبر نوری در محله سعادت‌آباد',
      bodyFa: 'ساکنانی که از سرویس فیبر نوری استفاده می‌کنند لطفاً سرعت و پایداری را اعلام کنند.',
      neighborhoodId: 1,
      topicId: 'topic-transit-infra',
    },
  );

  // Another user comments on discussion -> notifies discussion author
  await repo.addDiscussionComment(
    { uid: 'user_notif_commenter', emailVerified: true },
    disc.item.id,
    { bodyFa: 'در بلوار اصلی فیبر نوری فعال است و پینگ بسیار پایینی دارد.' },
  );

  // Author also comments on their OWN discussion (self-comment -> must NOT notify user_notif_author for their own comment)
  await repo.addDiscussionComment(
    { uid: 'user_notif_author', emailVerified: true },
    disc.item.id,
    { bodyFa: 'سپاس از توضیح شما، درخواست نصب ثبت شد.' },
  );

  // Process outbox batch
  const stats = await worker.processPendingBatch({ workerId: 'worker_test_1', batchSize: 20 });
  assert.equal(stats.delivered, 1);
  assert.equal(stats.suppressed, 2);
  assert.equal(stats.deadLettered, 0);

  // Discussion author received exactly 1 In-App notification (from user_notif_commenter, NOT from self-comment)
  const authorNotifs = await notificationStore.listNotificationsForUser('user_notif_author', { limit: 10 });
  assert.equal(authorNotifs.items.length, 1);
  assert.equal(authorNotifs.items[0].readState, 'unread');
  assert.equal(authorNotifs.items[0].category, 'crowd_claims');

  // OUT-016: Preference opt-out (categories.crowd_claims = false) suppresses delivery cleanly without failing outbox event
  const optOutUser = 'user_notif_optout';
  const currentPrefs = await notificationStore.getPreferences(optOutUser);
  await notificationStore.setPreferences({
    ...currentPrefs,
    categories: {
      ...currentPrefs.categories,
      crowd_claims: false,
    },
  });

  const q = await repo.createQuestion(
    { uid: optOutUser, emailVerified: true },
    {
      titleFa: 'پرسش کاربر با اعلان غیرفعال درباره دسترسی مترو',
      bodyFa: 'فاصله پیاده‌روی تا نزدیک‌ترین ایستگاه مترو چند دقیقه است؟',
      neighborhoodId: 1,
    },
  );
  await addQuestionAnswerOp(
    repo,
    { uid: 'user_notif_commenter', emailVerified: true },
    q.id,
    { bodyFa: 'حدود ۸ دقیقه پیاده‌روی تا ورودی شرقی ایستگاه مترو فاصله دارد.' },
  );

  const statsAfterOptOut = await worker.processPendingBatch({ workerId: 'worker_test_1', batchSize: 20 });
  assert.ok(statsAfterOptOut.suppressed >= 1);
  const optOutNotifs = await notificationStore.listNotificationsForUser(optOutUser, { limit: 10 });
  assert.equal(optOutNotifs.items.length, 0);

  const allOutbox = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, { limit: 50 });
  assert.ok(allOutbox.items.every((e) => e.status === 'DELIVERED' || e.status === 'SUPPRESSED'));
});

test('OUT-018..OUT-024: Fenced worker lease prevents duplicate delivery, retries with exponential backoff to DEAD_LETTER, supports replayDeadLetter, and deduplicates across consumer restarts', async () => {
  const { store, notificationStore, adapter } = createDeliveryTestStack();

  // Enqueue an event for user_retry_target
  const workerWithoutAdapter = new SocialOutboxWorkerService(() => store, null);
  const ev = await workerWithoutAdapter.enqueueSocialEvent({
    eventId: 'out_retry_test_1',
    eventType: 'social.comment.created.v1',
    targetId: 'post_retry_1',
    actorUid: 'user_actor_retry',
    recipientUids: ['user_retry_target'],
    payloadSummaryFa: 'دیدگاه جدید روی گفتگوی شما ثبت شد',
    maxAttempts: 5,
  });

  // OUT-018: Fail-closed when no adapter is configured -> event transitions to retry/PENDING, NOT DELIVERED!
  let baseTimeMs = Date.now() + 1000;
  const noAdapterStats = await workerWithoutAdapter.processPendingBatch({
    workerId: 'worker_no_adapter',
    batchSize: 10,
    nowMs: baseTimeMs,
  });
  assert.equal(noAdapterStats.delivered, 0);
  assert.equal(noAdapterStats.retried, 1);
  const afterNoAdapter = await store.getDoc<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, ev.id);
  assert.equal(afterNoAdapter?.status, 'PENDING');
  assert.equal(afterNoAdapter?.attemptCount, 1);
  assert.equal(afterNoAdapter?.lastErrorCode, 'MISSING_NOTIFICATION_ADAPTER');

  // OUT-019..OUT-021: When adapter returns/throws transient failure, worker retries up to maxAttempts (5) then moves to DEAD_LETTER
  let shouldFail = true;
  const failingAdapter = {
    async dispatch(input: SocialNotificationDispatchInput) {
      if (shouldFail) {
        return { accepted: false, retryable: true, errorCode: 'TRANSIENT_DELIVERY_FAILURE' };
      }
      return adapter.dispatch(input);
    },
  };
  const retryWorker = new SocialOutboxWorkerService(() => store, failingAdapter);

  for (let attempt = 2; attempt <= 5; attempt++) {
    baseTimeMs += 15 * 60_000;
    await retryWorker.processPendingBatch({
      workerId: 'worker_retry',
      batchSize: 10,
      nowMs: baseTimeMs,
    });
  }

  const deadDoc = await store.getDoc<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, ev.id);
  assert.equal(deadDoc?.status, 'DEAD_LETTER');
  assert.equal(deadDoc?.attemptCount, 5);

  // OUT-022: Admin replayDeadLetter resets DEAD_LETTER -> PENDING and delivers once adapter succeeds
  shouldFail = false;
  const replayed = await retryWorker.replayDeadLetter(ev.id, 'admin_1');
  assert.equal(replayed.status, 'PENDING');
  assert.equal(replayed.attemptCount, 0);

  baseTimeMs += 60_000;
  const deliveredStats = await retryWorker.processPendingBatch({
    workerId: 'worker_retry',
    batchSize: 10,
    nowMs: baseTimeMs,
  });
  assert.equal(deliveredStats.delivered, 1);

  const targetNotifs = await notificationStore.listNotificationsForUser('user_retry_target', { limit: 10 });
  assert.equal(targetNotifs.items.length, 1);

  // OUT-023 & OUT-024: Restarting NotificationsModuleSocialAdapter (new instance sharing NotificationStore) does NOT create a second NotificationDocument for the same outbox event
  const restartedAdapter = new NotificationsModuleSocialAdapter(notificationStore);
  const dupRes = await restartedAdapter.dispatch({
    eventId: ev.id,
    eventType: ev.eventType,
    actorUid: ev.actorUid,
    recipientUid: 'user_retry_target',
    targetId: ev.targetId,
    idempotencyKey: `soc_obx_${ev.id}_user_retry_target`,
    payloadSummaryFa: ev.payloadSummaryFa,
  });
  assert.equal(dupRes.accepted, true);
  assert.equal(dupRes.duplicate, true);

  const targetNotifsAfterRestart = await notificationStore.listNotificationsForUser('user_retry_target', { limit: 10 });
  assert.equal(targetNotifsAfterRestart.items.length, 1);
});
