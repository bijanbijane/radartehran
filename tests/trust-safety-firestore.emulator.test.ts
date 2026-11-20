/**
 * @file tests/trust-safety-firestore.emulator.test.ts
 * @description RT-TS-CRITICAL-026..029 — Native Firestore Emulator Acceptance Suite for Trust & Safety.
 * Executes all Trust & Safety transaction ordering, idempotency, multi-report decision, and appeal SoD
 * flows against a real Firestore Emulator when FIRESTORE_EMULATOR_HOST is active.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FirestoreAdminCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import { SocialModerationLifecycleService } from '../server/modules/trust-safety/socialModerationLifecycle';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST?.trim();

test(
  'RT-TS-EMU-001: Native Firestore Emulator executes submitReport, multi-report applyDecision, and Appeal SoD without Read-after-Write aborts',
  { skip: !EMULATOR_HOST ? 'FIRESTORE_EMULATOR_HOST not set in environment (requires local Firestore Emulator + Java JRE)' : false },
  async () => {
    const store = new FirestoreAdminCommunityStore({
      ...process.env,
      FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
    });
    const svc = new SocialModerationLifecycleService(() => store);
    const postId = `emu_post_${Date.now()}`;

    await store.setDoc(SOCIAL_COLLECTIONS.posts, postId, {
      id: postId,
      recordKind: 'discussion',
      ownerUserId: 'emu_author_1',
      neighborhoodId: 1,
      topicId: 'topic-general',
      titleFa: 'تست امولاتور واقعی فایراستور برای نظارت',
      bodyFa: 'این سند روی Firestore Emulator واقعی برای تایید ترتیب تراکنش ثبت می‌شود.',
      status: 'published',
      moderationStatus: 'approved',
      isDeleted: false,
      createdAtIso: new Date().toISOString(),
    });

    const rep1 = await svc.submitReport({
      reporterUid: 'emu_rep_1',
      targetType: 'discussion_post',
      targetId: postId,
      reason: 'spam',
      detailsFa: 'گزارش اول روی امولاتور واقعی فایراستور.',
      idempotencyKey: `emu-idem-1-${Date.now()}`,
    });
    const rep2 = await svc.submitReport({
      reporterUid: 'emu_rep_2',
      targetType: 'discussion_post',
      targetId: postId,
      reason: 'misleading_data',
      detailsFa: 'گزارش دوم روی همان پرونده در امولاتور واقعی.',
      idempotencyKey: `emu-idem-2-${Date.now()}`,
    });
    assert.equal(rep1.moderationCase.id, rep2.moderationCase.id);
    assert.equal(rep2.moderationCase.reportCount, 2);
    assert.equal('reportIds' in rep2.moderationCase, false);

    await svc.claimCase(rep1.moderationCase.id, 'emu_mod_1', 60_000, 'CONTENT_MODERATOR');
    const decided = await svc.applyDecision({
      caseId: rep1.moderationCase.id,
      adminUid: 'emu_mod_1',
      actorRole: 'CONTENT_MODERATOR',
      decision: 'hide',
      reasonFa: 'مخفی‌سازی با دو گزارش در امولاتور واقعی.',
    });
    assert.equal(decided.status, 'DECIDED');
    assert.equal(decided.activeReportCount, 0);

    const appeal = await svc.submitAppeal({
      caseId: decided.id,
      appellantUid: 'emu_author_1',
      reasonFa: 'درخواست بازبینی مستقل روی امولاتور واقعی.',
    });
    const resolved = await svc.resolveAppealById({
      appealId: appeal.appeal.appealId,
      reviewerUid: 'emu_reviewer_2',
      reviewerRole: 'TRUST_SAFETY_REVIEWER',
      decision: 'overturned',
      reviewerNoteFa: 'بازبینی مستقل انجام و محتوا بازگردانی شد.',
    });
    assert.equal(resolved.moderationCase.status, 'CLOSED');
    const restored = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, postId);
    assert.equal(restored?.status, 'published');
  },
);
