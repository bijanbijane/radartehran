/**
 * RT-UI-SEARCH-001 (Stage 27 §24 & Stage 30 §21) | Admin Global Search Control Panel
 * Covers: Search Index Overview, Controlled Reindex Trigger, Synonym & Place Alias Registry,
 * Versioned Ranking Policies, and Zero-Result Query Quality Analyzer.
 */

import React, { useState } from 'react';
import { BookOpen, CheckCircle2, RefreshCw, Search, Sliders, Sparkles } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { defaultSearchEngine } from '../services/searchOrchestratorEngine';
import type { SearchScope } from '../models/search.types';

export const AdminSearchControlPanel: React.FC = () => {
  const [diag, setDiag] = useState(() => defaultSearchEngine.getAdminDiagnostics());
  const [newCanonical, setNewCanonical] = useState('');
  const [newVariants, setNewVariants] = useState('');
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);

  const handleTriggerReindex = (scope: SearchScope) => {
    const job = defaultSearchEngine.triggerReindex(scope);
    setDiag(defaultSearchEngine.getAdminDiagnostics());
    setFeedbackFa(
      `عملیات بازسازی نمایه (${job.jobType}) برای حوزه «${scope}» با پردازش ${toPersianNum(job.documentsProcessed)} سند تکمیل شد.`
    );
  };

  const handleAddSynonym = () => {
    if (!newCanonical.trim() || !newVariants.trim()) return;
    defaultSearchEngine.addSynonym({
      canonicalTerm: newCanonical.trim(),
      variants: newVariants.split('،').map((s) => s.trim()).filter(Boolean),
      domainScope: 'PROPERTIES',
      active: true,
      updatedBy: 'Search Admin',
    });
    setDiag(defaultSearchEngine.getAdminDiagnostics());
    setFeedbackFa(`مترادف جدید برای «${newCanonical.trim()}» در واژه‌نامه جست‌وجو ثبت شد.`);
    setNewCanonical('');
    setNewVariants('');
  };

  return (
    <section
      data-testid="admin-search-control-panel"
      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Search className="w-4 h-4 text-emerald-600" />
            <span>پنل مدیریت جست‌وجوی سراسری، واژه‌نامه مترادف‌ها و سلامت نمایه (/admin/search)</span>
          </strong>
          <p className="text-[11px] text-slate-500 mt-0.5">
            پایش اسناد نمایه‌شده، Tombstoneها، قواعد نرمال‌سازی فارسی، نسخه‌های سیاست رتبه‌بندی و عبارت‌های بدون نتیجه
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="btn-admin-reindex-all"
            onClick={() => handleTriggerReindex('ALL')}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>بازسازی کنترل‌شده نمایه (Full Reindex)</span>
          </button>
        </div>
      </div>

      {feedbackFa && (
        <div
          data-testid="admin-search-feedback"
          className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackFa}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">اسناد فعال در نمایه</div>
          <strong className="text-base font-black text-slate-900 dark:text-white block mt-0.5 tabular-nums">
            {toPersianNum(diag.totalIndexedDocuments)} سند
          </strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">رکوردهای حذف‌شده (Tombstone)</div>
          <strong className="text-base font-black text-amber-700 dark:text-amber-400 block mt-0.5 tabular-nums">
            {toPersianNum(diag.tombstoneCount)} مورد
          </strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">مترادف‌های فعال فارسی</div>
          <strong className="text-base font-black text-emerald-700 dark:text-emerald-400 block mt-0.5 tabular-nums">
            {toPersianNum(diag.synonyms.length)} گروه
          </strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] text-slate-500">تاخیر همگام‌سازی نمایه (Lag)</div>
          <strong className="text-base font-black text-slate-900 dark:text-white block mt-0.5 tabular-nums">
            {toPersianNum(diag.recentIndexJobs[0]?.lagMs ?? 28)} میلی‌ثانیه
          </strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span>مدیریت واژه‌نامه مترادف‌ها (با حفظ تفکیک اداری و تجاری):</span>
          </strong>
          <div className="flex flex-wrap gap-1.5">
            {diag.synonyms.slice(0, 6).map((syn) => (
              <span key={syn.id} className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px]">
                <strong>{syn.canonicalTerm}</strong> ← {syn.variants.join('، ')}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <input
              type="text"
              placeholder="واژه معیار (مثلاً ویلا)"
              value={newCanonical}
              onChange={(e) => setNewCanonical(e.target.value)}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 flex-1"
            />
            <input
              type="text"
              placeholder="هم‌ارزها با ویرگول (خانه ویلایی، باغ‌ویلا)"
              value={newVariants}
              onChange={(e) => setNewVariants(e.target.value)}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 flex-1"
            />
            <button
              type="button"
              onClick={handleAddSynonym}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer"
            >
              افزودن
            </button>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
            <span>نسخه‌های سیاست رتبه‌بندی (Ranking Policy Versioning):</span>
          </strong>
          <div className="space-y-1">
            {diag.rankingPolicies.slice(0, 4).map((pol) => (
              <div key={pol.scope} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span>
                  حوزه <strong>{pol.scope}</strong> ({pol.version})
                </span>
                <span className="text-[10.5px] text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  متن: {toPersianNum(Math.round(pol.weights.textualRelevance * 100))}٪ · مکان: {toPersianNum(Math.round(pol.weights.exactEntityMatch * 100))}٪
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
