/**
 * @file src/components/AdminMapProviderConfigPanel.tsx
 * @description پنل مدیریت ارائه‌دهنده نقشه: سوییچ اختصاصی مدیر بین نقشه نشان (پیش‌فرض) و نقشه رایگان OpenStreetMap.
 */

import React from 'react';
import { MapPin, Globe, Check, ShieldCheck, RefreshCw } from 'lucide-react';
import { toPersianNum, type MapTileServerId } from '../data/neighborhoods';
import {
  AreaUnit,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  IntlCurrencyCode,
} from '../utils/areaUnit';
import {
  DEFAULT_NESHAN_WEB_KEY,
  resolveNeshanConfiguration,
} from '../utils/neshanTileConfig';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface AdminMapProviderConfigPanelProps {
  currentStyle: MapTileServerId;
  onSelectStyle: (styleId: MapTileServerId) => void;
  onRetryNeshan?: () => void;
  isFallbackActive?: boolean;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

export function AdminMapProviderConfigPanel({
  currentStyle,
  onSelectStyle,
  onRetryNeshan,
  isFallbackActive = false,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: AdminMapProviderConfigPanelProps): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const samplePinPrice = convertPricePerSqmToUnit(120, areaUnit);
  const sample85mTotalMillions = 120 * 85;
  const sampleMonthlyRentMillions = 45;
  const cfg = resolveNeshanConfiguration();
  const maskedKey = cfg.key.length > 12
    ? `${cfg.key.slice(0, 8)}...${cfg.key.slice(-4)}`
    : cfg.key;

  return (
    <div className="p-4 rounded-[14px] bg-white border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span className="font-extrabold text-sm text-slate-900">
              تنظیم موتور و ارائه‌دهنده نقشه پایه (مدیریت)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            انتخاب بین نقشه اختصاصی و پرجزئیات نشان (پیش‌فرض) یا نقشه رایگان OpenStreetMap · واحد پین ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(samplePinPrice)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(samplePinPrice, intlCurrency, locale)})` : ''} · معیار {formatAreaShort(85, areaUnit)}: {toPersianNum(sample85mTotalMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sample85mTotalMillions, intlCurrency, locale)})` : ''} · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleMonthlyRentMillions, intlCurrency, locale)})` : ''}
          </p>
        </div>

        {isFallbackActive && onRetryNeshan && (
          <button
            type="button"
            onClick={onRetryNeshan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer transition shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تلاش مجدد اتصال به نشان</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Option 1: Neshan Map (Default) */}
        <div
          onClick={() => onSelectStyle('neshan')}
          className={`relative p-3.5 rounded-[12px] border-2 cursor-pointer transition-all ${
            currentStyle === 'neshan'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600/20'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-slate-900">
                  نقشه تفصیلی نشان (Neshan)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                  پیش‌فرض
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                نقشه ایرانی بهینه‌سازی‌شده برای تهران و کلان‌شهرها با نام‌گذاری کامل فارسی معابر،
                پلاک‌ها، بدون تحریم و سرعت بارگذاری بسیار بالا.
              </p>
            </div>
            {currentStyle === 'neshan' && (
              <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>کلید اختصاصی وب:</span>
              <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                {maskedKey}
              </code>
            </div>
            <span className="font-medium text-emerald-700">سرویس پایدار</span>
          </div>
        </div>

        {/* Option 2: Free OpenStreetMap */}
        <div
          onClick={() => onSelectStyle('osm')}
          className={`relative p-3.5 rounded-[12px] border-2 cursor-pointer transition-all ${
            currentStyle === 'osm'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600/20'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-slate-900">
                  نقشه رایگان OpenStreetMap (OSM)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  رایگان و بدون کلید
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                نقشه عمومی و منبع‌باز بین‌المللی؛ بدون نیاز به کلید دسترسی. مناسب برای استفاده در شرایط
                پشتیبان یا تمایل مدیر به استفاده از لایه استاندارد OSM.
              </p>
            </div>
            {currentStyle === 'osm' && (
              <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
            <div className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-600" />
              <span>پشتیبان خودکار در صورت قطعی</span>
            </div>
            <span className="font-medium text-slate-600">منبع باز</span>
          </div>
        </div>
      </div>

      {/* Secondary styles */}
      <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-slate-500 font-medium">سایر سبک‌های کاشی:</span>
        {[
          { id: 'satellite' as const, label: 'ماهواره‌ای' },
          { id: 'carto_dark' as const, label: 'حالت تاریک' },
          { id: 'voyager' as const, label: 'پروکسی مستقیم سرور' },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelectStyle(s.id)}
            className={`px-2.5 py-1 rounded-md border text-xs font-semibold cursor-pointer transition ${
              currentStyle === s.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
