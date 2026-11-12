import React, { useMemo, useEffect } from 'react';
import { useComparisonFilter } from '../../context/ComparisonFilterContext';
import {
  normalizeFinancialInput,
  validateAndScaleTomanInput,
  formatMillionToVerbalPersian,
  calculateTehranAgeFactor,
} from '../../utils/persianFinancials';
import { useDialogFocus } from '../useDialogFocus';
import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import type { BargainListing } from '../../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../../utils/areaUnit';

export interface HoodDiscoverySummary {
  id: string;
  nameFa: string;
  districtNumber: number;
  zoneLabel?: string;
  avgPricePerSqmMillion: number; rahn80m?: number;
  overallScore?: number;
  bargains?: ReadonlyArray<BargainListing>;
}

interface ReverseBudgetDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  neighborhoods: ReadonlyArray<HoodDiscoverySummary>;
  onSelectNeighborhood: (hoodId: string, budgetMillion?: number, areaSqm?: number, maxBuildingAgeYears?: number) => void;
  initialBudgetMillion?: number;
  initialAreaSqm?: number;
  initialMaxAgeYears?: number;
  useLoanBooster?: boolean;
  deductTenantRahnInBuy?: boolean;
}

const BUDGET_PRESETS_MILLION = [
  { labelFa: '۵ میلیارد', labelEn: '5 Billion', value: 5000 },
  { labelFa: '۸ میلیارد', labelEn: '8 Billion', value: 8000 },
  { labelFa: '۱۲ میلیارد', labelEn: '12 Billion', value: 12000 },
  { labelFa: '۲۰ میلیارد', labelEn: '20 Billion', value: 20000 },
] as const;

