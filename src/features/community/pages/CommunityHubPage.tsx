/** @file src/features/community/pages/CommunityHubPage.tsx — Stage 25 Specialized & Spatial Community Platform */
import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ContributionsSubTabId, ModuleSubTabId } from '../../../navigation/registry/route.types';
import {
  buildUserTrustProfile, loadCommunityPosts, loadDataCorrectionProposals, loadResearchTopicProposals,
  replyToCommunityPost, submitCommunityAbuseReport, submitCommunityPost, submitDataCorrectionProposal,
  submitResearchTopicProposal, trackCommunityEvent, voteResearchTopicProposal, withdrawDataCorrectionProposal,
} from '../services/communityTrustService';
import {
  editCommunityPost, loadCommunityQuestions, loadCommunityTopics, loadFollowedTopicIds, loadPublicCommunityMembers,
  submitCommunityQuestion, submitQuestionAnswer, toggleAskerSelectedAnswer, toggleFollowTopic, togglePostReaction, updatePostGovernanceState,
} from '../services/communityEngagementService';
import type { CommunityAbuseReason, CommunityHubTabId } from '../types/community.types';
import { CommunityTrustBanner } from '../components/CommunityTrustBanner';
import { CommunityHomeOverview } from '../components/CommunityHomeOverview';
import { CommunityDataCorrectionsTab } from '../components/CommunityDataCorrectionsTab';
import { CommunityDiscussionsTab } from '../components/CommunityDiscussionsTab';
import { CommunityQuestionsTab } from '../components/CommunityQuestionsTab';
import { CommunityTopicsAndSpatialTab } from '../components/CommunityTopicsAndSpatialTab';
import { CommunityMembersAndGuidelinesTab } from '../components/CommunityMembersAndGuidelinesTab';
import { CommunityResearchProposalsTab } from '../components/CommunityResearchProposalsTab';

export interface CommunityHubPageProps {
  activeSubTab?: ContributionsSubTabId; selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenAgencySubmit: () => void; onOpenResidentVoteTab: () => void; onOpenListingVerifier: () => void;
}

const HUB_TABS: Array<{ id: CommunityHubTabId; labelFa: string }> = [
  { id: 'overview', labelFa: 'خانه جامعه' }, { id: 'discussions', labelFa: 'گفت‌وگوها' },
  { id: 'questions', labelFa: 'پرسش و پاسخ' }, { id: 'data_contribution', labelFa: 'اصلاح داده' },
  { id: 'topics', labelFa: 'موضوعات' }, { id: 'neighborhoods', labelFa: 'محله و بازار' },
  { id: 'research_proposals', labelFa: 'پیشنهاد پژوهش' }, { id: 'members', labelFa: 'اعضا' }, { id: 'guidelines', labelFa: 'آیین‌نامه' },
];

function mapSubTabToHubTab(subTab?: ContributionsSubTabId): CommunityHubTabId {
  if (subTab === 'discussions' || subTab === 'points') return 'discussions';
  if (subTab === 'questions') return 'questions';
  if (subTab === 'submit' || subTab === 'contributions' || subTab === 'reports' || subTab === 'verify') return 'data_contribution';
  if (subTab === 'topics') return 'topics';
  if (subTab === 'neighborhoods' || subTab === 'market') return 'neighborhoods';
  if (subTab === 'research') return 'research_proposals';
  if (subTab === 'members') return 'members';
  if (subTab === 'guidelines' || subTab === 'help') return 'guidelines';
  return 'overview';
}

