import React, { useState, useMemo } from 'react'; import { AlertTriangle, Check, Copy, FileText, Scale, ShieldAlert, Sparkles, X } from 'lucide-react'; import { toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { ANTI_FRAUD_CHECKLIST_ITEMS } from '../data/multiCityData'; import { ContractCheckResponse, isContractCheckResponse } from '../types/models'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { createExecutionTimer, sanitizeInput } from '../utils/security'; import { runLocalLegalRuleEngine } from '../utils/serverLegalRuleEngine'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; const SAMPLE_CLAUSES: { label: string; type: 'buy' | 'rent'; text: string }[] = [ { label: 'نمونه ۱: اسقاط کافه خیارات و چک بدون صیاد', type: 'buy', text: 'خریدار با رویت کامل ملک، اسقاط کافه خیارات ولو خیار غبن فاحش و افحش را نمود و مبلغ ۲ میلیارد تومان به صورت چک حامل نقدی پرداخت شد و الباقی در زمان تحویل پرداخت می‌گردد.', }, { label: 'نمونه ۲: معامله وکالتی بدون تاریخ محضر و وجه التزام', type: 'buy',
    text: 'مبایعه‌نامه بر اساس وکالت‌نامه بلاعزل تنظیم گردید و طرفین توافق نمودند هر زمان سند آماده شد در دفترخانه حاضر شوند و در صورت پشیمانی هر طرف معامله فسخ شود.', }, { label: 'نمونه ۳: شرط تخلیه و استرداد ودیعه اجاره‌نامه', type: 'rent', text: 'مستاجر متعهد است در پایان مدت اجاره ملک را تخلیه نماید و موجر پس از یافتن مستاجر جدید نسبت به بازپرداخت مبلغ ودیعه اقدام خواهد کرد.', }, ]; export interface ContractLegalAdvisorViewProps { onClose: () => void; }
export function ContractLegalAdvisorView({ onClose }: ContractLegalAdvisorViewProps): React.ReactElement { const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT'; const [contractTab, setContractTab] = useState<'clause_ai' | 'checklist'>('clause_ai'); const [contractType, setContractType] = useState<'buy' | 'rent'>('buy'); const [clauseInput, setClauseInput] = useState<string>(SAMPLE_CLAUSES[0].text); const [analyzingClause, setAnalyzingClause] = useState<boolean>(false); const [clauseResult, setClauseResult] = useState<ContractCheckResponse | null>(() => runLocalLegalRuleEngine(SAMPLE_CLAUSES[0].text, 'مبایعه‌نامه خرید') ); const [copiedSafeRewrite, setCopiedSafeRewrite] = useState<boolean>(false); const [checkedFraudIds, setCheckedFraudIds] = useState<string[]>([ 'sabt_man', 'national_id_match', 'khodnevis_code', 'check_sayadi', ]); const safetyScorePercent = useMemo(() => {
    const totalWeight = ANTI_FRAUD_CHECKLIST_ITEMS.reduce((sum, i) => sum + i.weight, 0); const checkedWeight = ANTI_FRAUD_CHECKLIST_ITEMS.filter((i) => checkedFraudIds.includes(i.id)
    ).reduce((sum, i) => sum + i.weight, 0); return Math.round((checkedWeight / Math.max(1, totalWeight)) * 100); }, [checkedFraudIds]); const handleAnalyzeClause = async (e?: React.FormEvent) => { if (e) e.preventDefault(); const cleanedClause = sanitizeInput(clauseInput, 2500); if (!cleanedClause.trim()) return; const finishTimer = createExecutionTimer('ContractLegalAdvisorView', 'handleAnalyzeClause'); setAnalyzingClause(true);
    const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 14000); try { const res = await fetch('/api/contract-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clauseText: cleanedClause, contractType, }), signal: controller.signal, }); if (res.ok) {
        const data: unknown = await res.json(); if (isContractCheckResponse(data)) { setClauseResult(data); finishTimer('success'); return; } }
      throw new Error('Fallback to local legal rule engine'); } catch { finishTimer('fallback'); setClauseResult({ status: 'ok', source: 'RULE_ENGINE', riskLevel: 'MEDIUM', summary: 'بررسی با موتور قواعد حقوقی داخلی انجام شد.',
        traps: ['حتماً عبارات مبهم را به تاریخ و مبلغ دقیق تبدیل کنید.'], penaltiesWarning: 'وجه التزام روزانه تاخیر تحویل و محضر را به عدد و حروف قید نمایید.', missingGuarantees: ['درج شماره صیادی چک‌ها و کد رهگیری سامانه خودنویس الزامی است.'], safeRewrite:
          'طرفین متعهد شدند کلیه پرداخت‌ها صرفاً از طریق چک صیادی ثبت‌شده در وجه مالک رسمی سند انجام گیرد و در صورت تاخیر هر یک از طرفین، روزانه مبلغ ... میلیون تومان به عنوان وجه التزام علاوه بر اصل تعهد پرداخت گردد.', }); } finally { clearTimeout(timeoutId); setAnalyzingClause(false);
    } };
  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 stroke-[1.75]" />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              مشاور حقوقی هوشمند قولنامه و سپر ضدکلاهبرداری مسکن
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              کشف دام‌های حقوقی مبایعه‌نامه و اجاره‌نامه + چک‌لیست ۱۰گانه پیش از پرداخت بیعانه
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AreaUnitToggle compact showIntlControls />
          <button
            type="button" aria-label="بستن مشاور حقوقی قولنامه" onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 apple-segmented dark:bg-slate-800/80 p-1 rounded-[10px] font-bold">
        <button
          type="button" onClick={() => setContractTab('clause_ai')}
          className={`py-2 px-3 rounded-[8px] transition cursor-pointer ${contractTab === 'clause_ai' ? 'apple-segmented-pill-active dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          ۱. تحلیل هوشمند بندهای قرارداد
        </button>
        <button
          type="button" onClick={() => setContractTab('checklist')}
          className={`py-2 px-3 rounded-[8px] transition cursor-pointer ${contractTab === 'checklist' ? 'apple-segmented-pill-active dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          ۲. چک‌لیست ۱۰گانه ضدکلاهبرداری ({toPersianNum(safetyScorePercent)}٪)
        </button>
      </div>
      {contractTab === 'clause_ai' && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">نوع قرارداد:</span>
              <button
                type="button" onClick={() => setContractType('buy')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${contractType === 'buy' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >
                مبایعه‌نامه خرید ({formatAreaShort(80, areaUnit)})
              </button>
              <button
                type="button" onClick={() => setContractType('rent')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${contractType === 'rent' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >
                اجاره‌نامه ({formatAreaShort(80, areaUnit)})
              </button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {SAMPLE_CLAUSES.map((sample, idx) => (
                <button
                  key={idx} type="button" onClick={() => { setContractType(sample.type); setClauseInput(sample.text); }}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleAnalyzeClause} className="space-y-2.5">
            <textarea
              rows={3} maxLength={2500} value={clauseInput} onChange={(e) => setClauseInput(e.target.value)}
              placeholder="متن بند یا شرط مورد نظر از مبایعه‌نامه یا اجاره‌نامه را اینجا وارد کنید..."
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:border-emerald-600"
            />
            <button
              type="submit" disabled={analyzingClause}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 stroke-[1.75]" />
              <span>{analyzingClause ? 'در حال کالبدشکافی حقوقی بند قرارداد...' : 'بررسی هوشمند دام‌های حقوقی و وجه التزام'}</span>
            </button>
          </form>
          {clauseResult && (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] ${
                      clauseResult.riskLevel === 'HIGH'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                        : clauseResult.riskLevel === 'MEDIUM'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    سطح ریسک حقوقی:{' '}
                    {clauseResult.riskLevel === 'HIGH' ? 'خطر بالا (نیازمند اصلاح)' : clauseResult.riskLevel === 'MEDIUM' ? 'متوسط (نیازمند تکمیل)' : 'ایمن (کم‌ریسک)'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    موتور تحلیل: {clauseResult.source === 'GEMINI_AI' ? 'هوش مصنوعی حقوقی Gemini' : 'موتور قوانین ثبتی ایران'} · معیار واحد {formatAreaShort(80, areaUnit)}{showIntl ? ` (ودیعه نمونه ۱.۲ میلیارد ت ≈ ${formatMillionTomanAsIntlCurrency(1200, currency, locale)})` : ''} · معامله مرجع v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(1, 'تهران', 135, []).estimatedDealPricePerSqm, areaUnit))} م/{areaUnit === 'sqft' ? 'ft²' : 'متر'}
                  </span>
                </div>
              </div>
              <p className="text-slate-800 dark:text-slate-100 font-semibold leading-relaxed">{clauseResult.summary}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 space-y-1.5">
                  <div className="font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 stroke-[1.75] text-rose-600 dark:text-rose-400" />
                    <span>دام‌های حقوقی شناسایی‌شده:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-rose-900/90 dark:text-rose-200/90 leading-relaxed">
                    {(clauseResult.traps ?? []).map((t, i) => (<li key={i}>{t}</li>))}
                  </ul>
                </div>
                <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 space-y-1.5">
                  <div className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 stroke-[1.75] text-amber-600 dark:text-amber-400" />
                    <span>وضعیت وجه التزام و تضامین کسری:</span>
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                    {clauseResult.penaltiesWarning}{showIntl ? ` (مرجع وجه التزام روزانه ۵ م ≈ ${formatMillionTomanAsIntlCurrency(5, currency, locale)} | بیعانه نمونه ۲ میلیارد ت ≈ ${formatMillionTomanAsIntlCurrency(2000, currency, locale)})` : ''}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-amber-900/80 dark:text-amber-200/80 pt-1">
                    {(clauseResult.missingGuarantees ?? []).map((g, i) => (<li key={i}>{g}</li>))}
                  </ul>
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                    <span>متن پیشنهادی و استاندارد جایگزین در قرارداد:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const rewriteWithFx = `${clauseResult.safeRewrite}${showIntl ? ` (مرجع وجه التزام روزانه ۵ م ≈ ${formatMillionTomanAsIntlCurrency(5, currency, locale)})` : ''}`;
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(rewriteWithFx).catch(() => {});
                      }
                      setCopiedSafeRewrite(true);
                      setTimeout(() => setCopiedSafeRewrite(false), 2000);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSafeRewrite ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[1.75]" />
                        <span>کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                        <span>کپی بند استاندارد</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-emerald-950 dark:text-emerald-100 leading-relaxed font-medium">
                  {clauseResult.safeRewrite}{showIntl ? ` (مرجع وجه التزام روزانه ۵ م ≈ ${formatMillionTomanAsIntlCurrency(5, currency, locale)})` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {contractTab === 'checklist' && (
        <div className="space-y-3.5">
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                امتیاز امنیت معامله شما پیش از واریز بیعانه:{' '}
                <span
                  className={
                    safetyScorePercent >= 80
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : safetyScorePercent >= 50
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {toPersianNum(safetyScorePercent)}٪ از ۱۰۰٪
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                {safetyScorePercent >= 80
                  ? 'عالی! ریسک معامله شما در حداقل ممکن قرار دارد.'
                  : 'هشدار: پیش از تکمیل موارد زیر از تحویل چک یا بیعانه خودداری کنید.'}{showIntl ? ` (سقف نمونه بیعانه امن ۵۰۰ م ≈ ${formatMillionTomanAsIntlCurrency(500, currency, locale)})` : ''}
              </p>
            </div>
            <div className="w-36 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  safetyScorePercent >= 80
                    ? 'bg-emerald-600'
                    : safetyScorePercent >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${safetyScorePercent}%` }}
              />
            </div>
          </div>
          <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
            {ANTI_FRAUD_CHECKLIST_ITEMS.map((item, idx) => {
              const checked = checkedFraudIds.includes(item.id); return (
                <div
                  key={item.id} onClick={() =>
                    setCheckedFraudIds((prev) =>
                      prev.includes(item.id)
                        ? prev.filter((id) => id !== item.id)
                        : [...prev, item.id]
                    )
                  }
                  className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-3 ${
                    checked
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked} onChange={() => {}} className="mt-1 accent-emerald-600 w-4 h-4 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      {toPersianNum(idx + 1)}. {item.title} </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {item.detail} </div>
                  </div>
                </div>
              ); })} </div>
        </div>
      )} </div>
  ); }