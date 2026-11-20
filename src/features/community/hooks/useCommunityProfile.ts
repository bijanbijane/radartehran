/** @file src/features/community/hooks/useCommunityProfile.ts — Authoritative Public Profile, Paginated Contribution Timeline & User Follow Graph Hook (RT-SOCIAL-IMPL-008 & RT-SOCIAL-IMPL-009) */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  followCommunityUser,
  getCommunityMember,
  getCommunityProfileContributions,
  getCommunityUserFollowStatus,
  unfollowCommunityUser,
} from '../services/communityApiClient';
import type {
  CommunityProfile,
  ProfileContributionItem,
  ProfileContributionKind,
} from '../types/community.types';

export interface UseCommunityProfileOptions {
  username: string | null;
  fallbackProfile?: CommunityProfile | null;
  currentUser?: User | null;
  pageSize?: number;
}

export interface UseCommunityProfileResult {
  profile: CommunityProfile | null;
  profileLoading: boolean;
  profileErrorFa: string | null;
  activeKind: 'all' | ProfileContributionKind;
  setActiveKind: (kind: 'all' | ProfileContributionKind) => void;
  contributions: ProfileContributionItem[];
  contributionsVisible: boolean;
  contributionsLoading: boolean;
  contributionsLoadingMore: boolean;
  contributionsErrorFa: string | null;
  hasMoreContributions: boolean;
  loadMoreContributions: () => Promise<void>;
  reloadProfile: () => void;
  isFollowing: boolean;
  followPending: boolean;
  followErrorFa: string | null;
  toggleUserFollow: () => Promise<void>;
}

