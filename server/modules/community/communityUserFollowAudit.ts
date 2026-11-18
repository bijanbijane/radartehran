/** @file server/modules/community/communityUserFollowAudit.ts — RT-SOCIAL-IMPL-009 Read-Only User Follow Graph Consistency Auditor */
import type { CommunityProfile } from '../../../src/features/community/types/community.types';
import {
  MAX_COMMUNITY_QUERY_LIMIT,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';

export interface UserFollowConsistencyAuditReport {
  checkedAtIso: string;
  totalFollowDocsScanned: number;
  totalProfilesScanned: number;
  orphanFollowDocIds: string[];
  selfFollowDocIds: string[];
  nonCanonicalFollowDocIds: string[];
  duplicatePairFollowDocIds: string[];
  missingCounterProfileUids: string[];
  counterDrifts: Array<{
    userId: string;
    storedFollowersCount: number;
    actualFollowersCount: number;
    storedFollowingCount: number;
    actualFollowingCount: number;
  }>;
  isConsistent: boolean;
}

export function buildUserFollowDocId(targetUid: string, followerUid: string): string {
  return `user_${targetUid}__${followerUid}`;
}

export async function auditUserFollowGraphConsistency(
  store: CommunityDatabaseStore,
): Promise<UserFollowConsistencyAuditReport> {
  const profilesByUid = new Map<string, CommunityProfile & Record<string, unknown>>();
  let profileCursor: string | null = null;
  do {
    const page = await store.queryDocs<CommunityProfile & Record<string, unknown>>(
      SOCIAL_COLLECTIONS.profiles,
      {
        orderBy: [{ field: 'id', direction: 'asc' }],
        limit: MAX_COMMUNITY_QUERY_LIMIT,
        cursorDocId: profileCursor,
      },
    );
    for (const p of page.items) {
      profilesByUid.set(p.userId || p.id, p);
    }
    profileCursor = page.nextCursor;
  } while (profileCursor);

  const orphanFollowDocIds: string[] = [];
  const selfFollowDocIds: string[] = [];
  const nonCanonicalFollowDocIds: string[] = [];
  const duplicatePairFollowDocIds: string[] = [];
  const seenPairs = new Set<string>();
  const actualFollowersByUid = new Map<string, number>();
  const actualFollowingByUid = new Map<string, number>();

  let totalFollowDocsScanned = 0;
  let followCursor: string | null = null;
  do {
    const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.follows, {
      filters: [{ field: 'scope', op: '==', value: 'user' }],
      orderBy: [{ field: 'id', direction: 'asc' }],
      limit: MAX_COMMUNITY_QUERY_LIMIT,
      cursorDocId: followCursor,
    });
    for (const doc of page.items) {
      totalFollowDocsScanned += 1;
      const targetId = String(doc.targetId || '').trim();
      const followerUid = String(doc.followerUid || '').trim();
      const expectedId = buildUserFollowDocId(targetId, followerUid);

      if (doc.id !== expectedId) nonCanonicalFollowDocIds.push(doc.id);
      if (targetId && followerUid && targetId === followerUid) selfFollowDocIds.push(doc.id);
      if (!targetId || !profilesByUid.has(targetId)) orphanFollowDocIds.push(doc.id);

      const pairKey = `${targetId}__${followerUid}`;
      if (seenPairs.has(pairKey)) {
        duplicatePairFollowDocIds.push(doc.id);
      } else {
        seenPairs.add(pairKey);
        if (targetId && followerUid && targetId !== followerUid && profilesByUid.has(targetId)) {
          actualFollowersByUid.set(targetId, (actualFollowersByUid.get(targetId) ?? 0) + 1);
          actualFollowingByUid.set(followerUid, (actualFollowingByUid.get(followerUid) ?? 0) + 1);
        }
      }
    }
    followCursor = page.nextCursor;
  } while (followCursor);

  const missingCounterProfileUids: string[] = [];
  const counterDrifts: UserFollowConsistencyAuditReport['counterDrifts'] = [];

  for (const [uid, profile] of profilesByUid.entries()) {
    const hasValidFollowers =
      typeof profile.followersCount === 'number' &&
      Number.isInteger(profile.followersCount) &&
      profile.followersCount >= 0;
    const hasValidFollowing =
      typeof profile.followingCount === 'number' &&
      Number.isInteger(profile.followingCount) &&
      profile.followingCount >= 0;
    if (!hasValidFollowers || !hasValidFollowing) missingCounterProfileUids.push(uid);

    const storedFollowersCount = Math.max(0, Number(profile.followersCount ?? 0));
    const storedFollowingCount = Math.max(0, Number(profile.followingCount ?? 0));
    const actualFollowersCount = actualFollowersByUid.get(uid) ?? 0;
    const actualFollowingCount = actualFollowingByUid.get(uid) ?? 0;

    if (storedFollowersCount !== actualFollowersCount || storedFollowingCount !== actualFollowingCount) {
      counterDrifts.push({
        userId: uid,
        storedFollowersCount,
        actualFollowersCount,
        storedFollowingCount,
        actualFollowingCount,
      });
    }
  }

  const isConsistent =
    orphanFollowDocIds.length === 0 &&
    selfFollowDocIds.length === 0 &&
    nonCanonicalFollowDocIds.length === 0 &&
    duplicatePairFollowDocIds.length === 0 &&
    missingCounterProfileUids.length === 0 &&
    counterDrifts.length === 0;

  return {
    checkedAtIso: new Date().toISOString(),
    totalFollowDocsScanned,
    totalProfilesScanned: profilesByUid.size,
    orphanFollowDocIds,
    selfFollowDocIds,
    nonCanonicalFollowDocIds,
    duplicatePairFollowDocIds,
    missingCounterProfileUids,
    counterDrifts,
    isConsistent,
  };
}
