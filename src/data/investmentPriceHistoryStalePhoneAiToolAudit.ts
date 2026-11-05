import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';
export interface RealEstateInvestmentScenarioInput { purchasePriceMillionToman: number; acquisitionCostsMillionToman: number; monthlyContractualOrEstimatedRentMillionToman: number; rahnDepositMillionToman: number; vacancyRatePercent: number; annualOperatingMaintenanceMillionToman: number; annualTaxesAndInsuranceMillionToman: number; annualDebtServiceFinancingMillionToman: number; holdingPeriodYears: number; annualDiscountRatePercent: number; expectedExitNetProceedsMillionToman: number;
} export function calculateRealEstateInvestmentAnalysis( input: RealEstateInvestmentScenarioInput, options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode } ): { valid: boolean; rejectionReason: string | null; grossAnnualRentalIncomeMillion: number; effectiveGrossIncomeAfterVacancyMillion: number; netOperatingIncomeMillion: number;
  annualCashFlowAfterFinancingMillion: number; grossRentalYieldPercent: number; netRentalYieldOnTotalCostPercent: number; capRatePercent: number;
  npvMillionToman: number; displayAreaUnitLabel?: string; npvIntlText?: string; financingExcludedFromNoi: true; returnClassification: 'HYPOTHETICAL_SCENARIO_NOT_GUARANTEED_RETURN'; } {
  const activeUnit = options?.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const displayAreaUnitLabel = formatAreaUnitLabel(activeUnit);
  if ( !Number.isFinite(input.purchasePriceMillionToman) || input.purchasePriceMillionToman <= 0 ||
    input.acquisitionCostsMillionToman < 0 || input.monthlyContractualOrEstimatedRentMillionToman < 0 || input.rahnDepositMillionToman < 0
  ) { return { valid: false, rejectionReason: 'INVALID_NON_POSITIVE_PURCHASE_PRICE_OR_NEGATIVE_INPUTS', grossAnnualRentalIncomeMillion: 0, effectiveGrossIncomeAfterVacancyMillion: 0, netOperatingIncomeMillion: 0, annualCashFlowAfterFinancingMillion: 0, grossRentalYieldPercent: 0, netRentalYieldOnTotalCostPercent: 0,
      capRatePercent: 0, npvMillionToman: 0, displayAreaUnitLabel, npvIntlText: formatMillionTomanAsIntlCurrency(0, activeCurrency), financingExcludedFromNoi: true, returnClassification: 'HYPOTHETICAL_SCENARIO_NOT_GUARANTEED_RETURN',
    }; }
  if (input.vacancyRatePercent < 0 || input.vacancyRatePercent > 100) { return { valid: false, rejectionReason: 'VACANCY_RATE_OUT_OF_RANGE_0_TO_100',
      grossAnnualRentalIncomeMillion: 0, effectiveGrossIncomeAfterVacancyMillion: 0, netOperatingIncomeMillion: 0, annualCashFlowAfterFinancingMillion: 0,
      grossRentalYieldPercent: 0, netRentalYieldOnTotalCostPercent: 0, capRatePercent: 0, npvMillionToman: 0,
      displayAreaUnitLabel, npvIntlText: formatMillionTomanAsIntlCurrency(0, activeCurrency), financingExcludedFromNoi: true, returnClassification: 'HYPOTHETICAL_SCENARIO_NOT_GUARANTEED_RETURN',
    };
  }
  const monthlyEquivalentRent = input.monthlyContractualOrEstimatedRentMillionToman + (input.rahnDepositMillionToman * 3) / 100;
  const grossAnnualRent = Number((monthlyEquivalentRent * 12).toFixed(2));
  const vacancyMultiplier = 1 - input.vacancyRatePercent / 100;
  const effectiveGrossIncome = Number((grossAnnualRent * vacancyMultiplier).toFixed(2));
  const operatingExpenses = input.annualOperatingMaintenanceMillionToman + input.annualTaxesAndInsuranceMillionToman;
  const noi = Number((effectiveGrossIncome - operatingExpenses).toFixed(2));
  const annualCashFlow = Number((noi - input.annualDebtServiceFinancingMillionToman).toFixed(2));
  const totalAcquisitionCost = input.purchasePriceMillionToman + input.acquisitionCostsMillionToman;
  const grossRentalYieldPercent = Number(((grossAnnualRent / input.purchasePriceMillionToman) * 100).toFixed(2));
  const capRatePercent = Number(((noi / input.purchasePriceMillionToman) * 100).toFixed(2));
  const netRentalYieldOnTotalCostPercent = Number(((noi / totalAcquisitionCost) * 100).toFixed(2));
  const r = input.annualDiscountRatePercent / 100;
  const years = Math.max(1, Math.min(30, Math.round(input.holdingPeriodYears)));
  let pvSum = -totalAcquisitionCost;
  for (let t = 1; t <= years; t++) {
    const cf = t === years ? annualCashFlow + input.expectedExitNetProceedsMillionToman : annualCashFlow;
    pvSum += cf / Math.pow(1 + r, t);
  }
  const npvMillionToman = Number(pvSum.toFixed(2));
  return {
    valid: true, rejectionReason: null, grossAnnualRentalIncomeMillion: grossAnnualRent,
    effectiveGrossIncomeAfterVacancyMillion: effectiveGrossIncome, netOperatingIncomeMillion: noi,
    annualCashFlowAfterFinancingMillion: annualCashFlow, grossRentalYieldPercent, netRentalYieldOnTotalCostPercent,
    capRatePercent, npvMillionToman, displayAreaUnitLabel, npvIntlText: formatMillionTomanAsIntlCurrency(Math.max(0, npvMillionToman), activeCurrency),
    financingExcludedFromNoi: true, returnClassification: 'HYPOTHETICAL_SCENARIO_NOT_GUARANTEED_RETURN',
  };
}
export interface ListingPriceRevisionEntry {
  revisionNumber: number;
  listingId: string;
  priceField: 'SALE_TOTAL_MILLION_TOMAN' | 'RENT_DEPOSIT_MILLION_TOMAN' | 'MONTHLY_RENT_MILLION_TOMAN';
  previousPriceMillion: number;
  newPriceMillion: number;
  changePercentFromPrevious: number;
  changePercentFromInitial: number;
  actorUid: string;
  actorRole: 'OWNER_OR_AGENT' | 'ADMIN_CORRECTION';
  recordedAtMs: number;
}
export class IndividualListingPriceHistoryLedger {
  private readonly initialPriceByKey = new Map<string, number>();
  private readonly currentPriceByKey = new Map<string, number>();
  private readonly revisionsByKey = new Map<string, ListingPriceRevisionEntry[]>();
  private readonly seenIdempotencyKeys = new Set<string>();
  registerInitialListingPrice(input: {
    listingId: string;
    priceField: ListingPriceRevisionEntry['priceField'];
    initialPriceMillion: number;
  }): void {
    const key = `${input.listingId}:${input.priceField}`;
    if (!this.initialPriceByKey.has(key)) {
      this.initialPriceByKey.set(key, input.initialPriceMillion);
      this.currentPriceByKey.set(key, input.initialPriceMillion);
      this.revisionsByKey.set(key, []);
    }
  }
  recordListingUpdate(input: {
    listingId: string;
    idempotencyKey: string;
    priceField: ListingPriceRevisionEntry['priceField'];
    submittedPriceMillion: number;
    actorUid: string;
    actorRole: ListingPriceRevisionEntry['actorRole'];
    nowMs: number;
  }): {
    priceRevisionCreated: boolean;
    deduplicatedOrUnchangedSkip: boolean;
    entry: ListingPriceRevisionEntry | null;
  } {
    const key = `${input.listingId}:${input.priceField}`;
    if (this.seenIdempotencyKeys.has(input.idempotencyKey)) {
      return { priceRevisionCreated: false, deduplicatedOrUnchangedSkip: true, entry: null };
    }
    const currentPrice = this.currentPriceByKey.get(key);
    const initialPrice = this.initialPriceByKey.get(key);
    if (currentPrice === undefined || initialPrice === undefined) {
      throw new Error(`LISTING_PRICE_HISTORY_UNINITIALIZED: ${key}`);
    }
    this.seenIdempotencyKeys.add(input.idempotencyKey);
    if (Math.abs(input.submittedPriceMillion - currentPrice) < 1e-6) {
      return { priceRevisionCreated: false, deduplicatedOrUnchangedSkip: true, entry: null };
    }
    const list = this.revisionsByKey.get(key) ?? [];
    const changeFromPrev = Number(
      (((input.submittedPriceMillion - currentPrice) / Math.max(1, currentPrice)) * 100).toFixed(2),
    );
    const changeFromInit = Number(
      (((input.submittedPriceMillion - initialPrice) / Math.max(1, initialPrice)) * 100).toFixed(2),
    );
    const entry: ListingPriceRevisionEntry = {
      revisionNumber: list.length + 1,
      listingId: input.listingId,
      priceField: input.priceField,
      previousPriceMillion: currentPrice,
      newPriceMillion: input.submittedPriceMillion,
      changePercentFromPrevious: changeFromPrev,
      changePercentFromInitial: changeFromInit,
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      recordedAtMs: input.nowMs,
    };
    list.push(entry);
    this.revisionsByKey.set(key, list);
    this.currentPriceByKey.set(key, input.submittedPriceMillion);
    return { priceRevisionCreated: true, deduplicatedOrUnchangedSkip: false, entry };
  }
  getHistory(listingId: string, priceField: ListingPriceRevisionEntry['priceField']): {
    initialPriceMillion: number | null;
    currentPriceMillion: number | null;
    revisions: ReadonlyArray<ListingPriceRevisionEntry>;
  } {
    const key = `${listingId}:${priceField}`;
    return {
      initialPriceMillion: this.initialPriceByKey.get(key) ?? null,
      currentPriceMillion: this.currentPriceByKey.get(key) ?? null,
      revisions: this.revisionsByKey.get(key) ?? [],
    };
  }
}
export interface ListingFreshnessAuditInput {
  listingId: string; status: 'PUBLISHED' | 'SOLD' | 'RENTED' | 'WITHDRAWN' | 'EXPIRED' | 'SUSPENDED';
  advertiserAccountActive: boolean; hasValidContactChannel: boolean; publishedAtMs: number;
  lastSubstantiveEditAtMs: number; lastNonSubstantiveCosmeticEditAtMs: number;
  lastOwnerAvailabilityConfirmedAtMs: number; expiresAtMs: number; nowMs: number;
}
export function evaluateListingAvailabilityFreshness(input: ListingFreshnessAuditInput): {
  includeInActivePublicInventory: boolean; effectiveFreshnessTimestampMs: number;
  nonSubstantiveEditIgnoredForFreshness: true; automaticallyMarkedSoldDueToAge: false;
  freshnessBadge: 'VERIFIED_FRESH_ACTIVE' | 'AGING_NEEDS_OWNER_CONFIRMATION' | 'EXCLUDED_INACTIVE_OR_EXPIRED';
  daysSinceLastAvailabilityConfirmation: number;
} {
  const effectiveFreshnessTimestampMs = Math.max(
    input.publishedAtMs, input.lastSubstantiveEditAtMs, input.lastOwnerAvailabilityConfirmedAtMs,
  );
  const daysSinceConfirm = Math.max(0, Math.floor((input.nowMs - input.lastOwnerAvailabilityConfirmedAtMs) / (24 * 60 * 60 * 1000)));
  if (
    input.status !== 'PUBLISHED' || !input.advertiserAccountActive ||
    !input.hasValidContactChannel || input.nowMs >= input.expiresAtMs
  ) {
    return {
      includeInActivePublicInventory: false, effectiveFreshnessTimestampMs,
      nonSubstantiveEditIgnoredForFreshness: true, automaticallyMarkedSoldDueToAge: false,
      freshnessBadge: 'EXCLUDED_INACTIVE_OR_EXPIRED', daysSinceLastAvailabilityConfirmation: daysSinceConfirm,
    };
  }
  const freshThresholdDays = 21;
  return {
    includeInActivePublicInventory: true, effectiveFreshnessTimestampMs,
    nonSubstantiveEditIgnoredForFreshness: true, automaticallyMarkedSoldDueToAge: false,
    freshnessBadge: daysSinceConfirm <= freshThresholdDays ? 'VERIFIED_FRESH_ACTIVE' : 'AGING_NEEDS_OWNER_CONFIRMATION',
    daysSinceLastAvailabilityConfirmation: daysSinceConfirm,
  };
}
export function normalizeAndValidateIranianPhone(rawInput: string): {
  valid: boolean; numberType: 'IRAN_MOBILE' | 'IRAN_LANDLINE' | 'INVALID';
  canonicalE164: string | null; canonicalDomesticWithLeadingZero: string | null;
  spreadsheetSafeProtectedText: string | null; provesIdentityOwnershipWithoutOtp: false;
} {
  const asciiDigitsAndPlus = String(rawInput ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u200B-\u200F\u202A-\u202E\s()-]/g, '');
  let nationalDigits = '';
  if (asciiDigitsAndPlus.startsWith('+98')) nationalDigits = asciiDigitsAndPlus.slice(3);
  else if (asciiDigitsAndPlus.startsWith('0098')) nationalDigits = asciiDigitsAndPlus.slice(4);
  else if (asciiDigitsAndPlus.startsWith('98') && asciiDigitsAndPlus.length === 12) nationalDigits = asciiDigitsAndPlus.slice(2);
  else if (asciiDigitsAndPlus.startsWith('0')) nationalDigits = asciiDigitsAndPlus.slice(1);
  else nationalDigits = asciiDigitsAndPlus;
  if (/^9(0[1-5]|1[0-9]|2[0-3]|3[0-9]|9[0-6])\d{7}$/.test(nationalDigits)) {
    const domestic = `0${nationalDigits}`;
    return {
      valid: true, numberType: 'IRAN_MOBILE', canonicalE164: `+98${nationalDigits}`,
      canonicalDomesticWithLeadingZero: domestic, spreadsheetSafeProtectedText: `'${domestic}`,
      provesIdentityOwnershipWithoutOtp: false,
    };
  }
  if (/^[1-8][1-9]\d{8}$/.test(nationalDigits)) {
    const domestic = `0${nationalDigits}`;
    return {
      valid: true, numberType: 'IRAN_LANDLINE', canonicalE164: `+98${nationalDigits}`,
      canonicalDomesticWithLeadingZero: domestic, spreadsheetSafeProtectedText: `'${domestic}`,
      provesIdentityOwnershipWithoutOtp: false,
    };
  }
  return {
    valid: false, numberType: 'INVALID', canonicalE164: null,
    canonicalDomesticWithLeadingZero: null, spreadsheetSafeProtectedText: null,
    provesIdentityOwnershipWithoutOtp: false,
  };
}
export type AllowedRuntimeAiToolName =
  | 'READ_NEIGHBORHOOD_MARKET_STATS' | 'CALCULATE_HEDONIC_VALUATION' | 'FLAG_LISTING_FOR_HUMAN_MODERATION';
