/** @file src/features/community/components/CommunityDataCorrectionsTab.tsx — Stage 25 Canonical Data Corrections Workflow & Offline Drafts */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MapPinPlus, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { loadDataCorrectionDraft, saveDataCorrectionDraft } from '../services/communityTrustService';
import {
  DATA_CORRECTION_CATEGORY_LABELS_FA,
  type CommunityTrustBadgeProfile,
  type DataCorrectionCategory,
  type DataCorrectionModerationStatus,
  type DataCorrectionProposal,
} from '../types/community.types';
import { CommunityAuthorBadges } from './CommunityTrustBanner';

interface Props {
  selectedHood: EvaluatedNeighborhood;
  neighborhoods: EvaluatedNeighborhood[];
  proposals: DataCorrectionProposal[];
  currentUserProfile: CommunityTrustBadgeProfile;
  onSubmitProposal: (input: {
    neighborhoodId: number;
    neighborhoodNameFa: string;
    category: DataCorrectionCategory;
    titleFa: string;
    currentValueFa?: string;
    evidenceSummaryFa: string;
    suggestedValueFa: string;
    observedDateFa?: string;
  }) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onWithdrawProposal: (proposalId: string) => Promise<{ ok: boolean; errorFa?: string }> | { ok: boolean; errorFa?: string };
  onSelectAuthor: (username: string) => void;
  onOpenAgencySubmit: () => void;
  onOpenListingVerifier: () => void;
}

const STATUS_META: Record<DataCorrectionModerationStatus, { label: string; cls: string }> = {
  draft: { label: 'پیش‌نویس محلی', cls: 'text-slate-600 dark:text-slate-400' },
  submitted: { label: 'ثبت‌شده · در انتظار اعتبارسنجی اولیه', cls: 'text-amber-700 dark:text-amber-300' },
  initial_validation: { label: 'اعتبارسنجی اولیه', cls: 'text-amber-700 dark:text-amber-300' },
  under_review: { label: 'در حال بررسی کارشناس داده', cls: 'text-sky-700 dark:text-sky-300' },
  needs_evidence: { label: 'نیازمند تکمیل شواهد', cls: 'text-amber-800 dark:text-amber-200' },
  approved: { label: 'تأیید ممیز · در انتظار اعمال نسخه پایه', cls: 'text-emerald-700 dark:text-emerald-300' },
  applied: { label: 'اعمال‌شده در داده پایه رادار', cls: 'text-emerald-800 dark:text-emerald-200' },
  verified: { label: 'تأیید و اعمال‌شده', cls: 'text-emerald-700 dark:text-emerald-300' },
  rejected: { label: 'ردشده با دلیل مستند', cls: 'text-rose-700 dark:text-rose-300' },
  withdrawn: { label: 'انصراف توسط ثبت‌کننده', cls: 'text-slate-500 dark:text-slate-400' },
  pending: { label: 'در انتظار ممیزی داده', cls: 'text-amber-700 dark:text-amber-300' },
};

