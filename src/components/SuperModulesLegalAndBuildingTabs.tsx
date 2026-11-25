import React, { useState, useMemo, useEffect } from 'react'; import { Building2, Copy, FileCheck, FileText, Hammer, Scale, Zap } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator'; import { CityId } from '../data/multiCityData'; import { calculatePropertyTaxes, calculateInheritanceShares, generateBuildingChargeBill, SANA_LEGAL_NOTICES, calculateLobbyUpgradeRoi, ARTICLE_55_OFFICE_PERMITTED_JOBS } from '../data/superModulesLogic'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { NumericDraftInput } from './ui/NumericDraftInput'; export interface SuperModulesLegalAndBuildingTabsProps { activeTab: SuperModuleTabId; activeHood: EvaluatedNeighborhood; activeCity: CityId; valSqm: number; fairTotalMillion: number; } export function SuperModulesLegalAndBuildingTabs( props: SuperModulesLegalAndBuildingTabsProps ): React.ReactElement | null { const { activeTab, activeHood, activeCity, valSqm, fairTotalMillion } = props; const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const [taxRentMillion, setTaxRentMillion] = useState<number>(25); const [taxRahnMillion, setTaxRahnMillion] = useState<number>(600); const [taxSqm, setTaxSqm] = useState<number>(165); const [taxVacantMonths, setTaxVacantMonths] = useState<number>(0); const [taxRahnEquivalentAnnualMillion, setTaxRahnEquivalentAnnualMillion] = useState<number | null>(null); const [taxQualifiesForAreaExemption, setTaxQualifiesForAreaExemption] = useState<boolean>(false); const [taxQualifiesForAnnualIncomeExemption, setTaxQualifiesForAnnualIncomeExemption] = useState<boolean>(false); const [taxVacantYear, setTaxVacantYear] = useState<1 | 2 | 3>(1); const [heirSons, setHeirSons] = useState<number>(2); const [heirDaughters, setHeirDaughters] = useState<number>(1); const [heirHasSpouse, setHeirHasSpouse] = useState<boolean>(true); const [heirSpouseType, setHeirSpouseType] = useState<'wife' | 'husband'>('wife'); const [heirHasMother, setHeirHasMother] = useState<boolean>(false); const [heirHasFather, setHeirHasFather] = useState<boolean>(false); const [inheritanceOfficialTaxBaseMillion, setInheritanceOfficialTaxBaseMillion] = useState<number | null>(null); const [inheritanceHeirClass, setInheritanceHeirClass] = useState<1 | 2 | 3>(1);
  const [inheritanceDeathAfter1395, setInheritanceDeathAfter1395] = useState<boolean>(false); const propertyTaxResult = useMemo(() => calculatePropertyTaxes({ monthlyRentMillion: taxRentMillion, rahnMillion: taxRahnMillion, sqm: taxSqm, city: activeCity, vacantMonths: taxVacantMonths, vacantYear: taxVacantYear, officialTaxableRentalBaseMillion: taxRahnEquivalentAnnualMillion ?? undefined, qualifiesForAreaExemption: taxQualifiesForAreaExemption, qualifiesForAnnualIncomeExemption: taxQualifiesForAnnualIncomeExemption, }), [taxRentMillion, taxRahnMillion, taxSqm, activeCity, taxVacantMonths, taxVacantYear, taxRahnEquivalentAnnualMillion, taxQualifiesForAreaExemption, taxQualifiesForAnnualIncomeExemption]); const inheritanceResult = useMemo(() => calculateInheritanceShares({ propertyTotalValueMillion: fairTotalMillion, hasSpouse: heirHasSpouse, spouseType: heirSpouseType, sonsCount: heirSons, daughtersCount: heirDaughters, hasMother: heirHasMother, hasFather: heirHasFather, officialTaxableEstateValueMillion: inheritanceOfficialTaxBaseMillion ?? undefined,
    estateTaxRatePercent: inheritanceHeirClass === 1 ? 7.5 : inheritanceHeirClass === 2 ? 15 : 30, deathAfter1395: inheritanceDeathAfter1395, }), [fairTotalMillion, heirHasSpouse, heirSpouseType, heirSons, heirDaughters, heirHasMother, heirHasFather, inheritanceOfficialTaxBaseMillion, inheritanceHeirClass, inheritanceDeathAfter1395]);
  const [bldgCustomName, setBldgCustomName] = useState<string>(`ساختمان یاس ${activeHood.name}`);
  const [bldgMonthName, setBldgMonthName] = useState<string>(() => { try { return new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()); } catch { return 'آبان ۱۴۰۵'; } });
  useEffect(() => { setBldgCustomName(`ساختمان یاس ${activeHood.name}`); }, [activeHood.name]);
  const [bldgUnitsCount, setBldgUnitsCount] = useState<number>(12); const [bldgUnitNumber, setBldgUnitNumber] = useState<number>(5); const [bldgOccupants, setBldgOccupants] = useState<number>(3); const [bldgCleaningCost, setBldgCleaningCost] = useState<number>(3500); const [bldgElevatorCost, setBldgElevatorCost] = useState<number>(2800); const [bldgWaterCost, setBldgWaterCost] = useState<number>(4200); const [bldgReserveFund, setBldgReserveFund] = useState<number>(2500); const [copiedBillNotice, setCopiedBillNotice] = useState<boolean>(false); const [activeSanaTemplate, setActiveSanaTemplate] = useState<'deposit' | 'evac' | 'receipt'>('deposit'); const [sanaCopiedNotice, setSanaCopiedNotice] = useState<boolean>(false); const billCopyTimerRef = React.useRef<number | null>(null); const sanaCopyTimerRef = React.useRef<number | null>(null); useEffect(() => () => { if (billCopyTimerRef.current !== null) window.clearTimeout(billCopyTimerRef.current); if (sanaCopyTimerRef.current !== null) window.clearTimeout(sanaCopyTimerRef.current); }, []); const [sanaTenantName, setSanaTenantName] = useState<string>('علیرضا محمدی'); const [sanaLandlordName, setSanaLandlordName] = useState<string>('حسین احمدی'); const [sanaExpireDate, setSanaExpireDate] = useState<string>('۱۴۰۵/۰۸/۳۰'); const buildingBillResult = useMemo(() => generateBuildingChargeBill({
    buildingName: bldgCustomName.trim() || `یاس محله ${activeHood.name}`,
    monthName: bldgMonthName.trim() || 'جاری', totalCleaningThousand: bldgCleaningCost, totalElevatorServiceThousand: bldgElevatorCost, totalSharedWaterPowerThousand: bldgWaterCost, totalReserveFundThousand: bldgReserveFund, totalUnits: bldgUnitsCount, unitNumber: bldgUnitNumber, unitOccupants: bldgOccupants, totalBuildingOccupants: Math.max(bldgOccupants, bldgUnitsCount * 3), unitSqm: valSqm, totalBuildingSqm: valSqm * bldgUnitsCount, }), [bldgCustomName, bldgMonthName, activeHood.name, bldgCleaningCost, bldgElevatorCost, bldgWaterCost, bldgReserveFund, bldgUnitsCount, bldgUnitNumber, bldgOccupants, valSqm]);
  const [lobbyUnits, setLobbyUnits] = useState<number>(10); const [lobbyBudgetMillion, setLobbyBudgetMillion] = useState<number>(650); const lobbyRoiResult = useMemo(() => calculateLobbyUpgradeRoi({ totalBuildingUnits: lobbyUnits, currentUnitAvgPriceBillion: fairTotalMillion / 1000, renovationBudgetMillion: lobbyBudgetMillion, }), [lobbyUnits, fairTotalMillion, lobbyBudgetMillion]);
  if (activeTab === 'tax_inheritance') { return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4"> <div className="lg:col-span-6 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center gap-1.5"> <Scale className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>ماشین‌حساب مالیات اجاره، خانه‌های خالی و عایدی مسکن</span> </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"> <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">متراژ واحد ({formatAreaValue(taxSqm, areaUnit, true)})</label><NumericDraftInput aria-label="متراژ واحد جهت محاسبه مالیات" min={30} max={600} fallback={165} value={taxSqm} onValueChange={setTaxSqm} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]" /></div>
            <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">اجاره ماهانه (م){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(taxRentMillion, intlCurrency, locale)}` : ''}</label><NumericDraftInput aria-label="اجاره ماهانه" min={0} max={500} fallback={25} value={taxRentMillion} onValueChange={setTaxRentMillion} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]" /></div> <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">ودیعه (اجاره: {toPersianNum(Math.round(taxRahnMillion * 0.03))} م/ماه){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(taxRahnMillion, intlCurrency, locale)}` : ''}</label><NumericDraftInput aria-label="مبلغ ودیعه" min={0} max={50000} fallback={600} value={taxRahnMillion} onValueChange={setTaxRahnMillion} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]" /></div>
            <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">ماه‌های خالی ملک</label><NumericDraftInput aria-label="ماه‌های خالی ملک" min={0} max={12} fallback={0} value={taxVacantMonths} onValueChange={setTaxVacantMonths} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]" /></div> </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">معادل اجارهٔ سالانهٔ ودیعه (میلیون تومان)</label><NumericDraftInput aria-label="معادل اجاره سالانه ودیعه" min={0} max={100000} fallback={0} nullable placeholder="اختیاری" value={taxRahnEquivalentAnnualMillion} onValueChange={(v) => setTaxRahnEquivalentAnnualMillion(v)} onNullableValueChange={setTaxRahnEquivalentAnnualMillion} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]" /></div>
            <div><label className="block text-[10px] text-slate-600 dark:text-[var(--color-text-muted)] mb-1">سال شمول مالیات خانهٔ خالی</label><select aria-label="سال شمول مالیات خانه خالی" value={taxVacantYear} onChange={(e) => setTaxVacantYear(Number(e.target.value) as 1 | 2 | 3)} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]"><option value={1}>سال اول</option><option value={2}>سال دوم</option><option value={3}>سال سوم به بعد</option></select></div>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-700 dark:text-[var(--color-text-secondary)]">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={taxQualifiesForAreaExemption} onChange={(e) => setTaxQualifiesForAreaExemption(e.target.checked)} aria-label="بررسی مستقل شرایط معافیت متراژی مالیات اجاره" /><span>شرایط معافیت متراژی را مستقلاً بررسی کرده‌ام</span></label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={taxQualifiesForAnnualIncomeExemption} onChange={(e) => setTaxQualifiesForAnnualIncomeExemption(e.target.checked)} aria-label="بررسی شرایط معافیت سالانه درآمد اجاره" /><span>شرایط معافیت سالانهٔ درآمد را دارم</span></label>
          </div>
          <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">مالیات سالانه بر درآمد اجاره:</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 text-sm tabular-nums">
                {propertyTaxResult.annualRentalTaxMillion === null ? 'اطلاعات ناکافی برای محاسبه' : propertyTaxResult.isAreaExempt ? 'معاف طبق شرایط واردشده' : `${toPersianNum(propertyTaxResult.annualRentalTaxMillion)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(propertyTaxResult.annualRentalTaxMillion, intlCurrency, locale)})` : ''}`}
              </span>
            </div>
            {propertyTaxResult.vacantHomeTaxAnnualMillion !== null && propertyTaxResult.vacantHomeTaxAnnualMillion > 0 && (
              <div className="flex items-center justify-between text-[11px] text-rose-700 dark:text-rose-400 pt-1 border-t border-slate-100 dark:border-[var(--color-border-subtle)]">
                <span>برآورد مالیات خانهٔ خالی:</span>
                <span className="font-bold">{toPersianNum(propertyTaxResult.vacantHomeTaxAnnualMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(propertyTaxResult.vacantHomeTaxAnnualMillion, intlCurrency, locale)})` : ''}</span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] leading-relaxed">{propertyTaxResult.explanation}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl p-3 space-y-1">
            <div className="font-bold text-amber-900 dark:text-amber-200 text-[11px]">قانون مستثنیات دین در توقیف مسکن و مهریه:</div>
            <p className="text-[10px] text-amber-900 dark:text-amber-300 leading-relaxed">طبق ماده ۲۴ قانون نحوه اجرای محکومیت‌های مالی، منزل مسکونی در شأن بدهکار جزو مستثنیات دین بوده و بابت مهریه یا بدهی قابل توقیف و مزایده نیست. جهت امنیت موروثی مادام‌العمر، قرارداد رسمی <strong>صلح عُمری با حق فسخ</strong> توصیه می‌شود.</p>
          </div>
        </div>
        <div className="lg:col-span-6 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center gap-1.5">
            <Scale className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>تقسیم شرعی سهم‌الارث ملک ({formatAreaValue(valSqm, areaUnit, true)} · {toPersianNum((fairTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(fairTotalMillion, intlCurrency, locale)}` : ''} · {areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(Math.round(fairTotalMillion / Math.max(1, valSqm)), areaUnit))} م · معامله محله: {toPersianNum(convertPricePerSqmToUnit(aggregateMarketMetricsForHood(activeHood).estimatedDealPricePerSqm, areaUnit))} م)</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-slate-500 dark:text-[var(--color-text-muted)]">تعداد پسران:</span><NumericDraftInput aria-label="تعداد پسران" min={0} max={10} fallback={2} value={heirSons} onValueChange={setHeirSons} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><span className="text-slate-500 dark:text-[var(--color-text-muted)]">تعداد دختران:</span><NumericDraftInput aria-label="تعداد دختران" min={0} max={10} fallback={1} value={heirDaughters} onValueChange={setHeirDaughters} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><span className="text-slate-500 dark:text-[var(--color-text-muted)]">همسر در قید حیات:</span><select aria-label="همسر در قید حیات" value={heirHasSpouse ? 'yes' : 'no'} onChange={(e) => setHeirHasSpouse(e.target.value === 'yes')} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5"><option value="yes">بله</option><option value="no">خیر</option></select></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-700 dark:text-[var(--color-text-secondary)]">
            <div><span className="text-slate-500 dark:text-[var(--color-text-muted)]">نوع همسر:</span><select aria-label="نوع همسر" value={heirSpouseType} onChange={(e) => setHeirSpouseType(e.target.value as 'wife' | 'husband')} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5"><option value="wife">زوجه (زن)</option><option value="husband">زوج (مرد)</option></select></div>
            <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold mt-4 cursor-pointer"><input type="checkbox" checked={heirHasFather} onChange={(e) => setHeirHasFather(e.target.checked)} aria-label="پدر در قید حیات در تقسیم ارث" /><span>پدر در قید حیات</span></label>
            <label className="flex items-center gap-1.5 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold mt-4 cursor-pointer"><input type="checkbox" checked={heirHasMother} onChange={(e) => setHeirHasMother(e.target.checked)} aria-label="مادر در قید حیات در تقسیم ارث" /><span>مادر در قید حیات</span></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
            <div>
              <label className="block text-slate-600 dark:text-[var(--color-text-muted)] mb-1">ارزش معاملاتی رسمی ملک (م)</label>
              <NumericDraftInput
                aria-label="ارزش معاملاتی رسمی ملک" min={0} max={100000000} fallback={0} nullable value={inheritanceOfficialTaxBaseMillion}
                onValueChange={(v) => setInheritanceOfficialTaxBaseMillion(v)}
                onNullableValueChange={setInheritanceOfficialTaxBaseMillion}
                className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-[var(--color-text-muted)] mb-1">طبقهٔ وراث برای مالیات</label>
              <select
                aria-label="طبقه وراث برای مالیات" value={inheritanceHeirClass}
                onChange={(e) => setInheritanceHeirClass(Number(e.target.value) as 1 | 2 | 3)}
                className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)]"
              >
                <option value={1}>طبقهٔ اول</option><option value={2}>طبقهٔ دوم</option><option value={3}>طبقهٔ سوم</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 mt-4 cursor-pointer font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={inheritanceDeathAfter1395} onChange={(e) => setInheritanceDeathAfter1395(e.target.checked)} aria-label="فوت مشمول رژیم مالیاتی پس از ۱۳۹۵" />
              <span>فوت مشمول رژیم پس از ۱۳۹۵</span>
            </label>
          </div>
          <div className="space-y-1.5">
            {inheritanceResult.shares.map((share, idx) => ( <div key={idx} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-2.5 flex items-center justify-between text-[11px]">
                <div>
                  <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)]">{share.relation} ({share.fractionText})</div>
                  <div className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)]">{toPersianNum(share.sharePercent)}٪ از کل ارزش ملک</div>
                </div>
                <div className="text-left font-bold text-emerald-800 dark:text-emerald-400 tabular-nums">
                  {toPersianNum((share.totalValueMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(share.totalValueMillion, intlCurrency, locale)})` : ''}
                  {share.count > 1 && <div className="text-[9px] font-normal text-slate-500 dark:text-[var(--color-text-muted)]">نفری: {toPersianNum((share.perPersonValueMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(share.perPersonValueMillion, intlCurrency, locale)})` : ''}</div>}
                </div>
              </div> ))}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] text-center">
            برآورد مالیات ملک:{' '}
            {inheritanceResult.estateTaxEstimateMillion === null
              ? 'نیازمند ارزش معاملاتی رسمی، طبقهٔ وراث و احراز رژیم قانونی'
              : `حدود ${toPersianNum(inheritanceResult.estateTaxEstimateMillion)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(inheritanceResult.estateTaxEstimateMillion, intlCurrency, locale)})` : ''}`}
          </div>
        </div>
      </div>
    ); }
  if (activeTab === 'tenant_rights') { return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>حسابدار هوشمند مدیر ساختمان و صدور صورتحساب</span>
            </span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">واحد {formatAreaValue(valSqm, areaUnit, true)} از کل {formatAreaValue(valSqm * bldgUnitsCount, areaUnit, true)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <label className="text-slate-500 dark:text-[var(--color-text-muted)]">نام مجتمع / ساختمان</label>
              <input type="text" aria-label="نام مجتمع یا ساختمان" value={bldgCustomName} onChange={(e) => setBldgCustomName(e.target.value)} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" />
            </div>
            <div>
              <label className="text-slate-500 dark:text-[var(--color-text-muted)]">ماه صورتحساب</label>
              <input type="text" aria-label="ماه صورتحساب" value={bldgMonthName} onChange={(e) => setBldgMonthName(e.target.value)} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">کل واحدها</label><NumericDraftInput aria-label="کل واحدهای ساختمان" min={2} max={100} fallback={12} value={bldgUnitsCount} onValueChange={setBldgUnitsCount} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">شماره واحد</label><NumericDraftInput aria-label="شماره واحد" min={1} max={100} fallback={5} value={bldgUnitNumber} onValueChange={setBldgUnitNumber} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">تعداد نفرات واحد</label><NumericDraftInput aria-label="تعداد نفرات واحد" min={1} max={15} fallback={3} value={bldgOccupants} onValueChange={setBldgOccupants} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">هزینه نظافت (هزار تومان)</label><NumericDraftInput aria-label="هزینه نظافت" min={500} max={20000} fallback={3500} value={bldgCleaningCost} onValueChange={setBldgCleaningCost} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">سرویس آسانسور (هزار تومان)</label><NumericDraftInput aria-label="هزینه سرویس آسانسور" min={500} max={20000} fallback={2800} value={bldgElevatorCost} onValueChange={setBldgElevatorCost} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">آب و گاز مشترک (هزار تومان)</label><NumericDraftInput aria-label="هزینه آب و گاز مشترک" min={500} max={50000} fallback={4200} value={bldgWaterCost} onValueChange={setBldgWaterCost} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">اندوخته عمرانی (هزار تومان)</label><NumericDraftInput aria-label="اندوخته عمرانی" min={500} max={50000} fallback={2500} value={bldgReserveFund} onValueChange={setBldgReserveFund} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
          </div>
          {!buildingBillResult.isValid ? (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-[11px] text-rose-800 dark:text-rose-300 font-bold">
              {buildingBillResult.validationError}
            </div>
          ) : (
            <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
                  مبلغ شارژ واحد {toPersianNum(bldgUnitNumber)} ({toPersianNum(bldgOccupants)} نفره):
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm tabular-nums">
                  {toPersianNum((buildingBillResult.unitTotalBillThousand * 1000).toLocaleString('en-US'))} تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(buildingBillResult.unitTotalBillThousand / 1000, intlCurrency, locale)})` : ''}
                </span>
              </div>
              <pre className="text-[10px] text-slate-600 dark:text-[var(--color-text-secondary)] bg-slate-50 dark:bg-[var(--color-bg-muted)] p-2.5 rounded-lg whitespace-pre-wrap font-sans leading-relaxed border border-slate-200 dark:border-[var(--color-border-strong)]">{buildingBillResult.whatsappMessageText}</pre>
              <button
                type="button"
                onClick={() => { const billText = intlCurrency !== 'IRT' ? `${buildingBillResult.whatsappMessageText}\n🌐 معادل ارزی سهم واحد: ${formatMillionTomanAsIntlCurrency(buildingBillResult.unitTotalBillThousand / 1000, intlCurrency, locale)}` : buildingBillResult.whatsappMessageText; navigator.clipboard?.writeText(billText).catch(() => {}); setCopiedBillNotice(true); if (billCopyTimerRef.current !== null) window.clearTimeout(billCopyTimerRef.current); billCopyTimerRef.current = window.setTimeout(() => { billCopyTimerRef.current = null; setCopiedBillNotice(false); }, 2000); }}
                className="w-full py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{copiedBillNotice ? 'متن صورتحساب کپی شد!' : 'کپی متن صورتحساب برای گروه واتساپ/تلگرام'}</span>
              </button>
            </div> )}
        </div>
        <div className="lg:col-span-6 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center gap-1.5">
            <FileText className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>پیش‌نویس‌های متنی استرداد ودیعه، تخلیه و تحویل کلید</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'deposit' as const, label: 'مطالبه ودیعه مسکن' }, { id: 'evac' as const, label: 'تعیین تکلیف تخلیه' }, { id: 'receipt' as const, label: 'صورتجلسه تحویل کلید' }, ].map((item) => (
              <button
                key={item.id} type="button" onClick={() => setActiveSanaTemplate(item.id)}
                className={`py-1.5 px-2 rounded-lg font-bold text-[10px] truncate cursor-pointer transition ${
                  activeSanaTemplate === item.id ? 'bg-slate-900 dark:bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-[var(--color-bg-muted)] text-slate-600 dark:text-[var(--color-text-secondary)]'
                }`}
              >
                {item.label}
              </button>
            ))} </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">نام مستأجر</label><input type="text" aria-label="نام مستأجر" value={sanaTenantName} onChange={(e) => setSanaTenantName(e.target.value)} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">نام موجر</label><input type="text" aria-label="نام موجر" value={sanaLandlordName} onChange={(e) => setSanaLandlordName(e.target.value)} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
            <div><label className="text-slate-500 dark:text-[var(--color-text-muted)]">تاریخ انقضا/تخلیه</label><input type="text" aria-label="تاریخ انقضا یا تخلیه" value={sanaExpireDate} onChange={(e) => setSanaExpireDate(e.target.value)} className="w-full bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" /></div>
          </div>
          {(() => { const sanaNoticeText = activeSanaTemplate === 'deposit'
              ? SANA_LEGAL_NOTICES.depositRefund.template(sanaTenantName, sanaLandlordName, activeHood.name, activeHood.rahn80m, sanaExpireDate)
              : activeSanaTemplate === 'evac'
              ? SANA_LEGAL_NOTICES.evacuationNotice.template(sanaLandlordName, sanaTenantName, activeHood.name, sanaExpireDate)
              : SANA_LEGAL_NOTICES.keyHandoverReceipt.template(sanaLandlordName, sanaTenantName, activeHood.name, activeHood.rahn80m); return (
              <div className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-2">
                <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-[11px] flex items-center justify-between"><span>{activeSanaTemplate === 'deposit' ? SANA_LEGAL_NOTICES.depositRefund.title : activeSanaTemplate === 'evac' ? SANA_LEGAL_NOTICES.evacuationNotice.title : SANA_LEGAL_NOTICES.keyHandoverReceipt.title}</span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums">ودیعه مرجع: {toPersianNum(activeHood.rahn80m)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(activeHood.rahn80m, intlCurrency, locale)})` : ''} · اجاره: {toPersianNum(Math.round(activeHood.rahn80m * 0.03))} م/ماه</span></div>
                <p className="text-[10px] text-slate-700 dark:text-[var(--color-text-secondary)] leading-relaxed font-sans bg-white dark:bg-[var(--color-bg-surface)] p-2.5 rounded-lg border border-slate-200 dark:border-[var(--color-border-strong)] whitespace-pre-wrap">
                  {sanaNoticeText} </p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(sanaNoticeText).catch(() => {}); setSanaCopiedNotice(true); if (sanaCopyTimerRef.current !== null) window.clearTimeout(sanaCopyTimerRef.current); sanaCopyTimerRef.current = window.setTimeout(() => { sanaCopyTimerRef.current = null; setSanaCopiedNotice(false); }, 2000); }} className="w-full py-2 rounded-xl bg-slate-900 dark:bg-[var(--color-brand-600)] hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer transition text-[11px]"
                >
                  <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>{sanaCopiedNotice ? 'متن پیش‌نویس کپی شد!' : 'کپی متن پیش‌نویس جهت بازبینی حقوقی'}</span>
                </button>
              </div>
            ); })()} </div>
      </div>
    ); } return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-6 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
        <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center gap-1.5">
          <Hammer className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>محاسبه‌گر بازدهی نوسازی لابی، آسانسور و نما</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <label className="text-slate-500 dark:text-[var(--color-text-muted)]">تعداد واحدهای ساختمان</label>
            <NumericDraftInput aria-label="تعداد واحدهای ساختمان جهت بازسازی" min={4} max={60} fallback={10} value={lobbyUnits} onValueChange={setLobbyUnits} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" />
          </div>
          <div>
            <label className="text-slate-500 dark:text-[var(--color-text-muted)]">کل بودجه بازسازی مشاعات (م){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(lobbyBudgetMillion, intlCurrency, locale)}` : ''}</label>
            <NumericDraftInput aria-label="کل بودجه بازسازی مشاعات" min={100} max={5000} fallback={650} value={lobbyBudgetMillion} onValueChange={setLobbyBudgetMillion} className="w-full bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg p-1.5 font-bold text-slate-900 dark:text-[var(--color-text-primary)] mt-0.5" />
          </div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3 space-y-1.5">
          <div className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">سودآوری بازسازی مشاعات:</div>
          <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            هزینه سهم هر واحد: <strong>{toPersianNum(lobbyRoiResult.perUnitCostMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(lobbyRoiResult.perUnitCostMillion, intlCurrency, locale)})` : ''}</strong>
            <br />
            ارزش‌افزوده تخمینی هر واحد: <strong>{toPersianNum(lobbyRoiResult.perUnitValueGainMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(lobbyRoiResult.perUnitValueGainMillion, intlCurrency, locale)})` : ''}</strong> (حدود {toPersianNum(lobbyRoiResult.roiMultiple)} برابر هزینه پرداختی)
          </div>
        </div>
        <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-1">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-[11px] flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 stroke-[1.75] text-amber-500" />
            <span>یوپی‌اس برق اضطراری پمپ آب و روشنایی:</span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">
            برای قطعی ۲ ساعته تابستان، پکیج اینورتر ۵ کاوا و ۲ باتری ۱۰۰ آمپر با هزینه حدود ۶۵ میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(65, intlCurrency, locale)})` : ''} (سهم هر واحد ۶.۵ میلیون{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(6.5, intlCurrency, locale)})` : ''} آب و روشنایی مشاعات ساختمان را پایدار نگه می‌دارد.
          </p>
        </div>
      </div>
      <div className="lg:col-span-6 bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-3.5">
        <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm flex items-center gap-1.5">
          <Building2 className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>راهنمای مشاغل مجاز در ملک مسکونی (بند ۲۴ ماده ۵۵)</span>
        </div>
        <div className="space-y-2">
          {ARTICLE_55_OFFICE_PERMITTED_JOBS.map((job, idx) => ( <div key={idx} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-2.5 text-[10px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-[var(--color-text-primary)]">{job.title}</span>
                <span className={`px-1.5 py-0.5 rounded-md font-bold ${job.status === 'conditional' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'}`}>
                  {job.status === 'conditional' ? 'مشروط به ضوابط قانونی' : 'غیرمجاز در پهنه مسکونی'} </span>
              </div>
              <p className="text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">{job.rule}</p>
            </div>
          ))} </div>
      </div>
    </div>
  ); }