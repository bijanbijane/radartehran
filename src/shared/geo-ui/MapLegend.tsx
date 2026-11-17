import React from 'react';

export interface LegendStop {
  labelFa: string;
  colorHex: string;
}

export interface MapLegendProps {
  titleFa?: string;
  stops?: readonly LegendStop[];
}

const DEFAULT_LEGEND_STOPS: readonly LegendStop[] = [
  { labelFa: 'ارزان‌تر از میانگین منطقه', colorHex: '#10b981' },
  { labelFa: 'متعادل و نزدیک به شاخص', colorHex: '#3b82f6' },
  { labelFa: 'بالاتر از میانگین منطقه', colorHex: '#f59e0b' },
  { labelFa: 'لوکس / اوج قیمتی', colorHex: '#ef4444' },
];

export const MapLegend: React.FC<MapLegendProps> = ({
  titleFa = 'راهنمای طیف قیمت نقشه',
  stops = DEFAULT_LEGEND_STOPS,
}) => {
  return (
    <div
      data-testid="geo-map-legend"
      className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 text-xs text-slate-200 space-y-2"
      dir="rtl"
    >
      <div className="font-semibold text-slate-100">{titleFa}</div>
      <div className="grid grid-cols-2 gap-2">
        {stops.map((stop) => (
          <div key={stop.labelFa} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: stop.colorHex }}
            />
            <span className="truncate">{stop.labelFa}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
