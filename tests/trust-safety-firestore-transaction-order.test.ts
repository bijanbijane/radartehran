/**
 * @file tests/trust-safety-firestore-transaction-order.test.ts
 * @description RT-TS-CRITICAL-026 — Verifies strict Firestore READ_PHASE -> WRITE_PHASE transaction ordering,
 * MockFirestoreCommunityStore TRANSACTION_READ_AFTER_WRITE enforcement, multi-report decisions
 * (hide, dismiss, lock), failure rollback, and zero partial reports/cases/events.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';

async function seedPost(store: MockFirestoreCommunityStore, postId: string, ownerUid = 'owner_1') {
  await store.setDoc(SOCIAL_COLLECTIONS.posts, postId, {
    id: postId,
    recordKind: 'discussion',
    ownerUserId: ownerUid,
    neighborhoodId: 1,
    topicId: 'topic-general',
    titleFa: 'گزارش وضعیت محله برای تست تراکنش',
    bodyFa: 'متن کامل محتوای انجمن جهت بررسی ترتیب تراکنش‌های فایراستور.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    createdAtIso: new Date().toISOString(),
  });
}

test('RT-TS-026.1: MockFirestoreCommunityStore throws TRANSACTION_READ_AFTER_WRITE on read after write & rolls back', async () => {
  const store = new MockFirestoreCommunityStore();
  await seedPost(store, 'post_raw_check');

  await assert.rejects(
    () =>
      store.runTransaction(async (tx) => {
        tx.set(SOCIAL_COLLECTIONS.reports, 'rep_bad', { id: 'rep_bad', targetId: 'post_raw_check' });
        await tx.get(SOCIAL_COLLECTIONS.posts, 'post_raw_check');
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.code === 'TRANSACTION_READ_AFTER_WRITE',
  );

  const leaked = await store.getDoc(SOCIAL_COLLECTIONS.reports, 'rep_bad');
  assert.equal(leaked, null, 'Rolled back transaction must not persist partial report');
});

test('RT-TS-026.2: submitReport new case & existing case strictly obey READ_PHASE -> WRITE_PHASE', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);
  await seedPost(store, 'post_tx_1', 'author_1');

  const r1 = await svc.submitReport({
    reporterUid: 'rep_user_1',
    targetType: 'discussion_post',
    targetId: 'post_tx_1',
    reason: 'spam',
    detailsFa: 'گزارش اول روی پست موجود برای بررسی ترتیب خواندن و نوشتن.',
    idempotencyKey: 'idem-tx-001',
  });
  assert.equal(r1.moderationCase.reportCount, 1);
  assert.equal(r1.moderationCase.activeReportCount, 1);

  const r2 = await svc.submitReport({
    reporterUid: 'rep_user_2',
    targetType: 'discussion_post',
    targetId: 'post_tx_1',
    reason: 'misleading_data',
    detailsFa: 'گزارش دوم روی پرونده موجود برای اطمینان از اتمیک بودن شمارنده‌ها.',
    idempotencyKey: 'idem-tx-002',
  });
  assert.equal(r2.moderationCase.id, r1.moderationCase.id);
  assert.equal(r2.moderationCase.reportCount, 2);
  assert.equal(r2.moderationCase.activeReportCount, 2);
});

test('RT-TS-026.3: applyDecision (hide with 1 report, hide/dismiss/lock with multiple reports) obey strict tx order', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);

  // Case A: Hide with 1 report
  await seedPost(store, 'post_hide_1', 'author_a');
  const repA = await svc.submitReport({
    reporterUid: 'u_a1',
    targetType: 'discussion_post',
    targetId: 'post_hide_1',
    reason: 'spam',
    detailsFa: 'محتوای تبلیغاتی غیرمجاز در محله.',
    idempotencyKey: 'idem-hide-1',
  });
  await svc.claimCase(repA.moderationCase.id, 'mod_1', 60_000, 'CONTENT_MODERATOR');
  const decA = await svc.applyDecision({
    caseId: repA.moderationCase.id,
    adminUid: 'mod_1',
    actorRole: 'CONTENT_MODERATOR',
    decision: 'hide',
    reasonFa: 'مخفی‌سازی با یک گزارش تاییدشده.',
  });
  assert.equal(decA.status, 'DECIDED');
  assert.equal(decA.activeReportCount, 0);
  const postA = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, 'post_hide_1');
  assert.equal(postA?.status, 'hidden');

  // Case B: Hide with 3 reports
  await seedPost(store, 'post_hide_multi', 'author_b');
  let caseIdB = '';
  for (let i = 1; i <= 3; i++) {
    const r = await svc.submitReport({
      reporterUid: `u_b${i}`,
      targetType: 'discussion_post',
      targetId: 'post_hide_multi',
      reason: 'harassment',
      detailsFa: `گزارش چندگانه شماره ${i} برای تست تصمیم hide.`,
      idempotencyKey: `idem-b-${i}`,
    });
    caseIdB = r.moderationCase.id;
  }
  await svc.claimCase(caseIdB, 'mod_2', 60_000, 'DELEGATED_ADMIN');
  const decB = await svc.applyDecision({
    caseId: caseIdB,
    adminUid: 'mod_2',
    actorRole: 'DELEGATED_ADMIN',
    decision: 'hide',
    reasonFa: 'مخفی‌سازی پس از بررسی سه گزارش هم‌زمان.',
  });
  assert.equal(decB.status, 'DECIDED');
  const reportsB = await svc.listCaseReports(caseIdB);
  assert.equal(reportsB.items.length, 3);
  assert.ok(reportsB.items.every((r) => r.status === 'resolved'));

  // Case C: Dismiss with 2 reports
  await seedPost(store, 'post_dismiss_multi', 'author_c');
  let caseIdC = '';
  for (let i = 1; i <= 2; i++) {
    const r = await svc.submitReport({
      reporterUid: `u_c${i}`,
      targetType: 'discussion_post',
      targetId: 'post_dismiss_multi',
      reason: 'other',
      detailsFa: `گزارش شماره ${i} که نهایتاً رد خواهد شد.`,
      idempotencyKey: `idem-c-${i}`,
    });
    caseIdC = r.moderationCase.id;
  }
  await svc.claimCase(caseIdC, 'mod_3', 60_000, 'TRUST_SAFETY_REVIEWER');
  await svc.applyDecision({
    caseId: caseIdC,
    adminUid: 'mod_3',
    actorRole: 'TRUST_SAFETY_REVIEWER',
    decision: 'dismiss',
    reasonFa: 'گزارش‌ها فاقد تخلف تشخیص داده شدند.',
  });
  const reportsC = await svc.listCaseReports(caseIdC);
  assert.ok(reportsC.items.every((r) => r.status === 'dismissed'));

  // Case D: Lock with 2 reports
  await seedPost(store, 'post_lock_multi', 'author_d');
  let caseIdD = '';
  for (let i = 1; i <= 2; i++) {
    const r = await svc.submitReport({
      reporterUid: `u_d${i}`,
      targetType: 'discussion_post',
      targetId: 'post_lock_multi',
      reason: 'off_topic',
      detailsFa: `گزارش شماره ${i} برای قفل کردن بحث.`,
      idempotencyKey: `idem-d-${i}`,
    });
    caseIdD = r.moderationCase.id;
  }
  await svc.claimCase(caseIdD, 'mod_4', 60_000, 'PRIMARY_ADMIN');
  await svc.applyDecision({
    caseId: caseIdD,
    adminUid: 'mod_4',
    actorRole: 'PRIMARY_ADMIN',
    decision: 'lock',
    reasonFa: 'قفل شدن بحث به علت انحراف موضوعی.',
  });
  const postD = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, 'post_lock_multi');
  assert.equal(postD?.status, 'locked');
});

test('RT-TS-026.4: Failed read or failed write rolls back atomically with zero partial reports, cases, or events', async () => {
  const store = new MockFirestoreCommunityStore();
  const svc = new SocialModerationLifecycleService(() => store);

  // 1. Read failure: target does not exist -> zero report, zero case, zero event
  await assert.rejects(
    () =>
      svc.submitReport({
        reporterUid: 'u_fail_read',
        targetType: 'discussion_post',
        targetId: 'non_existent_post',
        reason: 'spam',
        detailsFa: 'گزارش روی پست ناموجود باید کاملاً رول‌بک شود.',
        idempotencyKey: 'idem-fail-read',
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.code === 'MODERATION_TARGET_NOT_FOUND',
  );
  assert.equal((await store.queryDocs(SOCIAL_COLLECTIONS.reports)).items.length, 0);
  assert.equal((await store.queryDocs(SOCIAL_COLLECTIONS.moderationCases)).items.length, 0);
  assert.equal((await store.queryDocs(SOCIAL_COLLECTIONS.moderationEvents)).items.length, 0);

  // 2. Write failure inside atomic transaction -> full rollback, no partial writes
  await seedPost(store, 'post_rollback_write', 'author_rb');
  await assert.rejects(
    () =>
      store.runTransaction(async (tx) => {
        const p = await tx.get(SOCIAL_COLLECTIONS.posts, 'post_rollback_write');
        assert.ok(p);
        tx.set(SOCIAL_COLLECTIONS.moderationEvents, 'ev_should_rollback', {
          id: 'ev_should_rollback',
          caseId: 'c_rb',
          targetId: 'post_rollback_write',
          eventType: 'CASE_DECIDED',
        });
        // Attempting to update non-existent doc fails during atomic commit
        tx.update(SOCIAL_COLLECTIONS.posts, 'does_not_exist_doc', { status: 'hidden' });
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.code === 'DOCUMENT_NOT_FOUND',
  );
  assert.equal(await store.getDoc(SOCIAL_COLLECTIONS.moderationEvents, 'ev_should_rollback'), null);
});
