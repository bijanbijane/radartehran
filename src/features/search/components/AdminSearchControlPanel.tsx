/**
 * RT-UI-SEARCH-001 (Stage 27 §24 & Stage 30 §21) | Admin Global Search Control Panel
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, RefreshCw, Search, Sliders, Sparkles } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { SearchScope } from '../models/search.types';
import { executePlatformApiRequest } from '../../../platform/api/client/apiClient';

type AdminDiagnostics = {
  totalIndexedDocuments: number;
  tombstoneCount: number;
  synonyms: Array<{ id: string; canonicalTerm: string; variants: string[] }>;
  rankingPolicies: Array<{ scope: string; version: string; weights: { textualRelevance: number; exactEntityMatch: number } }>;
  recentIndexJobs: Array<{ id: string; jobType: string; status: string; documentsProcessed: number; lagMs: number }>;
};

export const AdminSearchControlPanel: React.FC = () => {
  const [diag, setDiag] = useState<AdminDiagnostics | null>(null);
  const [newCanonical, setNewCanonical] = useState('');
  const [newVariants, setNewVariants] = useState('');
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    const data = await executePlatformApiRequest<AdminDiagnostics>({
      path: '/api/admin/search/overview',
      method: 'GET',
    });
    setDiag(data);
  }, []);

  useEffect(() => {
    void loadDiagnostics().catch(() => undefined);
  }, [loadDiagnostics]);

  const handleTriggerReindex = async (scope: SearchScope) => {
    const idempotencyKey = `reindex-${scope}-${Date.now()}`;
    const out = await executePlatformApiRequest<{ jobId: string; status: string }>({
      path: '/api/admin/search/reindex',
      method: 'POST',
      body: { scope },
      idempotencyKey,
    });
    await loadDiagnostics();
    setFeedbackFa(
      `درخواست بازسازی نمایه (${scope}) ثبت شد · شناسه Job: ${out.jobId} · وضعیت فعلی: ${out.status} (اجرای پس‌زمینه).`
    );
  };

  if (!diag) {
    return (
      <section data-testid="admin-search-control-panel" className="p-4 text-xs" dir="rtl">
        در حال بارگذاری پنل مدیریت جست‌وجو…
      </section>
    );
  }

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
        </div>
        <button
          type="button"
          data-testid="btn-admin-reindex-all"
          onClick={() => void handleTriggerReindex('ALL')}
          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>درخواست بازسازی نمایه (Full Reindex)</span>
        </button>
      </div>

      {feedbackFa && (
        <div data-testid="admin-search-feedback" className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackFa}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] text-slate-500">اسناد فعال در نمایه</div>
          <strong className="text-base font-black block mt-0.5 tabular-nums">{toPersianNum(diag.totalIndexedDocuments)} سند</strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] text-slate-500">Tombstone</div>
          <strong className="text-base font-black block mt-0.5 tabular-nums">{toPersianNum(diag.tombstoneCount)}</strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] text-slate-500">مترادف‌ها</div>
          <strong className="text-base font-black block mt-0.5 tabular-nums">{toPersianNum(diag.synonyms.length)}</strong>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] text-slate-500">آخرین Job</div>
          <strong className="text-base font-black block mt-0.5">{diag.recentIndexJobs[0]?.status ?? '—'}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <strong className="font-black flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            واژه‌نامه (فقط خواندنی از API)
          </strong>
          {diag.synonyms.slice(0, 6).map((syn) => (
            <span key={syn.id} className="block text-[10.5px]">
              <strong>{syn.canonicalTerm}</strong> ← {syn.variants.join('، ')}
            </span>
          ))}
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <strong className="font-black flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
            سیاست‌های رتبه‌بندی
          </strong>
          {diag.rankingPolicies.slice(0, 4).map((pol) => (
            <div key={pol.scope} className="text-[10.5px] flex justify-between">
              <span>{pol.scope} ({pol.version})</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                متن {toPersianNum(Math.round(pol.weights.textualRelevance * 100))}٪
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};