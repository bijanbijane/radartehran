import React from 'react';

export interface MapLoadingStateProps {
  messageFa?: string;
}

export const MapLoadingState: React.FC<MapLoadingStateProps> = ({
  messageFa = 'در حال بارگذاری لایه‌های مکانی رادار تهران...',
}) => {
  return (
    <div
      role="status"
      data-testid="geo-map-loading"
      className="flex items-center justify-center p-6 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300"
      dir="rtl"
    >
      <span>{messageFa}</span>
    </div>
  );
};
