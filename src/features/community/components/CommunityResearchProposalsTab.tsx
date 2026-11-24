/** @file src/features/community/components/CommunityResearchProposalsTab.tsx — Stage 25 Community Research Topic Proposals Linked to Stage 24 Knowledge Center */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpenCheck, Lightbulb, ThumbsUp } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { ResearchTopicProposal } from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  defaultHoodName: string;
  proposals: ResearchTopicProposal[];
  currentUserId: string;
  onSubmitProposal: (input: { titleFa: string; questionFa: string; neighborhoodNameFa: string }) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onVoteProposal: (proposalId: string) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const CommunityResearchProposalsTab: React.FC<Props> = ({
  defaultHoodName,
  proposals,
  currentUserId,
  onSubmitProposal,
  onVoteProposal,
  onNavigateView,
}) => {
  const [titleFa, setTitleFa] = useState('');
  const [questionFa, setQuestionFa] = useState('');
  const [hoodNameFa, setHoodNameFa] = useState(defaultHoodName);
  const [hoodTouched, setHoodTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!hoodTouched) {
      setHoodNameFa(defaultHoodName);
    }
  }, [defaultHoodName, hoodTouched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await onSubmitProposal({ titleFa, questionFa, neighborhoodNameFa: hoodNameFa });
      if (res.ok) {
        setTitleFa('');
        setQuestionFa('');
        setHoodTouched(false);
        setHoodNameFa(defaultHoodName);
        setFeedback({ ok: true, msg: 'پیشنهاد پژوهش شما ثبت شد و برای اولویت‌بندی تحریریه پایگاه دانش نمایش داده می‌شود.' });
      } else {
        setFeedback({ ok: false, msg: res.errorFa || 'خطا' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs" data-testid="community-research-proposals-tab">
      <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <BookOpenCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>پیوند با پایگاه دانش و پژوهش‌های رادار تهران</span>
          </strong>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">پرسش‌های تحلیلی پررأی پس از بررسی متدولوژیک به گزارش‌های مرحله ۲۴ تبدیل می‌شوند.</p>
        </div>
        <button type="button" onClick={() => onNavigateView('knowledge', 'reports')} className="px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer">
          <span>مطالعه پژوهش‌های منتشرشده</span><ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2.5">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
          <Lightbulb className="w-4 h-4 text-amber-600" />
          <span>پیشنهاد موضوع پژوهش جدید</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="text" aria-label="عنوان پژوهش پیشنهادی" value={titleFa} onChange={(e) => { setTitleFa(e.target.value); if (feedback) setFeedback(null); }} placeholder="عنوان پژوهش (مثلاً اثر خط مترو بر اجاره...)" className="sm:col-span-2 p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" />
          <input type="text" aria-label="محدوده جغرافیایی" value={hoodNameFa} onChange={(e) => { setHoodNameFa(e.target.value); setHoodTouched(true); if (feedback) setFeedback(null); }} placeholder="محله یا منطقه" className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" />
        </div>
        <textarea rows={2} aria-label="سؤال پژوهشی" value={questionFa} onChange={(e) => { setQuestionFa(e.target.value); if (feedback) setFeedback(null); }} placeholder="سؤال دقیق تحلیلی و داده‌ای که می‌خواهید بررسی شود..." className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700" />
        {feedback && (
          <div role={feedback.ok ? 'status' : 'alert'} className={`p-2 rounded-[8px] font-bold ${feedback.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200'}`}>
            {feedback.msg}
          </div>
        )}
        <button type="submit" disabled={submitting} data-testid="submit-research-proposal-btn" className="px-4 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50">
          {submitting ? 'در حال ثبت...' : 'ثبت پیشنهاد پژوهش'}
        </button>
      </form>

      <div className="space-y-2.5" data-testid="research-proposals-list">
        {proposals.map((prop) => {
          const voted = prop.voterIds.includes(currentUserId);
          return (
            <article key={prop.id} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#EAF3F0] dark:bg-emerald-950/50 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold">{prop.neighborhoodNameFa}</span>
                  <span className="text-[var(--color-text-muted)]">{prop.status === 'queued_for_research' ? 'در صف پژوهش تحریریه' : 'پیشنهاد باز جمعی'}</span>
                </div>
                <h3 className="font-bold text-sm text-[var(--color-text-primary)] dark:text-white">{prop.titleFa}</h3>
                <p className="text-[var(--color-text-secondary)] dark:text-slate-300 leading-relaxed">{prop.questionFa}</p>
                <CommunityAuthorBadges profile={prop.authorProfile} />
              </div>
              <button
                type="button"
                data-testid={`vote-research-${prop.id}`}
                onClick={() => onVoteProposal(prop.id)}
                className={`px-3 py-2 rounded-[9px] font-bold inline-flex items-center gap-1.5 cursor-pointer border tabular-nums shrink-0 ${
                  voted ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-600)]' : 'bg-white dark:bg-slate-800 border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-primary)] dark:text-white'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" /><span>حمایت ({toPersianNum(prop.votesCount)})</span>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
};
