import React from 'react';
import { BookOpen, Bookmark, Download, MapPin } from 'lucide-react';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { AppliedMarketFilters, MarketType } from '../types/market.types';
import { getPeriodLabelFa, MARKET_TYPE_CAPABILITIES } from '../filters/MarketFilterDraft';

export interface MarketContextBarProps {
  activeCity: CityId | string;
  selectedHood: EvaluatedNeighborhood;
  appliedFilters: AppliedMarketFilters;
  isEn: boolean;
  onSelectMarketType: (mt: MarketType) => void;
  onSelectTransaction: (tx: 'sale' | 'rent') => void;
  onOpenMethodology: () => void;
  onOpenSaved: () => void;
  onExportCsv: () => void;
  onOpenFullMap: () => void;
}

const MARKET_LABELS: Array<{ id: MarketType; fa: string; en: string }> = [
  { id: 'residential', fa: 'مسکونی', en: 'Residential' },
  { id: 'commercial', fa: 'تجاری', en: 'Commercial' },
  { id: 'office', fa: 'اداری', en: 'Office' },
  { id: 'land', fa: 'زمین', en: 'Land' },
];

export const MarketContextBar: React.FC<MarketContextBarProps> = ({
  activeCity,
  selectedHood,
  appliedFilters,
  isEn,
  onSelectMarketType,
  onSelectTransaction,
  onOpenMethodology,
  onOpenSaved,
  onExportCsv,
  onOpenFullMap,
}) => {
  const cityFa = MULTI_CITY_CONFIGS[activeCity as CityId]?.nameFa || 'تهران';
  const geoText =
    appliedFilters.geoLevel === 'city'
      ? `کل شهر ${cityFa}`
      : appliedFilters.geoLevel === 'zone'
        ? `${appliedFilters.zoneName || selectedHood.zone}`
        : `محله ${selectedHood.name}`;
  const subTypeLabel =
    MARKET_TYPE_CAPABILITIES[appliedFilters.marketType].availableSubTypes.find(
      (s) => s.id === appliedFilters.propertySubType,
    )?.labelFa || 'ملک';

  return (
    <header className="space-y-3 border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400">
            {isEn
              ? 'RT-UI-MARKET-001 · Contextual Market Analysis · Map-Synced'
              : 'مرکز تحلیل بازار املاک · تفکیک قیمت پیشنهادی، برآوردی و معامله · همگام با نقشه'}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#182522] dark:text-white tracking-tight">
            {isEn ? 'Analyze the Real Estate Market with Data' : 'بازار املاک را با داده بررسی کنید'}
          </h1>
          <p className="text-xs text-[#586760] dark:text-slate-400">
            {isEn
              ? 'Compare asking prices, v6.4 negotiation estimates, rent structure, and supply with sample provenance.'
              : 'بررسی وضعیت قیمت پیشنهادی، سناریوی برآوردی معامله، رهن و اجاره، ترکیب عرضه و کیفیت نمونه.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSaved}
            data-testid="market-open-saved-btn"
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-[#F6F8F6] dark:hover:bg-slate-800 text-[11.5px] font-bold text-[#182522] dark:text-slate-200 flex items-center gap-1 cursor-pointer transition"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#176B63] dark:text-emerald-400" />
            <span>{isEn ? 'Saved Views' : 'ذخیره‌شده‌ها'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenMethodology}
            data-testid="market-open-methodology-btn"
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-[#F6F8F6] dark:hover:bg-slate-800 text-[11.5px] font-bold text-[#182522] dark:text-slate-200 flex items-center gap-1 cursor-pointer transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#176B63] dark:text-emerald-400" />
            <span>{isEn ? 'Methodology' : 'روش‌شناسی'}</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            data-testid="market-export-csv-btn"
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-[#F6F8F6] dark:hover:bg-slate-800 text-[11.5px] font-bold text-[#182522] dark:text-slate-200 flex items-center gap-1 cursor-pointer transition"
          >
            <Download className="w-3.5 h-3.5 text-[#586760]" />
            <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenFullMap}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-[#176B63] hover:bg-[#14534E] text-white text-[11.5px] font-bold flex items-center gap-1 cursor-pointer transition"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
          </button>
        </div>
      </div>

      {/* Market Hierarchy + Active Context Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="ساختار نوع بازار" className="inline-flex bg-[#F1F4F2] dark:bg-slate-800 p-0.5 rounded-lg border border-[#DCE3DF] dark:border-slate-700">
            {MARKET_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`market-type-${m.id}`}
                onClick={() => onSelectMarketType(m.id)}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.marketType === m.id
                    ? 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white shadow-2xs'
                    : 'text-[#586760] dark:text-slate-400 hover:text-[#182522] dark:hover:text-white'
                }`}
              >
                {isEn ? m.en : m.fa}
              </button>
            ))}
          </div>

          {appliedFilters.marketType !== 'land' && (
            <div role="group" aria-label="نوع معامله بازار" className="inline-flex bg-[#F1F4F2] dark:bg-slate-800 p-0.5 rounded-lg border border-[#DCE3DF] dark:border-slate-700">
              <button
                type="button"
                data-testid="market-tx-sale"
                onClick={() => onSelectTransaction('sale')}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.transactionType === 'sale'
                    ? 'bg-[#176B63] text-white'
                    : 'text-[#586760] dark:text-slate-400 hover:text-[#182522]'
                }`}
              >
                {isEn ? 'Buy / Sale' : 'فروش'}
              </button>
              <button
                type="button"
                data-testid="market-tx-rent"
                onClick={() => onSelectTransaction('rent')}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.transactionType === 'rent'
                    ? 'bg-[#176B63] text-white'
                    : 'text-[#586760] dark:text-slate-400 hover:text-[#182522]'
                }`}
              >
                {isEn ? 'Rent / Deposit' : 'رهن و اجاره'}
              </button>
            </div>
          )}
        </div>

        {/* Zero-pill active context line */}
        <div
          data-testid="market-active-context-summary"
          className="text-xs text-[#34433E] dark:text-slate-300 font-medium tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="font-bold text-[#182522] dark:text-white">{geoText}</span>
          <span className="text-[#94A39B]">·</span>
          <span>{MARKET_LABELS.find((x) => x.id === appliedFilters.marketType)?.fa} ({subTypeLabel})</span>
          <span className="text-[#94A39B]">·</span>
          <span>{getPeriodLabelFa(appliedFilters.period)}</span>
          <span className="text-[#94A39B]">·</span>
          <span>{appliedFilters.onlyObserved ? 'فقط آگهی‌های زنده' : 'آگهی پالایش‌شده + مرجع'}</span>
        </div>
      </div>
    </header>
  );
};
