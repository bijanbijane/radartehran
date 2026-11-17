import React from 'react';

export interface MapErrorStateProps {
  messageFa?: string;
  tileDegraded?: boolean;
  onRetry?: () => void;
}

export const MapErrorState: React.FC<MapErrorStateProps> = ({
  messageFa = 'اختلال در بارگذاری کاشی‌های نقشه شناسایی شد.',
  tileDegraded = false,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      data-testid="geo-map-error"
      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-950/90 border border-amber-500/40 text-xs text-amber-100"
      dir="rtl"
    >
      <div>
        <span className="font-semibold">{messageFa}</span>
        {tileDegraded && (
          <span className="mr-1 text-amber-300">
            (سوییچ خودکار به سرور کاشی پشتیبان انجام شد)
          </span>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
        >
          تلاش مجدد
        </button>
      )}
    </div>
  );
};
