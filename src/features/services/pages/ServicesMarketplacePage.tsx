/** @file src/features/services/pages/ServicesMarketplacePage.tsx — Stage 21 Real Estate Services Marketplace */
import React, { useEffect, useMemo, useState } from 'react';
import { Award, Briefcase, ClipboardList, PlusCircle } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { SuperModuleTabId } from '../../../components/FutureSuperModulesModal';
import type { ExpansionModalType } from '../../../components/ExpansionModulesModal';
import type { ServicesSubTabId } from '../../../navigation/registry/route.types';
import {
  buildServiceProvidersFromNeighborhoods,
  filterServiceProviders,
  submitServiceDispute,
} from '../services/servicesDirectoryService';
import {
  loadProviderReviews,
  loadProviderSubmissions,
  loadServiceProposals,
  loadServiceRequests,
  submitProviderOnboarding,
  submitServiceProposal,
  submitServiceRequest,
  submitVerifiedProviderReview,
  trackServiceEvent,
  transitionServiceRequestStatus,
  updateServiceProposalStatus,
} from '../services/serviceWorkflowService';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ServiceCanonicalCategory,
  type ServiceCategory,
  type ServiceFilterState,
  type ServiceProviderEntity,
} from '../types/service.types';
import { ServicesDirectoryPanel } from '../components/ServicesDirectoryPanel';
import { ServiceProviderModal } from '../components/ServiceProviderModal';
import { ServiceRequestModal } from '../components/ServiceRequestModal';
import { ServiceRequestWizard } from '../components/ServiceRequestWizard';
import { ServiceRequestsAndProposalsTab } from '../components/ServiceRequestsAndProposalsTab';
import { ServiceProviderPortalTab } from '../components/ServiceProviderPortalTab';

import { useRadarLocale } from '../../../components/AreaUnitToggle';

export interface ServicesMarketplacePageProps {
  activeSubTab?: ServicesSubTabId;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  unitPrice: number;
  fxSample: string;
  onOpenHedonic: () => void;
  onOpenListingVerifier: () => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenSuperModule: (t: SuperModuleTabId) => void;
}

type ServicesPageTab = 'directory' | 'wizard' | 'requests' | 'provider_portal';

function readServicesTabFromUrl(): ServicesPageTab {
  if (typeof window === 'undefined') return 'directory';
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'wizard' || tab === 'requests' || tab === 'provider_portal') return tab;
  return 'directory';
}

function mapSubTabToServiceFilters(subTab?: ServicesSubTabId): {
  canonicalCategory: ServiceCanonicalCategory | 'all';
  category: ServiceCategory;
} {
  if (subTab === 'valuation') return { canonicalCategory: 'valuation', category: 'all' };
  if (subTab === 'consulting') return { canonicalCategory: 'advisory', category: 'all' };
  if (subTab === 'inspection') return { canonicalCategory: 'inspection', category: 'all' };
  if (subTab === 'agencies') return { canonicalCategory: 'all', category: 'brokerage' };
  return { canonicalCategory: 'all', category: 'all' };
}

