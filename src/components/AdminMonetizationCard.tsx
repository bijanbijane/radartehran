/**
 * @file src/components/AdminMonetizationCard.tsx
 * @description کارت مدیریت درآمدزایی، تغییر ۱-کلیکی حالت رایگان/اشتراک ماهانه، تخفیف کمپین سراسری، و تمدید ۳۰ روزه یا آزادسازی تابلوهای املاک محلات در پنل ادمین.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Gift, Percent, RefreshCw, Sparkles, Unlock } from 'lucide-react';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import {
  saveMonetizationDiscount,
  subscribeToMonetizationDiscount,
} from '../data/firestoreNeighborhoodRepository';
import {
  Neighborhood,
  getHoodMonthlySponsorTariff,
  isAuthorizedAdminUser,
  isSponsorActive,
  toPersianNum,
} from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface AdminMonetizationCardProps {
  enableSponsorBilling: boolean;
  onToggleSponsorBilling: () => void;
  neighborhoods: Neighborhood[];
  onExtendSponsor30Days?: (hoodId: number) => void;
  onReleaseHoodSponsor?: (hoodId: number) => void;
  isVerifiedAdmin?: boolean;
}

export function AdminMonetizationCard({
  enableSponsorBilling,
  onToggleSponsorBilling,
  neighborhoods,
  onExtendSponsor30Days,
  onReleaseHoodSponsor,
  isVerifiedAdmin,
}: AdminMonetizationCardProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const [campaignDiscountPercent, setCampaignDiscountPercent] = useState<number>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('tehran_radar_campaign_discount_v1') : null;
      const n = saved !== null ? Number(saved) : 0;
      return !Number.isNaN(n) && n >= 0 && n <= 100 ? n : 0;
    } catch {
      return 0;
    }
  });
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = subscribeToMonetizationDiscount((disc) => {
      setCampaignDiscountPercent(disc);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('tehran_radar_campaign_discount_v1', String(disc));
          window.dispatchEvent(new CustomEvent('radar:monetization-discount', { detail: disc }));
        }
      } catch {
        // Ignore storage error
      }
    });
    return () => {
      unsub();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const handleDiscountChange = (val: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(val)));
    setCampaignDiscountPercent(clamped);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('tehran_radar_campaign_discount_v1', String(clamped));
        window.dispatchEvent(new CustomEvent('radar:monetization-discount', { detail: clamped }));
      }
    } catch {
      // Ignore storage error
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    const canWriteCloud = isVerifiedAdmin ?? isAuthorizedAdminUser(auth.currentUser, false);
    syncTimerRef.current = setTimeout(() => {
      if (canWriteCloud) {
        // Persist via doc(db, 'appConfig', 'monetization') in repository
        void saveMonetizationDiscount(clamped).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.WRITE, 'appConfig/monetization');
          } catch {
            // Non-fatal fallback
          }
        });
      }
    }, 350);
  };

  return (
    <div className="space-y-3 mb-3">
      {/* Main Monetization Status & 1-Click Toggle */}
      <div
        className={`rounded-2xl border p-4 space-y-3 transition ${
          enableSponsorBilling
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-100'
            : 'bg-sky-50/80 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60 text-sky-950 dark:text-sky-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-extrabold text-sm flex items-center gap-1.5">
              {enableSponsorBilling ? (
                <>
                  <CreditCard className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
                  <span>💳 حالت فعلی: اشتراک ماهانه فعال (دریافت هزینه طبق تعرفه تعیین‌شده)</span>
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>🟢 حالت فعلی: کاملاً رایگان (جذب حداکثری املاک و کاربران بدون دریافت هزینه)</span>
                </>
              )}
            </div>
            <p className="text-[11px] opacity-80 leading-relaxed">
              {enableSponsorBilling
                ? 'در این حالت، دفاتر املاک برای رزرو تابلو کارشناس محله ملزم به انتخاب طرح ۱ یا ۳ ماهه و ثبت کد پیگیری واریز هستند و انقضای ۳۰/۹۰ روزه اعمال می‌شود.'
                : 'در این حالت، تمام دفاتر املاک می‌توانند بدون نیاز به پرداخت وجه و کد پیگیری، درخواست رزرو رایگان تابلو محله را ثبت کنند.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleSponsorBilling}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5 ${
              enableSponsorBilling
                ? 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600'
                : 'bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {enableSponsorBilling
                ? 'بازگشت موقت به حالت رایگان'
                : 'تبدیل فوری به حالت اشتراک ماهانه پولی'}
            </span>
          </button>
        </div>

        {/* Campaign Discount Slider (0% to 100%) */}
        <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                تخفیف کمپین سراسری تعرفه تابلو محلات:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {toPersianNum(campaignDiscountPercent)}٪ تخفیف
                </strong>
              </div>
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                اعمال تخفیف مناسبتی روی تعرفه ماهانه تمام محلات (۱۰۰٪ = کمپین رایگان ویژه)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-56">
            <input
              type="range" aria-label="تخفیف کمپین سراسری تعرفه تابلو محلات"
              min={0}
              max={100}
              step={5}
              value={campaignDiscountPercent}
              onChange={(e) => handleDiscountChange(Number(e.target.value))}
              className="flex-1 accent-emerald-600 cursor-pointer"
            />
            <span className="text-xs font-black text-slate-800 dark:text-slate-200 w-10 text-left tabular-nums">
              {toPersianNum(campaignDiscountPercent)}٪
            </span>
          </div>
        </div>
      </div>

      {/* Active Neighborhood Sponsors Lifecycle Management (Extend 30d / Release) */}
      {(onExtendSponsor30Days || onReleaseHoodSponsor) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 space-y-2">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center justify-between">
            <span>مدیریت تابلوهای فعال محلات (تمدید ۳۰ روزه / آزادسازی تابلو)</span>
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-normal">
              {toPersianNum(neighborhoods.length)} محله در شهر فعال
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1">
            {neighborhoods.map((n) => {
              const active = isSponsorActive(n.sponsor, enableSponsorBilling);
              const discountedTariff = getHoodMonthlySponsorTariff(n, campaignDiscountPercent);
              return (
                <div
                  key={n.id}
                  className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{n.name} ({areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))} م · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد): · سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(aggregateMarketMetricsForHood(n).estimatedDealPricePerSqm, areaUnit))} م</span>
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      {active ? n.sponsor?.name : 'تابلو آزاد / منقضی'}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                      ({toPersianNum(discountedTariff)} م/ماه{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(discountedTariff, intlCurrency, radarLocale)}` : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onExtendSponsor30Days && (
                      <button
                        type="button"
                        onClick={() => onExtendSponsor30Days(n.id)}
                        className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>تمدید ۳۰ روزه</span>
                      </button>
                    )}
                    {onReleaseHoodSponsor && active && (
                      <button
                        type="button"
                        onClick={() => onReleaseHoodSponsor(n.id)}
                        className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>آزادسازی تابلو</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
