import React from 'react';

export interface MapControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetTehran: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetTehran,
}) => {
  return (
    <div
      data-testid="geo-map-controls"
      className="flex flex-col gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1.5 text-slate-100"
      dir="rtl"
    >
      <button
        type="button"
        aria-label="بزرگ‌نمایی نقشه"
        onClick={onZoomIn}
        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm"
      >
        +
      </button>
      <span className="text-[11px] text-center text-slate-400 font-mono">{zoom}</span>
      <button
        type="button"
        aria-label="کوچک‌نمایی نقشه"
        onClick={onZoomOut}
        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold text-sm"
      >
        -
      </button>
      <button
        type="button"
        aria-label="بازگشت به نمای کلانشهر تهران"
        onClick={onResetTehran}
        className="px-2 py-1 rounded-lg bg-[var(--color-brand-600)]/20 text-emerald-300 hover:bg-[var(--color-brand-600)]/30 text-[10px] font-semibold"
      >
        تهران
      </button>
    </div>
  );
};
