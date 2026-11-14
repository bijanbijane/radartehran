/** @file src/features/valuation/components/ValuationInputSteps.tsx — Structured Inputs with Field-Level Origin & Location Precision */
import React, { useState } from 'react';
import { Building2, Sparkles, Wrench } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { getNeighborhoodDeepInsight } from '../../../data/neighborhoodInsights';
import { getCurrentJalaliYear, HEDONIC_RENOVATION_OPTIONS } from '../../../data/hedonicPricingEngine';
import { extractListingSpecsFromText, parseIranianPriceToMillionToman } from '../../../data/realMarketPriceAggregator';
import { clampNumber } from '../../../utils/security';
import {
  INPUT_ORIGIN_LABELS_FA,
  LOCATION_PRECISION_LABELS_FA,
  VALUATION_CATEGORY_LABELS_FA,
  VALUATION_PURPOSE_LABELS_FA,
  type InputOrigin,
  type StreetTierId,
  type ValuationLocationPrecision,
  type ValuationOriginField,
  type ValuationPropertyCategory,
  type ValuationPurpose,
  type ValuationWorkspaceInput,
} from '../types/valuation.types';

export interface ValuationInputStepsProps {
  input: ValuationWorkspaceInput;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  completenessPercent: number;
  onChange: (patch: Partial<ValuationWorkspaceInput>) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}

const OriginChip: React.FC<{ origin: InputOrigin }> = ({ origin }) => (
  <span
    className={`text-[10px] px-1.5 py-0.5 rounded-[5px] font-bold ${
      origin === 'system_retrieved'
        ? 'bg-[#EEF5FC] text-[#1D4E89] dark:bg-sky-950/60 dark:text-sky-300'
        : 'bg-[#F1F4F2] text-[#48534F] dark:bg-slate-800 dark:text-slate-300'
    }`}
  >
    {INPUT_ORIGIN_LABELS_FA[origin]}
  </span>
);

