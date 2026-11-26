/** @file src/features/community/pages/CommunityHubPage.tsx — Stage 73–79 Real-Identity, Server-Backed & Multi-City Community Platform */
import { useMemo, useState, useEffect } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { LogIn, MessageSquarePlus, RefreshCw } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, type CityId } from '../../../data/multiCityData';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ContributionsSubTabId, ModuleSubTabId } from '../../../navigation/registry/route.types';
import {
  COMMUNITY_AUTH_REQUIRED_FA,
  resolveAuthenticatedCommunityUser,
} from '../services/communityTrustService';
import {
  createCommunityAnswer, createCommunityDiscussion, createCommunityQuestion, createCommunityReply,
  createDataCorrection, createResearchProposal, editCommunityDiscussion, selectQuestionAnswer,
  submitCommunityAbuseReport, toggleCommunityDiscussionFollow, toggleCommunityReaction,
  toggleTopicFollow, voteResearchProposal, withdrawDataCorrection,
} from '../services/communityApiClient';
import { useCommunityHubData } from '../hooks/useCommunityHubData';
import type { CommunityAbuseReason, CommunityHubTabId, ReactionType } from '../types/community.types';
import { CommunityTrustBanner } from '../components/CommunityTrustBanner';
import { CommunityHomeOverview } from '../components/CommunityHomeOverview';
import { CommunityDataCorrectionsTab } from '../components/CommunityDataCorrectionsTab';
import { CommunityDiscussionsTab } from '../components/CommunityDiscussionsTab';
import { CommunityQuestionsTab } from '../components/CommunityQuestionsTab';
import { CommunityTopicsAndSpatialTab } from '../components/CommunityTopicsAndSpatialTab';
import { CommunityMembersAndGuidelinesTab } from '../components/CommunityMembersAndGuidelinesTab';
import { CommunityResearchProposalsTab } from '../components/CommunityResearchProposalsTab';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import {
  mapHubTabToSubTab, mapSubTabToHubTab,
  pushMemberProfileUrl, readMemberUsernameFromPath,
} from '../utils/communityHubNavHelpers';

export interface CommunityHubPageProps {
  activeSubTab?: ContributionsSubTabId;
  activeCity?: CityId;
  currentUser?: User | null;
  isVerifiedAdmin?: boolean;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenAgencySubmit: () => void;
  onOpenResidentVoteTab: () => void;
  onOpenListingVerifier: () => void;
}

