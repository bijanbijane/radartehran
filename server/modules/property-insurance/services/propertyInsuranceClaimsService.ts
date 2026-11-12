/**
 * @file server/modules/property-insurance/services/propertyInsuranceClaimsService.ts
 * @description Insurance claims submission, claim state machine transitions, evidence references,
 * damage & loss assessments, claim review decisions, settlement calculations, authoritative
 * payment verification, and the unified Property Insurance service factory.
 */

import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizePaginationParams,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
} from '../../core';
import {
  assertValidClaimStateTransition,
  validateSettlementCalculations,
} from '../coverage/policyAndClaimStateMachineEngine';
import type {
  ClaimSettlementRecord,
  DamageAndLossAssessmentRecord,
  InsuranceClaimLifecycleStatus,
  InsuranceClaimRecord,
  InsuranceCurrencyCode,
  InsuranceEvidenceCategory,
  InsuranceEvidenceRecord,
  InsuranceLifecycleHistoryEntry,
  InsurancePolicyRecord,
  PolicyCoverageRecord,
  RiskCoverageCategory,
} from '../domain/types';
import {
  appendLifecycleHistoryInTx,
  assertClaimAccessAuthorized,
  assertInsuranceReviewerOrAdmin,
  assertPolicyAccessAuthorized,
  dispatchInsuranceNotificationSafely,
  isInsuranceReviewerOrAdmin,
  PROPERTY_INSURANCE_COLLECTIONS,
  recordInsuranceAuditEvent,
  requireValidId,
  runInsuranceDurableTx,
  type PropertyInsuranceServiceDependencies,
} from './propertyInsuranceContext';
import { createPropertyInsurancePolicyOperations } from './propertyInsurancePolicyService';

