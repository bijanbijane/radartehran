/**
 * @file src/shared/search-ui/SearchFilterPanel.tsx
 * @description Unified Search Filter Panel with 400ms numeric debounce, explicit units (never م.ت), and area unit support.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  SEARCH_NUMERIC_FILTER_DEBOUNCE_MS,
  buildStableFilterId,
  type AreaUnit,
  type SearchFilter,
} from '../../platform/search';
import { parseLocalizedNumber } from '../../utils/forms/formInputHelpers';

export interface SearchFilterPanelProps {
  filters: readonly SearchFilter[];
  areaUnit?: AreaUnit;
  cityId?: string;
  debounceMs?: number;
  onAddOrUpdateFilter: (filter: SearchFilter) => void;
  onResetFilters: () => void;
}

export const SearchFilterPanel: React.FC<SearchFilterPanelProps> = ({
  filters,
  areaUnit = 'sqm',
  cityId = 'tehran',
  debounceMs = SEARCH_NUMERIC_FILTER_DEBOUNCE_MS,
  onAddOrUpdateFilter,
  onResetFilters,
}) => {
  const [maxPriceMillion, setMaxPriceMillion] = useState<string>('');
  const [minArea, setMinArea] = useState<string>('');
  const numericTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (numericTimerRef.current) clearTimeout(numericTimerRef.current);
    };
  }, []);

  const scheduleNumericFilter = (filter: SearchFilter) => {
    if (numericTimerRef.current) clearTimeout(numericTimerRef.current);
    numericTimerRef.current = setTimeout(() => {
      onAddOrUpdateFilter(filter);
    }, debounceMs);
  };

  const activeTransaction = filters.find((f) => f.field === 'transactionMode')?.value;

  return (
    <section
      dir="rtl"
      aria-label="پنل فیلترهای جست‌وجو"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-right dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">فیلترهای دقیق</h3>
        <button
          type="button"
          onClick={() => {
            if (numericTimerRef.current) {
              clearTimeout(numericTimerRef.current);
              numericTimerRef.current = null;
            }
            setMaxPriceMillion('');
            setMinArea('');
            onResetFilters();
          }}
          aria-label="بازنشانی فیلترهای این بخش"
          className="min-h-[44px] px-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
        >
          بازنشانی فیلترها ({filters.length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            نوع معامله
          </label>
          <select
            value={typeof activeTransaction === 'string' ? activeTransaction : ''}
            aria-label="فیلتر نوع معامله"
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              onAddOrUpdateFilter({
                id: buildStableFilterId('transactionMode', 'eq'),
                field: 'transactionMode',
                operator: 'eq',
                value: val,
                source: 'user',
                cityScoped: cityId,
              });
            }}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-transparent px-3 text-xs dark:border-slate-700"
          >
            <option value="">همه معاملات (خرید، رهن و اجاره)</option>
            <option value="buy">خرید و فروش قطعی</option>
            <option value="rent">رهن و اجاره</option>
            <option value="rahn_full">رهن کامل</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            سقف بودجه خرید (میلیون تومان)
          </label>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={maxPriceMillion}
            aria-label="سقف بودجه خرید به میلیون تومان"
            placeholder="مثلاً ۱۲۰۰۰ میلیون تومان"
            onChange={(e) => {
              const raw = e.target.value;
              setMaxPriceMillion(raw);
              const num = parseLocalizedNumber(raw);
              if (Number.isFinite(num) && num > 0) {
                scheduleNumericFilter({
                  id: buildStableFilterId('totalPrice', 'lte'),
                  field: 'totalPrice',
                  operator: 'lte',
                  value: num,
                  rawValue: raw,
                  unit: 'million',
                  source: 'user',
                });
              }
            }}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-transparent px-3 font-mono text-xs tabular-nums dark:border-slate-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            حداقل متراژ ({areaUnit === 'sqm' ? 'مترمربع' : 'فوت‌مربع'})
          </label>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={minArea}
            aria-label={`حداقل متراژ به ${areaUnit === 'sqm' ? 'مترمربع' : 'فوت‌مربع'}`}
            placeholder={areaUnit === 'sqm' ? 'مثلاً ۸۵ مترمربع' : 'مثلاً ۹۱۵ فوت‌مربع'}
            onChange={(e) => {
              const raw = e.target.value;
              setMinArea(raw);
              const num = parseLocalizedNumber(raw);
              if (Number.isFinite(num) && num > 0) {
                scheduleNumericFilter({
                  id: buildStableFilterId('area', 'gte'),
                  field: 'area',
                  operator: 'gte',
                  value: num,
                  rawValue: raw,
                  unit: areaUnit,
                  source: 'user',
                });
              }
            }}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-transparent px-3 font-mono text-xs tabular-nums dark:border-slate-700"
          />
        </div>
      </div>
    </section>
  );
};
