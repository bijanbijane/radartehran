import { CoreApiError } from '../../core';
import type {
  InsuranceClaimLifecycleStatus,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  PolicyCoverageRecord,
  PolicyExclusionOrLimitationRecord,
  RiskCoverageCategory,
} from '../domain/types';

const POLICY_TRANSITIONS: Record<InsurancePolicyLifecycleStatus, readonly InsurancePolicyLifecycleStatus[]> = {
  DRAFT: ['SUBMITTED', 'PENDING_VERIFICATION', 'CANCELLED'],
  SUBMITTED: ['PENDING_VERIFICATION', 'ACTIVE', 'CANCELLED', 'DISPUTED'],
  PENDING_VERIFICATION: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'DISPUTED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED', 'NON_RENEWED', 'DISPUTED'],
  SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'DISPUTED'],
  EXPIRED: ['DISPUTED'],
  CANCELLED: [],
  NON_RENEWED: [],
  DISPUTED: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
  UNKNOWN: ['SUBMITTED', 'PENDING_VERIFICATION', 'CANCELLED'],
};

const CLAIM_TRANSITIONS: Record<InsuranceClaimLifecycleStatus, readonly InsuranceClaimLifecycleStatus[]> = {
  DRAFT: ['REPORTED', 'SUBMITTED', 'WITHDRAWN'],
  REPORTED: ['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'WITHDRAWN'],
  SUBMITTED: ['ACKNOWLEDGED', 'UNDER_REVIEW', 'INSPECTION_REQUIRED', 'ADDITIONAL_EVIDENCE_REQUIRED', 'REJECTED', 'WITHDRAWN'],
  ACKNOWLEDGED: ['UNDER_REVIEW', 'INSPECTION_REQUIRED', 'ADDITIONAL_EVIDENCE_REQUIRED', 'WITHDRAWN'],
  UNDER_REVIEW: ['INSPECTION_REQUIRED', 'ADDITIONAL_EVIDENCE_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'DISPUTED'],
  INSPECTION_REQUIRED: ['UNDER_REVIEW', 'ADDITIONAL_EVIDENCE_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'DISPUTED'],
  ADDITIONAL_EVIDENCE_REQUIRED: ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SETTLEMENT_PENDING', 'DISPUTED'],
  PARTIALLY_APPROVED: ['SETTLEMENT_PENDING', 'DISPUTED'],
  REJECTED: ['DISPUTED', 'CLOSED'],
  SETTLEMENT_PENDING: ['SETTLED', 'DISPUTED', 'CLOSED'],
  SETTLED: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'SETTLEMENT_PENDING', 'CLOSED'],
  WITHDRAWN: ['CLOSED'],
  CLOSED: [],
};

function validationError(code: string, detail: string): never {
  throw new CoreApiError('VALIDATION_FAILED', 400, `${code}: ${detail}`);
}

export function assertValidPolicyStateTransition(
  current: InsurancePolicyLifecycleStatus,
  next: InsurancePolicyLifecycleStatus,
): void {
  if (!POLICY_TRANSITIONS[current]?.includes(next)) {
    validationError('INVALID_POLICY_STATE_TRANSITION', `${current} -> ${next}`);
  }
}

export function assertValidClaimStateTransition(
  current: InsuranceClaimLifecycleStatus,
  next: InsuranceClaimLifecycleStatus,
): void {
  if (!CLAIM_TRANSITIONS[current]?.includes(next)) {
    validationError('INVALID_CLAIM_STATE_TRANSITION', `${current} -> ${next}`);
  }
}

export function transitionPolicyState(
  current: InsurancePolicyLifecycleStatus,
  next: InsurancePolicyLifecycleStatus,
): InsurancePolicyLifecycleStatus {
  assertValidPolicyStateTransition(current, next);
  return next;
}

export function adjudicatePropertyClaim(
  current: InsuranceClaimLifecycleStatus,
  next: InsuranceClaimLifecycleStatus,
): InsuranceClaimLifecycleStatus {
  assertValidClaimStateTransition(current, next);
  return next;
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
  eligibleAfterDeductibleAmount: number;
  decidedAmount: number;
}

export function validateSettlementCalculations(input: SettlementCalculationInput): SettlementCalculationResult {
  const {
    verifiedEligibleLossAmount: eligible,
    deductibleAppliedAmount: deductible,
    approvedSettlementAmount: approved,
    rejectedAmount: rejected,
    applicableCoverageLimit: limit,
    contractualMinimumDeductible: minimumDeductible,
  } = input;

  const values = [eligible, deductible, approved, rejected];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    (limit !== null && (!Number.isFinite(limit) || limit < 0)) ||
    (minimumDeductible !== undefined && (!Number.isFinite(minimumDeductible) || minimumDeductible < 0))
  ) {
    validationError('INVALID_SETTLEMENT_AMOUNTS', 'All settlement amounts and supplied limits must be finite and non-negative.');
  }
  if (minimumDeductible !== undefined && deductible < minimumDeductible) {
    validationError('DEDUCTIBLE_BELOW_CONTRACTUAL_MINIMUM', 'The applied deductible is below the contractual minimum.');
  }

  const eligibleAfterDeductibleAmount = Math.max(0, eligible - deductible);
  if (approved > eligibleAfterDeductibleAmount || approved + rejected > eligibleAfterDeductibleAmount) {
    validationError('SETTLEMENT_EXCEEDS_ELIGIBLE_AFTER_DEDUCTIBLE', 'The decision exceeds the verified eligible loss after deductible.');
  }
  if (limit === null) {
    validationError('INVALID_SETTLEMENT_AMOUNTS', 'An authoritative finite coverage limit is required.');
  }
  if (approved > limit) {
    validationError('SETTLEMENT_EXCEEDS_COVERAGE_LIMIT', 'The approved settlement exceeds the applicable coverage limit.');
  }

  return {
    partiallyApprovedFlag: rejected > 0 || approved < eligibleAfterDeductibleAmount,
    eligibleAfterDeductibleAmount,
    decidedAmount: approved + rejected,
  };
}

export type CoverageApplicabilityConclusion =
  | 'POLICY_NOT_VERIFIED_ACTIVE'
  | 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM'
  | 'WITHIN_WAITING_PERIOD'
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
  verificationLimitations: string[];
  queriedRiskEvaluation: {
    applicabilityConclusion: CoverageApplicabilityConclusion;
    matchingCoverageId: string | null;
    appliedLimitationIds: string[];
    explanation: string;
  };
}