export function useCommunityProfile({
  username,
  fallbackProfile = null,
  currentUser = null,
  pageSize = 12,
}: UseCommunityProfileOptions): UseCommunityProfileResult {
  const [profile, setProfile] = useState<CommunityProfile | null>(fallbackProfile);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [profileErrorFa, setProfileErrorFa] = useState<string | null>(null);

  const [activeKind, setActiveKindState] = useState<'all' | ProfileContributionKind>('all');
  const [contributions, setContributions] = useState<ProfileContributionItem[]>([]);
  const [contributionsVisible, setContributionsVisible] = useState<boolean>(true);
  const [contributionsLoading, setContributionsLoading] = useState<boolean>(false);
  const [contributionsLoadingMore, setContributionsLoadingMore] = useState<boolean>(false);
  const [contributionsErrorFa, setContributionsErrorFa] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreContributions, setHasMoreContributions] = useState<boolean>(false);

  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followPending, setFollowPending] = useState<boolean>(false);
  const [followErrorFa, setFollowErrorFa] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const profileReqSeqRef = useRef<number>(0);
  const timelineReqSeqRef = useRef<number>(0);
  const followPendingRef = useRef<boolean>(false);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;
  const fallbackProfileRef = useRef<CommunityProfile | null>(fallbackProfile);
  fallbackProfileRef.current = fallbackProfile;
  const viewerUid = currentUser?.uid ?? null;

  const setActiveKind = useCallback((kind: 'all' | ProfileContributionKind) => {
    setActiveKindState(kind);
    setNextCursor(null);
  }, []);

  const reloadProfile = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  // Reset activeKind when username changes
  useEffect(() => {
    setActiveKindState('all');
    setNextCursor(null);
    setFollowErrorFa(null);
  }, [username]);

  // 1. Load authoritative profile + follow status from server API (with AbortController & sequence guard)
  useEffect(() => {
    if (!username) {
      setProfile(fallbackProfileRef.current);
      setProfileLoading(false);
      setProfileErrorFa(null);
      setIsFollowing(false);
      return;
    }

    const controller = new AbortController();
    const seq = ++profileReqSeqRef.current;
    setProfileLoading(true);
    setProfileErrorFa(null);

    (async () => {
      const activeUser = currentUserRef.current;
      const res = await getCommunityMember(username, { currentUser: activeUser, signal: controller.signal });
      if (controller.signal.aborted || seq !== profileReqSeqRef.current) return;

      if (!res.ok || !res.data) {
        if (res.errorFa === 'ABORTED') return;
        setProfile(null);
        setProfileErrorFa(res.errorFa || 'نمایه موردنظر یافت نشد یا خصوصی است.');
        setProfileLoading(false);
        return;
      }

      const loadedProfile = res.data;
      setProfile(loadedProfile);
      setProfileLoading(false);

      if (activeUser?.uid && loadedProfile.userId && activeUser.uid !== loadedProfile.userId) {
        const statusRes = await getCommunityUserFollowStatus(loadedProfile.userId, activeUser, controller.signal);
        if (!controller.signal.aborted && seq === profileReqSeqRef.current && statusRes.ok && statusRes.data) {
          setIsFollowing(Boolean(statusRes.data.isFollowing));
        }
      } else {
        setIsFollowing(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [username, viewerUid, reloadNonce]);

  // 2. Load first page of contribution timeline whenever username or activeKind changes
  useEffect(() => {
    if (!username) {
      setContributions([]);
      setContributionsVisible(true);
      setContributionsLoading(false);
      setContributionsErrorFa(null);
      setNextCursor(null);
      setHasMoreContributions(false);
      return;
    }

    const controller = new AbortController();
    const seq = ++timelineReqSeqRef.current;
    setContributionsLoading(true);
    setContributionsErrorFa(null);

    (async () => {
      const res = await getCommunityProfileContributions(username, {
        kind: activeKind,
        limit: pageSize,
        cursor: null,
        currentUser: currentUserRef.current,
        signal: controller.signal,
      });
      if (controller.signal.aborted || seq !== timelineReqSeqRef.current) return;

      if (!res.ok || !res.data) {
        if (res.errorFa === 'ABORTED') return;
        setContributions([]);
        setContributionsErrorFa(res.errorFa || 'خطا در بارگذاری مشارکت‌های کاربر.');
        setContributionsLoading(false);
        setNextCursor(null);
        setHasMoreContributions(false);
        return;
      }

      setContributions(res.data.items);
      setContributionsVisible(res.data.contributionsVisible ?? true);
      setNextCursor(res.data.nextCursor);
      setHasMoreContributions(res.data.hasMore);
      setContributionsLoading(false);
    })();

    return () => {
      controller.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [username, activeKind, pageSize, viewerUid, reloadNonce]);

  const loadMoreContributions = useCallback(async () => {
    if (!username || !nextCursor || contributionsLoadingMore || contributionsLoading) return;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const seq = timelineReqSeqRef.current;
    setContributionsLoadingMore(true);
    setContributionsErrorFa(null);

    const res = await getCommunityProfileContributions(username, {
      kind: activeKind,
      limit: pageSize,
      cursor: nextCursor,
      currentUser: currentUserRef.current,
      signal: controller.signal,
    });

    if (controller.signal.aborted || seq !== timelineReqSeqRef.current) return;
    setContributionsLoadingMore(false);

    if (!res.ok || !res.data) {
      if (res.errorFa && res.errorFa !== 'ABORTED') {
        setContributionsErrorFa(res.errorFa);
      }
      return;
    }

    setContributions((prev) => {
      const seen = new Set(prev.map((i) => i.id));
      const appended = res.data!.items.filter((i) => !seen.has(i.id));
      return [...prev, ...appended];
    });
    setNextCursor(res.data.nextCursor);
    setHasMoreContributions(res.data.hasMore);
  }, [username, nextCursor, contributionsLoadingMore, contributionsLoading, activeKind, pageSize]);

  const toggleUserFollow = useCallback(async () => {
    const activeUser = currentUserRef.current;
    if (!profile || !activeUser?.uid || activeUser.uid === profile.userId) return;
    if (followPendingRef.current) return;

    const targetUserId = profile.userId;
    const capturedProfileSeq = profileReqSeqRef.current;
    followPendingRef.current = true;
    setFollowPending(true);
    setFollowErrorFa(null);

    const prevFollowing = isFollowing;
    const prevFollowersCount = Number(profile.followersCount ?? 0);
    const optimisticFollowing = !prevFollowing;
    const optimisticFollowersCount = Math.max(0, prevFollowersCount + (optimisticFollowing ? 1 : -1));

    setIsFollowing(optimisticFollowing);
    setProfile((prev) => (prev && prev.userId === targetUserId ? { ...prev, followersCount: optimisticFollowersCount } : prev));

    try {
      const res = optimisticFollowing
        ? await followCommunityUser(targetUserId, activeUser)
        : await unfollowCommunityUser(targetUserId, activeUser);

      if (capturedProfileSeq !== profileReqSeqRef.current) return;

      if (!res.ok || !res.data) {
        // Rollback optimistic state on server failure (FOLLOW-022)
        setIsFollowing(prevFollowing);
        setProfile((prev) => (prev && prev.userId === targetUserId ? { ...prev, followersCount: prevFollowersCount } : prev));
        setFollowErrorFa(res.errorFa || 'خطا در تغییر وضعیت دنبال‌کردن کاربر.');
        return;
      }

      setIsFollowing(res.data.isFollowing);
      setProfile((prev) =>
        prev && prev.userId === targetUserId
          ? {
              ...prev,
              followersCount: res.data!.followersCount,
            }
          : prev,
      );
    } finally {
      followPendingRef.current = false;
      setFollowPending(false);
    }
  }, [profile, isFollowing]);

  return {
    profile,
    profileLoading,
    profileErrorFa,
    activeKind,
    setActiveKind,
    contributions,
    contributionsVisible,
    contributionsLoading,
    contributionsLoadingMore,
    contributionsErrorFa,
    hasMoreContributions,
    loadMoreContributions,
    reloadProfile,
    isFollowing,
    followPending,
    followErrorFa,
    toggleUserFollow,
  };
}
