/** @file src/features/services/pages/ServicesMarketplacePage.tsx — Stage 21 Real Estate Services Marketplace */
import React, { useMemo, useState } from 'react';
import { Award, Briefcase, ClipboardList, PlusCircle } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { SuperModuleTabId } from '../../../components/FutureSuperModulesModal';
import type { ExpansionModalType } from '../../../components/ExpansionModulesModal';
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
  type ServiceFilterState,
  type ServiceProviderEntity,
} from '../types/service.types';
import { ServicesDirectoryPanel } from '../components/ServicesDirectoryPanel';
import { ServiceProviderModal } from '../components/ServiceProviderModal';
import { ServiceRequestModal } from '../components/ServiceRequestModal';
import { ServiceRequestWizard } from '../components/ServiceRequestWizard';
import { ServiceRequestsAndProposalsTab } from '../components/ServiceRequestsAndProposalsTab';
import { ServiceProviderPortalTab } from '../components/ServiceProviderPortalTab';

export interface ServicesMarketplacePageProps {
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

export const ServicesMarketplacePage: React.FC<ServicesMarketplacePageProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  unitPrice,
  fxSample,
  onOpenHedonic,
  onOpenListingVerifier,
  onOpenExpansionModal,
  onOpenSuperModule,
}) => {
  const [activeTab, setActiveTab] = useState<ServicesPageTab>('directory');
  const [filters, setFilters] = useState<ServiceFilterState>({
    category: 'all',
    canonicalCategory: 'all',
    searchQuery: '',
    hoodId: 'all',
    onlyWithDeclaredPhone: false,
    onlyVerifiedTrack: false,
    deliveryMode: 'all',
    sortMode: 'recommended',
    hideSponsored: false,
  });
  const [detailProvider, setDetailProvider] = useState<ServiceProviderEntity | null>(null);
  const [requestProvider, setRequestProvider] = useState<ServiceProviderEntity | null>(null);
  const [requests, setRequests] = useState(() => loadServiceRequests());
  const [proposals, setProposals] = useState(() => loadServiceProposals());
  const [reviews, setReviews] = useState(() => loadProviderReviews());
  const [submissions, setSubmissions] = useState(() => loadProviderSubmissions());

  const allProviders = useMemo(
    () =>
      buildServiceProvidersFromNeighborhoods(
        evaluatedNeighborhoods,
        reviews,
        submissions.filter((s) => s.moderationStatus === 'verified'),
      ),
    [evaluatedNeighborhoods, reviews, submissions],
  );

  const visibleProviders = useMemo(
    () => filterServiceProviders(allProviders, filters, selectedHood.id),
    [allProviders, filters, selectedHood.id],
  );

  return (
    <div data-testid="product-services-view" className="w-full max-w-6xl mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-[#DCE3DF] dark:border-slate-800 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400 flex items-center gap-1 mb-1">
            <Briefcase className="w-3.5 h-3.5" />
            <span>بازار شفاف خدمات و متخصصان ملکی · {selectedHood.name}</span>
          </span>
          <h1 className="text-2xl font-black text-[#182522] dark:text-white">خدمات تخصصی، حقوقی و دفاتر فعال املاک</h1>
          <p className="text-xs text-[#586760] mt-1 tabular-nums">
            نرخ پایه مرجع در محله {selectedHood.name}: {toPersianNum(unitPrice)} م{fxSample}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'directory' as const, label: 'دایرکتوری متخصصان', icon: Briefcase },
            { id: 'wizard' as const, label: 'ثبت درخواست ۷ مرحله‌ای', icon: PlusCircle },
            { id: 'requests' as const, label: `درخواست‌ها (${toPersianNum(requests.length)})`, icon: ClipboardList },
            { id: 'provider_portal' as const, label: 'پرتال متخصصان', icon: Award },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`services-tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-[9px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition ${
                  activeTab === t.id
                    ? 'bg-[#176B63] text-white'
                    : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
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
          onOpenDetail={(p) => {
            trackServiceEvent('service_provider_viewed', { providerId: p.identity.id });
            setDetailProvider(p);
          }}
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

      <ServiceProviderModal
        provider={detailProvider}
        reviews={reviews}
        onClose={() => setDetailProvider(null)}
        onOpenRequestModal={(prov) => setRequestProvider(prov)}
        onSubmitDispute={(providerId, reason, details) => {
          submitServiceDispute({ providerId, reason, details });
        }}
      />

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
    </div>
  );
};
