/** @file src/features/valuation/pages/ValuationWorkspacePage.tsx — Stage 20 Complete Structured Valuation Workspace */
import React, { useMemo, useState } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import {
  createDefaultValuationInput,
  createSavedValuationReport,
  evaluateWorkspaceValuation,
  loadSavedValuationReports,
  persistSavedValuationReports,
} from '../services/valuationWorkspaceService';
import type { SavedValuationReport, ValuationWorkspaceInput } from '../types/valuation.types';
import { ValuationInputSteps } from '../components/ValuationInputSteps';
import { ValuationResultsPanel } from '../components/ValuationResultsPanel';
import { ValuationScenarioComparison } from '../components/ValuationScenarioComparison';
import { SavedValuationsPanel } from '../components/SavedValuationsPanel';

export interface ValuationWorkspacePageProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  initialSqm?: number;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenModalCalculator?: () => void;
}

export const ValuationWorkspacePage: React.FC<ValuationWorkspacePageProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  initialSqm,
  onSelectNeighborhood,
  onOpenModalCalculator,
}) => {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [savedReports, setSavedReports] = useState<SavedValuationReport[]>(() => loadSavedValuationReports());
  const [input, setInput] = useState<ValuationWorkspaceInput>(() => {
    if (typeof window !== 'undefined') {
      try {
        const reloadId = window.sessionStorage.getItem('radar_pending_valuation_reload_id');
        if (reloadId) {
          window.sessionStorage.removeItem('radar_pending_valuation_reload_id');
          const matched = loadSavedValuationReports().find((r) => r.id === reloadId);
          if (matched) return matched.input;
        }
      } catch { /* ignore */ }
    }
    return createDefaultValuationInput(selectedHood.id, initialSqm ? { sqm: initialSqm } : {});
  });
  const [copied, setCopied] = useState(false);

  const activeHood = useMemo(
    () => evaluatedNeighborhoods.find((h) => h.id === input.hoodId) || selectedHood,
    [evaluatedNeighborhoods, input.hoodId, selectedHood],
  );

  const result = useMemo(
    () => evaluateWorkspaceValuation(input, activeHood),
    [input, activeHood],
  );

  const handlePatch = (patch: Partial<ValuationWorkspaceInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    const snap = createSavedValuationReport(input, activeHood.name, result);
    if (!snap) return;
    const next = [snap, ...savedReports].slice(0, 25);
    setSavedReports(next);
    persistSavedValuationReports(next);
  };

  const handleCopy = () => {
    if (!result.hedonic) return;
    const h = result.hedonic;
    const txt = [
      `گزارش ارزش‌گذاری ساختاریافته ملک — محله ${h.hoodName}`,
      `مدل: ${result.modelVersion} · متراژ: ${toPersianNum(h.sqm)} متر · ساخت ${toPersianNum(h.buildYear)}`,
      `برآورد مدل (غیررسمی): ${toPersianNum(h.hedonicTotalBillion)} میلیارد تومان (متری ${toPersianNum(h.hedonicPerSqm)} م)`,
      `بازه عدم‌قطعیت (±${toPersianNum(result.uncertainty.bandPercent)}٪): ${toPersianNum((h.sensitivityRangeMillion.min / 1000).toFixed(2))} تا ${toPersianNum((h.sensitivityRangeMillion.max / 1000).toFixed(2))} میلیارد`,
      `فروش فوری (-۱۲٪): ${toPersianNum((h.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد`,
      `تعداد معاملات رسمی ثبت‌شده: ۰ مورد · ${result.validation.labelFa}`,
    ].join('\n');
    navigator.clipboard?.writeText(txt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section className="space-y-4 animate-fadeIn" data-testid="valuation-workspace-page">
      <div className="p-4 sm:p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400">مرحله ۲۰ · ارزش‌گذاری ساختاریافته و شفاف (موتور هدونیک مرجع)</span>
          <h2 className="text-lg sm:text-xl font-black text-[#182522] dark:text-white flex items-center gap-2 mt-0.5">
            <Calculator className="w-5 h-5 text-[#176B63]" />
            <span>میز کار ارزش‌گذاری ملک در {activeHood.name}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setInput(createDefaultValuationInput(selectedHood.id))}
            className="px-3 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 font-bold text-[#48534F] dark:text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ملک جدید</span>
          </button>
          {onOpenModalCalculator && (
            <button
              type="button"
              onClick={onOpenModalCalculator}
              className="px-3 py-1.5 rounded-[8px] bg-[#182522] text-white font-bold cursor-pointer"
            >
              باز کردن خروجی چاپی / PNG
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-6 space-y-4">
          <ValuationInputSteps
            input={input}
            evaluatedNeighborhoods={evaluatedNeighborhoods}
            selectedHood={activeHood}
            completenessPercent={result.completenessPercent}
            onChange={handlePatch}
            onSelectNeighborhood={onSelectNeighborhood}
          />
          {result.scopeSupported && (
            <ValuationScenarioComparison baseInput={input} baseResult={result} hood={activeHood} />
          )}
        </div>
        <div className="lg:col-span-6 lg:sticky lg:top-4">
          <ValuationResultsPanel
            purpose={input.purpose}
            result={result}
            areaUnit={areaUnit}
            intlCurrency={intlCurrency}
            radarLocale={radarLocale}
            copied={copied}
            onCopySummary={handleCopy}
            onSaveSnapshot={handleSave}
            onResetCategoryToResidential={() => handlePatch({ propertyCategory: 'residential_apartment' })}
          />
        </div>
      </div>

      <SavedValuationsPanel
        reports={savedReports}
        onLoadReport={(rep) => {
          setInput(rep.input);
          const found = evaluatedNeighborhoods.find((h) => h.id === rep.input.hoodId);
          if (found) onSelectNeighborhood(found);
        }}
        onDeleteReport={(id) => {
          const next = savedReports.filter((r) => r.id !== id);
          setSavedReports(next);
          persistSavedValuationReports(next);
        }}
      />
    </section>
  );
};
