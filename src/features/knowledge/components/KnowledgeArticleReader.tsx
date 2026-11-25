/** @file src/features/knowledge/components/KnowledgeArticleReader.tsx — Stages 82, 84, 86 & 87 Provenance Reader, Version History, Structured Corrections & Safe Export */
import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowRight, Bookmark, Calculator, Compass, Database, Download, FileText, Flag, History, MapPin, ShieldCheck, UserCheck } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import {
  clearKnowledgeCorrectionLocalDraft,
  loadKnowledgeCorrectionLocalDraft,
  resolvePublicationSourcesById,
  saveKnowledgeCorrectionLocalDraft,
} from '../data/knowledgeSourcesAndBriefs';
import {
  getKnowledgePublicationBySlug,
  submitKnowledgeCorrection,
} from '../services/knowledgeApiClient';
import {
  buildKnowledgeReportExportJson,
  buildKnowledgeReportPrintHtml,
  formatIndicatorExportValue,
} from '../services/knowledgeSearchService';
import {
  KNOWLEDGE_CORRECTION_TYPE_LABELS_FA,
  KNOWLEDGE_FRESHNESS_LABELS_FA,
  KNOWLEDGE_PUBLICATION_STATUS_LABELS_FA,
  KNOWLEDGE_SOURCE_LICENSE_LABELS_FA,
  type KnowledgeCorrectionType,
  type KnowledgePublication,
  type KnowledgeSourceRecord,
} from '../types/knowledge.types';

export interface KnowledgeArticleReaderProps {
  publication: KnowledgePublication;
  linkedSources?: KnowledgeSourceRecord[];
  currentUser?: User | null;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  isSaved?: boolean;
  isSavingBookmark?: boolean;
  bookmarkStatusUnknown?: boolean;
  onToggleSave?: (pubId: string) => void;
  onBack: () => void;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

/** Stage 87.1 & 87.4: Deferred Object URL revocation & verified download initiation */
export function triggerSafeKnowledgeDownload(filename: string, content: string, mimeType: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Blob === 'undefined') {
    return false;
  }
  try {
    if (!content || content.length === 0) return false;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revoke errors
      }
    }, 10_000);
    return true;
  } catch {
    return false;
  }
}

