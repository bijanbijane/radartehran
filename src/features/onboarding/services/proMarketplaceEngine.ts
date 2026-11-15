/** @file src/features/onboarding/services/proMarketplaceEngine.ts — Stage 43 (RT-UI-PRO-MARKETPLACE-001) Pure Engine */
export type ServiceCategoryId =
  | 'real_estate'
  | 'inspection_valuation'
  | 'architecture_design'
  | 'construction'
  | 'mep_maintenance'
  | 'legal_registry';
export type PricingModelKind =
  | 'fixed'
  | 'starting_from'
  | 'unit_based'
  | 'per_session'
  | 'inspection_estimate'
  | 'negotiable';
export type ServiceRequestMode = 'direct' | 'public_broadcast';
export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_response'
  | 'needs_info'
  | 'quote_received'
  | 'negotiating'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'in_progress'
  | 'awaiting_completion_confirm'
  | 'completed'
  | 'disputed'
  | 'closed';

export interface MarketplaceServiceItem {
  serviceId: string;
  providerId: string;
  category: ServiceCategoryId;
  titleFa: string;
  deliverableFa: string;
  pricingModel: PricingModelKind;
  declaredPriceM?: number;
  unitLabelFa?: string;
  limitationsFa: string;
  coverageDistrictsFa: string[];
}

export interface MarketplaceProviderRecord {
  providerId: string;
  displayNameFa: string;
  providerTypeFa: 'متخصص مستقل' | 'شرکت تخصصی' | 'دفتر فنی';
  category: ServiceCategoryId;
  coverageDistrictsFa: string[];
  verifiedCredentialLabelFa: string;
  isCredentialVerified: boolean;
  rating: number;
  reviewCount: number;
  verifiedWorkCount: number;
  isSponsoredPlacement: boolean;
  services: MarketplaceServiceItem[];
}

export interface ServiceRequestItem {
  requestId: string;
  mode: ServiceRequestMode;
  serviceCategory: ServiceCategoryId;
  subjectPropertyRef?: string;
  approximateAreaFa: string;
  exactAddressFa: string;
  exactAddressVisibleToProvider: boolean;
  targetProviderIds: string[];
  broadcastRecipientCount: number;
  status: ServiceRequestStatus;
  cancellationReasonFa?: string;
}

export interface ServiceQuoteRecord {
  quoteId: string;
  requestId: string;
  providerId: string;
  providerNameFa: string;
  amountM: number;
  priceStageLabel: 'برآورد اولیه' | 'پیشنهاد قیمت' | 'مبلغ توافق‌شده';
  scopeIncludedFa: string;
  outOfScopeCostsFa: string;
  durationLabelFa: string;
  cancellationTermsFa: string;
  revisionHistory: Array<{ version: number; amountM: number; noteFa: string; dateLabelFa: string }>;
}

export const STAGE43_DESIGN_COMPONENT_IDS = [
  'PRM-01', 'PRM-02', 'PRM-03', 'PRM-04', 'PRM-05', 'PRM-06', 'PRM-07', 'PRM-08',
  'PRM-09', 'PRM-10', 'PRM-11', 'PRM-12', 'PRM-13', 'PRM-14', 'PRM-15', 'PRM-16',
  'PRM-17', 'PRM-18', 'PRM-19', 'PRM-20', 'PRM-21', 'PRM-22', 'PRM-23', 'PRM-24',
  'PRM-25', 'PRM-26', 'PRM-27', 'PRM-28', 'PRM-29', 'PRM-30', 'PRM-31', 'PRM-32',
] as const;

export const STAGE43_UX_EVENTS = [
  'service_marketplace_opened', 'service_search_submitted', 'service_filter_applied',
  'provider_profile_opened', 'provider_compared', 'service_detail_opened',
  'service_request_started', 'service_request_submitted', 'service_request_cancelled',
  'provider_quote_submitted', 'provider_quote_viewed', 'provider_quote_accepted',
  'service_started', 'service_completed', 'service_review_submitted', 'service_dispute_submitted',
] as const;