function extractProviderIdFromPath(pathname: string): string | null {
  const match = /^\/services\/providers\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveServicesParentPath(subTab?: ServicesSubTabId): string {
  if (subTab === 'valuation') return '/services/valuation';
  if (subTab === 'consulting') return '/services/consulting';
  if (subTab === 'inspection') return '/services/inspection';
  if (subTab === 'agencies') return '/services/agencies';
  return '/services';
}

export const ServicesMarketplacePage: React.FC<ServicesMarketplacePageProps> = ({
  activeSubTab,
  evaluatedNeighborhoods,
  selectedHood,
  unitPrice,
  fxSample,
  onOpenHedonic,
  onOpenListingVerifier,
  onOpenExpansionModal,
  onOpenSuperModule,
}) => {
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const [activeTab, setActiveTabState] = useState<ServicesPageTab>(() => readServicesTabFromUrl());

  const setActiveTab = (next: ServicesPageTab) => {
    setActiveTabState(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'directory') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next);
      window.history.pushState(null, '', `${url.pathname}${url.search}`);
    }
  };

  const [filters, setFilters] = useState<ServiceFilterState>(() => {
    const initial = mapSubTabToServiceFilters(activeSubTab);
    return {
      category: initial.category,
      canonicalCategory: initial.canonicalCategory,
      searchQuery: '',
      hoodId: 'all',
      onlyWithDeclaredPhone: false,
      onlyVerifiedTrack: false,
      deliveryMode: 'all',
      sortMode: 'recommended',
      hideSponsored: false,
    };
  });

  useEffect(() => {
    const mapped = mapSubTabToServiceFilters(activeSubTab);
    setFilters((prev) => ({
      ...prev,
      category: mapped.category,
      canonicalCategory: mapped.canonicalCategory,
    }));
  }, [activeSubTab]);

  const [detailProviderId, setDetailProviderId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? extractProviderIdFromPath(window.location.pathname) : null,
  );
  const [requestProvider, setRequestProvider] = useState<ServiceProviderEntity | null>(null);
  const [requests, setRequests] = useState(() => loadServiceRequests());
  const [proposals, setProposals] = useState(() => loadServiceProposals());
  const [reviews, setReviews] = useState(() => loadProviderReviews());
  const [submissions, setSubmissions] = useState(() => loadProviderSubmissions());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setDetailProviderId(extractProviderIdFromPath(window.location.pathname));
      setActiveTabState(readServicesTabFromUrl());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const allProviders = useMemo(
    () =>
      buildServiceProvidersFromNeighborhoods(
        evaluatedNeighborhoods,
        reviews,
        submissions.filter((s) => s.moderationStatus === 'verified'),
      ),
    [evaluatedNeighborhoods, reviews, submissions],
  );

  const detailProvider = useMemo(
    () => (detailProviderId ? allProviders.find((item) => item.identity.id === detailProviderId) || null : null),
    [allProviders, detailProviderId],
  );

  const visibleProviders = useMemo(
    () => filterServiceProviders(allProviders, filters, selectedHood.id),
    [allProviders, filters, selectedHood.id],
  );

  const handleOpenProviderDetail = (provider: ServiceProviderEntity) => {
    trackServiceEvent('service_provider_viewed', { providerId: provider.identity.id });
    setDetailProviderId(provider.identity.id);
    if (typeof window !== 'undefined') {
      const nextUrl = `/services/providers/${encodeURIComponent(provider.identity.id)}`;
      if (window.location.pathname !== nextUrl) {
        window.history.pushState(null, '', nextUrl);
      }
    }
  };

  const handleCloseProviderDetail = () => {
    setDetailProviderId(null);
    if (typeof window !== 'undefined' && extractProviderIdFromPath(window.location.pathname)) {
      window.history.pushState(null, '', resolveServicesParentPath(activeSubTab));
    }
  };

  return (
    <div data-testid="product-services-view" className="w-full max-w-[1320px] mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-[var(--color-border-subtle)] pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-[var(--color-brand-fg)] flex items-center gap-1 mb-1">
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {isEn
                ? `Transparent Real Estate Services Marketplace · ${selectedHood.name}`
                : `بازار شفاف خدمات و متخصصان ملکی · ${selectedHood.name}`}
            </span>
          </span>
          <h1 className="text-2xl sm:text-[28px] font-black leading-[1.35] text-[var(--color-text-primary)]">
            {isEn ? 'Real Estate Specialists, Legal Advisors & Agencies' : 'خدمات تخصصی، حقوقی و دفاتر فعال املاک'}
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 tabular-nums">
            {isEn
              ? `Reference base price in ${selectedHood.name}: ${unitPrice} M${fxSample}`
              : `نرخ پایه مرجع در محله ${selectedHood.name}: ${toPersianNum(unitPrice)} م${fxSample}`}
          </p>
        </div>

        <div role="tablist" aria-label={isEn ? 'Services workflow sections' : 'بخش‌های بازار خدمات'} className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'directory' as const, label: isEn ? 'Directory' : 'دایرکتوری متخصصان', icon: Briefcase },
            { id: 'wizard' as const, label: isEn ? 'New Request' : 'ثبت درخواست ۷ مرحله‌ای', icon: PlusCircle },
            { id: 'requests' as const, label: isEn ? `Requests (${requests.length})` : `درخواست‌ها (${toPersianNum(requests.length)})`, icon: ClipboardList },
            { id: 'provider_portal' as const, label: isEn ? 'Provider Portal' : 'پرتال متخصصان', icon: Award },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                data-testid={`services-tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[9px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition ${
                  activeTab === t.id
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'directory' && (
        <ServicesDirectoryPanel
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          visibleProviders={visibleProviders}
          filters={filters}
          setFilters={setFilters}
          onOpenHedonic={onOpenHedonic}
          onOpenListingVerifier={onOpenListingVerifier}
          onOpenExpansionModal={onOpenExpansionModal}
          onOpenSuperModule={onOpenSuperModule}
          onOpenDetail={handleOpenProviderDetail}
          onRequestQuote={setRequestProvider}
          onSwitchToWizard={() => setActiveTab('wizard')}
        />
      )}

      {activeTab === 'wizard' && (
        <ServiceRequestWizard
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          selectedHood={selectedHood}
          onSubmitWizard={(payload) => {
            const saved = submitServiceRequest({
              providerId: 'marketplace-open',
              providerName: 'درخواست عمومی برای متخصصان منطبق',
              ...payload,
            });
            trackServiceEvent('service_request_submitted', { category: payload.canonicalCategory });
            setRequests((prev) => [saved, ...prev]);
            setActiveTab('requests');
          }}
        />
      )}

      {activeTab === 'requests' && (
        <ServiceRequestsAndProposalsTab
          requests={requests}
          proposals={proposals}
          reviews={reviews}
          onSimulateSampleProposal={(req) => {
            const sample = submitServiceProposal({
              requestId: req.id,
              providerId: req.providerId === 'marketplace-open' ? `sp-${selectedHood.id}` : req.providerId,
              providerName: req.providerName === 'درخواست عمومی برای متخصصان منطبق' ? `دفتر تخصصی ${req.neighborhoodName}` : req.providerName,
              providerVerificationSummaryFa: 'پیشنهاد نمونه آزمایشی (احراز خوداظهار)',
              offeringTitleFa: CANONICAL_CATEGORY_LABELS_FA[req.canonicalCategory],
              priceMode: 'starting_from',
              priceDisplayFa: 'شروع از ۳٫۵ میلیون تومان',
              estimatedAmountMillion: 3.5,
              timelineFa: '۲۴ تا ۴۸ ساعت کاری',
              scopeSummaryFa: `اجرای کامل خدمت در محدوده ${req.neighborhoodName} با گزارش مکتوب`,
              includesFa: 'بازدید اولیه و گزارش کتبی',
              excludesFa: 'هزینه‌های استعلام رسمی',
              status: 'submitted',
            });
            setProposals((prev) => [sample, ...prev]);
            setRequests(loadServiceRequests());
          }}
          onProposalAction={(proposalId, action) => {
            const res = updateServiceProposalStatus(proposalId, action);
            if (res.ok) {
              setProposals(res.proposals);
              setRequests(loadServiceRequests());
              trackServiceEvent('service_proposal_compared', { action });
            }
          }}
          onTransitionRequest={(requestId, status) => {
            const res = transitionServiceRequestStatus(requestId, status);
            if (res.ok) setRequests(loadServiceRequests());
          }}
          onSubmitReview={(payload) => {
            const res = submitVerifiedProviderReview({
              ...payload,
              reviewerUid: 'local-user',
              reviewerLabelFa: 'کاربر تأییدشده درخواست',
              qualityScore: payload.overallScore,
              timelineScore: payload.overallScore,
              transparencyScore: payload.overallScore,
            });
            if (res.ok && res.review) {
              setReviews((prev) => [res.review!, ...prev]);
              trackServiceEvent('service_review_submitted', { score: payload.overallScore });
            }
            return res;
          }}
        />
      )}

      {activeTab === 'provider_portal' && (
        <ServiceProviderPortalTab
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          selectedHood={selectedHood}
          submissions={submissions}
          onSubmitOnboarding={(payload) => {
            const created = submitProviderOnboarding(payload);
            setSubmissions((prev) => [created, ...prev]);
          }}
        />
      )}

      {detailProvider && (
        <ServiceProviderModal
          provider={detailProvider}
          reviews={reviews}
          onClose={handleCloseProviderDetail}
          onOpenRequestModal={(prov) => setRequestProvider(prov)}
          onSubmitDispute={(providerId, reason, details) => {
            submitServiceDispute({ providerId, reason, details });
          }}
        />
      )}

      {requestProvider && (
        <ServiceRequestModal
          provider={requestProvider}
          onClose={() => setRequestProvider(null)}
          onSubmit={(payload) => {
            if (!requestProvider) return;
            const saved = submitServiceRequest({
              providerId: requestProvider.identity.id,
              providerName: requestProvider.identity.displayName,
              serviceId: requestProvider.offerings[0]?.serviceId,
              category: requestProvider.category,
              canonicalCategory: requestProvider.canonicalCategory,
              neighborhoodName: requestProvider.identity.primaryNeighborhoodName,
              ...payload,
            });
            setRequests((prev) => [saved, ...prev]);
            setRequestProvider(null);
            setActiveTab('requests');
          }}
        />
      )}
    </div>
  );
};
