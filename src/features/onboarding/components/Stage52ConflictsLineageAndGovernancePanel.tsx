/** @file src/features/onboarding/components/Stage52ConflictsLineageAndGovernancePanel.tsx — Stage 52 Conflicts, Versioning, Citizen Proposals & Privacy Panel */
import React, { useState } from 'react';
import {
  detectLayerCombinationPrivacyRisk,
  evaluateReviewScheduleAndVersionRollback,
  evaluateSourceConflictResolution,
  runDatasetQualityAuditWorkbench,
  submitCitizenProposalAndDataGapCheck,
} from '../services/urbanDataAtlasEngine';
import {
  STAGE52_BOUNDARIES_8,
  STAGE52_UA_COMPONENT_IDS_45,
  STAGE52_UX_EVENTS_17,
  type DatasetSourceConflictRecord,
  type UrbanDatasetCatalogRecord,
} from '../services/urbanDataAtlasTypes';

export const Stage52ConflictsLineageAndGovernancePanel: React.FC<{
  section: 'conflicts_review_and_lineage' | 'participation_privacy_and_catalog';
  datasets: UrbanDatasetCatalogRecord[];
  conflicts: DatasetSourceConflictRecord[];
  onFeedbackFa: (msg: string) => void;
}> = ({ section, datasets, conflicts, onFeedbackFa }) => {
  const [useHeuristicOnly, setUseHeuristicOnly] = useState(true);
  const [verifiedRefId, setVerifiedRefId] = useState('');
  const [reviewDuePassed, setReviewDuePassed] = useState(true);
  const [triggerRollback, setTriggerRollback] = useState(false);
  const [sensitiveGapRequest, setSensitiveGapRequest] = useState(true);
  const [combineSensitiveLayer, setCombineSensitiveLayer] = useState(true);

  const conflictEval = evaluateSourceConflictResolution({
    conflict: conflicts[0],
    attemptedNewerFileOnlyHeuristic: useHeuristicOnly,
    verifiedReferenceDocumentId: verifiedRefId.trim() || undefined,
  });

  const reviewAndRollback = evaluateReviewScheduleAndVersionRollback({
    dataset: datasets[0],
    currentDateFa: '۱۴۰۵/۰۸/۱۶',
    isReviewDuePassed: reviewDuePassed,
    rollbackReasonFa: triggerRollback ? 'تغییر ساختار ستون کد مرکز در نسخه v2.1' : undefined,
  });

  const qualityAudit = runDatasetQualityAuditWorkbench({
    dataset: datasets[0],
    previousVersionErrorCount: 4,
    geometryIssues: [{ recordId: 'REC-H-418', areaFa: 'منطقه ۱۸', issueKindFa: 'خودتقاطع یا ناسازگاری هندسه' }],
  });

  const citizenAndGap = submitCitizenProposalAndDataGapCheck({
    datasetId: datasets[0].datasetId,
    errorTypeFa: 'موقعیت یا تعطیلی واحد درمانی',
    proposedValueFa: 'انتقال درمانگاه به نشانی جدید در خیابان جردن',
    evidenceSourceFa: 'تابلو رسمی و اطلاعیه دانشگاه علوم پزشکی',
    approvedPreviousCorrectionsCount: 4,
    totalSubmissionsCount: 5,
    gapRequestTitleFa: 'درخواست مختصات دقیق مالکان و ساکنان واحدهای مسکونی',
    gapRequestPopularityVotes: 420,
    containsSensitivePersonalOrPrivateData: sensitiveGapRequest,
  });

  const privacyRisk = detectLayerCombinationPrivacyRisk({
    selectedDatasets: combineSensitiveLayer ? [datasets[0], datasets[2]] : [datasets[0], datasets[1]],
    distinguishedMissingKind: 'اطلاعات ثبت نشده',
  });

  if (section === 'conflicts_review_and_lineage') {
    return (
      <div className="space-y-3 text-[11px]" data-testid="stage52-conflicts-lineage-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-amber-300 text-xs">
              ۵۲.۱۷ مدیریت تعارض میان دو منبع ({conflicts[0].conflictId} · {conflicts[0].conflictType})
            </h4>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setUseHeuristicOnly(true);
                  setVerifiedRefId('');
                  onFeedbackFa('تلاش برای حل تعارض صرفاً به بهانه جدیدتر بودن فایل مسدود شد.');
                }}
                data-testid="ua-test-newer-heuristic-btn"
                className="rounded border border-rose-500/40 bg-rose-950/30 px-2 py-1 text-rose-200 cursor-pointer"
              >
                آزمون انتخاب صرفاً فایل جدیدتر
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseHeuristicOnly(false);
                  setVerifiedRefId('REF-MUN-1405-02');
                  onFeedbackFa('تعارض با استناد به سند مرجع رسمی REF-MUN-1405-02 بررسی شد.');
                }}
                data-testid="ua-resolve-with-ref-btn"
                className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-1 text-emerald-200 cursor-pointer"
              >
                ثبت حل تعارض با سند مرجع
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="font-bold text-cyan-300">منبع الف ({conflicts[0].sourceADateFa})</div>
              <div className="text-slate-200 mt-1">{conflicts[0].sourceAValueFa}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="font-bold text-amber-300">منبع ب ({conflicts[0].sourceBDateFa})</div>
              <div className="text-slate-200 mt-1">{conflicts[0].sourceBValueFa}</div>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 text-[10.5px]" data-testid="ua-conflict-status-box">
            وضعیت مؤثر تعارض: <strong className="text-white">{conflictEval.effectiveStatus}</strong> ·
            ممنوعیت حل با قاعده فایل جدیدتر: <strong>{conflictEval.resolvedByNewerOrMoreCompleteHeuristicBlocked ? 'مسدود (فعال)' : 'مجاز با سند مرجع'}</strong>
            <div className="text-slate-300 mt-1">{conflictEval.guidanceFa}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300 text-xs">
              ۵۲.۱۸، ۵۲.۲۴ و ۵۲.۳۰ میزکار کنترل کیفیت (۱۲ مرحله)، سررسید و بازگشت ایمن نسخه
            </h4>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input type="checkbox" checked={reviewDuePassed} onChange={(e) => setReviewDuePassed(e.target.checked)} />
                سررسید بازبینی گذشته
              </label>
              <button
                type="button"
                data-testid="ua-rollback-version-btn"
                onClick={() => {
                  setTriggerRollback((v) => !v);
                  onFeedbackFa('وضعیت بازگشت ایمن نسخه بدون حذف تاریخچه نسخه جدید به‌روزرسانی شد.');
                }}
                className="rounded border border-indigo-500/40 bg-indigo-950/30 px-2.5 py-1 text-indigo-200 cursor-pointer"
              >
                {triggerRollback ? 'لغو شبیه‌سازی بازگشت نسخه' : 'شبیه‌سازی بازگشت نسخه بدون حذف تاریخچه'}
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1 text-[10.5px]">
            <div><strong>ممیزی ۱۲مرحله‌ای (§۳۰):</strong> کنترل اجراشده: {qualityAudit.totalStepsExecuted}/12 · خطا: {qualityAudit.errorCount} (تغییر نسبت به نسخه قبل: {qualityAudit.errorDeltaVsPreviousVersion}) · موارد نیازمند بازبینی: {qualityAudit.reviewCount}</div>
            <div><strong>خطای هندسی متصل به رکورد:</strong> {qualityAudit.recordBoundGeometryIssues.map((g) => `${g.recordId} (${g.areaFa}: ${g.issueKindFa})`).join('، ')}</div>
            <div><strong>وضعیت سررسید:</strong> {reviewAndRollback.reviewWarningFa} · <strong>نامعتبرشدن خودکار:</strong> {reviewAndRollback.autoMarkedDefinitivelyInvalid ? 'بله' : 'خیر'}</div>
            <div><strong>وابستگی مستقیم:</strong> {reviewAndRollback.impactedDirectLayers.join('، ')} | <strong>گزارش غیرمستقیم:</strong> {reviewAndRollback.impactedIndirectReports.join('، ')}</div>
            {reviewAndRollback.rollbackAuditNoteFa && (
              <div className="text-emerald-300 font-bold" data-testid="ua-rollback-audit-note">
                {reviewAndRollback.rollbackAuditNoteFa}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px]" data-testid="stage52-participation-privacy-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-emerald-300 text-xs">
            ۵۲.۱۹ و ۵۲.۲۰ مشارکت اصلاح داده و صف درخواست داده‌های موجودنبوده (UA-31..UA-33, UA-39)
          </h4>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sensitiveGapRequest} onChange={(e) => setSensitiveGapRequest(e.target.checked)} />
            شامل داده شخصی یا مکانی حساس
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
            <div className="font-bold text-white">گزارش اصلاحی کاربر ({citizenAndGap.proposal.proposalId})</div>
            <div>وضعیت: {citizenAndGap.proposal.status}</div>
            <div>تغییر مستقیم مرجع پیش از بررسی: <strong className="text-emerald-300">{citizenAndGap.proposal.mutatesReferenceDirectly ? 'بله' : 'خیر (مسدود)'}</strong></div>
            <div>سابقه اصلاحات تأییدشده واقعی: {citizenAndGap.verifiedApprovalRatioPercent}٪</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
            <div className="font-bold text-white">درخواست داده موجودنبوده ({citizenAndGap.dataGapRequest.popularityVotes} رأی)</div>
            <div>کافی‌بودن محبوبیت برای انتشار داده حساس: <strong className="text-emerald-300">{citizenAndGap.dataGapRequest.popularityAloneJustifiesSensitiveRelease ? 'بله' : 'خیر'}</strong></div>
            <div className="text-amber-300">{citizenAndGap.dataGapRequest.decisionNoteFa}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-rose-300 text-xs">
            ۵۲.۲۷ گارد ریسک بازشناسایی در ترکیب لایه‌ها (§۲۷.۳) و خلاصه اجزای کاتالوگ (UA-01..UA-45)
          </h4>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={combineSensitiveLayer} onChange={(e) => setCombineSensitiveLayer(e.target.checked)} />
            ترکیب با لایه پلاک‌های حساس
          </label>
        </div>
        <div className={`rounded border p-2.5 text-[10.5px] ${privacyRisk.combinationRiskElevated ? 'border-rose-500/40 bg-rose-950/20 text-rose-200' : 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'}`} data-testid="ua-combination-privacy-warning">
          {privacyRisk.warningFa}
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کامپوننت‌های UA: <strong>{STAGE52_UA_COMPONENT_IDS_45.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">رویدادهای UX: <strong>{STAGE52_UX_EVENTS_17.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">مرزهای بین‌مرحله‌ای: <strong>{STAGE52_BOUNDARIES_8.length}</strong></div>
        </div>
      </div>
    </div>
  );
};
