import React from 'react';
import { Layers, MapPin, ShieldAlert } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { convertPricePerSqmToUnit, type AreaUnit } from '../../../utils/areaUnit';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState } from '../../../components/mapAdvancedLayers';

export interface MarketMapSyncPanelProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  areaUnit: AreaUnit;
  geoScopeFa: string;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onSyncMapLens?: (lens: 'bubble' | 'heatmap' | 'budget') => void;
  onOpenFullMap: () => void;
}

export const MarketMapSyncPanel: React.FC<MarketMapSyncPanelProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  areaUnit,
  geoScopeFa,
  onSelectNeighborhood,
  onSyncMapLens,
  onOpenFullMap,
}) => {
  const ranked = [...evaluatedNeighborhoods]
    .sort((a, b) => a.buyPerSqm - b.buyPerSqm)
    .slice(0, 6);

  return (
    <section
      aria-label="ارتباط هم‌زمان تحلیل بازار با نقشه"
      className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)]/80 dark:border-slate-800 pb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>همگام‌سازی فضایی با نقشه زنده ({geoScopeFa})</span>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] dark:text-slate-400">
            انتخاب محدوده یا تغییر لایه نقشه بلافاصله هر دو پنل را هم‌سو می‌کند.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onSyncMapLens?.('heatmap')}
            className="px-2.5 py-1 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-700 hover:bg-[var(--color-bg-canvas)] dark:hover:bg-slate-800 font-bold text-[var(--color-text-primary)] dark:text-slate-200 cursor-pointer"
          >
            لنز هیت‌مپ قیمت
          </button>
          <button
            type="button"
            onClick={() => onSyncMapLens?.('bubble')}
            className="px-2.5 py-1 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-700 hover:bg-[var(--color-bg-canvas)] dark:hover:bg-slate-800 font-bold text-[var(--color-text-primary)] dark:text-slate-200 cursor-pointer"
          >
            لنز حباب قیمتی
          </button>
          <button
            type="button"
            onClick={onOpenFullMap}
            className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold flex items-center gap-1 cursor-pointer"
          >
            <MapPin className="w-3 h-3" />
            <span>نقشه تمام‌صفحه</span>
          </button>
        </div>
      </div>

      {/* Explicit Spatial Legend with Sparse / Insufficient Data separation */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-text-secondary)] dark:text-slate-300 bg-[var(--color-bg-canvas)] dark:bg-slate-800/50 p-2.5 rounded-lg border border-[var(--color-border-subtle)]/80 dark:border-slate-800">
        <span className="font-bold text-[var(--color-text-primary)] dark:text-white">راهنمای نقشه:</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-xs bg-[var(--color-brand-600)] inline-block" />متعادل / زیر ارزش</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-xs bg-[#D97706] inline-block" />پرنوسان / نیاز به مذاکره</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-xs bg-[#CBD5E1] dark:bg-slate-600 inline-block" />بدون داده زنده کافی (به‌عنوان ارزان رنگی نمی‌شود)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs tabular-nums">
        {ranked.map((h) => {
          const agg = aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, buildNeighborhoodListingSamples(h));
          const uAsk = convertPricePerSqmToUnit(agg.askingPricePerSqm, areaUnit);
          const isCurrent = h.id === selectedHood.id;
          return (
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelectNeighborhood(h);
                if (h.id !== selectedHood.id) {
                  updateMapAdvancedOverlayState({
                    comparisonArc: { active: true, isPinned: true, hoodA: selectedHood, hoodB: h },
                  });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNeighborhood(h);
                }
              }}
              className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${
                isCurrent
                  ? 'border-[var(--color-brand-600)] bg-[#EAF3F0]/50 dark:bg-emerald-950/20 dark:border-emerald-500'
                  : 'border-[var(--color-border-subtle)] dark:border-slate-800 hover:border-[var(--color-text-primary)] dark:hover:border-slate-600'
              }`}
            >
              <div className="min-w-0">
                <div className="font-bold text-[var(--color-text-primary)] dark:text-white truncate">{h.name}</div>
                <div className="text-xs text-[var(--color-text-muted)] dark:text-slate-400">
                  {agg.observedSampleCount === 0 ? 'مرجع داخلی (۰ آگهی زنده)' : `${toPersianNum(agg.observedSampleCount)} آگهی زنده`}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="font-bold text-[var(--color-text-primary)] dark:text-white">{toPersianNum(uAsk)} م</div>
                {agg.observedSampleCount === 0 && (
                  <ShieldAlert className="w-3 h-3 text-[#94A39B] mr-auto mt-0.5" aria-label="داده محدود" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
