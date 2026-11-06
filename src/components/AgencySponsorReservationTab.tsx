import React, { useMemo, useState } from 'react'; import { CreditCard, Phone, Receipt } from 'lucide-react'; import { Neighborhood, getHoodMonthlySponsorTariff, isSponsorActive, toPersianNum, } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { clampNumber, createExecutionTimer, isValidAgencyPhone, sanitizeInput, } from '../utils/security'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
export interface AgencySponsorReservationTabProps { safeNeighborhoods: Neighborhood[]; targetBargainHood: Neighborhood; sponsorHoodId: number; setSponsorHoodId: React.Dispatch<React.SetStateAction<number>>;
  sponsorAgencyName: string; setSponsorAgencyName: React.Dispatch<React.SetStateAction<string>>; sponsorPhone: string; setSponsorPhone: React.Dispatch<React.SetStateAction<string>>; sponsorSpecialty: string; setSponsorSpecialty: React.Dispatch<React.SetStateAction<string>>; sponsorExpYears: number;
  setSponsorExpYears: React.Dispatch<React.SetStateAction<number>>; sponsorSubmitMsg: string; onReserveSponsor: (e: React.FormEvent) => void; enableSponsorBilling?: boolean; sponsorPlanMonths?: 1 | 3; setSponsorPlanMonths?: React.Dispatch<React.SetStateAction<1 | 3>>; sponsorTrackingCode?: string;
  setSponsorTrackingCode?: React.Dispatch<React.SetStateAction<string>>; }
