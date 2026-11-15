/** @file src/features/onboarding/components/Stage48ComparisonAndInspectionPanel.tsx — Stage 48 Property/Neighborhood/Service Comparison & Observation Checklist */
import React, { useState } from 'react';
import {
  compareNeighborhoodsWeightedTool,
  comparePropertiesDecisionTool,
  compareServiceOffersTool,
  filterByMandatoryAndScorePreferences,
  recordInitialPropertyObservation,
} from '../services/decisionSupportToolsEngine';
import {
  STAGE48_BOUNDARIES_8,
  type DecisionPropertyOption,
  type PropertyObservationStatus,
} from '../services/decisionSupportToolsTypes';
import { STAGE48_SERVICE_OFFERS } from '../services/stage48DecisionToolsFixtures';

const OBSERVATION_STATUSES: PropertyObservationStatus[] = [
  'مشاهده شد',
  'نشانه مشکل وجود دارد',
  'نیازمند بررسی',
  'قابل مشاهده نبود',
  'بررسی نشده',
  'بدون مشاهده مشکل ظاهری',
];

export const Stage48ComparisonAndInspectionPanel: React.FC<{
  section: 'property_hood_compare' | 'service_offers_observation';
  properties: DecisionPropertyOption[];
  isMobileStepMode: boolean;
  onUpdateProperties: (next: DecisionPropertyOption[]) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, properties, isMobileStepMode, onUpdateProperties, onFeedbackFa }) => {
  const [transitWeight, setTransitWeight] = useState<number>(3);
  const [schoolWeight, setSchoolWeight] = useState<number>(4);
  const [mandatoryBudgetM, setMandatoryBudgetM] = useState<number>(22000);
  const [obsStatus, setObsStatus] = useState<PropertyObservationStatus>('نشانه مشکل وجود دارد');
  const [obsNoteFa, setObsNoteFa] = useState<string>('اثر نم و تغییر رنگ در گوشه سقف سرویس بهداشتی');

  const propComparison = comparePropertiesDecisionTool(properties, isMobileStepMode);
  const hoodComparison = compareNeighborhoodsWeightedTool({
    neighborhoods: [
      { hoodId: 'saadat-abad', nameFa: 'سعادت‌آباد', scoresByCriterion: { transit: 8.2, education: 9.0, medical: 8.8 } },
      { hoodId: 'poonak', nameFa: 'پونک', scoresByCriterion: { transit: 8.6, education: 8.4, medical: null } },
      { hoodId: 'pasdaran', nameFa: 'پاسداران', scoresByCriterion: { transit: 8.0, education: 8.9, medical: 8.5 } },
    ],
    weights: { transit: transitWeight, education: schoolWeight, medical: 2 },
  });
  const mandatoryFilterRes = filterByMandatoryAndScorePreferences({
    candidates: [
      { id: 'ملک الف (۲۲٬۸۰۰ م)', priceM: 22800, preferenceScore: 95 },
      { id: 'ملک ب (۲۱٬۵۰۰ م)', priceM: 21500, preferenceScore: 86 },
    ],
    maxMandatoryBudgetM: mandatoryBudgetM,
  });
  const offerSummary = compareServiceOffersTool(STAGE48_SERVICE_OFFERS);
  const recordedObs = recordInitialPropertyObservation({
    titleFa: 'بررسی رطوبت سقف سرویس و آشپزخانه',
    locationFa: 'سرویس بهداشتی اصلی',
    candidateStatus: obsStatus,
    noteFa: obsNoteFa,
  });

  if (section === 'property_hood_compare') {
    return (
      <div className="space-y-3" data-testid="dt-property-hood-compare-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" data-testid="dt-boundaries-strip">
          {STAGE48_BOUNDARIES_8.map((b) => (
            <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="font-bold text-indigo-300">{b.prevStageFa}</div>
              <div className="text-slate-300">{b.diffFa}</div>
            </div>
          ))}
        </div>

        {/* Multi-Property Comparison & Missing Data Guard (DT-15 · Tests 1, 2, 3, 15) */}
        <div className="rounded-xl border border-indigo-500/40 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]" data-testid="dt-property-comparison-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-white">مقایسه چند ملک با تفکیک داده سامانه، ورودی دستی و هزینه کل خرید (DT-15 · Tests 1–3):</span>
              <div className="text-[10px] text-amber-300" data-testid="dt-property-limitation-banner">
                وضعیت نتیجه: <strong>{propComparison.resultStatus}</strong> — {propComparison.limitationMessageFa}
              </div>
            </div>
            <button
              type="button"
              data-testid="dt-toggle-missing-price-btn"
              onClick={() => {
                const toggled = properties.map((p, idx) =>
                  idx === 1
                    ? { ...p, basePriceMillionToman: p.basePriceMillionToman === null ? 21500 : null }
                    : p,
                );
                onUpdateProperties(toggled);
                onFeedbackFa('تغییر وضعیت قیمت ملک دوم اعمال شد (داده گمشده هیچ‌گاه صفر فرض نمی‌شود).');
              }}
              className="rounded bg-indigo-700 px-2.5 py-1 font-bold text-white cursor-pointer"
            >
              {properties[1]?.basePriceMillionToman === null ? 'بازگردانی قیمت ملک دوم' : 'شبیه‌سازی حذف قیمت ملک دوم (Test 3)'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {propComparison.rows.map((row) => (
              <div key={row.propertyId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{row.titleFa}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-indigo-300">{row.sourceBadgeFa}</span>
                </div>
                <div className="text-slate-300 text-[10.5px]">
                  منشأ: <strong>{row.originLabel}</strong> · تاریخ داده: {row.updatedAtFa} · تکمیل اطلاعات: {row.completenessPercent}٪
                </div>
                <div className="text-emerald-300 font-bold tabular-nums">
                  {row.totalOwnershipCostM === null
                    ? 'هزینه کل تملک: غیرقابل محاسبه (قیمت پایه ثبت نشده است)'
                    : `هزینه کل تملک (قیمت + قانونی + کارشناسی + تعمیرات + جابه‌جایی): ${row.totalOwnershipCostM.toLocaleString('fa-IR')} م.ت`}
                </div>
                {row.hasIncompleteRepairData && (
                  <div className="text-[10px] text-amber-300">هشدار داده ناقص (DT-12): هزینه تعمیرات اولیه این ملک هنوز وارد نشده است.</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Weighted Neighborhood Comparison & Mandatory vs Preference Criteria (DT-16, DT-24, DT-25 · Test 4) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="dt-hood-comparison-card">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">مقایسه وزن‌دار محله‌ها (DT-16 · فرمول آشکار):</span>
              <span className="text-[10px] text-indigo-300" dir="ltr">S_j = sum(w_i * x_ij) / sum(w_i)</span>
            </div>
            <div className="flex items-center gap-3 text-[10.5px]">
              <label className="flex items-center gap-1 text-slate-300">
                <span>وزن حمل‌ونقل:</span>
                <input type="number" min={1} max={5} value={transitWeight} onChange={(e) => setTransitWeight(Number(e.target.value) || 1)} className="w-12 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white" />
              </label>
              <label className="flex items-center gap-1 text-slate-300">
                <span>وزن آموزشی:</span>
                <input type="number" min={1} max={5} value={schoolWeight} onChange={(e) => setSchoolWeight(Number(e.target.value) || 1)} className="w-12 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white" />
              </label>
            </div>
            <div className="space-y-1">
              {hoodComparison.map((h) => (
                <div key={h.hoodId} className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 flex items-center justify-between">
                  <span className="font-bold text-white">{h.nameFa} (امتیاز شخصی: {h.compositeScore})</span>
                  <span className="text-[10px] text-slate-400">
                    معیارهای محاسبه‌شده: {h.calculableCriteriaCount}/۳ {h.missingCriteria.length > 0 ? `(ناقص: ${h.missingCriteria.join(', ')} — بدون جایگزینی با صفر)` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2" data-testid="dt-personal-criteria-card">
            <div className="font-bold text-white">تفکیک «شرط الزامی» از «امتیاز ترجیحی» (DT-24 · §14.3):</div>
            <label className="flex items-center justify-between text-slate-300">
              <span>سقف بودجه الزامی (میلیون تومان):</span>
              <input type="number" value={mandatoryBudgetM} onChange={(e) => setMandatoryBudgetM(Number(e.target.value) || 20000)} className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-white" />
            </label>
            <div className="rounded border border-slate-800 bg-slate-900 p-2 text-[10.5px] space-y-1">
              <div className="text-emerald-300">گزینه‌های واجد شرط الزامی: <strong>{mandatoryFilterRes.rankedEligibleIds.join(' ، ') || 'هیچ موردی'}</strong></div>
              <div className="text-amber-300">حذف‌شده به علت عبور از شرط الزامی (حتی با امتیاز ترجیحی ۹۵): <strong>{mandatoryFilterRes.excludedOverBudgetIds.join(' ، ') || 'ندارد'}</strong></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dt-service-offers-observation-panel">
      {/* Service Offer Comparison (DT-17 · Test 5) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]" data-testid="dt-service-offers-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-white">مقایسه پیشنهادهای خدماتی از نظر دامنه کار، مبلغ و زمان (DT-17 · Test 5):</span>
          <span className="text-[10px] text-amber-300">{offerSummary.disclaimerFa}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {STAGE48_SERVICE_OFFERS.map((off) => (
            <div key={off.offerId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 space-y-1 text-[10.5px]">
              <div className="font-bold text-white">{off.providerNameFa}</div>
              <div className="text-emerald-300 font-bold">مبلغ کل: {off.basePriceM + off.extraCostsM} م.ت · زمان: {off.durationDays} روز</div>
              <div className="text-slate-300">موارد تحت پوشش: {off.coveredScopeFa.join('، ')}</div>
              <div className="text-rose-300">خارج از تعهد: {off.excludedScopeFa.join('، ')}</div>
            </div>
          ))}
        </div>
        <div className="rounded border border-indigo-500/30 bg-indigo-950/30 p-2 text-[10.5px] text-indigo-200 flex flex-wrap justify-between gap-2">
          <span>کمترین مبلغ ثبت‌شده: <strong>{offerSummary.cheapestOfferId}</strong></span>
          <span>کامل‌ترین دامنه کار: <strong>{offerSummary.mostCompleteScopeOfferId}</strong></span>
          <span>کوتاه‌ترین زمان: <strong>{offerSummary.shortestDurationOfferId}</strong></span>
        </div>
      </div>

      {/* Initial Property Observation Checklist (DT-18 · Test 11) */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-[11px]" data-testid="dt-observation-checklist-card">
        <div className="font-bold text-white">ابزار بررسی اولیه وضعیت ملک در زمان بازدید (DT-18 · Test 11 — ممنوعیت عبارت «سالم است»):</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select aria-label="وضعیت مشاهده اولیه" data-testid="dt-obs-status-select" value={obsStatus} onChange={(e) => setObsStatus(e.target.value as PropertyObservationStatus)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
            {OBSERVATION_STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          <input aria-label="توضیح مشاهده کاربر" value={obsNoteFa} onChange={(e) => setObsNoteFa(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
        </div>
        <div className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-[10.5px] text-amber-200">
          ثبت‌شده: <strong>{recordedObs.status}</strong> — «{recordedObs.noteFa}» · این خروجی صرفاً گزارش مشاهدات ظاهری کاربر است و گواهی سلامت سازه یا تشخیص قطعی علت فنی محسوب نمی‌شود.
        </div>
      </div>
    </div>
  );
};
