import { computeGeodesicHaversineKm, maskExactResidentialCoordinates } from './cacheJobsGeospatialIngestionFlags'; import { cleanIranianMobile } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface PaymentGatewayDiscoveryReport { paymentGatewayImplemented: false; discoveredGateways: readonly string[]; discoveredCheckoutRoutes: readonly string[]; policyNote: string; }
export function auditPaymentGatewayPresence(): PaymentGatewayDiscoveryReport { return { paymentGatewayImplemented: false, discoveredGateways: [], discoveredCheckoutRoutes: [], policyNote:
      'No payment gateway, checkout flow, or paid subscription exists in Tehran Radar. Do not introduce unused payment SDKs.', }; }
export interface SyntheticFinancialReconciliationInput { transactionId: string; orderOwnerUid: string; callbackActorUid: string; authoritativeServerAmountRials: number; clientSubmittedAmountRials: number; providerVerifiedAmountRials: number;
  providerVerificationStatus: 'VERIFIED_OK' | 'FAILED_AT_PROVIDER' | 'UNVERIFIED_CLIENT_CLAIM'; alreadyActivatedOnce: boolean; }
export function verifyFinancialTransactionReconciliation(input: SyntheticFinancialReconciliationInput): {
  reconciledAndAuthorized: boolean; serviceActivationPermitted: boolean; rejectionReason: string | null; trustedAmountRials: number;
} {
  if (input.orderOwnerUid !== input.callbackActorUid) {
    return { reconciledAndAuthorized: false, serviceActivationPermitted: false, rejectionReason: 'CROSS_USER_TRANSACTION_SUBSTITUTION_BLOCKED', trustedAmountRials: input.authoritativeServerAmountRials };
  }
  if (input.providerVerificationStatus !== 'VERIFIED_OK') {
    return { reconciledAndAuthorized: false, serviceActivationPermitted: false, rejectionReason: 'SERVER_SIDE_PROVIDER_VERIFICATION_REQUIRED', trustedAmountRials: input.authoritativeServerAmountRials };
  }
  if (input.providerVerifiedAmountRials !== input.authoritativeServerAmountRials) {
    return { reconciledAndAuthorized: false, serviceActivationPermitted: false, rejectionReason: 'AMOUNT_MISMATCH_AGAINST_SERVER_AUTHORITY', trustedAmountRials: input.authoritativeServerAmountRials };
  }
  if (input.alreadyActivatedOnce) {
    return { reconciledAndAuthorized: true, serviceActivationPermitted: false, rejectionReason: 'DUPLICATE_CALLBACK_IDEMPOTENT_NOOP', trustedAmountRials: input.authoritativeServerAmountRials };
  }
  return { reconciledAndAuthorized: true, serviceActivationPermitted: true, rejectionReason: null, trustedAmountRials: input.authoritativeServerAmountRials };
}
export interface FinOpsWorkloadInspectionInput {
  featureName: string; firestoreDocsReadPerRequest: number; hasExplicitQueryLimit: boolean;
  geminiTokensPerRequest: number; userRequestsInCurrentHour: number; maxRequestsPerUserPerHour: number; usesResponseCache: boolean;
}
export interface FinOpsGovernanceReport {
  featureName: string; withinCostBudget: boolean; throttledForCostProtection: boolean; unboundedScanDetected: boolean;
  measuredResourceUnits: { firestoreReads: number; geminiTokens: number };
  estimatedCostUsdPer1000Calls: number; recommendations: string[];
}
export function evaluateCloudFinOpsAndResourceConsumption(
  input: FinOpsWorkloadInspectionInput,
): FinOpsGovernanceReport {
  const recommendations: string[] = [];
  const unboundedScanDetected = !input.hasExplicitQueryLimit || input.firestoreDocsReadPerRequest > 200;
  if (unboundedScanDetected) {
    recommendations.push('ENFORCE_FIRESTORE_QUERY_LIMIT_AND_CURSOR_PAGINATION');
  }
  if (input.geminiTokensPerRequest > 0 && !input.usesResponseCache) {
    recommendations.push('ENABLE_DETERMINISTIC_PROMPT_RESPONSE_CACHE');
  }
  const throttledForCostProtection = input.userRequestsInCurrentHour > input.maxRequestsPerUserPerHour;
  if (throttledForCostProtection) {
    recommendations.push('USER_HOURLY_COST_QUOTA_EXCEEDED');
  }
  const firestoreUsdPer1kCalls = (input.firestoreDocsReadPerRequest * 1000 * 0.00036) / 1000;
  const geminiUsdPer1kCalls = (input.geminiTokensPerRequest * 1000 * 0.00015) / 1000;
  const estimatedCostUsdPer1000Calls = Number((firestoreUsdPer1kCalls + geminiUsdPer1kCalls).toFixed(4));
  return {
    featureName: input.featureName,
    withinCostBudget: !unboundedScanDetected && !throttledForCostProtection,
    throttledForCostProtection,
    unboundedScanDetected,
    measuredResourceUnits: {
      firestoreReads: input.firestoreDocsReadPerRequest,
      geminiTokens: input.geminiTokensPerRequest,
    },
    estimatedCostUsdPer1000Calls,
    recommendations,
  };
}
export const TEHRAN_RADAR_DESIGN_TOKENS = {
  typography: {
    fontFamilyFa: 'Vazirmatn, system-ui, sans-serif',
    direction: 'rtl',
  },
  semanticStatusColors: {
    greenBargain: '#10b981', // emerald-500
    yellowFair: '#f59e0b',   // amber-500
    redExpensive: '#f43f5e', // rose-500
  },
  interactiveMinimumTouchPx: 44,
} as const;
export interface UiComponentConsistencyDescriptor {
  componentName: string;
  directionAttr: 'rtl' | 'ltr';
  minInteractiveHeightPx: number;
  hasVisibleFocusRing: boolean;
  preservesSkeletonHeightOnLoad: boolean;
  usesSemanticStatusTokens: boolean;
}
export function auditDesignSystemAndVisualConsistency(
  components: readonly UiComponentConsistencyDescriptor[],
): {
  allConsistent: boolean;
  violations: Array<{ componentName: string; issue: string }>;
} {
  const violations: Array<{ componentName: string; issue: string }> = [];
  for (const comp of components) {
    if (comp.directionAttr !== 'rtl') {
      violations.push({ componentName: comp.componentName, issue: 'MISSING_RTL_DIRECTION_ALIGNMENT' });
    }
    if (comp.minInteractiveHeightPx < TEHRAN_RADAR_DESIGN_TOKENS.interactiveMinimumTouchPx) {
      violations.push({ componentName: comp.componentName, issue: 'INTERACTIVE_CONTROL_BELOW_44PX_TOUCH_TARGET' });
    }
    if (!comp.hasVisibleFocusRing) {
      violations.push({ componentName: comp.componentName, issue: 'MISSING_KEYBOARD_FOCUS_VISIBLE_STYLE' });
    }
    if (!comp.preservesSkeletonHeightOnLoad) {
      violations.push({ componentName: comp.componentName, issue: 'LAYOUT_SHIFT_RISK_ON_LOADING_SKELETON' });
    }
    if (!comp.usesSemanticStatusTokens) {
      violations.push({ componentName: comp.componentName, issue: 'HARDCODED_COLOR_BYPASSES_SEMANTIC_TOKENS' });
    }
  }
  return {
    allConsistent: violations.length === 0,
    violations,
  };
}
export const GEOGRAPHIC_BOUNDARY_DATASET_VERSION = 'tehran-22-zones-627-hoods-2026.v2';
export interface ReferenceNeighborhoodCentroid {
  hoodId: number; nameFa: string; city: string; zone: number; lat: number; lng: number; maxBoundaryRadiusKm: number;
}
export function assignCoordinateToVersionedNeighborhood(input: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  expectedCity: string;
  candidates: readonly ReferenceNeighborhoodCentroid[];
  historicalReportDatasetVersion?: string;
}): {
  assignedHoodId: number | null;
  datasetVersion: string;
  preservedHistoricalVersion: boolean;
  silentDefaultFallbackUsed: false;
  rejectionReason: string | null;
} {
  const datasetVersion = input.historicalReportDatasetVersion ?? GEOGRAPHIC_BOUNDARY_DATASET_VERSION;
  const preservedHistoricalVersion = Boolean(input.historicalReportDatasetVersion);
  if (
    typeof input.lat !== 'number' ||
    typeof input.lng !== 'number' ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng)
  ) {
    return {
      assignedHoodId: null,
      datasetVersion,
      preservedHistoricalVersion,
      silentDefaultFallbackUsed: false,
      rejectionReason: 'MISSING_OR_INVALID_COORDINATES_NO_DEFAULT_FALLBACK',
    };
  }
  let bestCandidate: ReferenceNeighborhoodCentroid | null = null;
  let bestDistKm = Number.POSITIVE_INFINITY;
  for (const cand of input.candidates) {
    if (cand.city !== input.expectedCity) continue;
    const d = computeGeodesicHaversineKm(input.lat, input.lng, cand.lat, cand.lng);
    if (d <= cand.maxBoundaryRadiusKm && d < bestDistKm) {
      bestDistKm = d;
      bestCandidate = cand;
    }
  }
  if (!bestCandidate) {
    return {
      assignedHoodId: null,
      datasetVersion,
      preservedHistoricalVersion,
      silentDefaultFallbackUsed: false,
      rejectionReason: 'POINT_OUTSIDE_ALL_KNOWN_NEIGHBORHOOD_BOUNDARIES',
    };
  }
  return {
    assignedHoodId: bestCandidate.hoodId,
    datasetVersion,
    preservedHistoricalVersion,
    silentDefaultFallbackUsed: false,
    rejectionReason: null,
  };
}
export interface PrivatePropertyListingRecord {
  listingId: string; ownerUid: string; ownerFullNameFa: string; ownerPhoneRaw: string; ownerEmail: string;
  exactAddressFa: string; exactUnitNumber: number; exactLat: number; exactLng: number; neighborhoodNameFa: string; priceMillion: number;
}
export class ContactAndLocationPrivacyDisclosureGuard {
  private readonly hourlyRevealCounts = new Map<string, number>();
  static readonly MAX_CONTACT_REVEALS_PER_HOUR = 10;
  toMinimizedPublicListingPayload(
    record: PrivatePropertyListingRecord,
    areaUnit: AreaUnit = getStoredAreaUnit(),
    intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
  ): {
    listingId: string;
    neighborhoodNameFa: string;
    priceMillion: number;
    approximateLat: number;
    approximateLng: number;
    locationPrecisionMeters: number;
    maskedContactPreview: string;
    containsRawPhoneOrExactAddressInPayload: false;
    displayAreaUnitLabel?: string;
    priceIntlText?: string;
  } {
    const maskedCoords = maskExactResidentialCoordinates(record.exactLat, record.exactLng);
    const cleanPhone = cleanIranianMobile(record.ownerPhoneRaw);
    const maskedContactPreview = cleanPhone.length === 11 ? `${cleanPhone.slice(0, 4)}***${cleanPhone.slice(7)}` : '۰۹۱۲***۰۰۰۰';
    return {
      listingId: record.listingId,
      neighborhoodNameFa: record.neighborhoodNameFa,
      priceMillion: record.priceMillion,
      approximateLat: maskedCoords.approxLat,
      approximateLng: maskedCoords.approxLng,
      locationPrecisionMeters: 200,
      maskedContactPreview,
      containsRawPhoneOrExactAddressInPayload: false,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      priceIntlText: formatMillionTomanAsIntlCurrency(record.priceMillion, intlCurrency),
    };
  }
  /**
   * Enforces authentication and anti-scraping rate limits before revealing
   * an advertiser's contact number.
   */
  requestAuthorizedContactReveal(input: {
    requesterUid: string | null;
    record: PrivatePropertyListingRecord;
  }): {
    revealed: boolean;
    rejectionReason: string | null;
    contactPhone: string | null;
  } {
    if (!input.requesterUid) {
      return {
        revealed: false,
        rejectionReason: 'AUTHENTICATION_REQUIRED_FOR_CONTACT_REVEAL',
        contactPhone: null,
      };
    }
    const used = this.hourlyRevealCounts.get(input.requesterUid) ?? 0;
    if (used >= ContactAndLocationPrivacyDisclosureGuard.MAX_CONTACT_REVEALS_PER_HOUR) {
      return {
        revealed: false,
        rejectionReason: 'CONTACT_HARVESTING_RATE_LIMIT_EXCEEDED',
        contactPhone: null,
      }; }
    if (!this.hourlyRevealCounts.has(input.requesterUid) && this.hourlyRevealCounts.size >= 5000) {
      const oldest = this.hourlyRevealCounts.keys().next().value;
      if (oldest !== undefined) this.hourlyRevealCounts.delete(oldest);
    }
    this.hourlyRevealCounts.set(input.requesterUid, used + 1); return { revealed: true, rejectionReason: null, contactPhone: cleanIranianMobile(input.record.ownerPhoneRaw), }; } }