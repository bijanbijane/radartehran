/** @file src/features/neighborhoods/components/NeighborhoodIntelligenceProfilePanel.tsx — Clean Petroleum-Themed Neighborhood Profile Panel (F-02) */
import React, { useMemo, useState } from 'react';
import { FileText, MapPin, Layers, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import {
  buildNeighborhoodIntelligenceProfile,
  NEIGHBORHOOD_SECTION_NAV_8,
  type AccessibilityDistanceMode,
  type AnyNeighborhoodInput,
  type NeighborhoodInternalSectionId,
  type NeighborhoodMarketTabId,
} from '../services/neighborhoodProfileEngine';
import type { AggregatedMarketMetrics } from '../../../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import { toPersianDigits } from '../../../utils/persianBidiFormat';

export interface NeighborhoodIntelligenceProfilePanelProps {
  hood: AnyNeighborhoodInput;
  cityId?: string;
  allNeighborhoods?: readonly AnyNeighborhoodInput[];
  dealPricePerSqm?: number;
  marketMetrics?: AggregatedMarketMetrics | null;
}

const MARKET_TAB_LABELS_FA: Record<NeighborhoodMarketTabId, string> = {
  sale: 'فروش',
  rent: 'اجاره',
  supply: 'عرضه',
  'price-distribution': 'توزیع قیمت',
  'historical-changes': 'تغییرات تاریخی',
};

export const NeighborhoodIntelligenceProfilePanel: React.FC<NeighborhoodIntelligenceProfilePanelProps> = ({
  hood, cityId = 'tehran', allNeighborhoods = [], dealPricePerSqm, marketMetrics,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<NeighborhoodInternalSectionId>('overview');
  const [marketTab, setMarketTab] = useState<NeighborhoodMarketTabId>('sale');
  const [distanceMode, setDistanceMode] = useState<AccessibilityDistanceMode>('direct_distance');

  const profile = useMemo(
    () => buildNeighborhoodIntelligenceProfile(
      hood,
      allNeighborhoods.length ? allNeighborhoods : [hood],
      cityId,
      dealPricePerSqm,
      { areaUnit, intlCurrency, locale: radarLocale, marketMetrics, exchangeRateRef: rateState.snapshot },
    ),
    [hood, allNeighborhoods, cityId, dealPricePerSqm, marketMetrics, areaUnit, intlCurrency, radarLocale, rateState.snapshot],
  );

  return (
    <div
      className="mt-3 rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 shadow-xs"
      dir="rtl"
      data-testid="neighborhood-intelligence-profile-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--color-brand-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-brand-fg)]">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>شناسنامه جامع محله</span>
          </span>
          <span className="rounded-[6px] bg-[var(--color-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
            {profile.boundary.statusLabelFa}
          </span>
          <span className="rounded-[6px] bg-[var(--color-success-bg)] px-2.5 py-1 text-xs font-bold text-[var(--color-success)]">
            پوشش داده: {profile.maturityLabelFa}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          data-testid="toggle-neighborhood-dossier-btn"
          className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[36px] rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
        >
          <span>{isOpen ? 'بستن شناسنامه تکمیلی' : 'مشاهده شناسنامه تکمیلی محله'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4 border-t border-[var(--color-border-subtle)] pt-4">
          {profile.cityMismatchWarningFa && (
            <div className="flex items-center gap-2 rounded-[8px] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning)]">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{profile.cityMismatchWarningFa}</span>
            </div>
          )}

          <div
            className="flex flex-wrap items-center gap-1.5 rounded-[10px] bg-[var(--color-bg-muted)] p-1.5"
            role="tablist"
            aria-label="بخش‌های شناسنامه محله"
          >
            {NEIGHBORHOOD_SECTION_NAV_8.map((sec) => (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={activeSection === sec.id}
                onClick={() => setActiveSection(sec.id)}
                data-testid={`nbh-section-tab-${sec.id}`}
                className={`min-h-[44px] md:min-h-[34px] rounded-[7px] px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                  activeSection === sec.id
                    ? 'bg-[var(--color-brand-600)] text-white shadow-xs'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]'
                }`}
              >
                {sec.labelFa}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {profile.quickMetrics.map((m) => (
              <div
                key={m.id}
                data-testid={`nbh-metric-${m.id}`}
                className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3"
              >
                <div className="flex items-center justify-between gap-1 text-xs text-[var(--color-text-muted)]">
                  <span>{m.title}</span>
                  <span className="rounded bg-[var(--color-bg-muted)] px-1.5 py-0.5 text-xs font-semibold">{m.dataQuality}</span>
                </div>
                <div className="mt-1.5 text-sm font-bold text-[var(--color-text-primary)] tabular-nums">
                  {toPersianDigits(m.formattedValue)}{' '}
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">{m.unit}</span>
                </div>
                {m.comparisonLabel && (
                  <p className="mt-1 text-xs font-semibold text-[var(--color-brand-fg)]">{m.comparisonLabel}</p>
                )}
                {m.zeroVsNullNote && (
                  <p className="mt-1 text-xs text-[var(--color-warning)]">{m.zeroVsNullNote}</p>
                )}
              </div>
            ))}
          </div>

          {activeSection === 'overview' && (
            <div className="space-y-3 text-xs text-[var(--color-text-secondary)]">
              <p className="leading-6 font-medium text-[var(--color-text-primary)]">{profile.content.summary}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-[6px] bg-[var(--color-bg-muted)] px-2.5 py-1">
                  برآورد هندسی تقریبی مساحت محدوده: {toPersianDigits(profile.boundary.areaKm2)} کیلومترمربع
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-success-bg)]/50 p-3">
                  <div className="font-bold text-[var(--color-success)] mb-1.5">نقاط قوت شاخص</div>
                  <ul className="list-disc list-inside space-y-1 leading-6">
                    {profile.content.strengths.map((s, idx) => <li key={idx}>{s}</li>)}
                  </ul>
                </div>
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-warning-bg)]/50 p-3">
                  <div className="font-bold text-[var(--color-warning)] mb-1.5">چالش‌ها و محدودیت‌های محله</div>
                  <ul className="list-disc list-inside space-y-1 leading-6">
                    {profile.content.challenges.map((c, idx) => <li key={idx}>{c}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'market' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['sale', 'rent', 'supply', 'price-distribution', 'historical-changes'] as const).map((tabId) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setMarketTab(tabId)}
                    className={`min-h-[40px] md:min-h-[32px] rounded-[7px] px-2.5 py-1 text-xs font-bold cursor-pointer ${
                      marketTab === tabId
                        ? 'bg-[var(--color-brand-600)] text-white'
                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {MARKET_TAB_LABELS_FA[tabId]}
                  </button>
                ))}
              </div>
              {profile.marketSampleWarningFa && (
                <div className="flex items-center gap-2 rounded-[8px] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning)]">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{profile.marketSampleWarningFa}</span>
                </div>
              )}
              <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 space-y-1.5">
                <div className="font-bold text-[var(--color-text-primary)]">
                  تحلیل بخش «{MARKET_TAB_LABELS_FA[marketTab]}» — تفکیک از ارزش‌گذاری تک‌ملک
                </div>
                <p className="text-[var(--color-text-secondary)] leading-6">
                  شاخص پایه محله ({formatMillionTomanAsIntlCurrency(Math.round(convertPricePerSqmToUnitRaw(hood.buyPerSqm, areaUnit) * 10) / 10, 'IRT', radarLocale)}
                  {intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnitRaw(hood.buyPerSqm, areaUnit), intlCurrency, radarLocale, rateState.snapshot)}` : ''} بر {areaUnit === 'sqft' ? 'فوت مربع' : 'مترمربع'}) معیار مکانی است و جایگزین ارزش‌گذاری هدونیک تک‌ملک نمی‌شود.
                </p>
                <div className="text-xs text-[var(--color-text-muted)] pt-1 tabular-nums">
                  نمونه‌های ارزیابی‌شده: ورودی خام {toPersianDigits(profile.sampleBreakdown.rawInputCount)} · مشاهده‌شده {toPersianDigits(profile.sampleBreakdown.observedSampleCount)} · معتبر {toPersianDigits(profile.sampleBreakdown.validSampleCount)}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'physical' && (
            <div className="space-y-3 text-xs">
              <div className="font-bold text-[var(--color-text-primary)]">{profile.landUseDenominatorLabelFa}</div>
              {profile.landUseShares.length === 0 ? (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-muted)]">
                  داده رسمی تفکیک کاربری اراضی برای این محدوده ثبت نشده است.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {profile.landUseShares.map((item) => (
                    <div key={item.id} className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-2.5">
                      <div className="font-bold text-[var(--color-text-primary)]">{item.labelFa}</div>
                      <div className="text-sm font-bold text-[var(--color-brand-fg)] tabular-nums mt-0.5">{toPersianDigits(item.sharePercent)}٪</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                        <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>لایه: {item.layerId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'amenities' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--color-text-primary)]">معیار فاصله:</span>
                <button
                  type="button"
                  onClick={() => setDistanceMode('direct_distance')}
                  className={`min-h-[40px] md:min-h-[32px] rounded-[7px] px-2.5 py-1 font-bold cursor-pointer ${
                    distanceMode === 'direct_distance' ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  فاصله مستقیم
                </button>
                <button
                  type="button"
                  onClick={() => setDistanceMode('walking_network')}
                  className={`min-h-[40px] md:min-h-[32px] rounded-[7px] px-2.5 py-1 font-bold cursor-pointer ${
                    distanceMode === 'walking_network' ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  مسیر پیاده
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {profile.amenities.map((am) => {
                  const val = distanceMode === 'direct_distance' ? am.nearestDirectMeters : am.walkingNetworkMeters;
                  return (
                    <div key={am.categoryId} className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3">
                      <div className="font-bold text-[var(--color-text-primary)]">{am.categoryTitleFa}</div>
                      <div className="text-[var(--color-text-secondary)] mt-1 tabular-nums">
                        فاصله ({distanceMode === 'direct_distance' ? 'مستقیم' : 'پیاده'}):{' '}
                        <strong className="text-[var(--color-text-primary)]">{val !== null ? `${toPersianDigits(val)} متر` : 'ثبت‌نشده'}</strong>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-1">{am.coverageStatusFa}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'compare' && (
            <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3.5 space-y-2 text-xs">
              <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>محله‌های مجاور و هم‌سطح برای مقایسه</span>
              </div>
              {profile.nearbyNeighborhoods.length === 0 ? (
                <p className="text-[var(--color-text-muted)]">محله مقایسه‌ای در شعاع مکانی یافت نشد.</p>
              ) : (
                <div className="space-y-1.5">
                  {profile.nearbyNeighborhoods.map((rel) => (
                    <div key={rel.id} className="flex items-center justify-between py-1 border-b border-[var(--color-border-subtle)] last:border-b-0">
                      <span className="font-semibold text-[var(--color-text-primary)]">{rel.name}</span>
                      <span className="text-[var(--color-text-muted)] tabular-nums">{rel.relationBadgeFa} ({toPersianDigits(rel.distanceKm)} کیلومتر)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'history' && (
            <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3.5 space-y-2 text-xs">
              <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>رویدادها و مشارکت‌های تأییدشده ساکنان</span>
              </div>
              {profile.contributions.length === 0 ? (
                <p className="text-[var(--color-text-muted)]">مشارکت یا رویداد تأییدشده‌ای برای این محله ثبت نشده است.</p>
              ) : (
                <div className="space-y-1.5">
                  {profile.contributions.map((c) => (
                    <div key={c.id} className="leading-6 text-[var(--color-text-secondary)]">
                      <span className="font-bold text-[var(--color-brand-fg)]">[{c.streamLabelFa}]</span> {c.textFa}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeSection === 'environment' || activeSection === 'sources') && (
            <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3.5 space-y-2 text-xs">
              <div className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>{activeSection === 'environment' ? 'محیط زیست، آرامش و ویژگی‌های محله' : 'منابع داده و محدودیت‌های محاسبه'}</span>
              </div>
              <p className="text-[var(--color-text-secondary)] leading-6">
                {activeSection === 'environment'
                  ? profile.content.summary
                  : `پوشش محدوده: ${profile.boundary.statusLabelFa} · وضعیت بلوغ پرونده: ${profile.maturityLabelFa}. داده‌های قیمت بر پایه آگهی‌های مشاهده‌شده و پروفایل مرجع تفکیک شده‌اند و جایگزین استعلام ثبتی نیستند.`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
