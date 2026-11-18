/** @file tests/community-profile-timeline.test.ts — Stage 8 Merged Profile Contribution Timeline, HMAC Cursor & Scale Pagination Suite (RT-SOCIAL-IMPL-008: PROF-015..PROF-028) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import {
  queryProfileContributionsPaginated,
} from '../server/modules/community/communityProfileQueries';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';

async function seedProfile(
  store: MockFirestoreCommunityStore,
  userId: string,
  username: string,
  overrides: Record<string, unknown> = {},
) {
  await store.setDoc(SOCIAL_COLLECTIONS.profiles, userId, {
    userId,
    username,
    displayNameFa: `کاربر ${username}`,
    bioFa: 'تحلیلگر مسکن',
    visibility: 'public',
    showBadges: true,
    showContributions: true,
    showFollowedTopics: true,
    identityStatus: 'verified_email',
    isAuthenticated: true,
    isEmailVerified: true,
    isPhoneVerified: false,
    reputation: { data: 10, community: 10, research: 5, sources: 5, professional: 0 },
    badges: [],
    followedTopicIds: [],
    followersCount: 0,
    followingCount: 0,
    memberSinceFa: 'امروز',
    recentPublicSummaryFa: [],
    verifiedCredentialFa: null,
    ...overrides,
  });
}

test('PROF-015..PROF-022: Merged timeline excludes seed/hidden/deleted/unapproved items & comments on hidden parents, respects kind filter and showContributions=false', async () => {
  const store = new MockFirestoreCommunityStore();
  await seedProfile(store, 'uid_author_tl', 'sara_tehran');
  await seedProfile(store, 'uid_other_tl', 'reza_other');

  // Valid published discussion
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_pub_1', {
    id: 'post_pub_1',
    recordKind: 'discussion',
    ownerUserId: 'uid_author_tl',
    titleFa: 'گفتگوی عمومی منتشرشده',
    bodyFa: 'متن گفتگوی عمومی تاییدشده برای نمایش در خط زمانی پروفایل.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    isSeed: false,
    helpfulCount: 4,
    replyCount: 2,
    createdAtIso: '2026-03-10T10:00:00.000Z',
  });

  // Valid approved correction
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_corr_ok', {
    id: 'post_corr_ok',
    recordKind: 'correction',
    ownerUserId: 'uid_author_tl',
    titleFa: 'اصلاح داده تاییدشده مترو',
    evidenceSummaryFa: 'فاصله واقعی ۳۵۰ متر است.',
    status: 'applied',
    moderationStatus: 'approved',
    isDeleted: false,
    isSeed: false,
    helpfulCount: 1,
    createdAtIso: '2026-03-09T10:00:00.000Z',
  });

  // Excluded: unapproved/pending correction
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_corr_pending', {
    id: 'post_corr_pending',
    recordKind: 'correction',
    ownerUserId: 'uid_author_tl',
    titleFa: 'اصلاح داده در انتظار بررسی',
    evidenceSummaryFa: 'نباید پیش از تایید نمایش داده شود.',
    status: 'pending_review',
    moderationStatus: 'pending',
    isDeleted: false,
    isSeed: false,
    createdAtIso: '2026-03-11T10:00:00.000Z',
  });

  // Excluded: seed post
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_seed_excl', {
    id: 'post_seed_excl',
    recordKind: 'discussion',
    ownerUserId: 'uid_author_tl',
    titleFa: 'پست بذر نمونه',
    bodyFa: 'پست بذر نباید در مشارکت واقعی کاربر بیاید.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    isSeed: true,
    source: 'seed',
    createdAtIso: '2026-03-12T10:00:00.000Z',
  });

  // Excluded: hidden/deleted post
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'post_hidden_excl', {
    id: 'post_hidden_excl',
    recordKind: 'discussion',
    ownerUserId: 'uid_author_tl',
    titleFa: 'پست مخفی‌شده',
    bodyFa: 'محتوای مخفی نباید نمایش داده شود.',
    status: 'hidden',
    moderationStatus: 'hidden',
    isDeleted: true,
    isSeed: false,
    createdAtIso: '2026-03-13T10:00:00.000Z',
  });

  // Parent posts for comments
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'parent_visible_post', {
    id: 'parent_visible_post',
    recordKind: 'discussion',
    ownerUserId: 'uid_other_tl',
    titleFa: 'موضوع اصلی گفتگو برای کامنت',
    bodyFa: 'محتوای پست والد عمومی.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    createdAtIso: '2026-03-01T10:00:00.000Z',
  });
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'parent_hidden_post', {
    id: 'parent_hidden_post',
    recordKind: 'discussion',
    ownerUserId: 'uid_other_tl',
    titleFa: 'پست والد مخفی',
    bodyFa: 'محتوای مخفی.',
    status: 'hidden',
    moderationStatus: 'hidden',
    isDeleted: false,
    createdAtIso: '2026-03-01T10:00:00.000Z',
  });

  // Visible comment on visible parent
  await store.setDoc(SOCIAL_COLLECTIONS.comments, 'cmt_visible_1', {
    id: 'cmt_visible_1',
    postId: 'parent_visible_post',
    ownerUserId: 'uid_author_tl',
    bodyFa: 'این یک دیدگاه معتبر روی گفتگوی عمومی است.',
    status: 'visible',
    isDeleted: false,
    reactionCounts: { helpful: 3 },
    createdAtIso: '2026-03-10T12:00:00.000Z',
  });

  // Comment on HIDDEN parent -> MUST be excluded!
  await store.setDoc(SOCIAL_COLLECTIONS.comments, 'cmt_on_hidden_parent', {
    id: 'cmt_on_hidden_parent',
    postId: 'parent_hidden_post',
    ownerUserId: 'uid_author_tl',
    bodyFa: 'کامنت روی پست مخفی نباید در نمایه نمایش داده شود.',
    status: 'visible',
    isDeleted: false,
    createdAtIso: '2026-03-14T12:00:00.000Z',
  });

  const pageAll = await queryProfileContributionsPaginated(store, 'sara_tehran', {
    kind: 'all',
    limit: 20,
    isViewerMember: false,
  });
  assert.equal(pageAll.contributionsVisible, true);
  assert.deepEqual(
    pageAll.items.map((i) => i.id),
    ['cmt_visible_1', 'post_pub_1', 'post_corr_ok'],
  );

  // Kind filter: comment only
  const commentsOnly = await queryProfileContributionsPaginated(store, 'sara_tehran', {
    kind: 'comment',
    isViewerMember: false,
  });
  assert.deepEqual(commentsOnly.items.map((i) => i.id), ['cmt_visible_1']);

  // Invalid kind throws 400 INVALID_CONTRIBUTION_KIND
  await assert.rejects(
    () =>
      queryProfileContributionsPaginated(store, 'sara_tehran', {
        kind: 'invalid_kind',
        isViewerMember: false,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_CONTRIBUTION_KIND',
  );

  // showContributions=false hides timeline for non-owner, returns contributionsVisible=false
  await seedProfile(store, 'uid_hidden_contrib', 'hidden_contrib_user', { showContributions: false });
  const hiddenPage = await queryProfileContributionsPaginated(store, 'hidden_contrib_user', {
    isViewerMember: true,
    viewerUid: 'uid_other_tl',
  });
  assert.equal(hiddenPage.contributionsVisible, false);
  assert.equal(hiddenPage.items.length, 0);
  assert.equal(hiddenPage.hasMore, false);
});

test('PROF-023..PROF-028: Tampered HMAC cursor (400), cross-profile/filter cursor mismatch (409), and 1,000-contribution mixed pagination with zero duplicates/gaps', async () => {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  await seedProfile(store, 'uid_scale_prof', 'scale_contributor');
  await seedProfile(store, 'uid_other_prof', 'other_contributor');

  // Seed a visible parent post for comments
  await store.setDoc(SOCIAL_COLLECTIONS.posts, 'scale_parent_post', {
    id: 'scale_parent_post',
    recordKind: 'discussion',
    ownerUserId: 'uid_other_prof',
    titleFa: 'گفتگوی مرجع برای کامنت‌های حجیم',
    bodyFa: 'پست والد عمومی جهت تست صفحه‌بندی ۱۰۰۰ مشارکت.',
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    createdAtIso: '2025-01-01T00:00:00.000Z',
  });

  // Create 1,000 mixed contributions (600 posts + 400 comments) with interleaved timestamps
  const expectedIdsDesc: string[] = [];
  for (let i = 1000; i >= 1; i--) {
    const createdAtIso = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    if (i % 5 === 0 || i % 5 === 3) {
      // 400 comments
      const cid = `scale_cmt_${String(i).padStart(4, '0')}`;
      expectedIdsDesc.push(cid);
      await store.setDoc(SOCIAL_COLLECTIONS.comments, cid, {
        id: cid,
        postId: 'scale_parent_post',
        ownerUserId: 'uid_scale_prof',
        bodyFa: `دیدگاه مشارکت شماره ${i} درباره محله`,
        status: 'visible',
        isDeleted: false,
        createdAtIso,
      });
    } else {
      // 600 posts
      const pid = `scale_post_${String(i).padStart(4, '0')}`;
      expectedIdsDesc.push(pid);
      await store.setDoc(SOCIAL_COLLECTIONS.posts, pid, {
        id: pid,
        recordKind: i % 2 === 0 ? 'discussion' : 'question',
        ownerUserId: 'uid_scale_prof',
        titleFa: `مشارکت شماره ${i}`,
        bodyFa: `متن مشارکت تحلیلی شماره ${i}`,
        status: 'published',
        moderationStatus: 'approved',
        isDeleted: false,
        isSeed: false,
        createdAtIso,
      });
    }
  }
  assert.equal(expectedIdsDesc.length, 1000);

  // Paginate through all 1,000 contributions (limit=30 -> 34 pages)
  const collected: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let firstCursor: string | null = null;

  do {
    const page = await repo.getProfileContributions('scale_contributor', {
      limit: 30,
      cursor,
      kind: 'all',
      isViewerMember: true,
    });
    if (!firstCursor && page.nextCursor) firstCursor = page.nextCursor;
    for (const item of page.items) {
      assert.equal(seen.has(item.id), false, `Duplicate contribution ID: ${item.id}`);
      seen.add(item.id);
      collected.push(item.id);
    }
    cursor = page.nextCursor;
    pages++;
    assert.ok(pages <= 40, 'Pagination exceeded expected page count');
  } while (cursor);

  assert.equal(collected.length, 1000);
  assert.deepEqual(collected, expectedIdsDesc);

  // PROF-024: Tampered HMAC cursor -> 400 INVALID_PROFILE_CURSOR
  assert.ok(firstCursor);
  const tamperedCursor = `${firstCursor.slice(0, -4)}AAAA`;
  await assert.rejects(
    () =>
      repo.getProfileContributions('scale_contributor', {
        limit: 30,
        cursor: tamperedCursor,
        kind: 'all',
        isViewerMember: true,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_PROFILE_CURSOR',
  );

  // PROF-025: Reusing cursor across DIFFERENT kind -> 409 PROFILE_CURSOR_MISMATCH
  await assert.rejects(
    () =>
      repo.getProfileContributions('scale_contributor', {
        limit: 30,
        cursor: firstCursor,
        kind: 'comment',
        isViewerMember: true,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'PROFILE_CURSOR_MISMATCH',
  );

  // PROF-026: Reusing cursor across DIFFERENT profile -> 409 PROFILE_CURSOR_MISMATCH
  await assert.rejects(
    () =>
      repo.getProfileContributions('other_contributor', {
        limit: 30,
        cursor: firstCursor,
        kind: 'all',
        isViewerMember: true,
      }),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'PROFILE_CURSOR_MISMATCH',
  );
});