export const ReverseBudgetDiscoveryModal: React.FC<ReverseBudgetDiscoveryModalProps> = ({
  isOpen, onClose, neighborhoods, onSelectNeighborhood,
  initialBudgetMillion, initialAreaSqm, initialMaxAgeYears, useLoanBooster = false, deductTenantRahnInBuy = false,
}) => {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const { totalBudgetMillion, desiredAreaSqm, maxBuildingAgeYears, setBudgetFilter } = useComparisonFilter();

  useEffect(() => {
    if (!isOpen) return;
    setBudgetFilter({
      ...(typeof initialBudgetMillion === 'number' && initialBudgetMillion > 0 ? { totalBudgetMillion: initialBudgetMillion } : {}),
      ...(typeof initialAreaSqm === 'number' && initialAreaSqm >= 35 ? { desiredAreaSqm: initialAreaSqm } : {}),
      ...(typeof initialMaxAgeYears === 'number' && initialMaxAgeYears >= 0 ? { maxBuildingAgeYears: initialMaxAgeYears } : {}),
    });
  }, [isOpen, initialBudgetMillion, initialAreaSqm, initialMaxAgeYears, setBudgetFilter]);

  const budgetCheck = validateAndScaleTomanInput(totalBudgetMillion, 'TOTAL_BUY_PRICE');
  const ageFactor = useMemo(() => calculateTehranAgeFactor(maxBuildingAgeYears), [maxBuildingAgeYears]);

  const rankedMatches = useMemo(() => {
    if (!isOpen || totalBudgetMillion <= 0) return [];
    const effectiveBudgetMillion = totalBudgetMillion + (useLoanBooster ? 1200 : 0);
    const targetSqmPrice = effectiveBudgetMillion / Math.max(35, desiredAreaSqm);
    const rentAgeMult = maxBuildingAgeYears <= 5 ? 1.0 : maxBuildingAgeYears <= 15 ? 0.9 : 0.8;

    return neighborhoods
      .map((hood) => {
        const numId = Number(hood.id) || 1;
        const effectiveSqmPrice = Math.round(hood.avgPricePerSqmMillion * ageFactor.multiplier);
        const samples = buildNeighborhoodListingSamples({ id: numId, name: hood.nameFa, buyPerSqm: effectiveSqmPrice, bargains: hood.bargains });
        const estimatedDealSqmPrice = aggregateNeighborhoodMarketMetrics(numId, hood.nameFa, effectiveSqmPrice, samples).estimatedDealPricePerSqm;
        const rawTotal = Math.round(effectiveSqmPrice * desiredAreaSqm);
        const rawDealTotal = Math.round(estimatedDealSqmPrice * desiredAreaSqm);
        const rahnDeduct = deductTenantRahnInBuy && hood.rahn80m ? Math.round(hood.rahn80m * (desiredAreaSqm / 80) * rentAgeMult) : 0;
        const estimatedTotal = deductTenantRahnInBuy ? Math.max(500, Math.round(rawTotal * 0.9) - rahnDeduct) : rawTotal;
        const dealTotal = deductTenantRahnInBuy ? Math.max(500, Math.round(rawDealTotal * 0.9) - rahnDeduct) : rawDealTotal;
        const ratio = estimatedTotal / effectiveBudgetMillion;
        const isDealWithinBudget = dealTotal <= effectiveBudgetMillion;
        const status: 'AFFORDABLE' | 'STRETCH' | 'OUT_OF_REACH' =
          ratio <= 1.0 ? 'AFFORDABLE' : (ratio <= 1.12 || isDealWithinBudget) ? 'STRETCH' : 'OUT_OF_REACH';

        return {
          ...hood,
          effectiveSqmPrice,
          estimatedDealSqmPrice,
          estimatedTotalMillion: estimatedTotal,
          isDealWithinBudget,
          targetDiffRatio: Math.abs(1 - estimatedTotal / Math.max(1, effectiveBudgetMillion)),
          status,
        };
      })
      .filter((item) => item.status !== 'OUT_OF_REACH')
      .sort((a, b) => {
        const tierA = a.status === 'AFFORDABLE' ? 0 : a.isDealWithinBudget ? 1 : 2;
        const tierB = b.status === 'AFFORDABLE' ? 0 : b.isDealWithinBudget ? 1 : 2;
        if (tierA !== tierB) return tierA - tierB;
        return a.targetDiffRatio - b.targetDiffRatio;
      })
      .slice(0, 12);
  }, [isOpen, totalBudgetMillion, desiredAreaSqm, maxBuildingAgeYears, neighborhoods, ageFactor.multiplier, useLoanBooster, deductTenantRahnInBuy]);

  if (!isOpen) return null;
  const fmt = new Intl.NumberFormat(isEn ? 'en-US' : 'fa-IR');

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'Reverse Housing Budget Finder' : 'کاشف معکوس بودجه مسکن'}
      onClick={onClose}
      style={{ zIndex: 'var(--z-modal-backdrop, 60)' }}
      className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fadeIn"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-white shadow-2xl outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[11px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase block mb-0.5">
              {isEn ? 'Budget-to-Map Geospatial Match' : 'تطبیق توان مالی با نقشه شهر'}
            </span>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              {isEn ? 'Where can I buy a home with my budget?' : 'با بودجه من کجای شهر می‌توانم خانه بخرم؟'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button
              type="button"
              onClick={onClose}
              aria-label={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              {isEn ? 'Total Buy Budget (Million Toman):' : 'بودجه کل خرید شما (میلیون تومان):'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              aria-label={isEn ? 'Total Buy Budget (Million Toman)' : 'بودجه کل خرید شما (میلیون تومان)'}
              value={totalBudgetMillion}
              onChange={(e) => setBudgetFilter({ totalBudgetMillion: normalizeFinancialInput(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-base font-black text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-slate-900 dark:focus:border-white transition"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {budgetCheck.verbalPersianText} ({formatMillionTomanAsIntlCurrency(totalBudgetMillion, intlCurrency, radarLocale)}){useLoanBooster ? ' + ۱.۲ میلیارد وام' : ''}{deductTenantRahnInBuy ? ' · با کسر رهن و تنفس سند' : ''}
              </span>
              <div className="flex items-center gap-1">
                {BUDGET_PRESETS_MILLION.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setBudgetFilter({ totalBudgetMillion: preset.value })}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition cursor-pointer ${
                      totalBudgetMillion === preset.value
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {isEn ? preset.labelEn : preset.labelFa}
                  </button>
                ))}
              </div>
            </div>
            {budgetCheck.isLikelyMissingZeros && budgetCheck.warningMessage && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                <span>{budgetCheck.warningMessage}</span>
                <button
                  type="button"
                  onClick={() => setBudgetFilter({ totalBudgetMillion: budgetCheck.normalizedMillionValue * 1000 })}
                  className="rounded-md bg-amber-700 px-2 py-0.5 text-white hover:bg-amber-800 cursor-pointer"
                >
                  {isEn ? `Fix to ${fmt.format(budgetCheck.normalizedMillionValue * 1000)}M` : `اصلاح به ${fmt.format(budgetCheck.normalizedMillionValue * 1000)} م`}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                <span>{isEn ? 'Area:' : 'متراژ:'}</span>
                <span className="tabular-nums">{formatAreaShort(desiredAreaSqm, areaUnit)}</span>
              </div>
              <input
                type="range" min={40} max={250} step={5} value={desiredAreaSqm} aria-label={isEn ? 'Desired Area' : 'متراژ مورد نظر'}
                onChange={(e) => setBudgetFilter({ desiredAreaSqm: normalizeFinancialInput(e.target.value) })}
                className="w-full accent-slate-900 dark:accent-white cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                <span>{isEn ? 'Building Age:' : 'سن بنا:'}</span>
                <span className="tabular-nums">{isEn ? `Up to ${fmt.format(maxBuildingAgeYears)} yrs` : `تا ${fmt.format(maxBuildingAgeYears)} سال`}</span>
              </div>
              <input
                type="range" min={0} max={25} step={1} value={maxBuildingAgeYears} aria-label={isEn ? 'Max Building Age' : 'حداکثر سن بنا'}
                onChange={(e) => setBudgetFilter({ maxBuildingAgeYears: normalizeFinancialInput(e.target.value) })}
                className="w-full accent-slate-900 dark:accent-white cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Matches list with zero-pill discipline */}
        <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
          {rankedMatches.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {isEn ? 'No neighborhoods found within average price range for this budget. Try adjusting area or building age.' : 'با این بودجه و متراژ، محله‌ای در محدوده قیمت میانگین یافت نشد. متراژ را کاهش دهید یا سن بنا را افزایش دهید.'}
            </div>
          ) : (
            rankedMatches.map((hood) => {
              const uAsk = convertPricePerSqmToUnit(hood.effectiveSqmPrice, areaUnit);
              const uDeal = convertPricePerSqmToUnit(hood.estimatedDealSqmPrice, areaUnit);
              const uLabel = areaUnit === 'sqft' ? (isEn ? '/ft²' : 'هر ft² ') : (isEn ? '/m²' : 'متری ');
              return (
                <div
                  key={hood.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-3.5 hover:border-slate-900 dark:hover:border-white transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{hood.nameFa}</span>
                      <span className="text-[11px] text-slate-400">{hood.zoneLabel || (isEn ? `Dist. ${fmt.format(hood.districtNumber)}` : `منطقه ${fmt.format(hood.districtNumber)}`)}</span>
                      <span className="text-[11px] font-semibold">
                        {hood.status === 'AFFORDABLE' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">{isEn ? '● Within Budget' : '● همخوان با بودجه'}</span>
                        ) : hood.isDealWithinBudget ? (
                          <span className="text-teal-600 dark:text-teal-400">{isEn ? '● Within Budget via v6.4 Negotiation' : '● در بودجه با سناریوی مذاکره v6.4'}</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">{isEn ? '● Negotiable (up to 12%)' : '● نیازمند چانه‌زنی (تا ۱۲٪)'}</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {isEn ? `Asking: ${fmt.format(uAsk)}M${uLabel}` : `${uLabel}${fmt.format(uAsk)} م`} · <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{isEn ? `Deal v6.4: ${fmt.format(uDeal)}M` : `سناریو v6.4 (غیرثبتی): ${fmt.format(uDeal)} م`}</span> · {isEn ? `Unit Total: ${fmt.format(hood.estimatedTotalMillion)}M` : `کل واحد: ${formatMillionToVerbalPersian(hood.estimatedTotalMillion)}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectNeighborhood(hood.id, totalBudgetMillion, desiredAreaSqm, maxBuildingAgeYears);
                      onClose();
                    }}
                    aria-label={isEn ? `Inspect ${hood.nameFa}` : `بررسی محله ${hood.nameFa}`}
                    className="rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-bold text-white dark:text-slate-900 hover:opacity-90 cursor-pointer transition shrink-0"
                  >
                    {isEn ? 'Inspect' : 'بررسی'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