export function AgencySponsorReservationTab({ safeNeighborhoods, targetBargainHood, sponsorHoodId, setSponsorHoodId, sponsorAgencyName, setSponsorAgencyName, sponsorPhone,
  setSponsorPhone, sponsorSpecialty, setSponsorSpecialty, sponsorExpYears, setSponsorExpYears, sponsorSubmitMsg,
  onReserveSponsor, enableSponsorBilling = true, sponsorPlanMonths = 1,
  setSponsorPlanMonths, sponsorTrackingCode = '',
  setSponsorTrackingCode,
}: AgencySponsorReservationTabProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT'; const [localPhoneError, setLocalPhoneError] = useState<string>('');
  const selectedSponsorHood = useMemo(() => {
    return (
      safeNeighborhoods.find((n) => n.id === sponsorHoodId) ||
      safeNeighborhoods[0] ||
      targetBargainHood
    );
  }, [safeNeighborhoods, sponsorHoodId, targetBargainHood]);
  const billingSummary = useMemo(() => {
    const finishTimer = createExecutionTimer('AgencyModal', 'calcSponsorBilling');
    try {
      const baseMonthlyTariff = selectedSponsorHood
        ? getHoodMonthlySponsorTariff(selectedSponsorHood)
        : 5;
      const validMonths = sponsorPlanMonths === 3 ? 3 : 1;
      const rawTotal = baseMonthlyTariff * validMonths;
      const discountAmount = validMonths === 3 ? Math.round(rawTotal * 0.2 * 10) / 10 : 0;
      const finalPayableMillion = Math.round((rawTotal - discountAmount) * 10) / 10;
      finishTimer('success');
      return {
        baseMonthlyTariff,
        validMonths,
        rawTotal,
        discountAmount,
        finalPayableMillion,
      };
    } catch {
      finishTimer('fallback');
      return {
        baseMonthlyTariff: 5,
        validMonths: 1,
        rawTotal: 5,
        discountAmount: 0,
        finalPayableMillion: 5,
      };
    }
  }, [selectedSponsorHood, sponsorPlanMonths]);
  const phoneIsValid = useMemo(() => {
    if (!sponsorPhone.trim()) return true;
    return isValidAgencyPhone(sponsorPhone);
  }, [sponsorPhone]);
  const handleFormSubmit = (e: React.FormEvent) => {
    if (sanitizeInput(sponsorAgencyName, 90).length < 2) {
      e.preventDefault();
      setLocalPhoneError('لطفاً نام معتبر دفتر مشاور املاک (حداقل ۲ کاراکتر) را وارد نمایید.');
      return;
    }
    if (!isValidAgencyPhone(sponsorPhone)) {
      e.preventDefault();
      setLocalPhoneError(
        'لطفاً شماره تلفن ثابت با پیش‌شماره (مثل 021-2240xxxx) یا موبایل معتبر ۱۱ رقمی وارد نمایید.'
      );
      return;
    }
    setLocalPhoneError('');
    onReserveSponsor(e);
  };
  const effectiveMessage = localPhoneError || sponsorSubmitMsg;
  const isErrorMsg = Boolean(localPhoneError) || effectiveMessage.includes('لطفاً');
  return (
    <div className="space-y-4 text-xs">
      <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-3 text-slate-700 dark:text-slate-300 leading-relaxed">
        در هر یک از محله‌ها، <strong>فقط یک دفتر مشاور املاک معتبر</strong> به عنوان «کارشناس
        رسمی محله» در پایین کارنامه همان محله نمایش داده می‌شود.
      </div>
      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1">انتخاب محله جهت رزرو:</label>
            <select
              value={sponsorHoodId}
              onChange={(e) => setSponsorHoodId(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-emerald-600"
            >
              {safeNeighborhoods.map((n) => (
                <option key={n.id} value={n.id}>
                  محله {n.name} ({areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))} م · معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد) — تعرفه: {toPersianNum(getHoodMonthlySponsorTariff(n))}{' '}
                  میلیون/ماه{showIntl ? ` (${formatMillionTomanAsIntlCurrency(getHoodMonthlySponsorTariff(n), currency, locale)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1">نام دفتر مشاور املاک:</label>
            <input
              type="text"
              required
              maxLength={90}
              value={sponsorAgencyName}
              onChange={(e) => {
                setLocalPhoneError('');
                setSponsorAgencyName(sanitizeInput(e.target.value, 90));
              }}
              placeholder="مثلاً: دپارتمان املاک بزرگ پونک"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
              <span>شماره تماس مستقیم:</span>
              {!phoneIsValid && (
                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">فرمت شماره نامعتبر</span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                maxLength={30}
                value={sponsorPhone}
                onChange={(e) => {
                  setLocalPhoneError('');
                  setSponsorPhone(sanitizeInput(e.target.value, 30));
                }}
                placeholder="021-4444xxxx"
                className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none ${
                  !phoneIsValid
                    ? 'border-rose-400 focus:border-rose-600'
                    : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                }`}
              />
              <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1">تخصص دفتر در محله:</label>
            <input
              type="text"
              maxLength={110}
              value={sponsorSpecialty}
              onChange={(e) => setSponsorSpecialty(sanitizeInput(e.target.value, 110))}
              placeholder="مثلاً: فایل‌های شخصی و نوساز"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1">سابقه فعالیت (سال):</label>
            <input
              type="number"
              min={1}
              max={50}
              value={sponsorExpYears}
              onChange={(e) => setSponsorExpYears(clampNumber(e.target.value, 1, 50, 10))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>
        {/* MODULE 4: SPONSOR BILLING, INVOICING & TRACKING CODE */}
        {enableSponsorBilling ? (
          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <span>انتخاب طرح اشتراک و صورت‌حساب خودکار</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                انقضای خودکار ۳۰/۹۰ روزه
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSponsorPlanMonths && setSponsorPlanMonths(1)}
                className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                  sponsorPlanMonths === 1
                    ? 'bg-white dark:bg-slate-800 border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                <div className="font-extrabold">طرح ۱ ماهه (۳۰ روز اعتبار)</div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mt-0.5 tabular-nums">
                  {toPersianNum(billingSummary.baseMonthlyTariff)} میلیون تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(billingSummary.baseMonthlyTariff, currency, locale)})` : ''}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSponsorPlanMonths && setSponsorPlanMonths(3)}
                className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                  sponsorPlanMonths === 3
                    ? 'bg-white dark:bg-slate-800 border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">طرح ۳ ماهه با ۲۰٪ تخفیف</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-black">
                    ۲۰٪ تخفیف
                  </span>
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mt-0.5 tabular-nums">
                  {toPersianNum(Math.round(billingSummary.baseMonthlyTariff * 3 * 0.8 * 10) / 10)} میلیون تومان (به‌جای {toPersianNum(billingSummary.baseMonthlyTariff * 3)} م){showIntl ? ` • ${formatMillionTomanAsIntlCurrency(Math.round(billingSummary.baseMonthlyTariff * 3 * 0.8 * 10) / 10, currency, locale)}` : ''}
                </div>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center bg-white dark:bg-slate-900/80 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl p-3">
              <div className="space-y-1">
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                  مبلغ نهایی قابل پرداخت ({toPersianNum(billingSummary.validMonths * 30)} روز نمایش انحصاری):
                </div>
                <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {toPersianNum(billingSummary.finalPayableMillion)} میلیون تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(billingSummary.finalPayableMillion, currency, locale)})` : ''}
                </div>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                  <span>کد پیگیری واریز بانکی:</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={sponsorTrackingCode}
                  onChange={(e) =>
                    setSponsorTrackingCode &&
                    setSponsorTrackingCode(sanitizeInput(e.target.value, 50))
                  }
                  placeholder="مثلاً: TR-8849201"
                  dir="ltr"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-2xl p-3 text-sky-900 dark:text-sky-300 text-xs font-semibold">
            🟢 هم‌اکنون رزرو تابلو کارشناس رسمی محله در طرح تشویقی سامانه «کاملاً رایگان» است و نیازی به پرداخت هزینه ندارد.
          </div>
        )}
        {effectiveMessage && (
          <div
            className={`p-3 rounded-2xl border font-semibold ${
              isErrorMsg
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {effectiveMessage}
          </div>
        )}
        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-extrabold text-xs transition cursor-pointer"
        >
          ثبت و جایگزینی در کارت کارشناس رسمی محله
        </button>
      </form>
      <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden max-h-44 overflow-y-auto">
        <div className="grid grid-cols-3 bg-slate-50 dark:bg-slate-800/80 py-2 px-3 font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
          <div>محله</div>
          <div>کارشناس فعلی</div>
          <div className="text-left">تعرفه ماهانه</div>
        </div>
        {safeNeighborhoods.map((n) => {
          const active = isSponsorActive(n.sponsor, enableSponsorBilling);
          return (
            <div
              key={n.id}
              onClick={() => setSponsorHoodId(n.id)}
              className="grid grid-cols-3 items-center py-2 px-3 border-b border-slate-100 dark:border-slate-800 last:border-none hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
            >
              <div className="font-bold text-slate-900 dark:text-slate-100">{n.name} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 tabular-nums">({formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد) · معامله: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م</span></div>
              <div className="text-slate-500 dark:text-slate-400 truncate">
                {active ? n.sponsor?.name : 'تابلوی کارشناس رسمی محله آزاد است'}
              </div>
              <div className="text-left font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {enableSponsorBilling
                  ? `${toPersianNum(getHoodMonthlySponsorTariff(n))} میلیون تومان${showIntl ? ` (${formatMillionTomanAsIntlCurrency(getHoodMonthlySponsorTariff(n), currency, locale)})` : ''}`
                  : 'رایگان'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}