export const CommunityHubPage: React.FC<CommunityHubPageProps> = ({
  activeSubTab, activeCity, currentUser, selectedHood, evaluatedNeighborhoods = [],
  onNavigateView, onOpenAgencySubmit, onOpenResidentVoteTab, onOpenListingVerifier,
}) => {
  const [selectedUsername, setSelectedUsernameState] = useState<string | null>(() => readMemberUsernameFromPath());
  const [activeTab, setActiveTab] = useState<CommunityHubTabId>(() =>
    readMemberUsernameFromPath() ? 'members' : mapSubTabToHubTab(activeSubTab),
  );
  const [includeSeeds, setIncludeSeeds] = useState(true);
  const [toastFa, setToastFa] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const showToast = (msg: string | null, kind: 'success' | 'error' = 'success') => {
    setToastFa(msg);
    setToastKind(kind);
  };
  const setSelectedUsername = (username: string | null) => {
    setSelectedUsernameState(username);
    pushMemberProfileUrl(username);
  };

  const {
    topics, setTopics, posts, setPosts, hasMorePosts, loadMorePosts,
    questions, setQuestions, corrections, setCorrections, researchProposals, setResearchProposals,
    members, myServerProfile, loading, loadingMore, errorFa, reload,
  } = useCommunityHubData({ currentUser, includeSeeds });

  const resolvedCity = activeCity || resolveCityIdForNeighborhood(selectedHood.id);
  const cityNameFa = MULTI_CITY_CONFIGS[resolvedCity]?.nameFa || 'تهران';

  useEffect(() => {
    const memberFromPath = readMemberUsernameFromPath();
    setSelectedUsernameState(memberFromPath);
    if (memberFromPath) {
      setActiveTab('members');
      return;
    }
    setActiveTab(mapSubTabToHubTab(activeSubTab));
  }, [activeSubTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const nextUser = readMemberUsernameFromPath();
      setSelectedUsernameState(nextUser);
      if (nextUser) setActiveTab('members');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    setToastFa(null);
  }, [currentUser?.uid]);

  const currentUserProfile = useMemo(
    () => resolveAuthenticatedCommunityUser(currentUser, myServerProfile),
    [currentUser, myServerProfile],
  );

  const followedTopicIds = useMemo(
    () => topics.filter((t) => t.isFollowedByMe).map((t) => t.id),
    [topics],
  );

  const openMemberProfile = (username: string) => {
    setSelectedUsername(username);
    setActiveTab('members');
    onNavigateView('contributions', 'members');
  };

  const selectCommunityTab = (nextTab: CommunityHubTabId) => {
    setSelectedUsernameState(null);
    setActiveTab(nextTab);
    setToastFa(null);
    onNavigateView('contributions', mapHubTabToSubTab(nextTab));
  };

  const requireAuthResult = () => ({ ok: false, errorFa: COMMUNITY_AUTH_REQUIRED_FA });

  const communityHeadingFa = (() => {
    switch (activeTab) {
      case 'discussions':
      case 'social_discussion':
        return `گفت‌وگوهای محلی و تجربه ساکنین ${cityNameFa}`;
      case 'questions':
      case 'expert_qa':
        return `پرسش و پاسخ تخصصی مسکن ${cityNameFa}`;
      case 'topics':
      case 'neighborhoods':
        return `موضوعات تخصصی و انجمن محله‌های ${cityNameFa}`;
      case 'data_contribution':
        return `ثبت مشارکت و اصلاح داده‌های بازار ${cityNameFa}`;
      case 'research_proposals':
        return `پیشنهادهای پژوهشی و اولویت گزارش‌های ${cityNameFa}`;
      case 'members':
        return `اعضای فعال و اعتبارسنجی جامعه رادار ${cityNameFa}`;
      case 'guidelines':
        return `آیین‌نامه، شفافیت و قوانین جامعه رادار ${cityNameFa}`;
      default:
        return `جامعه تخصصی رادار ${cityNameFa}`;
    }
  })();

  return (
    <div data-testid="product-contributions-view" className="w-full max-w-[1320px] mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      <div className="border-b border-[var(--color-border-subtle)] pb-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-[var(--color-brand-fg)] flex items-center gap-1.5 mb-1">
              <MessageSquarePlus className="w-4 h-4 shrink-0" />
              <span>جامعه کاربران، پرسش‌وپاسخ تخصصی و مشارکت مکانی</span>
            </span>
            <h1 className="text-2xl sm:text-[30px] font-bold leading-[1.3] text-[var(--color-text-primary)]">
              {communityHeadingFa}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {typeof window !== 'undefined' && typeof window.location?.search === 'string' && new URLSearchParams(window.location.search).get('dev') === '1' && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] text-sm font-semibold text-[var(--color-text-secondary)] cursor-pointer">
                <input type="checkbox" checked={includeSeeds} onChange={(e) => setIncludeSeeds(e.target.checked)} className="accent-[var(--color-brand-600)]" />
                <span>نمایش محتوای نمونه</span>
              </label>
            )}
            <RadarLink
              href="/account/community"
              onNavigate={() => onNavigateView('userspace', 'community')}
              className="min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-brand-600)] whitespace-nowrap"
            >
              تنظیمات جامعه من
            </RadarLink>
          </div>
        </div>

        {(activeTab === 'discussions' || activeTab === 'social_discussion' || activeTab === 'questions' || activeTab === 'expert_qa' || activeTab === 'topics' || activeTab === 'neighborhoods') && (
          <div role="group" aria-label="زیربخش‌های گفت‌وگو و پرسش‌وپاسخ" className="flex flex-wrap items-center gap-1.5 text-sm">
            <button type="button" onClick={() => selectCommunityTab('discussions')} className={`min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer ${activeTab === 'discussions' || activeTab === 'social_discussion' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'}`}>گفت‌وگوها</button>
            <button type="button" onClick={() => selectCommunityTab('questions')} className={`min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer ${activeTab === 'questions' || activeTab === 'expert_qa' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'}`}>پرسش و پاسخ تخصصی</button>
            <button type="button" onClick={() => selectCommunityTab('topics')} className={`min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer ${activeTab === 'topics' || activeTab === 'neighborhoods' ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'}`}>موضوعات و محله‌ها</button>
          </div>
        )}
      </div>

      {/* Unified Compact Trust + Guest Sign-In Strip (AUD-011) */}
      <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-hidden">
        <CommunityTrustBanner />
        {!currentUserProfile.isAuthenticated && (
          <div
            data-testid="community-guest-notice"
            className="px-4 py-3 bg-amber-50/80 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              حالت مطالعه مهمان: برای انتشار گفت‌وگو، پاسخ یا اصلاح داده وارد حساب شوید.
            </span>
            <RadarLink
              href="/account"
              onNavigate={() => onNavigateView('userspace', 'overview')}
              className="min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-semibold gap-1.5"
            >
              <LogIn className="w-4 h-4" /><span>ورود به حساب</span>
            </RadarLink>
          </div>
        )}
      </div>

      {toastFa && (
        <div
          data-testid={toastKind === 'error' ? 'community-toast-error' : 'community-toast-success'}
          role={toastKind === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-[10px] border text-xs font-bold ${
            toastKind === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {toastFa}
        </div>
      )}

      {errorFa && errorFa !== 'ABORTED' && (
        <div
          data-testid="community-error-banner"
          role="alert"
          className="p-3.5 rounded-[11px] bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900 dark:text-rose-200"
        >
          <span className="font-bold">{errorFa}</span>
          <button
            type="button"
            data-testid="community-retry-btn"
            onClick={reload}
            className="px-3 py-1.5 rounded-[8px] bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-rose-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تلاش مجدد</span>
          </button>
        </div>
      )}

      {loading && posts.length === 0 && (
        <div className="p-6 rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] text-center font-bold">
          در حال دریافت داده‌های جامعه از سرور...
        </div>
      )}

      {activeTab === 'overview' && (
        <CommunityHomeOverview
          selectedHood={selectedHood}
          posts={posts}
          questions={questions}
          corrections={corrections}
          topics={topics}
          followedTopicIds={followedTopicIds}
          onSwitchTab={(t) => selectCommunityTab(t)}
          onSelectAuthor={openMemberProfile}
        />
      )}

      {(activeTab === 'discussions' || activeTab === 'social_discussion') && (
        <div className="space-y-4">
          <CommunityDiscussionsTab
            selectedHood={selectedHood}
            posts={posts}
            currentUserId={currentUserProfile.userId}
            onSubmitPost={async (input) => {
              if (!currentUserProfile.isAuthenticated) return requireAuthResult();
              const res = await createCommunityDiscussion(
                {
                  track: 'social_discussion',
                  neighborhoodId: selectedHood.id,
                  neighborhoodNameFa: selectedHood.name,
                  topicId: input.topicId,
                  titleFa: input.titleFa,
                  bodyFa: input.bodyFa,
                },
                currentUser,
              );
              if (res.ok && res.data) setPosts((prev) => [res.data!, ...prev]);
              return { ok: res.ok, errorFa: res.errorFa };
            }}
            onReplyPost={async (postId, bodyFa, parentReplyId) => {
              if (!currentUserProfile.isAuthenticated) return requireAuthResult();
              const res = await createCommunityReply(postId, { bodyFa, parentReplyId }, currentUser);
              if (res.ok && res.data) setPosts((prev) => prev.map((p) => (p.id === postId ? res.data! : p)));
              return { ok: res.ok, errorFa: res.errorFa };
            }}
            onEditPost={async (postId, titleFa, bodyFa) => {
              if (!currentUserProfile.isAuthenticated) return requireAuthResult();
              const res = await editCommunityDiscussion(postId, { titleFa, bodyFa, reasonFa: 'ویرایش توسط نویسنده' }, currentUser);
              if (res.ok && res.data) setPosts((prev) => prev.map((p) => (p.id === postId ? res.data! : p)));
              return { ok: res.ok, errorFa: res.errorFa };
            }}
            onToggleReaction={async (postId, reaction: ReactionType) => {
              if (!currentUserProfile.isAuthenticated) { showToast(COMMUNITY_AUTH_REQUIRED_FA, 'error'); return; }
              const res = await toggleCommunityReaction(postId, reaction, currentUser);
              if (res.ok && res.data) {
                const { reactionCounts, activeReaction } = res.data;
                setPosts((prev) =>
                  prev.map((p) => {
                    if (p.id !== postId) return p;
                    const nextByUser = { ...(p.reactionsByUser || {}) };
                    if (activeReaction) nextByUser[currentUserProfile.userId] = activeReaction;
                    else delete nextByUser[currentUserProfile.userId];
                    return { ...p, reactionCounts, helpfulCount: reactionCounts.helpful, reactionsByUser: nextByUser };
                  }),
                );
              } else if (res.errorFa) {
                showToast(res.errorFa, 'error');
              }
            }}
            onToggleFollow={async (postId) => {
              if (!currentUserProfile.isAuthenticated) { showToast(COMMUNITY_AUTH_REQUIRED_FA, 'error'); return; }
              const res = await toggleCommunityDiscussionFollow(postId, currentUser);
              if (res.ok && res.data) setPosts((prev) => prev.map((p) => (p.id === postId ? res.data! : p)));
              else if (res.errorFa) showToast(res.errorFa, 'error');
            }}
            onReportAbuse={async (postId, reason: CommunityAbuseReason, detailsFa: string) => {
              if (!currentUserProfile.isAuthenticated) { showToast(COMMUNITY_AUTH_REQUIRED_FA, 'error'); return; }
              const res = await submitCommunityAbuseReport({ targetType: 'discussion_post', targetId: postId, reason, detailsFa }, currentUser);
              if (res.ok && res.data) {
                showToast('گزارش تخلف به صف نظارت سرور ارسال شد.', 'success');
              } else {
                showToast(res.errorFa || 'خطا در ارسال گزارش تخلف؛ گزارش ثبت نشد.', 'error');
              }
            }}
            onSelectAuthor={openMemberProfile}
            onOpenResidentVoteTab={onOpenResidentVoteTab}
          />
          {hasMorePosts && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                data-testid="community-load-more-posts"
                disabled={loadingMore}
                onClick={loadMorePosts}
                className="px-4 py-2 rounded-[10px] border border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-300 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? 'در حال بارگذاری...' : 'بارگذاری بیشتر'}
              </button>
            </div>
          )}
        </div>
      )}

      {(activeTab === 'questions' || activeTab === 'expert_qa') && (
        <CommunityQuestionsTab
          selectedHood={selectedHood}
          questions={questions}
          currentUserId={currentUserProfile.userId}
          onSubmitQuestion={async (input) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await createCommunityQuestion(
              { ...input, neighborhoodId: selectedHood.id, neighborhoodNameFa: selectedHood.name },
              currentUser,
            );
            if (res.ok && res.data) setQuestions((prev) => [res.data!, ...prev]);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onSubmitAnswer={async (qId, bodyFa, sourceReferenceFa) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await createCommunityAnswer(qId, { bodyFa, sourceReferenceFa }, currentUser);
            if (res.ok && res.data?.question) {
              setQuestions((prev) => prev.map((q) => (q.id === qId ? res.data!.question : q)));
            }
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onToggleAskerSelected={async (qId, aId) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await selectQuestionAnswer(qId, aId, currentUser);
            if (res.ok && res.data) setQuestions((prev) => prev.map((q) => (q.id === qId ? res.data! : q)));
            else if (res.errorFa) showToast(res.errorFa, 'error');
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onSelectAuthor={openMemberProfile}
        />
      )}

      {activeTab === 'data_contribution' && (
        <CommunityDataCorrectionsTab
          selectedHood={selectedHood}
          neighborhoods={evaluatedNeighborhoods}
          proposals={corrections}
          currentUserProfile={currentUserProfile}
          onSubmitProposal={async (input) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await createDataCorrection(input, currentUser);
            if (res.ok && res.data) setCorrections((prev) => [res.data!, ...prev]);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onWithdrawProposal={async (id) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await withdrawDataCorrection(id, currentUser);
            if (res.ok && res.data) {
              setCorrections((prev) => prev.map((c) => (c.id === id ? res.data! : c)));
              showToast('پیشنهاد از صف بررسی خارج شد.', 'success');
            } else if (res.errorFa) {
              showToast(res.errorFa, 'error');
            }
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onSelectAuthor={openMemberProfile}
          onOpenAgencySubmit={onOpenAgencySubmit}
          onOpenListingVerifier={onOpenListingVerifier}
        />
      )}

      {(activeTab === 'topics' || activeTab === 'neighborhoods') && (
        <CommunityTopicsAndSpatialTab
          mode={activeTab}
          selectedHood={selectedHood}
          topics={topics}
          followedTopicIds={followedTopicIds}
          posts={posts}
          questions={questions}
          onToggleFollowTopic={async (topicId) => {
            if (!currentUserProfile.isAuthenticated) { showToast(COMMUNITY_AUTH_REQUIRED_FA, 'error'); return; }
            const res = await toggleTopicFollow(topicId, currentUser);
            if (res.ok && res.data?.topics) setTopics(res.data.topics);
            else if (res.errorFa) showToast(res.errorFa, 'error');
          }}
          onSelectAuthor={openMemberProfile}
          onOpenHoodMarket={() => onNavigateView('intelligence', 'overview')}
        />
      )}

      {activeTab === 'research_proposals' && (
        <CommunityResearchProposalsTab
          defaultHoodName={selectedHood.name}
          proposals={researchProposals}
          currentUserId={currentUserProfile.userId}
          onSubmitProposal={async (input) => {
            if (!currentUserProfile.isAuthenticated) return requireAuthResult();
            const res = await createResearchProposal({ ...input, linkedKnowledgeTab: 'reports' }, currentUser);
            if (res.ok && res.data) setResearchProposals((prev) => [res.data!, ...prev]);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onVoteProposal={async (id) => {
            if (!currentUserProfile.isAuthenticated) { showToast(COMMUNITY_AUTH_REQUIRED_FA, 'error'); return; }
            const res = await voteResearchProposal(id, currentUser);
            if (res.ok && res.data) setResearchProposals((prev) => prev.map((r) => (r.id === id ? res.data! : r)));
            else if (res.errorFa) showToast(res.errorFa, 'error');
          }}
          onNavigateView={onNavigateView}
        />
      )}

      {(activeTab === 'members' || activeTab === 'guidelines') && (
        <CommunityMembersAndGuidelinesTab
          mode={activeTab}
          members={members}
          selectedUsername={selectedUsername}
          onSelectUsername={setSelectedUsername}
          currentUser={currentUser}
          onNavigateToContribution={(targetTab) => selectCommunityTab(targetTab)}
        />
      )}
    </div>
  );
};
