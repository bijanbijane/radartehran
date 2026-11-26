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
import type { NeighborhoodProfileBoundaryEvidence } from '../profile-contract/neighborhoodProfileEvidenceContract';

import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import { toPersianDigits } from '../../../utils/persianBidiFormat';

export interface NeighborhoodIntelligenceProfilePanelProps {
  hood: AnyNeighborhoodInput;
  cityId?: string;
  allNeighborhoods?: readonly AnyNeighborhoodInput[];
  dealPricePerSqm?: number;
  marketMetrics?: AggregatedMarketMetrics | null;
  /** Must come from a read-only backend endpoint returning the ACTIVE, reviewed boundary version. */
  approvedBoundaryEvidence?: NeighborhoodProfileBoundaryEvidence | null;
}

const MARKET_TAB_LABELS_FA: Record<NeighborhoodMarketTabId, string> = {
  sale: 'فروش',
  rent: 'اجاره',
  supply: 'عرضه',
  'price-distribution': 'توزیع قیمت',
  'historical-changes': 'تغییرات تاریخی',
};

export const NeighborhoodIntelligenceProfilePanel: React.FC<NeighborhoodIntelligenceProfilePanelProps> = ({
  hood, cityId = 'tehran', allNeighborhoods = [], dealPricePerSqm, marketMetrics, approvedBoundaryEvidence,
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
      { areaUnit, intlCurrency, locale: radarLocale, marketMetrics, exchangeRateRef: rateState.snapshot, approvedBoundaryEvidence },
    ),
    [hood, allNeighborhoods, cityId, dealPricePerSqm, marketMetrics, approvedBoundaryEvidence, areaUnit, intlCurrency, radarLocale, rateState.snapshot],
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
          <span className="rounded-[6px] bg-[var(--color-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
            بلوغ پرونده: {profile.maturityLabelFa}
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
                  {profile.boundary.areaKm2 === null
                    ? 'مساحت محله: مرز معتبر و بازبینی‌شده برای محاسبه متصل نیست'
                    : `${profile.boundary.areaQuality === 'OFFICIAL_GEOMETRY_DERIVED_APPROXIMATION' ? 'مساحت تقریبی محاسبه‌شده از هندسه رسمی' : 'مساحت تقریبی محاسبه‌شده از هندسه عملیاتی بازبینی‌شده'}: ${toPersianDigits(profile.boundary.areaKm2)} کیلومترمربع`}
                </span>
              </div>
              <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-muted)] leading-6">
                نقاط قوت و چالش‌های محله فقط پس از اتصال به شواهد مکانی، منبع مشخص و بازبینی تحریریه منتشر می‌شوند. در حال حاضر محتوای تأییدشده‌ای برای این بخش متصل نیست.
              </div>
            </div>
          )}

          {activeSection === 'market' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="بخش‌های بازار محله">
                {(['sale', 'rent', 'supply', 'price-distribution', 'historical-changes'] as const).map((tabId) => (
                  <button
                    key={tabId}
                    type="button"
                    role="tab"
                    aria-selected={marketTab === tabId}
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
              {marketTab === 'sale' && (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 space-y-1.5">
                  <div className="font-bold text-[var(--color-text-primary)]">فروش: قیمت پیشنهادی آگهی در برابر مرجع داخلی</div>
                  <p className="text-[var(--color-text-secondary)] leading-6">
                    {profile.quickMetrics.find((metric) => metric.id === 'asking-median')?.title}: {profile.quickMetrics.find((metric) => metric.id === 'asking-median')?.formattedValue ?? '—'}.
                    این عدد فقط وقتی میانه قیمت پیشنهادی است که از نمونه آگهی‌های مشاهده‌شده محاسبه شده باشد؛ معادل قیمت معامله یا ارزش‌گذاری یک ملک نیست.
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">نمونه معتبر: {toPersianDigits(profile.sampleBreakdown.validSampleCount)}</p>
                </div>
              )}
              {marketTab === 'rent' && (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-muted)] leading-6">
                  داده اجاره ماهانه و ودیعه باید از هم جدا بمانند و هر دو منبع و دوره مستقل داشته باشند. سری معتبر اجاره برای این پرونده هنوز متصل نیست.
                </div>
              )}
              {marketTab === 'supply' && (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-secondary)] leading-6">
                  آگهی معتبر مشاهده‌شده: {profile.quickMetrics.find((metric) => metric.id === 'active-supply')?.formattedValue ?? '—'}.
                  این شمارش فقط پوشش منابع مشاهده‌شده را نشان می‌دهد و معادل کل موجودی مسکن محله نیست.
                </div>
              )}
              {marketTab === 'price-distribution' && (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-muted)] leading-6">
                  توزیع قیمت تا زمان وجود رکوردهای یکتای آگهی، واحد پول و متراژ معتبر، قواعد حذف تکرار و کفایت نمونه نمایش داده نمی‌شود.
                </div>
              )}
              {marketTab === 'historical-changes' && (
                <div className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3 text-[var(--color-text-muted)] leading-6">
                  روند تاریخی نیازمند تاریخچه تغییرناپذیر مشاهده‌ها در چند مقطع زمانی است. یک مقدار جاری یا مرجع داخلی به‌تنهایی سری زمانی تولید نمی‌کند.
                </div>
              )}
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
                  disabled={!profile.amenities.some((amenity) => amenity.walkingNetworkMeters !== null)}
                  onClick={() => setDistanceMode('walking_network')}
                  aria-disabled={!profile.amenities.some((amenity) => amenity.walkingNetworkMeters !== null)}
                  className={`min-h-[40px] md:min-h-[32px] rounded-[7px] px-2.5 py-1 font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
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
                <span>تاریخچه تحولات شهری و تغییرات مرز</span>
              </div>
              {profile.historicalTimeline.length === 0 ? (
                <p className="text-[var(--color-text-muted)]">سری زمانی مستند برای تغییرات کالبدی، کاربری یا مرزبندی این محله هنوز متصل نیست. تاریخچه مشارکت کاربران باید در جریان جداگانه نمایش داده شود.</p>
              ) : (
                <div className="space-y-1.5">
                  {profile.historicalTimeline.map((entry, index) => (
                    <div key={`${entry.year}-${index}`} className="leading-6 text-[var(--color-text-secondary)]">
                      <span className="font-bold text-[var(--color-brand-fg)]">{entry.year} · {entry.changeNatureLabelFa}</span> {entry.titleFa} — {entry.descriptionFa}
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
                  ? 'شاخص‌های محیطی مانند آلودگی هوا، نویز، دمای سطح و پوشش سبز باید با ایستگاه یا لایه مکانی، بازه زمانی و روش سنجش مستقل نمایش داده شوند. داده مستند محیطی برای این پرونده هنوز متصل نیست.'
                  : `وضعیت مرز: ${profile.boundary.statusLabelFa}. مرجع: ${profile.boundary.source}. سطح بلوغ پرونده: ${profile.maturityLabelFa}. عدد مساحت فقط در صورت مرز فعال و بازبینی‌شده محاسبه شده است؛ مرز نمایشی نقشه مدرک مساحت رسمی نیست.`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
