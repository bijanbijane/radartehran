import React, { useState, useMemo, useEffect } from 'react'; import { Building2, Copy, FileCheck, FileText, Hammer, Scale, Zap } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { CityId } from '../data/multiCityData'; import { clampNumber } from '../utils/security'; import { calculatePropertyTaxes, calculateInheritanceShares, generateBuildingChargeBill, SANA_LEGAL_NOTICES, calculateLobbyUpgradeRoi, ARTICLE_55_OFFICE_PERMITTED_JOBS } from '../data/superModulesLogic'; import type { SuperModuleTabId } from './FutureSuperModulesModal'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; export interface SuperModulesLegalAndBuildingTabsProps { activeTab: SuperModuleTabId; activeHood: EvaluatedNeighborhood; activeCity: CityId; valSqm: number; fairTotalMillion: number; } export function SuperModulesLegalAndBuildingTabs( props: SuperModulesLegalAndBuildingTabsProps ): React.ReactElement | null { const { activeTab, activeHood, activeCity, valSqm, fairTotalMillion } = props; const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const [taxRentMillion, setTaxRentMillion] = useState<number>(25); const [taxRahnMillion, setTaxRahnMillion] = useState<number>(600); const [taxSqm, setTaxSqm] = useState<number>(165); const [taxVacantMonths, setTaxVacantMonths] = useState<number>(0); const [taxRahnEquivalentAnnualMillion, setTaxRahnEquivalentAnnualMillion] = useState<number | null>(null); const [taxQualifiesForAreaExemption, setTaxQualifiesForAreaExemption] = useState<boolean>(false); const [taxQualifiesForAnnualIncomeExemption, setTaxQualifiesForAnnualIncomeExemption] = useState<boolean>(false); const [taxVacantYear, setTaxVacantYear] = useState<1 | 2 | 3>(1); const [heirSons, setHeirSons] = useState<number>(2); const [heirDaughters, setHeirDaughters] = useState<number>(1); const [heirHasSpouse, setHeirHasSpouse] = useState<boolean>(true); const [heirSpouseType, setHeirSpouseType] = useState<'wife' | 'husband'>('wife'); const [heirHasMother, setHeirHasMother] = useState<boolean>(false); const [heirHasFather, setHeirHasFather] = useState<boolean>(false); const [inheritanceOfficialTaxBaseMillion, setInheritanceOfficialTaxBaseMillion] = useState<number | null>(null); const [inheritanceHeirClass, setInheritanceHeirClass] = useState<1 | 2 | 3>(1);
  const [inheritanceDeathAfter1395, setInheritanceDeathAfter1395] = useState<boolean>(false); const propertyTaxResult = useMemo(() => calculatePropertyTaxes({ monthlyRentMillion: taxRentMillion, rahnMillion: taxRahnMillion, sqm: taxSqm, city: activeCity, vacantMonths: taxVacantMonths, vacantYear: taxVacantYear, officialTaxableRentalBaseMillion: taxRahnEquivalentAnnualMillion ?? undefined, qualifiesForAreaExemption: taxQualifiesForAreaExemption, qualifiesForAnnualIncomeExemption: taxQualifiesForAnnualIncomeExemption, }), [taxRentMillion, taxRahnMillion, taxSqm, activeCity, taxVacantMonths, taxVacantYear, taxRahnEquivalentAnnualMillion, taxQualifiesForAreaExemption, taxQualifiesForAnnualIncomeExemption]); const inheritanceResult = useMemo(() => calculateInheritanceShares({ propertyTotalValueMillion: fairTotalMillion, hasSpouse: heirHasSpouse, spouseType: heirSpouseType, sonsCount: heirSons, daughtersCount: heirDaughters, hasMother: heirHasMother, hasFather: heirHasFather, officialTaxableEstateValueMillion: inheritanceOfficialTaxBaseMillion ?? undefined,
    estateTaxRatePercent: inheritanceHeirClass === 1 ? 7.5 : inheritanceHeirClass === 2 ? 15 : 30, deathAfter1395: inheritanceDeathAfter1395, }), [fairTotalMillion, heirHasSpouse, heirSpouseType, heirSons, heirDaughters, heirHasMother, heirHasFather, inheritanceOfficialTaxBaseMillion, inheritanceHeirClass, inheritanceDeathAfter1395]);
  const [bldgCustomName, setBldgCustomName] = useState<string>(`ساختمان یاس ${activeHood.name}`);
  const [bldgMonthName, setBldgMonthName] = useState<string>(() => { try { return new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date()); } catch { return 'آبان ۱۴۰۵'; } });
  useEffect(() => { setBldgCustomName(`ساختمان یاس ${activeHood.name}`); }, [activeHood.name]);
  const [bldgUnitsCount, setBldgUnitsCount] = useState<number>(12); const [bldgUnitNumber, setBldgUnitNumber] = useState<number>(5); const [bldgOccupants, setBldgOccupants] = useState<number>(3); const [bldgCleaningCost, setBldgCleaningCost] = useState<number>(3500); const [bldgElevatorCost, setBldgElevatorCost] = useState<number>(2800); const [bldgWaterCost, setBldgWaterCost] = useState<number>(4200); const [bldgReserveFund, setBldgReserveFund] = useState<number>(2500); const [copiedBillNotice, setCopiedBillNotice] = useState<boolean>(false); const [activeSanaTemplate, setActiveSanaTemplate] = useState<'deposit' | 'evac' | 'receipt'>('deposit'); const [sanaCopiedNotice, setSanaCopiedNotice] = useState<boolean>(false); const [sanaTenantName, setSanaTenantName] = useState<string>('علیرضا محمدی'); const [sanaLandlordName, setSanaLandlordName] = useState<string>('حسین احمدی'); const [sanaExpireDate, setSanaExpireDate] = useState<string>('۱۴۰۵/۰۸/۳۰'); const buildingBillResult = useMemo(() => generateBuildingChargeBill({
    buildingName: bldgCustomName.trim() || `یاس محله ${activeHood.name}`,
    monthName: bldgMonthName.trim() || 'جاری', totalCleaningThousand: bldgCleaningCost, totalElevatorServiceThousand: bldgElevatorCost, totalSharedWaterPowerThousand: bldgWaterCost, totalReserveFundThousand: bldgReserveFund, totalUnits: bldgUnitsCount, unitNumber: bldgUnitNumber, unitOccupants: bldgOccupants, totalBuildingOccupants: Math.max(bldgOccupants, bldgUnitsCount * 3), unitSqm: valSqm, totalBuildingSqm: valSqm * bldgUnitsCount, }), [bldgCustomName, bldgMonthName, activeHood.name, bldgCleaningCost, bldgElevatorCost, bldgWaterCost, bldgReserveFund, bldgUnitsCount, bldgUnitNumber, bldgOccupants, valSqm]);
  const [lobbyUnits, setLobbyUnits] = useState<number>(10); const [lobbyBudgetMillion, setLobbyBudgetMillion] = useState<number>(650); const lobbyRoiResult = useMemo(() => calculateLobbyUpgradeRoi({ totalBuildingUnits: lobbyUnits, currentUnitAvgPriceBillion: fairTotalMillion / 1000, renovationBudgetMillion: lobbyBudgetMillion, }), [lobbyUnits, fairTotalMillion, lobbyBudgetMillion]);
  if (activeTab === 'tax_inheritance') { return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4"> <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5"> <Scale className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            <span>ماشین‌حساب مالیات اجاره، خانه‌های خالی و عایدی مسکن</span> </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"> <div><label className="block text-[10px] text-slate-600 mb-1">متراژ واحد ({formatAreaValue(taxSqm, areaUnit, true)})</label><input type="number" value={taxSqm} onChange={(e) => setTaxSqm(clampNumber(e.target.value, 30, 600, 165))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold" /></div>
            <div><label className="block text-[10px] text-slate-600 mb-1">اجاره ماهانه (م){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(taxRentMillion, intlCurrency, locale)}` : ''}</label><input type="number" value={taxRentMillion} onChange={(e) => setTaxRentMillion(clampNumber(e.target.value, 0, 500, 25))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold" /></div> <div><label className="block text-[10px] text-slate-600 mb-1">ودیعه (اجاره: {toPersianNum(Math.round(taxRahnMillion * 0.03))} م/ماه){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(taxRahnMillion, intlCurrency, locale)}` : ''}</label><input type="number" value={taxRahnMillion} onChange={(e) => setTaxRahnMillion(clampNumber(e.target.value, 0, 50000, 600))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold" /></div>
            <div><label className="block text-[10px] text-slate-600 mb-1">ماه‌های خالی ملک</label><input type="number" value={taxVacantMonths} onChange={(e) => setTaxVacantMonths(clampNumber(e.target.value, 0, 12, 0))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold" /></div> </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label className="block text-[10px] text-slate-600 mb-1">معادل اجارهٔ سالانهٔ ودیعه (میلیون تومان)</label><input type="number" min="0" placeholder="اختیاری" value={taxRahnEquivalentAnnualMillion ?? ''} onChange={(e) => setTaxRahnEquivalentAnnualMillion(e.target.value === '' ? null : clampNumber(e.target.value, 0, 100000, 0))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold" /></div>
            <div><label className="block text-[10px] text-slate-600 mb-1">سال شمول مالیات خانهٔ خالی</label><select value={taxVacantYear} onChange={(e) => setTaxVacantYear(Number(e.target.value) as 1 | 2 | 3)} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold"><option value={1}>سال اول</option><option value={2}>سال دوم</option><option value={3}>سال سوم به بعد</option></select></div>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={taxQualifiesForAreaExemption} onChange={(e) => setTaxQualifiesForAreaExemption(e.target.checked)} /><span>شرایط معافیت متراژی را مستقلاً بررسی کرده‌ام</span></label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={taxQualifiesForAnnualIncomeExemption} onChange={(e) => setTaxQualifiesForAnnualIncomeExemption(e.target.checked)} /><span>شرایط معافیت سالانهٔ درآمد را دارم</span></label>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700">مالیات سالانه بر درآمد اجاره:</span>
              <span className="font-black text-rose-600 text-sm tabular-nums">
                {propertyTaxResult.annualRentalTaxMillion === null ? 'اطلاعات ناکافی برای محاسبه' : propertyTaxResult.isAreaExempt ? 'معاف طبق شرایط واردشده' : `${toPersianNum(propertyTaxResult.annualRentalTaxMillion)} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(propertyTaxResult.annualRentalTaxMillion, intlCurrency, locale)})` : ''}`}
              </span>
            </div>
            {propertyTaxResult.vacantHomeTaxAnnualMillion !== null && propertyTaxResult.vacantHomeTaxAnnualMillion > 0 && (
              <div className="flex items-center justify-between text-[11px] text-rose-700 pt-1 border-t border-slate-100">
                <span>برآورد مالیات خانهٔ خالی:</span>
                <span className="font-bold">{toPersianNum(propertyTaxResult.vacantHomeTaxAnnualMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(propertyTaxResult.vacantHomeTaxAnnualMillion, intlCurrency, locale)})` : ''}</span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 leading-relaxed">{propertyTaxResult.explanation}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <div className="font-bold text-amber-900 text-[11px]">قانون مستثنیات دین در توقیف مسکن و مهریه:</div>
            <p className="text-[10px] text-amber-900 leading-relaxed">طبق ماده ۲۴ قانون نحوه اجرای محکومیت‌های مالی، منزل مسکونی در شأن بدهکار جزو مستثنیات دین بوده و بابت مهریه یا بدهی قابل توقیف و مزایده نیست. جهت امنیت موروثی مادام‌العمر، قرارداد رسمی <strong>صلح عُمری با حق فسخ</strong> توصیه می‌شود.</p>
          </div>
        </div>
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <Scale className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            <span>تقسیم شرعی سهم‌الارث ملک ({formatAreaValue(valSqm, areaUnit, true)} · {toPersianNum((fairTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(fairTotalMillion, intlCurrency, locale)}` : ''} · {areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}{toPersianNum(convertPricePerSqmToUnit(Math.round(fairTotalMillion / Math.max(1, valSqm)), areaUnit))} م · معامله محله: {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(activeHood.id, activeHood.name, activeHood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit))} م)</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-slate-500">تعداد پسران:</span><input type="number" value={heirSons} onChange={(e) => setHeirSons(clampNumber(e.target.value, 0, 10, 2))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><span className="text-slate-500">تعداد دختران:</span><input type="number" value={heirDaughters} onChange={(e) => setHeirDaughters(clampNumber(e.target.value, 0, 10, 1))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><span className="text-slate-500">همسر در قید حیات:</span><select value={heirHasSpouse ? 'yes' : 'no'} onChange={(e) => setHeirHasSpouse(e.target.value === 'yes')} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5"><option value="yes">بله</option><option value="no">خیر</option></select></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-slate-500">نوع همسر:</span><select value={heirSpouseType} onChange={(e) => setHeirSpouseType(e.target.value as 'wife' | 'husband')} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5"><option value="wife">زوجه (زن)</option><option value="husband">زوج (مرد)</option></select></div>
            <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-4 cursor-pointer"><input type="checkbox" checked={heirHasFather} onChange={(e) => setHeirHasFather(e.target.checked)} /><span>پدر در قید حیات</span></label>
            <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-4 cursor-pointer"><input type="checkbox" checked={heirHasMother} onChange={(e) => setHeirHasMother(e.target.checked)} /><span>مادر در قید حیات</span></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
            <div>
              <label className="block text-slate-600 mb-1">ارزش معاملاتی رسمی ملک (م)</label>
              <input
                type="number" min="0" value={inheritanceOfficialTaxBaseMillion ?? ''}
                onChange={(e) => setInheritanceOfficialTaxBaseMillion(e.target.value === '' ? null : clampNumber(e.target.value, 0, 100000000, 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">طبقهٔ وراث برای مالیات</label>
              <select
                value={inheritanceHeirClass}
                onChange={(e) => setInheritanceHeirClass(Number(e.target.value) as 1 | 2 | 3)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold"
              >
                <option value={1}>طبقهٔ اول</option><option value={2}>طبقهٔ دوم</option><option value={3}>طبقهٔ سوم</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 mt-4 cursor-pointer font-bold">
              <input type="checkbox" checked={inheritanceDeathAfter1395} onChange={(e) => setInheritanceDeathAfter1395(e.target.checked)} />
              <span>فوت مشمول رژیم پس از ۱۳۹۵</span>
            </label>
          </div>
          <div className="space-y-1.5">
            {inheritanceResult.shares.map((share, idx) => ( <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-[11px]">
                <div>
                  <div className="font-bold text-slate-900">{share.relation} ({share.fractionText})</div>
                  <div className="text-[10px] text-slate-500">{toPersianNum(share.sharePercent)}٪ از کل ارزش ملک</div>
                </div>
                <div className="text-left font-black text-emerald-800 tabular-nums">
                  {toPersianNum((share.totalValueMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(share.totalValueMillion, intlCurrency, locale)})` : ''}
                  {share.count > 1 && <div className="text-[9px] font-normal text-slate-500">نفری: {toPersianNum((share.perPersonValueMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(share.perPersonValueMillion, intlCurrency, locale)})` : ''}</div>}
                </div>
              </div> ))}
          </div>
          <div className="text-[10px] text-slate-500 text-center">
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
        <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 stroke-[1.75] text-emerald-600" />
              <span>حسابدار هوشمند مدیر ساختمان و صدور صورتحساب</span>
            </span>
            <span className="text-[10px] text-emerald-700 font-bold tabular-nums">واحد {formatAreaValue(valSqm, areaUnit, true)} از کل {formatAreaValue(valSqm * bldgUnitsCount, areaUnit, true)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <label className="text-slate-500">نام مجتمع / ساختمان</label>
              <input type="text" value={bldgCustomName} onChange={(e) => setBldgCustomName(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" />
            </div>
            <div>
              <label className="text-slate-500">ماه صورتحساب</label>
              <input type="text" value={bldgMonthName} onChange={(e) => setBldgMonthName(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><label className="text-slate-500">کل واحدها</label><input type="number" value={bldgUnitsCount} onChange={(e) => setBldgUnitsCount(clampNumber(e.target.value, 2, 100, 12))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">شماره واحد</label><input type="number" value={bldgUnitNumber} onChange={(e) => setBldgUnitNumber(clampNumber(e.target.value, 1, 100, 5))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">تعداد نفرات واحد</label><input type="number" value={bldgOccupants} onChange={(e) => setBldgOccupants(clampNumber(e.target.value, 1, 15, 3))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><label className="text-slate-500">هزینه نظافت (هزار تومان)</label><input type="number" value={bldgCleaningCost} onChange={(e) => setBldgCleaningCost(clampNumber(e.target.value, 500, 20000, 3500))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">سرویس آسانسور (هزار تومان)</label><input type="number" value={bldgElevatorCost} onChange={(e) => setBldgElevatorCost(clampNumber(e.target.value, 500, 20000, 2800))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">آب و گاز مشترک (هزار تومان)</label><input type="number" value={bldgWaterCost} onChange={(e) => setBldgWaterCost(clampNumber(e.target.value, 500, 50000, 4200))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">اندوخته عمرانی (هزار تومان)</label><input type="number" value={bldgReserveFund} onChange={(e) => setBldgReserveFund(clampNumber(e.target.value, 500, 50000, 2500))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
          </div>
          {!buildingBillResult.isValid ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-800 font-bold">
              {buildingBillResult.validationError}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  مبلغ شارژ واحد {toPersianNum(bldgUnitNumber)} ({toPersianNum(bldgOccupants)} نفره):
                </span>
                <span className="font-black text-emerald-700 text-sm tabular-nums">
                  {toPersianNum((buildingBillResult.unitTotalBillThousand * 1000).toLocaleString('en-US'))} تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(buildingBillResult.unitTotalBillThousand / 1000, intlCurrency, locale)})` : ''}
                </span>
              </div>
              <pre className="text-[10px] text-slate-600 bg-slate-50 p-2.5 rounded-lg whitespace-pre-wrap font-sans leading-relaxed border border-slate-200">{buildingBillResult.whatsappMessageText}</pre>
              <button
                type="button"
                onClick={() => { const billText = intlCurrency !== 'IRT' ? `${buildingBillResult.whatsappMessageText}\n🌐 معادل ارزی سهم واحد: ${formatMillionTomanAsIntlCurrency(buildingBillResult.unitTotalBillThousand / 1000, intlCurrency, locale)}` : buildingBillResult.whatsappMessageText; navigator.clipboard?.writeText(billText).catch(() => {}); setCopiedBillNotice(true); setTimeout(() => setCopiedBillNotice(false), 2000); }}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{copiedBillNotice ? 'متن صورتحساب کپی شد!' : 'کپی متن صورتحساب برای گروه واتساپ/تلگرام'}</span>
              </button>
            </div> )}
        </div>
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
          <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <FileText className="w-4 h-4 stroke-[1.75] text-emerald-600" />
            <span>پیش‌نویس‌های متنی استرداد ودیعه، تخلیه و تحویل کلید</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'deposit' as const, label: 'مطالبه ودیعه مسکن' }, { id: 'evac' as const, label: 'تعیین تکلیف تخلیه' }, { id: 'receipt' as const, label: 'صورتجلسه تحویل کلید' }, ].map((item) => (
              <button
                key={item.id} type="button" onClick={() => setActiveSanaTemplate(item.id)}
                className={`py-1.5 px-2 rounded-lg font-bold text-[10px] truncate cursor-pointer transition ${
                  activeSanaTemplate === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))} </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><label className="text-slate-500">نام مستأجر</label><input type="text" value={sanaTenantName} onChange={(e) => setSanaTenantName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">نام موجر</label><input type="text" value={sanaLandlordName} onChange={(e) => setSanaLandlordName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
            <div><label className="text-slate-500">تاریخ انقضا/تخلیه</label><input type="text" value={sanaExpireDate} onChange={(e) => setSanaExpireDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" /></div>
          </div>
          {(() => { const sanaNoticeText = activeSanaTemplate === 'deposit'
              ? SANA_LEGAL_NOTICES.depositRefund.template(sanaTenantName, sanaLandlordName, activeHood.name, activeHood.rahn80m, sanaExpireDate)
              : activeSanaTemplate === 'evac'
              ? SANA_LEGAL_NOTICES.evacuationNotice.template(sanaLandlordName, sanaTenantName, activeHood.name, sanaExpireDate)
              : SANA_LEGAL_NOTICES.keyHandoverReceipt.template(sanaLandlordName, sanaTenantName, activeHood.name, activeHood.rahn80m); return (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="font-bold text-slate-900 text-[11px] flex items-center justify-between"><span>{activeSanaTemplate === 'deposit' ? SANA_LEGAL_NOTICES.depositRefund.title : activeSanaTemplate === 'evac' ? SANA_LEGAL_NOTICES.evacuationNotice.title : SANA_LEGAL_NOTICES.keyHandoverReceipt.title}</span>
                  <span className="text-[10px] text-emerald-700 tabular-nums">ودیعه مرجع: {toPersianNum(activeHood.rahn80m)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(activeHood.rahn80m, intlCurrency, locale)})` : ''} · اجاره: {toPersianNum(Math.round(activeHood.rahn80m * 0.03))} م/ماه</span></div>
                <p className="text-[10px] text-slate-700 leading-relaxed font-sans bg-white p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">
                  {sanaNoticeText} </p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(sanaNoticeText).catch(() => {}); setSanaCopiedNotice(true); setTimeout(() => setSanaCopiedNotice(false), 2000); }} className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer transition text-[11px]"
                >
                  <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>{sanaCopiedNotice ? 'متن پیش‌نویس کپی شد!' : 'کپی متن پیش‌نویس جهت بازبینی حقوقی'}</span>
                </button>
              </div>
            ); })()} </div>
      </div>
    ); } return ( <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
          <Hammer className="w-4 h-4 stroke-[1.75] text-emerald-600" />
          <span>محاسبه‌گر بازدهی نوسازی لابی، آسانسور و نما</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <label className="text-slate-500">تعداد واحدهای ساختمان</label>
            <input type="number" value={lobbyUnits} onChange={(e) => setLobbyUnits(clampNumber(e.target.value, 4, 60, 10))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" />
          </div>
          <div>
            <label className="text-slate-500">کل بودجه بازسازی مشاعات (م){intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(lobbyBudgetMillion, intlCurrency, locale)}` : ''}</label>
            <input type="number" value={lobbyBudgetMillion} onChange={(e) => setLobbyBudgetMillion(clampNumber(e.target.value, 100, 5000, 650))} className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold mt-0.5" />
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
          <div className="text-[11px] font-bold text-emerald-900">سودآوری بازسازی مشاعات:</div>
          <div className="text-xs text-emerald-800 leading-relaxed">
            هزینه سهم هر واحد: <strong>{toPersianNum(lobbyRoiResult.perUnitCostMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(lobbyRoiResult.perUnitCostMillion, intlCurrency, locale)})` : ''}</strong>
            <br />
            ارزش‌افزوده تخمینی هر واحد: <strong>{toPersianNum(lobbyRoiResult.perUnitValueGainMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(lobbyRoiResult.perUnitValueGainMillion, intlCurrency, locale)})` : ''}</strong> (حدود {toPersianNum(lobbyRoiResult.roiMultiple)} برابر هزینه پرداختی)
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
          <div className="font-bold text-slate-900 text-[11px] flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 stroke-[1.75] text-amber-500" />
            <span>یوپی‌اس برق اضطراری پمپ آب و روشنایی:</span>
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            برای قطعی ۲ ساعته تابستان، پکیج اینورتر ۵ کاوا و ۲ باتری ۱۰۰ آمپر با هزینه حدود ۶۵ میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(65, intlCurrency, locale)})` : ''} (سهم هر واحد ۶.۵ میلیون{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(6.5, intlCurrency, locale)}` : ''}) آب و روشنایی مشاعات ساختمان را پایدار نگه می‌دارد.
          </p>
        </div>
      </div>
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
          <Building2 className="w-4 h-4 stroke-[1.75] text-emerald-600" />
          <span>راهنمای مشاغل مجاز در ملک مسکونی (بند ۲۴ ماده ۵۵)</span>
        </div>
        <div className="space-y-2">
          {ARTICLE_55_OFFICE_PERMITTED_JOBS.map((job, idx) => ( <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{job.title}</span>
                <span className={`px-1.5 py-0.5 rounded-md font-extrabold ${job.status === 'conditional' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                  {job.status === 'conditional' ? 'مشروط به ضوابط قانونی' : 'غیرمجاز در پهنه مسکونی'} </span>
              </div>
              <p className="text-slate-600 leading-relaxed">{job.rule}</p>
            </div>
          ))} </div>
      </div>
    </div>
  ); }