/**
 * @file src/components/TopBarProvinceControl.tsx
 * @description کنترل یکپارچه سوییچر ۵ کلان‌شهر + فهرست‌بندی سریع ۳۱ استان و شهرهای کشور در نوار بالای نقشه.
 * استخراج‌شده جهت بهینه‌سازی بارگذاری تنبل (Lazy Loading) پنجره جامع استان‌ها.
 */

import React, { useMemo } from 'react';
import { Compass } from 'lucide-react';
import {
  ALL_31_IRAN_PROVINCES,
  findProvinceForHood,
} from '../data/iranProvincesDirectory';
import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { Neighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';
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
}

/**
 * کنترل یکپارچه سوییچر ۵ کلان‌شهر + فهرست‌بندی طبقه‌بندی‌شده ۳۱ استان و شهرهای کشور در نوار بالا
 */
export function TopBarProvinceAndCityDirectoryControl({
  activeCity,
  selectedHoodId,
  onSwitchCity,
  onOpenProvinceModal,
}: TopBarProvinceDirectoryProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnitShort = formatAreaUnitLabel(areaUnit);
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

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* دکمه‌های ۵ کلان‌شهر اصلی */}
      <div className="hidden md:flex items-center gap-0.5 apple-segmented p-0.5 rounded-[9px] text-[11px] shrink-0">
        {cityIds.map((cId) => (
          <button
            key={cId}
            type="button"
            onClick={() => onSwitchCity(cId)}
            className={`px-2 py-1 rounded-[7px] font-bold transition cursor-pointer ${
              activeCity === cId
                ? 'apple-segmented-pill-active text-slate-900 dark:text-slate-100 font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {MULTI_CITY_CONFIGS[cId]?.nameFa || cId}
          </button>
        ))}
      </div>

      {/* سلکتور دسته‌بندی‌شده ۳۱ استان و تمام شهرها و محله‌ها */}
      <div className="relative flex items-center">
        <select
          aria-label="فهرست‌بندی استان‌ها و شهرهای ایران"
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
          className="bg-emerald-50/90 dark:bg-slate-800 hover:bg-emerald-100/80 dark:hover:bg-slate-700 text-emerald-950 dark:text-emerald-200 border border-emerald-300/80 dark:border-slate-700 rounded-[9px] px-2 py-1.5 text-[11px] font-extrabold focus:outline-none focus:border-emerald-600 cursor-pointer max-w-[155px] sm:max-w-[195px] truncate"
          title="فهرست‌بندی جامع ۳۱ استان، شهرها و محله‌های ایران"
        >
          {ALL_31_IRAN_PROVINCES.map((prov) => {
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
                  const unitBuy = convertPricePerSqmToUnit(h.buyPerSqm, areaUnit);
                  const unitDeal = convertPricePerSqmToUnit(aggregateMarketMetricsForHood(h).estimatedDealPricePerSqm, areaUnit);
                  const monthlyRent80mMillions = Math.round(h.rahn80m * 0.03);
                  return (
                    <option key={h.id} value={`hood:${h.id}`}>
                      {h.name} — {h.zone} ({areaUnitShort} {toPersianNum(unitBuy)} م · {formatAreaShort(80, areaUnit)}: {toPersianNum(monthlyRent80mMillions)} م اجاره · سناریو v6.4 (غیرثبتی): {toPersianNum(unitDeal)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)}` : ''})
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* دکمه باز کردن مودال فهرست جامع ۳۱ استان و شهرها */}
      {onOpenProvinceModal && (
        <button
          type="button"
          onClick={onOpenProvinceModal}
          className="px-2.5 py-1.5 rounded-[9px] bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition shrink-0 cursor-pointer"
          title="مشاهده فهرست‌بندی کامل ۳۱ استان، شهرها و محله‌های سراسر ایران"
        >
          <Compass className="w-3.5 h-3.5 stroke-[2]" />
          <span className="hidden sm:inline">۳۱ استان و شهرها</span>
          <span className="sm:hidden">{activeProvince.nameFa}</span>
        </button>
      )}
    </div>
  );
}
