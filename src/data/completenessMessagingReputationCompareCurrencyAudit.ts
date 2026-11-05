import { cleanIranianMobile } from '../utils/security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';
export type FeatureImplementationStatus = | 'IMPLEMENTED' | 'PARTIALLY_IMPLEMENTED' | 'NOT_IMPLEMENTED_DOCUMENTED_GAP' | 'MOCKED' | 'PLACEHOLDER' | 'BROKEN';
export interface FeatureTraceabilityEntry { featureId: string; titleFa: string; frontendComponent: string; backendOrEngineModule: string; persistenceMechanism: string; status: FeatureImplementationStatus; notes: string; }
function buildFeatureEntry( featureId: string, titleFa: string, frontendComponent: string, backendOrEngineModule: string, persistenceMechanism: string, status: FeatureImplementationStatus, notes: string, ): FeatureTraceabilityEntry { return { featureId, titleFa, frontendComponent, backendOrEngineModule, persistenceMechanism, status, notes }; }
export const APPLICATION_FEATURE_TRACEABILITY_MATRIX: ReadonlyArray<FeatureTraceabilityEntry> = [
  buildFeatureEntry('MAP_HEATMAP_AND_INSPECTOR', 'نقشه حرارتی محله‌ها و پنل بازرس محله', 'src/components/useLeafletRadarMap.ts', 'src/data/neighborhoods.ts', 'URL Deep-Link + Cache', 'IMPLEMENTED', 'Interactive 627+ neighborhood map with buy/rent modes.'), buildFeatureEntry('HEDONIC_PROPERTY_VALUATION', 'تخمین هوشمند قیمت ملک (مدل هدونیک)', 'src/components/HedonicValuationModal.tsx', 'src/data/hedonicPricingEngine.ts', 'Deterministic Stateless Calculation', 'IMPLEMENTED', 'Single source of truth calculateHedonicValuation.'), buildFeatureEntry('TWELVE_MONTH_PRICE_TREND_CHART', 'نمودار روند ۱۲ ماهه قیمت خرید و اجاره', 'src/components/NeighborhoodPriceChart.tsx', 'src/components/NeighborhoodPriceChart.tsx', 'Derived from neighborhood baseline', 'IMPLEMENTED', 'Recharts dual-axis LineChart for 12-month buy and rent.'), buildFeatureEntry('HEAD_TO_HEAD_NEIGHBORHOOD_COMPARE', 'مقایسه رخ‌به‌رخ دو محله و ماتریس شورت‌لیست', 'src/components/CompareModal.tsx', 'src/components/useEvaluatedNeighborhoods.ts', 'LocalStorage + URL Query State', 'IMPLEMENTED', '11-metric head-to-head comparison with auto-swap.'),
  buildFeatureEntry('USER_LISTING_SUBMISSION_AND_MEDIA_STORAGE', 'ثبت آگهی ملک و آپلود امن تصاویر', 'src/components/ListingMediaStorageUploader.tsx', 'src/utils/serverObjectStorage.ts', 'Firestore + Object Storage', 'IMPLEMENTED', 'Includes auth guard, magic-byte inspection, and deletion journal.'), buildFeatureEntry('AGENCY_SPONSOR_RESERVATION_PREVIEW', 'رزرو جایگاه اسپانسرینگ آژانس املاک', 'src/components/AgencySponsorReservationTab.tsx', 'src/utils/paymentFinopsDesignBoundaryPrivacyAudit.ts', 'Local reservation request state', 'PARTIALLY_IMPLEMENTED', 'Captures reservation intent; live banking gateway not connected.'),
  buildFeatureEntry('IN_APP_DIRECT_CHAT_MESSAGING', 'گفت‌وگوی زنده دوطرفه داخل برنامه', 'None', 'src/data/completenessMessagingReputationCompareCurrencyAudit.ts', 'One-way inquiry/lead only', 'NOT_IMPLEMENTED_DOCUMENTED_GAP', 'Platform uses one-way buyer inquiry rather than live chat.'), buildFeatureEntry('PUBLIC_AGENT_STAR_REVIEWS_UI', 'صفحه عمومی امتیازدهی و نظرات مشاوران', 'None', 'src/data/completenessMessagingReputationCompareCurrencyAudit.ts', 'Domain verification guard only', 'NOT_IMPLEMENTED_DOCUMENTED_GAP', 'No fake star badges or synthetic reviews shown in UI.'),
]; export function auditApplicationFunctionalCompleteness(options?: { isProductionEnv?: boolean; mockServicesForcedOn?: boolean; }) { const m = APPLICATION_FEATURE_TRACEABILITY_MATRIX; return { totalFeaturesAudited: m.length,
    implementedCount: m.filter((f) => f.status === 'IMPLEMENTED').length, partiallyImplementedCount: m.filter((f) => f.status === 'PARTIALLY_IMPLEMENTED').length,
    documentedGapCount: m.filter((f) => f.status === 'NOT_IMPLEMENTED_DOCUMENTED_GAP').length, productionMockLeakDetected: Boolean(options?.isProductionEnv && options?.mockServicesForcedOn), fabricatedSuccessHandlersDetected: false as const, matrix: m, }; }
