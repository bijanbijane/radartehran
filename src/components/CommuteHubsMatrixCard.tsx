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

  return (
    <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white">
          <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>ماتریس فاصله، مترو و زمان تردد به قطب‌های کاری</span>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const monthlyRent80mMillions = Math.max(1, Math.round(selectedHood.rahn80m * 0.03));
            return (
              <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م.ت{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''} · اجاره {formatAreaShort(80, areaUnit)}: {toPersianNum(monthlyRent80mMillions)} م · معامله v6.4: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm, areaUnit))} م.ت
              </span>
            );
          })()}
          {selectedWorkHubId !== 'none' && (
            <button
              type="button"
              onClick={() => onSelectWorkHubId('none')}
              className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 cursor-pointer transition"
            >
              حذف خط مسیر
            </button>
          )}
        </div>
      </div>

      {spatialReport && (
        <div className="bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-xl p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <TrainFront className="w-3.5 h-3.5 shrink-0" style={{ color: spatialReport.nearestMetroColor }} />
              <span className="truncate">{spatialReport.nearestMetroLineName}</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-[10.5px] font-black text-slate-800 dark:text-slate-200 tabular-nums">
              ~{toPersianNum(spatialReport.nearestMetroDistKm)} کیلومتر{areaUnit === 'sqft' ? ` (${toPersianNum(Math.round(spatialReport.nearestMetroDistKm * 3280.84).toLocaleString('en-US'))} ft)` : ''} ({toPersianNum(spatialReport.walkingMinutesEstimate)} دقیقه پیاده)
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold border ${
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
                onClick={() =>
                  updateMapAdvancedOverlayState({ showMetroLines: !overlayState.showMetroLines })
                }
                aria-label={overlayState.showMetroLines ? 'مخفی‌سازی خطوط مترو در نقشه' : 'نمایش خطوط مترو روی نقشه'}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                  overlayState.showMetroLines
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                🚇 خطوط مترو نقشه
              </button>
              <button
                type="button"
                onClick={() =>
                  updateMapAdvancedOverlayState({ showTrafficZones: !overlayState.showTrafficZones })
                }
                aria-label={overlayState.showTrafficZones ? 'مخفی‌سازی محدوده طرح ترافیک در نقشه' : 'نمایش محدوده طرح ترافیک روی نقشه'}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                  overlayState.showTrafficZones
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                🚦 محدوده طرح ترافیک
              </button>
              {selectedWorkHubId !== 'none' && (
                <button
                  type="button"
                  onClick={() =>
                    updateMapAdvancedOverlayState({
                      showCommuteIsochrones: !overlayState.showCommuteIsochrones,
                    })
                  }
                  aria-label={overlayState.showCommuteIsochrones ? 'مخفی‌سازی حلقه‌های تردد زمانی در نقشه' : 'نمایش حلقه‌های تردد زمانی روی نقشه'}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                    overlayState.showCommuteIsochrones
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  ⏱️ حلقه‌های تردد
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {hubMetrics.map((hub) => {
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
                  : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1 truncate">
                  <MapPin
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{hub.name}</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-[10.5px] font-black text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                  {toPersianNum(hub.distKm)} کیلومتر{areaUnit === 'sqft' ? ` (${toPersianNum((hub.distKm * 0.621371).toFixed(1))} mi)` : ''}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-400 tabular-nums pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>صبح: {toPersianNum(hub.morningMin)} دقیقه</span>
                </span>
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  ۸ شب: {toPersianNum(hub.eveningMin)} دقیقه
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
