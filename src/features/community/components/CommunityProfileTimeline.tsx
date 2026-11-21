/** @file src/features/community/components/CommunityProfileTimeline.tsx — Public Profile Contribution Timeline with Kind Filter & Cursor Pagination (RT-SOCIAL-IMPL-008) */
import React from 'react';
import { ExternalLink, FileText, HelpCircle, MessageSquare, Microscope, Wrench } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { ProfileContributionItem, ProfileContributionKind } from '../types/community.types';

export interface CommunityProfileTimelineProps {
  activeKind: 'all' | ProfileContributionKind;
  onSelectKind: (kind: 'all' | ProfileContributionKind) => void;
  items: ProfileContributionItem[];
  contributionsVisible: boolean;
  loading: boolean;
  loadingMore: boolean;
  errorFa: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectContribution?: (item: ProfileContributionItem) => void;
}

const KIND_TABS: Array<{ id: 'all' | ProfileContributionKind; labelFa: string }> = [
  { id: 'all', labelFa: 'همه مشارکت‌ها' },
  { id: 'discussion', labelFa: 'گفت‌وگو' },
  { id: 'question', labelFa: 'پرسش' },
  { id: 'correction', labelFa: 'اصلاح داده' },
  { id: 'research_proposal', labelFa: 'پیشنهاد پژوهش' },
  { id: 'comment', labelFa: 'پاسخ و دیدگاه' },
];

const KIND_BADGE_META: Record<Exclude<ProfileContributionKind, 'all'>, { labelFa: string; className: string; Icon: React.FC<{ className?: string }> }> = {
  discussion: {
    labelFa: 'گفت‌وگو',
    className: 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    Icon: MessageSquare,
  },
  question: {
    labelFa: 'پرسش',
    className: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    Icon: HelpCircle,
  },
  correction: {
    labelFa: 'اصلاح داده تائیدشده',
    className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    Icon: Wrench,
  },
  research_proposal: {
    labelFa: 'پیشنهاد پژوهش',
    className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    Icon: Microscope,
  },
  comment: {
    labelFa: 'پاسخ و دیدگاه',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    Icon: FileText,
  },
};

export const CommunityProfileTimeline: React.FC<CommunityProfileTimelineProps> = ({
  activeKind,
  onSelectKind,
  items,
  contributionsVisible,
  loading,
  loadingMore,
  errorFa,
  hasMore,
  onLoadMore,
  onSelectContribution,
}) => {
  return (
    <div className="space-y-3 pt-3 border-t border-[var(--color-border-subtle)] dark:border-slate-800" data-testid="community-profile-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-[var(--color-text-primary)] dark:text-white">Timeline مشارکت‌های عمومی کاربر</h3>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="فیلتر نوع مشارکت">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeKind === tab.id}
              data-testid={`profile-timeline-kind-${tab.id}`}
              onClick={() => onSelectKind(tab.id)}
              className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold cursor-pointer transition ${
                activeKind === tab.id
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'bg-[#F8F9FA] dark:bg-slate-800 text-[var(--color-text-secondary)] dark:text-slate-300 hover:border-[var(--color-brand-600)]'
              }`}
            >
              {tab.labelFa}
            </button>
          ))}
        </div>
      </div>

      {!contributionsVisible && (
        <div
          data-testid="profile-timeline-hidden-privacy"
          className="p-3.5 rounded-[10px] bg-slate-50 dark:bg-slate-800/60 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[11px] text-[var(--color-text-muted)] dark:text-slate-400 font-bold"
        >
          این کاربر نمایش فهرست مشارکت‌های خود را در تنظیمات حریم خصوصی غیرفعال کرده است.
        </div>
      )}

      {contributionsVisible && errorFa && (
        <div
          data-testid="profile-timeline-error"
          role="alert"
          className="p-3 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] font-bold text-rose-800 dark:text-rose-200"
        >
          {errorFa}
        </div>
      )}

      {contributionsVisible && loading && (
        <div
          data-testid="profile-timeline-loading"
          className="p-4 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/40 text-center text-[11px] font-bold text-[var(--color-text-muted)] dark:text-slate-400"
        >
          در حال دریافت تاریخچه مشارکت‌های کاربر از سرور...
        </div>
      )}

      {contributionsVisible && !loading && !errorFa && items.length === 0 && (
        <div
          data-testid="profile-timeline-empty"
          className="p-4 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/40 text-center text-[11px] text-[var(--color-text-muted)] dark:text-slate-400"
        >
          مشارکت عمومی قابل‌نمایشی در این دسته‌بندی ثبت نشده است.
        </div>
      )}

      {contributionsVisible && items.length > 0 && (
        <div className="space-y-2.5" data-testid="profile-timeline-list">
          {items.map((item) => {
            const meta = KIND_BADGE_META[item.kind] || KIND_BADGE_META.discussion;
            const Icon = meta.Icon;
            return (
              <article
                key={`${item.kind}:${item.id}`}
                data-testid={`profile-timeline-item-${item.id}`}
                className="p-3 rounded-[11px] bg-[#F8F9FA] dark:bg-slate-800/60 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border text-[10px] font-bold ${meta.className}`}>
                    <Icon className="w-3 h-3 shrink-0" />
                    <span>{meta.labelFa}</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] dark:text-slate-400 tabular-nums">
                    {item.neighborhoodNameFa && <span>محله {item.neighborhoodNameFa}</span>}
                    {typeof item.helpfulCount === 'number' && item.helpfulCount > 0 && (
                      <span>{toPersianNum(item.helpfulCount)} مفید</span>
                    )}
                    {typeof item.replyCount === 'number' && item.replyCount > 0 && (
                      <span>{toPersianNum(item.replyCount)} پاسخ</span>
                    )}
                  </div>
                </div>

                {item.titleFa && (
                  <h4 className="font-black text-xs text-[var(--color-text-primary)] dark:text-white">{item.titleFa}</h4>
                )}

                <p className="text-[11px] text-[var(--color-text-secondary)] dark:text-slate-300 leading-relaxed">{item.excerptFa}</p>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)] dark:text-slate-400" dir="ltr">
                    {item.createdAtIso.slice(0, 10)}
                  </span>
                  {onSelectContribution && (
                    <button
                      type="button"
                      data-testid={`profile-timeline-open-${item.id}`}
                      onClick={() => onSelectContribution(item)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>مشاهده محتوای اصلی</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {contributionsVisible && hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            data-testid="profile-timeline-load-more"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="px-3.5 py-1.5 rounded-[8px] border border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-300 font-bold text-[11px] cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? 'در حال بارگذاری...' : 'بارگذاری مشارکت‌های بیشتر'}
          </button>
        </div>
      )}
    </div>
  );
};
