/**
 * @file src/components/NationwideProvinceModal.tsx
 * @description پنجره جامع انتخاب استان‌ها، شهرها و محله‌های کل کشور (۳۱ استان ایران)
 * به همراه کنترل فهرست‌بندی سریع استان‌ها و شهرها در نوار ابزار بالای نقشه.
 */

import React, { useState, useMemo } from 'react';
import { X, Search, MapPin, Compass, ChevronLeft, Building2 } from 'lucide-react';
import {
  ALL_31_IRAN_PROVINCES,
  IRAN_REGION_GROUPS,
  IranProvinceConfig,
  IranRegionGroup,
  findProvinceForHood,
} from '../data/iranProvincesDirectory';
import { CityId, MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { Neighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { matchesPersianSearch } from '../utils/security';
import { useDialogFocus } from './useDialogFocus';
import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface NationwideProvinceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCity: CityId;
  onSelectProvince: (prov: IranProvinceConfig) => void;
  areaUnit?: string;
  intlCurrency?: string;
}

export {
  TopBarProvinceAndCityDirectoryControl,
  type TopBarProvinceDirectoryProps,
} from './TopBarProvinceDirectoryControl';


export function NationwideProvinceModal({
  isOpen,
  onClose,
  activeCity,
  onSelectProvince,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: NationwideProvinceModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [ctxAreaUnit] = useAreaUnit();
  const areaUnit = (propAreaUnit as any) ?? ctxAreaUnit;
  const [radarLocale] = useRadarLocale();
  const [ctxIntlCurrency] = useIntlCurrency();
  const intlCurrency = (propIntlCurrency as any) ?? ctxIntlCurrency;
  const avgProvTotal80mMillions = 80 * 120;
  const monthlyRent80mMillions = Math.round(avgProvTotal80mMillions * 0.005);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<IranRegionGroup | 'all'>('all');

  const allNationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);

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

  const filteredProvinces = useMemo(() => {
    const q = searchQuery.trim();
    return ALL_31_IRAN_PROVINCES.filter((p) => {
      if (selectedGroup !== 'all' && p.regionGroup !== selectedGroup) return false;
      if (!q) return true;
      if (matchesPersianSearch(p.nameFa, q) || matchesPersianSearch(p.capitalFa, q)) return true;
      if (p.majorCities.some((c) => matchesPersianSearch(c, q))) return true;
      const provHoods = hoodsByProvinceId[p.id] || [];
      if (provHoods.some((h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q))) {
        return true;
      }
      return false;
    });
  }, [searchQuery, selectedGroup, hoodsByProvinceId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nationwide-province-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-0 duration-200"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] apple-window-sheet dark:bg-[var(--color-bg-surface)] rounded-[22px] shadow-2xl flex flex-col overflow-hidden border border-slate-200/90 dark:border-[var(--color-border-subtle)] focus:outline-none"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2 bg-white/80 dark:bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2.5">
            <span className="ios-squircle-icon bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs">
              <Compass className="w-4 h-4 stroke-[2]" />
            </span>
            <div>
              <h2 id="nationwide-province-modal-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-[var(--color-text-primary)] tracking-tight flex items-center gap-2">
                <span>فهرست‌بندی جامع استان‌ها، شهرها و محله‌های ایران</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  ۳۱ استان • {toPersianNum(allNationwideHoods.length)} محله و شهر
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] font-medium mt-0.5">
                روی نام هر استان یا هر یک از شهرها و محله‌های زیرمجموعه کلیک کنید تا نقشه و رادار آن باز شود
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-[var(--color-text-primary)] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] transition cursor-pointer" aria-label="بستن">
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-slate-200/60 dark:border-[var(--color-border-subtle)] bg-slate-50/70 dark:bg-[var(--color-bg-muted)] space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
            <input
              type="text" aria-label="جست‌وجوی استان، شهر یا محله"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جست‌وجوی استان، شهر یا محله (تبریز، گلسار رشت، ساری، اهواز، کیش، کاشان، یزد، لواسان...)"
              className="w-full pr-9 pl-3 py-2 text-xs font-bold bg-white dark:bg-[var(--color-bg-muted)] border border-slate-200/90 dark:border-[var(--color-border-strong)] rounded-[12px] focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20 text-slate-900 dark:text-[var(--color-text-primary)] placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-[var(--color-text-primary)] text-xs px-1.5 py-0.5 rounded-md cursor-pointer"
              >
                پاک کردن
              </button>
            )}
          </div>

          {/* Region Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar apple-segmented p-1 rounded-[10px] text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedGroup('all')}
              className={`px-2.5 py-1 rounded-[8px] font-bold transition shrink-0 cursor-pointer ${
                selectedGroup === 'all'
                  ? 'apple-segmented-pill-active text-slate-900 dark:text-[var(--color-text-primary)] font-bold'
                  : 'text-slate-600 dark:text-[var(--color-text-muted)] hover:text-slate-900 dark:hover:text-[var(--color-text-primary)]'
              }`}
            >
              همه استان‌ها ({toPersianNum(ALL_31_IRAN_PROVINCES.length)})
            </button>
            {IRAN_REGION_GROUPS.map((rg) => {
              const active = selectedGroup === rg.id;
              const count = ALL_31_IRAN_PROVINCES.filter((p) => p.regionGroup === rg.id).length;
              return (
                <button
                  key={rg.id}
                  type="button"
                  onClick={() => setSelectedGroup(rg.id)}
                  className={`px-2.5 py-1 rounded-[8px] font-bold transition shrink-0 cursor-pointer ${
                    active
                      ? 'apple-segmented-pill-active text-slate-900 dark:text-[var(--color-text-primary)] font-bold'
                      : 'text-slate-600 dark:text-[var(--color-text-muted)] hover:text-slate-900 dark:hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {rg.labelFa} ({toPersianNum(count)})
                </button>
              );
            })}
          </div>
        </div>

        {/* Provinces & Neighborhoods List */}
        <div className="p-3.5 overflow-y-auto max-h-[56vh] divide-y divide-slate-100 dark:divide-[var(--color-border-subtle)]">
          {filteredProvinces.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-1.5">
              <MapPin className="w-6 h-6 mx-auto text-slate-300 dark:text-[var(--color-text-muted)] stroke-[1.5]" />
              <p className="font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">استان یا محله‌ای با این مشخصات یافت نشد</p>
              <p className="text-[11px] text-slate-400">نام استان، مرکز استان یا محله را دوباره بررسی کنید.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredProvinces.map((prov) => {
                const provHoods = hoodsByProvinceId[prov.id] || [];
                const avgProvUnit = provHoods.length > 0 ? convertPricePerSqmToUnit(Math.round(provHoods.reduce((s, h) => s + h.buyPerSqm, 0) / provHoods.length), areaUnit) : null;
                const isCurrentCity =
                  prov.targetCityId === activeCity &&
                  (prov.id === 'tehran' || prov.id === 'alborz' || prov.id === 'isfahan' || prov.id === 'fars' || prov.id === 'khorasan_razavi');
                return (
                  <div
                    key={prov.id}
                    className={`p-3 rounded-[14px] border text-right transition flex flex-col justify-between gap-2 ${
                      isCurrentCity
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/35 border-emerald-500/40 dark:border-emerald-700/60 text-slate-900 dark:text-[var(--color-text-primary)] ring-1 ring-emerald-500/20'
                        : 'bg-white dark:bg-[var(--color-bg-muted)] border-slate-200/80 dark:border-[var(--color-border-strong)] hover:bg-slate-50/60 dark:hover:bg-[var(--color-bg-elevated)] text-slate-800 dark:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { onSelectProvince(prov); onClose(); }}
                      className="w-full text-right flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[var(--color-bg-elevated)] flex items-center justify-center text-slate-600 dark:text-[var(--color-text-secondary)] text-[11px] font-bold">
                          <Building2 className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400 stroke-[2]" />
                        </span>
                        <div>
                          <span className="font-bold text-xs text-slate-900 dark:text-[var(--color-text-primary)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                            استان {prov.nameFa}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] mr-1.5 tabular-nums">
                            (مرکز: {prov.capitalFa} • {toPersianNum(provHoods.length)} محله/شهر{avgProvUnit !== null ? ` • میانگین ${toPersianNum(avgProvUnit)} ${areaUnit === 'sqft' ? 'م/ft²' : 'م/متر'}${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(avgProvUnit, intlCurrency, radarLocale)})` : ''}` : ''})
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-[var(--color-brand-600)] dark:group-hover:text-emerald-400 stroke-[2] shrink-0" />
                    </button>

                    <p className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] line-clamp-1">
                      {prov.descriptionFa}
                    </p>

                    {provHoods.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100 dark:border-[var(--color-border-strong)] max-h-24 overflow-y-auto">
                        {provHoods.map((h) => {
                          const uPrice = convertPricePerSqmToUnit(h.buyPerSqm, areaUnit);
                          const uDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, buildNeighborhoodListingSamples(h)).estimatedDealPricePerSqm, areaUnit);
                          const fxTip = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uPrice, intlCurrency, radarLocale)})` : '';
                          const rahnFxTip = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(h.rahn80m, intlCurrency, radarLocale)})` : '';
                          const total80m = h.buyPerSqm * 80;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                onSelectProvince({ ...prov, sampleHoodId: h.id, center: [h.lat, h.lng], defaultZoom: 13 });
                                onClose();
                              }}
                              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[var(--color-bg-elevated)] hover:bg-[var(--color-brand-600)] dark:hover:bg-[var(--color-brand-600)] hover:text-white text-slate-700 dark:text-[var(--color-text-primary)] text-[10px] font-bold transition cursor-pointer flex items-center gap-1 tabular-nums"
                              title={`${h.name} (${h.zone}) — ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uPrice)} میلیون${fxTip} (سناریو مذاکره: ${toPersianNum(uDeal)} م) · واحد ${formatAreaShort(80, areaUnit)}: ${toPersianNum((total80m / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(total80m, intlCurrency, radarLocale)})` : ''} · رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(h.rahn80m)} میلیون${rahnFxTip} (اجاره: ${toPersianNum(Math.round(h.rahn80m * 0.03))} م)`}
                            >
                              <span>{h.name}</span>
                              <span className="opacity-70 text-[9px]">({toPersianNum(uPrice)} {areaUnit === 'sqft' ? 'م/ft²' : 'م'}{fxTip})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50/80 dark:bg-[var(--color-bg-surface)] border-t border-slate-200/70 dark:border-[var(--color-border-subtle)] flex items-center justify-between text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] font-medium">
          <span>
            پوشش جامع ۳۱ استان و {toPersianNum(allNationwideHoods.length)} محله و شهر فعال در سامانه رادارتهران
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-[9px] bg-slate-200 dark:bg-[var(--color-bg-muted)] text-slate-700 dark:text-[var(--color-text-primary)] font-bold hover:bg-slate-300 dark:hover:bg-[var(--color-bg-elevated)] transition cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
