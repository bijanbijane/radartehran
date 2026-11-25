/** @file src/features/community/components/CommunityHomeOverview.tsx — Stage 25 Community Homepage, 4-Path Creator & Multi-Factor Feed */
import React, { useMemo } from 'react';
import { ArrowLeft, BookOpen, HelpCircle, MapPin, MessageSquare, ShieldAlert, TrendingUp } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { computeDiscussionMultiFactorRank } from '../services/communityTrustService';
import type {
  CommunityDiscussionPost,
  CommunityHubTabId,
  CommunityQuestionItem,
  DataCorrectionProposal,
  TopicItem,
} from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  selectedHood: EvaluatedNeighborhood;
  posts: CommunityDiscussionPost[];
  questions: CommunityQuestionItem[];
  corrections: DataCorrectionProposal[];
  topics: TopicItem[];
  followedTopicIds: string[];
  onSwitchTab: (tab: CommunityHubTabId) => void;
  onSelectAuthor: (username: string) => void;
}

const CREATE_PATHS: Array<{ id: CommunityHubTabId; titleFa: string; descFa: string; icon: React.ReactNode }> = [
  { id: 'discussions', titleFa: 'شروع گفت‌وگو', descFa: 'تحلیل محله، قیمت، اجاره و تجربه زیسته', icon: <MessageSquare className="w-4 h-4 text-[var(--color-brand-600)]" /> },
  { id: 'questions', titleFa: 'طرح پرسش تخصصی', descFa: 'سؤال حقوقی، شهرسازی و فنی با پاسخ مستند', icon: <HelpCircle className="w-4 h-4 text-sky-600" /> },
  { id: 'data_contribution', titleFa: 'گزارش خطای داده', descFa: 'اصلاح فاصله مترو، مرز محله و نابهنجاری آگهی', icon: <MapPin className="w-4 h-4 text-amber-600" /> },
  { id: 'research_proposals', titleFa: 'پیشنهاد پژوهش', descFa: 'طرح موضوع تحلیلی برای پایگاه دانش رادار', icon: <BookOpen className="w-4 h-4 text-emerald-700" /> },
];

export const CommunityHomeOverview: React.FC<Props> = ({
  selectedHood,
  posts,
  questions,
  corrections,
  topics,
  followedTopicIds,
  onSwitchTab,
  onSelectAuthor,
}) => {
  const rankedDiscussions = useMemo(
    () =>
      posts
        .filter((p) => p.status !== 'hidden' && p.status !== 'archived')
        .map((p) => ({ post: p, rankScore: computeDiscussionMultiFactorRank(p, selectedHood.id) }))
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, 4),
    [posts, selectedHood.id],
  );

  const openQuestions = useMemo(() => questions.filter((q) => q.status === 'open' || q.answers.length === 0).slice(0, 3), [questions]);
  const pendingCorrections = useMemo(
    () => corrections.filter((c) => !['applied', 'rejected', 'withdrawn', 'verified'].includes(c.status)).slice(0, 3),
    [corrections],
  );

  return (
    <div className="space-y-6 text-xs" data-testid="community-home-overview">
      <section className="p-5 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)] dark:text-white">شروع مشارکت هدفمند در جامعه رادار تهران</h2>
            <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] mt-0.5">
              به‌جای ارسال پیام عمومی، مسیر دقیق فعالیت خود را میان گفت‌وگو، پرسش تخصصی، اصلاح داده یا پیشنهاد پژوهش انتخاب کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSwitchTab('guidelines')}
            className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>آیین‌نامه رفتار و اعتراض</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CREATE_PATHS.map((path) => (
            <button
              key={path.id}
              type="button"
              data-testid={`create-path-${path.id}`}
              onClick={() => onSwitchTab(path.id)}
              className="p-3.5 rounded-[12px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] hover:border-[var(--color-brand-600)] text-start space-y-1.5 transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">{path.titleFa}</span>
                {path.icon}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] leading-relaxed">{path.descFa}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>گفت‌وگوهای برگزیده (رتبه‌بندی چندعاملی مرتبط با {selectedHood.name})</span>
            </h3>
            <button type="button" onClick={() => onSwitchTab('discussions')} className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer">
              <span>همه گفت‌وگوها</span><ArrowLeft className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)] dark:divide-[var(--color-border-subtle)] rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
            {rankedDiscussions.map(({ post, rankScore }) => (
              <article key={post.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                  <span>
                    محله {post.neighborhoodNameFa} · {post.createdAtFa}
                    {post.pinned ? ' · سنجاق‌شده' : ''}
                  </span>
                  <span className="tabular-nums font-medium">امتیاز ارتباط: {toPersianNum(rankScore)} · {toPersianNum(post.replies.length)} پاسخ</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSwitchTab('discussions')}
                  className="text-start font-bold text-sm text-[var(--color-text-primary)] dark:text-white hover:text-[var(--color-brand-600)] dark:hover:text-emerald-400 cursor-pointer block"
                >
                  {post.titleFa}
                </button>
                <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">{post.bodyFa}</p>
                <CommunityAuthorBadges profile={post.authorProfile} onSelectUsername={onSelectAuthor} />
              </article>
            ))}
          </div>
        </section>

        <aside className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">پرسش‌های نیازمند پاسخ تخصصی</h3>
              <button type="button" onClick={() => onSwitchTab('questions')} className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer">
                مشاهده پرسش‌ها
              </button>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)] dark:divide-[var(--color-border-subtle)]">
              {(openQuestions.length > 0 ? openQuestions : questions.slice(0, 2)).map((q) => (
                <div key={q.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <button type="button" onClick={() => onSwitchTab('questions')} className="text-start font-bold text-[var(--color-text-primary)] dark:text-white hover:text-[var(--color-brand-600)] cursor-pointer">
                    {q.titleFa}
                  </button>
                  <div className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] tabular-nums">
                    محله {q.neighborhoodNameFa} · {toPersianNum(q.answers.length)} پاسخ · {q.createdAtFa}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">اصلاحات داده در صف ممیزی</h3>
              <button type="button" onClick={() => onSwitchTab('data_contribution')} className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer">
                ثبت اصلاح داده
              </button>
            </div>
            {pendingCorrections.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">در حال حاضر گزارش در انتظاری ثبت نشده است.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)] dark:divide-[var(--color-border-subtle)]">
                {pendingCorrections.map((c) => (
                  <div key={c.id} className="py-2 first:pt-0 last:pb-0 space-y-0.5">
                    <div className="font-bold text-[var(--color-text-primary)] dark:text-white">{c.titleFa}</div>
                    <div className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">محله {c.neighborhoodNameFa} · پیشنهاد: {c.suggestedValueFa}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">موضوعات تخصصی فعال</h3>
              <button type="button" onClick={() => onSwitchTab('topics')} className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer tabular-nums">
                همه {toPersianNum(topics.length)} موضوع
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {topics.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSwitchTab('topics')}
                  className="p-2 rounded-[9px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] hover:bg-[#EAF3F0] dark:hover:bg-[var(--color-bg-elevated)] text-start cursor-pointer transition"
                >
                  <div className="font-bold text-[var(--color-text-primary)] dark:text-white truncate">{t.titleFa}</div>
                  <div className="text-xs text-[var(--color-text-muted)] tabular-nums">
                    {toPersianNum(t.activeThreadsCount)} گفتگو {followedTopicIds.includes(t.id) ? '· دنبال‌شده' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
