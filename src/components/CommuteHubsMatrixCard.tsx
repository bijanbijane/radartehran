import React, { useMemo } from 'react';
import { Clock, MapPin, Navigation, ShieldAlert, TrainFront } from 'lucide-react';
import {
  EvaluatedNeighborhood,
  WorkHub,
  calcDistanceKm,
  toPersianNum,
} from '../data/neighborhoods';
import { CityId } from '../data/multiCityData';
import {
  computeSpatialProximityReport,
  updateMapAdvancedOverlayState,
  useMapAdvancedOverlayState,
} from './mapAdvancedLayers';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface CommuteHubsMatrixCardProps {
  selectedHood: EvaluatedNeighborhood;
  workHubs: WorkHub[];
  selectedWorkHubId: string;
  onSelectWorkHubId: (hubId: string) => void;
  activeCity?: CityId;
}

export function CommuteHubsMatrixCard({
  selectedHood,
  workHubs,
  selectedWorkHubId,
  onSelectWorkHubId,
  activeCity = 'tehran',
}: CommuteHubsMatrixCardProps): React.ReactElement | null {
  const overlayState = useMapAdvancedOverlayState();
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();

  const spatialReport = useMemo(() => {
    if (!selectedHood) return null;
    return computeSpatialProximityReport(selectedHood, activeCity);
  }, [selectedHood, activeCity]);

  const hubMetrics = useMemo(() => {
    if (!selectedHood || !Array.isArray(workHubs)) return [];
    return workHubs
      .filter((h) => h.id !== 'none' && h.lat !== null && h.lng !== null)
      .map((hub) => {
        const dist = calcDistanceKm(
          selectedHood.lat,
          selectedHood.lng,
          hub.lat as number,
          hub.lng as number
        ) ?? 0;
        const morningMin = dist < 0.8 ? 5 : Math.max(10, Math.round(dist * 2.4));
        const eveningMin = dist < 0.8 ? 8 : Math.max(15, Math.round(dist * 3.8));
        return {
          ...hub,
          distKm: Number(dist.toFixed(1)),
          morningMin,
          eveningMin,
        };
      });
  }, [selectedHood, workHubs]);

  if (hubMetrics.length === 0) return null;

  const sortedHubs = [...hubMetrics].sort((a, b) => (a.id === selectedWorkHubId ? -1 : b.id === selectedWorkHubId ? 1 : a.distKm - b.distKm));
  const primaryHubs = sortedHubs.slice(0, 2);
  const extraHubs = sortedHubs.slice(2);
  const renderHubBtn = (hub: (typeof hubMetrics)[number]) => {
    const isSelected = selectedWorkHubId === hub.id;
    return (
      <button
        key={hub.id}
        type="button"
        onClick={() => onSelectWorkHubId(isSelected ? 'none' : hub.id)}
        aria-label={`انتخاب مرکز اشتغال ${hub.name}`}
        className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col gap-1.5 ${
          isSelected
            ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-2xs'
            : 'border-slate-200/80 dark:border-[var(--color-border-subtle)] bg-slate-50/70 dark:bg-[var(--color-bg-canvas)] hover:bg-white dark:hover:bg-[var(--color-bg-elevated)] hover:border-slate-300'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1 truncate">
            <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[var(--color-brand-600)] dark:text-emerald-400' : 'text-slate-400'}`} />
            <span className="truncate">{hub.name}</span>
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200/80 dark:border-[var(--color-border-strong)] text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
            {toPersianNum(hub.distKm)} {radarLocale === 'en' ? 'km' : 'کیلومتر'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-[var(--color-text-muted)] tabular-nums pt-1 border-t border-slate-200/60 dark:border-[var(--color-border-subtle)]">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>صبح: {toPersianNum(hub.morningMin)} دقیقه</span>
          </span>
          <span className="font-semibold text-rose-700 dark:text-rose-400">۸ شب: {toPersianNum(hub.eveningMin)} دقیقه</span>
        </div>
      </button>
    );
  };

  return (
    <div className="apple-grouped-card dark:bg-[var(--color-bg-surface)] dark:border-[var(--color-border-subtle)] p-3.5 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 dark:border-[var(--color-border-subtle)] pb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
          <Navigation className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <span>فاصله، مترو و زمان تردد به قطب‌های کاری</span>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const monthlyRent80mMillions = Math.max(1, Math.round(selectedHood.rahn80m * 0.03));
            return (
              <span className="sr-only">
                هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م.ت{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''} · اجاره {formatAreaShort(80, areaUnit)}: {toPersianNum(monthlyRent80mMillions)} م · سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm, areaUnit))} م.ت
              </span>
            );
          })()}
          {selectedWorkHubId !== 'none' && (
            <button type="button" onClick={() => onSelectWorkHubId('none')} className="text-[10.5px] font-bold text-slate-500 dark:text-[var(--color-text-muted)] hover:text-rose-600 cursor-pointer transition">
              حذف خط مسیر
            </button>
          )}
        </div>
      </div>

      {spatialReport && (
        <div className="bg-slate-50/90 dark:bg-[var(--color-bg-canvas)] border border-slate-200/80 dark:border-[var(--color-border-subtle)] rounded-xl p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-bold text-slate-800 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
              <TrainFront className="w-3.5 h-3.5 shrink-0" style={{ color: spatialReport.nearestMetroColor }} />
              <span className="truncate">{spatialReport.nearestMetroLineName}</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200/80 dark:border-[var(--color-border-strong)] text-[10.5px] font-bold text-slate-800 dark:text-[var(--color-text-primary)] tabular-nums">
              ~{toPersianNum(spatialReport.nearestMetroDistKm)} {radarLocale === 'en' ? 'km' : 'کیلومتر'} ({toPersianNum(spatialReport.walkingMinutesEstimate)} {radarLocale === 'en' ? 'min walk' : 'دقیقه پیاده'})
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-[var(--color-border-subtle)]">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${
                spatialReport.trafficZoneStatus === 'inside_core'
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : spatialReport.trafficZoneStatus === 'inside_outer'
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              }`}
            >
              <ShieldAlert className="w-3 h-3 shrink-0" />
              <span>{spatialReport.trafficZoneLabelFa}</span>
            </span>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !overlayState.showMetroLines })}
                aria-label={overlayState.showMetroLines ? 'مخفی‌سازی خطوط مترو در نقشه' : 'نمایش خطوط مترو روی نقشه'}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                  overlayState.showMetroLines
                    ? 'bg-[var(--color-brand-600)] text-white border-transparent'
                    : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-slate-100'
                }`}
              >
                {radarLocale === 'en' ? 'Metro Lines' : 'خطوط مترو نقشه'}
              </button>
              <button
                type="button"
                onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !overlayState.showTrafficZones })}
                aria-label={overlayState.showTrafficZones ? 'مخفی‌سازی محدوده طرح ترافیک در نقشه' : 'نمایش محدوده طرح ترافیک روی نقشه'}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                  overlayState.showTrafficZones
                    ? 'bg-[var(--color-brand-600)] text-white border-transparent'
                    : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-slate-100'
                }`}
              >
                {radarLocale === 'en' ? 'Traffic Zone' : 'محدوده طرح ترافیک'}
              </button>
              {selectedWorkHubId !== 'none' && (
                <button
                  type="button"
                  onClick={() => updateMapAdvancedOverlayState({ showCommuteIsochrones: !overlayState.showCommuteIsochrones })}
                  aria-label={overlayState.showCommuteIsochrones ? 'مخفی‌سازی محدوده‌های شعاعی محل کار' : 'نمایش محدوده‌های شعاعی محل کار'}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                    overlayState.showCommuteIsochrones
                      ? 'bg-[var(--color-brand-600)] text-white border-emerald-600'
                      : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-700 dark:text-[var(--color-text-secondary)] border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-slate-100'
                  }`}
                >
                  {radarLocale === 'en' ? 'Radial Work Hub Rings' : 'نمایش محدوده‌های شعاعی محل کار'}
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)]">
            {radarLocale === 'en'
              ? 'These rings show straight-line radial distance and do not represent actual travel time.'
              : 'این محدوده‌ها فاصله مستقیم را نشان می‌دهند و بیانگر زمان واقعی سفر نیستند.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {primaryHubs.map(renderHubBtn)}
      </div>
      {extraHubs.length > 0 && (
        <details className="group pt-0.5">
          <summary className="cursor-pointer list-none text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center justify-between py-1 px-1">
            <span>سایر قطب‌های کاری ({toPersianNum(extraHubs.length)} مرکز دیگر)</span>
            <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            {extraHubs.map(renderHubBtn)}
          </div>
        </details>
      )}
    </div>
  );
}
