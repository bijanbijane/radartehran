/**
 * @file server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts
 * @description Explicit policy/claim transition guards, contractual settlement validation,
 * and evidence-aware policy coverage evaluation. This module never infers coverage from a
 * policy label alone and never treats user-submitted records as authoritative verification.
 */
import type {
  InsuranceClaimLifecycleStatus,
  InsuranceClaimRecord,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  PolicyCoverageRecord,
  PolicyExclusionOrLimitationRecord,
  RiskCoverageCategory,
} from '../domain/types';

const POLICY_TRANSITIONS: Readonly<Record<InsurancePolicyLifecycleStatus, ReadonlySet<InsurancePolicyLifecycleStatus>>> = {
  DRAFT: new Set(['SUBMITTED', 'PENDING_VERIFICATION', 'CANCELLED']),
  SUBMITTED: new Set(['PENDING_VERIFICATION', 'CANCELLED']),
  PENDING_VERIFICATION: new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED', 'DISPUTED']),
  ACTIVE: new Set(['SUSPENDED', 'EXPIRED', 'CANCELLED', 'NON_RENEWED', 'DISPUTED']),
  SUSPENDED: new Set(['ACTIVE', 'EXPIRED', 'CANCELLED', 'DISPUTED']),
  EXPIRED: new Set(),
  CANCELLED: new Set(),
  NON_RENEWED: new Set(),
  DISPUTED: new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED', 'NON_RENEWED']),
  UNKNOWN: new Set(),
};

