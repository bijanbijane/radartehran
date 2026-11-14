import React from 'react';
import { AlertTriangle, Table } from 'lucide-react';
import type { MarketIndicatorStatus } from '../types/market.types';
import { INDICATOR_STATUS_LABELS_FA } from '../indicators/IndicatorRegistry';

export interface ChartTableColumn {
  key: string;
  headerFa: string;
}

export interface ChartAccessibleFrameProps {
  titleFa: string;
  unitLabelFa: string;
  provenanceLineFa: string;
  status: MarketIndicatorStatus;
  emptyReasonFa?: string;
  errorFa?: string | null;
  onRetry?: () => void;
  tableColumns: ChartTableColumn[];
  tableRows: Array<Record<string, string | number>>;
  children: React.ReactNode;
}

export const ChartAccessibleFrame: React.FC<ChartAccessibleFrameProps> = ({
  titleFa,
  unitLabelFa,
  provenanceLineFa,
  status,
  emptyReasonFa,
  errorFa,
  onRetry,
  tableColumns,
  tableRows,
  children,
}) => {
  const hasRows = tableRows.length > 0;

  return (
    <section className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#DCE3DF]/80 dark:border-slate-800 pb-2.5">
        <div>
          <h3 className="text-sm font-black text-[#182522] dark:text-white">{titleFa}</h3>
          <p className="text-[11px] text-[#586760] dark:text-slate-400 mt-0.5 tabular-nums">
            واحد: {unitLabelFa} · {provenanceLineFa} · {INDICATOR_STATUS_LABELS_FA[status]}
          </p>
        </div>
      </div>

      {errorFa ? (
        <div className="p-4 rounded-lg bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-xs text-[#875000] dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorFa}</span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-[#F4D3A1] text-xs font-bold cursor-pointer"
            >
              تلاش مجدد
            </button>
          )}
        </div>
      ) : status === 'unavailable' || !hasRows ? (
        <div className="py-8 px-4 text-center text-xs text-[#586760] dark:text-slate-400 bg-[#F6F8F6] dark:bg-slate-800/40 rounded-lg border border-dashed border-[#C5D0CA] dark:border-slate-700">
          {emptyReasonFa || 'برای این ترکیب از نوع بازار و فیلترها، داده معتبر کافی در دسترس نیست.'}
        </div>
      ) : (
        <>
          <div className="w-full">{children}</div>
          <details className="pt-1 border-t border-[#DCE3DF]/70 dark:border-slate-800 text-xs">
            <summary className="cursor-pointer font-bold text-[#176B63] dark:text-emerald-400 inline-flex items-center gap-1.5 py-1 select-none">
              <Table className="w-3.5 h-3.5" aria-hidden="true" />
              <span>مشاهده جدول دسترس‌پذیر داده‌ها ({tableRows.length} ردیف)</span>
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11px] border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-[#DCE3DF] dark:border-slate-700 text-[#586760] dark:text-slate-400">
                    {tableColumns.map((col) => (
                      <th key={col.key} className="text-right py-1.5 px-2 font-bold">
                        {col.headerFa}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-[#DCE3DF]/60 dark:border-slate-800">
                      {tableColumns.map((col) => (
                        <td key={col.key} className="py-1.5 px-2 text-[#182522] dark:text-slate-200">
                          {row[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
};