export const CommunityDataCorrectionsTab: React.FC<Props> = ({
  selectedHood,
  neighborhoods,
  proposals,
  currentUserProfile,
  onSubmitProposal,
  onWithdrawProposal,
  onSelectAuthor,
  onOpenAgencySubmit,
  onOpenListingVerifier,
}) => {
  const savedDraft = loadDataCorrectionDraft();
  const [hoodId, setHoodId] = useState<number>(() => (savedDraft?.hoodId ? Number(savedDraft.hoodId) : selectedHood.id));
  const [category, setCategory] = useState<DataCorrectionCategory>(() => (savedDraft?.category as DataCorrectionCategory) || 'metro_transit');
  const [titleFa, setTitleFa] = useState(() => String(savedDraft?.titleFa || ''));
  const [currentValueFa, setCurrentValueFa] = useState(() => String(savedDraft?.currentValueFa || ''));
  const [suggestedFa, setSuggestedFa] = useState(() => String(savedDraft?.suggestedFa || ''));
  const [observedDateFa, setObservedDateFa] = useState(() => String(savedDraft?.observedDateFa || 'امروز'));
  const [evidenceFa, setEvidenceFa] = useState(() => String(savedDraft?.evidenceFa || ''));
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const hoodChoices = neighborhoods.length > 0 ? neighborhoods : [selectedHood];

  useEffect(() => {
    if (titleFa || evidenceFa || suggestedFa || currentValueFa) {
      saveDataCorrectionDraft({ hoodId, category, titleFa, currentValueFa, suggestedFa, observedDateFa, evidenceFa });
    }
  }, [hoodId, category, titleFa, currentValueFa, suggestedFa, observedDateFa, evidenceFa]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = hoodChoices.find((h) => h.id === hoodId) || selectedHood;
    const res = await onSubmitProposal({
      neighborhoodId: chosen.id,
      neighborhoodNameFa: chosen.name,
      category,
      titleFa,
      currentValueFa,
      evidenceSummaryFa: evidenceFa,
      suggestedValueFa: suggestedFa,
      observedDateFa,
    });
    if (res.ok) {
      setTitleFa('');
      setCurrentValueFa('');
      setEvidenceFa('');
      setSuggestedFa('');
      setFeedback({ ok: true, msg: 'گزارش اصلاح داده با پیش‌نمایش مقدار فعلی/پیشنهادی در صف اعتبارسنجی ثبت شد.' });
    } else {
      setFeedback({ ok: false, msg: res.errorFa || 'خطا در ثبت گزارش' });
    }
  };

  return (
    <div className="space-y-4 text-xs" data-testid="community-data-corrections-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button type="button" onClick={onOpenAgencySubmit} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1 cursor-pointer transition">
          <div className="font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#176B63]" /><span>ثبت فایل زیر قیمت یا مشاهده معامله</span>
          </div>
          <p className="text-[#586760] dark:text-slate-400 text-[11px]">ارسال مشاهده قیمتی واقعی برای محله {selectedHood.name}</p>
        </button>
        <button type="button" onClick={onOpenListingVerifier} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1 cursor-pointer transition">
          <div className="font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" /><span>راستی‌آزمایی و مچ‌گیر آگهی ساختگی</span>
          </div>
          <p className="text-[#586760] dark:text-slate-400 text-[11px]">بررسی نابهنجاری قیمت در آگهی‌های پرت محله</p>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <MapPinPlus className="w-4 h-4 text-[#176B63]" />
            <span>گزارش خطا و پیشنهاد اصلاح داده‌های مکانی یا شهری</span>
          </h2>
          <CommunityAuthorBadges profile={currentUserProfile} onSelectUsername={onSelectAuthor} />
        </div>

        <p className="text-[11px] text-[#586760] dark:text-slate-400">
          مسیر چرخه داده: ثبت‌شده ← اعتبارسنجی اولیه ← بررسی تخصصی ← تأیید ← اعمال در نسخه داده مرجع. پیش‌نویس فرم به‌صورت خودکار در مرورگر ذخیره می‌شود.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label htmlFor="corr-hood-select" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">محله هدف</label>
            <select id="corr-hood-select" value={hoodId} onChange={(e) => setHoodId(Number(e.target.value))} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold">
              {hoodChoices.slice(0, 40).map((h) => (<option key={h.id} value={h.id}>{h.name} ({h.zone})</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="corr-cat-select" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">دسته خطای داده</label>
            <select id="corr-cat-select" value={category} onChange={(e) => setCategory(e.target.value as DataCorrectionCategory)} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold">
              {(Object.keys(DATA_CORRECTION_CATEGORY_LABELS_FA) as DataCorrectionCategory[]).map((k) => (<option key={k} value={k}>{DATA_CORRECTION_CATEGORY_LABELS_FA[k]}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="corr-date-input" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">تاریخ مشاهده میدانی</label>
            <input id="corr-date-input" type="text" value={observedDateFa} onChange={(e) => setObservedDateFa(e.target.value)} placeholder="مثلاً ۱۴۰۵/۰۱/۲۰" className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
          </div>
        </div>

        <div>
          <label htmlFor="corr-title-input" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">عنوان خطا یا اصلاح</label>
          <input id="corr-title-input" type="text" value={titleFa} onChange={(e) => setTitleFa(e.target.value)} placeholder="مثلاً تغییر دسترسی خروجی مترو یا اصلاح مرز غربی محله" className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="corr-curr-input" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">مقدار یا وضعیت فعلی در سامانه</label>
            <input id="corr-curr-input" type="text" value={currentValueFa} onChange={(e) => setCurrentValueFa(e.target.value)} placeholder="مثلاً فاصله پیاده درج‌شده ۱۲ دقیقه" className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
          </div>
          <div>
            <label htmlFor="corr-val-input" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">مقدار پیشنهادی مستند</label>
            <input id="corr-val-input" type="text" value={suggestedFa} onChange={(e) => setSuggestedFa(e.target.value)} placeholder="مثلاً ۶ دقیقه پس از بازگشایی گذر شرقی" className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
          </div>
        </div>

        <div>
          <label htmlFor="corr-evidence-input" className="block text-[11px] font-bold text-[#34433E] dark:text-slate-300 mb-1">شواهد میدانی و توضیح دقیق (بدون شماره تماس یا لینک)</label>
          <textarea id="corr-evidence-input" rows={2} value={evidenceFa} onChange={(e) => setEvidenceFa(e.target.value)} placeholder="جزئیات مشاهده میدانی، نشانی تقاطع عمومی و دلیل مغایرت..." className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700" />
        </div>

        {feedback && (
          <div data-testid="community-correction-feedback" className={`p-2.5 rounded-[8px] font-bold ${feedback.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200'}`}>
            {feedback.msg}
          </div>
        )}

        <button type="submit" data-testid="submit-data-correction-btn" className="px-4 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer">
          ارسال به صف راستی‌آزمایی داده
        </button>
      </form>

      <div className="space-y-2.5" data-testid="community-corrections-list">
        {proposals.map((item) => {
          const st = STATUS_META[item.status] || STATUS_META.submitted;
          const canWithdraw = item.ownerUserId === currentUserProfile.userId && !['applied', 'approved', 'verified', 'withdrawn', 'rejected'].includes(item.status);
          return (
            <article key={item.id} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-[#586760] dark:text-slate-400 font-bold">
                  محله {item.neighborhoodNameFa} · {DATA_CORRECTION_CATEGORY_LABELS_FA[item.category]} · مشاهده: {item.observedDateFa || item.createdAtFa}
                </span>
                <span className={`font-bold inline-flex items-center gap-1 ${st.cls}`}>
                  {item.status === 'applied' || item.status === 'verified' || item.status === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.status === 'rejected' ? <XCircle className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                  <span>{st.label}</span>
                </span>
              </div>
              <h3 className="font-black text-sm text-[#182522] dark:text-white">{item.titleFa}</h3>
              <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{item.evidenceSummaryFa}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800/60 text-[11px]">
                <div><span className="text-[#586760]">مقدار فعلی:</span> <strong className="text-[#182522] dark:text-slate-200">{item.currentValueFa || 'داده موجود سامانه'}</strong></div>
                <div><span className="text-[#176B63] dark:text-emerald-400">مقدار پیشنهادی:</span> <strong className="text-[#14534E] dark:text-emerald-300">{item.suggestedValueFa}</strong></div>
              </div>
              {item.appliedDataVersionId && (
                <div className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  شناسه اعمال در داده مرجع: {item.appliedDataVersionId}
                </div>
              )}
              {item.moderatorNoteFa && (
                <div className="text-[11px] text-[#586760] dark:text-slate-400 border-t border-[#DCE3DF] dark:border-slate-800 pt-1.5">
                  یادداشت ممیز: {item.moderatorNoteFa}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <CommunityAuthorBadges profile={item.authorProfile} onSelectUsername={onSelectAuthor} />
                {canWithdraw && (
                  <button type="button" onClick={() => onWithdrawProposal(item.id)} className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400 hover:underline cursor-pointer">
                    <RotateCcw className="w-3 h-3" /><span>انصراف از پیشنهاد</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
