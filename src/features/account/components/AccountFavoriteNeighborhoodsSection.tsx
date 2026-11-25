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
          <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500 fill-rose-500" /><span>{isEn ? `Saved Neighborhoods (${favoriteHoods.length})` : `محله‌های نشان‌شده شما (${toPersianNum(favoriteHoods.length)})`}</span></h2>
          {avgShortlistScore && <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] font-bold">میانگین امتیاز: {toPersianNum(avgShortlistScore)}/۱۰</span>}
        </div>
        <div className="flex items-center gap-2">
          {favoriteHoods.length >= 2 && onOpenShortlistMatrix && (
            <button type="button" onClick={onOpenShortlistMatrix} className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] border border-[var(--color-border-subtle)] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" /><span>{isEn ? 'Shortlist Decision Matrix' : 'ماتریس مقایسه منتخب‌ها'}</span>
            </button>
          )}
          <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline">{isEn ? 'Click any card to center live map' : 'کلیک روی هر کارت، نقشه زنده را متمرکز می‌کند'}</span>
        </div>
      </div>

      {favoriteHoods.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-4">
          <Heart className="w-8 h-8 text-[var(--color-text-muted)] mx-auto opacity-60" />
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-primary)] font-bold">{isEn ? 'No saved neighborhoods in your shortlist yet.' : 'هنوز هیچ محله‌ای را به لیست منتخب‌های خود اضافه نکرده‌اید.'}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{isEn ? 'Bookmark neighborhoods to unlock the multi-criteria comparison matrix and track estimated closing prices.' : 'با نشان کردن محله‌ها، ماتریس مقایسه تحلیلی فعال می‌شود و تغییرات قیمت را رصد خواهید کرد.'}</p>
          </div>
          {evaluatedNeighborhoods.filter((h) => h.status === 'green').length > 0 && (
            <div className="pt-2 border-t border-[var(--color-border-subtle)]">
              <span className="text-xs font-bold text-[var(--color-text-muted)] block mb-2">{isEn ? 'Quick picks matching your budget:' : 'پیشنهاد سریع متناسب با بودجه شما:'}</span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {evaluatedNeighborhoods.filter((h) => h.status === 'green').slice(0, 3).map((h) => (
                  <button key={h.id} type="button" onClick={() => onToggleFavorite(h.id)} className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] hover:opacity-90 text-xs font-bold transition flex items-center gap-1 cursor-pointer"><span>+ {h.name}</span></button>
                ))}
              </div>
            </div>
          )}
          {onNavigateView && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button type="button" onClick={() => onNavigateView('discover')} className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--color-brand-600)] text-white text-xs font-bold transition cursor-pointer">{isEn ? 'Explore Neighborhoods' : 'کشف و فیلتر محله‌ها'}</button>
              <button type="button" onClick={() => onNavigateView('map')} className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--color-border-strong)] text-[var(--color-text-primary)] text-xs font-bold transition cursor-pointer">{isEn ? 'Open Live Map' : 'کاوش روی نقشه زنده'}</button>
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
              <div key={hood.id} className={`p-5 rounded-2xl bg-[var(--color-bg-surface)] border transition flex flex-col justify-between ${isSelected ? 'border-[var(--color-brand-600)] ring-2 ring-[var(--color-brand-600)]/20' : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-strong)]'}`}>
                <div className="flex items-start justify-between">
                  {renderCardHeader ? renderCardHeader(hood, isSelected, isOtherCity, MULTI_CITY_CONFIGS[favCityId]?.nameFa || '', explain) : (
                    <div role="button" tabIndex={0} onClick={() => onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNeighborhood(hood); } }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-[var(--color-text-primary)] text-sm">{isOtherCity ? `${MULTI_CITY_CONFIGS[favCityId]?.nameFa || ''} · محله ${hood.name}` : `محله ${hood.name}`}</h3>
                        {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-xs font-bold">فعال روی نقشه</span>}
                      </div>
                      <span className="text-sm text-[var(--color-text-muted)] block mt-0.5">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)} از ۱۰ {explain.nonCompensatoryWarningsFa[0] ? <strong className="text-amber-700 dark:text-amber-300">· {toPersianNum(explain.nonCompensatoryWarningsFa[0])}</strong> : null}</span>
                    </div>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(hood.id); }} aria-label={`حذف ${hood.name} از منتخب‌ها`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-2 cursor-pointer transition">
                    <Heart className="w-4 h-4 fill-rose-500" />
                  </button>
                </div>
                <div className="py-3 my-3 border-y border-[var(--color-border-subtle)] grid grid-cols-2 text-sm tabular-nums">
                  <div>
                    <span className="text-sm text-[var(--color-text-muted)] block font-medium">{unitBuy === unitDeal ? 'برآورد معامله (غیرثبتی):' : 'اعلامی / برآورد معامله:'}</span>
                    <strong className="text-[var(--color-text-primary)] font-bold text-sm">{toPersianNum(unitBuy)} {unitBuy !== unitDeal && <span className="text-[var(--color-brand-fg)]">({toPersianNum(unitDeal)})</span>} م.ت{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)}` : ''}</strong>
                  </div>
                  <div className="border-s border-[var(--color-border-subtle)] ps-3">
                    <span className="text-sm text-[var(--color-text-muted)] block font-medium">رهن ۸۰ متر:</span>
                    <strong className="text-[var(--color-brand-fg)] font-bold text-sm">{toPersianNum(hood.rahn80m)} م.ت</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInspector(hood); }} aria-label={`مشاهده کارنامه ${hood.name}`} className="flex-1 min-h-[44px] md:min-h-[38px] py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-sm font-bold transition cursor-pointer">مشاهده کارنامه محله</button>
                  {!isSelected && selectedHood && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); updateMapAdvancedOverlayState({ comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: selectedHood, hoodB: hood } }); }} title={`ترسیم کمان مقایسه با ${selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] inline-flex items-center justify-center p-2 rounded-xl border text-sm transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-[var(--color-border-subtle)] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'}`}>
                      <Scale className="w-4 h-4" />
                    </button>
                  )}
                  {onNavigateView && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelectNeighborhood(hood); onNavigateView('map'); }} aria-label={`نمایش ${hood.name} روی نقشه`} className="min-h-[44px] md:min-h-[38px] px-3 py-2 rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] border border-[var(--color-border-subtle)] text-sm font-bold transition cursor-pointer flex items-center gap-1">
                      <MapPin className="w-4 h-4" /><span>نقشه کامل</span>
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
