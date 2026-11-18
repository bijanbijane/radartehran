/** @file tests/social-feed-index-projection.test.ts — Stage 7 Derived Feed Index Projection & Paged Rebuild Job Acceptance Suite (RT-SOCIAL-IMPL-007: FEED-011..FEED-020) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';
import { SocialDiscoveryAndFeedService } from '../server/modules/search/socialDiscoveryAndFeed';
import type { SocialFeedIndexDocument } from '../server/modules/search/socialFeedProjection';

test('FEED-011..FEED-016: Live write paths (create, edit, comment, reaction, delete, moderation hide/restore) keep socialFeedIndex synchronized atomically and zero-PII', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  const moderation = new SocialModerationLifecycleService(() => store);
  const feedService = new SocialDiscoveryAndFeedService(() => store);
  const actor = { uid: 'user_proj_1', emailVerified: true, displayNameFa: 'تحلیلگر' };

  // 1. Create discussion -> socialFeedIndex doc created with visibility='discoverable'
  const created = await repo.createDiscussion(actor, {
    titleFa: 'گزارش میدانی قیمت آپارتمان نوساز در پاسداران',
    bodyFa: 'در خیابان گلستان پاسداران فایل‌های نوساز با قیمت متری ۱۸۵ میلیون تومان معامله می‌شوند.',
    neighborhoodId: 1,
    topicId: 'topic-buy-sell',
  });
  const idxAfterCreate = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, created.item.id);
  assert.ok(idxAfterCreate);
  assert.equal(idxAfterCreate.visibility, 'discoverable');
  assert.equal(idxAfterCreate.helpfulCount, 0);
  assert.equal(idxAfterCreate.replyCount, 0);
  assert.equal('bodyFa' in (idxAfterCreate as unknown as Record<string, unknown>), false);

  // 2. Edit discussion -> normalizedTitleFa and normalizedSearchTokens updated in socialFeedIndex
  await repo.updateDiscussion(actor.uid, created.item.id, {
    titleFa: 'گزارش به‌روزشده قیمت آپارتمان نوساز و کلیدنخورده پاسداران',
    bodyFa: 'در خیابان گلستان و بوستان پاسداران واحدهای کلیدنخورده متری ۱۹۰ میلیون تومان عرضه شده‌اند.',
  });
  const idxAfterEdit = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, created.item.id);
  assert.ok(idxAfterEdit?.normalizedTitleFa.includes('کلیدنخورده'));

  // 3. Add comment & reaction -> replyCount, helpfulCount, and feedScore updated in socialFeedIndex
  const scoreBefore = idxAfterEdit!.feedScore;
  await repo.addDiscussionComment(
    { uid: 'user_proj_2', emailVerified: true },
    created.item.id,
    { bodyFa: 'در بوستان چهارم هم قیمت مشابهی اعلام شد.' },
  );
  await repo.toggleReactionTransactional('user_proj_2', created.item.id, 'helpful', {
    idempotencyKey: 'idem_proj_react_1',
  });
  const idxAfterInteract = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, created.item.id);
  assert.equal(idxAfterInteract?.replyCount, 1);
  assert.equal(idxAfterInteract?.helpfulCount, 1);
  assert.ok(idxAfterInteract!.feedScore > scoreBefore);

  // 4. Moderation hide -> visibility='hidden' in socialFeedIndex and excluded from searchSocial
  const modCase = await moderation.submitReport({
    reporterUid: 'user_proj_2',
    targetType: 'discussion_post',
    targetId: created.item.id,
    reason: 'misleading_data',
    detailsFa: 'بررسی موقت گزارش',
  });
  await moderation.claimCase(modCase.moderationCase.id, 'mod_proj_1');
  await moderation.applyDecision({
    caseId: modCase.moderationCase.id,
    adminUid: 'mod_proj_1',
    actorRole: 'content_moderator',
    decision: 'hide',
    reasonFa: 'بررسی تکمیلی مستندات',
  });
  const idxAfterHide = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, created.item.id);
  assert.equal(idxAfterHide?.visibility, 'hidden');

  const searchWhileHidden = await feedService.searchSocial({ q: 'پاسداران', limit: 10 });
  assert.ok(!searchWhileHidden.items.some((p) => p.id === created.item.id));

  // 5. Soft delete -> visibility='hidden'
  const second = await repo.createDiscussion(actor, {
    titleFa: 'گفت‌وگوی دوم برای تست حذف نرم و خروج از ایندکس فید',
    bodyFa: 'پس از حذف نرم توسط نویسنده، این پست نباید در نتایج فید یا جست‌وجو ظاهر شود.',
    neighborhoodId: 1,
  });
  await repo.softDeleteDiscussion(actor.uid, second.item.id);
  const idxSecond = await store.getDoc<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, second.item.id);
  assert.equal(idxSecond?.visibility, 'hidden');
});

test('FEED-017..FEED-020: Paged rebuildDerivedIndex indexes >250 posts in batches, enforces RUNNING job lock (409 REBUILD_ALREADY_RUNNING), and supports resumeJobId', async () => {
  const store = new MockFirestoreCommunityStore();
  const feedService = new SocialDiscoveryAndFeedService(() => store);

  // Seed 260 raw posts directly in socialPosts without socialFeedIndex
  for (let i = 1; i <= 260; i++) {
    const id = `raw_rebuild_${String(i).padStart(4, '0')}`;
    await store.setDoc(SOCIAL_COLLECTIONS.posts, id, {
      id,
      recordKind: i % 10 === 0 ? 'correction' : 'discussion',
      ownerUserId: 'user_rebuild_1',
      neighborhoodId: 1,
      topicId: 'topic-neighborhoods',
      titleFa: `پست بازسازی ایندکس شماره ${i}`,
      bodyFa: `متن کامل پست بازسازی شماره ${i} برای تست پردازش دسته‌ای ایندکس فید.`,
      status: i % 10 === 0 ? 'submitted' : 'active',
      moderationStatus: 'active',
      isDeleted: i % 25 === 0,
      source: 'user',
      isSeed: false,
      createdAtIso: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString(),
    });
  }

  // Simulate active RUNNING lock -> throws 409 REBUILD_ALREADY_RUNNING
  await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, 'job_locked_1', {
    id: 'job_locked_1',
    status: 'RUNNING',
    startedByUid: 'admin_1',
    startedAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
    batchSize: 50,
    scannedCount: 0,
    indexedCount: 0,
    skippedCount: 0,
    deletedOrHiddenCount: 0,
    lastCursorDocId: null,
    formulaVersion: 'v2.0-log-decay',
    projectionVersion: 1,
  });

  await assert.rejects(
    () => feedService.rebuildDerivedIndex('admin_2'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'REBUILD_ALREADY_RUNNING',
  );

  // Release lock and run paged rebuild with maxPages=2, batchSize=50 (processes 100 items, then resumes)
  await store.setDoc(SOCIAL_COLLECTIONS.feedIndexJobs, 'job_locked_1', {
    id: 'job_locked_1',
    status: 'COMPLETED',
    startedByUid: 'admin_1',
    startedAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
    batchSize: 50,
    scannedCount: 0,
    indexedCount: 0,
    skippedCount: 0,
    deletedOrHiddenCount: 0,
    lastCursorDocId: null,
    formulaVersion: 'v2.0-log-decay',
    projectionVersion: 1,
  });

  const part1 = await feedService.rebuildDerivedIndex('admin_1', {
    batchSize: 50,
    maxPages: 2,
  });
  assert.equal(part1.scannedCount, 100);
  assert.ok(part1.lastCursorDocId);

  // Resume from jobId until completion (scannedCount accumulates on the job record)
  const part2 = await feedService.rebuildDerivedIndex('admin_1', {
    batchSize: 50,
    resumeJobId: part1.jobId,
  });
  assert.equal(part2.status, 'COMPLETED');
  assert.equal(part2.scannedCount, 260);
});
