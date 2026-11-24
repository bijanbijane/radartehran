/** @file src/features/valuation/components/ValuationInputSteps.tsx — Stage 89 Structured Inputs with Field-Level Origin, Selective Ad Extraction & Validation */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Building2, Sparkles, Wrench } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { getNeighborhoodDeepInsight } from '../../../data/neighborhoodInsights';
import { getCurrentJalaliYear, HEDONIC_RENOVATION_OPTIONS } from '../../../data/hedonicPricingEngine';
import { extractValuationSpecsFromAdText } from '../services/valuationWorkspaceService';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  INPUT_ORIGIN_LABELS_FA,
  LOCATION_PRECISION_LABELS_FA,
  VALUATION_CATEGORY_LABELS_FA,
  VALUATION_PURPOSE_LABELS_FA,
  type InputOrigin,
  type StreetTierId,
  type ValuationInputValidationResult,
  type ValuationLocationPrecision,
  type ValuationOriginField,
  type ValuationPropertyCategory,
  type ValuationPurpose,
  type ValuationWorkspaceInput,
} from '../types/valuation.types';

export interface ValuationInputStepsProps {
  input: ValuationWorkspaceInput;
  validation?: ValuationInputValidationResult;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  completenessPercent: number;
  onChange: (patch: Partial<ValuationWorkspaceInput>) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}

