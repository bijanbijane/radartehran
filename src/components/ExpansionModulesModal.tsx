import React, { useState, useEffect, useMemo } from 'react'; import { Calculator, CheckCircle2, Copy, RefreshCw, Send, X } from 'lucide-react'; import { Neighborhood, toPersianNum } from '../data/neighborhoods'; import { calculateOfficialCommissionAndNotary, CityId } from '../data/multiCityData'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { clampNumber, createExecutionTimer, recordDiagnosticEvent } from '../utils/security'; import { auth } from '../firebase'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { ContractLegalAdvisorView } from './ContractLegalAdvisorView'; import { useDialogFocus } from './useDialogFocus'; export type ExpansionModalType = 'commission' | 'contract' | 'telegram' | null; export interface ExpansionModulesModalProps { activeModal: ExpansionModalType; onClose: () => void; selectedHood: Neighborhood; activeCity?: CityId; defaultMode: 'rent' | 'buy'; defaultBuyBudgetMillion: number; defaultDepositMillion: number; defaultMonthlyRentMillion: number; defaultSqm?: number; }
function formatTomanReadable(toman: number): string { const safeToman = Number.isFinite(toman) ? Math.max(0, toman) : 0; const million = Math.round((safeToman / 1_000_000) * 10) / 10; if (million >= 1000) { const billion = Math.round((million / 1000) * 100) / 100; return `${toPersianNum(billion)} میلیارد تومان (${toPersianNum(Math.round(million))} میلیون)`;
  } return `${toPersianNum(million)} میلیون تومان`;
} export function ExpansionModulesModal({ activeModal, onClose, selectedHood, activeCity = 'tehran', defaultMode, defaultBuyBudgetMillion, defaultDepositMillion, defaultMonthlyRentMillion, defaultSqm = 85, }: ExpansionModulesModalProps) { const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const dialogRef = useDialogFocus(Boolean(activeModal), onClose); const [commDealType, setCommDealType] = useState<'buy' | 'rent'>(defaultMode); const [commSqm, setCommSqm] = useState<number>(defaultSqm || 85); const [commPricePerSqm, setCommPricePerSqm] = useState<number>((selectedHood as any)?.baseBuyPerSqm ?? selectedHood?.buyPerSqm ?? 135); const [commDeposit, setCommDeposit] = useState<number>(defaultDepositMillion || selectedHood?.rahn80m || 1500); const [commMonthlyRent, setCommMonthlyRent] = useState<number>(defaultMonthlyRentMillion || 15); const [copiedCommission, setCopiedCommission] = useState<boolean>(false); useEffect(() => { if (selectedHood) { setCommPricePerSqm((selectedHood as any)?.baseBuyPerSqm ?? selectedHood.buyPerSqm); setCommDeposit(selectedHood.rahn80m); }
  }, [selectedHood]); useEffect(() => { setCommDealType(defaultMode); }, [defaultMode]); useEffect(() => { if (defaultSqm && defaultSqm >= 25 && defaultSqm <= 1000) setCommSqm(defaultSqm); }, [defaultSqm]); const commBuyTotalMillion = useMemo(() => Math.round(clampNumber(commSqm, 20, 2000, 85) * clampNumber(commPricePerSqm, 5, 2000, 135)), [commSqm, commPricePerSqm]); const commResult = useMemo(() => calculateOfficialCommissionAndNotary({ dealType: commDealType, buyTotalMillion: commBuyTotalMillion || defaultBuyBudgetMillion, depositMillion: commDeposit, monthlyRentMillion: commMonthlyRent,
  }), [commDealType, commBuyTotalMillion, defaultBuyBudgetMillion, commDeposit, commMonthlyRent]);
  const fmtFee = (toman: number) => `${formatTomanReadable(toman)}${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(toman / 1_000_000, intlCurrency, locale)})` : ''}`;
  const uCommPrice = convertPricePerSqmToUnit(commPricePerSqm, areaUnit); const uDealComm = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood?.id || 0, selectedHood?.name || 'تهران', commPricePerSqm, []).estimatedDealPricePerSqm, areaUnit);
  const handleCopyCommissionSheet = () => { const hoodName = selectedHood?.name || 'تهران'; const lines = [
      `📋 برگه رسمی محاسبه کمیسیون اتحادیه و هزینه محضر (محله ${hoodName})`,
      commDealType === 'buy'
        ? `• ارزش معامله خرید (${formatAreaValue(commSqm, areaUnit)}، ${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(uCommPrice)} میلیون): ${toPersianNum((commBuyTotalMillion / 1000).toFixed(2))} میلیارد تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(commBuyTotalMillion, intlCurrency, locale)})` : ''}`
        : `• مشخصات اجاره در محله ${hoodName}: ودیعه ${toPersianNum(commDeposit)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(commDeposit, intlCurrency, locale)})` : ''} + اجاره ماهانه ${toPersianNum(commMonthlyRent)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(commMonthlyRent, intlCurrency, locale)})` : ''}`,
      `• سهم قانونی کمیسیون هر طرف (نرخ مصوب اتحادیه): ${fmtFee(commResult.baseCommissionEachSideToman)} + ۱۰٪ مالیات ارزش افزوده (${fmtFee(commResult.vatEachSideToman)})`,
      ...(commDealType === 'buy'
        ? [
            `• برآورد مالیات نقل و انتقال دارایی (سهم فروشنده): ${fmtFee(commResult.transferTaxSellerToman)}`,
            `• برآورد حق‌الثبت دفترخانه (هر طرف ۵۰٪): ${fmtFee(commResult.buyerNotaryShareToman)}`,
          ]
        : []),
      `• جمع کل قابل پرداخت ${commDealType === 'buy' ? 'خریدار' : 'مستأجر'}: ${fmtFee(commResult.totalBuyerPayableToman)}`,
      `• جمع کل قابل پرداخت ${commDealType === 'buy' ? 'فروشنده' : 'موجر'}: ${fmtFee(commResult.totalSellerPayableToman)}`,
    ]; navigator.clipboard?.writeText(lines.join('\n')).catch(() => {}); setCopiedCommission(true); setTimeout(() => setCopiedCommission(false), 2000); }; const [telegramText, setTelegramText] = useState<string>(''); const [loadingTelegram, setLoadingTelegram] = useState<boolean>(false); const [copiedTelegram, setCopiedTelegram] = useState<boolean>(false); const [sendingTelegram, setSendingTelegram] = useState<boolean>(false); const [tgSendStatus, setTgSendStatus] = useState<{ type: 'success' | 'error'; text: string; } | null>(null); const fetchTelegramDigest = async (cityToFetch: CityId = activeCity) => { const finishTimer = createExecutionTimer('ExpansionModulesModal', 'fetchTelegramDigest'); setLoadingTelegram(true); const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 8000); try {
      const res = await fetch(`/api/telegram-digest?city=${encodeURIComponent(cityToFetch)}`, {
        signal: controller.signal, }); if (res.ok) { const data = await res.json(); if (data?.telegramText) { setTelegramText(data.telegramText); finishTimer('success'); } }
    } catch { finishTimer('fallback'); } finally { clearTimeout(timeoutId); setLoadingTelegram(false); } }; useEffect(() => { if (activeModal === 'telegram') {
      fetchTelegramDigest(activeCity); }
  }, [activeModal, activeCity]); const handleSendToTelegramWebhook = async (e: React.FormEvent) => { e.preventDefault(); if (sendingTelegram) return; setSendingTelegram(true); setTgSendStatus(null);
    const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 10000); try { const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      const res = await fetch(`/api/send-telegram?city=${encodeURIComponent(activeCity)}`, {
        method: 'POST', headers,
        body: JSON.stringify({ city: activeCity, text: telegramText }),
        signal: controller.signal,
      });
      const data = await res.json();
      setTgSendStatus({
        type: data?.sent ? 'success' : 'error',
        text: data?.message || 'پاسخ از سرور دریافت شد.',
      });
      recordDiagnosticEvent('ExpansionModulesModal', 'sendTelegramWebhook', data?.sent ? 'success' : 'fallback');
    } catch {
      setTgSendStatus({
        type: 'error',
        text: 'خطا در ارتباط با سرور؛ می‌توانید متن آماده را کپی و در تلگرام منتشر کنید.',
      });
    } finally {
      clearTimeout(timeoutId);
      setSendingTelegram(false);
    }
  };
  if (!activeModal) return null;
  const tgHoodSummary = `📊 نرخ فعلی ${selectedHood?.name || 'تهران'}: ${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(uCommPrice)} م (معامله: ${toPersianNum(uDealComm)} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uCommPrice, intlCurrency, locale)})` : ''} · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum((((selectedHood?.buyPerSqm || 135) * 80) / 1000).toFixed(1))} میلیارد | رهن (${formatAreaShort(80, areaUnit)}): ${toPersianNum(selectedHood?.rahn80m || 0)} م (اجاره ماهانه: ${toPersianNum(Math.round((selectedHood?.rahn80m || 0) * 0.03))} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(selectedHood?.rahn80m || 0, intlCurrency, locale)})` : ''}`;
  return (
    <div role="dialog" aria-modal="true" aria-label="ابزارهای تخصصی معاملات مسکن" onClick={onClose} className="fixed inset-0 bg-black/30 backdrop-blur-[3px] flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet max-w-3xl w-full p-5 max-h-[90vh] overflow-y-auto text-xs focus:outline-none">
        {activeModal === 'commission' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Calculator className="w-4 h-4 stroke-[1.75]" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    ماشین‌حساب رسمی کمیسیون املاک، مالیات و هزینه محضر
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    محاسبه دقیق نرخ مصوب اتحادیه مشاوران املاک + ۱۰٪ مالیات ارزش افزوده (مبنای محله{' '}
                    <strong className="text-slate-800">{selectedHood?.name || 'تهران'}</strong>)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" aria-label="بستن ماشین‌حساب کمیسیون" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"><X className="w-4 h-4 stroke-[2]" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 apple-segmented p-1 rounded-[10px] font-bold">
              <button
                type="button" onClick={() => setCommDealType('buy')}
                className={`py-2 rounded-[8px] transition cursor-pointer ${commDealType === 'buy' ? 'apple-segmented-pill-active text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                معامله خرید و فروش ملک
              </button>
              <button
                type="button" onClick={() => setCommDealType('rent')}
                className={`py-2 rounded-[8px] transition cursor-pointer ${commDealType === 'rent' ? 'apple-segmented-pill-active text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                معامله رهن و اجاره
              </button>
            </div>
            {commDealType === 'buy' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 apple-grouped-card p-4">
                <div>
                  <label className="block text-slate-600 mb-1">متراژ ملک ({formatAreaValue(commSqm, areaUnit)}):</label>
                  <input
                    type="number" min={25} max={1000} value={commSqm}
                    onChange={(e) => setCommSqm(clampNumber(e.target.value, 20, 1000, 85))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">قیمت هر متر (معادل {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(uCommPrice)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uCommPrice, intlCurrency, locale)}` : ''}):</label>
                  <input
                    type="number" min={10} max={2000} value={commPricePerSqm}
                    onChange={(e) => setCommPricePerSqm(clampNumber(e.target.value, 5, 2000, 135))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-emerald-700 tabular-nums"
                  />
                </div>
                <div className="flex flex-col justify-center bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-[11px] text-slate-500">ارزش کل معامله:</span>
                  <strong className="text-sm font-black text-slate-900 tabular-nums mt-0.5">
                    {toPersianNum((commBuyTotalMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(commBuyTotalMillion, intlCurrency, locale)})` : ''}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div>
                  <label className="block text-slate-600 mb-1">مبلغ ودیعه / رهن (میلیون تومان{commDeposit > 0 && intlCurrency !== 'IRT' ? ` • ${formatMillionTomanAsIntlCurrency(commDeposit, intlCurrency, locale)}` : ''}):</label>
                  <input
                    type="number" min={0} max={50000} value={commDeposit}
                    onChange={(e) => setCommDeposit(clampNumber(e.target.value, 0, 50000, 500))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-emerald-700 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">اجاره ماهانه (میلیون تومان{commMonthlyRent > 0 && intlCurrency !== 'IRT' ? ` • ${formatMillionTomanAsIntlCurrency(commMonthlyRent, intlCurrency, locale)}` : ''}):</label>
                  <input
                    type="number" min={0} max={2000} value={commMonthlyRent}
                    onChange={(e) => setCommMonthlyRent(clampNumber(e.target.value, 0, 2000, 15))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-slate-900 tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[11px]"><span className="text-slate-500">معادل رهن کامل مبنای کمیسیون ({formatAreaShort(commSqm, areaUnit)}):</span><strong className="font-black text-emerald-700 tabular-nums">{toPersianNum(Math.round(commDeposit + (commMonthlyRent * 100) / 3))} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.round(commDeposit + (commMonthlyRent * 100) / 3), intlCurrency, locale)})` : ''}</strong></div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2">
                  <span className="font-extrabold text-emerald-950 text-sm">
                    {commDealType === 'buy' ? 'سهم پرداختی خریدار' : 'سهم پرداختی مستاجر'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">نرخ مصوب اتحادیه</span>
                </div>
                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>حق کمیسیون پایه املاک:</span>
                    <strong className="tabular-nums text-slate-900">{fmtFee(commResult.baseCommissionEachSideToman)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                    <strong className="tabular-nums text-slate-900">{fmtFee(commResult.vatEachSideToman)}</strong>
                  </div>
                  {commDealType === 'buy' && (
                    <div className="flex justify-between">
                      <span>سهم خریدار از هزینه ثبت دفترخانه (۵۰٪):</span>
                      <strong className="tabular-nums text-slate-900">{fmtFee(commResult.buyerNotaryShareToman)}</strong>
                    </div>
                  )}
                </div>
                <div className="pt-2.5 border-t border-emerald-200 flex items-center justify-between">
                  <span className="font-extrabold text-emerald-950">{commDealType === 'buy' ? 'جمع کل قابل پرداخت خریدار:' : 'جمع کل قابل پرداخت مستاجر:'}</span>
                  <span className="text-sm font-black text-emerald-700 tabular-nums">{fmtFee(commResult.totalBuyerPayableToman)}</span>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-extrabold text-slate-900 text-sm">
                    {commDealType === 'buy' ? 'سهم پرداختی فروشنده' : 'سهم پرداختی موجر (مالک)'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">شامل مالیات و محضر</span>
                </div>
                <div className="space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>حق کمیسیون پایه املاک:</span>
                    <strong className="tabular-nums text-slate-900">{fmtFee(commResult.baseCommissionEachSideToman)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                    <strong className="tabular-nums text-slate-900">{fmtFee(commResult.vatEachSideToman)}</strong>
                  </div>
                  {commDealType === 'buy' && (
                    <>
                      <div className="flex justify-between">
                        <span>مالیات نقل و انتقال دارایی (برآورد دفترچه ارزش معاملاتی):</span>
                        <strong className="tabular-nums text-slate-900">{fmtFee(commResult.transferTaxSellerToman)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>سهم فروشنده از حق‌الثبت دفترخانه (۵۰٪ تعرفه ثبت):</span>
                        <strong className="tabular-nums text-slate-900">{fmtFee(commResult.sellerNotaryShareToman)}</strong>
                      </div>
                    </>
                  )}
                </div>
                <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">{commDealType === 'buy' ? 'جمع کل قابل پرداخت فروشنده:' : 'جمع کل قابل پرداخت موجر:'}</span>
                  <span className="text-sm font-black text-slate-900 tabular-nums">{fmtFee(commResult.totalSellerPayableToman)}</span>
                </div>
              </div>
            </div>
            <button
              type="button" onClick={handleCopyCommissionSheet}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            >
              {copiedCommission ? (
                <><CheckCircle2 className="w-4 h-4 stroke-[1.75]" /><span>برگه محاسبه کمیسیون کپی شد!</span></>
              ) : (
                <><Copy className="w-4 h-4 stroke-[1.75]" /><span>کپی برگه رسمی محاسبه کمیسیون اتحادیه و هزینه محضر</span></>
              )}
            </button>
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-[11px] text-slate-600 leading-relaxed">
              نکته قانونی: دریافت هرگونه وجه اضافه تحت عنوان «حق التحریر قولنامه» یا «کد رهگیری» خارج از تعرفه پلکانی فوق ممنوع است و بنگاه موظف به صدور رسید رسمی ممهور به مهر اتحادیه می‌باشد.
            </div>
          </div>
        )}
        {activeModal === 'contract' && <ContractLegalAdvisorView onClose={onClose} />}
        {activeModal === 'telegram' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 stroke-[1.75]" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">خروجی خودکار شکارها و نبض بازار برای کانال تلگرام</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">تولید خودکار پست استاندارد روزانه + اتصال مستقیم به ربات تلگرام (Webhook)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" aria-label="بستن خروجی تلگرام" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"><X className="w-4 h-4 stroke-[2]" /></button>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-700">پیش‌نمایش پست آماده انتشار در تلگرام ({tgHoodSummary}):</span>
                <button
                  type="button" onClick={() => fetchTelegramDigest(activeCity)} disabled={loadingTelegram}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 stroke-[1.75] ${loadingTelegram ? 'animate-spin' : ''}`} />
                  <span>تولید مجدد از آخرین قیمت‌ها</span>
                </button>
              </div>
              <textarea
                rows={10} value={telegramText} onChange={(e) => setTelegramText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-slate-900 leading-relaxed font-medium focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => {
                  const textToCopy = intlCurrency !== 'IRT' || areaUnit === 'sqft' ? `${telegramText}\n${tgHoodSummary}` : telegramText;
                  navigator.clipboard?.writeText(textToCopy).catch(() => {}); setCopiedTelegram(true); setTimeout(() => setCopiedTelegram(false), 2200); }} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                {copiedTelegram ? (
                  <><CheckCircle2 className="w-4 h-4 stroke-[1.75]" /><span>پست تلگرام در حافظه کپی شد!</span></>
                ) : (
                  <><Copy className="w-4 h-4 stroke-[1.75]" /><span>کپی پست آماده کانال تلگرام</span></>
                )} </button>
            </div>
            <form onSubmit={handleSendToTelegramWebhook} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Send className="w-4 h-4 stroke-[1.75] text-emerald-600" />
                <span>ارسال مستقیم به کانال رسمی تلگرام (از طریق تنظیمات امن سرور ویژه ادمین)</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                توکن ربات و شناسه کانال مقصد صرفاً در متغیرهای محیطی امن سرور نگهداری می‌شوند و از سمت مرورگر ارسال نمی‌گردند.
              </p>
              {tgSendStatus && (
                <div className={`p-2.5 rounded-xl font-semibold ${tgSendStatus.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                  {tgSendStatus.text} </div>
              )} <button
                type="submit" disabled={sendingTelegram} className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4 stroke-[1.75]" />
                <span>{sendingTelegram ? 'در حال ارسال به ربات تلگرام...' : 'ارسال مستقیم پست به کانال تلگرام'}</span>
              </button>
            </form>
          </div>
        )} </div>
    </div>
  ); }