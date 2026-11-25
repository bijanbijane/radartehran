/**
 * @file src/components/TopBarProvinceDirectoryControl.tsx
 * @description کنترل شهرهای دارای داده بازار و میان‌بر به رجیستری canonical سراسری IRNI.
 * جداشده از `NationwideProvinceModal` برای فعال‌سازی بارگذاری تنبل (Code-Splitting) واقعی مودال ۳۱ استان.
 */

import React, { useMemo } from 'react';
import { Compass, Database } from 'lucide-react';
import {
  ALL_31_IRAN_PROVINCES,
  findProvinceForHood,
} from '../data/iranProvincesDirectory';
import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { Neighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface TopBarProvinceDirectoryProps {
  activeCity: CityId;
  selectedHoodId: number;
  onSwitchCity: (
    cityId: CityId,
    targetHoodId?: number,
    targetCenter?: [number, number],
    targetZoom?: number
  ) => void;
  onOpenProvinceModal?: () => void;
  onOpenCanonicalRegistry?: () => void;
}

export function TopBarProvinceAndCityDirectoryControl({
  activeCity,
  selectedHoodId,
  onSwitchCity,
  onOpenProvinceModal,
  onOpenCanonicalRegistry,
}: TopBarProvinceDirectoryProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const cityIds = Object.keys(MULTI_CITY_CONFIGS) as CityId[];
  const allNationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);
  const activeProvince = useMemo(
    () => findProvinceForHood(selectedHoodId) || ALL_31_IRAN_PROVINCES[0],
    [selectedHoodId]
  );

  const hoodsByProvinceId = useMemo(() => {
    const map: Record<string, Neighborhood[]> = {};
    for (const p of ALL_31_IRAN_PROVINCES) map[p.id] = [];
    for (const h of allNationwideHoods) {
      const prov = findProvinceForHood(h.id);
      if (prov && map[prov.id]) {
        map[prov.id].push(h);
      }
    }
    return map;
  }, [allNationwideHoods]);

  const renderedProvinceGroups = useMemo(
    () =>
      ALL_31_IRAN_PROVINCES.map((prov) => {
        const provHoods = hoodsByProvinceId[prov.id] || [];
        return (
          <optgroup
            key={prov.id}
            label={`استان ${prov.nameFa} (مرکز: ${prov.capitalFa} — ${toPersianNum(provHoods.length)} محله/شهر)`}
          >
            <option value={`prov:${prov.id}`}>
              📍 نمای کلی استان {prov.nameFa} ({prov.capitalFa})
            </option>
            {provHoods.map((h) => {
              const unitPrice = convertPricePerSqmToUnit(h.buyPerSqm, areaUnit);
              const unitDeal = convertPricePerSqmToUnit(aggregateMarketMetricsForHood(h).estimatedDealPricePerSqm, areaUnit);
              const monthlyRent80mMillions = Math.round(h.rahn80m * 0.03);
              return (
                <option key={h.id} value={`hood:${h.id}`}>
                  {h.name} — {h.zone} ({formatAreaUnitLabel(areaUnit)}: {toPersianNum(unitPrice)} م · {formatAreaShort(80, areaUnit)}: {toPersianNum(monthlyRent80mMillions)} م اجاره · سناریو v6.4 (غیرثبتی): {toPersianNum(unitDeal)} م{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, locale)}` : ''})
                </option>
              );
            })}
          </optgroup>
        );
      }),
    [hoodsByProvinceId, areaUnit, intlCurrency, locale]
  );

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* دکمه‌های ۵ کلان‌شهر اصلی (فقط در موبایل، چون در دسکتاپ در هدر سراسری قرار دارد) */}
      <div className="hidden items-center gap-0.5 apple-segmented p-0.5 rounded-[9px] text-[11px] shrink-0">
        {cityIds.map((cId) => (
          <button
            key={cId}
            type="button"
            onClick={() => onSwitchCity(cId)}
            className={`px-2 py-1 rounded-[7px] font-bold transition cursor-pointer ${
              activeCity === cId
                ? 'apple-segmented-pill-active text-slate-900 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {MULTI_CITY_CONFIGS[cId]?.nameFa || cId}
          </button>
        ))}
      </div>

      {/* سلکتور دسته‌بندی‌شده ۳۱ استان و تمام شهرها و محله‌ها (فقط در صورت عدم وجود مودال ۳۱ استان) */}
      <div className={onOpenProvinceModal ? 'sr-only' : 'relative hidden sm:flex items-center'}>
        <select
          aria-label="فهرست مناطق دارای پوشش بازار Radar"
          tabIndex={onOpenProvinceModal ? -1 : 0}
          value={`hood:${selectedHoodId}`}
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith('prov:')) {
              const provId = val.slice(5);
              const prov = ALL_31_IRAN_PROVINCES.find((p) => p.id === provId);
              if (prov) {
                onSwitchCity(prov.targetCityId, prov.sampleHoodId, prov.center, prov.defaultZoom);
              }
            } else if (val.startsWith('hood:')) {
              const hId = Number(val.slice(5));
              const hood = allNationwideHoods.find((h) => h.id === hId);
              const prov = findProvinceForHood(hId);
              if (hood && prov) {
                onSwitchCity(prov.targetCityId, hood.id, [hood.lat, hood.lng], 13);
              }
            }
          }}
          className="bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-[9px] px-2 py-1.5 text-[11px] font-bold focus:outline-none focus:border-emerald-600 cursor-pointer max-w-[140px] sm:max-w-[150px] 2xl:max-w-[180px] truncate"
          title="مناطق دارای داده بازار محلی Radar؛ مرجع رسمی در رجیستری IRNI"
        >
          {renderedProvinceGroups}
        </select>
      </div>

      {onOpenCanonicalRegistry && (
        <button
          type="button"
          onClick={onOpenCanonicalRegistry}
          className="px-2.5 py-1.5 rounded-[9px] border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition shrink-0 cursor-pointer whitespace-nowrap"
          title="مشاهده تمام محله‌های canonical از رجیستری رسمی هوشمندی محله‌های ایران"
          aria-label="بازکردن رجیستری رسمی محله‌های ایران"
        >
          <Database className="w-3.5 h-3.5" />
          <span>رجیستری رسمی</span>
        </button>
      )}

      {/* دکمه باز کردن مودال فهرست جامع ۳۱ استان و شهرها */}
      {onOpenProvinceModal && (
        <button
          type="button"
          onClick={onOpenProvinceModal}
          aria-label={`فهرست ۳۱ استان (${activeProvince.nameFa})`}
          className="px-2 sm:px-2.5 py-1.5 rounded-[9px] bg-slate-900 dark:bg-[var(--color-brand-600)] hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition shrink-0 cursor-pointer whitespace-nowrap"
          title="مشاهده فهرست‌بندی کامل ۳۱ استان، شهرها و محله‌های سراسر ایران"
        >
          <Compass className="w-3.5 h-3.5 stroke-[2] shrink-0" />
          <span className="hidden sm:inline">۳۱ استان</span>
          <span className="sm:hidden max-w-[64px] truncate">{activeProvince.nameFa}</span>
        </button>
      )}
    </div>
  );
}
