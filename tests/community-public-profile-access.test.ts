/** @file tests/community-public-profile-access.test.ts — Stage 8 Direct Username Lookup, Normalization, Privacy & Zero-PII Suite (RT-SOCIAL-IMPL-008: PROF-001..PROF-014) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityHttpError,
  MockFirestoreCommunityStore,
  SOCIAL_COLLECTIONS,
} from '../server/modules/community/communityFirestoreAdapter';
import {
  assertCommunityUsernameUnique,
  lookupRawCommunityProfileByUsername,
  normalizeCommunityUsername,
} from '../server/modules/community/communityProfileCursorAndUsername';
import { CommunityUnifiedRepository } from '../server/modules/community/communityUnifiedRepository';

function createTestRepo() {
  const store = new MockFirestoreCommunityStore();
  const repo = new CommunityUnifiedRepository(store);
  return { store, repo };
}

test('PROF-001..PROF-005: Direct username lookup finds profiles beyond 50 records, normalizes case-insensitively, migrates legacy casing, and blocks duplicates (409)', async () => {
  const { store, repo } = createTestRepo();

  // Seed 140 profiles to prove lookup works well beyond legacy 50-doc memory cap
  for (let i = 1; i <= 140; i++) {
    const uid = `uid_bulk_${String(i).padStart(3, '0')}`;
    const username = `member_${String(i).padStart(3, '0')}`;
    await store.setDoc(SOCIAL_COLLECTIONS.profiles, uid, {
      userId: uid,
      username,
      displayNameFa: `عضو شماره ${i}`,
      bioFa: 'توضیح پروفایل',
      visibility: 'public',
      showBadges: true,
      showContributions: true,
      showFollowedTopics: true,
      identityStatus: 'verified_email',
      isAuthenticated: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      reputation: { data: i, community: 10, research: 5, sources: 2, professional: 0 },
      badges: [],
      followedTopicIds: [],
      followersCount: 0,
      followingCount: 0,
      memberSinceFa: 'امروز',
      recentPublicSummaryFa: [],
      verifiedCredentialFa: null,
      isSeed: false,
    });
  }

  // PROF-001 & PROF-002: Direct lookup of 137th profile (mixed case query -> normalized lowercase)
  const found137 = await repo.getPublicProfileByUsername('  MeMbEr_137  ', false);
  assert.ok(found137);
  assert.equal(found137.userId, 'uid_bulk_137');
  assert.equal(found137.username, 'member_137');

  // PROF-003: Legacy uppercase stored username is found and lazily migrated to lowercase
  await store.setDoc(SOCIAL_COLLECTIONS.profiles, 'uid_legacy_case', {
    userId: 'uid_legacy_case',
    username: 'Legacy_Tehran_Analyst',
    displayNameFa: 'تحلیلگر قدیمی',
    bioFa: 'بیوگرافی',
    visibility: 'public',
    showBadges: true,
    showContributions: true,
    showFollowedTopics: true,
    identityStatus: 'verified_email',
    isAuthenticated: true,
    isEmailVerified: true,
    isPhoneVerified: false,
    reputation: { data: 20, community: 20, research: 10, sources: 5, professional: 0 },
    badges: [],
    followedTopicIds: [],
    followersCount: 3,
    followingCount: 1,
    memberSinceFa: '۱۴۰۳',
    recentPublicSummaryFa: [],
    verifiedCredentialFa: null,
  });

  const migrated = await lookupRawCommunityProfileByUsername(store, 'legacy_tehran_analyst');
  assert.ok(migrated);
  assert.equal(migrated.username, 'legacy_tehran_analyst');
  const storedAfter = await store.getDoc(SOCIAL_COLLECTIONS.profiles, 'uid_legacy_case');
  assert.equal(storedAfter?.username, 'legacy_tehran_analyst');

  // PROF-004: Username normalization rejects invalid patterns (400 INVALID_USERNAME)
  assert.throws(
    () => normalizeCommunityUsername('ab'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_USERNAME',
  );
  assert.throws(
    () => normalizeCommunityUsername('invalid user!'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 400 && err.code === 'INVALID_USERNAME',
  );

  // PROF-005: Duplicate username (case-insensitive) across users throws 409 DUPLICATE_USERNAME
  await assert.rejects(
    () => assertCommunityUsernameUnique(store, 'MEMBER_137', 'uid_different_user'),
    (err: unknown) => err instanceof CommunityHttpError && err.statusCode === 409 && err.code === 'DUPLICATE_USERNAME',
  );
  // Same owner updating their own username succeeds
  const selfOk = await assertCommunityUsernameUnique(store, 'MEMBER_137', 'uid_bulk_137');
  assert.equal(selfOk, 'member_137');
});

test('PROF-006..PROF-014: Profile visibility policies (public/members_only/private), selective toggles (showBadges/showFollowedTopics/showContributions), and zero PII leakage', async () => {
  const { store, repo } = createTestRepo();

  await store.setDoc(SOCIAL_COLLECTIONS.profiles, 'uid_priv_owner', {
    userId: 'uid_priv_owner',
    username: 'ali_housing',
    displayNameFa: 'علی مسکن',
    bioFa: 'تحلیلگر محله سعادت‌آباد',
    visibility: 'members_only',
    showBadges: false,
    showContributions: false,
    showFollowedTopics: false,
    identityStatus: 'verified_phone',
    isAuthenticated: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    reputation: { data: 50, community: 40, research: 30, sources: 20, professional: 10 },
    badges: [
      {
        id: 'badge_1',
        titleFa: 'تحلیلگر داده‌محور',
        scopeFa: 'تهران',
        authorityFa: 'رادار تهران',
        reviewedAtFa: '۱۴۰۴',
      },
    ],
    credentials: [
      {
        id: 'cred_1',
        titleFa: 'کارشناس رسمی دادگستری',
        status: 'active',
        expiresAtIso: '2099-01-01T00:00:00.000Z',
      },
    ],
    verifiedCredentialFa: 'کارشناس رسمی دادگستری',
    followedTopicIds: ['rent_and_budget', 'transit_and_access'],
    followersCount: 12,
    followingCount: 4,
    memberSinceFa: '۱۴۰۳',
    recentPublicSummaryFa: [],
    // Plant sensitive server PII fields to assert they are stripped strictly
    email: 'ali@example.com',
    phone: '09121234567',
    phoneNumber: '+989121234567',
    authUid: 'secret-auth-uid',
    token: 'secret-jwt-token',
    moderationHistoryInternal: [{ reason: 'internal' }],
  });

  // PROF-006: Guest cannot view members_only profile
  const guestView = await repo.getPublicProfileByUsername('ali_housing', false);
  assert.equal(guestView, null);

  // PROF-007..PROF-010: Member viewer gets profile with showBadges=false & showFollowedTopics=false honored AND zero PII
  const memberView = await repo.getPublicProfileByUsername('ali_housing', true, 'uid_other_member');
  assert.ok(memberView);
  assert.equal(memberView.badges.length, 0);
  assert.equal(memberView.followedTopicIds.length, 0);
  assert.equal(memberView.verifiedCredentialFa, null);
  assert.equal(memberView.showContributions, false);
  const rawView = memberView as unknown as Record<string, unknown>;
  assert.equal('email' in rawView, false);
  assert.equal('phone' in rawView, false);
  assert.equal('phoneNumber' in rawView, false);
  assert.equal('authUid' in rawView, false);
  assert.equal('token' in rawView, false);
  assert.equal('moderationHistoryInternal' in rawView, false);

  // PROF-011: Owner viewer still sees their own badges, credentials, and followed topics (while PII remains stripped)
  const ownerView = await repo.getPublicProfileByUsername('ali_housing', true, 'uid_priv_owner');
  assert.ok(ownerView);
  assert.equal(ownerView.badges.length, 1);
  assert.equal(ownerView.followedTopicIds.length, 2);
  assert.equal(ownerView.verifiedCredentialFa, 'کارشناس رسمی دادگستری');

  // PROF-012..PROF-014: Private profile is hidden from members & guests, visible only to owner
  await repo.updateProfilePrivacy('uid_priv_owner', { visibility: 'private' });
  assert.equal(await repo.getPublicProfileByUsername('ali_housing', false), null);
  assert.equal(await repo.getPublicProfileByUsername('ali_housing', true, 'uid_other_member'), null);
  const ownerPrivateView = await repo.getPublicProfileByUsername('ali_housing', true, 'uid_priv_owner');
  assert.ok(ownerPrivateView);
  assert.equal(ownerPrivateView.visibility, 'private');
});
