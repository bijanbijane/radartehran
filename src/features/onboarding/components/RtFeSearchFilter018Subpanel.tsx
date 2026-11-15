import React, { useMemo, useState } from 'react';
import { Filter, GitBranch, Search, Sparkles } from 'lucide-react';
import {
  RT_FE_SEARCH_FILTER_018_SPEC_ID, RT_FE_STAGE19_BRIDGE_SPEC_ID,
  RT_SEARCH_SUBSYSTEMS_10, RT_SEARCH_REGISTRY_6, RT_SEARCH_RESULT_STATES_10,
  RT_SEARCH_EXECUTION_PHASES_12, RT_SEARCH_DELIVERABLES_27,
  normalizeSearchTextPair, validateQueryTree, buildSearchCacheKey,
  sanitizeUrlQueryParams, evaluateNaturalLanguageQueryDraft,
} from '../services/rtFeSearchFilter018Engine';

type SearchTabId = 'subsystems_norm' | 'query_builder' | 'nl_url_cache' | 'phases_deliverables';

export const RtFeSearchFilter018Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SearchTabId>('subsystems_norm');
  const [rawSearch, setRawSearch] = useState<string>('فرمانيه‌ ۱۲۰ متري');
  const [qbField, setQbField] = useState<string>('area');
  const [qbOperator, setQbOperator] = useState<string>('between');
  const [qbLogic, setQbLogic] = useState<'AND' | 'OR'>('AND');
  const [nlSentence, setNlSentence] = useState<string>('خانه نزدیک مترو در شمال تهران با قیمت مناسب');
  const [accessScope, setAccessScope] = useState<'public' | 'private'>('private');

  const textPair = useMemo(() => normalizeSearchTextPair(rawSearch), [rawSearch]);
  const queryCheck = useMemo(
    () =>
      validateQueryTree({
        definitionId: 'property.search',
        node: {
          type: 'group',
          operator: qbLogic,
          children: [
            { type: 'condition', field: 'propertyType', operator: 'eq', value: 'apartment' },
            {
              type: 'condition',
              field: qbField,
              operator: qbOperator,
              value: qbOperator === 'between' ? [80, 130] : 'tehran',
            },
          ],
        },
      }),
    [qbField, qbOperator, qbLogic],
  );
  const nlDraft = useMemo(() => evaluateNaturalLanguageQueryDraft(nlSentence), [nlSentence]);
  const urlSanitized = useMemo(
    () => sanitizeUrlQueryParams('?q=apartment&minArea=80&token=secretJwt&cursor=c2&evilParam=1', true),
    [],
  );
  const cacheKey = useMemo(
    () =>
      buildSearchCacheKey({
        definitionId: 'property.search',
        accessScope,
        ownerId: 'user-42',
        normalizedQuery: textPair.normalized,
        sortField: 'createdAt.desc',
      }),
    [accessScope, textPair.normalized],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-search-018-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_SEARCH_FILTER_018_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۰ زیرسامانه · ۱۷ عملگر · Query Builder درختی · ۲۷ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله هجدهم: نظام جست‌وجو، فیلترگذاری، ساخت پرس‌وجو و کشف داده
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Query AST + Allowlist + Sync Map/List/Chart
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'subsystems_norm', label: '۱. ۱۰ زیرسامانه، Registry و نرمال‌ساز SearchText' },
            { id: 'query_builder', label: '۲. Query Builder درختی (AND/OR)، عملگرها و ۱۰ وضعیت' },
            { id: 'nl_url_cache', label: '۳. جست‌وجوی طبیعی، امنیت URL و ایزوله‌سازی Cache' },
            { id: 'phases_deliverables', label: '۴. نقشه ۱۲فازی و ۲۷ خروجی OUT-001..027' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as SearchTabId)} data-testid={`rt-fe-search-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'subsystems_norm' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Search className="w-4 h-4" /> جداسازی Original و Normalized Query (§۱۸.۹.۱) و Search Registry</h5>
            <input type="text" aria-label="عبارت جست‌وجو" data-testid="rt-fe-search-norm-input" value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <div data-testid="rt-fe-search-norm-out" className="rounded bg-slate-950 p-2 text-[11px] space-y-1 text-slate-200">
              <div>عبارت اصلی کاربر (original): <span className="text-amber-300">{textPair.original}</span></div>
              <div>عبارت نرمال‌شده جست‌وجو (normalized): <strong className="text-emerald-300">{textPair.normalized}</strong></div>
            </div>
            <div className="space-y-1">
              {RT_SEARCH_REGISTRY_6.map((reg) => (
                <div key={reg.id} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px]">
                  <span className="font-mono font-bold text-indigo-300" dir="ltr">{reg.id} ({reg.pagination})</span>
                  <span className="text-slate-300">{reg.entityType}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۰ زیرسامانه کلان جست‌وجو (§۱۸.۵)</h5>
            {RT_SEARCH_SUBSYSTEMS_10.map((sub) => (
              <div key={sub.step} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{sub.step}. {sub.nameEn}</span>
                <span className="text-slate-200">{sub.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'query_builder' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><GitBranch className="w-4 h-4 shrink-0" /> <span>اعتبارسنج درختی <span dir="ltr">Query Builder</span> (عملگرها و <span dir="ltr">Allowlist</span> — §۱۸.۱۴)</span></h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="rt-fe-search-logic-toggle" onClick={() => setQbLogic((l) => (l === 'AND' ? 'OR' : 'AND'))} className="rounded bg-indigo-700 px-2.5 py-1 text-[11px] font-bold text-white">عملگر گروه: <span dir="ltr">{qbLogic}</span></button>
              <select aria-label="انتخاب فیلد Query" data-testid="rt-fe-search-field-select" value={qbField} onChange={(e) => setQbField(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white" dir="rtl">
                <option value="area">فیلد area (مجاز)</option>
                <option value="location">فیلد location (مکانی)</option>
                <option value="secretSalary">فیلد secretSalary (غیرمجاز)</option>
              </select>
              <select aria-label="انتخاب عملگر" data-testid="rt-fe-search-op-select" value={qbOperator} onChange={(e) => setQbOperator(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white" dir="ltr">
                <option value="between">between [80, 130]</option>
                <option value="near">near (geo)</option>
                <option value="eq">eq</option>
              </select>
            </div>
            <div data-testid="rt-fe-search-query-verdict" className={`rounded p-2.5 text-[11px] font-bold ${queryCheck.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {queryCheck.reasonFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Filter className="w-4 h-4 shrink-0" /> <span>۱۰ وضعیت نتایج (§۱۸.۲۳) و هم‌زمانی نمایش مشترک (§۱۸.۲۹)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              {RT_SEARCH_RESULT_STATES_10.map((st) => (
                <span key={st} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{st}</span>
              ))}
            </div>
            <div className="rounded bg-slate-950 p-2 text-[10px] text-slate-300">
              نماهای فهرست املاک، نقاط روی نقشه و نمودار توزیع قیمت از یک <code className="text-emerald-300" dir="ltr">Shared Search Query</code> تغذیه می‌شوند؛ نتیجه ناقص هرگز به‌عنوان کامل نمایش داده نمی‌شود.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'nl_url_cache' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><Sparkles className="w-4 h-4 shrink-0" /> <span>مبدل عبارت طبیعی به <span dir="ltr">Query Draft</span> با تشخیص ابهام (§۱۸.۲۴)</span></h5>
            <input type="text" aria-label="جست‌وجوی زبان طبیعی" value={nlSentence} onChange={(e) => setNlSentence(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <div data-testid="rt-fe-search-nl-out" className="rounded bg-slate-950 p-2.5 text-[10px] space-y-1.5 text-slate-200">
              <div className="font-bold text-slate-300">شروط استخراج‌شده (پیش‌نویس ساختاریافته):</div>
              <pre className="max-h-36 overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-900/90 p-2 font-mono text-[10px] leading-relaxed text-emerald-300 text-left" dir="ltr">
                {JSON.stringify(nlDraft.extractedConditions, null, 2)}
              </pre>
              {nlDraft.ambiguousTerms.length > 0 && <div className="text-amber-300 font-bold">موارد مبهم نیازمند تأیید: {nlDraft.ambiguousTerms.join('، ')}</div>}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">پاک‌سازی نشانی اینترنتی (§۱۸.۲۰) و ایزوله‌سازی کلید <span dir="ltr">Cache</span> (§۱۸.۲۸)</h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAccessScope('public')} className={`rounded px-2 py-1 text-[11px] font-bold ${accessScope === 'public' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Public Cache</button>
              <button type="button" onClick={() => setAccessScope('private')} className={`rounded px-2 py-1 text-[11px] font-bold ${accessScope === 'private' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Private Cache (user-42)</button>
            </div>
            <div className="rounded bg-slate-950 p-2.5 text-[10px] space-y-1.5 text-slate-200">
              <div>
                <span>کلیدهای حذف‌شده از آدرس: </span>
                <code className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono text-rose-300" dir="ltr">{urlSanitized.strippedKeys.join(', ')}</code>
              </div>
              <div>
                <span>بازنشانی Cursor در تغییر فیلتر: </span>
                <strong className="text-emerald-300">{urlSanitized.cursorResetApplied ? 'بله' : 'خیر'}</strong>
              </div>
              <div>
                <div className="mb-1 text-slate-300">کلید ایزوله Cache:</div>
                <code className="block break-words whitespace-pre-wrap rounded bg-slate-900/90 p-1.5 font-mono text-cyan-300 text-left" dir="ltr">{cacheKey}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phases_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">نقشه اجرای ۱۲فازی (§۱۸.۴۰)</h5>
            {RT_SEARCH_EXECUTION_PHASES_12.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: </strong><span className="text-slate-200">{ph.titleFa}</span> <span className="font-mono text-indigo-300" dir="ltr">({ph.outputId})</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۱۹: <code className="font-mono" dir="ltr">{RT_FE_STAGE19_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۲۷ خروجی نهایی مرحله هجدهم (OUT-001 تا OUT-027)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_SEARCH_DELIVERABLES_27.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