export const CommunityHubPage: React.FC<CommunityHubPageProps> = ({
  activeSubTab, selectedHood, evaluatedNeighborhoods = [], onNavigateView, onOpenAgencySubmit, onOpenResidentVoteTab, onOpenListingVerifier,
}) => {
  const [activeTab, setActiveTab] = useState<CommunityHubTabId>(() => mapSubTabToHubTab(activeSubTab));
  const [corrections, setCorrections] = useState(() => loadDataCorrectionProposals());
  const [posts, setPosts] = useState(() => loadCommunityPosts());
  const [questions, setQuestions] = useState(() => loadCommunityQuestions());
  const [researchProposals, setResearchProposals] = useState(() => loadResearchTopicProposals());
  const [followedTopicIds, setFollowedTopicIds] = useState(() => loadFollowedTopicIds());
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [toastFa, setToastFa] = useState<string | null>(null);

  useEffect(() => { if (activeSubTab) setActiveTab(mapSubTabToHubTab(activeSubTab)); }, [activeSubTab]);
  const topics = useMemo(() => loadCommunityTopics(), []);
  const members = useMemo(() => loadPublicCommunityMembers(true), [followedTopicIds]);
  const currentUserProfile = useMemo(
    () => buildUserTrustProfile({
      userId: 'current_local_user', username: 'active_neighbor', displayNameFa: 'کاربر فعال محله',
      isPhoneVerified: true, participationScore: 25 + corrections.filter((c) => c.ownerUserId === 'current_local_user').length * 5, verifiedCredentialFa: null,
    }),
    [corrections],
  );
  const openMemberProfile = (username: string) => { setSelectedUsername(username); setActiveTab('members'); };

  return (
    <div data-testid="product-contributions-view" className="w-full max-w-6xl mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      <div className="border-b border-[#DCE3DF] dark:border-slate-800 pb-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[12px] font-bold text-[#176B63] dark:text-emerald-400 flex items-center gap-1.5 mb-1">
              <MessageSquarePlus className="w-4 h-4 shrink-0" />
              <span>جامعه کاربران، پرسش‌وپاسخ تخصصی و مشارکت مکانی</span>
            </span>
            <h1 className="text-2xl font-black text-[#182522] dark:text-white">
              جامعه تخصصی رادار تهران · محله {selectedHood.name}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('userspace', 'community')}
            className="px-3 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-xs font-bold text-[#34433E] dark:text-slate-200 hover:border-[#176B63] cursor-pointer whitespace-nowrap"
          >
            تنظیمات جامعه من
          </button>
        </div>

        <nav aria-label="بخش‌های جامعه کاربران" className="flex flex-wrap gap-1.5 text-xs">
          {HUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`community-tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setToastFa(null);
                trackCommunityEvent('community_tab_switch', { tab: tab.id });
              }}
              className={`px-3 py-1.5 rounded-[9px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition ${
                activeTab === tab.id
                  ? 'bg-[#176B63] text-white'
                  : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200'
              }`}
            >
              {tab.labelFa}
            </button>
          ))}
        </nav>
      </div>

      <CommunityTrustBanner />

      {toastFa && (
        <div className="p-3 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200">
          {toastFa}
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
          onSwitchTab={(t) => { setActiveTab(t); setToastFa(null); }}
          onSelectAuthor={openMemberProfile}
        />
      )}

      {(activeTab === 'discussions' || activeTab === 'social_discussion') && (
        <CommunityDiscussionsTab
          selectedHood={selectedHood}
          posts={posts}
          currentUserId={currentUserProfile.userId}
          onSubmitPost={(input) => {
            const res = submitCommunityPost({ track: 'social_discussion', neighborhoodId: selectedHood.id, neighborhoodNameFa: selectedHood.name, topicId: input.topicId, titleFa: input.titleFa, bodyFa: input.bodyFa, authorProfile: currentUserProfile });
            if (res.ok) setPosts(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onReplyPost={(postId, bodyFa, parentReplyId) => {
            const res = replyToCommunityPost({ postId, parentReplyId, bodyFa, authorProfile: currentUserProfile });
            if (res.ok) setPosts(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onEditPost={(postId, titleFa, bodyFa) => {
            const res = editCommunityPost({ postId, actorUserId: currentUserProfile.userId, titleFa, bodyFa });
            if (res.ok) setPosts(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onToggleReaction={(postId, reaction) => setPosts(togglePostReaction(postId, currentUserProfile.userId, reaction))}
          onToggleFollow={(postId) => setPosts(updatePostGovernanceState(postId, { toggleFollowUserId: currentUserProfile.userId }))}
          onReportAbuse={(postId, reason: CommunityAbuseReason, detailsFa: string) => {
            submitCommunityAbuseReport({ targetType: 'discussion_post', targetId: postId, reason, detailsFa, reporterUserId: currentUserProfile.userId });
            setToastFa('گزارش تخلف به صف نظارت ادمین ارسال شد.');
          }}
          onSelectAuthor={openMemberProfile}
          onOpenResidentVoteTab={onOpenResidentVoteTab}
        />
      )}

      {(activeTab === 'questions' || activeTab === 'expert_qa') && (
        <CommunityQuestionsTab
          selectedHood={selectedHood}
          questions={questions}
          currentUserId={currentUserProfile.userId}
          onSubmitQuestion={(input) => {
            const res = submitCommunityQuestion({ ...input, neighborhoodId: selectedHood.id, neighborhoodNameFa: selectedHood.name, authorProfile: currentUserProfile });
            if (res.ok) setQuestions(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onSubmitAnswer={(qId, bodyFa, sourceReferenceFa) => {
            const res = submitQuestionAnswer({ questionId: qId, bodyFa, sourceReferenceFa, authorProfile: currentUserProfile });
            if (res.ok) setQuestions(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onToggleAskerSelected={(qId, aId) => {
            const res = toggleAskerSelectedAnswer(qId, aId, currentUserProfile.userId);
            if (res.ok) setQuestions(res.items);
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
          onSubmitProposal={(input) => {
            const res = submitDataCorrectionProposal({ ...input, authorProfile: currentUserProfile });
            if (res.ok) setCorrections(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onWithdrawProposal={(id) => {
            const res = withdrawDataCorrectionProposal(id, currentUserProfile.userId);
            if (res.ok) { setCorrections(res.items); setToastFa('پیشنهاد از صف بررسی خارج شد.'); }
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
          onToggleFollowTopic={(topicId) => setFollowedTopicIds(toggleFollowTopic(topicId))}
          onSelectAuthor={openMemberProfile}
          onOpenHoodMarket={() => onNavigateView('intelligence', 'overview')}
        />
      )}

      {activeTab === 'research_proposals' && (
        <CommunityResearchProposalsTab
          defaultHoodName={selectedHood.name}
          proposals={researchProposals}
          currentUserId={currentUserProfile.userId}
          onSubmitProposal={(input) => {
            const res = submitResearchTopicProposal({ ...input, authorProfile: currentUserProfile });
            if (res.ok) setResearchProposals(res.items);
            return { ok: res.ok, errorFa: res.errorFa };
          }}
          onVoteProposal={(id) => setResearchProposals(voteResearchTopicProposal(id, currentUserProfile.userId))}
          onNavigateView={onNavigateView}
        />
      )}

      {(activeTab === 'members' || activeTab === 'guidelines') && (
        <CommunityMembersAndGuidelinesTab
          mode={activeTab}
          members={members}
          selectedUsername={selectedUsername}
          onSelectUsername={setSelectedUsername}
        />
      )}
    </div>
  );
};