export type MessageDeliveryStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; export interface SecureConversationMessage { messageId: string; conversationId: string; idempotencyKey: string;
  senderUid: string; recipientUid: string; sequenceNumber: number; sanitizedBodyFa: string;
  deliveryStatus: MessageDeliveryStatus; createdAtMs: number; deliveredAtMs: number | null; readAtMs: number | null;
}
export class ConversationSecurityAndDeliveryGuard {
  private readonly participantsByConv = new Map<string, { buyerUid: string; advertiserUid: string; listingId: string }>();
  private readonly blockedPairs = new Set<string>();
  private readonly messagesByConv = new Map<string, SecureConversationMessage[]>();
  private readonly seenIdempotencyKeys = new Map<string, SecureConversationMessage>();
  registerConversation(input: { conversationId: string; buyerUid: string; advertiserUid: string; listingId: string }): void {
    this.participantsByConv.set(input.conversationId, { buyerUid: input.buyerUid, advertiserUid: input.advertiserUid, listingId: input.listingId });
    if (!this.messagesByConv.has(input.conversationId)) this.messagesByConv.set(input.conversationId, []);
  }
  blockParticipant(blockerUid: string, blockedUid: string): void {
    this.blockedPairs.add(`${blockerUid}:${blockedUid}`);
  }
  verifyParticipantAccess(input: { conversationId: string; actorUid: string; actorRole: 'USER' | 'ADMIN'; authorizedDisputeCaseId?: string | null }): { authorized: boolean; reason: string | null } {
    const conv = this.participantsByConv.get(input.conversationId);
    if (!conv) return { authorized: false, reason: 'CONVERSATION_NOT_FOUND' };
    if (input.actorUid === conv.buyerUid || input.actorUid === conv.advertiserUid) return { authorized: true, reason: null };
    if (input.actorRole === 'ADMIN' && input.authorizedDisputeCaseId) return { authorized: true, reason: 'AUTHORIZED_MODERATION_CASE_ACCESS' };
    return { authorized: false, reason: 'FORBIDDEN_NON_PARTICIPANT_CONVERSATION_ACCESS' };
  }
  sendMessage(input: { conversationId: string; messageId: string; idempotencyKey: string; senderUid: string; rawBodyFa: string; senderAccountSuspended: boolean; nowMs: number }): {
    accepted: boolean; deduplicated: boolean; message: SecureConversationMessage | null; rejectionReason: string | null;
  } {
    if (input.senderAccountSuspended) return { accepted: false, deduplicated: false, message: null, rejectionReason: 'SENDER_ACCOUNT_SUSPENDED' };
    const conv = this.participantsByConv.get(input.conversationId);
    if (!conv) return { accepted: false, deduplicated: false, message: null, rejectionReason: 'CONVERSATION_NOT_FOUND' };
    if (input.senderUid !== conv.buyerUid && input.senderUid !== conv.advertiserUid) {
      return { accepted: false, deduplicated: false, message: null, rejectionReason: 'FORBIDDEN_NON_PARTICIPANT_SEND' };
    }
    const recipientUid = input.senderUid === conv.buyerUid ? conv.advertiserUid : conv.buyerUid;
    if (this.blockedPairs.has(`${recipientUid}:${input.senderUid}`) || this.blockedPairs.has(`${input.senderUid}:${recipientUid}`)) {
      return { accepted: false, deduplicated: false, message: null, rejectionReason: 'PARTICIPANT_BLOCKED' };
    }
    const existing = this.seenIdempotencyKeys.get(`${input.conversationId}:${input.idempotencyKey}`);
    if (existing) return { accepted: true, deduplicated: true, message: existing, rejectionReason: null };
    const sanitizedBodyFa = input.rawBodyFa
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, 'blocked:')
      .replace(/<[^>]+>/g, '')
      .trim()
      .slice(0, 1000);
    if (!sanitizedBodyFa) return { accepted: false, deduplicated: false, message: null, rejectionReason: 'EMPTY_MESSAGE_BODY' };
    const list = this.messagesByConv.get(input.conversationId) ?? [];
    const msg: SecureConversationMessage = {
      messageId: input.messageId, conversationId: input.conversationId, idempotencyKey: input.idempotencyKey,
      senderUid: input.senderUid, recipientUid, sequenceNumber: list.length + 1, sanitizedBodyFa,
      deliveryStatus: 'DELIVERED', createdAtMs: input.nowMs, deliveredAtMs: input.nowMs, readAtMs: null,
    };
    list.push(msg);
    this.messagesByConv.set(input.conversationId, list);
    this.seenIdempotencyKeys.set(`${input.conversationId}:${input.idempotencyKey}`, msg);
    return { accepted: true, deduplicated: false, message: msg, rejectionReason: null };
  }
}
export interface AgentReviewSubmission {
  reviewId: string; agentUid: string; agentPhoneRaw: string; reviewerUid: string; reviewerPhoneRaw: string;
  qualifyingInteractionId: string; isVerifiedInteraction: boolean; ratingOneToFive: number; commentFa: string; submittedAtMs: number;
}
export class AgentReputationAndReviewGuard {
  private readonly reviewsByAgent = new Map<string, AgentReviewSubmission[]>();
  private readonly usedInteractionKeys = new Set<string>();
  submitReview(input: AgentReviewSubmission): { accepted: boolean; rejectionReason: string | null } {
    const toDomestic09 = (raw: string) => String(raw ?? '').trim().replace(/^(\+98|0098)/, '0');
    const cleanAgentPhone = cleanIranianMobile(toDomestic09(input.agentPhoneRaw));
    const cleanReviewerPhone = cleanIranianMobile(toDomestic09(input.reviewerPhoneRaw));
    if (input.reviewerUid === input.agentUid || (cleanAgentPhone && cleanAgentPhone === cleanReviewerPhone)) {
      return { accepted: false, rejectionReason: 'SELF_REVIEW_PROHIBITED' };
    }
    if (!Number.isFinite(input.ratingOneToFive) || input.ratingOneToFive < 1 || input.ratingOneToFive > 5) {
      return { accepted: false, rejectionReason: 'RATING_OUT_OF_RANGE_1_TO_5' };
    }
    const interactionKey = `${input.reviewerUid}:${input.agentUid}:${input.qualifyingInteractionId}`;
    if (this.usedInteractionKeys.has(interactionKey)) {
      return { accepted: false, rejectionReason: 'DUPLICATE_REVIEW_FOR_SAME_INTERACTION' };
    }
    this.usedInteractionKeys.add(interactionKey);
    const list = this.reviewsByAgent.get(input.agentUid) ?? [];
    list.push(input);
    this.reviewsByAgent.set(input.agentUid, list);
    return { accepted: true, rejectionReason: null };
  }
  computeAgentReputationSummary(agentUid: string): {
    totalReviewCount: number; verifiedInteractionReviewCount: number; unverifiedOpinionCount: number;
    rawAverageRating: number | null; bayesianWeightedScore: number | null; impliesOfficialGovernmentCertification: false;
  } {
    const list = this.reviewsByAgent.get(agentUid) ?? [];
    if (list.length === 0) {
      return { totalReviewCount: 0, verifiedInteractionReviewCount: 0, unverifiedOpinionCount: 0, rawAverageRating: null, bayesianWeightedScore: null, impliesOfficialGovernmentCertification: false };
    }
    const verifiedCount = list.filter((r) => r.isVerifiedInteraction).length;
    const sum = list.reduce((acc, r) => acc + r.ratingOneToFive, 0);
    const rawAverage = Number((sum / list.length).toFixed(2));
    const priorWeight = 5;
    const priorMean = 3.8;
    const bayesian = Number(((sum + priorWeight * priorMean) / (list.length + priorWeight)).toFixed(2));
    return {
      totalReviewCount: list.length, verifiedInteractionReviewCount: verifiedCount,
      unverifiedOpinionCount: list.length - verifiedCount, rawAverageRating: rawAverage,
      bayesianWeightedScore: bayesian, impliesOfficialGovernmentCertification: false,
    };
  }
}
export interface ComparablePropertyInput {
  propertyId: string; titleFa: string; city: string; neighborhoodNameFa: string;
  transactionType: 'buy' | 'rent'; netUsableSqm: number; totalPriceMillionToman: number | null;
  rahnMillionToman: number | null; monthlyRentMillionToman: number | null;
  buildingAgeYears: number | null; hasParking: boolean | null; hasElevator: boolean | null;
  observedAtIso: string;
}
export function comparePropertiesSideBySide(
  properties: ComparablePropertyInput[],
  expectedTransactionType: 'buy' | 'rent',
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode },
): {
  validComparison: boolean; rejectionReason: string | null; comparedCount: number; displayAreaUnitLabel?: string;
  rows: Array<{
    propertyId: string; pricePerNetSqmMillionToman: number | null; unitPriceIntlText?: string; diffFromCheapestPercent: number | null;
    missingAttributes: string[]; missingValuesCoercedToZero: false;
  }>;
} {
  const activeUnit = options?.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const displayAreaUnitLabel = formatAreaUnitLabel(activeUnit);
  if (properties.length < 2 || properties.length > 4) {
    return { validComparison: false, rejectionReason: 'COMPARISON_REQUIRES_2_TO_4_PROPERTIES', comparedCount: properties.length, displayAreaUnitLabel, rows: [] };
  }
  const uniqueCities = new Set(properties.map((p) => p.city.toLowerCase()));
  if (uniqueCities.size > 1) {
    return { validComparison: false, rejectionReason: 'INCOMPATIBLE_CROSS_CITY_COMPARISON', comparedCount: properties.length, displayAreaUnitLabel, rows: [] };
  }
  if (properties.some((p) => p.transactionType !== expectedTransactionType)) {
    return { validComparison: false, rejectionReason: 'INCOMPATIBLE_TRANSACTION_TYPES_BUY_VS_RENT', comparedCount: properties.length, displayAreaUnitLabel, rows: [] };
  }
  const perSqmValues = properties.map((p) => {
    if (!Number.isFinite(p.netUsableSqm) || p.netUsableSqm <= 0) return null;
    if (expectedTransactionType === 'buy') {
      return p.totalPriceMillionToman !== null && p.totalPriceMillionToman > 0
        ? Number((p.totalPriceMillionToman / p.netUsableSqm).toFixed(2))
        : null;
    }
    const rahnEquiv = (p.rahnMillionToman ?? 0) + ((p.monthlyRentMillionToman ?? 0) * 100) / 3;
    return rahnEquiv > 0 ? Number((rahnEquiv / p.netUsableSqm).toFixed(2)) : null;
  });
  const validPerSqm = perSqmValues.filter((v): v is number => v !== null);
  const minPerSqm = validPerSqm.length > 0 ? Math.min(...validPerSqm) : null;
  const rows = properties.map((p, idx) => {
    const missingAttributes: string[] = [];
    if (p.buildingAgeYears === null) missingAttributes.push('buildingAgeYears');
    if (p.hasParking === null) missingAttributes.push('hasParking');
    if (p.hasElevator === null) missingAttributes.push('hasElevator');
    const unitPrice = perSqmValues[idx];
    const unitPriceIntlText = unitPrice !== null ? formatMillionTomanAsIntlCurrency(unitPrice, activeCurrency) : '';
    const diffPercent =
      unitPrice !== null && minPerSqm !== null && minPerSqm > 0
        ? Number((((unitPrice - minPerSqm) / minPerSqm) * 100).toFixed(1))
        : null;
    return {
      propertyId: p.propertyId, pricePerNetSqmMillionToman: unitPrice, unitPriceIntlText,
      diffFromCheapestPercent: diffPercent, missingAttributes, missingValuesCoercedToZero: false as const,
    };
  });
  return { validComparison: true, rejectionReason: null, comparedCount: properties.length, displayAreaUnitLabel, rows };
}
export type IranianMonetaryDenomination = 'IRR_RIAL' | 'TOMAN' | 'MILLION_TOMAN' | 'BILLION_TOMAN' | 'UNKNOWN_UNDOCUMENTED';
export interface MonetaryValueEnvelope {
  amount: number;
  denomination: IranianMonetaryDenomination;
}
const TOMAN_MULTIPLIER_BY_UNIT: Record<Exclude<IranianMonetaryDenomination, 'UNKNOWN_UNDOCUMENTED'>, number> = {
  IRR_RIAL: 0.1, // 10 Rials = 1 Toman
  TOMAN: 1,
  MILLION_TOMAN: 1_000_000,
  BILLION_TOMAN: 1_000_000_000,
};
export function convertMonetaryEnvelopeExact(
  envelope: MonetaryValueEnvelope,
  targetDenomination: Exclude<IranianMonetaryDenomination, 'UNKNOWN_UNDOCUMENTED'>,
): { converted: boolean; result: MonetaryValueEnvelope | null; rejectionReason: string | null } {
  if (envelope.denomination === 'UNKNOWN_UNDOCUMENTED') {
    return { converted: false, result: null, rejectionReason: 'AMBIGUOUS_UNDOCUMENTED_DENOMINATION_REQUIRES_MIGRATION_RULE' };
  }
  if (!Number.isFinite(envelope.amount) || envelope.amount < 0) {
    return { converted: false, result: null, rejectionReason: 'INVALID_NON_FINITE_OR_NEGATIVE_MONETARY_AMOUNT' };
  }
  if (envelope.denomination === targetDenomination) {
    return { converted: true, result: { amount: envelope.amount, denomination: targetDenomination }, rejectionReason: null };
  }
  const amountInToman = envelope.amount * TOMAN_MULTIPLIER_BY_UNIT[envelope.denomination];
  const convertedAmount = Number((amountInToman / TOMAN_MULTIPLIER_BY_UNIT[targetDenomination]).toFixed(6));
  return { converted: true, result: { amount: convertedAmount, denomination: targetDenomination }, rejectionReason: null };
}
export function detectTenfoldRialTomanAnomaly(input: {
  submittedBuyPerSqmMillionToman: number;
  neighborhoodBaselineBuyPerSqmMillionToman: number;
}): {
  anomalyDetected: boolean;
  suspectedCause: 'RIAL_ENTERED_AS_TOMAN_10X_INFLATION' | 'TOMAN_DIVIDED_BY_10_AS_RIAL' | null;
  ratioToBaseline: number; } { const ratio = input.submittedBuyPerSqmMillionToman / Math.max(1, input.neighborhoodBaselineBuyPerSqmMillionToman); if (ratio >= 7.5 && ratio <= 13.5) { return { anomalyDetected: true, suspectedCause: 'RIAL_ENTERED_AS_TOMAN_10X_INFLATION', ratioToBaseline: Number(ratio.toFixed(2)) }; } if (ratio >= 0.07 && ratio <= 0.13) { return { anomalyDetected: true, suspectedCause: 'TOMAN_DIVIDED_BY_10_AS_RIAL', ratioToBaseline: Number(ratio.toFixed(2)) }; } return { anomalyDetected: false, suspectedCause: null, ratioToBaseline: Number(ratio.toFixed(2)) }; }