export const KnowledgeArticleReader: React.FC<KnowledgeArticleReaderProps> = ({
  publication,
  linkedSources,
  currentUser,
  evaluatedNeighborhoods = [],
  isSaved = false,
  isSavingBookmark = false,
  bookmarkStatusUnknown = false,
  onToggleSave,
  onBack,
  onSelectNeighborhood,
  onNavigateView,
}) => {
  const [displayedPub, setDisplayedPub] = useState<KnowledgePublication>(publication);
  const [viewingHistoricalVersion, setViewingHistoricalVersion] = useState(false);
  const [noticeFa, setNoticeFa] = useState<string | null>(null);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [showCorrForm, setShowCorrForm] = useState(false);

  const initialDraft = loadKnowledgeCorrectionLocalDraft(publication.id);
  const [corrType, setCorrType] = useState<KnowledgeCorrectionType>(initialDraft?.correctionType || 'data_error');
  const [targetSection, setTargetSection] = useState(initialDraft?.targetSection || 'tier-2-ind');
  const [targetIndicatorId, setTargetIndicatorId] = useState(initialDraft?.targetIndicatorId || '');
  const [corrNote, setCorrNote] = useState(initialDraft?.noteFa || '');
  const [evidenceDesc, setEvidenceDesc] = useState(initialDraft?.evidenceDescriptionFa || '');
  const [sourceUrl, setSourceUrl] = useState(initialDraft?.sourceUrl || '');
  const [submittingCorr, setSubmittingCorr] = useState(false);

  useEffect(() => {
    setDisplayedPub(publication);
    setViewingHistoricalVersion(false);
  }, [publication]);

  useEffect(() => {
    setNoticeFa(null); setErrorFa(null); setShowCorrForm(false);
    const d = loadKnowledgeCorrectionLocalDraft(publication.id);
    setCorrType(d?.correctionType || 'data_error'); setTargetSection(d?.targetSection || 'tier-2-ind');
    setTargetIndicatorId(d?.targetIndicatorId || ''); setCorrNote(d?.noteFa || '');
    setEvidenceDesc(d?.evidenceDescriptionFa || ''); setSourceUrl(d?.sourceUrl || '');
  }, [publication.id]);

  const effectiveSources =
    linkedSources && linkedSources.length > 0
      ? linkedSources
      : resolvePublicationSourcesById(displayedPub.sourceIds);

  const freshness = KNOWLEDGE_FRESHNESS_LABELS_FA[displayedPub.freshnessStatus];
  const pubStatus = displayedPub.status ?? displayedPub.defaultPublicationStatus;

  const handleOpenNeighborhood = (name: string) => {
    const matched = evaluatedNeighborhoods.find((h) => h.name === name);
    if (matched && onSelectNeighborhood) onSelectNeighborhood(matched);
    onNavigateView('map');
  };

  const handleSelectVersion = async (versionId: string, isLatest: boolean) => {
    setErrorFa(null);
    if (isLatest) {
      setDisplayedPub(publication);
      setViewingHistoricalVersion(false);
      return;
    }
    const localSnap = (publication.versionHistory ?? []).find((v) => v.versionId === versionId || v.version === versionId);
    if (localSnap) {
      setDisplayedPub({
        ...publication,
        version: localSnap.version,
        versionId: localSnap.versionId,
        publishedAtFa: localSnap.publishedAtFa,
        updatedAtFa: localSnap.updatedAtFa,
        status: localSnap.status,
        changelogFa: localSnap.changelogFa,
        titleFa: localSnap.titleFa,
        summaryFa: localSnap.summaryFa,
        rawDataSummaryFa: localSnap.rawDataSummaryFa,
        calculatedIndicators: localSnap.calculatedIndicators,
        researchInterpretationFa: localSnap.researchInterpretationFa,
        limitationsFa: localSnap.limitationsFa,
      });
      setViewingHistoricalVersion(true);
      return;
    }
    const res = await getKnowledgePublicationBySlug(publication.slug, { versionId });
    if (res.ok && res.data?.item) {
      setDisplayedPub(res.data.item);
      setViewingHistoricalVersion(true);
    } else {
      setErrorFa(res.errorFa || 'نسخه انتخاب‌شده در دسترس نیست.');
    }
  };

  const handleSubmitCorrection = async () => {
    if (submittingCorr) return;
    setErrorFa(null);
    setNoticeFa(null);
    const trimmed = corrNote.trim();
    if (trimmed.length < 10) {
      setErrorFa('توضیح خطا باید حداقل ۱۰ نویسه باشد.');
      return;
    }
    if (trimmed.length > 1000) {
      setErrorFa('توضیح خطا نباید بیش از ۱۰۰۰ نویسه باشد.');
      return;
    }
    if (sourceUrl.trim().length > 0 && !/^https?:\/\/\S+/i.test(sourceUrl.trim())) {
      setErrorFa('نشانی منبع باید یک URL معتبر با پیشوند http یا https باشد.');
      return;
    }
    if (!currentUser || !currentUser.uid) {
      saveKnowledgeCorrectionLocalDraft(displayedPub.id, {
        correctionType: corrType,
        targetSection,
        targetIndicatorId: targetIndicatorId || undefined,
        noteFa: trimmed,
        evidenceDescriptionFa: evidenceDesc.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setErrorFa('برای ثبت رسمی اصلاحیه در سرور، ابتدا وارد حساب کاربری شوید. پیش‌نویس محلی شما ذخیره شد.');
      return;
    }

    setSubmittingCorr(true);
    const res = await submitKnowledgeCorrection(
      displayedPub.id,
      {
        correctionType: corrType,
        targetSection,
        targetIndicatorId: targetIndicatorId || undefined,
        noteFa: trimmed,
        evidenceDescriptionFa: evidenceDesc.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      },
      currentUser,
    );
    setSubmittingCorr(false);

    if (!res.ok) {
      saveKnowledgeCorrectionLocalDraft(displayedPub.id, {
        correctionType: corrType,
        targetSection,
        targetIndicatorId: targetIndicatorId || undefined,
        noteFa: trimmed,
        evidenceDescriptionFa: evidenceDesc.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setErrorFa(`${res.errorFa || 'ارسال اصلاحیه به سرور ناموفق بود.'} (اطلاعات فرم و پیش‌نویس محلی حفظ شد)`);
      return;
    }

    clearKnowledgeCorrectionLocalDraft(displayedPub.id);
    setCorrNote('');
    setEvidenceDesc('');
    setSourceUrl('');
    setShowCorrForm(false);
    setNoticeFa('گزارش اصلاحیه جهت بازبینی فنی و تحریریه ثبت شد.');
  };

  return (
    <article data-testid="knowledge-article-reader" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-5 text-xs animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] pb-3">
        <button type="button" onClick={onBack} className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold flex items-center gap-1.5 cursor-pointer">
          <ArrowRight className="w-3.5 h-3.5" /><span>بازگشت به فهرست</span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {onToggleSave && (
            <button
              type="button"
              disabled={isSavingBookmark}
              data-testid="knowledge-save-btn"
              onClick={() => onToggleSave(displayedPub.id)}
              className={`px-3 py-1.5 rounded-[8px] border font-bold flex items-center gap-1 cursor-pointer ${
                bookmarkStatusUnknown
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : isSaved
                    ? 'border-[var(--color-brand-600)] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[var(--color-brand-700)] dark:text-emerald-300'
                    : 'border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved && !bookmarkStatusUnknown ? 'fill-[var(--color-brand-600)]' : ''}`} />
              <span>{bookmarkStatusUnknown ? 'وضعیت ذخیره نامشخص' : isSaved ? 'ذخیره‌شده در حساب' : 'ذخیره مطالعه'}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="knowledge-export-html"
            onClick={() => {
              const html = buildKnowledgeReportPrintHtml(displayedPub, effectiveSources);
              const started = triggerSafeKnowledgeDownload(`${displayedPub.slug}-${displayedPub.version}.html`, html, 'text/html;charset=utf-8');
              if (started) { setErrorFa(null); setNoticeFa('نسخه چاپی گزارش (HTML) آماده و فایل ذخیره شد.'); }
              else { setErrorFa('عملیات دانلود نسخه چاپی در مرورگر آغاز نشد.'); }
            }}
            className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /><span>خروجی چاپی</span>
          </button>
          <button
            type="button"
            data-testid="knowledge-export-json"
            onClick={() => {
              const json = buildKnowledgeReportExportJson(displayedPub, effectiveSources);
              const started = triggerSafeKnowledgeDownload(`${displayedPub.slug}-${displayedPub.version}.json`, json, 'application/json;charset=utf-8');
              if (started) { setErrorFa(null); setNoticeFa('فایل ساختاریافته JSON ذخیره شد.'); }
              else { setErrorFa('عملیات دانلود فایل JSON آغاز نشد.'); }
            }}
            className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /><span>JSON</span>
          </button>
        </div>
      </div>

      {viewingHistoricalVersion && (
        <div className="p-3 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold flex items-center justify-between gap-2">
          <span>شما در حال مشاهده نسخه قدیمی ({displayedPub.version}) هستید؛ این نسخه «آخرین نسخه» جاری نیست.</span>
          <button type="button" onClick={() => handleSelectVersion(publication.version, true)} className="px-2.5 py-1 rounded bg-amber-700 text-white text-[11px] cursor-pointer">
            بازگشت به نسخه جاری ({publication.version})
          </button>
        </div>
      )}

      {noticeFa && <div className="p-2.5 rounded-[8px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">{noticeFa}</div>}
      {errorFa && <div className="p-2.5 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-bold">{errorFa}</div>}

      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-[6px] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold">{displayedPub.categoryLabelFa}</span>
          <span className={`px-2 py-0.5 rounded-[6px] border font-bold ${freshness.badgeClass}`}>{freshness.labelFa}</span>
          <span className="px-2 py-0.5 rounded-[6px] bg-slate-100 dark:bg-[var(--color-bg-muted)] text-slate-700 dark:text-[var(--color-text-secondary)] font-bold" dir="ltr">
            {displayedPub.version} {viewingHistoricalVersion ? '(نسخه پیشین)' : '(نسخه فعلی)'}
          </span>
          <span className="px-2 py-0.5 rounded-[6px] border border-slate-300 dark:border-[var(--color-border-strong)] text-slate-600 dark:text-[var(--color-text-secondary)] font-bold">
            {KNOWLEDGE_PUBLICATION_STATUS_LABELS_FA[pubStatus]}
          </span>
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-bold text-[var(--color-text-primary)] dark:text-white leading-[1.5] max-w-[720px]">{displayedPub.titleFa}</h2>
        <p className="editorial-prose max-w-[720px] text-sm leading-8 text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]">{displayedPub.summaryFa}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs">
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)]"><span className="text-[var(--color-text-muted)] block">محدوده و دوره:</span><strong className="text-[var(--color-text-primary)] dark:text-white">{displayedPub.geographyScopeFa} · {displayedPub.periodLabelFa}</strong></div>
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)]"><span className="text-[var(--color-text-muted)] block">نویسنده پژوهش:</span><strong className="text-[var(--color-text-primary)] dark:text-white flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> {displayedPub.author.nameFa}</strong></div>
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)]"><span className="text-[var(--color-text-muted)] block">بازبین فنی مستقل:</span><strong className="text-[var(--color-text-primary)] dark:text-white flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> {displayedPub.technicalReviewer.nameFa}</strong></div>
        </div>
      </header>

      <section id="tier-1-raw" data-testid="knowledge-tier-raw-data" className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-1.5">
        <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5"><Database className="w-4 h-4 text-[var(--color-brand-600)]" /><span>لایه ۱: داده خام و منابع پایه (Raw Data)</span></h3>
        <p className="editorial-prose max-w-[720px] text-sm leading-8 text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]">{displayedPub.rawDataSummaryFa}</p>
      </section>

      <section id="tier-2-ind" data-testid="knowledge-tier-indicators" className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-brand-600)]/40 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5"><Calculator className="w-4 h-4 text-[var(--color-brand-600)]" /><span>لایه ۲: شاخص‌های محاسبه‌شده و سناریوهای آموزشی</span></h3>
          <span className="text-xs px-2 py-0.5 rounded bg-[#EAF3F0] dark:bg-emerald-950/60 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold" dir="ltr">{displayedPub.formulaVersion}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedPub.calculatedIndicators.map((ind) => {
            const isIllustrative = ind.calculationStatus === 'illustrative';
            const isPending = ind.calculationStatus === 'pending';
            const isUnavailable = ind.calculationStatus === 'unavailable';
            return (
              <div key={ind.id} className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold text-[var(--color-text-primary)] dark:text-white">{ind.labelFa}</span>
                  {isIllustrative ? (
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 text-[11px] font-bold">مثال آموزشی</span>
                  ) : isPending ? (
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[11px] font-bold">در انتظار محاسبه</span>
                  ) : isUnavailable ? (
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px] font-bold">فاقد داده کافی</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 text-[11px] font-bold">محاسبه تأییدشده</span>
                  )}
                </div>
                <div className={`text-base font-bold tabular-nums ${isIllustrative ? 'text-amber-800 dark:text-amber-300' : isPending || isUnavailable ? 'text-slate-500' : 'text-[var(--color-brand-600)] dark:text-emerald-400'}`}>
                  {formatIndicatorExportValue(ind)}{' '}
                  {!isPending && !isUnavailable && <span className="text-xs font-medium text-[var(--color-text-muted)]">({ind.unitFa})</span>}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  دامنه: {ind.sampleScopeFa} · دوره: {ind.periodLabelFa}
                  {typeof ind.sampleSize === 'number' && ` · نمونه: ${toPersianNum(ind.sampleSize)} رکورد`}
                  {ind.datasetVersion && ` · نسخه دیتاست: ${ind.datasetVersion}`}
                </div>
                <div className="text-xs text-[#875000] dark:text-amber-300 font-medium">محدودیت شاخص: {ind.limitationFa}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="tier-3-interp" data-testid="knowledge-tier-interpretation" className="p-4 rounded-[12px] bg-[#EAF3F0]/50 dark:bg-emerald-950/20 border border-[var(--color-border-subtle)] dark:border-emerald-900 space-y-2">
        <h3 className="font-bold text-[var(--color-brand-700)] dark:text-emerald-300 flex items-center gap-1.5"><Compass className="w-4 h-4" /><span>لایه ۳: تفسیر پژوهشی و محدودیت‌ها (تفکیک‌شده از آمار خام)</span></h3>
        <p className="editorial-prose max-w-[720px] text-sm leading-8 text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)]">{displayedPub.researchInterpretationFa}</p>
        <div className="pt-1 border-t border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] space-y-1 max-w-[720px]">
          <strong className="block text-[var(--color-text-primary)] dark:text-[var(--color-text-primary)]">سابقه نسخه ({displayedPub.version}) و محدودیت‌ها:</strong>
          <p>{displayedPub.changelogFa}</p>
          <ul className="list-disc pr-4 space-y-0.5">{displayedPub.limitationsFa.map((lim) => <li key={lim}>{lim}</li>)}</ul>
        </div>
      </section>

      {(publication.versionHistory?.length ?? 0) > 0 && (
        <section id="tier-versions" data-testid="knowledge-version-history" className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-2">
          <strong className="text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5"><History className="w-4 h-4 text-[var(--color-brand-600)]" /><span>تاریخچه نسخه‌های گزارش</span></strong>
          <div className="space-y-1.5">
            {(publication.versionHistory ?? []).map((ver, idx) => {
              const isCurrentSelection = displayedPub.version === ver.version;
              const isLatestVersion = idx === 0 && ver.version === publication.version;
              return (
                <div key={ver.versionId} className="p-2.5 rounded-[8px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div>
                    <span className="font-bold text-[var(--color-text-primary)] dark:text-white" dir="ltr">{ver.version}</span>
                    <span className="mx-1.5 text-[var(--color-text-muted)]">· {ver.publishedAtFa} ·</span>
                    <span className="font-bold text-[var(--color-brand-600)]">{isLatestVersion ? 'نسخه فعلی' : 'نسخه آرشیوی قبلی'}</span>
                    <p className="text-[var(--color-text-muted)] mt-0.5">{ver.changelogFa}</p>
                  </div>
                  {!isCurrentSelection && (
                    <button type="button" onClick={() => handleSelectVersion(ver.versionId, isLatestVersion)} className="px-2.5 py-1 rounded border border-[var(--color-brand-600)] text-[var(--color-brand-600)] font-bold cursor-pointer">
                      مشاهده این نسخه
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section id="tier-4-sources" className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[var(--color-text-primary)] dark:text-white">شناسنامه منابع مرتبط با این گزارش ({toPersianNum(effectiveSources.length)} منبع)</strong>
          <button type="button" data-testid="knowledge-toggle-correction-btn" onClick={() => setShowCorrForm((v) => !v)} className="text-[11px] font-bold text-[#875000] dark:text-amber-300 flex items-center gap-1 cursor-pointer">
            <Flag className="w-3.5 h-3.5" /><span>گزارش خطا / پیشنهاد اصلاحیه</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {effectiveSources.map((src) => (
            <div key={src.sourceId} className="p-3 rounded-[8px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-1 text-[11px]">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[var(--color-text-primary)] dark:text-white">{src.titleFa}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${src.licenseStatus === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                  {KNOWLEDGE_SOURCE_LICENSE_LABELS_FA[src.licenseStatus]}
                </span>
              </div>
              <div className="text-[var(--color-text-muted)]">شناسه: <code dir="ltr">{src.sourceId}</code> · {src.sourceTypeFa} · نسخه {src.version}</div>
              {src.geographicCoverage && <div className="text-[var(--color-text-muted)]">پوشش: {src.geographicCoverage} · دوره: {src.temporalCoverage}</div>}
              <div className="text-[var(--color-text-muted)]">{src.reliabilityNoteFa}</div>
              {src.restrictionsFa && src.restrictionsFa.length > 0 && (
                <div className="text-[10.5px] text-amber-800 dark:text-amber-300 font-medium">محدودیت مجوز: {src.restrictionsFa.join(' — ')}</div>
              )}
            </div>
          ))}
        </div>
        {showCorrForm && (
          <div data-testid="knowledge-correction-form" className="p-3 rounded-[10px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select aria-label="نوع خطا" value={corrType} onChange={(e) => setCorrType(e.target.value as KnowledgeCorrectionType)} className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold">
                {(Object.keys(KNOWLEDGE_CORRECTION_TYPE_LABELS_FA) as KnowledgeCorrectionType[]).map((k) => (
                  <option key={k} value={k}>{KNOWLEDGE_CORRECTION_TYPE_LABELS_FA[k]}</option>
                ))}
              </select>
              <select aria-label="بخش گزارش" value={targetSection} onChange={(e) => setTargetSection(e.target.value)} className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]">
                <option value="tier-1-raw">لایه ۱: داده خام</option>
                <option value="tier-2-ind">لایه ۲: شاخص‌های محاسبه‌شده</option>
                <option value="tier-3-interp">لایه ۳: تفسیر پژوهشی</option>
                <option value="tier-4-sources">لایه ۴: منابع و مجوزها</option>
              </select>
              <select aria-label="شاخص مرتبط" value={targetIndicatorId} onChange={(e) => setTargetIndicatorId(e.target.value)} className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]">
                <option value="">همه شاخص‌ها / عمومی</option>
                {displayedPub.calculatedIndicators.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.labelFa}</option>
                ))}
              </select>
            </div>
            <textarea
              aria-label="توضیح خطا"
              rows={2}
              value={corrNote}
              onChange={(e) => setCorrNote(e.target.value)}
              placeholder="توضیح دقیق خطا یا پیشنهاد اصلاحیه علمی (حداقل ۱۰ و حداکثر ۱۰۰۰ نویسه)..."
              className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" aria-label="شرح مستندات" value={evidenceDesc} onChange={(e) => setEvidenceDesc(e.target.value)} placeholder="توضیح مستندات یا مرجع پشتیبان (اختیاری)" className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]" />
              <input type="url" aria-label="نشانی منبع" dir="ltr" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://... (اختیاری)" className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  saveKnowledgeCorrectionLocalDraft(displayedPub.id, { correctionType: corrType, targetSection, targetIndicatorId: targetIndicatorId || undefined, noteFa: corrNote, evidenceDescriptionFa: evidenceDesc, sourceUrl });
                  setNoticeFa('پیش‌نویس محلی ذخیره شد.');
                }}
                className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold cursor-pointer"
              >
                ذخیره پیش‌نویس محلی
              </button>
              <button type="button" disabled={submittingCorr} onClick={handleSubmitCorrection} className="px-3.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50">
                {submittingCorr ? 'در حال ارسال به سرور...' : 'ارسال رسمی اصلاحیه به سرور'}
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="pt-2 border-t border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {displayedPub.relatedNeighborhoodNames.map((name) => (
            <button key={name} type="button" onClick={() => handleOpenNeighborhood(name)} className="px-2.5 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] hover:border-[var(--color-brand-600)] font-bold flex items-center gap-1 cursor-pointer">
              <MapPin className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>نقشه {name}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {displayedPub.crossReferences.map((xref) => (
            <button key={xref.labelFa} type="button" onClick={() => onNavigateView(xref.targetView, xref.targetSubTab)} className="px-3 py-1.5 rounded-[8px] bg-[var(--color-text-primary)] dark:bg-white text-white dark:text-[var(--color-text-primary)] font-bold cursor-pointer">{xref.labelFa}</button>
          ))}
        </div>
      </footer>
    </article>
  );
};
