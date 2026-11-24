/** @file src/features/community/components/CommunityQuestionsTab.tsx — Stage 25 Structured Q&A Workflow, Duplicate Hints & 4 Answer Markers */
import React, { useMemo, useState } from 'react';
import { Award, BookCheck, CheckCircle2, HelpCircle, ShieldCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { findSimilarQuestionTitles } from '../services/communityTrustService';
import type { CommunityQuestionItem, QuestionWorkflowStatus } from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  selectedHood: EvaluatedNeighborhood;
  questions: CommunityQuestionItem[];
  currentUserId: string;
  onSubmitQuestion: (input: { titleFa: string; bodyFa: string; topicId: string }) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onSubmitAnswer: (questionId: string, bodyFa: string, sourceReferenceFa?: string) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onToggleAskerSelected: (questionId: string, answerId: string) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onSelectAuthor: (username: string) => void;
}

const Q_STATUS_FA: Record<QuestionWorkflowStatus, string> = {
  open: 'باز (در انتظار پاسخ)',
  answered: 'دارای پاسخ',
  resolved: 'حل‌شده با پاسخ منتخب',
  needs_clarification: 'نیازمند شفاف‌سازی',
  under_review: 'در حال بررسی',
  closed: 'بسته‌شده',
  archived: 'آرشیوشده',
};

