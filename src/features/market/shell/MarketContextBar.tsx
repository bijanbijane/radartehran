import React from 'react';
import { BookOpen, Bookmark, Download, MapPin, TrendingUp } from 'lucide-react';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { AppliedMarketFilters, MarketType } from '../types/market.types';
import { getPeriodLabelFa, MARKET_TYPE_CAPABILITIES } from '../filters/MarketFilterDraft';
import { RadarLink } from '../../../components/ui/RadarPrimitives';

export interface MarketContextBarProps {
  activeCity: CityId | string;
  selectedHood: EvaluatedNeighborhood;
  appliedFilters: AppliedMarketFilters;
  isEn: boolean;
  pulseSummaryFa?: string;
  onOpenPulseModal?: () => void;
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
  pulseSummaryFa,
  onOpenPulseModal,
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
    <header className="space-y-3 border-b border-[var(--color-border-subtle)] pb-3">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-[var(--color-brand-fg)]">
            {isEn
              ? 'Contextual Market Analysis · Map-Synced'
              : 'مرکز تحلیل بازار املاک · تفکیک قیمت پیشنهادی، برآوردی و معامله'}
          </div>
          <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)] tracking-tight">
            {isEn ? 'Analyze the Real Estate Market with Data' : 'بازار املاک را با داده بررسی کنید'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {isEn
              ? 'Compare asking prices, estimated deal benchmarks, rent structure, and supply with sample provenance.'
              : 'بررسی وضعیت قیمت پیشنهادی، برآورد معامله، رهن و اجاره، ترکیب عرضه و کیفیت نمونه.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSaved}
            data-testid="market-open-saved-btn"
            className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer transition"
          >
            <Bookmark className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />
            <span>{isEn ? 'Saved Views' : 'ذخیره‌شده‌ها'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenMethodology}
            data-testid="market-open-methodology-btn"
            className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />
            <span>{isEn ? 'Methodology' : 'روش‌شناسی'}</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            data-testid="market-export-csv-btn"
            className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] text-xs font-bold text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer transition"
          >
            <Download className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
          </button>
          <RadarLink
            href="/map"
            onNavigate={onOpenFullMap}
            className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold gap-1 transition"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
          </RadarLink>
        </div>
      </div>

      {/* Market Hierarchy + Active Context Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="ساختار نوع بازار" className="inline-flex bg-[var(--color-bg-muted)] p-0.5 rounded-lg border border-[var(--color-border-subtle)]">
            {MARKET_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`market-type-${m.id}`}
                onClick={() => onSelectMarketType(m.id)}
                className={`min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.marketType === m.id
                    ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {isEn ? m.en : m.fa}
              </button>
            ))}
          </div>

          {appliedFilters.marketType !== 'land' && (
            <div role="group" aria-label="نوع معامله بازار" className="inline-flex bg-[var(--color-bg-muted)] p-0.5 rounded-lg border border-[var(--color-border-subtle)]">
              <button
                type="button"
                data-testid="market-tx-sale"
                onClick={() => onSelectTransaction('sale')}
                className={`min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.transactionType === 'sale'
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {isEn ? 'Buy / Sale' : 'فروش'}
              </button>
              <button
                type="button"
                data-testid="market-tx-rent"
                onClick={() => onSelectTransaction('rent')}
                className={`min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  appliedFilters.transactionType === 'rent'
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {isEn ? 'Rent / Deposit' : 'رهن و اجاره'}
              </button>
            </div>
          )}
        </div>

        {/* Zero-pill active context line + inline macro pulse trigger */}
        <div
          data-testid="market-active-context-summary"
          className="text-xs text-[var(--color-text-secondary)] font-medium tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="font-bold text-[var(--color-text-primary)]">{isEn ? `Scope: ${geoText}` : `دامنه تحلیل: ${geoText}`}</span>
          {appliedFilters.geoLevel !== 'neighborhood' && (
            <>
              <span className="text-[var(--color-text-muted)]" aria-hidden="true">·</span>
              <span>{isEn ? `Active focus: ${selectedHood.name}` : `محله کانونی: ${selectedHood.name}`}</span>
            </>
          )}
          <span className="text-[var(--color-text-muted)]" aria-hidden="true">·</span>
          <span>{MARKET_LABELS.find((x) => x.id === appliedFilters.marketType)?.fa} ({subTypeLabel})</span>
          <span className="text-[var(--color-text-muted)]" aria-hidden="true">·</span>
          <span>{getPeriodLabelFa(appliedFilters.period)}</span>
          {pulseSummaryFa && (
            <>
              <span className="text-[var(--color-text-muted)]" aria-hidden="true">·</span>
              <span>{pulseSummaryFa}</span>
            </>
          )}
          {onOpenPulseModal && (
            <button
              type="button"
              onClick={onOpenPulseModal}
              className="text-[var(--color-brand-fg)] font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isEn ? 'Live Pulse' : 'نبض زنده'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