const OriginChip: React.FC<{ origin: InputOrigin }> = ({ origin }) => {
  const tone =
    origin === 'user_provided' || origin === 'verified'
      ? 'bg-[#EAF3F0] text-[var(--color-brand-700)] dark:bg-emerald-950/60 dark:text-emerald-300'
      : origin === 'system_retrieved'
        ? 'bg-[#EEF5FC] text-[#1D4E89] dark:bg-sky-950/60 dark:text-sky-300'
        : 'bg-[#FFF4E5] text-[#875000] dark:bg-amber-950/50 dark:text-amber-200';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-[5px] font-bold ${tone}`}>
      {INPUT_ORIGIN_LABELS_FA[origin]}
    </span>
  );
};

export const ValuationInputSteps: React.FC<ValuationInputStepsProps> = ({
  input,
  validation,
  evaluatedNeighborhoods,
  selectedHood,
  completenessPercent,
  onChange,
  onSelectNeighborhood,
}) => {
  const [adText, setAdText] = useState('');
  const [extractMsg, setExtractMsg] = useState('');
  const extractTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (extractTimerRef.current !== null) window.clearTimeout(extractTimerRef.current); }, []);
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
    const { patch, summaryFa } = extractValuationSpecsFromAdText(adText, input, selectedHood.buyPerSqm);
    onChange(patch);
    setExtractMsg(summaryFa);
    if (extractTimerRef.current !== null) window.clearTimeout(extractTimerRef.current);
    extractTimerRef.current = window.setTimeout(() => { extractTimerRef.current = null; setExtractMsg(''); }, 4200);
  };

  const fieldErrors = validation?.fieldErrors || {};

  return (
    <div className="space-y-4 text-xs" data-testid="valuation-input-steps">
      {/* Step 1: Category & Coverage */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-black text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>۱. نوع ملک و هدف ارزش‌گذاری</span>
          </span>
          <span className="text-xs font-bold text-[var(--color-brand-fg)] tabular-nums">
            کیفیت تکمیل ورودی: {toPersianNum(completenessPercent)}٪
          </span>
        </div>
        {validation?.hasDefaultAssumptions && (
          <div className="p-2.5 rounded-[8px] bg-[#FFF4E5]/70 dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-xs font-bold text-[#875000] dark:text-amber-200">
            برخی ورودی‌ها هنوز روی «پیش‌فرض فرضی سیستم» قرار دارند. برای افزایش دقت و شفافیت، مقادیر واقعی واحد را وارد کنید.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            aria-label="کاربری ملک جهت ارزش‌گذاری"
            data-testid="valuation-category-select"
            value={input.propertyCategory}
            onChange={(e) => onChange({ propertyCategory: e.target.value as ValuationPropertyCategory })}
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold text-[var(--color-text-primary)] dark:text-white cursor-pointer"
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
            className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold text-[var(--color-text-primary)] dark:text-white cursor-pointer"
          >
            {(Object.keys(VALUATION_PURPOSE_LABELS_FA) as ValuationPurpose[]).map((p) => (
              <option key={p} value={p}>{VALUATION_PURPOSE_LABELS_FA[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: Geography, Street Tier & Location Precision */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3">
        <span className="font-black text-[var(--color-text-primary)] dark:text-white block">۲. محدوده جغرافیایی و دقت موقعیت مکانی</span>
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
          className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold text-[var(--color-text-primary)] dark:text-white cursor-pointer"
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
              className={`min-h-[44px] md:min-h-[36px] p-2 rounded-[8px] border text-xs font-bold cursor-pointer ${
                input.streetTier === m.tier
                  ? 'bg-[#EAF3F0] border-[var(--color-brand-600)] text-[var(--color-brand-fg)] dark:bg-emerald-950/50'
                  : 'border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-secondary)]'
              }`}
            >
              {m.tier === 'luxury' ? 'پهنه اعیانی' : m.tier === 'balanced' ? 'بافت میانی' : 'پهنه اقتصادی'}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="ws-location-precision" className="text-xs font-bold text-[var(--color-text-muted)] block mb-1">
            سطح دقت مکانی در اختیار مدل
          </label>
          <select
            id="ws-location-precision"
            value={input.locationPrecision}
            onChange={(e) => onChange({ locationPrecision: e.target.value as ValuationLocationPrecision })}
            className="w-full min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 text-xs font-bold"
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
            <label htmlFor="ws-ad-extract-input" className="flex items-center text-xs font-bold text-[var(--color-brand-fg)]">
              <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> استخراج گزینشی از متن آگهی (فقط فیلدهای ذکرشده در متن)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="ws-ad-extract-input"
                type="text"
                aria-label="متن آگهی ملک برای استخراج خودکار مشخصات"
                data-testid="valuation-ad-extract-input"
                value={adText}
                onChange={(e) => setAdText(e.target.value)}
                placeholder="مثال: ۱۰۰ متر طبقه ۳ از ۵ با پارکینگ و آسانسور ساخت ۱۳۹۸..."
                className="flex-1 min-h-[44px] md:min-h-[38px] px-2.5 py-1.5 rounded-[8px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 text-xs"
              />
              <button type="button" data-testid="valuation-ad-extract-btn" onClick={handleExtractAd} className="min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
                پرکردن خودکار
              </button>
            </div>
            {extractMsg && (
              <div className="text-xs font-bold text-[var(--color-brand-fg)] tabular-nums" data-testid="valuation-extract-msg">
                {extractMsg}
              </div>
            )}
          </div>

          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3 tabular-nums">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black text-[var(--color-text-primary)] dark:text-white">۳. مشخصات فیزیکی واحد (مبنای محاسبه: مترمربع m²)</span>
              <div className="flex flex-wrap gap-1">
                <OriginChip origin={input.inputOrigins.sqm} />
                <OriginChip origin={input.inputOrigins.floor} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">متراژ (متر)</label>
                <NumericDraftInput min={30} max={600} fallback={85} aria-label="متراژ واحد" data-testid="valuation-sqm-input" value={input.sqm} onValueChange={(nextSqm) => setFieldUser('sqm', { sqm: nextSqm })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">سال ساخت</label>
                <NumericDraftInput min={1340} max={currentYear} fallback={1398} aria-label="سال ساخت" value={input.buildYear} onValueChange={(nextYear) => setFieldUser('buildYear', { buildYear: nextYear })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">طبقه واحد (همکف=۰)</label>
                <NumericDraftInput min={-2} max={60} fallback={3} aria-label="طبقه واحد" value={input.floor} onValueChange={(f) => setFieldUser('floor', { floor: f, totalFloors: Math.max(input.totalFloors, Math.max(1, f)) })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">کل طبقات</label>
                <NumericDraftInput min={1} max={60} fallback={5} aria-label="کل طبقات" value={input.totalFloors} onValueChange={(tf) => setFieldUser('floor', { totalFloors: tf, floor: Math.min(input.floor, tf) })} className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold" />
              </div>
            </div>
            {(fieldErrors.sqm || fieldErrors.buildYear || fieldErrors.floor || fieldErrors.totalFloors) && (
              <div className="p-2 rounded-[8px] bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{fieldErrors.sqm || fieldErrors.buildYear || fieldErrors.floor || fieldErrors.totalFloors}</span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[var(--color-brand-fg)]" />
                <span>۴. وضعیت نوسازی و امکانات سندی</span>
              </span>
              <div className="flex gap-1">
                <OriginChip origin={input.inputOrigins.renovationStatus} />
                <OriginChip origin={input.inputOrigins.amenities} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {HEDONIC_RENOVATION_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => setFieldUser('renovationStatus', { renovationStatus: opt.id })} className={`p-2.5 rounded-[9px] border text-start cursor-pointer ${input.renovationStatus === opt.id ? 'bg-[#EAF3F0] dark:bg-emerald-950/50 border-[var(--color-brand-600)] text-[var(--color-brand-fg)] font-bold' : 'border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-secondary)]'}`}>
                  <div className="font-bold">{opt.shortLabel}</div>
                  <div className="text-xs opacity-80 line-clamp-1">{opt.label}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800 font-bold">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasParking} onChange={(e) => setFieldUser('amenities', { hasParking: e.target.checked })} className="accent-[var(--color-brand-600)]" /><span>پارکینگ سندی</span></label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasElevator} onChange={(e) => setFieldUser('amenities', { hasElevator: e.target.checked })} className="accent-[var(--color-brand-600)]" /><span>آسانسور</span></label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={input.hasStorage} onChange={(e) => setFieldUser('amenities', { hasStorage: e.target.checked })} className="accent-[var(--color-brand-600)]" /><span>انباری سندی</span></label>
            </div>
          </div>

          {input.purpose === 'sale' && (
            <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="ws-asking-billion" className="font-black text-[var(--color-text-primary)] dark:text-white block">
                  ۵. قیمت اعلامی فروشنده برای سنجش شکاف (اختیاری - میلیارد تومان)
                </label>
                <OriginChip origin={input.inputOrigins.sellerAsking} />
              </div>
              <input id="ws-asking-billion" type="text" inputMode="decimal" value={input.sellerAskingBillion} onChange={(e) => setFieldUser('sellerAsking', { sellerAskingBillion: e.target.value })} placeholder="در صورت داشتن قیمت آگهی، به میلیارد تومان وارد کنید (مثلاً ۱۰.۵)" className="w-full p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold tabular-nums" />
              {fieldErrors.sellerAsking && (
                <div className="text-xs font-bold text-rose-700 dark:text-rose-300">{fieldErrors.sellerAsking}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
