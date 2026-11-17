/** @file src/features/community/hooks/useCommunityHubData.ts — Stage 4b Unified Community Hub Data Hook with AbortController, Retry & Cursor Pagination */
import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  getCommunityCorrections,
  getCommunityDiscussions,
  getCommunityMembers,
  getCommunityQuestions,
  getCommunityResearchProposals,
  getCommunityTopics,
  getMyCommunityActivity,
} from '../services/communityApiClient';
import type {
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTopicNode,
  DataCorrectionProposal,
  ResearchTopicProposal,
} from '../types/community.types';

export function useCommunityHubData(params: { currentUser?: User | null; includeSeeds: boolean }) {
  const { currentUser, includeSeeds } = params;
  const [topics, setTopics] = useState<CommunityTopicNode[]>([]);
  const [posts, setPosts] = useState<CommunityDiscussionPost[]>([]);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [questions, setQuestions] = useState<CommunityQuestionItem[]>([]);
  const [corrections, setCorrections] = useState<DataCorrectionProposal[]>([]);
  const [researchProposals, setResearchProposals] = useState<ResearchTopicProposal[]>([]);
  const [members, setMembers] = useState<CommunityProfile[]>([]);
  const [myServerProfile, setMyServerProfile] = useState<CommunityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErrorFa(null);
    Promise.all([
      getCommunityTopics(currentUser, ctrl.signal),
      getCommunityDiscussions({ includeSeeds, limit: 20, signal: ctrl.signal }),
      getCommunityQuestions({ includeSeeds, limit: 20, signal: ctrl.signal }),
      getCommunityCorrections({ includeSeeds, limit: 20, signal: ctrl.signal }),
      getCommunityResearchProposals({ includeSeeds, limit: 20, signal: ctrl.signal }),
      getCommunityMembers({ includeSeeds, currentUser, limit: 24, signal: ctrl.signal }),
      currentUser?.uid ? getMyCommunityActivity(currentUser, ctrl.signal) : Promise.resolve(null),
    ]).then(([tRes, dRes, qRes, cRes, rRes, mRes, meRes]) => {
      if (ctrl.signal.aborted) return;
      if (tRes.ok && tRes.data) setTopics(tRes.data);
      if (dRes.ok && dRes.data) {
        setPosts(dRes.data);
        setPostsCursor(dRes.nextCursor ?? null);
        setHasMorePosts(Boolean(dRes.hasMore));
      }
      if (qRes.ok && qRes.data) setQuestions(qRes.data);
      if (cRes.ok && cRes.data) setCorrections(cRes.data);
      if (rRes.ok && rRes.data) setResearchProposals(rRes.data);
      if (mRes.ok && mRes.data) setMembers(mRes.data.items);
      if (meRes && meRes.ok && meRes.data?.myProfile) setMyServerProfile(meRes.data.myProfile);
      else if (!currentUser?.uid) setMyServerProfile(null);

      const firstErr = [tRes, dRes, qRes, cRes].find((r) => !r.ok && r.errorFa !== 'ABORTED');
      if (firstErr?.errorFa) setErrorFa(firstErr.errorFa);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [currentUser?.uid, includeSeeds, reloadNonce]);

  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || !postsCursor || loadingMore) return;
    setLoadingMore(true);
    const res = await getCommunityDiscussions({ includeSeeds, limit: 20, cursor: postsCursor });
    if (res.ok && res.data) {
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = res.data!.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });
      setPostsCursor(res.nextCursor ?? null);
      setHasMorePosts(Boolean(res.hasMore));
    } else if (res.errorFa && res.errorFa !== 'ABORTED') {
      setErrorFa(res.errorFa);
    }
    setLoadingMore(false);
  }, [hasMorePosts, postsCursor, loadingMore, includeSeeds]);

  return {
    topics,
    setTopics,
    posts,
    setPosts,
    hasMorePosts,
    loadMorePosts,
    questions,
    setQuestions,
    corrections,
    setCorrections,
    researchProposals,
    setResearchProposals,
    members,
    myServerProfile,
    loading,
    loadingMore,
    errorFa,
    reload,
  };
}
