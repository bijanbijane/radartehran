import React, { useMemo } from 'react';
import { Bell, CheckCircle2, ShieldAlert, Smartphone, X } from 'lucide-react';
import { Neighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator';
import { isValidIranianMobile, sanitizeInput } from '../utils/security';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { BuyerPriceThresholdManagerSection, PriceThresholdMatchItem, PriceThresholdSubscription, useBuyerPriceThresholdAlerts } from './buyerPriceThresholdAlerts';
import { useDialogFocus } from './useDialogFocus';

export interface BuyerAlertPwaLegalModalsProps {
  showBuyerAlertModal: boolean;
  setShowBuyerAlertModal: React.Dispatch<React.SetStateAction<boolean>>;
  neighborhoods: Neighborhood[];
  alertFullName: string;
  setAlertFullName: React.Dispatch<React.SetStateAction<string>>;
  alertPhone: string;
  setAlertPhone: React.Dispatch<React.SetStateAction<string>>;
  alertHoodId: number;
  setAlertHoodId: React.Dispatch<React.SetStateAction<number>>;
  alertDealType: 'خرید' | 'اجاره';
  setAlertDealType: React.Dispatch<React.SetStateAction<'خرید' | 'اجاره'>>;
  alertMaxBudget: string;
  setAlertMaxBudget: React.Dispatch<React.SetStateAction<string>>;
  alertSubmitMsg: string;
  onRegisterBuyerAlert: (e: React.FormEvent) => void;
  isSavingBuyerAlert?: boolean;
  showPwaModal: boolean;
  setShowPwaModal: React.Dispatch<React.SetStateAction<boolean>>;
  canDirectInstallPwa?: boolean;
  onDirectInstallPwa?: () => void;
  showLegalModal: boolean;
  setShowLegalModal: React.Dispatch<React.SetStateAction<boolean>>;
  thresholdSubscriptions?: PriceThresholdSubscription[];
  thresholdMatches?: PriceThresholdMatchItem[];
  onAddThresholdSubscription?: (hoodId: number, dealType: 'خرید' | 'اجاره', maxThresholdMillion: number) => void;
  onRemoveThresholdSubscription?: (id: string) => void;
}

export function BuyerAlertPwaLegalModals({
  showBuyerAlertModal, setShowBuyerAlertModal, neighborhoods, alertFullName, setAlertFullName, alertPhone, setAlertPhone,
  alertHoodId, setAlertHoodId, alertDealType, setAlertDealType, alertMaxBudget, setAlertMaxBudget,
  alertSubmitMsg, onRegisterBuyerAlert, isSavingBuyerAlert = false, showPwaModal, setShowPwaModal,
  showLegalModal, setShowLegalModal, thresholdSubscriptions, thresholdMatches, onAddThresholdSubscription, onRemoveThresholdSubscription,
}: BuyerAlertPwaLegalModalsProps) {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'متر';
  const isEn = radarLocale === 'en';

  const dialogRef = useDialogFocus(showBuyerAlertModal || showPwaModal || showLegalModal, () => {
    setShowBuyerAlertModal(false); setShowPwaModal(false); setShowLegalModal(false);
  });
  const safeNeighborhoods = useMemo(() => Array.isArray(neighborhoods) ? neighborhoods : [], [neighborhoods]);
  const selectedAlertHood = useMemo(() => safeNeighborhoods.find((n) => n.id === alertHoodId) || safeNeighborhoods[0], [safeNeighborhoods, alertHoodId]);
  const fallbackThresholds = useBuyerPriceThresholdAlerts(safeNeighborhoods);
  const activeSubscriptions = thresholdSubscriptions ?? fallbackThresholds.subscriptions;
  const activeMatches = thresholdMatches ?? fallbackThresholds.allMatches;
  const handleAddSub = onAddThresholdSubscription ?? fallbackThresholds.addSubscription;
  const handleRemoveSub = onRemoveThresholdSubscription ?? fallbackThresholds.removeSubscription;
  const mobileHintValid = useMemo(() => (!alertPhone.trim() ? true : isValidIranianMobile(alertPhone)), [alertPhone]);

  return (
    <>
      {showBuyerAlertModal && (
        <div role="dialog" aria-modal="true" aria-label="ثبت شماره برای هشدار فوری ملک زیر قیمت" onClick={() => setShowBuyerAlertModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto focus:outline-none shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 stroke-[1.75]" />
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {isEn ? 'Under-Market Deal Alerts' : 'ثبت شماره و اشتراک سقف قیمت ملک زیر قیمت'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" aria-label="بستن پنجره هشدار شکار" onClick={() => setShowBuyerAlertModal(false)} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
                  <X className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>
            </div>
            <div className="mb-3.5">
              <BuyerPriceThresholdManagerSection
                neighborhoods={safeNeighborhoods} selectedHoodId={alertHoodId} onSelectHoodId={setAlertHoodId}
                dealType={alertDealType} onSelectDealType={setAlertDealType} subscriptions={activeSubscriptions}
                allMatches={activeMatches} onAddSubscription={handleAddSub} onRemoveSubscription={handleRemoveSub}
              />
            </div>
            <form onSubmit={onRegisterBuyerAlert} className="space-y-3 text-xs">
              <div className="apple-grouped-card bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/60 p-3 text-emerald-900 dark:text-emerald-300 leading-relaxed rounded-xl">
                درخواست شما برای دریافت هشدار در صورت ثبت فایل واجد شرایط ذخیره می‌شود. ارسال خودکار پیامک در حال حاضر فعال نیست و ثبت درخواست به‌معنای تضمین یافتن ملک در زمان مشخص نیست.
              </div>
              <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1">نام و نام خانوادگی:</label>
                    <input
                      type="text" aria-label="نام و نام خانوادگی" required maxLength={80} value={alertFullName}
                      onChange={(e) => setAlertFullName(sanitizeInput(e.target.value, 80))}
                      placeholder="مثلاً: علی محمدی"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>شماره موبایل:</span>
                      {!mobileHintValid && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">موبایل ۱۱ رقمی (09...)</span>}
                    </label>
                    <input
                      type="tel" aria-label="شماره موبایل" required maxLength={15} dir="ltr" value={alertPhone}
                      onChange={(e) => setAlertPhone(sanitizeInput(e.target.value, 15))}
                      placeholder="0912xxxxxxx"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1">محله مورد نظر:</label>
                    <select
                      aria-label="محله مورد نظر" value={alertHoodId} onChange={(e) => setAlertHoodId(Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-600"
                    >
                      {safeNeighborhoods.map((n) => {
                        const unitVal = convertPricePerSqmToUnit(n.buyPerSqm, areaUnit);
                        const uDealVal = convertPricePerSqmToUnit(aggregateMarketMetricsForHood(n).estimatedDealPricePerSqm, areaUnit);
                        return (
                          <option key={n.id} value={n.id}>
                            محله {n.name} ({n.zone}) — {toPersianNum(unitVal)} م/{unitLabel} (سناریو v6.4 (غیرثبتی): {toPersianNum(uDealVal)} م){intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitVal, intlCurrency, radarLocale)})` : ''} · {alertDealType === 'اجاره' ? `رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م · اجاره: ${toPersianNum(Math.round(n.rahn80m * 0.03))} م` : `کل ${formatAreaShort(85, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 85) / 1000).toFixed(1))} میلیارد`}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 mb-1">نوع معامله:</label>
                    <select
                      aria-label="نوع معامله" value={alertDealType} onChange={(e) => setAlertDealType(e.target.value === 'اجاره' ? 'اجاره' : 'خرید')}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-600"
                    >
                      <option value="خرید">خرید آپارتمان زیر قیمت</option>
                      <option value="اجاره">رهن و اجاره زیر قیمت</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between gap-2">
                    <span>حداکثر بودجه مد نظر شما ({formatAreaShort(85, areaUnit)}{selectedAlertHood ? ` · معیار: ${alertDealType === 'خرید' ? `${toPersianNum(((selectedAlertHood.buyPerSqm * 85) / 1000).toFixed(1))} میلیارد` : `رهن ${toPersianNum(selectedAlertHood.rahn80m)} م / اجاره ${toPersianNum(Math.round(selectedAlertHood.rahn80m * 0.03))} م`}` : ''}):</span>
                    {selectedAlertHood && intlCurrency !== 'IRT' && (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums" dir="ltr">
                        ({formatMillionTomanAsIntlCurrency(alertDealType === 'خرید' ? selectedAlertHood.buyPerSqm * 85 : selectedAlertHood.rahn80m, intlCurrency, radarLocale)})
                      </span>
                    )}
                  </label>
                  <input
                    type="text" aria-label="حداکثر بودجه مد نظر" maxLength={90} value={alertMaxBudget}
                    onChange={(e) => setAlertMaxBudget(sanitizeInput(e.target.value, 90))}
                    placeholder="مثلاً: ۱۰ میلیارد خرید یا ۱.۵ میلیارد رهن کامل"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
              {alertSubmitMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold leading-relaxed flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{alertSubmitMsg}</span>
                </div>
              )}
              <button
                type="submit" disabled={Boolean(isSavingBuyerAlert)} aria-busy={Boolean(isSavingBuyerAlert)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs transition cursor-pointer shadow-xs"
              >
                {isSavingBuyerAlert ? 'در حال ثبت امن درخواست...' : 'ثبت در لیست هشدار فایل‌های زیر قیمت'}
              </button>
            </form>
          </div>
        </div>
      )}
      {showPwaModal && (
        <div role="dialog" aria-modal="true" aria-label="راهنمای نصب وب‌اپلیکیشن" onClick={() => setShowPwaModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-md w-full p-5 space-y-3.5 text-xs focus:outline-none shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {isEn ? 'Install Tehran Radar Web App' : 'نصب وب‌اپلیکیشن رادار تهران'}
                </h3>
              </div>
              <button type="button" aria-label="بستن راهنمای نصب" onClick={() => setShowPwaModal(false)} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
                <X className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>
            <div className="space-y-2.5 text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="font-extrabold text-slate-900 dark:text-white">نصب در اندروید (Chrome):</div>
                <p>روی منوی سه نقطه مرورگر کروم بزنید و گزینه <strong>Add to Home screen</strong> یا <strong>Install app</strong> را انتخاب کنید.</p>
              </div>
              <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="font-extrabold text-slate-900 dark:text-white">نصب در آیفون (Safari iOS):</div>
                <p>در مرورگر سافاری روی دکمه <strong>Share</strong> در نوار پایین بزنید و گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowPwaModal(false)} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold transition cursor-pointer">
              {isEn ? 'Got it' : 'متوجه شدم'}
            </button>
          </div>
        </div>
      )}
      {showLegalModal && (
        <div role="dialog" aria-modal="true" aria-label="چارچوب قانونی و سلب مسئولیت" onClick={() => setShowLegalModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-lg w-full p-5 space-y-3.5 text-xs focus:outline-none shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {isEn ? 'Legal Terms & Disclaimer' : 'چارچوب قانونی و سلب مسئولیت'}
                </h3>
              </div>
              <button type="button" aria-label="بستن قوانین حقوقی" onClick={() => setShowLegalModal(false)} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
                <X className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>
            <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 text-slate-700 dark:text-slate-300 leading-7 text-justify space-y-2">
              <p>کلیه قیمت‌ها، شاخص‌های حباب‌سنج و تحلیل‌های ارائه‌شده در سامانه رادار، بر اساس پایش آماری داده‌های عمومی بازار تولید شده و صرفاً جنبه اطلاع‌رسانی دارد. این سامانه در معاملات ملکی ذینفع یا طرف قرارداد نبوده و بررسی اسناد بر عهده طرفین معامله و دفاتر اسناد و املاک رسمی است.</p>
              <p>خروجی‌های محاسباتی، مالیاتی، حقوقی و ترافیکی صرفاً برآورد تحلیلی و آموزشی بوده و جایگزین کارشناسی رسمی دادگستری نمی‌باشند.</p>
            </div>
            <button type="button" onClick={() => setShowLegalModal(false)} className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-extrabold transition cursor-pointer">
              {isEn ? 'I Understand & Accept' : 'مورد تایید و مطالعه قرار گرفت'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}