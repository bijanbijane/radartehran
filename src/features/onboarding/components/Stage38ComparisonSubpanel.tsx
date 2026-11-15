import React, { useMemo, useState } from 'react';
import {
  COMPARISON_MODE_LIMITS,
  detectBoundaryAndSemanticIncomparability,
  evaluateCompareTrayStatus,
  evaluateMultiCriteriaDecision,
  filterComparisonCriteriaRows,
  generateVerifiableDifferenceClaims,
  type ComparisonMode,
  type MatrixViewMode,
} from '../services/comparativeDecisionEngine';
import { STAGE38_CRITERIA_DEFS, STAGE38_SAMPLE_PROPERTIES } from '../services/stage38ComparisonFixtures';
import { Stage38McdaAndMapSync } from './Stage38McdaAndMapSync';

export const Stage38ComparisonSubpanel: React.FC = () => {
  const [mode, setMode] = useState<ComparisonMode>('property_to_property');
  const [selectedIds, setSelectedIds] = useState<string[]>(['prop-saadat-1', 'prop-punak-2', 'prop-yousef-3']);
  const [matrixViewMode, setMatrixViewMode] = useState<MatrixViewMode>('all');
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<string[]>([
    'asking_price_sqm', 'estimated_value_sqm', 'area_sqm', 'building_age',
  ]);
  const [highlightedId, setHighlightedId] = useState<string>('prop-saadat-1');
  const [inspectedCellKey, setInspectedCellKey] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({
    asking_price_sqm: 40, area_sqm: 25, building_age: 15, transit_access: 20,
  });

  const activeOptions = useMemo(() => STAGE38_SAMPLE_PROPERTIES.filter((p) => selectedIds.includes(p.id)), [selectedIds]);
  const trayStatus = evaluateCompareTrayStatus(mode, activeOptions.length);
  const incompCheck = detectBoundaryAndSemanticIncomparability(activeOptions);
  const visibleCriteria = useMemo(
    () => filterComparisonCriteriaRows({ criteria: STAGE38_CRITERIA_DEFS, options: activeOptions, viewMode: matrixViewMode, selectedCriteriaIds }),
    [activeOptions, matrixViewMode, selectedCriteriaIds],
  );
  const differenceClaims = useMemo(() => generateVerifiableDifferenceClaims(activeOptions, STAGE38_CRITERIA_DEFS), [activeOptions]);
  const mcda = useMemo(
    () => evaluateMultiCriteriaDecision({ options: activeOptions, criteria: STAGE38_CRITERIA_DEFS, weightsPctByCriterion: weights }),
    [activeOptions, weights],
  );

  const toggleOption = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < COMPARISON_MODE_LIMITS[mode].max ? [...prev, id] : prev,
    );
  };

  return (
    <div className="space-y-4" data-testid="stage38-comparison-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۳۸: تجربه مقایسه و تصمیم‌سازی چندمعیاره (RT-UI-COMPARE-001)</h3>
            <p className="mt-1 text-xs text-slate-400">
              تفکیک قیمت آگهی از برآورد مدل، حفظ وضعیت‌های داده مرحله ۳۷، نمایش تفاوت‌های مستند و تحلیل چندمعیاره شفاف بدون «بهترین گزینه» بی‌مبنا
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(COMPARISON_MODE_LIMITS) as ComparisonMode[]).map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`compare-mode-${m}`}
                onClick={() => setMode(m)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                  mode === m ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {COMPARISON_MODE_LIMITS[m].labelFa}
              </button>
            ))}
          </div>
        </div>

        <div data-testid="stage38-compare-tray" className="rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-cyan-300">نوار مقایسه (CMP-02) — وضعیت: {trayStatus.messageFa}</span>
            <div className="flex flex-wrap gap-1.5">
              {STAGE38_SAMPLE_PROPERTIES.map((item) => {
                const active = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`tray-toggle-${item.id}`}
                    onClick={() => toggleOption(item.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
                      active ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}{item.titleFa}
                  </button>
                );
              })}
              {selectedIds.length > 0 && (
                <button type="button" data-testid="tray-clear-btn" onClick={() => setSelectedIds([])} className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                  پاک‌کردن فهرست
                </button>
              )}
            </div>
          </div>
        </div>

        {!trayStatus.canStartComparison ? (
          <div data-testid="stage38-empty-state" className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-xs text-slate-300">
            {trayStatus.messageFa}
          </div>
        ) : (
          <>
            {incompCheck.hasWarning && (
              <div data-testid="stage38-incomparable-warning" className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200 space-y-1">
                <div className="font-bold">هشدار کیفیت و هم‌ارزی داده (اتصال به مرحله ۳۷):</div>
                {incompCheck.warningsFa.map((w) => <div key={w}>⚠ {w}</div>)}
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs space-y-1.5">
              <div className="font-bold text-white">خلاصه تفاوت‌های مستند (CMP-15):</div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                {differenceClaims.map((claim) => <li key={claim.criterionId}>{claim.claimFa}</li>)}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'all', label: 'نمایش تمام معیارها' },
                  { id: 'differences_only', label: 'فقط تفاوت‌ها' },
                  { id: 'selected_criteria', label: 'معیارهای منتخب' },
                ] as const).map((vm) => (
                  <button
                    key={vm.id}
                    type="button"
                    data-testid={`matrix-mode-${vm.id}`}
                    onClick={() => setMatrixViewMode(vm.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      matrixViewMode === vm.id ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'
                    }`}
                  >
                    {vm.label}
                  </button>
                ))}
              </div>
              {matrixViewMode === 'selected_criteria' && (
                <div className="flex flex-wrap gap-1">
                  {STAGE38_CRITERIA_DEFS.map((c) => {
                    const checked = selectedCriteriaIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCriteriaIds((prev) => checked ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                        className={`rounded border px-2 py-0.5 text-[10px] ${checked ? 'border-cyan-500 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
                      >
                        {c.labelFa}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90">
              <table className="w-full min-w-[680px] border-collapse text-right text-xs" data-testid="stage38-matrix-table">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90">
                    <th className="sticky right-0 bg-slate-900 p-2.5 font-bold text-slate-300">معیار مقایسه</th>
                    {activeOptions.map((opt) => (
                      <th key={opt.id} onClick={() => setHighlightedId(opt.id)} className={`p-2.5 cursor-pointer ${highlightedId === opt.id ? 'bg-cyan-950/40 text-cyan-200' : 'text-white'}`}>
                        <div className="font-bold">{opt.titleFa}</div>
                        <div className="text-[10px] font-normal text-slate-400">{opt.locationLabelFa} · {opt.boundaryVersion}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {visibleCriteria.map((criterion) => (
                    <tr key={criterion.id}>
                      <td className="sticky right-0 bg-slate-950 p-2.5 font-semibold text-slate-200">
                        <div>{criterion.labelFa}</div>
                        <div className="text-[10px] font-normal text-slate-400">{criterion.categoryFa}</div>
                      </td>
                      {activeOptions.map((opt) => {
                        const cell = opt.cells[criterion.id];
                        const cellKey = `${opt.id}::${criterion.id}`;
                        const isInspected = inspectedCellKey === cellKey;
                        const statusColor = cell.trustStatus === 'verified' ? 'text-emerald-300' : cell.trustStatus === 'stale' || cell.trustStatus === 'conflicting' ? 'text-amber-300' : 'text-slate-400';
                        return (
                          <td key={opt.id} className="p-2.5 align-top">
                            <button type="button" onClick={() => setInspectedCellKey(isInspected ? null : cellKey)} className="w-full text-right">
                              <div className="font-bold text-white">{cell.displayValueFa}</div>
                              <div className={`mt-0.5 text-[10px] ${statusColor}`}>{cell.sourceLabelFa} · {cell.updatedAtLabelFa}</div>
                              {isInspected && cell.limitationNoteFa && (
                                <div className="mt-1 rounded border border-amber-500/30 bg-amber-950/30 p-1.5 text-[10px] text-amber-200">{cell.limitationNoteFa}</div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Stage38McdaAndMapSync
              activeOptions={activeOptions}
              highlightedId={highlightedId}
              onHighlight={setHighlightedId}
              weights={weights}
              onChangeWeight={(id, val) => setWeights((prev) => ({ ...prev, [id]: val }))}
              mcdaResults={mcda.results}
              sensitivityNoteFa={mcda.sensitivityNoteFa}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default Stage38ComparisonSubpanel;
