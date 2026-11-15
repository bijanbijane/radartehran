/** @file src/features/onboarding/components/Stage55ZoningDensityAndParcelPanel.tsx — Stage 55 Zoning, 3-Way Separation, Constraints & Parcel Comparison */
import React, { useState } from 'react';
import {
  compareTwoParcelsCompliance,
  evaluateThreeWaySeparationAndParcelCompliance,
} from '../services/urbanRegulationEngine';
import {
  STAGE55_BOUNDARIES_9,
  type ParcelRegulationProfile,
  type RegulationConstraintItem,
} from '../services/urbanRegulationTypes';

interface Props {
  section: 'zoning_and_overview' | 'density_and_parcel_compare';
  parcels: ReadonlyArray<ParcelRegulationProfile>;
  constraints: ReadonlyArray<RegulationConstraintItem>;
  onFeedbackFa: (message: string) => void;
}

export const Stage55ZoningDensityAndParcelPanel: React.FC<Props> = ({
  section,
  parcels,
  constraints,
  onFeedbackFa,
}) => {
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[0]?.parcelId ?? 'RT-PAR-REG-101');
  const [hasMunicipalInquiry, setHasMunicipalInquiry] = useState<boolean>(false);
  const [activeConstraintCategory, setActiveConstraintCategory] = useState<string>('همه');
  const [forceSameBasisComparison, setForceSameBasisComparison] = useState<boolean>(false);

  const parcel = parcels.find((p) => p.parcelId === selectedParcelId) ?? parcels[0];
  if (!parcel) return null;

  if (section === 'zoning_and_overview') {
    const verdict = evaluateThreeWaySeparationAndParcelCompliance(parcel, constraints, hasMunicipalInquiry);
    const filteredConstraints =
      activeConstraintCategory === 'همه'
        ? constraints
        : constraints.filter((c) => c.category === activeConstraintCategory);

    return (
      <div className="space-y-4" data-testid="stage55-zoning-overview-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {parcels.map((p) => (
              <button
                key={p.parcelId}
                type="button"
                onClick={() => {
                  setSelectedParcelId(p.parcelId);
                  onFeedbackFa(`پلاک نمونه ${p.parcelId} (${p.neighborhoodNameFa} — پهنه ${p.zoneCode}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                  p.parcelId === parcel.parcelId
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.parcelId} — {p.neighborhoodNameFa} ({p.zoneCode})
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={hasMunicipalInquiry}
              onChange={(e) => setHasMunicipalInquiry(e.target.checked)}
            />
            <span>استعلام رسمی شهرداری ثبت شده است</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3" data-testid="stage55-approved-rule-card">
            <div className="font-bold text-emerald-300 mb-1">۱. ضابطه مصوب (سند مرجع)</div>
            <p className="text-slate-200 leading-5">{verdict.approvedRuleSummaryFa}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3" data-testid="stage55-observed-reality-card">
            <div className="font-bold text-amber-300 mb-1">۲. وضعیت موجود (واقعیت بنا)</div>
            <p className="text-slate-200 leading-5">{verdict.observedRealitySummaryFa}</p>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3" data-testid="stage55-analytical-estimate-card">
            <div className="font-bold text-sky-300 mb-1">۳. برآورد تحلیلی (غیرالزام‌آور)</div>
            <p className="text-slate-200 leading-5">{verdict.analyticalEstimateSummaryFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-indigo-200">
          <strong>تطبیق کاربری مصوب و موجود: </strong>
          {verdict.landUseDivergenceNoteFa}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-cyan-300">دسته‌بندی محدودیت‌های ساختمانی (قرارگیری در حریم ≠ ممنوعیت قطعی)</h4>
              <select
                aria-label="فیلتر دسته محدودیت"
                value={activeConstraintCategory}
                onChange={(e) => setActiveConstraintCategory(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
              >
                <option value="همه">همه دسته‌ها</option>
                <option value="محدودیت‌های کالبدی">کالبدی</option>
                <option value="محدودیت‌های مکانی و زیرساختی">مکانی و زیرساختی</option>
                <option value="محدودیت‌های میراثی و محیطی">میراثی و محیطی</option>
              </select>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {filteredConstraints.map((c) => (
                <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{c.titleFa}</span>
                    <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-300">
                      {c.verificationStatusFa}
                    </span>
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {c.category} • {c.authorityFa} • اعتبار: {c.validUntilFa}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
            <h4 className="font-bold text-cyan-300">یکپارچگی ۹گانه با مراحل رادار تهران</h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {STAGE55_BOUNDARIES_9.map((b) => (
                <div key={b.stageFa} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                  <span className="font-bold text-slate-200">{b.stageFa}: </span>
                  <span className="text-slate-400">{b.relationFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const verdict = evaluateThreeWaySeparationAndParcelCompliance(parcel, constraints, hasMunicipalInquiry);
  const parcelB = parcels[1] ?? parcels[0];
  const comparableB = forceSameBasisComparison
    ? { ...parcelB, calculationBasisFa: parcels[0].calculationBasisFa }
    : parcelB;
  const comparison = compareTwoParcelsCompliance(parcels[0], comparableB);

  return (
    <div className="space-y-4" data-testid="stage55-density-parcel-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <h4 className="font-bold text-cyan-300">نتیجه‌گیری تحلیلی سه‌بخشی و مقایسه تراکم با ذکر مبنای محاسبه ({parcel.parcelId})</h4>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
            <div className="font-bold text-emerald-300 mb-1">اطلاعات تأییدشده</div>
            <ul className="list-disc pr-4 space-y-1 text-slate-200">
              {verdict.confirmedFactsFa.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3">
            <div className="font-bold text-sky-300 mb-1">اطلاعات محاسبه‌شده (فرضی/تحلیلی)</div>
            <ul className="list-disc pr-4 space-y-1 text-slate-200">
              {verdict.calculatedValuesFa.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
            <div className="font-bold text-amber-300 mb-1">اطلاعات نامشخص (نیازمند استعلام)</div>
            <ul className="list-disc pr-4 space-y-1 text-slate-200">
              {verdict.unknownRequiresInquiryFa.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1">
          <div className="font-bold text-rose-300">هشدارهای ضروری ملک</div>
          <ul className="list-disc pr-4 text-rose-200">
            {verdict.warningsFa.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-cyan-300">مقایسه دو قطعه زمین با کنترل هم‌تعریف‌بودن مبنای محاسبه</h4>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forceSameBasisComparison}
              onChange={(e) => {
                setForceSameBasisComparison(e.target.checked);
                onFeedbackFa('حالت هم‌سان‌سازی مبنای محاسبه دو قطعه تغییر یافت.');
              }}
            />
            <span>اعمال مبنای محاسبه یکسان برای مقایسه</span>
          </label>
        </div>
        <div
          className={`rounded-lg border p-3 ${
            comparison.comparable
              ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
              : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
          }`}
          data-testid="stage55-parcel-comparison-verdict"
        >
          {comparison.verdictFa}
        </div>
      </div>
    </div>
  );
};
