/** @file src/features/community/components/CommunityMembersAndGuidelinesTab.tsx — Server-Backed Public Profiles, Contribution Timeline, User Follow Graph & Policy Guidelines (RT-SOCIAL-IMPL-008 & RT-SOCIAL-IMPL-009) */
import React, { useMemo } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { ArrowRight, Award, BadgeCheck, BookOpen, RefreshCw, ShieldCheck, UserCheck, UserPlus } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { useCommunityProfile } from '../hooks/useCommunityProfile';
import { CommunityProfileTimeline } from './CommunityProfileTimeline';
import {
  ABUSE_REASON_LABELS_FA,
  REPUTATION_AXIS_LABELS_FA,
  type CommunityHubTabId,
  type CommunityProfile,
  type ProfileContributionItem,
  type ReputationAxis,
} from '../types/community.types';

interface Props {
  mode: 'members' | 'guidelines';
  members: CommunityProfile[];
  selectedUsername: string | null;
  onSelectUsername: (username: string | null) => void;
  currentUser?: User | null;
  onNavigateToContribution?: (tab: CommunityHubTabId, item: ProfileContributionItem) => void;
}

const AXES_ORDER: ReputationAxis[] = ['data', 'community', 'research', 'sources', 'professional'];

export const CommunityMembersAndGuidelinesTab: React.FC<Props> = ({
  mode,
  members,
  selectedUsername,
  onSelectUsername,
  currentUser = null,
  onNavigateToContribution,
}) => {
  const effectiveUsername = useMemo(
    () => selectedUsername || members[0]?.username || null,
    [selectedUsername, members],
  );

  const fallbackMember = useMemo(
    () => (effectiveUsername ? members.find((m) => m.username.toLowerCase() === effectiveUsername.toLowerCase()) || null : null),
    [members, effectiveUsername],
  );

  const {
    profile: serverProfile,
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
  } = useCommunityProfile({
    username: mode === 'members' ? effectiveUsername : null,
    fallbackProfile: fallbackMember,
    currentUser,
  });

  const activeProfile = serverProfile;
  const isOwnProfile = Boolean(currentUser?.uid && activeProfile?.userId && currentUser.uid === activeProfile.userId);

  if (mode === 'guidelines') {
    const reasons = Object.values(ABUSE_REASON_LABELS_FA);
    return (
      <div className="space-y-4 text-xs" data-testid="community-guidelines-tab">
        <section className="p-5 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-3">
          <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>آیین‌نامه رفتار، حریم خصوصی، تخلفات ۱۰گانه و حق اعتراض</span>
          </h2>
          <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] leading-relaxed">
            انتقاد مستند درباره کیفیت زیست محله، فشار آب، سروصدا، قیمت غیرمنطقی آگهی‌ها یا کیفیت ساخت‌وساز کاملاً مجاز است. آنچه محدود می‌شود تخریب شخصی، تبلیغات پنهان، قیمت‌سازی هماهنگ و افشای اطلاعات خصوصی افراد است.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {reasons.map((label, idx) => (
              <div key={label} className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] tabular-nums">
                {toPersianNum(idx + 1)}. {label}
              </div>
            ))}
          </div>
        </section>

        <section className="p-5 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">فرآیند اعتراض و بازبینی تصمیم ناظر</h3>
          <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] leading-relaxed">
            هر کاربر می‌تواند نسبت به تصمیم مخفی‌سازی یا قفل محتوای خود از مسیر «حساب کاربری / جامعه من» درخواست بازبینی ثبت کند. تمامی تصمیمات ممیزی و تغییر وضعیت نشان‌ها با تاریخ و دلیل در دفتر حسابرسی مرکز حاکمیت ثبت می‌شوند.
          </p>
        </section>
      </div>
    );
  }

  const handleSelectContribution = (item: ProfileContributionItem) => {
    if (!onNavigateToContribution) return;
    if (item.kind === 'question') onNavigateToContribution('questions', item);
    else if (item.kind === 'correction') onNavigateToContribution('data_contribution', item);
    else if (item.kind === 'research_proposal') onNavigateToContribution('research_proposals', item);
    else onNavigateToContribution('discussions', item);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs items-start" data-testid="community-members-tab">
      <div className="lg:col-span-5 space-y-2.5" data-testid="community-members-list">
        {members.map((m) => (
          <button
            key={m.userId}
            type="button"
            data-testid={`community-member-card-${m.username}`}
            onClick={() => onSelectUsername(m.username)}
            className={`w-full p-3.5 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border text-start space-y-1.5 cursor-pointer transition ${
              effectiveUsername?.toLowerCase() === m.username.toLowerCase()
                ? 'border-[var(--color-brand-600)]'
                : 'border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-[var(--color-text-primary)] dark:text-white">{m.displayNameFa}</span>
              <span className="text-xs font-mono text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">@{m.username}</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] line-clamp-2">{m.bioFa}</p>
            {m.verifiedCredentialFa && (
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5 shrink-0" /><span>{m.verifiedCredentialFa}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      <section
        className="lg:col-span-7 p-5 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-4"
        data-testid="community-profile-detail"
      >
        {selectedUsername && (
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              data-testid="community-profile-back-btn"
              onClick={() => onSelectUsername(null)}
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>بازگشت به فهرست اعضا</span>
            </button>
          </div>
        )}

        {profileLoading && !activeProfile && (
          <div
            data-testid="community-profile-loading"
            className="p-6 text-center text-xs font-bold text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]"
          >
            در حال دریافت نمایه کاربر از سرور...
          </div>
        )}

        {profileErrorFa && !profileLoading && (
          <div
            data-testid="community-profile-error"
            role="alert"
            className="p-4 rounded-[11px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 text-rose-900 dark:text-rose-200"
          >
            <div className="font-bold">{profileErrorFa}</div>
            <button
              type="button"
              data-testid="community-profile-retry-btn"
              onClick={reloadProfile}
              className="px-3 py-1.5 rounded-[8px] bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد</span>
            </button>
          </div>
        )}

        {activeProfile && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] pb-3">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
                  <span data-testid="community-profile-display-name">{activeProfile.displayNameFa}</span>
                  {activeProfile.identityStatus === 'verified_phone' && <BadgeCheck className="w-4 h-4 text-sky-600" />}
                </h2>
                <div className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                  @{activeProfile.username} · عضویت از {activeProfile.memberSinceFa} · نمایه عمومی (بدون اطلاعات تماس)
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-bold text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)] tabular-nums">
                  <span data-testid="community-profile-followers-count">
                    {toPersianNum(Number(activeProfile.followersCount ?? 0))} دنبال‌کننده
                  </span>
                  <span data-testid="community-profile-following-count">
                    {toPersianNum(Number(activeProfile.followingCount ?? 0))} دنبال‌شونده
                  </span>
                </div>
              </div>

              {currentUser?.uid && !isOwnProfile && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    data-testid="community-profile-follow-btn"
                    disabled={followPending}
                    onClick={toggleUserFollow}
                    className={`px-3.5 py-1.5 rounded-[9px] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 ${
                      isFollowing
                        ? 'bg-slate-100 dark:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] dark:text-white border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]'
                        : 'bg-[var(--color-brand-600)] text-white'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>لغو دنبال‌کردن</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>دنبال‌کردن</span>
                      </>
                    )}
                  </button>
                  {followErrorFa && (
                    <span
                      data-testid="community-profile-follow-error"
                      role="alert"
                      className="text-xs font-bold text-rose-700 dark:text-rose-300"
                    >
                      {followErrorFa}
                    </span>
                  )}
                </div>
              )}
            </div>

            <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] leading-relaxed">{activeProfile.bioFa}</p>

            <div className="space-y-2">
              <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white">تفکیک ۵ محور اعتبار (بدون ادغام در یک نمره ساختگی)</h3>
              <div className="space-y-2">
                {AXES_ORDER.map((axis) => {
                  const val = activeProfile.reputation[axis] ?? 0;
                  const widthPct = Math.min(100, val);
                  return (
                    <div key={axis} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] font-medium">{REPUTATION_AXIS_LABELS_FA[axis]}</span>
                        <span className="font-bold tabular-nums text-[var(--color-text-primary)] dark:text-white">{toPersianNum(val)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[var(--color-bg-muted)] overflow-hidden">
                        <div className="h-full bg-[var(--color-brand-600)]" style={{ width: `${widthPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {activeProfile.badges.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]" data-testid="community-profile-badges">
                <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white">نشان‌های معتبر و دارای تاریخ انقضا</h3>
                <div className="divide-y divide-[var(--color-border-subtle)] dark:divide-[var(--color-border-subtle)]">
                  {activeProfile.badges.map((bdg) => (
                    <div key={bdg.id} className="py-2 first:pt-0 last:pb-0 space-y-0.5 text-xs">
                      <div className="font-bold text-[var(--color-brand-700)] dark:text-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" /><span>{bdg.titleFa}</span>
                      </div>
                      <div className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                        دامنه: {bdg.scopeFa} · مرجع: {bdg.authorityFa} · ممیزی: {bdg.reviewedAtFa}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CommunityProfileTimeline
              activeKind={activeKind}
              onSelectKind={setActiveKind}
              items={contributions}
              contributionsVisible={contributionsVisible}
              loading={contributionsLoading}
              loadingMore={contributionsLoadingMore}
              errorFa={contributionsErrorFa}
              hasMore={hasMoreContributions}
              onLoadMore={loadMoreContributions}
              onSelectContribution={onNavigateToContribution ? handleSelectContribution : undefined}
            />
          </>
        )}
      </section>
    </div>
  );
};