const CLAIM_TRANSITIONS: Readonly<Record<InsuranceClaimLifecycleStatus, ReadonlySet<InsuranceClaimLifecycleStatus>>> = {
  DRAFT: new Set(['REPORTED', 'SUBMITTED', 'WITHDRAWN']),
  REPORTED: new Set(['SUBMITTED', 'WITHDRAWN']),
  SUBMITTED: new Set(['ACKNOWLEDGED', 'UNDER_REVIEW', 'WITHDRAWN']),
  ACKNOWLEDGED: new Set(['UNDER_REVIEW', 'INSPECTION_REQUIRED', 'ADDITIONAL_EVIDENCE_REQUIRED', 'WITHDRAWN', 'DISPUTED']),
  UNDER_REVIEW: new Set(['INSPECTION_REQUIRED', 'ADDITIONAL_EVIDENCE_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'DISPUTED']),
  INSPECTION_REQUIRED: new Set(['UNDER_REVIEW', 'ADDITIONAL_EVIDENCE_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'DISPUTED']),
  ADDITIONAL_EVIDENCE_REQUIRED: new Set(['SUBMITTED', 'UNDER_REVIEW', 'WITHDRAWN', 'DISPUTED']),
  APPROVED: new Set(['SETTLEMENT_PENDING', 'DISPUTED', 'CLOSED']),
  PARTIALLY_APPROVED: new Set(['SETTLEMENT_PENDING', 'DISPUTED', 'CLOSED']),
  REJECTED: new Set(['DISPUTED', 'CLOSED']),
  SETTLEMENT_PENDING: new Set(['SETTLED', 'DISPUTED']),
  SETTLED: new Set(['DISPUTED', 'CLOSED']),
  WITHDRAWN: new Set(['CLOSED']),
  DISPUTED: new Set(['UNDER_REVIEW', 'SETTLEMENT_PENDING', 'SETTLED', 'CLOSED']),
  CLOSED: new Set(),
};

export function assertValidPolicyStateTransition(
  from: InsurancePolicyLifecycleStatus,
  to: InsurancePolicyLifecycleStatus,
): void {
  if (from === to || !POLICY_TRANSITIONS[from]?.has(to)) {
    throw new Error(`INVALID_POLICY_STATE_TRANSITION:${from}->${to}`);
  }
}

export function assertValidClaimStateTransition(
  from: InsuranceClaimLifecycleStatus,
  to: InsuranceClaimLifecycleStatus,
): void {
  if (from === to || !CLAIM_TRANSITIONS[from]?.has(to)) {
    throw new Error(`INVALID_CLAIM_STATE_TRANSITION:${from}->${to}`);
  }
}

export interface SettlementCalculationInput {
  verifiedEligibleLossAmount: number;
  deductibleAppliedAmount: number;
  approvedSettlementAmount: number;
  rejectedAmount: number;
  applicableCoverageLimit: number | null;
  contractualMinimumDeductible?: number;
}

export interface SettlementCalculationResult {
  partiallyApprovedFlag: boolean;
  netEligibleAfterDeductible: number;
  totalAllocatedAmount: number;
}

export function validateSettlementCalculations(
  input: SettlementCalculationInput,
): SettlementCalculationResult {
  const values = [
    input.verifiedEligibleLossAmount,
    input.deductibleAppliedAmount,
    input.approvedSettlementAmount,
    input.rejectedAmount,
    input.contractualMinimumDeductible ?? 0,
  ];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    (input.applicableCoverageLimit !== null &&
      (!Number.isFinite(input.applicableCoverageLimit) || input.applicableCoverageLimit < 0))
  ) {
    throw new Error('INVALID_SETTLEMENT_AMOUNTS');
  }

  const verifiedLoss = input.verifiedEligibleLossAmount;
  const deductible = input.deductibleAppliedAmount;
  const minimumDeductible = input.contractualMinimumDeductible ?? 0;
  if (deductible + Number.EPSILON < minimumDeductible) {
    throw new Error('DEDUCTIBLE_BELOW_CONTRACTUAL_MINIMUM');
  }
  if (deductible > verifiedLoss) {
    throw new Error('INVALID_SETTLEMENT_AMOUNTS:DEDUCTIBLE_EXCEEDS_VERIFIED_LOSS');
  }

  const netEligibleAfterDeductible = Math.max(0, verifiedLoss - deductible);
  if (
    input.applicableCoverageLimit !== null &&
    input.approvedSettlementAmount > input.applicableCoverageLimit
  ) {
    throw new Error('SETTLEMENT_EXCEEDS_COVERAGE_LIMIT');
  }

  const totalAllocatedAmount = input.approvedSettlementAmount + input.rejectedAmount;
  if (totalAllocatedAmount > netEligibleAfterDeductible + 0.000001) {
    throw new Error('SETTLEMENT_EXCEEDS_ELIGIBLE_AFTER_DEDUCTIBLE');
  }

  return {
    partiallyApprovedFlag: input.rejectedAmount > 0 || input.approvedSettlementAmount < netEligibleAfterDeductible,
    netEligibleAfterDeductible,
    totalAllocatedAmount,
  };
}

export type PolicyApplicabilityConclusion =
  | 'NOT_EVALUATED'
  | 'POLICY_NOT_VERIFIED_ACTIVE'
  | 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM'
  | 'EXCLUDED_BY_EXPLICIT_LIMITATION'
  | 'ELIGIBLE_SUBJECT_TO_ADJUSTMENT';

export interface PolicyCoverageEvaluationReport {
  policyId: string;
  evaluatedAtIso: string;
  distinctValidityDimensions: {
    confirmedByProviderAuthoritative: boolean;
    currentlyWithinStatedEffectivePeriod: boolean;
    independentlyVerifiedActiveCoverage: boolean;
  };
  queriedRiskEvaluation: {
    riskCategory: RiskCoverageCategory | null;
    assetCanonicalId: string | null;
    incidentDateIso: string | null;
    applicabilityConclusion: PolicyApplicabilityConclusion;
    matchedCoverageIds: string[];
    applicableCoverageLimit: number | null;
    deductibleMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_LOSS' | null;
    deductibleValue: number | null;
    limitations: string[];
  };
  verificationLimitations: string[];
}

function parseEpoch(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function addUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function limitationAppliesToAsset(
  limitation: PolicyExclusionOrLimitationRecord,
  assetCanonicalId: string | undefined,
): boolean {
  const affected = limitation.affectedAssetCanonicalIds;
  if (!Array.isArray(affected) || affected.length === 0) return true;
  return Boolean(assetCanonicalId && affected.includes(assetCanonicalId));
}

export function evaluatePolicyCoverageStatusWithLimitations(input: {
  policy: InsurancePolicyRecord;
  coverages: PolicyCoverageRecord[];
  exclusions: PolicyExclusionOrLimitationRecord[];
  asOfIso: string;
  queryRiskCategory?: RiskCoverageCategory;
  queryAssetCanonicalId?: string;
  incidentDateIso?: string;
}): PolicyCoverageEvaluationReport {
  const { policy } = input;
  const verificationLimitations: string[] = [];
  const queryLimitations: string[] = [];
  const asOfEpoch = parseEpoch(input.asOfIso);
  const policyStartEpoch = parseEpoch(policy.coverageStartIso);
  const policyEndEpoch = parseEpoch(policy.coverageEndIso);

  if (asOfEpoch === null) addUnique(verificationLimitations, 'INVALID_AS_OF_TIMESTAMP');
  if (policyStartEpoch === null || policyEndEpoch === null || policyEndEpoch < policyStartEpoch) {
    addUnique(verificationLimitations, 'POLICY_EFFECTIVE_PERIOD_INVALID_OR_UNAVAILABLE');
  }

  const currentlyWithinStatedEffectivePeriod =
    asOfEpoch !== null &&
    policyStartEpoch !== null &&
    policyEndEpoch !== null &&
    asOfEpoch >= policyStartEpoch &&
    asOfEpoch <= policyEndEpoch;

  if (!currentlyWithinStatedEffectivePeriod) {
    addUnique(verificationLimitations, 'POLICY_NOT_CURRENTLY_WITHIN_STATED_EFFECTIVE_PERIOD');
  }

  const confirmedByProviderAuthoritative =
    policy.verificationStatus === 'PROVIDER_CONFIRMED_AUTHORITATIVE' &&
    policy.providerConfirmedActive === true;
  if (!confirmedByProviderAuthoritative) {
    addUnique(verificationLimitations, 'AUTHORITATIVE_PROVIDER_CONFIRMATION_UNAVAILABLE');
  }

  const outstandingPremium = policy.financialStructure?.outstandingPremiumAmount;
  const premiumStatusKnown = typeof outstandingPremium === 'number' && Number.isFinite(outstandingPremium);
  const premiumCurrent = premiumStatusKnown && outstandingPremium <= 0;
  if (!premiumStatusKnown) {
    addUnique(verificationLimitations, 'OUTSTANDING_PREMIUM_STATUS_UNAVAILABLE');
  } else if (!premiumCurrent) {
    addUnique(verificationLimitations, 'OUTSTANDING_PREMIUM_REMAINS');
  }

  if (policy.status !== 'ACTIVE') addUnique(verificationLimitations, 'POLICY_STATUS_NOT_ACTIVE');

  const independentlyVerifiedActiveCoverage =
    policy.status === 'ACTIVE' &&
    confirmedByProviderAuthoritative &&
    currentlyWithinStatedEffectivePeriod &&
    premiumCurrent;

  const riskCategory = input.queryRiskCategory ?? null;
  const assetCanonicalId = input.queryAssetCanonicalId?.trim() || null;
  const incidentDateIso = input.incidentDateIso ?? null;
  let applicabilityConclusion: PolicyApplicabilityConclusion = 'NOT_EVALUATED';
  let matchedCoverages: PolicyCoverageRecord[] = [];

  if (riskCategory) {
    const incidentEpoch = incidentDateIso === null ? asOfEpoch : parseEpoch(incidentDateIso);
    if (!independentlyVerifiedActiveCoverage || incidentEpoch === null) {
      applicabilityConclusion = 'POLICY_NOT_VERIFIED_ACTIVE';
      if (incidentDateIso !== null && incidentEpoch === null) {
        addUnique(queryLimitations, 'INCIDENT_DATE_INVALID');
      }
    } else if (
      policyStartEpoch === null ||
      policyEndEpoch === null ||
      incidentEpoch < policyStartEpoch ||
      incidentEpoch > policyEndEpoch
    ) {
      applicabilityConclusion = 'POLICY_NOT_VERIFIED_ACTIVE';
      addUnique(queryLimitations, 'INCIDENT_OUTSIDE_POLICY_EFFECTIVE_PERIOD');
    } else if (
      assetCanonicalId &&
      Array.isArray(policy.insuredPropertyCanonicalIds) &&
      policy.insuredPropertyCanonicalIds.length > 0 &&
      !policy.insuredPropertyCanonicalIds.includes(assetCanonicalId)
    ) {
      applicabilityConclusion = 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM';
      addUnique(queryLimitations, 'ASSET_NOT_LISTED_AS_INSURED_UNDER_POLICY');
    } else {
      matchedCoverages = input.coverages.filter((coverage) => {
        if (coverage.policyId !== policy.policyId) return false;
        if (coverage.coverageCategory !== riskCategory) return false;
        if (
          assetCanonicalId &&
          (!Array.isArray(coverage.insuredAssetCanonicalIds) ||
            !coverage.insuredAssetCanonicalIds.includes(assetCanonicalId))
        ) {
          return false;
        }
        const coverageStart = parseEpoch(coverage.effectiveStartIso);
        const coverageEnd = parseEpoch(coverage.effectiveEndIso);
        if (coverageStart === null || coverageEnd === null || coverageEnd < coverageStart) return false;
        return incidentEpoch >= coverageStart && incidentEpoch <= coverageEnd;
      });

      if (matchedCoverages.length === 0) {
        applicabilityConclusion = 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM';
      } else {
        const matchingLimitation = input.exclusions.find((limitation) => {
          if (limitation.policyId !== policy.policyId) return false;
          if (!limitation.excludedRiskCategories?.includes(riskCategory)) return false;
          if (!limitationAppliesToAsset(limitation, assetCanonicalId ?? undefined)) return false;

          const isWaitingPeriod =
            limitation.limitationCategory === 'WAITING_PERIOD' ||
            limitation.limitationCategory === 'WAITING_PERIOD_LIMITATION';
          if (isWaitingPeriod && typeof limitation.waitingPeriodDays === 'number' && limitation.waitingPeriodDays > 0) {
            const waitingStartEpoch = policyStartEpoch ?? asOfEpoch;
            return waitingStartEpoch !== null &&
              incidentEpoch < waitingStartEpoch + limitation.waitingPeriodDays * 86_400_000;
          }
          return !isWaitingPeriod;
        });

        applicabilityConclusion = matchingLimitation
          ? 'EXCLUDED_BY_EXPLICIT_LIMITATION'
          : 'ELIGIBLE_SUBJECT_TO_ADJUSTMENT';
        if (matchingLimitation) {
          addUnique(queryLimitations, `EXPLICIT_LIMITATION_APPLIES:${matchingLimitation.limitationId}`);
        }
      }
    }
  }

  const coverageLimitValues = matchedCoverages
    .map((coverage) => coverage.coverageLimitAmount)
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const applicableCoverageLimit =
    coverageLimitValues.length > 0 ? Math.min(...coverageLimitValues) : null;
  const firstCoverage = matchedCoverages[0];

  return {
    policyId: policy.policyId,
    evaluatedAtIso: input.asOfIso,
    distinctValidityDimensions: {
      confirmedByProviderAuthoritative,
      currentlyWithinStatedEffectivePeriod,
      independentlyVerifiedActiveCoverage,
    },
    queriedRiskEvaluation: {
      riskCategory,
      assetCanonicalId,
      incidentDateIso,
      applicabilityConclusion,
      matchedCoverageIds: matchedCoverages.map((coverage) => coverage.coverageId),
      applicableCoverageLimit,
      deductibleMethod: firstCoverage?.deductibleMethod ?? null,
      deductibleValue: firstCoverage?.deductibleValue ?? null,
      limitations: queryLimitations,
    },
    verificationLimitations,
  };
}
