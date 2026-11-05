/**
 * @file src/components/SmartNaturalSearchMatchesSection.tsx
 * @description بخش تطبیق هوشمند کوئری‌های زبان طبیعی فارسی در نوار جست‌وجوی اصلی نقشه
 * (مانند «آپارتمان در منطقه ۵ تا ۱۴۰ میلیون با مترو» یا «محله با امنیت بالا در منطقه ۲»).
 */

import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { parseNaturalPersianHousingQuery } from '../utils/aiModelRegistryAndGateway';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface SmartNaturalSearchMatchesProps {
  searchQuery: string;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy';
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  areaUnit?: string;
  intlCurrency?: string;
}

export function hasNaturalLanguageConstraintSignals(query: string): boolean {
  const q = query.trim();
  if (q.length < 5) return false;
  return /(منطقه|تا\s*[۰-۹0-9]|متری|میلیون|مترو|امنیت|رشد|ارزان|خوش‌قیمت)/i.test(q);
}

export function SmartNaturalSearchMatchesSection({
  searchQuery,
  evaluatedNeighborhoods,
  mode,
  onSelectNeighborhood,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: SmartNaturalSearchMatchesProps): React.ReactElement | null {
  const [ctxAreaUnit] = useAreaUnit();
  const [locale] = useRadarLocale();
  const [ctxIntlCurrency] = useIntlCurrency();
  const areaUnit = (propAreaUnit as any) ?? ctxAreaUnit;
  const intlCurrency = (propIntlCurrency as any) ?? ctxIntlCurrency;
  const result = useMemo(() => {
    if (!hasNaturalLanguageConstraintSignals(searchQuery)) return null;
    const parsed = parseNaturalPersianHousingQuery(searchQuery, { isLiveModelVerified: false });
    const requiresMetro = searchQuery.includes('مترو');
    const requiresHighSecurity = searchQuery.includes('امنیت');

    const hasAnyConstraint =
      parsed.targetZone !== null ||
      parsed.maxBuyPerSqmMillions !== null ||
      parsed.maxRahnMillions !== null ||
      requiresMetro ||
      requiresHighSecurity ||
      parsed.positiveGrowthOnly;

    if (!hasAnyConstraint) return null;

    const matched = evaluatedNeighborhoods.filter((h) => {
      if (parsed.targetZone !== null) {
        const zoneDigits = h.zone
          .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
          .match(/\d+/);
        const hZoneNum = zoneDigits ? Number(zoneDigits[0]) : null;
        if (hZoneNum !== parsed.targetZone) return false;
      }
      if (parsed.maxBuyPerSqmMillions !== null && h.buyPerSqm > parsed.maxBuyPerSqmMillions) {
        return false;
      }
      if (parsed.maxRahnMillions !== null && h.rahn80m > parsed.maxRahnMillions) {
        return false;
      }
      if (requiresMetro && h.metro < 7) {
        return false;
      }
      if (requiresHighSecurity && h.security < 8) {
        return false;
      }
      return true;
    });

    return { parsed, matched: matched.slice(0, 12) };
  }, [searchQuery, evaluatedNeighborhoods]);

  if (!result || result.matched.length === 0) return null;

  const { parsed, matched } = result;

  return (
    <div className="border-b border-emerald-200/80 bg-emerald-50/40">
      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-extrabold text-emerald-900 bg-emerald-100/60 border-b border-emerald-200/70">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 stroke-[2]" />
          <span>پیشنهاد هوشمند بر اساس فیلتر کوئری فارسی</span>
        </span>
        <span className="text-[10px] text-emerald-800 font-bold tabular-nums">
          {parsed.targetZone !== null && `منطقه ${toPersianNum(parsed.targetZone)} · `}
          {parsed.maxBuyPerSqmMillions !== null && `تا ${areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(parsed.maxBuyPerSqmMillions, areaUnit))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(parsed.maxBuyPerSqmMillions, areaUnit), intlCurrency, locale)})` : ''} · `}
          {parsed.maxRahnMillions !== null && `رهن تا ${toPersianNum(parsed.maxRahnMillions)} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(parsed.maxRahnMillions, intlCurrency, locale)})` : ''} · `}
          {toPersianNum(matched.length)} محله منطبق
        </span>
      </div>
      <div className="divide-y divide-emerald-100/70">
        {matched.map((n) => {
          const monthlyRent80mMillions = Math.round(n.rahn80m * 0.03);
          return (
            <button
              key={`nl-match-${n.id}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelectNeighborhood(n)}
              className="w-full text-right px-3.5 py-2 hover:bg-emerald-100/50 transition flex items-center justify-between text-xs cursor-pointer group"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-bold text-slate-900 group-hover:text-emerald-800">{n.name}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  ({n.zone}{typeof n.distKm === 'number' ? ` · ${toPersianNum(areaUnit === 'sqft' ? (n.distKm * 0.621371).toFixed(1) : n.distKm.toFixed(1))} ${areaUnit === 'sqft' ? 'mi' : 'km'}` : ''})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-white/80 text-emerald-800 text-[10px] font-bold tabular-nums border border-emerald-200">
                  امتیاز {toPersianNum(n.overallScore)}/۱۰
                </span>
                <span className="text-emerald-700 font-bold tabular-nums text-[11px]">
                  {mode === 'rent'
                    ? `رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م (اجاره: ${toPersianNum(monthlyRent80mMillions)} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(n.rahn80m, intlCurrency, locale)})` : ''}`
                    : `${areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))} م (معامله v6.4: ${toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م) · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit), intlCurrency, locale)})` : ''}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