export interface PolicyCoverageEvaluationInput {
  policy: Partial<InsurancePolicyRecord>;
  coverages: PolicyCoverageRecord[];
  exclusions: PolicyExclusionOrLimitationRecord[];
  asOfIso: string;
  queryRiskCategory?: RiskCoverageCategory;
  queryAssetCanonicalId?: string;
  incidentDateIso?: string | null;
}

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesCoveredAsset(assetIds: readonly string[] | undefined, assetId?: string): boolean {
  if (!assetId) return true;
  return Boolean(assetIds?.includes(assetId));
}

function matchesLimitedAsset(assetIds: readonly string[] | undefined, assetId?: string): boolean {
  if (!assetId || !assetIds || assetIds.length === 0) return true;
  return assetIds.includes(assetId);
}

export function evaluatePolicyCoverageStatusWithLimitations(
  input: PolicyCoverageEvaluationInput,
): PolicyCoverageEvaluationReport {
  const { policy, coverages, exclusions, asOfIso, queryRiskCategory, queryAssetCanonicalId } = input;
  const asOfMs = parseIso(asOfIso);
  const policyStartMs = parseIso(policy.coverageStartIso);
  const policyEndMs = parseIso(policy.coverageEndIso);
  const confirmedByProviderAuthoritative =
    policy.verificationStatus === 'PROVIDER_CONFIRMED_AUTHORITATIVE' && policy.providerConfirmedActive === true;
  const currentlyWithinStatedEffectivePeriod =
    asOfMs !== null && policyStartMs !== null && policyEndMs !== null &&
    policyStartMs <= asOfMs && asOfMs <= policyEndMs;
  const independentlyVerifiedActiveCoverage =
    policy.status === 'ACTIVE' && confirmedByProviderAuthoritative && currentlyWithinStatedEffectivePeriod;

  const verificationLimitations: string[] = [];
  if (!confirmedByProviderAuthoritative) verificationLimitations.push('PROVIDER_ACTIVE_STATUS_NOT_AUTHORITATIVELY_CONFIRMED');
  if (policy.status !== 'ACTIVE') verificationLimitations.push('POLICY_STATUS_NOT_ACTIVE');
  if (policyStartMs === null || policyEndMs === null || asOfMs === null) {
    verificationLimitations.push('POLICY_EFFECTIVE_DATES_INVALID');
  } else if (!currentlyWithinStatedEffectivePeriod) {
    verificationLimitations.push('POLICY_OUTSIDE_STATED_EFFECTIVE_PERIOD');
  }
  if (policy.policyholderIsConfirmedPropertyOwner === false) {
    verificationLimitations.push('POLICYHOLDER_NOT_CONFIRMED_AS_LEGAL_OWNER');
  }
  const outstandingPremium = Number(policy.financialStructure?.outstandingPremiumAmount);
  if (Number.isFinite(outstandingPremium) && outstandingPremium > 0) {
    verificationLimitations.push('OUTSTANDING_PREMIUM_REQUIRES_PROVIDER_REVIEW');
  }

  let applicabilityConclusion: CoverageApplicabilityConclusion = 'POLICY_NOT_VERIFIED_ACTIVE';
  let matchingCoverageId: string | null = null;
  const appliedLimitationIds: string[] = [];
  let explanation = 'Policy status, provider confirmation, or stated effective dates are insufficient to establish active coverage.';
  const incidentMs = parseIso(input.incidentDateIso || asOfIso);
  const incidentWithinPolicyPeriod =
    incidentMs !== null && policyStartMs !== null && policyEndMs !== null &&
    policyStartMs <= incidentMs && incidentMs <= policyEndMs;

  if (independentlyVerifiedActiveCoverage && incidentWithinPolicyPeriod) {
    if (!queryRiskCategory) {
      applicabilityConclusion = 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM';
      explanation = 'A specific risk category is required to identify an explicit coverage item.';
    } else {
      const matchingCoverage = coverages.find((coverage) => {
        if (coverage.coverageCategory !== queryRiskCategory) return false;
        if (coverage.policyId && policy.policyId && coverage.policyId !== policy.policyId) return false;
        if (!matchesCoveredAsset(coverage.insuredAssetCanonicalIds, queryAssetCanonicalId)) return false;
        const startRaw = coverage.effectiveStartIso;
        const endRaw = coverage.effectiveEndIso;
        const start = parseIso(startRaw);
        const end = parseIso(endRaw);
        if (startRaw && start === null) return false;
        if (endRaw && end === null) return false;
        if (start !== null && incidentMs < start) return false;
        if (end !== null && incidentMs > end) return false;
        return true;
      });

      if (!matchingCoverage) {
        applicabilityConclusion = 'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM';
        explanation = 'No explicit coverage item matches the queried risk and insured asset.';
      } else {
        matchingCoverageId = matchingCoverage.coverageId;
        const applicableLimitations = exclusions.filter((limitation) =>
          limitation.policyId === policy.policyId &&
          limitation.excludedRiskCategories.includes(queryRiskCategory) &&
          matchesLimitedAsset(limitation.affectedAssetCanonicalIds, queryAssetCanonicalId),
        );

        for (const limitation of applicableLimitations) {
          const isWaitingPeriod =
            (limitation.limitationCategory === 'WAITING_PERIOD' || limitation.limitationCategory === 'WAITING_PERIOD_LIMITATION') &&
            Number(limitation.waitingPeriodDays) > 0;
          if (isWaitingPeriod) {
            const waitStart = parseIso(matchingCoverage.effectiveStartIso) ?? policyStartMs;
            const waitingEndsAt = waitStart === null ? null : waitStart + Number(limitation.waitingPeriodDays) * 86_400_000;
            if (waitingEndsAt !== null && incidentMs < waitingEndsAt) {
              appliedLimitationIds.push(limitation.limitationId);
              const hasVerbatimAssetClause =
                Boolean(limitation.originalSourceWordingVerbatim?.trim()) &&
                Boolean(queryAssetCanonicalId) &&
                limitation.affectedAssetCanonicalIds.includes(queryAssetCanonicalId);
              applicabilityConclusion = hasVerbatimAssetClause
                ? 'WITHIN_WAITING_PERIOD'
                : 'EXCLUDED_BY_EXPLICIT_LIMITATION';
              explanation = hasVerbatimAssetClause
                ? 'The incident falls within the provider-recorded waiting period for this insured asset.'
                : 'The incident is subject to an explicit structured waiting-period limitation.';
              break;
            }
            continue;
          }
          appliedLimitationIds.push(limitation.limitationId);
          applicabilityConclusion = 'EXCLUDED_BY_EXPLICIT_LIMITATION';
          explanation = 'An explicit policy limitation excludes the queried risk or insured asset.';
          break;
        }

        if (appliedLimitationIds.length === 0) {
          applicabilityConclusion = 'ELIGIBLE_SUBJECT_TO_ADJUSTMENT';
          explanation = 'An explicit coverage item applies; final settlement remains subject to deductibles, limits, evidence, and provider adjudication.';
        }
      }
    }
  } else if (independentlyVerifiedActiveCoverage && !incidentWithinPolicyPeriod) {
    explanation = 'The incident date is invalid or falls outside the policy effective period.';
  }

  return {
    policyId: String(policy.policyId || ''),
    evaluatedAtIso: new Date(asOfMs ?? Date.now()).toISOString(),
    distinctValidityDimensions: {
      confirmedByProviderAuthoritative,
      currentlyWithinStatedEffectivePeriod,
      independentlyVerifiedActiveCoverage,
    },
    verificationLimitations: [...new Set(verificationLimitations)],
    queriedRiskEvaluation: {
      applicabilityConclusion,
      matchingCoverageId,
      appliedLimitationIds,
      explanation,
    },
  };
}
