/**
 * RT-UI-DATA-GOV-001 (§17) | Public Data Provenance, Quality & Methodology Transparency Card
 * Explains data origin, sample sufficiency, methodology verification vs external reality verification,
 * lineage graph, version diff, and user data correction proposal submission.
 */

import React, { useState } from 'react';
import { CheckCircle2, Database, FileCheck2, GitBranch, History, Info, ShieldAlert } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  buildPublicProvenanceContract,
  compareEntityVersionsDiff,
} from '../services/claimsAndLineageService';
import { defaultDataGovernanceEngine } from '../services/dataGovernanceEngine';

export interface PublicDataProvenanceCardProps {
  entityId: string | null;
  neighborhoodNameFa?: string;
  entityNameFa?: string;
  sampleCount?: number | null;
  uniqueEntityCount?: number | null;
  observedSampleCount?: number;
  syntheticSampleCount?: number;
}

export const PublicDataProvenanceCard: React.FC<PublicDataProvenanceCardProps> = ({
  entityId,
  neighborhoodNameFa,
  entityNameFa,
  sampleCount = null,
  uniqueEntityCount = null,
  observedSampleCount = 0,
  syntheticSampleCount = 0,
}) => {
  const resolvedNameFa = neighborhoodNameFa || entityNameFa || 'محله انتخاب‌شده';
  const [expandedTab, setExpandedTab] = useState<'NONE' | 'LINEAGE' | 'VERSIONS' | 'CORRECTION'>('NONE');
  const [proposedVal, setProposedVal] = useState('');
  const [proposalReason, setProposalReason] = useState('');
  const [proposalSubmittedFa, setProposalSubmittedFa] = useState<string | null>(null);

  const contract = buildPublicProvenanceContract({
    entityId,
    neighborhoodNameFa: resolvedNameFa,
    sampleCount,
    uniqueEntityCount,
    observedSampleCount,
    syntheticSampleCount,
  });

  const lineageEdges = defaultDataGovernanceEngine.getLineageForEntity(entityId);
  const versions = (entityId ? defaultDataGovernanceEngine.getEntityVersions(entityId) : [])
    .filter((v) => v.attribute === 'medianAskingPricePerSqm')
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const diff =
    versions.length >= 2 ? compareEntityVersionsDiff(versions[versions.length - 2], versions[versions.length - 1]) : null;
  const isRegistered = contract.provenanceStatus === 'REGISTERED';

  const sufficiencyBadge = {
    INSUFFICIENT: { label: 'کفایت نمونه ناکافی', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    LIMITED: { label: 'کفایت نمونه محدود', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    ADEQUATE: { label: 'کفایت نمونه مناسب', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    STRONG: { label: 'پوشش و کفایت قوی', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
    NOT_ASSESSED: { label: 'زنجیره منشأ ثبت‌نشده', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  }[contract.sufficiencyStatus];

  const sampleText =
    sampleCount === null || sampleCount === undefined
      ? 'ثبت نشده'
      : contract.provenance.uniqueEntityCount !== null
        ? `${toPersianNum(contract.provenance.sampleCount)} نمونه (${toPersianNum(contract.provenance.uniqueEntityCount)} ملک یکتا)`
        : `${toPersianNum(contract.provenance.sampleCount)} نمونه زنده محلی (ملک یکتا: نامشخص)`;

  return (
    <section
      data-testid="public-data-provenance-card"
      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-[var(--color-brand-600)]" />
          <strong className="text-sm font-black text-slate-900 dark:text-white">
            کارت شفافیت منشأ داده، کیفیت نمونه و روش‌شناسی ({resolvedNameFa})
          </strong>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200">
            {isRegistered ? 'دارای سابقه حاکمیت داده' : 'فاقد زنجیره منشأ ثبت‌شده'}
          </span>
          <span className={`px-2 py-0.5 rounded-md border font-bold ${sufficiencyBadge.cls}`}>
            {sufficiencyBadge.label}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-bold">
            روش ({contract.methodology.code} v{toPersianNum(contract.methodology.version)})
          </span>
        </div>
      </div>

      {!isRegistered && (
        <div
          data-testid="provenance-unregistered-notice"
          className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold"
        >
          برای این محله هنوز شناسنامه منشأ داده ثبت نشده است؛ داده‌های هیچ محله دیگری جایگزین «{resolvedNameFa}» نمی‌شود.
          {syntheticSampleCount > 0 && ` (${toPersianNum(syntheticSampleCount)} نمونه نمایشی پایه در آمار بازار لحاظ نشده است.)`}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">دوره مرجع داده (Valid Time)</div>
          <strong className="font-black text-slate-900 dark:text-white block mt-0.5">
            {contract.referencePeriod.labelFa}
          </strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">تعداد نمونه / ملک یکتا</div>
          <strong className="font-black text-slate-900 dark:text-white block mt-0.5 tabular-nums">
            {sampleText}
          </strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">تعداد منابع و شواهد مستقل</div>
          <strong className="font-black text-slate-900 dark:text-white block mt-0.5 tabular-nums">
            {toPersianNum(contract.provenance.sourceCount)} منبع ثبت‌شده · {toPersianNum(contract.provenance.independentEvidenceCount)} شاهد مستقل
          </strong>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">تفکیک تایید روش و واقعیت بیرونی</div>
          <strong className="font-black text-amber-800 dark:text-amber-300 block mt-0.5">
            تایید روش محاسبه ≠ قیمت قطعی ثبتی
          </strong>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
        <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
          <span>{contract.limitationsFa[0]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="btn-toggle-provenance-lineage"
            onClick={() => setExpandedTab(expandedTab === 'LINEAGE' ? 'NONE' : 'LINEAGE')}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
            <span>مشاهده منشأ و روش‌شناسی</span>
          </button>
          <button
            type="button"
            data-testid="btn-toggle-provenance-versions"
            onClick={() => setExpandedTab(expandedTab === 'VERSIONS' ? 'NONE' : 'VERSIONS')}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
            <span>تاریخچه نسخه و مقایسه (Diff)</span>
          </button>
          <button
            type="button"
            data-testid="btn-toggle-provenance-correction"
            onClick={() => setExpandedTab(expandedTab === 'CORRECTION' ? 'NONE' : 'CORRECTION')}
            className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
          >
            پیشنهاد اصلاح مستند داده
          </button>
        </div>
      </div>

      {expandedTab === 'LINEAGE' && (
        <div data-testid="provenance-lineage-drawer" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
            <span>زنجیره منشأ داده (Data Lineage) و منابع قابل انتشار:</span>
          </strong>
          {lineageEdges.length === 0 ? (
            <p className="text-[11px] text-slate-500">زنجیره منشأ ثبت‌شده‌ای برای «{resolvedNameFa}» موجود نیست.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {lineageEdges.map((edge) => (
                <span key={edge.id} className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
                  {edge.parentId} → [{edge.transformationId}] → {edge.childId}
                </span>
              ))}
            </div>
          )}
          {contract.provenance.attributionFa.length > 0 && (
            <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
              {contract.provenance.attributionFa.map((attr, idx) => (
                <li key={idx}>{attr}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expandedTab === 'VERSIONS' && (
        <div data-testid="provenance-versions-drawer" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <strong className="font-black text-slate-900 dark:text-white block">
            مقایسه نسخه‌های تاریخی شاخص (تفکیک Data Version و Methodology Version):
          </strong>
          {diff ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div className="text-slate-500">نسخه قبلی (Data: {diff.previousDataVersion} · Method v{diff.previousMethodologyVersion})</div>
                <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  مقدار: {toPersianNum(diff.previousValue)} میلیون/متر · وضعیت: {diff.previousQualityStatus}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="text-emerald-800 dark:text-emerald-300">نسخه فعلی (Data: {diff.newDataVersion} · Method v{diff.newMethodologyVersion})</div>
                <div className="font-bold text-emerald-950 dark:text-white mt-0.5">
                  مقدار: {toPersianNum(diff.newValue)} میلیون/متر · علت: {diff.changeReasonFa}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">تاریخچه نسخه کافی برای مقایسه در «{resolvedNameFa}» وجود ندارد.</p>
          )}
        </div>
      )}

      {expandedTab === 'CORRECTION' && (
        <div data-testid="provenance-correction-drawer" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>پیشنهاد اصلاح کاربر مستقیماً داده مرجع را تغییر نمی‌دهد؛ پس از بررسی شواهد در صف حاکمیت داده اعمال می‌شود.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="مقدار یا توضیح اصلاحی پیشنهادی..."
              value={proposedVal}
              onChange={(e) => setProposedVal(e.target.value)}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
            />
            <input
              type="text"
              placeholder="منبع یا شاهد پشتیبان (مثلاً کد نوسازی یا گزارش میدانی)..."
              value={proposalReason}
              onChange={(e) => setProposalReason(e.target.value)}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!proposedVal.trim() || !proposalReason.trim()) return;
              setProposalSubmittedFa('پیشنهاد اصلاح شما با وضعیت UNDER_REVIEW در صف بررسی حاکمیت داده ثبت شد.');
              setProposedVal('');
              setProposalReason('');
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
          >
            ثبت در صف بررسی انسانی
          </button>
          {proposalSubmittedFa && (
            <div className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{proposalSubmittedFa}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
