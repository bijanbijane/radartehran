/** @file src/features/account/components/AccountFavoriteNeighborhoodsSection.tsx — Saved Neighborhoods Grid with v6.4 Comparison */
import React from 'react';
import { ArrowLeftRight, Heart, MapPin, Scale } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { type CityId, MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../../../data/multiCityData';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode, type PrimaryViewId, type RadarLocale } from '../../../utils/areaUnit';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import { explainNeighborhoodRecommendation } from '../../../components/useEvaluatedNeighborhoods';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../../../components/mapAdvancedLayers';

export interface AccountFavoriteNeighborhoodsSectionProps {
  favoriteHoods: EvaluatedNeighborhood[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood?: EvaluatedNeighborhood;
  activeCity?: CityId;
  mode: 'rent' | 'buy';
  isEn: boolean;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  avgShortlistScore: string | null;
  topFavScore: number | undefined;
  explainByHoodId?: Map<number, ReturnType<typeof explainNeighborhoodRecommendation>>;
  dealSqmByHoodId?: Map<number, number>;
  renderCardHeader?: (hood: EvaluatedNeighborhood, isSelected: boolean, isOtherCity: boolean, cityLabel: string, explain: ReturnType<typeof explainNeighborhoodRecommendation>) => React.ReactNode;
  onToggleFavorite: (id: number) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenShortlistMatrix?: () => void;
  onNavigateView?: (view: PrimaryViewId) => void;
}

export const AccountFavoriteNeighborhoodsSection: React.FC<AccountFavoriteNeighborhoodsSectionProps> = ({
  favoriteHoods, evaluatedNeighborhoods, selectedHood, activeCity, mode, isEn, areaUnit, intlCurrency, radarLocale,
  avgShortlistScore, topFavScore, explainByHoodId, dealSqmByHoodId, renderCardHeader, onToggleFavorite, onSelectNeighborhood, onOpenInspector, onOpenShortlistMatrix, onNavigateView,
}) => {
  const { comparisonArc } = useMapAdvancedOverlayState();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500 fill-rose-500" /><span>{isEn ? `Saved Neighborhoods (${favoriteHoods.length})` : `محله‌های نشان‌شده شما (${toPersianNum(favoriteHoods.length)})`}</span></h2>
          {avgShortlistScore && <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">میانگین امتیاز: {toPersianNum(avgShortlistScore)}/۱۰</span>}
        </div>
        <div className="flex items-center gap-2">
          {favoriteHoods.length >= 2 && onOpenShortlistMatrix && (
            <button type="button" onClick={onOpenShortlistMatrix} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer">
              <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" /><span>{isEn ? 'Shortlist Decision Matrix' : 'ماتریس مقایسه منتخب‌ها'}</span>
            </button>
          )}
          <span className="text-xs text-slate-400 hidden sm:inline">{isEn ? 'Click any card to center live map' : 'کلیک روی هر کارت، نقشه زنده را متمرکز می‌کند'}</span>
        </div>
      </div>

      {favoriteHoods.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <Heart className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-bold">{isEn ? 'No saved neighborhoods in your shortlist yet.' : 'هنوز هیچ محله‌ای را به لیست منتخب‌های خود اضافه نکرده‌اید.'}</p>
            <p className="text-[11px] text-slate-400">{isEn ? 'Bookmark neighborhoods to unlock the multi-criteria comparison matrix and track v6.4 closing prices.' : 'با نشان کردن محله‌ها، ماتریس مقایسه تحلیلی فعال می‌شود و تغییرات قیمت را رصد خواهید کرد.'}</p>
          </div>
          {evaluatedNeighborhoods.filter((h) => h.status === 'green').length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-[11px] font-bold text-slate-400 block mb-2">{isEn ? 'Quick picks matching your budget:' : 'پیشنهاد سریع متناسب با بودجه شما:'}</span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {evaluatedNeighborhoods.filter((h) => h.status === 'green').slice(0, 3).map((h) => (
                  <button key={h.id} type="button" onClick={() => onToggleFavorite(h.id)} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer"><span>+ {h.name}</span></button>
                ))}
              </div>
            </div>
          )}
          {onNavigateView && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button type="button" onClick={() => onNavigateView('discover')} className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">{isEn ? 'Explore Neighborhoods' : 'کشف و فیلتر محله‌ها'}</button>
              <button type="button" onClick={() => onNavigateView('map')} className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">{isEn ? 'Open Live Map' : 'کاوش روی نقشه زنده'}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {favoriteHoods.map((hood) => {
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const unitDeal = convertPricePerSqmToUnit(dealSqmByHoodId?.get(hood.id) ?? aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm, areaUnit);
            const explain = explainByHoodId?.get(hood.id) || explainNeighborhoodRecommendation(hood, { mode, topReferenceScore: topFavScore });
            const isSelected = selectedHood?.id === hood.id;
            const favCityId = resolveCityIdForNeighborhood(hood.id);
            const isOtherCity = Boolean(activeCity && favCityId !== activeCity);
            const isArcActive = selectedHood && comparisonArc.active && ((comparisonArc.hoodA?.id === selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === selectedHood.id && comparisonArc.hoodA?.id === hood.id));
            return (
              <div key={hood.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition flex flex-col justify-between ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'}`}>
                <div className="flex items-start justify-between">
                  {renderCardHeader ? renderCardHeader(hood, isSelected, isOtherCity, MULTI_CITY_CONFIGS[favCityId]?.nameFa || '', explain) : (
                    <div role="button" tabIndex={0} onClick={() => onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNeighborhood(hood); } }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-slate-900 dark:text-white text-sm">{isOtherCity ? `${MULTI_CITY_CONFIGS[favCityId]?.nameFa || ''} · محله ${hood.name}` : `محله ${hood.name}`}</h3>
                        {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">فعال روی نقشه</span>}
                      </div>
                      <span className="text-[11px] text-slate-400">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)}/۱۰ {explain.nonCompensatoryWarningsFa[0] ? <strong className="text-amber-600 dark:text-amber-400">· ⚠ {explain.nonCompensatoryWarningsFa[0]}</strong> : null}</span>
                    </div>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(hood.id); }} aria-label={`حذف ${hood.name} از منتخب‌ها`} className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer">
                    <Heart className="w-4 h-4 fill-rose-500" />
                  </button>
                </div>
                <div className="py-3 my-3 border-y border-slate-100 dark:border-slate-800 grid grid-cols-2 text-xs tabular-nums">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">{unitBuy === unitDeal ? 'سناریو v6.4 (غیرثبتی):' : 'اعلامی / سناریو v6.4 (غیرثبتی):'}</span>
                    <strong className="text-slate-900 dark:text-white font-black text-sm">{toPersianNum(unitBuy)} {unitBuy !== unitDeal && <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span>} م.ت{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)}` : ''}</strong>
                  </div>
                  <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                    <span className="text-[10px] text-slate-400 block font-medium">رهن ۸۰ متر:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-black text-sm">{toPersianNum(hood.rahn80m)} م.ت</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInspector(hood); }} aria-label={`مشاهده کارنامه ${hood.name}`} className="flex-1 py-2 rounded-xl bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">مشاهده کارنامه محله</button>
                  {!isSelected && selectedHood && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); updateMapAdvancedOverlayState({ comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: selectedHood, hoodB: hood } }); }} title={`ترسیم کمان مقایسه با ${selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`p-2 rounded-xl border text-xs transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'}`}>
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onNavigateView && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelectNeighborhood(hood); onNavigateView('map'); }} aria-label={`نمایش ${hood.name} روی نقشه`} className="px-2.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition cursor-pointer flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /><span>نقشه کامل</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