export class RuntimeAiToolExecutionGuard {
  private readonly callCountsByTurn = new Map<string, number>();
  static readonly MAX_TOOL_CALLS_PER_TURN = 3;
  executeProposedToolCall(input: {
    turnId: string; proposedToolName: string; proposedArgs: Record<string, unknown>;
    authenticatedUserUid: string | null; authenticatedUserRole: 'ANONYMOUS' | 'USER' | 'ADMIN';
    humanUserExplicitlyConfirmedAction: boolean; untrustedListingContextText?: string;
  }): {
    executed: boolean; rejectionReason: string | null; promptInjectionDetectedInContext: boolean;
    toolImpactClassification: 'READ_ONLY' | 'CONSEQUENTIAL_MODERATION_WRITE' | 'PROHIBITED_UNKNOWN';
  } {
    const promptInjectionDetectedInContext =
      typeof input.untrustedListingContextText === 'string' &&
      /(ignore previous instructions|system prompt|call tool|delete_all|grant_admin)/i.test(input.untrustedListingContextText);
    const allowedTools = new Set<string>([
      'READ_NEIGHBORHOOD_MARKET_STATS', 'CALCULATE_HEDONIC_VALUATION', 'FLAG_LISTING_FOR_HUMAN_MODERATION',
    ]);
    if (!allowedTools.has(input.proposedToolName)) {
      return {
        executed: false, rejectionReason: 'UNREGISTERED_OR_PROHIBITED_AI_TOOL',
        promptInjectionDetectedInContext, toolImpactClassification: 'PROHIBITED_UNKNOWN',
      };
    }
    const usedCalls = this.callCountsByTurn.get(input.turnId) ?? 0;
    const impact = input.proposedToolName === 'FLAG_LISTING_FOR_HUMAN_MODERATION' ? 'CONSEQUENTIAL_MODERATION_WRITE' : 'READ_ONLY';
    if (usedCalls >= RuntimeAiToolExecutionGuard.MAX_TOOL_CALLS_PER_TURN) {
      return {
        executed: false, rejectionReason: 'AI_TOOL_CALL_BUDGET_EXCEEDED_FOR_TURN',
        promptInjectionDetectedInContext, toolImpactClassification: impact,
      };
    }
    if (input.proposedToolName === 'FLAG_LISTING_FOR_HUMAN_MODERATION') {
      if (promptInjectionDetectedInContext) {
        return {
          executed: false, rejectionReason: 'BLOCKED_CONSEQUENTIAL_TOOL_UNDER_UNTRUSTED_PROMPT_INJECTION',
          promptInjectionDetectedInContext: true, toolImpactClassification: 'CONSEQUENTIAL_MODERATION_WRITE',
        };
      }
      if (input.authenticatedUserRole !== 'ADMIN') {
        return {
          executed: false, rejectionReason: 'SERVER_RBAC_FORBIDDEN_MODEL_CANNOT_ESCALATE_USER_PERMISSIONS',
          promptInjectionDetectedInContext, toolImpactClassification: 'CONSEQUENTIAL_MODERATION_WRITE',
        };
      }
      if (!input.humanUserExplicitlyConfirmedAction) {
        return {
          executed: false, rejectionReason: 'HUMAN_CONFIRMATION_REQUIRED_FOR_STATE_MODIFYING_TOOL',
          promptInjectionDetectedInContext, toolImpactClassification: 'CONSEQUENTIAL_MODERATION_WRITE',
        };
      }
    }
    const allowedArgKeys =
      input.proposedToolName === 'READ_NEIGHBORHOOD_MARKET_STATS' ? new Set(['hoodId', 'city'])
      : input.proposedToolName === 'CALCULATE_HEDONIC_VALUATION' ? new Set(['hoodId', 'sqm', 'buildYear'])
      : new Set(['listingId', 'reason']);
    for (const argKey of Object.keys(input.proposedArgs)) {
      if (!allowedArgKeys.has(argKey)) { return {
          executed: false, rejectionReason: `UNEXPECTED_TOOL_ARGUMENT_REJECTED:${argKey}`,
          promptInjectionDetectedInContext, toolImpactClassification: 'READ_ONLY', }; } } this.callCountsByTurn.set(input.turnId, usedCalls + 1); return { executed: true, rejectionReason: null, promptInjectionDetectedInContext, toolImpactClassification: impact, }; } }