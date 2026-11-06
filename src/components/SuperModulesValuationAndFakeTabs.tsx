import React, { useState, useMemo, useEffect } from 'react'; import { Award, Building2, Calculator, Copy, Home, Scale, ShieldAlert, TrendingUp } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics, extractListingSpecsFromText } from '../data/realMarketPriceAggregator'; import { clampNumber, safeLocalStorageGet, safeLocalStorageSet } from '../utils/security'; import { DeedType, DEED_TYPE_OPTIONS, ParkingType, PARKING_OPTIONS, GOLD_18K_TOMAN_PRICE, USD_TOMAN_PRICE, GOLD_COIN_EMAMI_PRICE_MILLION, calculateDetailedValuation, calculateLandShare, calculateFloorplanOptimization, calculateNegotiationStrategy, calculateAuctionBidding, IRAN_SEASONAL_MARKET_CALENDAR, calculateCombinedBuyingPower, calculateDepositInflationLoss, calculateRahnArbitrage } from '../data/superModulesLogic'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; interface SavedPortfolioProperty { hoodId: number; hoodName: string; sqm: number; totalValueMillion: number; goldCoinsEquivalent: number; usdEquivalent: number; savedAtFa: string; }
const MY_PORTFOLIO_STORAGE_KEY = 'tehran_radar_my_portfolio_v1'; export interface SuperModulesValuationAndFakeTabsProps { activeTab: SuperModuleTabId; activeHood: EvaluatedNeighborhood; valSqm: number; setValSqm: (v: number) => void; valBedrooms: number; setValBedrooms: (v: number) => void; valuationResult: ReturnType<typeof calculateDetailedValuation>; valAge: number; setValAge: (v: number) => void; valFloor: number; setValFloor: (v: number) => void; valDeedType: DeedType; setValDeedType: (v: DeedType) => void; valParkingType: ParkingType; setValParkingType: (v: ParkingType) => void; valHasElevator: boolean; setValHasElevator: (v: boolean) => void; valHasStorage: boolean; setValHasStorage: (v: boolean) => void; valRenovation: 'renovated' | 'standard' | 'needs_work'; setValRenovation: (v: 'renovated' | 'standard' | 'needs_work') => void; valLight: 'south' | 'normal' | 'dim'; setValLight: (v: 'south' | 'normal' | 'dim') => void; gold18kPriceToman: number; setGold18kPriceToman: (v: number) => void; usdPriceToman: number; setUsdPriceToman: (v: number) => void; onApplyCombinedBudget?: (totalBudgetMillion: number, targetSqm: number) => void; }
export function SuperModulesValuationAndFakeTabs(props: SuperModulesValuationAndFakeTabsProps): React.ReactElement | null { const { activeTab, activeHood, valSqm, setValSqm, valBedrooms, setValBedrooms, valuationResult, valAge, setValAge, valFloor, setValFloor, valDeedType, setValDeedType, valParkingType, setValParkingType, valHasElevator, setValHasElevator, valHasStorage, setValHasStorage, valRenovation, setValRenovation, valLight, setValLight, gold18kPriceToman, setGold18kPriceToman, usdPriceToman, setUsdPriceToman, onApplyCombinedBudget, } = props; const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const [valCertificateCopied, setValCertificateCopied] = useState<boolean>(false); const [landPlotSqm, setLandPlotSqm] = useState<number>(350); const [landTotalUnits, setLandTotalUnits] = useState<number>(10); const [floorCorridorSqm, setFloorCorridorSqm] = useState<number>(12); const [portfolioNotice, setPortfolioNotice] = useState<string>(''); const [savedPortfolioList, setSavedPortfolioList] = useState<SavedPortfolioProperty[]>(() => { const raw = safeLocalStorageGet<SavedPortfolioProperty[] | SavedPortfolioProperty | null>(MY_PORTFOLIO_STORAGE_KEY, null); if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && 'hoodId' in raw) return [raw]; return []; }); const landShareResult = useMemo(() => { const basePrice = activeHood.baseBuyPerSqm ?? activeHood.buyPerSqm; return calculateLandShare({ totalPlotSqm: landPlotSqm, totalBuildingUnits: landTotalUnits, unitSqm: valSqm, totalBuildingFloorSqm: Math.max(valSqm, landTotalUnits * valSqm), neighborhoodLandPerSqmMillion: Math.round(basePrice * 1.5), }); }, [landPlotSqm, landTotalUnits, valSqm, activeHood]);
  const floorplanResult = useMemo(() => calculateFloorplanOptimization({ totalSqm: valSqm, corridorSqm: floorCorridorSqm, irregularCorners: 2, balconySqm: 4, currentBedrooms: valBedrooms, buyPerSqmMillion: valuationResult.fairPerSqm, }), [valSqm, floorCorridorSqm, valBedrooms, valuationResult.fairPerSqm]); const handleSaveToPortfolio = () => { const property: SavedPortfolioProperty = { hoodId: activeHood.id, hoodName: activeHood.name, sqm: valSqm, totalValueMillion: valuationResult.fairTotalMillion, goldCoinsEquivalent: Math.round(valuationResult.fairTotalMillion / GOLD_COIN_EMAMI_PRICE_MILLION),
      usdEquivalent: valuationResult.usdPriceTotal, savedAtFa: new Date().toLocaleDateString('fa-IR'), }; setSavedPortfolioList((prev) => { const next = [property, ...prev.filter((item) => !(item.hoodId === property.hoodId && item.sqm === property.sqm))].slice(0, 10); safeLocalStorageSet(MY_PORTFOLIO_STORAGE_KEY, next); return next; }); setPortfolioNotice('ملک شما با موفقیت به پرتفوی دارایی اضافه شد.'); setTimeout(() => setPortfolioNotice(''), 3000); }; const [adClaimedSqmPrice, setAdClaimedSqmPrice] = useState<number>(() => Math.round(activeHood.buyPerSqm * 0.72)); const [adClaimedSqm, setAdClaimedSqm] = useState<number>(80); const [adClaimedAge, setAdClaimedAge] = useState<number>(2); const [adText, setAdText] = useState<string>('زیر قیمت منطقه به علت مهاجرت فوری، عکس‌ها تزیینی، فقط خریدار نقد تماس بگیرد'); const [buyerReadyCashMillion, setBuyerReadyCashMillion] = useState<number>(() => Math.round(activeHood.buyPerSqm * 55)); const [auctionBasePriceMillion, setAuctionBasePriceMillion] = useState<number>(() => Math.round(activeHood.buyPerSqm * 80 * 0.7)); useEffect(() => { setAdClaimedSqmPrice(Math.round(activeHood.buyPerSqm * 0.72)); setBuyerReadyCashMillion(Math.round(activeHood.buyPerSqm * 55));
    setAuctionBasePriceMillion(Math.round(activeHood.buyPerSqm * 80 * 0.7)); }, [activeHood.buyPerSqm]); const fakeAdAnalysis = useMemo(() => { const baseNewPrice = Number(activeHood.baseBuyPerSqm ?? activeHood.buyPerSqm);
    const ageAdjustment = Math.max(0.74, 1 - Math.max(0, Number(adClaimedAge) || 0) * 0.012); const averagePrice = Math.round(baseNewPrice * ageAdjustment); const listingPrice = Number(adClaimedSqmPrice); const hasValidPrices = Number.isFinite(averagePrice) && averagePrice > 0 && Number.isFinite(listingPrice) && listingPrice > 0;
    const discountPct = hasValidPrices ? Math.round(((averagePrice - listingPrice) / averagePrice) * 100) : 0; const baitKeywords = ['تخلیه فوری', 'پول‌لازم', 'زیر قیمت', 'فروش فوری', 'عکس‌ها تزیینی', 'عکس متعلق به خود واحد نیست', 'سند در دست اقدام', 'فقط نقد', 'مهاجرت'];
    const normalizedText = adText.normalize('NFKC').trim(); const matchedBaits = baitKeywords.filter((kw) => normalizedText.includes(kw.normalize('NFKC'))); let warningScore = 10; if (discountPct > 30) warningScore += 50;
    else if (discountPct > 20) warningScore += 35; else if (discountPct > 12) warningScore += 18; warningScore = Math.min(99, Math.max(5, warningScore + matchedBaits.length * 12)); const questions = [
      'آیا اصل سند و هویت مالک پیش از هرگونه پرداخت بررسی می‌شود؟', 'آیا بازدید حضوری از همان واحد امکان‌پذیر است؟', 'آیا وضعیت پارکینگ، انباری و متراژ با سند تطبیق داده شده است؟', ]; return {
      discountPct, warningScore, matchedBaits, questions, level: warningScore >= 65 ? 'HIGH' : warningScore >= 35 ? 'MEDIUM' : 'LOW',
      isValid: hasValidPrices, };
  }, [activeHood.baseBuyPerSqm, activeHood.buyPerSqm, adClaimedAge, adClaimedSqmPrice, adText]); const negotiationResult = useMemo(() => calculateNegotiationStrategy({
    askingPriceMillion: adClaimedSqmPrice * adClaimedSqm,
    neighborhoodAvgPriceMillion: activeHood.buyPerSqm * adClaimedSqm,
    buyerReadyCashMillion, propertyAge: adClaimedAge,
  }), [adClaimedSqmPrice, adClaimedSqm, activeHood.buyPerSqm, buyerReadyCashMillion, adClaimedAge]);
  const auctionResult = useMemo(() => calculateAuctionBidding({
    retailMarketValueMillion: activeHood.buyPerSqm * adClaimedSqm, auctionBasePriceMillion,
  }), [activeHood.buyPerSqm, adClaimedSqm, auctionBasePriceMillion]);
  const [cashSavingsMillion, setCashSavingsMillion] = useState<number>(3500);
  const [carSaleBudgetMillion, setCarSaleBudgetMillion] = useState<number>(1200);
  const [goldCoinBudgetMillion, setGoldCoinBudgetMillion] = useState<number>(850);
  const [housingLoanMillion, setHousingLoanMillion] = useState<number>(1480);
  const [arbFundYieldPercent, setArbFundYieldPercent] = useState<number>(34);
  const [arbMonthlyRentDiffMillion, setArbMonthlyRentDiffMillion] = useState<number>(() => Math.max(1, Math.round((activeHood.rahn80m * 0.5) / 33.3)));
  useEffect(() => { setArbMonthlyRentDiffMillion(Math.max(1, Math.round((activeHood.rahn80m * 0.5) / 33.3))); }, [activeHood.rahn80m]);
  const combinedPowerResult = useMemo(() => calculateCombinedBuyingPower({
    cashSavingsMillion, carSaleBudgetMillion, goldCoinBudgetMillion,
    housingLoanMillion, targetHoodRahn80mMillion: activeHood.rahn80m,
  }), [cashSavingsMillion, carSaleBudgetMillion, goldCoinBudgetMillion, housingLoanMillion, activeHood.rahn80m]);
  const depositInflationResult = useMemo(() => calculateDepositInflationLoss({ depositMillion: activeHood.rahn80m, annualInflationPercent: 40 }), [activeHood.rahn80m]);
  const rahnArbitrageResult = useMemo(() => calculateRahnArbitrage({
    rahnDifferenceMillion: Math.round(activeHood.rahn80m * 0.5),
    monthlyRentDifferenceMillion: arbMonthlyRentDiffMillion,
    fundAnnualYieldPercent: arbFundYieldPercent, }), [activeHood.rahn80m, arbMonthlyRentDiffMillion, arbFundYieldPercent]);
  if (activeTab === 'valuation') { return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calculator className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
              <span>مشخصات فنی و نوع سند در محله {activeHood.name}</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">پایه محله: {areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(activeHood.buyPerSqm, areaUnit))} م · معامله: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(activeHood.id, activeHood.name, activeHood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(activeHood.buyPerSqm, areaUnit), intlCurrency, locale)})` : ''}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">متراژ سندی ({formatAreaValue(valSqm, areaUnit, true)})</label><input type="number" min={30} max={500} value={valSqm} onChange={(e) => setValSqm(clampNumber(e.target.value, 30, 500, 85))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">سن بنا (سال)</label><input type="number" min={0} max={35} value={valAge} onChange={(e) => setValAge(clampNumber(e.target.value, 0, 35, 4))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">طبقه</label><input type="number" min={1} max={25} value={valFloor} onChange={(e) => setValFloor(clampNumber(e.target.value, 1, 25, 3))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">تعداد خواب</label>
              <select value={valBedrooms} onChange={(e) => setValBedrooms(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100">
                <option value={1}>۱ خوابه</option><option value={2}>۲ خوابه</option><option value={3}>۳ خوابه</option><option value={4}>۴ خوابه</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">نوع سند رسمی ملک (مطابق قانون ثبت رسمی):</label>
            <select value={valDeedType} onChange={(e) => setValDeedType(e.target.value as DeedType)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600">
              {DEED_TYPE_OPTIONS.map((d) => (<option key={d.id} value={d.id}>{d.label} ({d.badge})</option>))}
            </select>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">ℹ️ {valuationResult.deedInfo.legalNotice}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">وضعیت پارکینگ</label><select value={valParkingType} onChange={(e) => setValParkingType(e.target.value as ParkingType)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-900 dark:text-slate-100">{PARKING_OPTIONS.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}</select></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">جهت و نورگیر واحد</label><select value={valLight} onChange={(e) => setValLight(e.target.value as 'south' | 'normal' | 'dim')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-900 dark:text-slate-100"><option value="south">جنوبی / دوکله (+۳٪)</option><option value="normal">شمالی / استاندارد</option><option value="dim">کم‌نور رو به پاسیو (-۳٪)</option></select></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">وضعیت بازسازی</label><select value={valRenovation} onChange={(e) => setValRenovation(e.target.value as 'renovated' | 'standard' | 'needs_work')} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-900 dark:text-slate-100"><option value="renovated">بازسازی کامل و مدرن</option><option value="standard">تمیز و استاندارد</option><option value="needs_work">نیازمند بازسازی</option></select></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-slate-700 dark:text-slate-300 pt-0.5">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={valHasElevator} onChange={(e) => setValHasElevator(e.target.checked)} className="rounded text-emerald-600" /><span>آسانسور</span></label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={valHasStorage} onChange={(e) => setValHasStorage(e.target.checked)} className="rounded text-emerald-600" /><span>انباری سندی</span></label>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
              <span>نرخ طلای ۱۸ عیار:</span>
              <input type="number" value={gold18kPriceToman} onChange={(e) => setGold18kPriceToman(clampNumber(e.target.value, 1000000, 30000000, GOLD_18K_TOMAN_PRICE))} className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 font-bold text-slate-800 dark:text-slate-100 tabular-nums" />
              <span>نرخ دلار:</span>
              <input type="number" value={usdPriceToman} onChange={(e) => setUsdPriceToman(clampNumber(e.target.value, 30000, 300000, USD_TOMAN_PRICE))} className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 font-bold text-slate-800 dark:text-slate-100 tabular-nums" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center justify-between">
              <span>محاسبه‌گر قدرالسهم عرصه و پرتی نقشه:</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums">
                {landShareResult.landShareMethod === 'REGISTERED'
                  ? `قدرالسهم ثبت‌شده: ${formatAreaValue(landShareResult.exactLandShareSqm, areaUnit, true)}`
                  : `برآورد سهم زمین: ${formatAreaValue(landShareResult.exactLandShareSqm, areaUnit, true)}`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div><span className="text-slate-500 dark:text-slate-400">عرصه ({formatAreaValue(landPlotSqm, areaUnit, true)}):</span><input type="number" value={landPlotSqm} onChange={(e) => setLandPlotSqm(clampNumber(e.target.value, 100, 3000, 350))} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 font-bold text-slate-900 dark:text-slate-100 mt-0.5" /></div>
              <div><span className="text-slate-500 dark:text-slate-400">تعداد کل واحدها:</span><input type="number" value={landTotalUnits} onChange={(e) => setLandTotalUnits(clampNumber(e.target.value, 2, 80, 10))} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 font-bold text-slate-900 dark:text-slate-100 mt-0.5" /></div>
              <div><span className="text-slate-500 dark:text-slate-400">پرتی ({formatAreaValue(floorCorridorSqm, areaUnit, true)}):</span><input type="number" value={floorCorridorSqm} onChange={(e) => setFloorCorridorSqm(clampNumber(e.target.value, 0, 50, 12))} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 font-bold text-slate-900 dark:text-slate-100 mt-0.5" /></div>
            </div>
            <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg leading-relaxed">
              ارزش تقریبی سهم زمین بر اساس ورودی‌های فعلی حدود <strong>{toPersianNum((landShareResult.pureLandValueMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(landShareResult.pureLandValueMillion, intlCurrency, locale)})` : ''}</strong> است. این برآورد جایگزین قدرالسهم ثبت‌شده در سند مالکیت نیست. {floorplanResult.recommendation} </div>
          </div>
        </div>
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border-2 border-emerald-600/80 rounded-2xl p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">گواهی رسمی کارشناسی هوشمند ارزش ملک</div>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">واحد {formatAreaValue(valSqm, areaUnit, true)} در {activeHood.name}</div>
              </div>
              <Award className="w-6 h-6 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
            <div className="bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl p-3 space-y-1">
              <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">ارزش منصفانه روز بازار (Fair Market Value):</div>
              <div className="text-xl font-black text-emerald-950 dark:text-emerald-200 tabular-nums">{toPersianNum((valuationResult.fairTotalMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fairTotalMillion, intlCurrency, locale)})` : ''}</div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                معادل {areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(valuationResult.fairPerSqm, areaUnit))} میلیون تومان ({valuationResult.multiplierPercent >= 0 ? '+' : ''}{toPersianNum(valuationResult.multiplierPercent)}٪ تراز واحد)
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
              <div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">معادل طلا ۱۸ عیار:</div>
                <div className="text-xs font-black text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">{toPersianNum(valuationResult.goldGramPriceTotal.toLocaleString())} گرم طلا</div>
                <div className="text-[9px] text-slate-400">{areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(valuationResult.goldGramPricePerSqm, areaUnit))} گرم</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">معادل دلار:</div>
                <div className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 tabular-nums">${toPersianNum(valuationResult.usdPriceTotal.toLocaleString())}</div>
                <div className="text-[9px] text-slate-400">{areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(valuationResult.usdPricePerSqm, areaUnit))}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl p-2">
                <div className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">فروش فوری (شکار -۱۲٪):</div>
                <div className="text-xs font-black text-amber-950 dark:text-amber-200 mt-0.5 tabular-nums">{toPersianNum((valuationResult.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fastSaleTotalMillion, intlCurrency, locale)})` : ''}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold">رهن کامل معادل (اجاره: {toPersianNum(Math.round(valuationResult.fullRahnMillion * 0.03))} م/ماه):</div>
                <div className="text-xs font-black text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">{toPersianNum(valuationResult.fullRahnMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fullRahnMillion, intlCurrency, locale)})` : ''}</div>
              </div>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={handleSaveToPortfolio} className="w-full py-2 px-3 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition">
              <Home className="w-4 h-4 stroke-[1.75]" />
              <span>افزودن این خانه به «پرتفوی دارایی ملکی من»</span>
            </button>
            {savedPortfolioList.length > 0 && (
              <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-[10px] text-emerald-950 dark:text-emerald-200 space-y-1 max-h-24 overflow-y-auto">
                {savedPortfolioList.map((item, idx) => (
                  <div key={`${item.hoodId}-${item.sqm}-${idx}`} className="flex items-center justify-between">
                    <span>{toPersianNum(idx + 1)}. {item.hoodName} ({formatAreaValue(item.sqm, areaUnit, true)})</span>
                    <span className="font-black">{toPersianNum((item.totalValueMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(item.totalValueMillion, intlCurrency, locale)})` : ''} ({toPersianNum(item.goldCoinsEquivalent)} سکه)</span>
                  </div>
                ))} </div>
            )} {portfolioNotice && <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold text-center">{portfolioNotice}</div>} <button type="button" onClick={() => {
              const certText = `گواهی رسمی کارشناسی ملک رادار مسکن\nمحله: ${activeHood.name} | سند: ${valuationResult.deedInfo.label}\nمتراژ: ${formatAreaValue(valSqm, areaUnit, true)} | ارزش روز: ${toPersianNum((valuationResult.fairTotalMillion / 1000).toFixed(2))} میلیارد تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fairTotalMillion, intlCurrency, locale)})` : ''}\nمعادل طلای ۱۸ عیار: ${toPersianNum(valuationResult.goldGramPriceTotal.toLocaleString())} گرم | رهن کامل: ${toPersianNum(valuationResult.fullRahnMillion)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuationResult.fullRahnMillion, intlCurrency, locale)})` : ''}`;
              navigator.clipboard?.writeText(certText).catch(() => {}); setValCertificateCopied(true); setTimeout(() => setValCertificateCopied(false), 2000); }} className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 cursor-pointer transition">
              <Copy className="w-3.5 h-3.5 stroke-[1.75]" /><span>{valCertificateCopied ? 'متن گواهی کپی شد!' : 'کپی متن گواهی کارشناسی'}</span>
            </button>
          </div>
        </div>
      </div>
    ); } if (activeTab === 'fake_detector') { return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 stroke-[1.75] text-rose-600 dark:text-rose-400" />
            <span>مچ‌گیر هوشمند آگهی فیک و تله قیمتی ({activeHood.name})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">قیمت متری ({areaUnit === 'sqft' ? `${toPersianNum(convertPricePerSqmToUnit(adClaimedSqmPrice, areaUnit))} م/ft²` : `${toPersianNum(adClaimedSqmPrice)} م/m²`})</label><input type="number" value={adClaimedSqmPrice} onChange={(e) => setAdClaimedSqmPrice(clampNumber(e.target.value, 15, 600, 80))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">متراژ ({formatAreaValue(adClaimedSqm, areaUnit, true)})</label><input type="number" value={adClaimedSqm} onChange={(e) => setAdClaimedSqm(clampNumber(e.target.value, 30, 400, 80))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">سن بنای آگهی (سال)</label><input type="number" min={0} max={40} value={adClaimedAge} onChange={(e) => setAdClaimedAge(clampNumber(e.target.value, 0, 40, 8))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
            <div><label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">نقدینگی آماده (م){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(buyerReadyCashMillion, intlCurrency, locale)}` : ''}</label><input type="number" value={buyerReadyCashMillion} onChange={(e) => setBuyerReadyCashMillion(clampNumber(e.target.value, 100, 200000, 4500))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mb-1"><span>متن توضیحات آگهی دیوار/شیپور:</span><button type="button" onClick={() => { const s = extractListingSpecsFromText(adText, activeHood.buyPerSqm); setAdClaimedSqm(clampNumber(s.sqm, 30, 400, 80)); setAdClaimedAge(clampNumber(s.age ?? 2, 0, 40, 2)); if (s.totalMillion > 0) setAdClaimedSqmPrice(clampNumber(Math.round(s.totalMillion / Math.max(25, s.sqm)), 15, 600, adClaimedSqmPrice)); }} className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer">استخراج هوشمند مشخصات از متن</button></div>
            <textarea rows={2} value={adText} onChange={(e) => setAdText(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-100" />
          </div>
          <div className={`p-3 rounded-2xl border space-y-2 ${fakeAdAnalysis.level === 'HIGH' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/70 text-rose-950 dark:text-rose-200' : fakeAdAnalysis.level === 'MEDIUM' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-950 dark:text-amber-200' : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-950 dark:text-emerald-200'}`}>
            <div className="flex items-center justify-between font-extrabold text-sm">
              <span>امتیاز هشدار نشانه‌های مشکوک: {toPersianNum(fakeAdAnalysis.warningScore)} از ۱۰۰</span>
              <span className="text-[11px]">{fakeAdAnalysis.discountPct > 0 ? `${toPersianNum(fakeAdAnalysis.discountPct)}٪ زیر میانگین` : 'طبیعی'}</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              این امتیاز احتمال آماری کلاهبرداری نیست. پیش از پرداخت وجه، مالکیت، اصالت سند، امکان بازدید و مشخصات معامله را مستقلاً بررسی کنید.
            </p>
            {fakeAdAnalysis.matchedBaits.length > 0 && (
              <div className="text-[11px]">کلمات طعمه شناسایی‌شده: <strong>{fakeAdAnalysis.matchedBaits.join(' · ')}</strong></div>
            )} <div className="text-[10px] space-y-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="font-bold">۳ سوال تست املاک پشت تلفن:</div>
              {fakeAdAnalysis.questions.map((q, i) => (<div key={i}>{toPersianNum(i + 1)}. {q}</div>))} </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px] flex items-center justify-between">
              <span>تقویم فصلی خرید مسکن ایران:</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">آذر و دی = اوج چانه‌زنی خریدار</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              {IRAN_SEASONAL_MARKET_CALENDAR.slice(6, 10).map((m) => (
                <div key={m.month} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5">
                  <div className="font-black text-slate-800 dark:text-slate-200">{m.month}</div>
                  <div className="text-emerald-700 dark:text-emerald-400 font-bold">{toPersianNum(m.buyerAdvantageScore)}/۱۰ امتیاز خریدار</div>
                </div>
              ))} </div>
          </div>
        </div>
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <Scale className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
            <span>مربی تخفیف‌گیری سر جلسه قولنامه</span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">فرمول لنگراندازی و قیمت تارگت:</div>
            <div className="text-sm font-black text-emerald-950 dark:text-emerald-200 tabular-nums">
              پیشنهاد اولیه: {toPersianNum((negotiationResult.anchorOfferMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(negotiationResult.anchorOfferMillion, intlCurrency, locale)})` : ''} (تارگت توافق: {toPersianNum((negotiationResult.targetClosingPriceMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(negotiationResult.targetClosingPriceMillion, intlCurrency, locale)}` : ''})
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">صرفه‌جویی مورد انتظار: حدود {toPersianNum(negotiationResult.discountTomansMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(negotiationResult.discountTomansMillion, intlCurrency, locale)})` : ''}</div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">تقسیم مطمئن مراحل پرداخت چک صیادی:</div>
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2"><div className="text-slate-500 dark:text-slate-400 font-bold">پای قولنامه</div><div className="font-black text-slate-900 dark:text-slate-100 mt-0.5">۶۰٪</div><div className="text-[9px] text-slate-400">چک روز صیادی</div></div>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2"><div className="text-slate-500 dark:text-slate-400 font-bold">تحویل کلید</div><div className="font-black text-slate-900 dark:text-slate-100 mt-0.5">۲۵٪</div><div className="text-[9px] text-slate-400">پس از رویت تخلیه</div></div>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2"><div className="text-slate-500 dark:text-slate-400 font-bold">انتقال سند محضر</div><div className="font-black text-emerald-700 dark:text-emerald-400 mt-0.5">۱۵٪</div><div className="text-[9px] text-slate-400">تسویه نهایی</div></div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px] flex items-center justify-between">
              <span>رادار مزایده‌های بانکی و دادگستری:</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">{toPersianNum(auctionResult.discountFromRetailPercent)}٪ زیر قیمت</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <label className="text-slate-600 dark:text-slate-400">قیمت پایه کارشناسی مزایده (م):</label>
              <input type="number" value={auctionBasePriceMillion} onChange={(e) => setAuctionBasePriceMillion(clampNumber(e.target.value, 500, 500000, 5000))} className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 tabular-nums" />
            </div>
            <div className="text-[10px] text-slate-600 dark:text-slate-300">سپرده ۱۰٪ شرکت در مزایده: <strong>{toPersianNum(auctionResult.required10PercentDepositMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(auctionResult.required10PercentDepositMillion, intlCurrency, locale)})` : ''}</strong> (چک تضمین‌شده بانکی)</div>
            <div className="text-[10px] text-slate-600 dark:text-slate-300">سقف رقم پاکت اقتصادی: <strong>{toPersianNum(auctionResult.optimalBidEnvelopeMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(auctionResult.optimalBidEnvelopeMillion, intlCurrency, locale)})` : ''}</strong></div>
          </div>
        </div>
      </div>
    ); } return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
        <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
          <Building2 className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
          <span>فرمول خرید ترکیبی مسکن با تجمیع سرمایه‌ها و وام</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div><label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">پس‌انداز نقد (م)</label><input type="number" value={cashSavingsMillion} onChange={(e) => setCashSavingsMillion(clampNumber(e.target.value, 100, 100000, 3500))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
          <div><label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">فروش خودرو (م)</label><input type="number" value={carSaleBudgetMillion} onChange={(e) => setCarSaleBudgetMillion(clampNumber(e.target.value, 0, 50000, 1200))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
          <div><label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">فروش طلا/سکه (م)</label><input type="number" value={goldCoinBudgetMillion} onChange={(e) => setGoldCoinBudgetMillion(clampNumber(e.target.value, 0, 50000, 850))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
          <div><label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">وام مسکن زوجین (م)</label><input type="number" value={housingLoanMillion} onChange={(e) => setHousingLoanMillion(clampNumber(e.target.value, 0, 2000, 1480))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100" /></div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl p-3.5 space-y-2.5">
          <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold">قدرت خرید بر اساس نقدینگی، دارایی‌های قابل تبدیل و وام</div>
          <div className="text-xl font-black text-emerald-950 dark:text-emerald-200 tabular-nums">{toPersianNum((combinedPowerResult.totalPurchasingPowerWithRahnMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(combinedPowerResult.totalPurchasingPowerWithRahnMillion, intlCurrency, locale)})` : ''}</div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">ودیعهٔ مستأجر یک تعهد بازپرداخت است و به دارایی خالص شما اضافه نمی‌شود. با فرض قیمت متری ۷۵ میلیون تومان، بودجهٔ فعلی از نظر قیمت پایه برای حدود <strong>{formatAreaValue(combinedPowerResult.maxAffordableSqmAt75m ?? 0, areaUnit, true)}</strong> کافی است. هزینه‌های معامله، تعمیر و تعهدات احتمالی باید جداگانه بررسی شوند.</div>
          {onApplyCombinedBudget && (
            <button type="button" onClick={() => onApplyCombinedBudget(combinedPowerResult.totalPurchasingPowerWithRahnMillion, valSqm)} className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs cursor-pointer transition shadow-2xs">اعمال این بودجه ترکیبی روی رادار نقشه ({toPersianNum((combinedPowerResult.totalPurchasingPowerWithRahnMillion / 1000).toFixed(2))} میلیارد)</button>
          )} </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">محاسبه‌گر آب رفتن پول پیش مستأجر در تورم ۴۰٪:</div>
          <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">ودیعه {toPersianNum(activeHood.rahn80m)} میلیونی شما در پایان سال اول معادل قدرت خرید <strong>{toPersianNum(depositInflationResult.realValue1YrMillion)} میلیون{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(depositInflationResult.realValue1YrMillion, intlCurrency, locale)})` : ''}</strong> می‌شود. برای جبران این افت ارزش، پس‌انداز ماهانه <strong>{toPersianNum(depositInflationResult.monthlyGoldHedgeSavingMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(depositInflationResult.monthlyGoldHedgeSavingMillion, intlCurrency, locale)})` : ''}</strong> در صندوق طلای بورس پیشنهاد می‌شود.</div>
        </div>
      </div>
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
        <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
          <span>آربیتراژ رهن کامل در برابر سرمایه‌گذاری در صندوق طلا</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><label className="block text-slate-600 dark:text-slate-400 mb-1">تفاوت اجاره ماهانه (میلیون):</label><input type="number" min={1} max={200} value={arbMonthlyRentDiffMillion} onChange={(e) => setArbMonthlyRentDiffMillion(clampNumber(e.target.value, 1, 200, 15))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></div>
            <div><label className="block text-slate-600 dark:text-slate-400 mb-1">بازده سالانه صندوق (٪):</label><input type="number" min={10} max={80} value={arbFundYieldPercent} onChange={(e) => setArbFundYieldPercent(clampNumber(e.target.value, 10, 80, 34))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></div>
          </div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">نتیجه تحلیل مالی:</div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{rahnArbitrageResult.explanation}</p>
          <div className="text-xs font-black text-emerald-700 dark:text-emerald-400">مزیت سالانه: {toPersianNum(rahnArbitrageResult.annualAdvantageMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rahnArbitrageResult.annualAdvantageMillion, intlCurrency, locale)})` : ''}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">شرایط مسکن حمایتی و فرم (ج):</div>
          <ul className="text-[10px] text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
            <li>فرم (ج) سبز: عدم سابقه دریافت زمین یا تسهیلات دولتی مسکن از سال ۵۷.</li>
            <li>وام جوانی جمعیت: افزایش ۲۵ درصدی سقف وام و کاهش اقساط به ازای هر فرزند.</li>
            <li>مشوق‌های ۱۹گانه بافت فرسوده: ۲ طبقه تراکم تشویقی و معافیت عوارض شهرداری.</li>
          </ul>
        </div>
      </div>
    </div>
  ); }