export const CommunityQuestionsTab: React.FC<Props> = ({
  selectedHood,
  questions,
  currentUserId,
  onSubmitQuestion,
  onSubmitAnswer,
  onToggleAskerSelected,
  onSelectAuthor,
}) => {
  const [titleFa, setTitleFa] = useState('');
  const [bodyFa, setBodyFa] = useState('');
  const [topicId, setTopicId] = useState('topic-legal-contracts');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, { body: string; source: string }>>({});
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [submittingAnswerId, setSubmittingAnswerId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const similarSuggestions = useMemo(() => findSimilarQuestionTitles(titleFa, questions), [titleFa, questions]);

  const filteredQuestions = useMemo(
    () =>
      questions.filter((q) => {
        if (statusFilter === 'open') return q.status === 'open' || q.answers.length === 0;
        if (statusFilter === 'resolved') return q.status === 'resolved' || q.answers.some((a) => a.markers.isAskerSelected);
        return true;
      }),
    [questions, statusFilter],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingQuestion) return;
    setSubmittingQuestion(true);
    try {
      const res = await onSubmitQuestion({ titleFa, bodyFa, topicId });
      if (res.ok) {
        setTitleFa('');
        setBodyFa('');
        setFeedback({ ok: true, msg: 'پرسش شما با ساختار استاندارد ثبت شد و آماده دریافت پاسخ‌های مستند است.' });
      } else {
        setFeedback({ ok: false, msg: res.errorFa || 'خطا در ثبت پرسش' });
      }
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleAnswerSubmit = async (questionId: string) => {
    if (submittingAnswerId === questionId) return;
    const current = answerDrafts[questionId] || { body: '', source: '' };
    setSubmittingAnswerId(questionId);
    try {
      const res = await onSubmitAnswer(questionId, current.body, current.source);
      if (res.ok) {
        setAnswerDrafts((prev) => ({ ...prev, [questionId]: { body: '', source: '' } }));
      } else {
        setFeedback({ ok: false, msg: res.errorFa || 'خطا' });
      }
    } finally {
      setSubmittingAnswerId(null);
    }
  };

  return (
    <div className="space-y-4 text-xs" data-testid="community-questions-tab">
      <form onSubmit={handleCreate} className="p-4 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>طرح پرسش تخصصی (حقوقی، شهرسازی، قیمت‌گذاری و محله {selectedHood.name})</span>
          </h2>
          <select aria-label="حوزه پرسش" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="p-1.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold">
            <option value="topic-legal-contracts">قراردادها و مسائل حقوقی</option>
            <option value="topic-zoning-urban">شهرسازی و ضوابط تراکم</option>
            <option value="topic-valuation">ارزش‌گذاری و قدرالسهم</option>
            <option value="topic-finance-loans">تأمین مالی و وام مسکن</option>
          </select>
        </div>

        <input
          type="text"
          aria-label="عنوان پرسش"
          value={titleFa}
          onChange={(e) => { setTitleFa(e.target.value); if (feedback) setFeedback(null); }}
          placeholder="سؤال دقیق خود را در یک جمله روشن بنویسید..."
          className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-primary)] dark:text-slate-100"
        />

        {similarSuggestions.length > 0 && (
          <div data-testid="similar-questions-hint" className="p-2.5 rounded-[9px] bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 space-y-1">
            <span className="font-bold text-sky-900 dark:text-sky-200 block">پرسش‌های مشابه موجود (صرفاً جهت راهنمایی — مانع ثبت نمی‌شود):</span>
            {similarSuggestions.map((s) => (
              <div key={s.id} className="text-xs text-sky-800 dark:text-sky-300">· {s.titleFa}</div>
            ))}
          </div>
        )}

        <textarea
          rows={2}
          aria-label="شرح کامل مسئله"
          value={bodyFa}
          onChange={(e) => { setBodyFa(e.target.value); if (feedback) setFeedback(null); }}
          placeholder="شرایط ملک، متن مبهم قرارداد یا متغیرهای کلیدی را بدون درج نام یا شماره تماس بنویسید..."
          className="w-full p-2.5 rounded-[8px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        {feedback && (
          <div role={feedback.ok ? 'status' : 'alert'} className={`p-2 rounded-[8px] font-bold ${feedback.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'}`}>
            {feedback.msg}
          </div>
        )}
        <button type="submit" disabled={submittingQuestion} data-testid="submit-question-btn" className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer disabled:opacity-50">
          {submittingQuestion ? 'در حال ثبت...' : 'ثبت پرسش تخصصی'}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--color-text-muted)] tabular-nums">{toPersianNum(filteredQuestions.length)} پرسش ساختاریافته</span>
        <div className="inline-flex items-center gap-1 p-1 bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] rounded-lg">
          {([
            { id: 'all', label: 'همه' },
            { id: 'open', label: 'بی‌پاسخ / باز' },
            { id: 'resolved', label: 'حل‌شده' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`min-h-[40px] md:min-h-[32px] px-3 py-1 rounded-md font-bold cursor-pointer transition ${
                statusFilter === f.id
                  ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredQuestions.map((q) => {
          const isAsker = q.ownerUserId === currentUserId;
          const draft = answerDrafts[q.id] || { body: '', source: '' };
          return (
            <article key={q.id} className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                <span>محله {q.neighborhoodNameFa} · {q.createdAtFa}</span>
                <span className="font-bold text-[var(--color-brand-fg)]">{Q_STATUS_FA[q.status]}</span>
              </div>
              <h3 className="font-bold text-sm text-[var(--color-text-primary)]">{q.titleFa}</h3>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">{q.bodyFa}</p>
              <CommunityAuthorBadges profile={q.authorProfile} onSelectUsername={onSelectAuthor} />

              {q.answers.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2">
                  {q.answers.map((ans) => (
                    <div key={ans.id} className="p-3 rounded-[9px] bg-[var(--color-bg-subtle)] space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
                        {ans.markers.isAskerSelected && (
                          <span className="inline-flex items-center gap-1 text-[var(--color-brand-fg)]"><CheckCircle2 className="w-3.5 h-3.5" />پاسخ منتخب پرسش‌کننده</span>
                        )}
                        {ans.markers.hasCredibleSource && (
                          <span className="inline-flex items-center gap-1 text-sky-800 dark:text-sky-300"><BookCheck className="w-3.5 h-3.5" />دارای منبع معتبر</span>
                        )}
                        {ans.markers.isExpertReviewed && (
                          <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300"><Award className="w-3.5 h-3.5" />بررسی‌شده توسط متخصص</span>
                        )}
                        {ans.markers.isOfficiallyVerified && (
                          <span className="inline-flex items-center gap-1 text-[var(--color-brand-fg)]"><ShieldCheck className="w-3.5 h-3.5" />تأییدشده رسمی رادار</span>
                        )}
                      </div>
                      <p className="text-[var(--color-text-primary)] leading-relaxed">{ans.bodyFa}</p>
                      {ans.sourceReferenceFa && (
                        <div className="text-xs text-[var(--color-text-muted)]">منبع استناد: {ans.sourceReferenceFa}</div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <CommunityAuthorBadges profile={ans.authorProfile} onSelectUsername={onSelectAuthor} />
                        {isAsker && (
                          <button type="button" onClick={() => onToggleAskerSelected(q.id, ans.id)} className="min-h-[36px] text-xs font-bold text-[var(--color-brand-fg)] hover:underline cursor-pointer">
                            {ans.markers.isAskerSelected ? 'لغو انتخاب پاسخ' : 'انتخاب به‌عنوان پاسخ منتخب'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                <input
                  type="text"
                  aria-label={`پاسخ به پرسش ${q.titleFa}`}
                  value={draft.body}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnswerDrafts((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || { body: '', source: '' }), body: val } }));
                    if (feedback) setFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAnswerSubmit(q.id);
                    }
                  }}
                  placeholder="پاسخ فنی یا حقوقی مستند بنویسید..."
                  className="sm:col-span-7 min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                />
                <input
                  type="text"
                  aria-label="منبع قانونی یا مرجع"
                  value={draft.source}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnswerDrafts((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || { body: '', source: '' }), source: val } }));
                    if (feedback) setFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAnswerSubmit(q.id);
                    }
                  }}
                  placeholder="مرجع یا ماده قانونی (اختیاری)"
                  className="sm:col-span-3 min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                />
                <button
                  type="button"
                  disabled={submittingAnswerId === q.id}
                  onClick={() => { void handleAnswerSubmit(q.id); }}
                  className="sm:col-span-2 min-h-[44px] md:min-h-[38px] px-3 py-2 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  ارسال پاسخ
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
