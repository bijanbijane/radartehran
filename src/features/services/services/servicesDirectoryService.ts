/** @file src/features/services/services/servicesDirectoryService.ts — Grounded Provider Directory, Offerings & Transparent Sorting */
import { isSponsorActive, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { matchesPersianSearch, sanitizeInput } from '../../../utils/security';
import {
  CANONICAL_SERVICE_DEFINITIONS,
  IDENTITY_NOT_CREDENTIAL_NOTE_FA,
  PAST_RATING_DISCLAIMER_FA,
  evaluateProviderVerificationTracks,
  mapCanonicalToLegacyCategory,
  mapLegacyCategoryToCanonical,
} from './serviceTaxonomyAndVerification';
import type {
  ProviderOnboardingSubmission,
  ProviderReviewRecord,
  ServiceCategory,
  ServiceFilterState,
  ServiceOfferingEntity,
  ServiceProviderEntity,
  ServiceRequestRecord,
  ServiceDisputeRecord,
} from '../types/service.types';
import {
  loadProviderReviews,
  loadProviderSubmissions,
  loadServiceComplaints,
  loadServiceRequests as loadServiceRequestsFromWorkflow,
  submitServiceComplaint,
  submitServiceRequest,
} from './serviceWorkflowService';

export { IDENTITY_NOT_CREDENTIAL_NOTE_FA, PAST_RATING_DISCLAIMER_FA };

function inferCategory(specialty: string, index: number): Exclude<ServiceCategory, 'all'> {
  if (/بازسازی|نوسازی|تعمیر/i.test(specialty)) return 'renovation_repair';
  if (/معمار|طراحی/i.test(specialty)) return 'architecture';
  if (/حقوق|سند|کارشناس|ارزیابی|قیمت/i.test(specialty)) return index % 2 === 0 ? 'legal_valuation' : 'brokerage';
  if (/ساخت|برج|کلنگی|ویلایی/i.test(specialty) && index % 4 === 0) return 'contractor';
  return 'brokerage';
}

function inferCanonicalCategory(
  specialty: string,
  category: Exclude<ServiceCategory, 'all'>,
  index: number,
): ReturnType<typeof mapLegacyCategoryToCanonical> {
  if (/ارزش|ارزیابی|قیمت|کارشناسی|تخمین/i.test(specialty)) return 'valuation';
  if (/بازدید|بازرسی|فنی|تأسیسات|تاسیسات|سازه/i.test(specialty)) return 'inspection';
  if (category === 'legal_valuation') return index % 2 === 0 ? 'valuation' : 'legal';
  if (category === 'brokerage' && index % 5 === 1) return 'valuation';
  if (category === 'brokerage' && index % 5 === 2) return 'inspection';
  return mapLegacyCategoryToCanonical(category);
}

function buildOfferingForProvider(
  providerId: string,
  providerCategory: ReturnType<typeof mapLegacyCategoryToCanonical>,
  hoodName: string,
  specialtyFa: string,
  pricingDisplayFa = 'توافقی و تابع تعرفه رسمی پس از بازدید',
): ServiceOfferingEntity {
  const def =
    CANONICAL_SERVICE_DEFINITIONS.find((d) => d.category === providerCategory) ||
    CANONICAL_SERVICE_DEFINITIONS[0];
  return {
    offeringId: `off-${providerId}-${def.serviceId}`,
    providerId,
    serviceId: def.serviceId,
    canonicalCategory: def.category,
    titleFa: def.titleFa,
    summaryFa: specialtyFa || def.summaryFa,
    pricing: {
      mode: 'negotiable',
      displayLabelFa: pricingDisplayFa,
      minMillionToman: null,
      maxMillionToman: null,
      unitLabelFa: null,
      includesListFa: ['بررسی اولیه مدارک و مشاوره تلفنی', 'اعلام دقیق دامنه کار پیش از اجرا'],
      excludesListFa: ['هزینه‌های استعلام رسمی، ثبت اسناد یا مصالح مصرفی'],
    },
    deliveryModes: def.deliveryModes,
    coverage: {
      officeAddressSummaryFa: `دفتر محلی در محدوده ${hoodName}`,
      officeNeighborhoodName: hoodName,
      scope: 'local',
      coveredAreaNames: [hoodName],
      remoteAvailable: def.deliveryModes.includes('remote'),
    },
    estimatedTurnaroundFa: '۲۴ تا ۷۲ ساعت کاری',
  };
}

export function buildServiceProvidersFromNeighborhoods(
  hoods: EvaluatedNeighborhood[],
  reviews: ProviderReviewRecord[] = typeof window !== 'undefined' ? loadProviderReviews() : [],
  approvedCustom: ProviderOnboardingSubmission[] = typeof window !== 'undefined'
    ? loadProviderSubmissions().filter((s) => s.moderationStatus === 'verified')
    : [],
): ServiceProviderEntity[] {
  const seenPhones = new Set<string>();
  const providers: ServiceProviderEntity[] = [];

  const reviewStatsFor = (pid: string) => {
    const matched = reviews.filter((r) => r.providerId === pid && r.status === 'published');
    if (matched.length === 0) return { count: 0, avg: null };
    const avg = Number((matched.reduce((s, r) => s + r.overallScore, 0) / matched.length).toFixed(1));
    return { count: matched.length, avg };
  };

  hoods.forEach((hood, idx) => {
    const sp = hood.sponsor;
    if (!sp || typeof sp.name !== 'string' || !sp.name.trim()) return;
    const cleanPhone = String(sp.phone || '').trim();
    if (cleanPhone && seenPhones.has(`${sp.name}-${cleanPhone}`)) return;
    if (cleanPhone) seenPhones.add(`${sp.name}-${cleanPhone}`);

    const activePaid =
      isSponsorActive(sp, true) && (sp.planType === 'paid_1m' || sp.planType === 'paid_3m');
    const listingTier = activePaid
      ? 'sponsored_ad'
      : isSponsorActive(sp, false)
      ? 'featured_directory'
      : 'organic_directory';

    const category = inferCategory(sp.specialty || '', idx);
    const canonicalCategory = inferCanonicalCategory(sp.specialty || '', category, idx);
    const providerId = `sp-${hood.id}`;
    const specialtyFa = sanitizeInput(sp.specialty || `خدمات ملکی محله ${hood.name}`, 160);
    const credential = evaluateProviderVerificationTracks({ listingTier });
    const stats = reviewStatsFor(providerId);
    const offering = buildOfferingForProvider(providerId, canonicalCategory, hood.name, specialtyFa);

    providers.push({
      identity: {
        id: providerId,
        displayName: sanitizeInput(sp.name, 80),
        entityKind: 'agency',
        primaryNeighborhoodId: hood.id,
        primaryNeighborhoodName: hood.name,
        zone: hood.zone,
        phone: sanitizeInput(sp.phone, 24),
      },
      credential,
      activity: {
        experienceYearsDeclared: Number(sp.experienceYears) || 1,
        activeListingsCount: Array.isArray(hood.bargains) ? hood.bargains.length : 0,
        responseTimeLabelFa: 'پاسخ‌گویی میانگین زیر ۲۴ ساعت',
      },
      category,
      canonicalCategory,
      specialtyFa,
      pricingModelFa: offering.pricing.displayLabelFa,
      listingTier,
      adDisclosureLabelFa: listingTier === 'sponsored_ad' ? 'نمایش تبلیغاتی' : null,
      feedback: {
        verifiedReviewsCount: stats.count,
        averageScore: stats.avg,
        noteFa: PAST_RATING_DISCLAIMER_FA,
      },
      coverage: offering.coverage,
      offerings: [offering],
    });
  });

  // Append verified custom provider onboarding submissions without overwriting grounded providers
  for (const sub of approvedCustom) {
    const pid = `custom-${sub.submissionId}`;
    const credential = evaluateProviderVerificationTracks({
      identityStatus: 'verified',
      businessStatus: 'verified',
      qualificationStatus: sub.licenseClaimedFa ? 'verified' : 'not_submitted',
      licenseCodeMasked: sub.licenseClaimedFa ? `***${sub.licenseClaimedFa.slice(-4)}` : null,
      portfolioStatus: sub.portfolioSummaryFa ? 'verified' : 'not_submitted',
    });
    const stats = reviewStatsFor(pid);
    const offering = buildOfferingForProvider(
      pid,
      sub.canonicalCategory,
      sub.neighborhoodName,
      sub.specialtyFa,
      sub.priceDisplayFa,
    );
    offering.pricing.mode = sub.pricingMode;
    offering.coverage = {
      officeAddressSummaryFa: `محدوده ${sub.neighborhoodName} (${sub.zone})`,
      officeNeighborhoodName: sub.neighborhoodName,
      scope: sub.coverageScope,
      coveredAreaNames: sub.coveredAreaNames.length > 0 ? sub.coveredAreaNames : [sub.neighborhoodName],
      remoteAvailable: sub.remoteAvailable,
    };

    providers.unshift({
      identity: {
        id: pid,
        displayName: sanitizeInput(sub.displayName, 80),
        entityKind: sub.entityKind,
        primaryNeighborhoodId: sub.neighborhoodId,
        primaryNeighborhoodName: sub.neighborhoodName,
        zone: sub.zone,
        phone: sanitizeInput(sub.phone, 24),
      },
      credential,
      activity: {
        experienceYearsDeclared: 3,
        activeListingsCount: 0,
        responseTimeLabelFa: 'عضو تأییدشده پرتال خدمات',
      },
      category: mapCanonicalToLegacyCategory(sub.canonicalCategory),
      canonicalCategory: sub.canonicalCategory,
      specialtyFa: sub.specialtyFa,
      pricingModelFa: sub.priceDisplayFa,
      listingTier: 'organic_directory',
      adDisclosureLabelFa: null,
      feedback: {
        verifiedReviewsCount: stats.count,
        averageScore: stats.avg,
        noteFa: PAST_RATING_DISCLAIMER_FA,
      },
      coverage: offering.coverage,
      offerings: [offering],
    });
  }

  return providers;
}

export function filterServiceProviders(
  providers: ServiceProviderEntity[],
  filters: ServiceFilterState,
  selectedHoodId?: number,
): ServiceProviderEntity[] {
  const filtered = providers.filter((item) => {
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.canonicalCategory && filters.canonicalCategory !== 'all' && item.canonicalCategory !== filters.canonicalCategory) return false;
    if (filters.hoodId !== 'all' && item.identity.primaryNeighborhoodId !== filters.hoodId) return false;
    if (filters.hideSponsored && item.listingTier === 'sponsored_ad') return false;
    if (filters.onlyWithDeclaredPhone && !item.identity.phone.trim()) return false;
    if (filters.onlyVerifiedTrack && !item.credential.tracks.some((t) => t.status === 'verified')) return false;
    const deliveryFilter = filters.deliveryMode;
    if (deliveryFilter && deliveryFilter !== 'all') {
      const hasDelivery = item.offerings.some((o) => o.deliveryModes.includes(deliveryFilter));
      if (!hasDelivery) return false;
    }
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim();
      const matched =
        matchesPersianSearch(item.identity.displayName, q) ||
        matchesPersianSearch(item.identity.primaryNeighborhoodName, q) ||
        matchesPersianSearch(item.specialtyFa, q) ||
        item.coverage.coveredAreaNames.some((area) => matchesPersianSearch(area, q));
      if (!matched) return false;
    }
    return true;
  });

  const sortMode = filters.sortMode || 'recommended';
  return [...filtered].sort((a, b) => {
    if (sortMode === 'verified_first') {
      const aV = a.credential.tracks.filter((t) => t.status === 'verified').length;
      const bV = b.credential.tracks.filter((t) => t.status === 'verified').length;
      if (aV !== bV) return bV - aV;
    }
    if (sortMode === 'coverage_match' && selectedHoodId) {
      const aSel = a.identity.primaryNeighborhoodId === selectedHoodId ? 0 : 1;
      const bSel = b.identity.primaryNeighborhoodId === selectedHoodId ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
    }
    if (sortMode === 'recommended') {
      const aSel = selectedHoodId && a.identity.primaryNeighborhoodId === selectedHoodId ? 0 : 1;
      const bSel = selectedHoodId && b.identity.primaryNeighborhoodId === selectedHoodId ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      if (a.listingTier === 'sponsored_ad' && b.listingTier !== 'sponsored_ad') return 1;
      if (b.listingTier === 'sponsored_ad' && a.listingTier !== 'sponsored_ad') return -1;
    }
    return b.activity.experienceYearsDeclared - a.activity.experienceYearsDeclared;
  });
}

// Re-export workflow operations for backward compatibility
export function loadServiceRequests(): ServiceRequestRecord[] {
  return loadServiceRequestsFromWorkflow();
}
export { submitServiceRequest as saveServiceRequest, loadServiceComplaints as loadServiceDisputes };

export function submitServiceDispute(
  input: Omit<ServiceDisputeRecord, 'id' | 'createdAtIso'>,
): ServiceDisputeRecord {
  const c = submitServiceComplaint({
    providerId: input.providerId,
    requestId: input.requestId,
    complainantUid: input.complainantUid || 'local-user',
    reason: input.reason,
    details: input.details,
  });
  return {
    id: c.complaintId,
    requestId: c.requestId,
    providerId: c.providerId,
    complainantUid: c.complainantUid,
    reason: c.reason,
    details: c.details,
    status: c.status,
    createdAtIso: c.createdAtIso,
  };
}
