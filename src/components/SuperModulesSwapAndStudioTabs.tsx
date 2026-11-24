import React, { useState, useMemo } from 'react'; import { ArrowLeftRight, Building2, CheckCircle2, ClipboardCheck, Compass, Copy, GraduationCap, Layers, Sparkles, Truck } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { CityId } from '../data/multiCityData'; import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator'; import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/security'; import { calculateChitgarCoopScore, calculateInterCityMigration, getNeighborhoodInfraData, calculateMovingCost } from '../data/superModulesLogic'; import { VISITED_APARTMENTS_STORAGE_KEY, type SuperModuleTabId } from './FutureSuperModulesModal'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { NumericDraftInput } from './ui/NumericDraftInput'; export interface SuperModulesSwapAndStudioTabsProps { activeTab: SuperModuleTabId; activeHood: EvaluatedNeighborhood; valSqm: number; valBedrooms: number; fairPerSqm: number; fairTotalMillion: number; fullRahnMillion: number; }
export function SuperModulesSwapAndStudioTabs(props: SuperModulesSwapAndStudioTabsProps): React.ReactElement | null { const { activeTab, activeHood, valSqm, valBedrooms, fairPerSqm, fairTotalMillion, fullRahnMillion } = props; const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const [coopPaidMillion, setCoopPaidMillion] = useState<number>(1800); const [coopPremiumMillion, setCoopPremiumMillion] = useState<number>(1150); const [coopPromiseSqmMillion, setCoopPromiseSqmMillion] = useState<number>(35); const [targetMigrationCity, setTargetMigrationCity] = useState<CityId>('shiraz'); const chitgarScoreResult = useMemo(() => { return calculateChitgarCoopScore({ baseInstallmentsPaidMillion: coopPaidMillion, transferRightFeeMillion: coopPremiumMillion, promisedRemainingCostPerSqmMillion: coopPromiseSqmMillion, unitSqm: valSqm, deliveryMonths: 28, benchmarkFinishedPricePerSqmMillion: activeHood.baseBuyPerSqm ?? activeHood.buyPerSqm, }); }, [coopPaidMillion, coopPremiumMillion, coopPromiseSqmMillion, valSqm, activeHood.baseBuyPerSqm, activeHood.buyPerSqm]); const interCityResult = useMemo(() => { return calculateInterCityMigration(activeHood.buyPerSqm, targetMigrationCity); }, [activeHood.buyPerSqm, targetMigrationCity]); const infraData = useMemo(() => { return getNeighborhoodInfraData(activeHood.name); }, [activeHood.name]);
  const [checklistChecks, setChecklistChecks] = useState<Record<string, boolean>>({ plumbingPressure: true, daylightSouth: true, elevatorSilence: true, parkingAccess: true, humidityCheck: true, deedVerification: true, stairwayWidth: true, sewageSmell: true, waterBoilerHealth: true, quietAlley: true, cctvSecurity: false, ftthFiberAvailable: false, }); const [visitSaveNotice, setVisitSaveNotice] = useState<string>(''); const checklistScore = useMemo(() => { const total = Object.keys(checklistChecks).length; const passed = Object.values(checklistChecks).filter(Boolean).length; return Math.round((passed / total) * 100); }, [checklistChecks]); const [moveTruckType, setMoveTruckType] = useState<'van' | 'khavar' | 'isuzu_large'>('khavar'); const [moveWorkers, setMoveWorkers] = useState<number>(4); const [moveHours, setMoveHours] = useState<number>(4);
  const [moveHeavyItems, setMoveHeavyItems] = useState<number>(2); const [moveHasElevator, setMoveHasElevator] = useState<boolean>(true); const movingCostResult = useMemo(() => { return calculateMovingCost({ truckType: moveTruckType, workerCount: moveWorkers, hours: moveHours, heavyItemsCount: moveHeavyItems, hasElevatorOrigin: moveHasElevator, hasElevatorDest: moveHasElevator, floorsCount: 3, }); }, [moveTruckType, moveWorkers, moveHours, moveHeavyItems, moveHasElevator]); const [aiAdTone, setAiAdTone] = useState<'vip' | 'bargain' | 'investor'>('vip');
  const [copiedAdNotice, setCopiedAdNotice] = useState<boolean>(false); const visitTimerRef = React.useRef<number | null>(null); const adCopyTimerRef = React.useRef<number | null>(null); React.useEffect(() => () => { if (visitTimerRef.current !== null) window.clearTimeout(visitTimerRef.current); if (adCopyTimerRef.current !== null) window.clearTimeout(adCopyTimerRef.current); }, []); const generatedAdText = useMemo(() => { const hName = activeHood.name; const totB = (fairTotalMillion / 1000).toFixed(2); const areaStr = formatAreaValue(valSqm, areaUnit, true); const intlTotStr = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(fairTotalMillion, intlCurrency, locale)})` : ''; if (aiAdTone === 'bargain') {
      return `🔥 شکار طلایی زیر قیمت در محله ${hName}\nواحد ${areaStr} ${toPersianNum(valBedrooms)} خوابه با نور مستقیم آفتاب\n${areaUnit === 'sqft' ? 'هر ft² فقط' : 'متری فقط'} ${toPersianNum(convertPricePerSqmToUnit(fairPerSqm, areaUnit))} میلیون (قیمت کل: ${toPersianNum(totB)} میلیارد${intlTotStr})\nپارکینگ سندی + آسانسور + انباری\nمالک منعطف با تخفیف پای قولنامه برای خریدار نقد.\nتماس مستقیم جهت هماهنگی بازدید اختصاصی`;
    } if (aiAdTone === 'investor') {
      return `📊 فرصت استثنایی سرمایه‌گذاری در مسکن ${hName}\nواحد ${areaStr} خوش‌نقشه بدون حتی یک سانت پرتی\nارزش کارشناسی روز: ${toPersianNum(totB)} میلیارد تومان${intlTotStr}\nپتانسیل رهن کامل تا ${toPersianNum(fullRahnMillion)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(fullRahnMillion, intlCurrency, locale)})` : ''}\nنسبت P/R ایده‌آل با نقدشوندگی سریع در بازار صعودی.`;
    }
    return `✨ معرفی فایل خاص و لوکس در تاپ لوکیشن ${hName}\nسازه‌ای مهندسی‌ساز با متریال برند وارداتی\nواحد ${areaStr} پلان تفکیکی با ۲ کله غرق در نور (ارزش کارشناسی: ${toPersianNum(totB)} میلیارد${intlTotStr})\nسالن پرده‌خور، آشپزخانه فول مدرن، مشاعات هتلی، لابی شیک و پارکینگ اختصاصی\nسند ششدانگ تک‌برگ آماده انتقال قطعی در دفتر اسناد رسمی.`;
  }, [activeHood.name, valSqm, areaUnit, valBedrooms, fairPerSqm, fairTotalMillion, fullRahnMillion, aiAdTone, intlCurrency, locale]); if (activeTab === 'swap_suburb') { return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4"> <div className="lg:col-span-6 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5"> <Building2 className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>محاسبه‌گر امتیاز تعاونی‌های مسکن منطقه ۲۲ چیتگر</span> </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]"> <div>
              <label className="text-slate-500 dark:text-slate-400">واریزی تا امروز (م)</label> <NumericDraftInput aria-label="واریزی تا امروز" min={100} max={20000} fallback={1800} value={coopPaidMillion} onValueChange={setCoopPaidMillion} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
            </div> <div>
              <label className="text-slate-500 dark:text-slate-400">حق امتیاز (م)</label> <NumericDraftInput aria-label="حق امتیاز تعاونی" min={100} max={20000} fallback={1150} value={coopPremiumMillion} onValueChange={setCoopPremiumMillion} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
            </div> <div>
              <label className="text-slate-500 dark:text-slate-400">برآورد ساخت ({areaUnit === 'sqft' ? `${toPersianNum(convertPricePerSqmToUnit(coopPromiseSqmMillion, areaUnit))} م/ft²` : `${toPersianNum(coopPromiseSqmMillion)} م/m²`})</label> <NumericDraftInput aria-label="برآورد ساخت تعاونی" min={15} max={100} fallback={35} value={coopPromiseSqmMillion} onValueChange={setCoopPromiseSqmMillion} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
            </div> </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5 text-[11px]"> <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">نقدینگی لازم امروز:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{toPersianNum(chitgarScoreResult.cashNeededTodayMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(chitgarScoreResult.cashNeededTodayMillion, intlCurrency, locale)})` : ''}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">قیمت تمام‌شده تخمینی با ضرایب تعدیل:</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(chitgarScoreResult.estimatedFinishedPricePerSqmMillion, areaUnit))} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(chitgarScoreResult.estimatedFinishedPricePerSqmMillion, areaUnit), intlCurrency, locale)})` : ''} · کل {formatAreaValue(valSqm, areaUnit, true)}: {toPersianNum(((chitgarScoreResult.estimatedFinishedPricePerSqmMillion * valSqm) / 1000).toFixed(2))} میلیارد</span>
            </div>
            <div className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg leading-relaxed mt-1">
              ⚠️ {chitgarScoreResult.riskNotice} </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">چک‌لیست ضدتخریب خرید ویلا در شمال:</div>
            <ul className="text-[10px] text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
              <li>استعلام جهاد کشاورزی (عدم قرارگیری در حریم اراضی زراعی ماده ۱).</li>
              <li>پروانه ساخت معتبر از بخشداری یا دهیاری و نصب کنتور دائمی ۳ گانه.</li>
              <li>پرهیز از خرید ویلا با سند مشاعی تفکیک‌نشده در بافت جنگل‌جلگه‌ای.</li>
            </ul>
          </div>
        </div>
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>سود مهاجرت مالی بین کلان‌شهرها</span>
            </span>
            <select aria-label="شهر مقصد مهاجرت" value={targetMigrationCity} onChange={(e) => setTargetMigrationCity(e.target.value as CityId)} className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 text-xs">
              <option value="shiraz">شیراز</option><option value="isfahan">اصفهان</option>
              <option value="mashhad">مشهد</option><option value="karaj">کرج</option>
            </select>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] text-emerald-900 dark:text-emerald-200 font-bold">معادله تبدیل ملک {activeHood.name} (سناریو مذاکره: {toPersianNum(convertPricePerSqmToUnit(aggregateMarketMetricsForHood(activeHood).estimatedDealPricePerSqm, areaUnit))} م) به شهر {interCityResult.targetCityNameFa}:</div>
            <p className="text-xs text-emerald-950 dark:text-emerald-300 leading-relaxed font-semibold">{interCityResult.lifestyleVerdict}</p>
            <div className="grid grid-cols-2 gap-2 text-center text-[10px] pt-1">
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="text-slate-500 dark:text-slate-400">متراژ قابل خرید:</div>
                <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">{formatAreaValue(interCityResult.targetCityAffordableSqm, areaUnit, true)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="text-slate-500 dark:text-slate-400">پس‌انداز نقد مازاد:</div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{toPersianNum(interCityResult.remainingCashBufferMillion)} میلیون{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(interCityResult.remainingCashBufferMillion, intlCurrency, locale)})` : ''}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ); }
  if (activeTab === 'visit_checklist') { return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>چک‌لیست ۱۲گانه بازدید حضوری آپارتمان</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--color-brand-600)] text-white font-bold text-xs tabular-nums">
              امتیاز: {toPersianNum(checklistScore)} / ۱۰۰
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: 'plumbingPressure', label: 'فشار آب در طبقات بالا و کارکرد پمپ' }, { key: 'daylightSouth', label: 'نورگیر مستقیم آفتاب بدون اشراف ساختمان مقابل' }, { key: 'elevatorSilence', label: 'بی‌صدا بودن موتورخانه آسانسور در اتاق‌ها' }, { key: 'parkingAccess', label: 'دسترسی آسان پارکینگ بدون مزاحمت ستون' }, { key: 'humidityCheck', label: 'عدم نم‌زدگی در سقف سرویس‌ها و زیر پنجره' }, { key: 'deedVerification', label: 'تطابق متراژ و پلاک ثبتی با سند تک‌برگ' }, { key: 'stairwayWidth', label: 'عرض راه‌پله استاندارد برای اسباب‌کشی' }, { key: 'sewageSmell', label: 'عدم وجود بوی نامطبوع فاضلاب در راهروها' },
              { key: 'waterBoilerHealth', label: 'سالم بودن پکیج/رادیاتور بدون نشتی' }, { key: 'quietAlley', label: 'کوچه دنج و عدم همجواری با مدرسه/تعمیرگاه' }, { key: 'cctvSecurity', label: 'مجهز به دوربین مداربسته و درب ضدسرقت' }, { key: 'ftthFiberAvailable', label: 'پوشش فعال فیبر نوری اینترنت در ساختمان' },
            ].map((item) => (
              <button
                key={item.key} type="button"
                onClick={() => setChecklistChecks((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 cursor-pointer transition text-right ${
                  checklistChecks[item.key] ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${checklistChecks[item.key] ? 'text-[var(--color-brand-600)] dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`} />
                <span className="leading-tight">{item.label}</span>
              </button> ))}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600 dark:text-slate-400">ذخیره بازدید ({formatAreaValue(valSqm, areaUnit, true)} · {toPersianNum((fairTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(fairTotalMillion, intlCurrency, locale)}` : ''}):</span>
            <button
              type="button"
              onClick={() => { const existing = safeLocalStorageGet<unknown[]>(VISITED_APARTMENTS_STORAGE_KEY, []); const entry = {
                  id: `visit-${Date.now()}`,
                  hoodId: activeHood.id, hoodName: activeHood.name,
                  address: `واحد ${formatAreaValue(valSqm, areaUnit, true)} (چک‌لیست ۱۲گانه: ${toPersianNum(checklistScore)}/۱۰۰)`,
                  askingPriceMillion: fairTotalMillion,
                  notes: `امتیاز فنی چک‌لیست بازدید: ${toPersianNum(checklistScore)} از ۱۰۰`,
                  date: new Date().toLocaleDateString('fa-IR'), rating: Math.max(1, Math.min(10, Math.round(checklistScore / 10))), };
                safeLocalStorageSet(VISITED_APARTMENTS_STORAGE_KEY, [entry, ...(Array.isArray(existing) ? existing : [])]); if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('radar-visited-updated')); }
                setVisitSaveNotice('بازدید با موفقیت در دفترچه بازدیدهای شما ثبت شد.');
                if (visitTimerRef.current !== null) window.clearTimeout(visitTimerRef.current);
                visitTimerRef.current = window.setTimeout(() => { visitTimerRef.current = null; setVisitSaveNotice(''); }, 2500);
              }}
              className="px-3 py-1.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer transition"
            >
              + ثبت در دفترچه بازدیدها
            </button>
          </div>
          {visitSaveNotice && (
            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5">
              {visitSaveNotice}
            </div>
          )}
        </div>
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <Compass className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>کیفیت آب شرب، نویز و قنات‌های محله {activeHood.name}</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 text-[11px]">
            <div>
              <span className="text-slate-500 dark:text-slate-400 font-bold">سختی آب شرب (TDS):</span>
              <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {infraData.waterTdsPpm !== null
                  ? `${toPersianNum(infraData.waterTdsPpm)} PPM (${infraData.waterSource})`
                  : infraData.waterSource}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 font-bold">سطح نویز محیطی:</span>
              <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {infraData.noiseLevelDb !== null
                  ? `${toPersianNum(infraData.noiseLevelDb)} دسی‌بل (${infraData.noiseSource})`
                  : infraData.noiseSource}
              </div>
            </div>
            {infraData.hasMehrabadFlightPath && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-[10px]">
                ✈️ این محله در مجاورت کریدور پرواز فرودگاه مهرآباد قرار دارد؛ نصب پنجره دوجداره UPVC الزامی است.
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300">
              💧 وضعیت قنات‌ها و بستر خاک: {infraData.qanatAlert}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (activeTab === 'school_traffic') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>رادار مدارس برتر، سمپاد و آموزش در محله {activeHood.name}</span>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">شاخص دسترسی آموزشی:</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm tabular-nums">
                {toPersianNum(Math.min(9.9, Math.max(6.2, Math.round(((activeHood.overallScore * 0.55) + (activeHood.security * 0.25) + (activeHood.metro * 0.2)) * 10) / 10)))} / ۱۰
              </span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
              محدوده جغرافیایی ثبت‌نام مدارس دولتی شاخص، مدارس استعدادهای درخشان و غیردولتی معتبر در شعاع کمتر از {areaUnit === 'sqft' ? '۱.۵ کیلومتر (۴,۹۲۰ فوت)' : '۱.۵ کیلومتر'}{areaUnit === 'sqft' ? ' / ۰.۹۳ مایل' : ''} از مرکز محله.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">عوارض طرح ترافیک و تخفیف ۵۰٪ ساکنین:</div>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
              ساکنان این محدوده با ثبت پلاک در تهران من از یک خروج رایگان صبحگاهی (قبل از ۸:۳۰) و ورود عصرگاهی (بعد از ۱۶:۰۰) به همراه ۵۰٪ تخفیف عوارض روزانه بهره‌مند هستند.
            </p>
          </div>
        </div>
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
            <Layers className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>خطوط مترو آینده و ایمنی گسل زلزله</span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] font-bold text-emerald-950 dark:text-emerald-200">پروژه‌های ریلی در دست ساخت:</div>
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">{infraData.futureMetroLines}</div>
            <div className="text-[10px] text-emerald-800 dark:text-emerald-400">
              پاداش رشد قیمتی پیش‌بینی‌شده با افتتاح ایستگاه:{' '}
              <strong>
                {infraData.futureMetroStationBonusPercent !== null
                  ? `+${toPersianNum(infraData.futureMetroStationBonusPercent)}٪`
                  : 'نیازمند استعلام طرح مصوب'}
              </strong>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">ایمنی سازه‌ای و خطر فرونشست زمین:</div>
            <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
              سطح خطر فرونشست زمین در این پهنه:{' '}
              <strong>
                {infraData.subsidenceRisk === 'LOW'
                  ? 'بسیار کم و ایمن'
                  : infraData.subsidenceRisk === 'MEDIUM'
                  ? 'متوسط'
                  : 'نیازمند استعلام ژئوتکنیک'} </strong>
              <br />
              پیشنهاد می‌شود قبل از شروع گودبرداری ملک همسایه، صورت‌جلسه تامین دلیل با سامانه ۱۳۷ شهرداری تنظیم شود.
            </div>
          </div>
        </div>
      </div>
    ); } return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-6 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>استودیو هوشمند آگهی‌نویسی املاک</span>
          </span>
          <div className="flex items-center gap-1 text-[10px]">
            {[
              { id: 'vip' as const, label: 'VIP لوکس' }, { id: 'bargain' as const, label: 'شکار قیمتی' }, { id: 'investor' as const, label: 'سرمایه‌گذاری' }, ].map((t) => ( <button
                key={t.id} type="button" onClick={() => setAiAdTone(t.id)}
                className={`px-2 py-0.5 rounded-md font-bold cursor-pointer transition ${
                  aiAdTone === t.id ? 'bg-slate-900 dark:bg-[var(--color-brand-600)] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {t.label} </button>
            ))} </div>
        </div>
        <pre className="text-[11px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
          {generatedAdText} </pre>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(generatedAdText).catch(() => {}); setCopiedAdNotice(true); if (adCopyTimerRef.current !== null) window.clearTimeout(adCopyTimerRef.current); adCopyTimerRef.current = window.setTimeout(() => { adCopyTimerRef.current = null; setCopiedAdNotice(false); }, 2000); }} className="w-full py-2 rounded-xl bg-slate-900 dark:bg-[var(--color-brand-600)] hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer transition text-xs"
        >
          <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
          <span>{copiedAdNotice ? 'متن آگهی کپی شد!' : 'کپی متن آگهی آماده انتشار در دیوار / شیپور / اینستاگرام'}</span>
        </button>
      </div>
      <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5">
        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
          <Truck className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>ماشین‌حساب اسباب‌کشی و ثبت در سامانه املاک و اسکان</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div>
            <label className="text-slate-500 dark:text-slate-400">نوع خودرو باربری</label>
            <select aria-label="نوع خودرو باربری" value={moveTruckType} onChange={(e) => setMoveTruckType(e.target.value as 'van' | 'khavar' | 'isuzu_large')} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              <option value="khavar">خاور مسقف VIP</option>
              <option value="van">وانت نیسان</option>
              <option value="isuzu_large">ایسوزو ۶ متری{areaUnit === 'sqft' ? ' (۲۰ فوت)' : ''}</option>
            </select>
          </div>
          <div>
            <label className="text-slate-500 dark:text-slate-400">تعداد کارگران</label>
            <NumericDraftInput aria-label="تعداد کارگران" min={2} max={8} fallback={4} value={moveWorkers} onValueChange={setMoveWorkers} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
          </div>
          <div>
            <label className="text-slate-500 dark:text-slate-400">مدت زمان (ساعت)</label>
            <NumericDraftInput aria-label="مدت زمان اسباب‌کشی" min={3} max={10} fallback={4} value={moveHours} onValueChange={setMoveHours} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
          </div>
          <div>
            <label className="text-slate-500 dark:text-slate-400">اقلام سنگین (ساید/گاوصندوق)</label>
            <NumericDraftInput aria-label="تعداد اقلام سنگین" min={0} max={10} fallback={2} value={moveHeavyItems} onValueChange={setMoveHeavyItems} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-900 dark:text-slate-100 mt-0.5" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={!moveHasElevator} onChange={(e) => setMoveHasElevator(!e.target.checked)} aria-label="حمل از پله بدون آسانسور باربر" className="rounded text-[var(--color-brand-600)]" />
          <span>حمل از پله (بدون آسانسور باربر)</span>
        </label>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3 flex items-center justify-between text-xs">
          <span className="font-bold text-emerald-900 dark:text-emerald-200">هزینه کل برآورد اسباب‌کشی:</span>
          <span className="font-bold text-emerald-950 dark:text-emerald-300 text-sm tabular-nums">
            {toPersianNum(movingCostResult.totalMovingCostThousand.toLocaleString())} هزار تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(movingCostResult.totalMovingCostThousand / 1000, intlCurrency, locale)})` : ''}
          </span>
        </div>
        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 text-[10px]">الزامات قانونی ثبت در سامانه ملی املاک و اسکان (amlak.mrud.ir):</div>
          <ul className="text-[10px] text-slate-600 dark:text-slate-300 space-y-1">
            {movingCostResult.housingRegistryChecklist.map((item, idx) => ( <li key={idx} className="leading-relaxed">{item}</li>
            ))} </ul>
        </div>
      </div>
    </div>
  ); }