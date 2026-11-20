/** @file src/features/onboarding/components/Stage81VacantResidualInfraPrivacyStage82Panel.tsx — Stage 81 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateVacantRlvInfraAndPrivacy } from '../services/urbanLandMarketStage81Engine';
import {
  STAGE81_ACCEPTANCE_TESTS_60,
  STAGE81_REPORT_TYPES_18,
  STAGE82_REGENERATION_PREVIEW_AXES_15,
  type Stage81LandParcelProfile,
} from '../services/urbanLandMarketStage81Types';

interface Props {
  section: 'vacant_sl_rlv' | 'infra_privacy_reports_stage82';
  profile: Stage81LandParcelProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage81VacantResidualInfraPrivacyStage82Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [gdvBillion, setGdvBillion] = useState<number>(300);
  const [cdBillion, setCdBillion] = useState<number>(110);
  const [cfBillion, setCfBillion] = useState<number>(20);
  const [coBillion, setCoBillion] = useState<number>(15);
  const [profitPBillion, setProfitPBillion] = useState<number>(35);
  const [redactPii, setRedactPii] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE81_REPORT_TYPES_18[0]);

  const result = evaluateVacantRlvInfraAndPrivacy(
    profile,
    gdvBillion,
    cdBillion,
    cfBillion,
    coBillion,
    profitPBillion,
    redactPii,
  );

  if (section === 'vacant_sl_rlv') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage81-vacant-rlv-panel">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <label className="flex items-center gap-1.5">
            <span>GDV (م.م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={10}
              max={1000000}
              fallback={300}
              value={gdvBillion}
              onValueChange={setGdvBillion}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>Cd (م.م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={1000000}
              fallback={0}
              value={cdBillion}
              onValueChange={setCdBillion}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>Cf (م.م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={1000000}
              fallback={0}
              value={cfBillion}
              onValueChange={setCfBillion}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>Co (م.م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={1000000}
              fallback={0}
              value={coBillion}
              onValueChange={setCoBillion}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>سود P (م.م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={1000000}
              fallback={0}
              value={profitPBillion}
              onValueChange={setProfitPBillion}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-lime-500/30 bg-lime-950/20 p-3 space-y-1 text-lime-100">
            <div className="font-bold text-lime-300">زمین بایر ≠ پارکینگ/کارگاه ≠ عرصه اکولوژیک</div>
            <p>{result.vacantVsUnderutilizedAndParkGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">سهم زمین (SL) و ارزش باقیمانده زمین (RLV)</div>
            <p>{result.landShareAndRlvFormulaGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage81-privacy-reports-stage82-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPii}
            onChange={(e) => setRedactPii(e.target.checked)}
          />
          <span>حذف PII اشخاص حقیقی و پلاک ثبتی خصوصی از اطلس عمومی و مدل‌های ۳بعدی</span>
        </label>

        <select
          aria-label="گزارش اقتصاد زمین"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ مبنای قیمت و تفکیک ۴ موجودیت آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE81_REPORT_TYPES_18.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-lime-500/30 bg-lime-950/20 p-3 text-lime-100">
        {result.infraCausality3DAndPiiPrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-lime-300">
            آزمونهای پذیرش مرحله ۸۱ ({STAGE81_ACCEPTANCE_TESTS_60.length} آزمون)
          </div>
          {STAGE81_ACCEPTANCE_TESTS_60.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-lime-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۲: RT-UI-URBAN-DEVELOPMENT-REGENERATION-NEIGHBORHOOD-RENEWAL-001
          </div>
          {STAGE82_REGENERATION_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
