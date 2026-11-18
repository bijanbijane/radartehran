/** @file tests/community-profile-ui.test.tsx — Stage 8 Public Profile & Timeline UI Component + Client Rendering Suite (RT-SOCIAL-IMPL-008: PROF-029..PROF-036) */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommunityProfileTimeline } from '../src/features/community/components/CommunityProfileTimeline';
import { CommunityMembersAndGuidelinesTab } from '../src/features/community/components/CommunityMembersAndGuidelinesTab';
import { getCommunityProfileContributions } from '../src/features/community/services/communityProfileAndFollowClient';
import type { CommunityProfile, ProfileContributionItem } from '../src/features/community/types/community.types';

const SAMPLE_PROFILE: CommunityProfile = {
  userId: 'uid_ui_prof_1',
  username: 'maryam_niavaran',
  displayNameFa: 'مریم نیاوران',
  bioFa: 'تحلیلگر بافت شهری و دسترسی حمل‌ونقل منطقه ۱',
  visibility: 'public',
  showBadges: true,
  showContributions: true,
  showFollowedTopics: true,
  identityStatus: 'verified_phone',
  isAuthenticated: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  reputation: { data: 42, community: 68, research: 25, sources: 18, professional: 12 },
  badges: [
    {
      id: 'bdg_1',
      code: 'local_steward',
      titleFa: 'مشارکت‌کننده برتر نیاوران',
      scopeFa: 'منطقه ۱ تهران',
      authorityFa: 'شورای داده رادار',
      criteriaFa: 'حداقل ۱۰ مشارکت تاییدشده در محله',
      reviewedAtFa: '۱۴۰۴/۰۲',
      expiresAtIso: '2028-01-01T00:00:00.000Z',
      status: 'active',
    },
  ],
  followedTopicIds: ['transit_and_access'],
  followersCount: 24,
  followingCount: 7,
  memberSinceFa: 'پاییز ۱۴۰۳',
  recentPublicSummaryFa: [],
  verifiedCredentialFa: null,
};

const SAMPLE_ITEMS: ProfileContributionItem[] = [
  {
    id: 'item_disc_1',
    kind: 'discussion',
    ownerUid: 'uid_ui_prof_1',
    titleFa: 'تحلیل ترافیک میدان قدس در ساعات اوج',
    excerptFa: 'در بازه ۱۷ تا ۱۹ تردد اتوبوس‌ها کندتر می‌شود.',
    targetPostId: 'item_disc_1',
    neighborhoodNameFa: 'نیاوران',
    helpfulCount: 6,
    replyCount: 3,
    createdAtIso: '2026-03-10T10:00:00.000Z',
    visibility: 'public',
  },
  {
    id: 'item_cmt_2',
    kind: 'comment',
    ownerUid: 'uid_ui_prof_1',
    titleFa: 'پرسش کیفیت آب منطقه ۱',
    excerptFa: 'سختی آب در این خیابان نسبت به پارسال بهتر شده است.',
    targetPostId: 'post_q_9',
    helpfulCount: 2,
    createdAtIso: '2026-03-09T10:00:00.000Z',
    visibility: 'public',
  },
];

test('PROF-029..PROF-033: CommunityProfileTimeline renders loading, error, privacy-hidden, empty, items, kind tabs, and Load More states cleanly', () => {
  const noop = () => {};

  const loadingHtml = renderToStaticMarkup(
    React.createElement(CommunityProfileTimeline, {
      activeKind: 'all',
      onSelectKind: noop,
      items: [],
      contributionsVisible: true,
      loading: true,
      loadingMore: false,
      errorFa: null,
      hasMore: false,
      onLoadMore: noop,
    }),
  );
  assert.ok(loadingHtml.includes('data-testid="profile-timeline-loading"'));

  const errorHtml = renderToStaticMarkup(
    React.createElement(CommunityProfileTimeline, {
      activeKind: 'discussion',
      onSelectKind: noop,
      items: [],
      contributionsVisible: true,
      loading: false,
      loadingMore: false,
      errorFa: 'خطا در دریافت داده‌های پروفایل',
      hasMore: false,
      onLoadMore: noop,
    }),
  );
  assert.ok(errorHtml.includes('data-testid="profile-timeline-error"'));
  assert.ok(errorHtml.includes('خطا در دریافت داده‌های پروفایل'));

  const privacyHiddenHtml = renderToStaticMarkup(
    React.createElement(CommunityProfileTimeline, {
      activeKind: 'all',
      onSelectKind: noop,
      items: [],
      contributionsVisible: false,
      loading: false,
      loadingMore: false,
      errorFa: null,
      hasMore: false,
      onLoadMore: noop,
    }),
  );
  assert.ok(privacyHiddenHtml.includes('data-testid="profile-timeline-hidden-privacy"'));

  const emptyHtml = renderToStaticMarkup(
    React.createElement(CommunityProfileTimeline, {
      activeKind: 'question',
      onSelectKind: noop,
      items: [],
      contributionsVisible: true,
      loading: false,
      loadingMore: false,
      errorFa: null,
      hasMore: false,
      onLoadMore: noop,
    }),
  );
  assert.ok(emptyHtml.includes('data-testid="profile-timeline-empty"'));

  const populatedHtml = renderToStaticMarkup(
    React.createElement(CommunityProfileTimeline, {
      activeKind: 'all',
      onSelectKind: noop,
      items: SAMPLE_ITEMS,
      contributionsVisible: true,
      loading: false,
      loadingMore: false,
      errorFa: null,
      hasMore: true,
      onLoadMore: noop,
      onSelectContribution: noop,
    }),
  );
  assert.ok(populatedHtml.includes('data-testid="profile-timeline-list"'));
  assert.ok(populatedHtml.includes('تحلیل ترافیک میدان قدس در ساعات اوج'));
  assert.ok(populatedHtml.includes('پاسخ و دیدگاه'));
  assert.ok(populatedHtml.includes('data-testid="profile-timeline-load-more"'));
  assert.ok(populatedHtml.includes('data-testid="profile-timeline-open-item_disc_1"'));
});

test('PROF-034..PROF-036: CommunityMembersAndGuidelinesTab renders profile counters/badges/back-button and getCommunityProfileContributions handles AbortError cleanly', async () => {
  const html = renderToStaticMarkup(
    React.createElement(CommunityMembersAndGuidelinesTab, {
      mode: 'members',
      members: [SAMPLE_PROFILE],
      selectedUsername: 'maryam_niavaran',
      onSelectUsername: () => {},
      currentUser: null,
    }),
  );
  assert.ok(html.includes('data-testid="community-profile-display-name"'));
  assert.ok(html.includes('مریم نیاوران'));
  assert.ok(html.includes('data-testid="community-profile-followers-count"'));
  assert.ok(html.includes('data-testid="community-profile-following-count"'));
  assert.ok(html.includes('data-testid="community-profile-badges"'));
  assert.ok(html.includes('data-testid="community-profile-back-btn"'));

  // Mock fetch abort scenario
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  }) as typeof fetch;

  try {
    const res = await getCommunityProfileContributions('maryam_niavaran', {
      kind: 'discussion',
      limit: 12,
    });
    assert.equal(res.ok, false);
    assert.equal(res.errorFa, 'ABORTED');
  } finally {
    globalThis.fetch = origFetch;
  }
});
