import React from 'react';
import type { ComparisonOptionItem, MultiCriteriaRankedResult } from '../services/comparativeDecisionEngine';

interface Props {
  activeOptions: ComparisonOptionItem[];
  highlightedId: string;
  onHighlight: (id: string) => void;
  weights: Record<string, number>;
  onChangeWeight: (id: string, value: number) => void;
  mcdaResults: MultiCriteriaRankedResult[];
  sensitivityNoteFa: string;
}

export const Stage38McdaAndMapSync: React.FC<Props> = ({
  activeOptions,
  highlightedId,
  onHighlight,
  weights,
  onChangeWeight,
  mcdaResults,
  sensitivityNoteFa,
}) => (
  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
    <div data-testid="stage38-mcda-panel" className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs space-y-2.5">
      <div className="font-bold text-white">تحلیل چندمعیاره شفاف (CMP-12 — وزن معیارها با کنترل کاربر)</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { id: 'asking_price_sqm', label: 'اهمیت قیمت پیشنهادی' },
          { id: 'area_sqm', label: 'اهمیت متراژ' },
          { id: 'building_age', label: 'اهمیت سن بنا' },
          { id: 'transit_access', label: 'اهمیت دسترسی مترو' },
        ].map((w) => (
          <label key={w.id} className="rounded border border-slate-800 bg-slate-900 p-2">
            <div className="flex justify-between text-[11px] text-slate-300">
              <span>{w.label}</span>
              <span className="font-mono text-cyan-300">{weights[w.id] ?? 0}٪</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weights[w.id] ?? 0}
              onChange={(e) => onChangeWeight(w.id, Number(e.target.value))}
              className="mt-1 w-full accent-emerald-500"
            />
          </label>
        ))}
      </div>
      <div className="space-y-1.5">
        {mcdaResults.map((r, idx) => (
          <div key={r.optionId} className="rounded border border-slate-800 bg-slate-900/70 px-2.5 py-2">
            <div className="flex items-center justify-between font-bold text-white">
              <span>#{idx + 1} {r.titleFa}</span>
              <span className="font-mono text-emerald-300">{r.weightedScore0To100} / 100</span>
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">{r.computedNoticeFa}</div>
          </div>
        ))}
        <p className="text-[11px] text-amber-300">{sensitivityNoteFa}</p>
      </div>
    </div>

    <div data-testid="stage38-map-sync-panel" className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs space-y-2.5">
      <div className="font-bold text-white">اتصال هم‌زمان جدول به نقشه و نمودار مقایسه (CMP-13 & CMP-14)</div>
      <p className="text-[11px] text-slate-400">
        انتخاب هر گزینه در جدول یا نقشه بدون پاک‌کردن گزینه‌های خارج از قاب، موقعیت مکانی و نمودار میله‌ای با محور صفر را هم‌گام می‌کند:
      </p>
      <div className="space-y-2">
        {activeOptions.map((opt) => {
          const ask = Number(opt.cells.asking_price_sqm?.rawValue ?? 0);
          const pct = Math.min(100, Math.round((ask / 220) * 100));
          const isFocused = highlightedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onHighlight(opt.id)}
              className={`w-full rounded-lg border p-2 text-right ${isFocused ? 'border-cyan-500 bg-cyan-950/30' : 'border-slate-800 bg-slate-900/60'}`}
            >
              <div className="flex justify-between text-[11px] font-bold text-white">
                <span>{opt.titleFa} ({opt.lat.toFixed(3)}, {opt.lng.toFixed(3)})</span>
                <span>{ask} م.ت/متر</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
