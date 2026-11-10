/**
 * @file server/modules/property-insurance/services/propertyInsurancePolicyService.ts
 * @description Policy registration, coverage and exclusion management, policy lifecycle & verification,
 * renewal workflows, and property insurance profile queries.
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
  assertValidPolicyStateTransition,
  evaluatePolicyCoverageStatusWithLimitations,
  type PolicyCoverageEvaluationReport,
} from '../coverage/policyAndClaimStateMachineEngine';
import type {
  CoverageSubLimitSpec,
  InsuranceCurrencyCode,
  InsuranceLifecycleHistoryEntry,
  InsurancePartyRole,
  InsurancePolicyCategory,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  InsuranceProviderReferenceRecord,
  InsuranceVerificationStatus,
  PolicyCoverageRecord,
  PolicyExclusionOrLimitationRecord,
  PolicyLimitationCategory,
  PolicyPartyReference,
  PolicyRenewalRecord,
  RiskCoverageCategory,
} from '../domain/types';
import {
  appendLifecycleHistoryInTx,
  assertInsuranceAuthenticated,
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

export function createPropertyInsurancePolicyOperations(
  deps: PropertyInsuranceServiceDependencies,
) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * 1. Register insurance provider reference
     */
    async registerInsuranceProviderReference(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      providerCode: string;
      providerNameFa: string;
      regulatoryRegistrationRef?: string | null;
      verifiedProviderEntity?: boolean;
    }): Promise<InsuranceProviderReferenceRecord> {
      const principal = assertInsuranceAuthenticated(input.principal);
      const providerCode = requireValidId(input.providerCode, 'providerCode');
      const providerNameFa = sanitizeTextInput(input.providerNameFa).slice(0, 120);
      if (!providerNameFa) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_PROVIDER_NAME: providerNameFa is required.',
        );
      }

      const isAdmin = isInsuranceReviewerOrAdmin(principal);
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.registerInsuranceProviderReference',
        actorUid: principal.uid,
        requestPayload: {
          providerCode,
          providerNameFa,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.registerInsuranceProviderReference',
            async (tx) => {
              const providerId = `insprov_${providerCode.toLowerCase()}`;
              const record: InsuranceProviderReferenceRecord = {
                providerId,
                providerCode,
                providerNameFa,
                regulatoryRegistrationRef: input.regulatoryRegistrationRef
                  ? sanitizeTextInput(input.regulatoryRegistrationRef).slice(0, 80)
                  : null,
                verificationStatus:
                  isAdmin && input.verifiedProviderEntity
                    ? 'VERIFIED_PROVIDER_ENTITY'
                    : 'UNVERIFIED_EXTERNAL_REFERENCE',
                createdByUid: principal.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.PROVIDERS, providerId, record);
              return { statusCode: 201, body: record };
            },
          ),
      });

      return res.body;
    },

    /**
     * 2. Create policy record
     * Distinguishes policyholder from property legal owner; validates canonical assets;
     * rejects client-supplied confirmed payment or active provider verification claims.
     */
    async createPolicyRecord(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      providerId: string;
      externalPolicyNumber: string;
      policyCategory: InsurancePolicyCategory;
      insuredPropertyCanonicalIds: string[];
      additionalParties?: Array<{
        partyId: string;
        partyRole: InsurancePartyRole;
        displayName: string;
      }>;
      coverageStartIso: string;
      coverageEndIso: string;
      policyIssueDateIso: string;
      currency: InsuranceCurrencyCode;
      paymentFrequency: InsurancePolicyRecord['financialStructure']['paymentFrequency'];
      quotedPremiumAmount?: number | null;
      issuedPremiumAmount: number;
      clientReportedPaidAmount?: number;
      clientClaimedConfirmedPaidAmount?: number;
      clientClaimedProviderVerified?: boolean;
      defaultDeductibleMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_LOSS';
      defaultDeductibleValue: number;
      generalCoverageTermsSummary: string;
      generalExclusionsSummary: string;
      policyDocumentMediaId?: string | null;
      previousPolicyId?: string | null;
    }): Promise<InsurancePolicyRecord> {
      const principal = assertInsuranceAuthenticated(input.principal);

      if (input.clientClaimedConfirmedPaidAmount !== undefined) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'UNTRUSTED_CLIENT_PAYMENT_CONFIRMATION: Client-supplied confirmed payment amounts are forbidden.',
        );
      }
      if (input.clientClaimedProviderVerified !== undefined) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'UNTRUSTED_CLIENT_PROVIDER_VERIFICATION: Client cannot self-certify provider verification.',
        );
      }

      const providerId = requireValidId(input.providerId, 'providerId');
      const externalPolicyNumber = sanitizeTextInput(input.externalPolicyNumber).slice(0, 80);
      if (!externalPolicyNumber) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_POLICY_NUMBER: externalPolicyNumber is required.',
        );
      }

      if (
        !Array.isArray(input.insuredPropertyCanonicalIds) ||
        input.insuredPropertyCanonicalIds.length === 0
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'MISSING_INSURED_ASSETS: At least one canonical property ID is required.',
        );
      }

      const canonicalIds = Array.from(
        new Set(
          input.insuredPropertyCanonicalIds.map((id) =>
            requireValidId(id, 'insuredPropertyCanonicalId'),
          ),
        ),
      );

      for (const propId of canonicalIds) {
        const summary = await deps.propertyRegistryAdapter.getCanonicalPropertySummary(propId);
        if (!summary || !summary.exists) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `CANONICAL_PROPERTY_NOT_FOUND: Insured property '${propId}' does not exist in Canonical Property Registry.`,
          );
        }
      }

      if (input.policyDocumentMediaId) {
        const mediaId = requireValidId(input.policyDocumentMediaId, 'policyDocumentMediaId');
        const media = await deps.mediaAdapter.getMediaDocumentMetadata(mediaId);
        if (!media || !media.isPrivateRestricted) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'INVALID_POLICY_DOCUMENT_MEDIA: Policy document must reference a valid private Media object.',
          );
        }
      }

      const startMs = Date.parse(input.coverageStartIso);
      const endMs = Date.parse(input.coverageEndIso);
      const issueMs = Date.parse(input.policyIssueDateIso);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(issueMs) || endMs <= startMs) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_POLICY_DATES: coverageEndIso must be after coverageStartIso.',
        );
      }

      if (!Number.isFinite(input.issuedPremiumAmount) || input.issuedPremiumAmount < 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_ISSUED_PREMIUM: issuedPremiumAmount must be a non-negative finite number.',
        );
      }

      // Check ownership distinction: purchasing a policy never automatically makes the policyholder the legal owner
      let policyholderIsConfirmedOwner = false;
      if (deps.propertyOwnershipAdapter) {
        const checks = await Promise.all(
          canonicalIds.map((propId) =>
            deps.propertyOwnershipAdapter!.checkPartyOwnershipRelation(propId, principal.uid),
          ),
        );
        policyholderIsConfirmedOwner = checks.every((c) => c.isVerifiedLegalOwner);
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const partyReferences: PolicyPartyReference[] = [
        {
          partyId: principal.uid,
          partyRole: 'POLICYHOLDER',
          displayName: principal.email || principal.uid,
          isVerifiedLegalOwnerOfInsuredAsset: policyholderIsConfirmedOwner,
          ownershipVerificationNote: policyholderIsConfirmedOwner
            ? 'Verified against Property Ownership & Rights module.'
            : 'Policyholder role only; not independently confirmed as legal property owner.',
        },
      ];

      for (const extra of input.additionalParties ?? []) {
        const pid = requireValidId(extra.partyId, 'additionalPartyId');
        partyReferences.push({
          partyId: pid,
          partyRole: extra.partyRole,
          displayName: sanitizeTextInput(extra.displayName).slice(0, 100),
          isVerifiedLegalOwnerOfInsuredAsset: false,
          ownershipVerificationNote: 'Party role recorded on policy; not legal ownership proof.',
        });
      }

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.createPolicyRecord',
        actorUid: principal.uid,
        requestPayload: {
          providerId,
          externalPolicyNumber,
          canonicalIds,
          coverageStartIso: input.coverageStartIso,
          coverageEndIso: input.coverageEndIso,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.createPolicyRecord',
            async (tx) => {
              const provider = await tx.get<InsuranceProviderReferenceRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.PROVIDERS,
                providerId,
              );
              if (!provider) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `INSURANCE_PROVIDER_NOT_FOUND: Provider '${providerId}' is not registered.`,
                );
              }

              const policyId = `inspol_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const policy: InsurancePolicyRecord = {
                policyId,
                providerId,
                externalPolicyNumber,
                policyCategory: input.policyCategory,
                insuredPropertyCanonicalIds: canonicalIds,
                policyholderUid: principal.uid,
                policyholderIsConfirmedPropertyOwner: policyholderIsConfirmedOwner,
                partyReferences,
                coverageStartIso: input.coverageStartIso,
                coverageEndIso: input.coverageEndIso,
                policyIssueDateIso: input.policyIssueDateIso,
                status: 'DRAFT',
                verificationStatus: 'UNVERIFIED_USER_RECORDED',
                providerConfirmedActive: false,
                financialStructure: {
                  currency: input.currency,
                  paymentFrequency: input.paymentFrequency,
                  quotedPremiumAmount: input.quotedPremiumAmount ?? null,
                  issuedPremiumAmount: input.issuedPremiumAmount,
                  clientReportedPaidAmount: input.clientReportedPaidAmount ?? 0,
                  authoritativeConfirmedPaidAmount: 0,
                  outstandingPremiumAmount: input.issuedPremiumAmount,
                  refundedPremiumAmount: 0,
                  authoritativePaymentRefIds: [],
                  defaultDeductibleMethod: input.defaultDeductibleMethod,
                  defaultDeductibleValue: input.defaultDeductibleValue,
                },
                generalCoverageTermsSummary: sanitizeTextInput(
                  input.generalCoverageTermsSummary,
                ).slice(0, 500),
                generalExclusionsSummary: sanitizeTextInput(input.generalExclusionsSummary).slice(
                  0,
                  500,
                ),
                policyDocumentMediaId: input.policyDocumentMediaId ?? null,
                sourceProvenance: {
                  sourceType: 'POLICYHOLDER_SUBMISSION',
                  submittedByUid: principal.uid,
                  recordedAtIso: nowIso,
                },
                previousPolicyId: input.previousPolicyId
                  ? requireValidId(input.previousPolicyId, 'previousPolicyId')
                  : null,
                replacementPolicyId: null,
                recordVersion: 1,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, policyId, policy);
              appendLifecycleHistoryInTx(tx, {
                targetType: 'POLICY',
                targetId: policyId,
                previousState: null,
                newState: 'DRAFT',
                principal,
                reason: 'Initial policy record created.',
                verificationStatus: 'UNVERIFIED_USER_RECORDED',
                nowIso,
              });

              return { statusCode: 201, body: policy };
            },
          ),
      });

      await dispatchInsuranceNotificationSafely(deps, {
        eventType: 'POLICY_CREATED',
        recipientUids: [principal.uid],
        policyId: res.body.policyId,
        summaryMessage: `Policy '${res.body.externalPolicyNumber}' recorded in DRAFT state.`,
      });

      return res.body;
    },

    /**
     * 3. Retrieve policy (enforces policyholder / insured party / reviewer access)
     */
    async getPolicy(input: {
      principal: AuthenticatedPrincipal;
      policyId: string;
    }): Promise<InsurancePolicyRecord> {
      const policyId = requireValidId(input.policyId, 'policyId');
      return runInsuranceDurableTx(deps.txRunner, 'property_insurance.getPolicy', async (tx) => {
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
        assertPolicyAccessAuthorized(input.principal, policy, false);
        return policy;
      });
    },

    /**
     * 4. Update permitted policy metadata
     */
    async updatePolicyMetadata(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      generalCoverageTermsSummary?: string;
      generalExclusionsSummary?: string;
      policyDocumentMediaId?: string;
    }): Promise<InsurancePolicyRecord> {
      const policyId = requireValidId(input.policyId, 'policyId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      if (input.policyDocumentMediaId) {
        const media = await deps.mediaAdapter.getMediaDocumentMetadata(input.policyDocumentMediaId);
        if (!media || !media.isPrivateRestricted) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'INVALID_POLICY_DOCUMENT_MEDIA: Policy document must reference a valid private Media object.',
          );
        }
      }

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.updatePolicyMetadata',
        actorUid: input.principal.uid,
        requestPayload: {
          policyId,
          generalCoverageTermsSummary: input.generalCoverageTermsSummary ?? null,
          policyDocumentMediaId: input.policyDocumentMediaId ?? null,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.updatePolicyMetadata',
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
              assertPolicyAccessAuthorized(input.principal, policy, true);

              const updated: InsurancePolicyRecord = {
                ...policy,
                generalCoverageTermsSummary:
                  input.generalCoverageTermsSummary !== undefined
                    ? sanitizeTextInput(input.generalCoverageTermsSummary).slice(0, 500)
                    : policy.generalCoverageTermsSummary,
                generalExclusionsSummary:
                  input.generalExclusionsSummary !== undefined
                    ? sanitizeTextInput(input.generalExclusionsSummary).slice(0, 500)
                    : policy.generalExclusionsSummary,
                policyDocumentMediaId:
                  input.policyDocumentMediaId !== undefined
                    ? input.policyDocumentMediaId
                    : policy.policyDocumentMediaId,
                recordVersion: policy.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, policyId, updated);
              return { statusCode: 200, body: updated };
            },
          ),
      });

      return res.body;
    },

    /**
     * 5. Register coverage
     */
    async registerCoverage(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      coverageCategory: RiskCoverageCategory;
      insuredAssetCanonicalIds?: string[];
      coverageLimitAmount: number;
      currency: InsuranceCurrencyCode;
      deductibleMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_LOSS';
      deductibleValue: number;
      subLimits?: CoverageSubLimitSpec[];
      effectiveStartIso?: string;
      effectiveEndIso?: string;
      conditions?: string[];
      exclusions?: string[];
      specialClauses?: string[];
      sourcePolicyProvisionRef: string;
    }): Promise<PolicyCoverageRecord> {
      const policyId = requireValidId(input.policyId, 'policyId');
      if (!Number.isFinite(input.coverageLimitAmount) || input.coverageLimitAmount <= 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_COVERAGE_LIMIT: coverageLimitAmount must be a positive finite number.',
        );
      }
      if (!Number.isFinite(input.deductibleValue) || input.deductibleValue < 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_DEDUCTIBLE_VALUE: deductibleValue must be a non-negative finite number.',
        );
      }

      for (const sub of input.subLimits ?? []) {
        if (!Number.isFinite(sub.limitAmount) || sub.limitAmount <= 0 || sub.limitAmount > input.coverageLimitAmount) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            'INVALID_SUBLIMIT_AMOUNT: Sub-limit must be positive and not exceed the primary coverage limit.',
          );
        }
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.registerCoverage',
        actorUid: input.principal.uid,
        requestPayload: {
          policyId,
          coverageCategory: input.coverageCategory,
          coverageLimitAmount: input.coverageLimitAmount,
          sourcePolicyProvisionRef: input.sourcePolicyProvisionRef,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.registerCoverage',
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
              const auth = assertPolicyAccessAuthorized(input.principal, policy, true);

              const scopeAssets = input.insuredAssetCanonicalIds
                ? input.insuredAssetCanonicalIds.map((id) => requireValidId(id, 'insuredAssetId'))
                : policy.insuredPropertyCanonicalIds;

              for (const assetId of scopeAssets) {
                if (!policy.insuredPropertyCanonicalIds.includes(assetId)) {
                  throw new CoreApiError(
                    'VALIDATION_FAILED',
                    400,
                    `ASSET_NOT_ON_POLICY: Asset '${assetId}' is not listed on policy '${policyId}'.`,
                  );
                }
              }

              const coverageId = `inscov_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const record: PolicyCoverageRecord = {
                coverageId,
                policyId,
                coverageCategory: input.coverageCategory,
                insuredAssetCanonicalIds: scopeAssets,
                coverageLimitAmount: input.coverageLimitAmount,
                currency: input.currency,
                deductibleMethod: input.deductibleMethod,
                deductibleValue: input.deductibleValue,
                subLimits: input.subLimits ?? [],
                effectiveStartIso: input.effectiveStartIso ?? policy.coverageStartIso,
                effectiveEndIso: input.effectiveEndIso ?? policy.coverageEndIso,
                conditions: (input.conditions ?? []).map((c) => sanitizeTextInput(c).slice(0, 200)),
                exclusions: (input.exclusions ?? []).map((e) => sanitizeTextInput(e).slice(0, 200)),
                specialClauses: (input.specialClauses ?? []).map((s) =>
                  sanitizeTextInput(s).slice(0, 200),
                ),
                sourcePolicyProvisionRef: sanitizeTextInput(input.sourcePolicyProvisionRef).slice(
                  0,
                  120,
                ),
                verificationStatus: policy.verificationStatus,
                createdByUid: auth.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.COVERAGES, coverageId, record);
              return { statusCode: 201, body: record };
            },
          ),
      });

      return res.body;
    },

    /**
     * 6. Register exclusion or limitation (preserves verbatim source wording separately from summaries)
     */
    async registerExclusion(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      limitationCategory: PolicyLimitationCategory;
      excludedRiskCategories?: RiskCoverageCategory[];
      affectedAssetCanonicalIds?: string[];
      waitingPeriodDays?: number | null;
      sourcePolicyProvisionRef: string;
      originalSourceWordingVerbatim: string;
      structuredClassificationSummary: string;
    }): Promise<PolicyExclusionOrLimitationRecord> {
      const policyId = requireValidId(input.policyId, 'policyId');
      const verbatim = sanitizeTextInput(input.originalSourceWordingVerbatim).slice(0, 1000);
      if (!verbatim) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'MISSING_ORIGINAL_EXCLUSION_WORDING: originalSourceWordingVerbatim is required.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.registerExclusion',
        actorUid: input.principal.uid,
        requestPayload: {
          policyId,
          limitationCategory: input.limitationCategory,
          sourcePolicyProvisionRef: input.sourcePolicyProvisionRef,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.registerExclusion',
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
              const auth = assertPolicyAccessAuthorized(input.principal, policy, true);

              const limitationId = `inslim_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const record: PolicyExclusionOrLimitationRecord = {
                limitationId,
                policyId,
                limitationCategory: input.limitationCategory,
                excludedRiskCategories: input.excludedRiskCategories ?? [],
                affectedAssetCanonicalIds: (input.affectedAssetCanonicalIds ?? []).map((id) =>
                  requireValidId(id, 'affectedAssetCanonicalId'),
                ),
                waitingPeriodDays: input.waitingPeriodDays ?? null,
                sourcePolicyProvisionRef: sanitizeTextInput(input.sourcePolicyProvisionRef).slice(
                  0,
                  120,
                ),
                originalSourceWordingVerbatim: verbatim,
                structuredClassificationSummary: sanitizeTextInput(
                  input.structuredClassificationSummary,
                ).slice(0, 400),
                aiSummaryNeverOverridesOriginal: true,
                verificationStatus: policy.verificationStatus,
                createdByUid: auth.uid,
                createdAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.EXCLUSIONS, limitationId, record);
              return { statusCode: 201, body: record };
            },
          ),
      });

      return res.body;
    },

    /**
     * 7. Submit policy for verification
     */
    async submitPolicyForVerification(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      submissionNotes: string;
    }): Promise<InsurancePolicyRecord> {
      const policyId = requireValidId(input.policyId, 'policyId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.submitPolicyForVerification',
        actorUid: input.principal.uid,
        requestPayload: { policyId },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.submitPolicyForVerification',
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
              const auth = assertPolicyAccessAuthorized(input.principal, policy, true);

              if (policy.status === 'DRAFT') {
                assertValidPolicyStateTransition('DRAFT', 'SUBMITTED');
              }
              const targetState: InsurancePolicyLifecycleStatus = 'PENDING_VERIFICATION';
              assertValidPolicyStateTransition(
                policy.status === 'DRAFT' ? 'SUBMITTED' : policy.status,
                targetState,
              );

              const updated: InsurancePolicyRecord = {
                ...policy,
                status: targetState,
                recordVersion: policy.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, policyId, updated);

              appendLifecycleHistoryInTx(tx, {
                targetType: 'POLICY',
                targetId: policyId,
                previousState: policy.status,
                newState: targetState,
                principal: auth,
                reason: input.submissionNotes,
                verificationStatus: policy.verificationStatus,
                nowIso,
              });

              return { statusCode: 200, body: updated };
            },
          ),
      });

      await dispatchInsuranceNotificationSafely(deps, {
        eventType: 'POLICY_AWAITING_VERIFICATION',
        recipientUids: [res.body.policyholderUid],
        policyId: res.body.policyId,
        summaryMessage: `Policy '${res.body.externalPolicyNumber}' is awaiting provider/reviewer verification.`,
      });

      return res.body;
    },

    /**
     * 8. Record authorized policy verification (restricted to reviewer/admin)
     */
    async recordAuthorizedPolicyVerification(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      verificationStatus: InsuranceVerificationStatus;
      providerConfirmedActive: boolean;
      authoritativePremiumPaymentRefId?: string | null;
      verificationNotes: string;
      supportingEvidenceIds?: string[];
    }): Promise<InsurancePolicyRecord> {
      const reviewer = assertInsuranceReviewerOrAdmin(
        input.principal,
        'recordAuthorizedPolicyVerification',
      );
      const policyId = requireValidId(input.policyId, 'policyId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      let confirmedPaidIncrement = 0;
      let confirmedPaidCurrency: InsuranceCurrencyCode | null = null;
      if (input.authoritativePremiumPaymentRefId) {
        const payRef = requireValidId(
          input.authoritativePremiumPaymentRefId,
          'authoritativePremiumPaymentRefId',
        );
        const paymentCheck =
          await deps.paymentVerificationAdapter.verifyAuthoritativePaymentReference(payRef);
        if (
          !paymentCheck ||
          !paymentCheck.verifiedByPaymentGateway ||
          paymentCheck.paymentStatus !== 'CONFIRMED'
        ) {
          throw new CoreApiError(
            'CONFLICT',
            409,
            `UNVERIFIED_PREMIUM_PAYMENT_REFERENCE: Payment reference '${payRef}' is not confirmed by the authoritative payment source.`,
          );
        }
        confirmedPaidIncrement = paymentCheck.confirmedAmount;
        confirmedPaidCurrency = paymentCheck.currency;
      }

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.recordAuthorizedPolicyVerification',
        actorUid: reviewer.uid,
        requestPayload: {
          policyId,
          verificationStatus: input.verificationStatus,
          providerConfirmedActive: input.providerConfirmedActive,
          authoritativePremiumPaymentRefId: input.authoritativePremiumPaymentRefId ?? null,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.recordAuthorizedPolicyVerification',
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

              if (
                confirmedPaidCurrency &&
                confirmedPaidCurrency !== policy.financialStructure.currency
              ) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `PREMIUM_PAYMENT_CURRENCY_MISMATCH: Payment currency (${confirmedPaidCurrency}) does not match policy currency (${policy.financialStructure.currency}).`,
                );
              }

              const alreadyApplied = Boolean(
                input.authoritativePremiumPaymentRefId &&
                  policy.financialStructure.authoritativePaymentRefIds.includes(
                    input.authoritativePremiumPaymentRefId,
                  ),
              );
              const nextConfirmedPaid =
                policy.financialStructure.authoritativeConfirmedPaidAmount +
                (alreadyApplied ? 0 : confirmedPaidIncrement);
              const nextOutstanding = Math.max(
                0,
                policy.financialStructure.issuedPremiumAmount - nextConfirmedPaid,
              );
              const nextPaymentRefs = input.authoritativePremiumPaymentRefId
                ? Array.from(
                    new Set([
                      ...policy.financialStructure.authoritativePaymentRefIds,
                      input.authoritativePremiumPaymentRefId,
                    ]),
                  )
                : policy.financialStructure.authoritativePaymentRefIds;

              const updated: InsurancePolicyRecord = {
                ...policy,
                verificationStatus: input.verificationStatus,
                providerConfirmedActive: input.providerConfirmedActive,
                financialStructure: {
                  ...policy.financialStructure,
                  authoritativeConfirmedPaidAmount: nextConfirmedPaid,
                  outstandingPremiumAmount: nextOutstanding,
                  authoritativePaymentRefIds: nextPaymentRefs,
                },
                recordVersion: policy.recordVersion + 1,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, policyId, updated);
              appendLifecycleHistoryInTx(tx, {
                targetType: 'POLICY',
                targetId: policyId,
                previousState: policy.status,
                newState: policy.status,
                principal: reviewer,
                reason: input.verificationNotes,
                supportingEvidenceIds: input.supportingEvidenceIds,
                verificationStatus: input.verificationStatus,
                nowIso,
              });

              return { statusCode: 200, body: updated };
            },
          ),
      });

      await recordInsuranceAuditEvent(deps, {
        principal: reviewer,
        action: 'property_insurance.recordAuthorizedPolicyVerification',
        targetCollection: PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
        targetResourceId: policyId,
        outcome: 'SUCCESS',
        metadata: {
          verificationStatus: input.verificationStatus,
          providerConfirmedActive: input.providerConfirmedActive,
        },
      });

      return res.body;
    },

    /**
     * 9 & 10. Activate, suspend, cancel, or expire a policy
     */
    async transitionPolicyLifecycleState(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      policyId: string;
      targetState: InsurancePolicyLifecycleStatus;
      reason: string;
      supportingEvidenceIds?: string[];
    }): Promise<InsurancePolicyRecord> {
      const reviewer = assertInsuranceReviewerOrAdmin(
        input.principal,
        'transitionPolicyLifecycleState',
      );
      const policyId = requireValidId(input.policyId, 'policyId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.transitionPolicyLifecycleState',
        actorUid: reviewer.uid,
        requestPayload: {
          policyId,
          targetState: input.targetState,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.transitionPolicyLifecycleState',
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

              assertValidPolicyStateTransition(policy.status, input.targetState);

              if (
                input.targetState === 'ACTIVE' &&
                policy.verificationStatus !== 'PROVIDER_CONFIRMED_AUTHORITATIVE'
              ) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  'POLICY_ACTIVATION_REQUIRES_PROVIDER_VERIFICATION: Cannot transition policy to ACTIVE before authoritative provider verification.',
                );
              }

              const updated: InsurancePolicyRecord = {
                ...policy,
                status: input.targetState,
                providerConfirmedActive:
                  input.targetState === 'ACTIVE' ? policy.providerConfirmedActive : false,
                recordVersion: policy.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, policyId, updated);

              appendLifecycleHistoryInTx(tx, {
                targetType: 'POLICY',
                targetId: policyId,
                previousState: policy.status,
                newState: input.targetState,
                principal: reviewer,
                reason: input.reason,
                supportingEvidenceIds: input.supportingEvidenceIds,
                verificationStatus: updated.verificationStatus,
                nowIso,
              });

              return { statusCode: 200, body: updated };
            },
          ),
      });

      if (input.targetState === 'ACTIVE') {
        await dispatchInsuranceNotificationSafely(deps, {
          eventType: 'POLICY_ACTIVATED',
          recipientUids: [res.body.policyholderUid],
          policyId: res.body.policyId,
          summaryMessage: `Policy '${res.body.externalPolicyNumber}' is now ACTIVE.`,
        });
      } else if (input.targetState === 'EXPIRED') {
        await dispatchInsuranceNotificationSafely(deps, {
          eventType: 'POLICY_EXPIRED',
          recipientUids: [res.body.policyholderUid],
          policyId: res.body.policyId,
          summaryMessage: `Policy '${res.body.externalPolicyNumber}' has EXPIRED.`,
        });
      }

      return res.body;
    },

    /**
     * 11. Create renewal reference (never extends existing policy effective period on a reminder!)
     */
    async createRenewalReference(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      previousPolicyId: string;
      replacementPolicyId?: string | null;
      renewalEligibilityStatus: PolicyRenewalRecord['renewalEligibilityStatus'];
      renewalQuotationReference?: string | null;
      proposedCoverageStartIso: string;
      proposedCoverageEndIso: string;
      proposedPremiumAmount: number;
      currency: InsuranceCurrencyCode;
      coverageChangesSummary: string;
      updatedExclusionsSummary: string;
      renewalStatus: PolicyRenewalRecord['renewalStatus'];
    }): Promise<PolicyRenewalRecord> {
      const previousPolicyId = requireValidId(input.previousPolicyId, 'previousPolicyId');
      const replacementPolicyId = input.replacementPolicyId
        ? requireValidId(input.replacementPolicyId, 'replacementPolicyId')
        : null;

      if (
        input.renewalStatus === 'ACCEPTED_AUTHORITATIVE_RENEWED' &&
        !isInsuranceReviewerOrAdmin(input.principal)
      ) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'AUTHORITATIVE_RENEWAL_CONFIRMATION_RESTRICTED: Only authorized reviewers/admins may record ACCEPTED_AUTHORITATIVE_RENEWED.',
        );
      }

      if (input.renewalStatus === 'ACCEPTED_AUTHORITATIVE_RENEWED' && !replacementPolicyId) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'RENEWAL_REQUIRES_REPLACEMENT_POLICY_ID: Authoritative renewal requires a distinct replacementPolicyId.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_insurance.createRenewalReference',
        actorUid: input.principal.uid,
        requestPayload: {
          previousPolicyId,
          replacementPolicyId,
          renewalStatus: input.renewalStatus,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runInsuranceDurableTx(
            deps.txRunner,
            'property_insurance.createRenewalReference',
            async (tx) => {
              const prevPolicy = await tx.get<InsurancePolicyRecord>(
                PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
                previousPolicyId,
              );
              if (!prevPolicy) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `POLICY_NOT_FOUND: Previous policy '${previousPolicyId}' not found.`,
                );
              }
              const auth = assertPolicyAccessAuthorized(input.principal, prevPolicy, true);

              if (replacementPolicyId) {
                const repPolicy = await tx.get<InsurancePolicyRecord>(
                  PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
                  replacementPolicyId,
                );
                if (!repPolicy) {
                  throw new CoreApiError(
                    'NOT_FOUND',
                    404,
                    `REPLACEMENT_POLICY_NOT_FOUND: Replacement policy '${replacementPolicyId}' not found.`,
                  );
                }

                // Link previous and replacement policies without overwriting previous policy's coverageEndIso!
                tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, previousPolicyId, {
                  ...prevPolicy,
                  replacementPolicyId,
                  updatedAtIso: nowIso,
                });
                tx.set(PROPERTY_INSURANCE_COLLECTIONS.POLICIES, replacementPolicyId, {
                  ...repPolicy,
                  previousPolicyId,
                  updatedAtIso: nowIso,
                });
              }

              const renewalId = `insren_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const renewal: PolicyRenewalRecord = {
                renewalId,
                previousPolicyId,
                replacementPolicyId,
                renewalEligibilityStatus: input.renewalEligibilityStatus,
                renewalQuotationReference: input.renewalQuotationReference ?? null,
                proposedCoverageStartIso: input.proposedCoverageStartIso,
                proposedCoverageEndIso: input.proposedCoverageEndIso,
                proposedPremiumAmount: input.proposedPremiumAmount,
                currency: input.currency,
                coverageChangesSummary: sanitizeTextInput(input.coverageChangesSummary).slice(
                  0,
                  400,
                ),
                updatedExclusionsSummary: sanitizeTextInput(input.updatedExclusionsSummary).slice(
                  0,
                  400,
                ),
                renewalStatus: input.renewalStatus,
                createdByUid: auth.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_INSURANCE_COLLECTIONS.RENEWALS, renewalId, renewal);
              return { statusCode: 201, body: renewal };
            },
          ),
      });

      if (res.body.renewalStatus === 'REMINDER_RECORDED_NOT_RENEWED') {
        await dispatchInsuranceNotificationSafely(deps, {
          eventType: 'POLICY_APPROACHING_EXPIRATION',
          recipientUids: [input.principal.uid],
          policyId: previousPolicyId,
          summaryMessage: `Renewal reminder recorded for policy '${previousPolicyId}'. Policy is NOT renewed until authoritative confirmation.`,
        });
      }

      return res.body;
    },

    /**
     * 20. Retrieve policy history with bounded pagination
     */
    async getPolicyHistory(input: {
      principal: AuthenticatedPrincipal;
      policyId: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      items: InsuranceLifecycleHistoryEntry[];
      nextCursor: string | null;
    }> {
      const policyId = requireValidId(input.policyId, 'policyId');
      const pagination = normalizePaginationParams(
        { limit: input.limit, cursor: input.cursor },
        { defaultLimit: 25, maxLimit: 50 },
      );
      const decodedCursor = pagination.cursor ? decodePaginationCursor(pagination.cursor) : null;

      return runInsuranceDurableTx(
        deps.txRunner,
        'property_insurance.getPolicyHistory',
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
          assertPolicyAccessAuthorized(input.principal, policy, false);

          const allHistory = await tx.query<InsuranceLifecycleHistoryEntry>(
            PROPERTY_INSURANCE_COLLECTIONS.LIFECYCLE_HISTORY,
          );
          const matching = allHistory
            .filter((h) => h.targetType === 'POLICY' && h.targetId === policyId)
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

    /**
     * 22. Retrieve property insurance profile (policies, coverages, renewals, and optional hazard context)
     */
    async getPropertyInsuranceProfile(input: {
      principal: AuthenticatedPrincipal;
      canonicalPropertyId: string;
    }) {
      const canonicalPropertyId = requireValidId(
        input.canonicalPropertyId,
        'canonicalPropertyId',
      );
      const hazardContext = deps.propertyRiskAdapter
        ? await deps.propertyRiskAdapter.getPropertyHazardContext(canonicalPropertyId)
        : null;

      return runInsuranceDurableTx(
        deps.txRunner,
        'property_insurance.getPropertyInsuranceProfile',
        async (tx) => {
          const allPolicies = await tx.query<InsurancePolicyRecord>(
            PROPERTY_INSURANCE_COLLECTIONS.POLICIES,
          );
          const accessiblePolicies = allPolicies.filter((p) => {
            if (!p.insuredPropertyCanonicalIds.includes(canonicalPropertyId)) return false;
            try {
              assertPolicyAccessAuthorized(input.principal, p, false);
              return true;
            } catch {
              return false;
            }
          });

          return {
            canonicalPropertyId,
            policies: accessiblePolicies,
            hazardContextReferenceOnly: hazardContext,
            underwritingDisclaimer:
              'Hazard context is consumed read-only from Property Risk and does not constitute an underwriting decision or guarantee of coverage.',
          };
        },
      );
    },

    /**
     * 23. Retrieve policy coverage status with verification limitations
     */
    async getPolicyCoverageStatusWithLimitations(input: {
      principal: AuthenticatedPrincipal;
      policyId: string;
      queryRiskCategory?: RiskCoverageCategory | null;
      queryAssetCanonicalId?: string | null;
      incidentDateIso?: string | null;
    }): Promise<PolicyCoverageEvaluationReport> {
      const policyId = requireValidId(input.policyId, 'policyId');
      const nowIso = now().toISOString();

      return runInsuranceDurableTx(
        deps.txRunner,
        'property_insurance.getPolicyCoverageStatusWithLimitations',
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
          assertPolicyAccessAuthorized(input.principal, policy, false);

          const allCoverages = await tx.query<PolicyCoverageRecord>(
            PROPERTY_INSURANCE_COLLECTIONS.COVERAGES,
          );
          const allExclusions = await tx.query<PolicyExclusionOrLimitationRecord>(
            PROPERTY_INSURANCE_COLLECTIONS.EXCLUSIONS,
          );

          return evaluatePolicyCoverageStatusWithLimitations({
            policy,
            coverages: allCoverages.filter((c) => c.policyId === policyId),
            exclusions: allExclusions.filter((e) => e.policyId === policyId),
            asOfIso: nowIso,
            queryRiskCategory: input.queryRiskCategory,
            queryAssetCanonicalId: input.queryAssetCanonicalId,
            incidentDateIso: input.incidentDateIso,
          });
        },
      );
    },
  };
}