export const SERVICE_CATEGORIES_FA: Array<{ id: ServiceCategoryId; titleFa: string }> = [
  { id: 'real_estate', titleFa: 'خدمات املاک' },
  { id: 'inspection_valuation', titleFa: 'کارشناسی و ارزیابی' },
  { id: 'architecture_design', titleFa: 'طراحی و معماری' },
  { id: 'construction', titleFa: 'ساخت‌وساز و پیمانکاری' },
  { id: 'mep_maintenance', titleFa: 'تأسیسات و نگهداری' },
  { id: 'legal_registry', titleFa: 'خدمات حقوقی و ثبتی' },
];

export function filterAndSortMarketplaceProviders(params: {
  providers: MarketplaceProviderRecord[];
  category?: ServiceCategoryId | 'all';
  districtQuery?: string;
  verifiedOnly?: boolean;
}): { organic: MarketplaceProviderRecord[]; sponsored: MarketplaceProviderRecord[] } {
  const q = (params.districtQuery ?? '').trim();
  const filtered = params.providers.filter((p) => {
    if (params.category && params.category !== 'all' && p.category !== params.category) return false;
    if (params.verifiedOnly && !p.isCredentialVerified) return false;
    if (q && !p.coverageDistrictsFa.some((d) => d.includes(q)) && !p.displayNameFa.includes(q)) return false;
    return true;
  });
  return {
    organic: filtered.filter((p) => !p.isSponsoredPlacement),
    sponsored: filtered.filter((p) => p.isSponsoredPlacement),
  };
}

export function evaluateProviderRequestAccess(req: ServiceRequestItem, providerId: string): {
  allowed: boolean;
  showExactAddress: boolean;
  reasonFa: string;
} {
  if (!req.targetProviderIds.includes(providerId)) {
    return { allowed: false, showExactAddress: false, reasonFa: 'دسترسی مسدود شد: این درخواست خصوصی برای شما ارسال نشده است.' };
  }
  const showExactAddress = req.exactAddressVisibleToProvider && (req.status === 'accepted' || req.status === 'in_progress');
  return {
    allowed: true,
    showExactAddress,
    reasonFa: showExactAddress ? 'نشانی دقیق با رضایت کاربر در مرحله اجرا قابل مشاهده است.' : 'فقط محدوده تقریبی نمایش داده می‌شود؛ نشانی دقیق محفوظ است.',
  };
}

export function reviseServiceQuoteKeepingHistory(
  quote: ServiceQuoteRecord,
  newAmountM: number,
  reasonFa: string,
): ServiceQuoteRecord {
  const prevVersion = quote.revisionHistory.length + 1;
  return {
    ...quote,
    amountM: newAmountM,
    revisionHistory: [
      ...quote.revisionHistory,
      { version: prevVersion, amountM: quote.amountM, noteFa: reasonFa, dateLabelFa: '۱۴ آبان ۱۴۰۵' },
    ],
  };
}

export function compareServiceQuotesHonesty(quotes: ServiceQuoteRecord[]): {
  hasScopeDifferenceWarning: boolean;
  advisoryFa: string;
} {
  const hasOutOfScope = quotes.some((q) => q.outOfScopeCostsFa !== 'ندارد');
  return {
    hasScopeDifferenceWarning: hasOutOfScope || quotes.length > 1,
    advisoryFa: 'ارزان‌ترین پیشنهاد الزاماً بهترین نیست؛ تفاوت دامنه خدمت و اقلام خارج از تعهد را بررسی کنید.',
  };
}

export function cancelServiceRequestSafely(req: ServiceRequestItem, reasonFa: string): ServiceRequestItem {
  return { ...req, status: 'cancelled', cancellationReasonFa: reasonFa, exactAddressVisibleToProvider: false };
}

export function submitServiceReviewWithVerification(params: {
  req: ServiceRequestItem;
  rating: number;
  commentFa: string;
}): { accepted: boolean; verifiedInteraction: boolean; canProviderDelete: false; messageFa: string } {
  const verifiedInteraction = params.req.status === 'completed' || params.req.status === 'closed';
  return {
    accepted: true,
    verifiedInteraction,
    canProviderDelete: false,
    messageFa: verifiedInteraction
      ? 'ارزیابی با برچسب «تجربه تعامل تأییدشده» ثبت شد (ارائه‌دهنده امکان حذف نظر را ندارد).'
      : 'نظر عمومی ثبت شد، اما بدون تکمیل درخواست نشان «تجربه تأییدشده» دریافت نمی‌کند.',
  };
}
