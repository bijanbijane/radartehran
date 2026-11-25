/** @file src/components/views/ProductSecondaryHubView.tsx — Real Services, Knowledge, Contributions & 404 Views */
import React from 'react';
import { Home, Map as MapIcon } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, type CityId } from '../../data/multiCityData';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import type { ContributionsSubTabId, KnowledgeSubTabId, ModuleSubTabId, ServicesSubTabId } from '../../navigation/registry/route.types';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import type { SuperModuleTabId } from '../FutureSuperModulesModal';
import type { ExpansionModalType } from '../ExpansionModulesModal';
import { RadarLink } from '../ui/RadarPrimitives';
import { ServicesMarketplacePage } from '../../features/services/pages/ServicesMarketplacePage';
import { KnowledgeCenterPage } from '../../features/knowledge/pages/KnowledgeCenterPage';
import { CommunityHubPage } from '../../features/community/pages/CommunityHubPage';
import { LegalDocumentView } from './LegalDocumentView';

export interface ProductSecondaryHubViewProps {
  viewKind: 'services' | 'knowledge' | 'contributions' | 'not_found';
  activeSubTab?: ServicesSubTabId | KnowledgeSubTabId | ContributionsSubTabId;
  activeCity?: CityId;
  currentUser?: any;
  isVerifiedAdmin?: boolean;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenHedonic: () => void;
  onOpenListingVerifier: () => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenSuperModule: (t: SuperModuleTabId) => void;
  onOpenAgencySubmit: () => void;
  onOpenResidentVoteTab: () => void;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
}

export const ProductSecondaryHubView: React.FC<ProductSecondaryHubViewProps> = (p) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const cityId = p.activeCity || resolveCityIdForNeighborhood(p.selectedHood.id);
  const cityNameFa = MULTI_CITY_CONFIGS[cityId]?.nameFa || 'تهران';
  const unitPrice = Math.round(convertPricePerSqmToUnitRaw(p.selectedHood.buyPerSqm, areaUnit) * 10) / 10;
  const fxSample = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, radarLocale)})` : '';

  if (p.viewKind === 'not_found') {
    return (
      <div data-testid="product-not-found-view" className="w-full max-w-3xl mx-auto px-4 py-12 text-center space-y-5 animate-fadeIn">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] font-bold text-xl">
          ۴۰۴
        </div>
        <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)]">مسیر یا صفحه درخواستی یافت نشد</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
          نشانی واردشده در ساختار فعلی رادار {cityNameFa} تعریف نشده یا جابه‌جا شده است. می‌توانید به نقشه تعاملی، صفحه نخست یا لیست محله‌ها بازگردید.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          <RadarLink href="/map" onNavigate={() => p.onNavigateView('map')} className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-brand-600)] text-white text-xs font-bold gap-1.5">
            <MapIcon className="w-4 h-4" /><span>بازگشت به نقشه زنده</span>
          </RadarLink>
          <RadarLink href="/" onNavigate={() => p.onNavigateView('home')} className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-text-primary)] text-[var(--color-bg-surface)] text-xs font-bold gap-1.5">
            <Home className="w-4 h-4" /><span>صفحه نخست</span>
          </RadarLink>
          <RadarLink href="/areas" onNavigate={() => p.onNavigateView('discover')} className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border-strong)] text-[var(--color-text-primary)] text-xs font-bold">
            فهرست محله‌ها
          </RadarLink>
        </div>
      </div>
    );
  }

  if (p.viewKind === 'services') {
    return (
      <ServicesMarketplacePage
        activeSubTab={p.activeSubTab as ServicesSubTabId | undefined}
        evaluatedNeighborhoods={p.evaluatedNeighborhoods && p.evaluatedNeighborhoods.length > 0 ? p.evaluatedNeighborhoods : [p.selectedHood]}
        selectedHood={p.selectedHood}
        unitPrice={unitPrice}
        fxSample={fxSample}
        onNavigateView={p.onNavigateView}
        onOpenHedonic={p.onOpenHedonic}
        onOpenListingVerifier={p.onOpenListingVerifier}
        onOpenExpansionModal={p.onOpenExpansionModal}
        onOpenSuperModule={p.onOpenSuperModule}
      />
    );
  }

  if (p.viewKind === 'knowledge') {
    if (p.activeSubTab === 'legal_privacy' || p.activeSubTab === 'legal_terms') {
      return (
        <LegalDocumentView
          documentKind={p.activeSubTab === 'legal_terms' ? 'terms' : 'privacy'}
          onNavigateView={p.onNavigateView}
        />
      );
    }
    return (
      <KnowledgeCenterPage
        activeSubTab={(p.activeSubTab as KnowledgeSubTabId) || 'reports'}
        activeCity={cityId}
        currentUser={p.currentUser}
        selectedHood={p.selectedHood}
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        unitPrice={unitPrice}
        fxSample={fxSample}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onNavigateView={p.onNavigateView}
        onOpenPulseModal={p.onOpenPulseModal}
        onOpenSeoDrawer={p.onOpenSeoDrawer}
      />
    );
  }

  return (
    <CommunityHubPage
      activeSubTab={p.activeSubTab as ContributionsSubTabId}
      activeCity={cityId}
      currentUser={p.currentUser}
      isVerifiedAdmin={p.isVerifiedAdmin}
      selectedHood={p.selectedHood}
      evaluatedNeighborhoods={p.evaluatedNeighborhoods}
      onNavigateView={p.onNavigateView}
      onOpenAgencySubmit={p.onOpenAgencySubmit}
      onOpenResidentVoteTab={p.onOpenResidentVoteTab}
      onOpenListingVerifier={p.onOpenListingVerifier}
    />
  );
};
