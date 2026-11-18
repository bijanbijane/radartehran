/** @file src/features/community/tests/communityUserFollow.test.tsx — Stage 9 Frontend User Follow UI & Client API Suite (RT-SOCIAL-IMPL-009: FOLLOW-021..FOLLOW-024) */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from 'firebase/auth';
import { CommunityMembersAndGuidelinesTab } from '../components/CommunityMembersAndGuidelinesTab';
import {
  followCommunityUser,
  getCommunityUserFollowStatus,
  unfollowCommunityUser,
} from '../services/communityProfileAndFollowClient';
import type { CommunityProfile } from '../types/community.types';

const TARGET_PROFILE: CommunityProfile = {
  userId: 'uid_target_ui',
  username: 'navid_saadat',
  displayNameFa: 'نوید سعادت‌آبادی',
  bioFa: 'تحلیلگر منطقه ۲ تهران',
  visibility: 'public',
  showBadges: true,
  showContributions: true,
  showFollowedTopics: true,
  identityStatus: 'verified_email',
  isAuthenticated: true,
  isEmailVerified: true,
  isPhoneVerified: false,
  reputation: { data: 20, community: 30, research: 15, sources: 10, professional: 5 },
  badges: [],
  followedTopicIds: [],
  followersCount: 18,
  followingCount: 9,
  memberSinceFa: '۱۴۰۳',
  recentPublicSummaryFa: [],
  verifiedCredentialFa: null,
};

function makeFakeUser(uid: string): User {
  return {
    uid,
    getIdToken: async () => `fake-token-${uid}`,
  } as unknown as User;
}

test('FOLLOW-021..FOLLOW-022: SSR renders Follow button for signed-in non-owner, and hides it for guest or self', () => {
  const nonOwnerHtml = renderToStaticMarkup(
    React.createElement(CommunityMembersAndGuidelinesTab, {
      mode: 'members',
      members: [TARGET_PROFILE],
      selectedUsername: 'navid_saadat',
      onSelectUsername: () => {},
      currentUser: makeFakeUser('uid_other_viewer'),
    }),
  );
  assert.ok(nonOwnerHtml.includes('data-testid="community-profile-follow-btn"'));
  assert.ok(nonOwnerHtml.includes('دنبال‌کردن'));

  const selfHtml = renderToStaticMarkup(
    React.createElement(CommunityMembersAndGuidelinesTab, {
      mode: 'members',
      members: [TARGET_PROFILE],
      selectedUsername: 'navid_saadat',
      onSelectUsername: () => {},
      currentUser: makeFakeUser('uid_target_ui'),
    }),
  );
  assert.equal(selfHtml.includes('data-testid="community-profile-follow-btn"'), false);

  const guestHtml = renderToStaticMarkup(
    React.createElement(CommunityMembersAndGuidelinesTab, {
      mode: 'members',
      members: [TARGET_PROFILE],
      selectedUsername: 'navid_saadat',
      onSelectUsername: () => {},
      currentUser: null,
    }),
  );
  assert.equal(guestHtml.includes('data-testid="community-profile-follow-btn"'), false);
});

test('FOLLOW-023..FOLLOW-024: followCommunityUser / unfollowCommunityUser / getCommunityUserFollowStatus handle nested counts, idempotency, and server failure rollback signal', async () => {
  const origFetch = globalThis.fetch;
  const user = makeFakeUser('uid_client_viewer');

  try {
    // Success POST follow with nested relationship & counts payload
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          relationship: { isFollowing: true },
          counts: { followersCount: 19, followingCount: 5 },
          idempotentReplay: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const followRes = await followCommunityUser('uid_target_ui', user, 'client_idem_1');
    assert.equal(followRes.ok, true);
    assert.equal(followRes.data?.isFollowing, true);
    assert.equal(followRes.data?.followersCount, 19);
    assert.equal(followRes.data?.followingCount, 5);

    // Status GET
    const statusRes = await getCommunityUserFollowStatus('uid_target_ui', user);
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.data?.isFollowing, true);

    // Server 403 error on unfollow returns ok=false with Persian error message for UI rollback
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ status: 'error', code: 'FOLLOW_NOT_ALLOWED', messageFa: 'عملیات دنبال‌کردن مجاز نیست.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const failRes = await unfollowCommunityUser('uid_target_ui', user, 'client_idem_2');
    assert.equal(failRes.ok, false);
    assert.equal(failRes.status, 403);
    assert.ok(failRes.errorFa && failRes.errorFa.length > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
