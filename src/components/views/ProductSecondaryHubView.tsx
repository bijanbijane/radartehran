/** @file src/components/views/ProductSecondaryHubView.tsx — Real Services, Knowledge, Contributions & 404 Views */
import React from 'react';
import { Home, Map as MapIcon } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import type { ContributionsSubTabId, KnowledgeSubTabId, ModuleSubTabId } from '../../navigation/registry/route.types';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import type { SuperModuleTabId } from '../FutureSuperModulesModal';
import type { ExpansionModalType } from '../ExpansionModulesModal';
import { ServicesMarketplacePage } from '../../features/services/pages/ServicesMarketplacePage';
import { KnowledgeCenterPage } from '../../features/knowledge/pages/KnowledgeCenterPage';
import { CommunityHubPage } from '../../features/community/pages/CommunityHubPage';

export interface ProductSecondaryHubViewProps {
  viewKind: 'services' | 'knowledge' | 'contributions' | 'not_found';
  activeSubTab?: KnowledgeSubTabId | ContributionsSubTabId;
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
  const unitPrice = convertPricePerSqmToUnit(p.selectedHood.buyPerSqm, areaUnit);
  const fxSample = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, radarLocale)})` : '';

  if (p.viewKind === 'not_found') {
    return (
      <div data-testid="product-not-found-view" className="w-full max-w-3xl mx-auto px-4 py-12 text-center space-y-5 animate-fadeIn">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-xl">
          ۴۰۴
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">مسیر یا صفحه درخواستی یافت نشد</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          نشانی واردشده در ساختار فعلی رادار تهران تعریف نشده یا جابه‌جا شده است. می‌توانید به نقشه تعاملی، صفحه نخست یا لیست محله‌ها بازگردید.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          <button type="button" onClick={() => p.onNavigateView('map')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <MapIcon className="w-4 h-4" /><span>بازگشت به نقشه زنده</span>
          </button>
          <button type="button" onClick={() => p.onNavigateView('home')} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <Home className="w-4 h-4" /><span>صفحه نخست</span>
          </button>
          <button type="button" onClick={() => p.onNavigateView('discover')} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">
            فهرست محله‌ها
          </button>
        </div>
      </div>
    );
  }

  if (p.viewKind === 'services') {
    return (
      <ServicesMarketplacePage
        evaluatedNeighborhoods={p.evaluatedNeighborhoods && p.evaluatedNeighborhoods.length > 0 ? p.evaluatedNeighborhoods : [p.selectedHood]}
        selectedHood={p.selectedHood}
        unitPrice={unitPrice}
        fxSample={fxSample}
        onOpenHedonic={p.onOpenHedonic}
        onOpenListingVerifier={p.onOpenListingVerifier}
        onOpenExpansionModal={p.onOpenExpansionModal}
        onOpenSuperModule={p.onOpenSuperModule}
      />
    );
  }

  if (p.viewKind === 'knowledge') {
    return (
      <KnowledgeCenterPage
        activeSubTab={(p.activeSubTab as KnowledgeSubTabId) || 'reports'}
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
      selectedHood={p.selectedHood}
      evaluatedNeighborhoods={p.evaluatedNeighborhoods}
      onNavigateView={p.onNavigateView}
      onOpenAgencySubmit={p.onOpenAgencySubmit}
      onOpenResidentVoteTab={p.onOpenResidentVoteTab}
      onOpenListingVerifier={p.onOpenListingVerifier}
    />
  );
};