export function createPropertyInsuranceClaimsOperations(
  deps: PropertyInsuranceServiceDependencies,
) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * 12. Submit insurance claim
     * Validates claimant authorization, prevents duplicate open claim on same policy/event/date,
     * and blocks client-supplied approval or settlement flags.
     */
    async submitInsuranceClaim(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      insuredPropertyCanonicalIds: string[];
      claimEventCategory: RiskCoverageCategory;
      incidentDateIso: string;
      incidentLocationDescription: string;
      incidentDescription: string;
      initialClaimedAmount?: number | null;
      currency: InsuranceCurrencyCode;
      relatedPropertyRiskRefId?: string | null;
      clientSuppliedApprovalStatus?: string;
      clientSuppliedSettlementAmount?: number;
    }): Promise<InsuranceClaimRecord> {
      if (
        input.clientSuppliedApprovalStatus !== undefined ||
        input.clientSuppliedSettlementAmount !== undefined
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'UNTRUSTED_CLIENT_CLAIM_APPROVAL_OR_SETTLEMENT: Clients may never directly supply claim approval or settlement states.',
        );
      }

      const policyId = requireValidId(input.policyId, 'policyId');
      if (
        !Array.isArray(input.insuredPropertyCanonicalIds) ||
        input.insuredPropertyCanonicalIds.length === 0
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'MISSING_CLAIM_INSURED_ASSETS: At least one insured canonical property ID is required.',
        );
      }
      const assetIds = input.insuredPropertyCanonicalIds.map((id) =>
        requireValidId(id, 'insuredPropertyCanonicalId'),
      );

      if (!Number.isFinite(Date.parse(input.incidentDateIso))) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_INCIDENT_DATE: incidentDateIso must be a valid ISO-8601 timestamp.',
        );
      }

      if (
        input.initialClaimedAmount !== undefined &&
        input.initialClaimedAmount !== null &&
        (!Number.isFinite(input.initialClaimedAmount) || input.initialClaimedAmount <= 0)
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_CLAIMED_AMOUNT: initialClaimedAmount must be a positive finite number.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.submitInsuranceClaim',
        actorUid: input.principal.uid,
        requestPayload: {
          policyId,
          assetIds,
          claimEventCategory: input.claimEventCategory,
          incidentDateIso: input.incidentDateIso,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.submitInsuranceClaim',
            async (tx) => {
              const policy = await tx.get<InsurancePolicyRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
                policyId,
              );
              if (!policy) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `POLICY_NOT_FOUND: Policy '${policyId}' not found.`,
                );
              }
              const auth = assertPolicyAccessAuthorized(input.principal, policy, false);

              for (const assetId of assetIds) {
                if (!policy.insuredPropertyCanonicalIds.includes(assetId)) {
                  throw new CoreApiError(
                    'VALIDATION_FAILED',
                    400,
                    `ASSET_NOT_COVERED_BY_POLICY: Asset '${assetId}' is not insured under policy '${policyId}'.`,
                  );
                }
              }

              // Duplicate claim protection: reject another non-withdrawn claim for same policy + event + incidentDate + asset
              const allClaims = await tx.query<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
              );
              const duplicateClaim = allClaims.find(
                (c) =>
                  c.policyId === policyId &&
                  c.claimEventCategory === input.claimEventCategory &&
                  c.incidentDateIso === input.incidentDateIso &&
                  c.status !== 'WITHDRAWN' &&
                  c.status !== 'CLOSED' &&
                  c.insuredPropertyCanonicalIds.some((id) => assetIds.includes(id)),
              );
              if (duplicateClaim) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `DUPLICATE_ACTIVE_CLAIM: Active claim '${duplicateClaim.claimId}' already exists for the same policy, incident date, and event category.`,
                );
              }

              const claimId = `insclm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const claim: InsuranceClaimRecord = {
                claimId,
                policyId,
                insuredPropertyCanonicalIds: assetIds,
                claimantUid: auth.uid,
                claimEventCategory: input.claimEventCategory,
                incidentDateIso: input.incidentDateIso,
                reportedDateIso: nowIso,
                incidentLocationDescription: sanitizeTextInput(
                  input.incidentLocationDescription,
                ).slice(0, 240),
                incidentDescription: sanitizeTextInput(input.incidentDescription).slice(0, 800),
                initialClaimedAmount: input.initialClaimedAmount ?? null,
                currency: input.currency,
                status: 'SUBMITTED',
                isVerifiedInsuredEvent: false,
                assignedAdjusterOrReviewerUid: null,
                providerExternalClaimRef: null,
                relatedPropertyRiskRefId: input.relatedPropertyRiskRefId
                  ? requireValidId(input.relatedPropertyRiskRefId, 'relatedPropertyRiskRefId')
                  : null,
                evidenceIds: [],
                assessmentIds: [],
                requiredAdditionalEvidencePrompt: null,
                latestDecisionSummary: {
                  decisionType: null,
                  decidedByUid: null,
                  decidedAtIso: null,
                  decisionReason: null,
                  verifiedEligibleLossAmount: null,
                },
                settlementId: null,
                recordVersion: 1,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, claim);
              appendLifecycleHistoryInTx(tx, {
                targetType: 'CLAIM',
                targetId: claimId,
                previousState: null,
                newState: 'SUBMITTED',
                principal: auth,
                reason: 'Initial claim submitted by authorized claimant.',
                verificationStatus: 'UNVERIFIED_USER_RECORDED',
                nowIso,
              });

              return { statusCode: 201, body: claim };
            },
          ),
      });

      await dispatchInsuranceNotificationSafely(deps, {
        eventType: 'CLAIM_SUBMITTED',
        recipientUids: [res.body.claimantUid],
        policyId: res.body.policyId,
        claimId: res.body.claimId,
        summaryMessage: `Claim '${res.body.claimId}' submitted for review.`,
      });

      return res.body;
    },

    /**
     * 13. Retrieve claim (enforces claimant / policyholder / reviewer access)
     */
    async getClaim(input: {
      principal: AuthenticatedPrincipal;
      claimId: string;
    }): Promise<InsuranceClaimRecord> {
      const claimId = requireValidId(input.claimId, 'claimId');
      return runInsuranceDurableTx(deps.txRunner, 'property_insurance.getClaim', async (tx) => {
        const claim = await tx.get<InsuranceClaimRecord>(
          PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
          claimId,
        );
        if (!claim) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
          );
        }
        const policy = await tx.get<InsurancePolicyRecord>(
          PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
          claim.policyId,
        );
        if (!policy) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `POLICY_NOT_FOUND: Policy '${claim.policyId}' not found.`,
          );
        }
        assertClaimAccessAuthorized(input.principal, claim, policy);
        return claim;
      });
    },

    /**
     * 14. Add claim evidence reference (verifies private Media reference; never treats upload/OCR as authentic proof)
     */
    async addClaimEvidenceReference(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      evidenceCategory: InsuranceEvidenceCategory;
      mediaId: string;
      originalDocumentReference: string;
      isOcrExtracted?: boolean;
      knownLimitations?: string[];
    }): Promise<InsuranceEvidenceRecord> {
      const claimId = requireValidId(input.claimId, 'claimId');
      const mediaId = requireValidId(input.mediaId, 'mediaId');

      const mediaMeta = await deps.mediaAdapter.getMediaDocumentMetadata(mediaId);
      if (!mediaMeta || !mediaMeta.isPrivateRestricted) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_OR_PUBLIC_CLAIM_EVIDENCE_MEDIA: Claim evidence must reference an existing private restricted Media object.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.addClaimEvidenceReference',
        actorUid: input.principal.uid,
        requestPayload: {
          claimId,
          mediaId,
          evidenceCategory: input.evidenceCategory,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.addClaimEvidenceReference',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              if (!claim) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
                );
              }
              const policy = await tx.get<InsurancePolicyRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
                claim.policyId,
              );
              if (!policy) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `POLICY_NOT_FOUND: Policy '${claim.policyId}' not found.`,
                );
              }
              const auth = assertClaimAccessAuthorized(input.principal, claim, policy);

              const evidenceId = `insevd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const evidence: InsuranceEvidenceRecord = {
                evidenceId,
                policyId: claim.policyId,
                claimId,
                evidenceCategory: input.evidenceCategory,
                mediaId,
                originalDocumentReference: sanitizeTextInput(
                  input.originalDocumentReference,
                ).slice(0, 200),
                sourceUploadedByUid: auth.uid,
                receivedAtIso: nowIso,
                verificationStatus: input.isOcrExtracted
                  ? 'OCR_EXTRACTED_UNVERIFIED'
                  : 'UPLOADED_UNVERIFIED',
                reviewerUid: null,
                reviewedAtIso: null,
                knownLimitations: [
                  'File upload or OCR extraction does not constitute proof of document authenticity.',
                  ...(input.knownLimitations ?? []).map((l) => sanitizeTextInput(l).slice(0, 200)),
                ],
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.EVIDENCE, evidenceId, evidence);

              const nextState: InsuranceClaimLifecycleStatus =
                claim.status === 'ADDITIONAL_EVIDENCE_REQUIRED' ? 'UNDER_REVIEW' : claim.status;

              const updatedClaim: InsuranceClaimRecord = {
                ...claim,
                status: nextState,
                evidenceIds: [...claim.evidenceIds, evidenceId],
                requiredAdditionalEvidencePrompt:
                  nextState === 'UNDER_REVIEW' ? null : claim.requiredAdditionalEvidencePrompt,
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updatedClaim);

              if (nextState !== claim.status) {
                appendLifecycleHistoryInTx(tx, {
                  targetType: 'CLAIM',
                  targetId: claimId,
                  previousState: claim.status,
                  newState: nextState,
                  principal: auth,
                  reason: `Additional evidence '${evidenceId}' submitted; returning claim to UNDER_REVIEW.`,
                  supportingEvidenceIds: [evidenceId],
                  verificationStatus: 'UNVERIFIED_USER_RECORDED',
                  nowIso,
                });
              }

              return { statusCode: 201, body: evidence };
            },
          ),
      });

      return res.body;
    },

    /**
     * 15. Request additional evidence (restricted to reviewer/adjuster)
     */
    async requestAdditionalEvidence(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      requiredEvidencePrompt: string;
    }): Promise<InsuranceClaimRecord> {
      const reviewer = assertInsuranceReviewerOrAdmin(
        input.principal,
        'requestAdditionalEvidence',
      );
      const claimId = requireValidId(input.claimId, 'claimId');
      const promptClean = sanitizeTextInput(input.requiredEvidencePrompt).slice(0, 400);
      if (!promptClean) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'MISSING_EVIDENCE_PROMPT: requiredEvidencePrompt is required.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.requestAdditionalEvidence',
        actorUid: reviewer.uid,
        requestPayload: {
          claimId,
          promptClean,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.requestAdditionalEvidence',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              if (!claim) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
                );
              }

              assertValidClaimStateTransition(claim.status, 'ADDITIONAL_EVIDENCE_REQUIRED');

              const updated: InsuranceClaimRecord = {
                ...claim,
                status: 'ADDITIONAL_EVIDENCE_REQUIRED',
                assignedAdjusterOrReviewerUid:
                  claim.assignedAdjusterOrReviewerUid ?? reviewer.uid,
                requiredAdditionalEvidencePrompt: promptClean,
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updated);
              appendLifecycleHistoryInTx(tx, {
                targetType: 'CLAIM',
                targetId: claimId,
                previousState: claim.status,
                newState: 'ADDITIONAL_EVIDENCE_REQUIRED',
                principal: reviewer,
                reason: promptClean,
                verificationStatus: 'DOCUMENT_REVIEWED_PENDING_PROVIDER',
                nowIso,
              });

              return { statusCode: 200, body: updated };
            },
          ),
      });

      await dispatchInsuranceNotificationSafely(deps, {
        eventType: 'CLAIM_ADDITIONAL_EVIDENCE_REQUIRED',
        recipientUids: [res.body.claimantUid],
        policyId: res.body.policyId,
        claimId: res.body.claimId,
        summaryMessage: `Additional evidence requested for claim '${res.body.claimId}': ${promptClean}`,
      });

      return res.body;
    },

    /**
     * 16. Record damage assessment (distinguishes reported, observed, professionally assessed,
     * estimated loss, verified eligible loss, and approved settlement; preserves disagreements)
     */
    async recordDamageAssessment(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      affectedAssetCanonicalId: string;
      damageCategory: RiskCoverageCategory;
      affectedBuildingComponent: string;
      inspectionDateIso: string;
      assessmentMethod: DamageAndLossAssessmentRecord['assessmentMethod'];
      assessorUidOrCredentialRef: string;
      lossDimensions: {
        reportedPhysicalDamageText: string;
        observedPhysicalDamageText?: string | null;
        professionallyAssessedDamageText?: string | null;
        estimatedRepairCostAmount?: number | null;
        estimatedReplacementCostAmount?: number | null;
        verifiedEligibleLossAmount?: number | null;
      };
      supportingEvidenceIds?: string[];
      assessmentLimitations?: string[];
      confidenceClassification: DamageAndLossAssessmentRecord['confidenceClassification'];
    }): Promise<{
      assessment: DamageAndLossAssessmentRecord;
      hasAssessmentDisagreement: boolean;
    }> {
      const claimId = requireValidId(input.claimId, 'claimId');
      const affectedAssetCanonicalId = requireValidId(
        input.affectedAssetCanonicalId,
        'affectedAssetCanonicalId',
      );
      const isAdjuster = isInsuranceReviewerOrAdmin(input.principal);

      if (
        input.lossDimensions.verifiedEligibleLossAmount !== undefined &&
        input.lossDimensions.verifiedEligibleLossAmount !== null &&
        !isAdjuster
      ) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'VERIFIED_ELIGIBLE_LOSS_RESTRICTED_TO_ADJUSTER: Only authorized adjusters/reviewers may record verifiedEligibleLossAmount.',
        );
      }

      for (const [dimName, dimVal] of [
        ['estimatedRepairCostAmount', input.lossDimensions.estimatedRepairCostAmount],
        ['estimatedReplacementCostAmount', input.lossDimensions.estimatedReplacementCostAmount],
        ['verifiedEligibleLossAmount', input.lossDimensions.verifiedEligibleLossAmount],
      ] as const) {
        if (dimVal !== undefined && dimVal !== null && (!Number.isFinite(dimVal) || dimVal < 0)) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            `INVALID_ASSESSMENT_AMOUNT: ${dimName} must be a non-negative finite number.`,
          );
        }
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.recordDamageAssessment',
        actorUid: input.principal.uid,
        requestPayload: {
          claimId,
          affectedAssetCanonicalId,
          assessmentMethod: input.assessmentMethod,
          estimatedRepairCostAmount: input.lossDimensions.estimatedRepairCostAmount ?? null,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.recordDamageAssessment',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              if (!claim) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
                );
              }
              const policy = await tx.get<InsurancePolicyRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
                claim.policyId,
              );
              if (!policy) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `POLICY_NOT_FOUND: Policy '${claim.policyId}' not found.`,
                );
              }
              assertClaimAccessAuthorized(input.principal, claim, policy);

              const allAssessments = await tx.query<DamageAndLossAssessmentRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.ASSESSMENTS,
              );
              const existingClaimAssessments = allAssessments.filter(
                (a) => a.claimId === claimId,
              );

              let hasDisagreement = false;
              for (const prev of existingClaimAssessments) {
                if (
                  prev.lossDimensions.estimatedRepairCostAmount !== null &&
                  input.lossDimensions.estimatedRepairCostAmount !== undefined &&
                  input.lossDimensions.estimatedRepairCostAmount !== null
                ) {
                  const diff = Math.abs(
                    prev.lossDimensions.estimatedRepairCostAmount -
                      input.lossDimensions.estimatedRepairCostAmount,
                  );
                  const maxVal = Math.max(
                    prev.lossDimensions.estimatedRepairCostAmount,
                    input.lossDimensions.estimatedRepairCostAmount,
                    1,
                  );
                  if (diff / maxVal > 0.2) {
                    hasDisagreement = true;
                  }
                }
              }

              const assessmentId = `insass_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const assessment: DamageAndLossAssessmentRecord = {
                assessmentId,
                claimId,
                policyId: claim.policyId,
                affectedAssetCanonicalId,
                damageCategory: input.damageCategory,
                affectedBuildingComponent: sanitizeTextInput(
                  input.affectedBuildingComponent,
                ).slice(0, 120),
                inspectionDateIso: input.inspectionDateIso,
                assessmentMethod: input.assessmentMethod,
                assessorUidOrCredentialRef: sanitizeTextInput(
                  input.assessorUidOrCredentialRef,
                ).slice(0, 120),
                lossDimensions: {
                  reportedPhysicalDamageText: sanitizeTextInput(
                    input.lossDimensions.reportedPhysicalDamageText,
                  ).slice(0, 500),
                  observedPhysicalDamageText: input.lossDimensions.observedPhysicalDamageText
                    ? sanitizeTextInput(input.lossDimensions.observedPhysicalDamageText).slice(
                        0,
                        500,
                      )
                    : null,
                  professionallyAssessedDamageText: input.lossDimensions
                    .professionallyAssessedDamageText
                    ? sanitizeTextInput(
                        input.lossDimensions.professionallyAssessedDamageText,
                      ).slice(0, 500)
                    : null,
                  estimatedRepairCostAmount:
                    input.lossDimensions.estimatedRepairCostAmount ?? null,
                  estimatedReplacementCostAmount:
                    input.lossDimensions.estimatedReplacementCostAmount ?? null,
                  verifiedEligibleLossAmount:
                    input.lossDimensions.verifiedEligibleLossAmount ?? null,
                  insuranceApprovedSettlementAmount: null,
                },
                supportingEvidenceIds: (input.supportingEvidenceIds ?? []).map((id) =>
                  requireValidId(id, 'supportingEvidenceId'),
                ),
                assessmentLimitations: [
                  'This damage assessment does not certify structural building safety.',
                  ...(input.assessmentLimitations ?? []).map((l) =>
                    sanitizeTextInput(l).slice(0, 200),
                  ),
                ],
                confidenceClassification: hasDisagreement
                  ? 'DISPUTED_CONFLICTING'
                  : input.confidenceClassification,
                doesNotCertifyStructuralSafety: true,
                assessmentVersion: existingClaimAssessments.length + 1,
                reviewStatus: hasDisagreement
                  ? 'DISPUTED_BY_COUNTER_ASSESSMENT'
                  : isAdjuster
                    ? 'VERIFIED_BY_ADJUSTER'
                    : 'RECORDED',
                createdAtIso: nowIso,
              };

              // Preserve previous assessments untouched while adding the new one
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.ASSESSMENTS, assessmentId, assessment);

              const nextClaimState: InsuranceClaimLifecycleStatus =
                claim.status === 'SUBMITTED' ||
                claim.status === 'ACKNOWLEDGED' ||
                claim.status === 'INSPECTION_REQUIRED'
                  ? 'UNDER_REVIEW'
                  : claim.status;

              const updatedClaim: InsuranceClaimRecord = {
                ...claim,
                status: nextClaimState,
                assessmentIds: [...claim.assessmentIds, assessmentId],
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updatedClaim);

              return {
                statusCode: 201,
                body: {
                  assessment,
                  hasAssessmentDisagreement: hasDisagreement,
                },
              };
            },
          ),
      });

      return res.body;
    },

    /**
     * 17. Record claim decision (APPROVED, PARTIALLY_APPROVED, REJECTED) — restricted to reviewer/adjuster
     */
    async recordClaimDecision(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      decision: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
      verifiedEligibleLossAmount: number;
      decisionReason: string;
      supportingEvidenceIds?: string[];
    }): Promise<InsuranceClaimRecord> {
      const reviewer = assertInsuranceReviewerOrAdmin(input.principal, 'recordClaimDecision');
      const claimId = requireValidId(input.claimId, 'claimId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      if (
        !Number.isFinite(input.verifiedEligibleLossAmount) ||
        input.verifiedEligibleLossAmount < 0
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_VERIFIED_ELIGIBLE_LOSS: verifiedEligibleLossAmount must be a non-negative finite number.',
        );
      }

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.recordClaimDecision',
        actorUid: reviewer.uid,
        requestPayload: {
          claimId,
          decision: input.decision,
          verifiedEligibleLossAmount: input.verifiedEligibleLossAmount,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.recordClaimDecision',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              if (!claim) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
                );
              }

              if (claim.status === 'SUBMITTED' || claim.status === 'ACKNOWLEDGED') {
                assertValidClaimStateTransition(claim.status, 'UNDER_REVIEW');
              }
              const effectiveCurrent =
                claim.status === 'SUBMITTED' || claim.status === 'ACKNOWLEDGED'
                  ? 'UNDER_REVIEW'
                  : claim.status;

              assertValidClaimStateTransition(effectiveCurrent, input.decision);

              if (
                (input.decision === 'APPROVED' || input.decision === 'PARTIALLY_APPROVED') &&
                claim.evidenceIds.length === 0 &&
                claim.assessmentIds.length === 0
              ) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  'CLAIM_APPROVAL_REQUIRES_EVIDENCE_OR_ASSESSMENT: Cannot approve a claim without at least one recorded evidence or assessment record.',
                );
              }

              const updated: InsuranceClaimRecord = {
                ...claim,
                status: input.decision,
                isVerifiedInsuredEvent: input.decision !== 'REJECTED',
                assignedAdjusterOrReviewerUid:
                  claim.assignedAdjusterOrReviewerUid ?? reviewer.uid,
                latestDecisionSummary: {
                  decisionType: input.decision,
                  decidedByUid: reviewer.uid,
                  decidedAtIso: nowIso,
                  decisionReason: sanitizeTextInput(input.decisionReason).slice(0, 400),
                  verifiedEligibleLossAmount: input.verifiedEligibleLossAmount,
                },
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updated);
              appendLifecycleHistoryInTx(tx, {
                targetType: 'CLAIM',
                targetId: claimId,
                previousState: claim.status,
                newState: input.decision,
                principal: reviewer,
                reason: input.decisionReason,
                supportingEvidenceIds: input.supportingEvidenceIds,
                verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
                nowIso,
              });

              return { statusCode: 200, body: updated };
            },
          ),
      });

      await dispatchInsuranceNotificationSafely(deps, {
        eventType: 'CLAIM_DECISION_RECORDED',
        recipientUids: [res.body.claimantUid],
        policyId: res.body.policyId,
        claimId: res.body.claimId,
        summaryMessage: `Decision '${input.decision}' recorded for claim '${res.body.claimId}'.`,
      });

      await recordInsuranceAuditEvent(deps, {
        principal: reviewer,
        action: 'property_insurance.recordClaimDecision',
        targetCollection: PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
        targetResourceId: claimId,
        outcome: 'SUCCESS',
        metadata: {
          decision: input.decision,
          verifiedEligibleLossAmount: input.verifiedEligibleLossAmount,
        },
      });

      return res.body;
    },

    /**
     * 18. Record settlement decision (validates deductible, coverage limit, and approved/rejected amounts)
     */
    async recordSettlementDecision(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      deductibleAppliedAmount: number;
      approvedSettlementAmount: number;
      rejectedAmount: number;
      settlementDecisionReference: string;
      settlementStatus?: 'SETTLEMENT_APPROVED' | 'SETTLEMENT_SCHEDULED';
    }): Promise<{
      settlement: ClaimSettlementRecord;
      claim: InsuranceClaimRecord;
    }> {
      const reviewer = assertInsuranceReviewerOrAdmin(
        input.principal,
        'recordSettlementDecision',
      );
      const claimId = requireValidId(input.claimId, 'claimId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.recordSettlementDecision',
        actorUid: reviewer.uid,
        requestPayload: {
          claimId,
          deductibleAppliedAmount: input.deductibleAppliedAmount,
          approvedSettlementAmount: input.approvedSettlementAmount,
          rejectedAmount: input.rejectedAmount,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.recordSettlementDecision',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              if (!claim) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
                );
              }

              assertValidClaimStateTransition(claim.status, 'SETTLEMENT_PENDING');

              const verifiedLoss = claim.latestDecisionSummary.verifiedEligibleLossAmount ?? 0;
              const allCoverages = await tx.query<PolicyCoverageRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.COVERAGES,
              );
              const incidentEpoch = Date.parse(claim.incidentDateIso);
              const matchingCov = allCoverages.find((c) => {
                if (c.policyId !== claim.policyId || c.coverageCategory !== claim.claimEventCategory) {
                  return false;
                }
                if (
                  c.insuredAssetCanonicalIds.length > 0 &&
                  !claim.insuredPropertyCanonicalIds.some((id) => c.insuredAssetCanonicalIds.includes(id))
                ) {
                  return false;
                }
                const covStart = Date.parse(c.effectiveStartIso);
                const covEnd = Date.parse(c.effectiveEndIso);
                if (Number.isFinite(incidentEpoch) && Number.isFinite(covStart) && incidentEpoch < covStart) {
                  return false;
                }
                if (Number.isFinite(incidentEpoch) && Number.isFinite(covEnd) && incidentEpoch > covEnd) {
                  return false;
                }
                return true;
              });

              let effectiveCoverageLimit: number | null = matchingCov
                ? matchingCov.coverageLimitAmount
                : null;
              if (matchingCov && matchingCov.subLimits && matchingCov.subLimits.length > 0 && claim.assessmentIds.length > 0) {
                const allAssessments = await tx.query<DamageAndLossAssessmentRecord>(
                  PROPERTY_INSURANCE_COLLECTIONS.ASSESSMENTS,
                );
                const claimAssessments = allAssessments.filter((a) => a.claimId === claimId);
                const verifiedAssessments = claimAssessments.filter(
                  (a) => a.reviewStatus === 'VERIFIED_BY_ADJUSTER',
                );
                const authoritativeAssessments =
                  verifiedAssessments.length > 0
                    ? verifiedAssessments
                    : claimAssessments.length > 0
                      ? [
                          claimAssessments.reduce((latest, cur) =>
                            cur.assessmentVersion >= latest.assessmentVersion ? cur : latest,
                          ),
                        ]
                      : [];
                for (const ass of authoritativeAssessments) {
                  const compNorm = ass.affectedBuildingComponent.trim().toLowerCase();
                  const matchedSub = matchingCov.subLimits.find(
                    (s) => s.subCategoryName.trim().toLowerCase() === compNorm,
                  );
                  if (matchedSub) {
                    effectiveCoverageLimit =
                      effectiveCoverageLimit !== null
                        ? Math.min(effectiveCoverageLimit, matchedSub.limitAmount)
                        : matchedSub.limitAmount;
                  }
                }
              }

              const { partiallyApprovedFlag } = validateSettlementCalculations({
                verifiedEligibleLossAmount: verifiedLoss,
                deductibleAppliedAmount: input.deductibleAppliedAmount,
                approvedSettlementAmount: input.approvedSettlementAmount,
                rejectedAmount: input.rejectedAmount,
                applicableCoverageLimit: effectiveCoverageLimit,
              });

              const settlementId = `insset_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const settlement: ClaimSettlementRecord = {
                settlementId,
                claimId,
                policyId: claim.policyId,
                currency: claim.currency,
                verifiedEligibleLossAmount: verifiedLoss,
                deductibleAppliedAmount: input.deductibleAppliedAmount,
                approvedSettlementAmount: input.approvedSettlementAmount,
                rejectedAmount: input.rejectedAmount,
                partiallyApprovedFlag,
                disputedSettlementAmount: null,
                settlementDecisionReference: sanitizeTextInput(
                  input.settlementDecisionReference,
                ).slice(0, 120),
                settlementDateIso: nowIso,
                authoritativePaymentRefId: null,
                settlementStatus: input.settlementStatus ?? 'SETTLEMENT_APPROVED',
                reconsiderationOrAppealRef: null,
                recordedByUid: reviewer.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.SETTLEMENTS, settlementId, settlement);

              const updatedClaim: InsuranceClaimRecord = {
                ...claim,
                status: 'SETTLEMENT_PENDING',
                settlementId,
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updatedClaim);

              appendLifecycleHistoryInTx(tx, {
                targetType: 'CLAIM',
                targetId: claimId,
                previousState: claim.status,
                newState: 'SETTLEMENT_PENDING',
                principal: reviewer,
                reason: `Settlement decision '${settlement.settlementDecisionReference}' recorded.`,
                verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
                nowIso,
              });

              return {
                statusCode: 201,
                body: {
                  settlement,
                  claim: updatedClaim,
                },
              };
            },
          ),
      });

      return res.body;
    },

    /**
     * 19. Record authoritative settlement payment reference
     * Strictly verifies payment status via `paymentVerificationAdapter` and reconciles settlement/claim state.
     */
    async recordAuthoritativeSettlementPaymentReference(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      claimId: string;
      settlementId: string;
      authoritativePaymentRefId: string;
    }): Promise<{
      settlement: ClaimSettlementRecord;
      claim: InsuranceClaimRecord;
    }> {
      const reviewer = assertInsuranceReviewerOrAdmin(
        input.principal,
        'recordAuthoritativeSettlementPaymentReference',
      );
      const claimId = requireValidId(input.claimId, 'claimId');
      const settlementId = requireValidId(input.settlementId, 'settlementId');
      const authoritativePaymentRefId = requireValidId(
        input.authoritativePaymentRefId,
        'authoritativePaymentRefId',
      );

      const paymentCheck =
        await deps.paymentVerificationAdapter.verifyAuthoritativePaymentReference(
          authoritativePaymentRefId,
        );
      if (!paymentCheck || !paymentCheck.verifiedByPaymentGateway) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `UNVERIFIED_SETTLEMENT_PAYMENT: Payment reference '${authoritativePaymentRefId}' could not be verified by the authoritative payment integration.`,
        );
      }
      if (
        paymentCheck.paymentStatus !== 'CONFIRMED' &&
        paymentCheck.paymentStatus !== 'DISPUTED'
      ) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `SETTLEMENT_PAYMENT_NOT_CONFIRMED: Authoritative payment status is '${paymentCheck.paymentStatus}', not CONFIRMED.`,
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.recordAuthoritativeSettlementPaymentReference',
        actorUid: reviewer.uid,
        requestPayload: {
          claimId,
          settlementId,
          authoritativePaymentRefId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.recordAuthoritativeSettlementPaymentReference',
            async (tx) => {
              const claim = await tx.get<InsuranceClaimRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
                claimId,
              );
              const settlement = await tx.get<ClaimSettlementRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.SETTLEMENTS,
                settlementId,
              );
              if (!claim || !settlement || settlement.claimId !== claimId) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  'CLAIM_OR_SETTLEMENT_NOT_FOUND: Matching claim and settlement not found.',
                );
              }

              if (paymentCheck.currency && paymentCheck.currency !== settlement.currency) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `SETTLEMENT_CURRENCY_MISMATCH: Payment currency (${paymentCheck.currency}) does not match settlement currency (${settlement.currency}).`,
                );
              }

              if (
                paymentCheck.paymentStatus === 'CONFIRMED' &&
                paymentCheck.confirmedAmount !== settlement.approvedSettlementAmount
              ) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `SETTLEMENT_AMOUNT_MISMATCH: Confirmed payment amount (${paymentCheck.confirmedAmount}) does not match approved settlement amount (${settlement.approvedSettlementAmount}).`,
                );
              }

              const isDisputed = paymentCheck.paymentStatus === 'DISPUTED';
              const nextClaimState: InsuranceClaimLifecycleStatus = isDisputed
                ? 'DISPUTED'
                : 'SETTLED';

              assertValidClaimStateTransition(claim.status, nextClaimState);

              const updatedSettlement: ClaimSettlementRecord = {
                ...settlement,
                authoritativePaymentRefId,
                settlementStatus: isDisputed
                  ? 'SETTLEMENT_PAYMENT_DISPUTED'
                  : 'SETTLEMENT_PAYMENT_CONFIRMED',
                disputedSettlementAmount: isDisputed
                  ? settlement.approvedSettlementAmount
                  : null,
                updatedAtIso: nowIso,
              };
              tx.set(
                PROPERTY_INSURANCE_COLLECTIONS.SETTLEMENTS,
                settlementId,
                updatedSettlement,
              );

              const updatedClaim: InsuranceClaimRecord = {
                ...claim,
                status: nextClaimState,
                recordVersion: claim.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.CLAIMS, claimId, updatedClaim);

              appendLifecycleHistoryInTx(tx, {
                targetType: 'CLAIM',
                targetId: claimId,
                previousState: claim.status,
                newState: nextClaimState,
                principal: reviewer,
                reason: `Authoritative payment reference '${authoritativePaymentRefId}' reconciled with status '${paymentCheck.paymentStatus}'.`,
                verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
                nowIso,
              });

              return {
                statusCode: 200,
                body: {
                  settlement: updatedSettlement,
                  claim: updatedClaim,
                },
              };
            },
          ),
      });

      if (res.body.claim.status === 'SETTLED') {
        await dispatchInsuranceNotificationSafely(deps, {
          eventType: 'SETTLEMENT_CONFIRMED',
          recipientUids: [res.body.claim.claimantUid],
          policyId: res.body.claim.policyId,
          claimId: res.body.claim.claimId,
          summaryMessage: `Settlement payment confirmed for claim '${res.body.claim.claimId}'.`,
        });
      }

      return res.body;
    },

    /**
     * 21. Retrieve claim history with bounded cursor pagination
     */
    async getClaimHistory(input: {
      principal: AuthenticatedPrincipal;
      claimId: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      items: InsuranceLifecycleHistoryEntry[];
      nextCursor: string | null;
    }> {
      const claimId = requireValidId(input.claimId, 'claimId');
      const pagination = normalizePaginationParams(
        { limit: input.limit, cursor: input.cursor },
        { defaultLimit: 25, maxLimit: 50 },
      );
      const decodedCursor = pagination.cursor ? decodePaginationCursor(pagination.cursor) : null;

      return runInsuranceDurableTx(
        deps.txRunner,
        'property_insurance.getClaimHistory',
        async (tx) => {
          const claim = await tx.get<InsuranceClaimRecord>(
            PROPERTY_INSURANCE_COLLECTIONS.CLAIMS,
            claimId,
          );
          if (!claim) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `CLAIM_NOT_FOUND: Claim '${claimId}' not found.`,
            );
          }
          const policy = await tx.get<InsurancePolicyRecord>(
            PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
            claim.policyId,
          );
          if (!policy) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `POLICY_NOT_FOUND: Policy '${claim.policyId}' not found.`,
            );
          }
          assertClaimAccessAuthorized(input.principal, claim, policy);

          const allHistory = await tx.query<InsuranceLifecycleHistoryEntry>(
            PROPERTY_INSURANCE_COLLECTIONS.LIFECYCLE_HISTORY,
          );
          const matching = allHistory
            .filter((h) => h.targetType === 'CLAIM' && h.targetId === claimId)
            .sort((a, b) => {
              if (b.timestampIso !== a.timestampIso) {
                return b.timestampIso.localeCompare(a.timestampIso);
              }
              return b.historyId.localeCompare(a.historyId);
            });

          const afterCursor = decodedCursor
            ? matching.filter(
                (item) =>
                  item.timestampIso < String(decodedCursor.sortValue) ||
                  (item.timestampIso === String(decodedCursor.sortValue) &&
                    item.historyId < decodedCursor.docId),
              )
            : matching;

          const slice = afterCursor.slice(0, pagination.limit);
          const hasMore = afterCursor.length > pagination.limit;
          const lastItem = slice[slice.length - 1];

          return {
            items: slice,
            nextCursor:
              hasMore && lastItem
                ? encodePaginationCursor({
                    sortValue: lastItem.timestampIso,
                    docId: lastItem.historyId,
                    direction: pagination.direction,
                  })
                : null,
          };
        },
      );
    },
  };
}

/**
 * Unified factory combining all 23 Property Insurance & Claims Management service operations.
 */
export function createPropertyInsuranceService(deps: PropertyInsuranceServiceDependencies) {
  return {
    ...createPropertyInsurancePolicyOperations(deps),
    ...createPropertyInsuranceClaimsOperations(deps),
  };
}
