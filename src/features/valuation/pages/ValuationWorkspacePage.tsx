/** @file src/features/valuation/pages/ValuationWorkspacePage.tsx — Stages 89–96 Multi-City Account-Scoped Valuation Workspace */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { Calculator, RefreshCw } from 'lucide-react';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, type CityId } from '../../../data/multiCityData';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import {
  buildValuationSummaryCopyText,
  createDefaultValuationInput,
  createSavedValuationReport,
  deleteValuationReport,
  evaluateWorkspaceValuation,
  getMyValuationReports,
  loadSavedValuationReports,
  persistSavedValuationReports,
  saveValuationReport,
} from '../services/valuationWorkspaceService';
import type { SavedValuationReport, ValuationWorkspaceInput } from '../types/valuation.types';
import { ValuationInputSteps } from '../components/ValuationInputSteps';
import { ValuationResultsPanel } from '../components/ValuationResultsPanel';
import { ValuationScenarioComparison } from '../components/ValuationScenarioComparison';
import { SavedValuationsPanel } from '../components/SavedValuationsPanel';

export interface ValuationWorkspacePageProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity?: CityId;
  currentUser?: User | null;
  initialSqm?: number;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenModalCalculator?: () => void;
}

export const ValuationWorkspacePage: React.FC<ValuationWorkspacePageProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  activeCity,
  currentUser,
  initialSqm,
  onSelectNeighborhood,
  onOpenModalCalculator,
}) => {
  const resolvedCity: CityId = activeCity ?? resolveCityIdForNeighborhood(selectedHood.id);
  const uid = currentUser?.uid ?? null;
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [savedReports, setSavedReports] = useState<SavedValuationReport[]>(() => loadSavedValuationReports(uid));
  const [statusNoticeFa, setStatusNoticeFa] = useState<string>('');

  const [input, setInput] = useState<ValuationWorkspaceInput>(() => {
    if (typeof window !== 'undefined') {
      try {
        const reloadId = window.sessionStorage.getItem('radar_pending_valuation_reload_id');
        if (reloadId) {
          window.sessionStorage.removeItem('radar_pending_valuation_reload_id');
          const matched = loadSavedValuationReports(uid).find((r) => r.id === reloadId);
          if (matched) return matched.input;
        }
      } catch { /* ignore */ }
    }
    return createDefaultValuationInput(
      selectedHood.id,
      initialSqm ? { sqm: initialSqm, inputOrigins: { sqm: 'user_provided' } as ValuationWorkspaceInput['inputOrigins'] } : {},
      resolvedCity,
    );
  });
  const [copied, setCopied] = useState(false);
  const noticeTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  // Stage 94.3: Ensure selected neighborhood belongs to activeCity when city switches
  useEffect(() => {
    const inCurrentCity = evaluatedNeighborhoods.some((h) => h.id === input.hoodId);
    if (!inCurrentCity && evaluatedNeighborhoods.length > 0) {
      const fallbackHood = evaluatedNeighborhoods.find((h) => h.id === selectedHood.id) || evaluatedNeighborhoods[0];
      setInput((prev) => ({
        ...prev,
        cityId: resolvedCity,
        hoodId: fallbackHood.id,
      }));
    } else if (input.cityId !== resolvedCity) {
      setInput((prev) => ({ ...prev, cityId: resolvedCity }));
    }
  }, [resolvedCity, evaluatedNeighborhoods, input.hoodId, input.cityId, selectedHood.id]);

  // Stage 93.1 & 93.2: Reload scoped reports when user account changes
  useEffect(() => {
    const localScoped = loadSavedValuationReports(uid);
    setSavedReports(localScoped);
    if (!currentUser?.uid) return;
    const ctrl = new AbortController();
    getMyValuationReports(currentUser, ctrl.signal).then((res) => {
      if (res.ok && res.items.length > 0) {
        setSavedReports(res.items);
        persistSavedValuationReports(res.items, uid);
      }
    });
    return () => ctrl.abort();
  }, [currentUser, uid]);

  const activeHood = useMemo(
    () => evaluatedNeighborhoods.find((h) => h.id === input.hoodId) || selectedHood,
    [evaluatedNeighborhoods, input.hoodId, selectedHood],
  );

  const result = useMemo(
    () => evaluateWorkspaceValuation(input, activeHood, resolvedCity),
    [input, activeHood, resolvedCity],
  );

  const handlePatch = (patch: Partial<ValuationWorkspaceInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    const snap = createSavedValuationReport(input, activeHood.name, result, uid);
    if (!snap) return;
    if (currentUser?.uid) {
      const apiRes = await saveValuationReport(snap, currentUser);
      const finalItem: SavedValuationReport = apiRes.ok && apiRes.item
        ? { ...apiRes.item, storageScope: 'account_synced' }
        : { ...snap, storageScope: 'device_local' };
      const next = [finalItem, ...savedReports.filter((r) => r.id !== finalItem.id)].slice(0, 25);
      setSavedReports(next);
      persistSavedValuationReports(next, uid);
      setStatusNoticeFa(
        apiRes.ok
          ? 'گزارش ارزش‌گذاری در حساب کاربری شما ذخیره شد.'
          : 'ارتباط با سرور برقرار نشد؛ گزارش به‌صورت محلی روی این دستگاه ذخیره شد.',
      );
    } else {
      const localItem: SavedValuationReport = { ...snap, storageScope: 'device_local' };
      const next = [localItem, ...savedReports.filter((r) => r.id !== localItem.id)].slice(0, 25);
      setSavedReports(next);
      persistSavedValuationReports(next, null);
      setStatusNoticeFa('گزارش روی این دستگاه ذخیره شد (برای همگام‌سازی ابری وارد حساب شوید).');
    }
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => { noticeTimerRef.current = null; setStatusNoticeFa(''); }, 3800);
  };

  const handleDeleteReport = async (id: string) => {
    const target = savedReports.find((r) => r.id === id);
    if (!target) return;
    if (currentUser?.uid && target.storageScope === 'account_synced') {
      const delRes = await deleteValuationReport(id, currentUser);
      if (!delRes.ok) {
        setStatusNoticeFa(delRes.errorFa || 'حذف گزارش از حساب کاربری انجام نشد؛ آیتم حفظ شد.');
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => { noticeTimerRef.current = null; setStatusNoticeFa(''); }, 3800);
        return;
      }
    }
    const next = savedReports.filter((r) => r.id !== id);
    setSavedReports(next);
    persistSavedValuationReports(next, uid);
  };

  const handleCopy = () => {
    const txt = buildValuationSummaryCopyText({
      input,
      result,
      hoodName: activeHood.name,
      areaUnit,
      intlCurrency,
    });
    if (!txt) return;
    navigator.clipboard?.writeText(txt).catch(() => {});
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => { copyTimerRef.current = null; setCopied(false); }, 2200);
  };

  const cityNameFa = MULTI_CITY_CONFIGS[resolvedCity]?.nameFa || 'تهران';

  return (
    <section className="space-y-4 animate-fadeIn" data-testid="valuation-workspace-page">
      <div className="p-4 sm:p-5 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-[var(--color-brand-fg)]">
            ارزش‌گذاری ساختاریافته و شفاف (موتور هدونیک مرجع · شهر {cityNameFa})
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-2 mt-0.5">
            <Calculator className="w-5 h-5 text-[var(--color-brand-600)]" />
            <span>میز کار ارزش‌گذاری ملک در {activeHood.name}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setInput(createDefaultValuationInput(selectedHood.id, {}, resolvedCity))}
            className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold text-[#48534F] dark:text-[var(--color-text-secondary)] flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ملک جدید</span>
          </button>
          {onOpenModalCalculator && (
            <button
              type="button"
              onClick={onOpenModalCalculator}
              className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer"
            >
              باز کردن خروجی چاپی / PNG
            </button>
          )}
        </div>
      </div>

      {statusNoticeFa && (
        <div className="p-3 rounded-[10px] bg-[#EAF3F0] dark:bg-emerald-950/40 border border-[#B8D7CE] text-xs font-bold text-[var(--color-brand-700)] dark:text-emerald-200">
          {statusNoticeFa}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-6 space-y-4">
          <ValuationInputSteps
            input={input}
            validation={result.inputValidation}
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
        onDeleteReport={handleDeleteReport}
      />
    </section>
  );
};
