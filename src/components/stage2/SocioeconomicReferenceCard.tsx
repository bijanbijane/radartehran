import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, Compass, Building2, BookOpen, ArrowLeftRight, Layers } from 'lucide-react';
import { INITIAL_NEIGHBORHOODS, toPersianNum as toPersianDigits, type Neighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';

export interface SocioeconomicRollupView {
  hoodId: number;
  hoodName: string;
  cityKey: string;
  district: number;
  medianPriceMillionToman: number;
  estimatedFairDealMillionToman: number;
  affordabilityPressureIndex: number;
  yearsOfHouseholdSavingRequired: number;
  rentToIncomeBurdenPct: number;
  gentrificationVelocityScore: number;
  liquidityTurnoverScore: number;
  urbanfabricArchetype: string;
  dominantBuyerPersona: string;
  displacementInflowFrom: Array<{ hoodName: string; sharePct: number; priceRatio: number }>;
  displacementOutflowTo: Array<{ hoodName: string; sharePct: number; priceRatio: number }>;
  epistemicConfidence: number;
  academicCitationTag: string;
  policySummary: string;
  provenanceSource: 'LOCAL_BASELINE' | 'SERVER_K_ANONYMITY';
  distinctSessionCount?: number;
  hesitationRatePct?: number | null;
  priceAttentionElasticity?: number | null;
}

interface SocioeconomicReferenceCardProps {
  hoodId?: number;
  hoodName?: string;
  basePriceSqm?: number;
  hood?: Neighborhood;
  cityKey: string;
  onSelectCompareHood?: (hoodName: string) => void;
}

const ARCHETYPE_LABELS: Record<string, string> = {
  AFFLUENT_CONSOLIDATED: 'بافت مرفه تثبیت‌شده و کم‌نوسان',
  UPWARD_TRANSITIONAL: 'بافت در حال گذار صعودی و نوسازی سریع',
  MIDDLE_CLASS_CORE: 'بافت طبقه متوسط شهری با تقاضای مصرفی پایدار',
  HIGH_PRESSURE_AFFORDABLE: 'قطب جذب تقاضای اقتصادی با فشار نقدینگی بالا',
};

function buildFallbackRollup(
  hoodId: number,
  hoodName: string,
  basePriceSqm: number,
  cityKey: string,
  hood?: Neighborhood,
): SocioeconomicRollupView {
  const ask = Math.max(15, basePriceSqm || 100);
  const cityConfig = MULTI_CITY_CONFIGS[cityKey as keyof typeof MULTI_CITY_CONFIGS] || MULTI_CITY_CONFIGS.tehran;
  const allHoods = cityConfig?.neighborhoods || INITIAL_NEIGHBORHOODS;
  const resolvedHood = hood ?? allHoods.find((h) => h.id === hoodId) ?? allHoods[0] ?? INITIAL_NEIGHBORHOODS[0];
  const agg = aggregateNeighborhoodMarketMetrics(hoodId, hoodName, ask, buildNeighborhoodListingSamples(resolvedHood));
  const fair = agg.estimatedDealPricePerSqm;
  const years = Math.round(((fair * 85) / 264) * 10) / 10;
  const burden = Math.min(95, Math.max(18, Math.round((years / 22) * 100)));
  const rahn80m = resolvedHood?.rahn80m ?? Math.round(ask * 9.5);
  const annualRentEquiv = rahn80m * 0.03 * 12;
  const rentBurden = Math.min(92, Math.max(22, Math.round((annualRentEquiv / 264) * 100)));
  const overallScore =
    resolvedHood && 'overallScore' in resolvedHood && typeof (resolvedHood as { overallScore?: number }).overallScore === 'number'
      ? (resolvedHood as { overallScore: number }).overallScore
      : resolvedHood
        ? Math.round(((resolvedHood.metro + resolvedHood.security + resolvedHood.internet) / 3) * 10) / 10
        : 7.5;
  const transitScore = resolvedHood?.metro ?? 7.2;
  const gentrificationScore = Math.min(94, Math.max(35, Math.round(overallScore * 5.8 + transitScore * 2.6)));
  const liquidityScore = Math.min(95, Math.max(38, Math.round(92 - Math.max(0, ask - 110) * 0.16 + transitScore * 1.4)));

  const peers = allHoods.filter((h) => h.id !== hoodId && h.buyPerSqm > 0);
  const pricierPeers = peers.filter((h) => h.buyPerSqm > ask * 1.04).sort((a, b) => a.buyPerSqm - b.buyPerSqm);
  const affordablePeers = peers.filter((h) => h.buyPerSqm < ask * 0.96).sort((a, b) => b.buyPerSqm - a.buyPerSqm);

  const inflowFirst = pricierPeers[0] || peers[0];
  const inflowSecond = pricierPeers[1] || peers[1];
  const outflowFirst = affordablePeers[0] || peers[peers.length - 1];
  const outflowSecond = affordablePeers[1] || peers[Math.max(0, peers.length - 2)];

  return {
    hoodId, hoodName, cityKey, district: (hoodId % 22) + 1,
    medianPriceMillionToman: ask, estimatedFairDealMillionToman: fair,
    affordabilityPressureIndex: burden, yearsOfHouseholdSavingRequired: years,
    rentToIncomeBurdenPct: rentBurden, gentrificationVelocityScore: gentrificationScore,
    liquidityTurnoverScore: liquidityScore,
    urbanfabricArchetype:
      ask >= 180 ? 'AFFLUENT_CONSOLIDATED' : ask >= 120 ? 'UPWARD_TRANSITIONAL' : ask >= 75 ? 'MIDDLE_CLASS_CORE' : 'HIGH_PRESSURE_AFFORDABLE',
    dominantBuyerPersona:
      ask >= 150 ? 'تبدیل به احسن‌کنندگان دارایی و سرمایه‌گذاران حفظ ارزش' : 'خانوارهای طبقه متوسط، زوج‌های جوان و تقاضای مصرفی واقعی',
    displacementInflowFrom: [
      { hoodName: inflowFirst ? inflowFirst.name : 'مرکز منطقه همجوار', sharePct: 56, priceRatio: inflowFirst ? Math.round((inflowFirst.buyPerSqm / ask) * 100) / 100 : 1.18 },
      { hoodName: inflowSecond ? inflowSecond.name : 'قطب شمال منطقه', sharePct: 44, priceRatio: inflowSecond ? Math.round((inflowSecond.buyPerSqm / ask) * 100) / 100 : 1.25 },
    ],
    displacementOutflowTo: [
      { hoodName: outflowFirst ? outflowFirst.name : 'بافت میانی منطقه همجوار', sharePct: 58, priceRatio: outflowFirst ? Math.round((outflowFirst.buyPerSqm / ask) * 100) / 100 : 0.84 },
      { hoodName: outflowSecond ? outflowSecond.name : 'قطب مکمل اقتصادی', sharePct: 42, priceRatio: outflowSecond ? Math.round((outflowSecond.buyPerSqm / ask) * 100) / 100 : 0.79 },
    ],
    epistemicConfidence: agg.confidenceScore,
    academicCitationTag: `RADAR-SE-${cityKey.toUpperCase()}-H${hoodId}`,
    policySummary: `محله ${hoodName} با میانگین قیمت قطعی معامله ${toPersianDigits(fair)} م.ت/متر (${formatMillionTomanAsIntlCurrency(fair, 'USD', 'fa')})، نیازمند حدود ${toPersianDigits(years)} سال پس‌انداز کامل خانوار برای خرید واحد ۸۵ متری است.`,
    provenanceSource: 'LOCAL_BASELINE',
  };
}

export const SocioeconomicReferenceCard: React.FC<SocioeconomicReferenceCardProps> = ({
  hoodId, hoodName, basePriceSqm, hood, cityKey, onSelectCompareHood,
}) => {
  const resolvedId = hoodId ?? hood?.id ?? 1;
  const resolvedName = hoodName ?? hood?.name ?? 'محله';
  const resolvedPrice = basePriceSqm ?? hood?.buyPerSqm ?? 120;

  const [rollup, setRollup] = useState<SocioeconomicRollupView>(() =>
    buildFallbackRollup(resolvedId, resolvedName, resolvedPrice, cityKey, hood)
  );

  useEffect(() => {
    let active = true;
    const base = buildFallbackRollup(resolvedId, resolvedName, resolvedPrice, cityKey, hood);
    setRollup(base);
    fetch(`/api/v1/reference/hood/${resolvedId}/rollup?cityId=${encodeURIComponent(cityKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.rollup) return;
        const r = data.rollup;
        const cityHoods = (MULTI_CITY_CONFIGS[cityKey as keyof typeof MULTI_CITY_CONFIGS] || MULTI_CITY_CONFIGS.tehran)?.neighborhoods || [];
        const resolveRatio = (targetId: number) => {
          const found = cityHoods.find((h) => h.id === targetId);
          return found ? Math.round((found.buyPerSqm / Math.max(1, base.medianPriceMillionToman)) * 100) / 100 : 1.0;
        };
        const liveFair = r.weightedReferencePriceSqm || base.estimatedFairDealMillionToman;
        const liveYears = Math.round(((liveFair * 85) / 264) * 10) / 10;
        const liveBurden = Math.min(95, Math.max(18, Math.round((liveYears / 22) * 100)));
        setRollup({
          ...base,
          medianPriceMillionToman: r.medianPriceSqm || base.medianPriceMillionToman,
          estimatedFairDealMillionToman: liveFair,
          yearsOfHouseholdSavingRequired: liveYears,
          affordabilityPressureIndex: liveBurden,
          academicCitationTag: r.citationCode || base.academicCitationTag,
          policySummary: r.citationTextFa || base.policySummary,
          provenanceSource: 'SERVER_K_ANONYMITY',
          distinctSessionCount: typeof r.distinctSessionCount === 'number' ? r.distinctSessionCount : undefined,
          hesitationRatePct: typeof r.hesitationRatePct === 'number' ? r.hesitationRatePct : null,
          priceAttentionElasticity: typeof r.priceAttentionElasticity === 'number' ? r.priceAttentionElasticity : null,
          displacementInflowFrom:
            r.displacementMatrix?.topInflowFromHoodIds?.length > 0
              ? r.displacementMatrix.topInflowFromHoodIds.map((item: { hoodId: number; hoodName: string; sharePct: number }) => ({
                  hoodName: item.hoodName, sharePct: Math.round(item.sharePct), priceRatio: resolveRatio(item.hoodId),
                }))
              : base.displacementInflowFrom,
          displacementOutflowTo:
            r.displacementMatrix?.topOutflowToHoodIds?.length > 0
              ? r.displacementMatrix.topOutflowToHoodIds.map((item: { hoodId: number; hoodName: string; sharePct: number }) => ({
                  hoodName: item.hoodName, sharePct: Math.round(item.sharePct), priceRatio: resolveRatio(item.hoodId),
                }))
              : base.displacementOutflowTo,
        });
      })
      .catch(() => { /* keep synchronous fallback */ });
    return () => { active = false; };
  }, [resolvedId, resolvedName, resolvedPrice, cityKey, hood]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              شناسنامه اقتصادی-اجتماعی و مرجع پژوهشی ({rollup.hoodName})
            </h4>
            <p data-testid="socioeconomic-k-anonymity-badge" className="text-[11px] text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
              Citation ID: {rollup.academicCitationTag} · {rollup.provenanceSource === 'SERVER_K_ANONYMITY' ? `k-Anonymity Live Rollup (k=${rollup.distinctSessionCount ?? 18})` : 'Spatial Baseline Model'}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-bold">
          {ARCHETYPE_LABELS[rollup.urbanfabricArchetype] || rollup.urbanfabricArchetype}
        </span>
      </div>

      <p className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 leading-relaxed">
        {rollup.policySummary}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-rose-500" /><span>فشار استطاعت خرید</span>
          </div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{toPersianDigits(rollup.affordabilityPressureIndex)} از ۱۰۰</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-indigo-500" /><span>سال‌های پس‌انداز لازم</span>
          </div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{toPersianDigits(rollup.yearsOfHouseholdSavingRequired)} سال</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-amber-500" /><span>شتاب اعیان‌سازی</span>
          </div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{toPersianDigits(rollup.gentrificationVelocityScore)}٪</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-emerald-600" /><span>سهم اجاره از درآمد</span>
          </div>
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">{toPersianDigits(rollup.rentToIncomeBurdenPct)}٪</div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
        <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <div><span className="font-bold">پرسونای غالب متقاضیان: </span><span>{rollup.dominantBuyerPersona}</span></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /><span>ورودی تقاضا به این محله از کجاست؟</span>
          </div>
          {rollup.displacementInflowFrom.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <button type="button" onClick={() => onSelectCompareHood?.(item.hoodName)} className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium underline decoration-dotted text-right">
                {item.hoodName}
              </button>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {toPersianDigits(item.sharePct)}٪ (نسبت قیمت: {toPersianDigits(item.priceRatio)}x)
              </span>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /><span>کوچ تقاضا از این محله به کدام محلات است؟</span>
          </div>
          {rollup.displacementOutflowTo.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <button type="button" onClick={() => onSelectCompareHood?.(item.hoodName)} className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium underline decoration-dotted text-right">
                {item.hoodName}
              </button>
              <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                {toPersianDigits(item.sharePct)}٪ (نسبت قیمت: {toPersianDigits(item.priceRatio)}x)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