export const ValuationInputSteps: React.FC<ValuationInputStepsProps> = ({
  input,
  evaluatedNeighborhoods,
  selectedHood,
  completenessPercent,
  onChange,
  onSelectNeighborhood,
}) => {
  const [adText, setAdText] = useState('');
  const [extractMsg, setExtractMsg] = useState('');
  const currentYear = getCurrentJalaliYear();
  const microHoods = getNeighborhoodDeepInsight(selectedHood).microHoods;
  const isResidential =
    input.propertyCategory === 'residential_apartment' || input.propertyCategory === 'residential_villa';

  const setFieldUser = (field: ValuationOriginField, patch: Partial<ValuationWorkspaceInput>) => {
    onChange({
      ...patch,
      inputOrigins: { ...input.inputOrigins, [field]: 'user_provided' },
    });
  };

  const handleExtractAd = () => {
    if (!adText.trim()) return;
    const specs = extractListingSpecsFromText(adText, selectedHood.buyPerSqm);
    const extractedYear = clampNumber(currentYear - specs.buildingAge, 1370, currentYear, 1398);
    const pMillion =
      specs.totalMillion > 0
        ? specs.totalMillion
        : parseIranianPriceToMillionToman(adText, specs.sqm, selectedHood.buyPerSqm).totalMillion;

    onChange({
      sqm: clampNumber(specs.sqm, 35, 450, 85),
      buildYear: extractedYear,
      renovationStatus: specs.renovationStatus,
      floor: clampNumber(specs.floor, -1, 25, 3),
      totalFloors: Math.max(specs.totalFloors, specs.floor),
      hasElevator: specs.hasElevator,
      hasParking: specs.hasParking,
      hasStorage: specs.hasStorage,
      sellerAskingBillion: pMillion > 0 ? (pMillion / 1000).toFixed(2) : input.sellerAskingBillion,
      inputOrigins: {
        sqm: 'system_retrieved',
        buildYear: 'system_retrieved',
        floor: 'system_retrieved',
        renovationStatus: 'system_retrieved',
        amenities: 'system_retrieved',
        sellerAsking: pMillion > 0 ? 'system_retrieved' : input.inputOrigins.sellerAsking,
      },
    });
    setExtractMsg(`استخراج از آگهی (تأیید رسمی نشده): ${toPersianNum(specs.sqm)}م · ساخت ${toPersianNum(extractedYear)}`);
    setTimeout(() => setExtractMsg(''), 3500);
  };

  return (
    <div className="space-y-4 text-xs" data-testid="valuation-input-steps">
      {/* Step 1: Category & Coverage */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#176B63]" />
            <span>۱. نوع ملک و محدوده پوشش مدل</span>
          </span>
          <span className="text-[11px] font-bold text-[#176B63] tabular-nums">
            تکمیل ورودی: {toPersianNum(completenessPercent)}٪
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            aria-label="کاربری ملک جهت ارزش‌گذاری"
            data-testid="valuation-category-select"
            value={input.propertyCategory}
            onChange={(e) => onChange({ propertyCategory: e.target.value as ValuationPropertyCategory })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold text-[#182522] dark:text-white cursor-pointer"
          >
            {(Object.keys(VALUATION_CATEGORY_LABELS_FA) as ValuationPropertyCategory[]).map((cat) => (
              <option key={cat} value={cat}>{VALUATION_CATEGORY_LABELS_FA[cat]}</option>
            ))}
          </select>
          <select
            aria-label="هدف برآورد ارزش"
            data-testid="valuation-purpose-select"
            value={input.purpose}
            onChange={(e) => onChange({ purpose: e.target.value as ValuationPurpose })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold text-[#182522] dark:text-white cursor-pointer"
          >
            {(Object.keys(VALUATION_PURPOSE_LABELS_FA) as ValuationPurpose[]).map((p) => (
              <option key={p} value={p}>{VALUATION_PURPOSE_LABELS_FA[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: Geography, Street Tier & Location Precision */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
        <span className="font-black text-[#182522] dark:text-white block">۲. محدوده جغرافیایی و دقت موقعیت مکانی</span>
        <select
          aria-label="محله هدف ارزش‌گذاری"
          data-testid="valuation-hood-select"
          value={selectedHood.id}
          onChange={(e) => {
            const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value));
            if (found) {
              onSelectNeighborhood(found);
              onChange({ hoodId: found.id });
            }
          }}
          className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold text-[#182522] dark:text-white cursor-pointer"
        >
          {evaluatedNeighborhoods.map((h) => (
            <option key={h.id} value={h.id}>محله {h.name} ({h.zone})</option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          {microHoods.map((m) => (
            <button
              key={m.tier}
              type="button"
              onClick={() => onChange({ streetTier: m.tier as StreetTierId })}
              className={`p-2 rounded-[8px] border text-[11px] font-bold cursor-pointer ${
                input.streetTier === m.tier
                  ? 'bg-[#EAF3F0] border-[#176B63] text-[#14534E] dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
              }`}
            >
              {m.tier === 'luxury' ? 'پهنه اعیانی' : m.tier === 'balanced' ? 'بافت میانی' : 'پهنه اقتصادی'}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="ws-location-precision" className="text-[11px] font-bold text-[#586760] block mb-1">
            سطح دقت مکانی در اختیار مدل
          </label>
          <select
            id="ws-location-precision"
            value={input.locationPrecision}
            onChange={(e) => onChange({ locationPrecision: e.target.value as ValuationLocationPrecision })}
            className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-[11px] font-bold"
          >
            {(Object.keys(LOCATION_PRECISION_LABELS_FA) as ValuationLocationPrecision[]).map((lp) => (
              <option key={lp} value={lp}>{LOCATION_PRECISION_LABELS_FA[lp]}</option>
            ))}
          </select>
        </div>
      </div>

      {isResidential && (
        <>
          <div className="p-3.5 rounded-[12px] bg-[#EAF3F0]/70 dark:bg-emerald-950/30 border border-[#B8D7CE] dark:border-emerald-800 space-y-2">
            <div className="flex items-center text-[11px] font-bold text-[#14534E] dark:text-emerald-300">
              <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> استخراج خودکار از متن آگهی (منبع غیررسمی)</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="valuation-ad-extract-input"
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder="مثال: ۱۰۰ متر طبقه ۳ از ۵ با پارکینگ و آسانسور ساخت ۱۳۹۸..."
                className="flex-1 px-2.5 py-1.5 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-xs"
              />
              <button type="button" data-testid="valuation-ad-extract-btn" onClick={handleExtractAd} className="px-3 py-1.5 rounded-[8px] bg-[#182522] text-white font-bold cursor-pointer">
                پرکردن خودکار
              </button>
            </div>
            {extractMsg && (
              <div className="text-[11px] font-bold text-[#176B4C] dark:text-emerald-300 tabular-nums" data-testid="valuation-extract-msg">
                {extractMsg}
              </div>
            )}
          </div>

          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-[#182522] dark:text-white">۳. مشخصات فیزیکی واحد و ساختمان</span>
              <OriginChip origin={input.inputOrigins.sqm} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] text-[#586760] block mb-1">متراژ (متر)</label>
                <input type="number" min={30} max={600} data-testid="valuation-sqm-input" value={input.sqm} onChange={(e) => setFieldUser('sqm', { sqm: clampNumber(Number(e.target.value), 30, 600, 85) })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-[11px] text-[#586760] block mb-1">سال ساخت</label>
                <input type="number" min={1340} max={currentYear} value={input.buildYear} onChange={(e) => setFieldUser('buildYear', { buildYear: clampNumber(Number(e.target.value), 1340, currentYear, 1398) })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-[11px] text-[#586760] block mb-1">طبقه واحد</label>
                <input type="number" min={-1} max={40} value={input.floor} onChange={(e) => { const f = clampNumber(Number(e.target.value), -1, 40, 3); setFieldUser('floor', { floor: f, totalFloors: Math.max(input.totalFloors, f) }); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-[11px] text-[#586760] block mb-1">کل طبقات</label>
                <input type="number" min={1} max={40} value={input.totalFloors} onChange={(e) => { const tf = clampNumber(Number(e.target.value), 1, 40, 5); setFieldUser('floor', { totalFloors: tf, floor: Math.min(input.floor, tf) }); }} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#176B63]" />
                <span>۴. وضعیت نوسازی و امکانات سندی</span>
              </span>
              <OriginChip origin={input.inputOrigins.renovationStatus} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {HEDONIC_RENOVATION_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => setFieldUser('renovationStatus', { renovationStatus: opt.id })} className={`p-2.5 rounded-[9px] border text-right cursor-pointer ${input.renovationStatus === opt.id ? 'bg-[#EAF3F0] border-[#176B63] text-[#14534E] font-bold' : 'border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'}`}>
                  <div className="font-bold">{opt.shortLabel}</div>
                  <div className="text-[10px] opacity-75 line-clamp-1">{opt.label}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-[#DCE3DF] dark:border-slate-800 font-bold">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasParking} onChange={(e) => setFieldUser('amenities', { hasParking: e.target.checked })} className="accent-[#176B63]" /><span>پارکینگ سندی</span></label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasElevator} onChange={(e) => setFieldUser('amenities', { hasElevator: e.target.checked })} className="accent-[#176B63]" /><span>آسانسور</span></label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasStorage} onChange={(e) => setFieldUser('amenities', { hasStorage: e.target.checked })} className="accent-[#176B63]" /><span>انباری سندی</span></label>
            </div>
          </div>

          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ws-asking-billion" className="font-black text-[#182522] dark:text-white block">
                ۵. قیمت اعلامی فروشنده برای سنجش شکاف (اختیاری - میلیارد)
              </label>
              <OriginChip origin={input.inputOrigins.sellerAsking} />
            </div>
            <input id="ws-asking-billion" type="number" step="0.1" value={input.sellerAskingBillion} onChange={(e) => setFieldUser('sellerAsking', { sellerAskingBillion: e.target.value })} placeholder="در صورت داشتن قیمت آگهی، به میلیارد تومان وارد کنید" className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold tabular-nums" />
          </div>
        </>
      )}
    </div>
  );
};
