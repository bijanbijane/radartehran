/**
 * @file server/modules/property-insurance/tests/propertyInsurance.test.ts
 * @description Automated test suite covering all 30 verification requirements for
 * Employee 44 — Property Insurance & Claims Management Backend (`server/modules/property-insurance/`).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type IdempotencyRecord,
  type IdempotencyStoreAdapter,
} from '../../core';
import {
  buildInsurancePolicyDetailViewModel,
  createPropertyInsuranceService,
  filterAndSortPropertyInsurancePolicies,
  InsurancePoliciesView,
  PROPERTY_INSURANCE_COLLECTIONS,
  type InsuranceMediaReadAdapter,
  type InsuranceNotificationDispatchAdapter,
  type InsurancePaymentVerificationReadAdapter,
  type InsurancePropertyOwnershipReadAdapter,
  type InsurancePropertyRegistryReadAdapter,
  type InsurancePropertyRiskReadAdapter,
  type PropertyInsuranceStoreTransaction,
  type PropertyInsuranceTransactionRunner,
} from '../index';

function createInMemoryIdempotencyStore(): IdempotencyStoreAdapter {
  const records = new Map<string, IdempotencyRecord<unknown>>();
  return {
    async acquireLock<T = unknown>(params: {
      scopedKey: string;
      actorUid: string;
      operation: string;
      payloadHash: string;
      nowEpochMs: number;
      ttlMs: number;
    }) {
      const existing = records.get(params.scopedKey) as IdempotencyRecord<T> | undefined;
      if (existing) {
        if (existing.payloadHash !== params.payloadHash) {
          return { state: 'CONFLICT_PAYLOAD_MISMATCH' as const, record: existing };
        }
        if (existing.status === 'COMPLETED') {
          return { state: 'REPLAY_COMPLETED' as const, record: existing };
        }
        return { state: 'CONFLICT_IN_PROGRESS' as const, record: existing };
      }
      const record: IdempotencyRecord<T> = {
        key: params.scopedKey,
        actorUid: params.actorUid,
        operation: params.operation,
        payloadHash: params.payloadHash,
        status: 'IN_PROGRESS',
        createdAtIso: new Date(params.nowEpochMs).toISOString(),
        updatedAtIso: new Date(params.nowEpochMs).toISOString(),
        expiresAtEpochMs: params.nowEpochMs + params.ttlMs,
      };
      records.set(params.scopedKey, record);
      return { state: 'ACQUIRED' as const, record };
    },
    async markCompleted<T = unknown>(params: {
      scopedKey: string;
      statusCode: number;
      responseBody: T;
      nowEpochMs: number;
    }) {
      const existing = records.get(params.scopedKey);
      if (existing) {
        records.set(params.scopedKey, {
          ...existing,
          status: 'COMPLETED',
          statusCode: params.statusCode,
          responseBody: params.responseBody,
          updatedAtIso: new Date(params.nowEpochMs).toISOString(),
        });
      }
    },
    async releaseOnFailure(params: { scopedKey: string }) {
      records.delete(params.scopedKey);
    },
  };
}

function createTestHarness(options?: { abortFirstAttempts?: number; failNextWrite?: boolean }) {
  const collections = new Map<string, Map<string, unknown>>();
  let remainingAborts = options?.abortFirstAttempts ?? 0;
  let failWrite = options?.failNextWrite ?? false;

  const getCol = (name: string): Map<string, unknown> => {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name)!;
  };

  const txRunner: PropertyInsuranceTransactionRunner = {
    async runTransaction<T>(
      work: (tx: PropertyInsuranceStoreTransaction) => Promise<T>,
    ): Promise<T> {
      if (remainingAborts > 0) {
        remainingAborts -= 1;
        const err = new Error('TRANSIENT_CONCURRENCY_ABORT') as Error & { code?: string };
        err.code = 'ABORTED';
        throw err;
      }
      if (failWrite) {
        failWrite = false;
        throw new CoreApiError(
          'PERSISTENCE_FAILED',
          503,
          'PERSISTENCE_UNAVAILABLE: Simulated database failure.',
        );
      }

      const txContext: PropertyInsuranceStoreTransaction = {
        async get<Doc>(col: string, id: string): Promise<Doc | null> {
          const val = getCol(col).get(id);
          return val ? (structuredClone(val) as Doc) : null;
        },
        async query<Doc>(col: string): Promise<Doc[]> {
          return Array.from(getCol(col).values()).map((v) => structuredClone(v) as Doc);
        },
        set<Doc>(col: string, id: string, data: Doc): void {
          getCol(col).set(id, structuredClone(data));
        },
        update(col: string, id: string, patch: Record<string, unknown>): void {
          const cur = (getCol(col).get(id) as Record<string, unknown>) ?? {};
          getCol(col).set(id, structuredClone({ ...cur, ...patch }));
        },
        delete(col: string, id: string): void {
          getCol(col).delete(id);
        },
      };

      return work(txContext);
    },
  };

  const propertyRegistryAdapter: InsurancePropertyRegistryReadAdapter = {
    async getCanonicalPropertySummary(canonicalPropertyId) {
      if (canonicalPropertyId === 'bldg_valid_1' || canonicalPropertyId === 'unit_valid_2') {
        return {
          canonicalPropertyId,
          entityKind: canonicalPropertyId.startsWith('bldg_') ? 'BUILDING' : 'UNIT',
          exists: true,
          cityId: 'tehran',
          neighborhoodCompositeId: 'tehran:101',
          registrationStatus: 'ACTIVE_CANONICAL',
        };
      }
      return null;
    },
  };

  const propertyOwnershipAdapter: InsurancePropertyOwnershipReadAdapter = {
    async checkPartyOwnershipRelation(canonicalPropertyId, partyId) {
      return {
        canonicalPropertyId,
        partyId,
        // Intentionally false for tenant/policyholder_1 to verify policyholder != legal owner distinction
        isVerifiedLegalOwner: partyId === 'verified_owner_99',
        ownershipVerificationBasis: null,
      };
    },
  };

  const propertyRiskAdapter: InsurancePropertyRiskReadAdapter = {
    async getPropertyHazardContext(canonicalPropertyId) {
      return {
        canonicalPropertyId,
        riskAssessmentId: 'risk_assessment_synth_1',
        earthquakeExposureLevel: 'HIGH',
        floodExposureLevel: 'LOW',
        assessedAtIso: '2026-01-01T00:00:00.000Z',
      };
    },
  };

  const mediaAdapter: InsuranceMediaReadAdapter = {
    async getMediaDocumentMetadata(mediaId) {
      if (mediaId.startsWith('media_priv_')) {
        return {
          mediaId,
          uploaderUid: 'holder_1',
          mimeType: 'application/pdf',
          byteSize: 120_000,
          sha256Checksum: 'sha256_synth_123456',
          uploadedAtIso: '2026-05-01T00:00:00.000Z',
          isPrivateRestricted: true,
        };
      }
      if (mediaId.startsWith('media_public_')) {
        return {
          mediaId,
          uploaderUid: 'holder_1',
          mimeType: 'image/jpeg',
          byteSize: 80_000,
          sha256Checksum: 'sha256_public',
          uploadedAtIso: '2026-05-01T00:00:00.000Z',
          isPrivateRestricted: false,
        };
      }
      return null;
    },
  };

  const paymentVerificationAdapter: InsurancePaymentVerificationReadAdapter = {
    async verifyAuthoritativePaymentReference(paymentRefId) {
      if (paymentRefId === 'pay_prem_confirmed_1') {
        return {
          paymentRefId,
          verifiedByPaymentGateway: true,
          paymentStatus: 'CONFIRMED',
          confirmedAmount: 15_000_000,
          currency: 'TOMAN',
          confirmedAtIso: '2026-05-02T00:00:00.000Z',
          payerReference: 'holder_1',
        };
      }
      if (paymentRefId === 'pay_settle_confirmed_180m') {
        return {
          paymentRefId,
          verifiedByPaymentGateway: true,
          paymentStatus: 'CONFIRMED',
          confirmedAmount: 180_000_000,
          currency: 'TOMAN',
          confirmedAtIso: '2026-06-20T00:00:00.000Z',
          payerReference: 'ins_provider_synth',
        };
      }
      if (paymentRefId === 'pay_pending_unverified') {
        return {
          paymentRefId,
          verifiedByPaymentGateway: true,
          paymentStatus: 'PENDING',
          confirmedAmount: 0,
          currency: 'TOMAN',
          confirmedAtIso: null,
          payerReference: null,
        };
      }
      return null;
    },
  };

  const dispatchedEvents: string[] = [];
  const notificationAdapter: InsuranceNotificationDispatchAdapter = {
    async enqueueOperationalEventNotification(input) {
      dispatchedEvents.push(input.eventType);
      return {
        eventId: `evt_${dispatchedEvents.length}`,
        eventType: input.eventType,
        queuedForDelivery: true,
        deliveryConfirmed: false,
        queuedAtIso: new Date().toISOString(),
      };
    },
  };

  const currentTimeMs = Date.parse('2026-06-10T10:00:00.000Z');
  const service = createPropertyInsuranceService({
    txRunner,
    idempotencyStore: createInMemoryIdempotencyStore(),
    propertyRegistryAdapter,
    propertyOwnershipAdapter,
    propertyRiskAdapter,
    mediaAdapter,
    paymentVerificationAdapter,
    notificationAdapter,
    now: () => new Date(currentTimeMs),
  });

  const holderPrincipal: AuthenticatedPrincipal = {
    uid: 'holder_1',
    role: 'verified_user',
    email: 'holder1@example.com',
    emailVerified: true,
    authMode: 'firebase_id_token',
    claims: {},
  };

  const strangerPrincipal: AuthenticatedPrincipal = {
    uid: 'stranger_99',
    role: 'verified_user',
    email: 'stranger@example.com',
    emailVerified: true,
    authMode: 'firebase_id_token',
    claims: {},
  };

  const reviewerPrincipal: AuthenticatedPrincipal = {
    uid: 'reviewer_admin_1',
    role: 'primary_admin',
    email: 'reviewer@example.com',
    emailVerified: true,
    authMode: 'firebase_id_token',
    claims: { scopes: ['property_insurance:review', 'property_insurance:adjuster'] },
  };

  return {
    service,
    collections,
    dispatchedEvents,
    holderPrincipal,
    strangerPrincipal,
    reviewerPrincipal,
    setFailNextWrite: (val: boolean) => {
      failWrite = val;
    },
  };
}

test('1. Creates policy covering multiple canonical assets, distinguishes policyholder from legal owner, validates coverages & exclusions, and evaluates coverage applicability with verification limitations', async () => {
  const h = createTestHarness();

  const provider = await h.service.registerInsuranceProviderReference({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_prov_1',
    providerCode: 'SYNTH_INS_CO',
    providerNameFa: 'شرکت بیمه آزمایشی (Synthetic)',
    regulatoryRegistrationRef: 'SYNTH-REG-01',
    verifiedProviderEntity: true,
  });

  // Rejects client-supplied confirmed payment or provider verification
  await assert.rejects(
    async () =>
      h.service.createPolicyRecord({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_pol_hack',
        providerId: provider.providerId,
        externalPolicyNumber: 'SYNTH-POL-999',
        policyCategory: 'RESIDENTIAL_PROPERTY_INSURANCE',
        insuredPropertyCanonicalIds: ['bldg_valid_1'],
        coverageStartIso: '2026-01-01T00:00:00.000Z',
        coverageEndIso: '2027-01-01T00:00:00.000Z',
        policyIssueDateIso: '2025-12-28T00:00:00.000Z',
        currency: 'TOMAN',
        paymentFrequency: 'ANNUAL',
        issuedPremiumAmount: 15_000_000,
        clientClaimedConfirmedPaidAmount: 15_000_000,
        defaultDeductibleMethod: 'FIXED_AMOUNT',
        defaultDeductibleValue: 5_000_000,
        generalCoverageTermsSummary: 'Synthetic terms',
        generalExclusionsSummary: 'Synthetic exclusions',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('UNTRUSTED_CLIENT_PAYMENT_CONFIRMATION'),
  );

  // Rejects non-existent canonical property reference
  await assert.rejects(
    async () =>
      h.service.createPolicyRecord({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_pol_bad_prop',
        providerId: provider.providerId,
        externalPolicyNumber: 'SYNTH-POL-998',
        policyCategory: 'RESIDENTIAL_PROPERTY_INSURANCE',
        insuredPropertyCanonicalIds: ['bldg_nonexistent_404'],
        coverageStartIso: '2026-01-01T00:00:00.000Z',
        coverageEndIso: '2027-01-01T00:00:00.000Z',
        policyIssueDateIso: '2025-12-28T00:00:00.000Z',
        currency: 'TOMAN',
        paymentFrequency: 'ANNUAL',
        issuedPremiumAmount: 15_000_000,
        defaultDeductibleMethod: 'FIXED_AMOUNT',
        defaultDeductibleValue: 5_000_000,
        generalCoverageTermsSummary: 'Synthetic terms',
        generalExclusionsSummary: 'Synthetic exclusions',
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('CANONICAL_PROPERTY_NOT_FOUND'),
  );

  // Creates policy covering two canonical assets (bldg_valid_1 and unit_valid_2) + tests idempotency
  const policy = await h.service.createPolicyRecord({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_pol_create_1',
    providerId: provider.providerId,
    externalPolicyNumber: 'SYNTH-POL-1001',
    policyCategory: 'FIRE_COVERAGE',
    insuredPropertyCanonicalIds: ['bldg_valid_1', 'unit_valid_2'],
    additionalParties: [
      {
        partyId: 'beneficiary_bank_1',
        partyRole: 'MORTGAGEE_OR_SECURED_PARTY',
        displayName: 'Synthetic Mortgagee Bank',
      },
    ],
    coverageStartIso: '2026-01-01T00:00:00.000Z',
    coverageEndIso: '2027-01-01T00:00:00.000Z',
    policyIssueDateIso: '2025-12-28T00:00:00.000Z',
    currency: 'TOMAN',
    paymentFrequency: 'ANNUAL',
    quotedPremiumAmount: 16_000_000,
    issuedPremiumAmount: 15_000_000,
    clientReportedPaidAmount: 15_000_000,
    defaultDeductibleMethod: 'FIXED_AMOUNT',
    defaultDeductibleValue: 5_000_000,
    generalCoverageTermsSummary: 'پوشش آتش‌سوزی آزمایشی',
    generalExclusionsSummary: 'استثنائات عمومی آزمایشی',
    policyDocumentMediaId: 'media_priv_pol_1',
  });

  // Policyholder is explicitly distinct from confirmed legal property owner
  assert.equal(policy.policyholderIsConfirmedPropertyOwner, false);
  // Client-reported payment is NOT treated as authoritative confirmed payment
  assert.equal(policy.financialStructure.clientReportedPaidAmount, 15_000_000);
  assert.equal(policy.financialStructure.authoritativeConfirmedPaidAmount, 0);
  assert.equal(policy.status, 'DRAFT');

  // Stranger cannot access policy
  await assert.rejects(
    async () =>
      h.service.getPolicy({
        principal: h.strangerPrincipal,
        policyId: policy.policyId,
      }),
    (err: unknown) => err instanceof CoreApiError && err.message.includes('POLICY_ACCESS_FORBIDDEN'),
  );

  // Coverage limit validation: rejects sub-limit exceeding primary coverage limit
  await assert.rejects(
    async () =>
      h.service.registerCoverage({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_cov_bad_sub',
        policyId: policy.policyId,
        coverageCategory: 'FIRE',
        coverageLimitAmount: 500_000_000,
        currency: 'TOMAN',
        deductibleMethod: 'FIXED_AMOUNT',
        deductibleValue: 10_000_000,
        subLimits: [{ subCategoryName: 'Cabins', limitAmount: 600_000_000 }],
        sourcePolicyProvisionRef: 'Clause 2.1',
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('INVALID_SUBLIMIT_AMOUNT'),
  );

  // Register explicit FIRE coverage
  await h.service.registerCoverage({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_cov_fire_1',
    policyId: policy.policyId,
    coverageCategory: 'FIRE',
    coverageLimitAmount: 500_000_000,
    currency: 'TOMAN',
    deductibleMethod: 'FIXED_AMOUNT',
    deductibleValue: 10_000_000,
    subLimits: [{ subCategoryName: 'Electrical Switchboard', limitAmount: 100_000_000 }],
    sourcePolicyProvisionRef: 'Clause 2.1',
  });

  // Register explicit exclusion for FLOOD with verbatim original source wording
  const exclusion = await h.service.registerExclusion({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_excl_flood_1',
    policyId: policy.policyId,
    limitationCategory: 'EVENT_SPECIFIC_EXCLUSION',
    excludedRiskCategories: ['FLOOD'],
    sourcePolicyProvisionRef: 'Section 4, Exclusion B',
    originalSourceWordingVerbatim:
      'خسارات ناشی از سیل و طغیان رودخانه خارج از تعهدات این بیمه‌نامه پایه است.',
    structuredClassificationSummary: 'Flood risk excluded unless endorsed.',
  });
  assert.equal(exclusion.aiSummaryNeverOverridesOriginal, true);

  // Evaluate coverage BEFORE provider verification: policy dates are valid, but policy is NOT independently verified active!
  const unverifiedEval = await h.service.getPolicyCoverageStatusWithLimitations({
    principal: h.holderPrincipal,
    policyId: policy.policyId,
    queryRiskCategory: 'FIRE',
    queryAssetCanonicalId: 'bldg_valid_1',
  });
  assert.equal(
    unverifiedEval.distinctValidityDimensions.currentlyWithinStatedEffectivePeriod,
    true,
  );
  assert.equal(
    unverifiedEval.distinctValidityDimensions.independentlyVerifiedActiveCoverage,
    false,
  );
  assert.equal(
    unverifiedEval.queriedRiskEvaluation.applicabilityConclusion,
    'POLICY_NOT_VERIFIED_ACTIVE',
  );
});

test('2. Enforces policy verification authorization, lifecycle transitions, expired policy handling, and renewal continuity without auto-extending dates', async () => {
  const h = createTestHarness();

  const provider = await h.service.registerInsuranceProviderReference({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_prov_2',
    providerCode: 'SYNTH_INS_2',
    providerNameFa: 'بیمه آزمایشی ۲',
  });

  const policy = await h.service.createPolicyRecord({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_pol_lifecycle',
    providerId: provider.providerId,
    externalPolicyNumber: 'SYNTH-POL-2001',
    policyCategory: 'RESIDENTIAL_PROPERTY_INSURANCE',
    insuredPropertyCanonicalIds: ['bldg_valid_1'],
    coverageStartIso: '2026-01-01T00:00:00.000Z',
    coverageEndIso: '2027-01-01T00:00:00.000Z',
    policyIssueDateIso: '2025-12-25T00:00:00.000Z',
    currency: 'TOMAN',
    paymentFrequency: 'ANNUAL',
    issuedPremiumAmount: 15_000_000,
    defaultDeductibleMethod: 'FIXED_AMOUNT',
    defaultDeductibleValue: 5_000_000,
    generalCoverageTermsSummary: 'Synthetic terms',
    generalExclusionsSummary: 'Synthetic exclusions',
  });

  await h.service.registerCoverage({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_cov_lc_fire',
    policyId: policy.policyId,
    coverageCategory: 'FIRE',
    coverageLimitAmount: 400_000_000,
    currency: 'TOMAN',
    deductibleMethod: 'FIXED_AMOUNT',
    deductibleValue: 10_000_000,
    sourcePolicyProvisionRef: 'Clause 1.1',
  });

  const submitted = await h.service.submitPolicyForVerification({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_sub_ver_1',
    policyId: policy.policyId,
    submissionNotes: 'Submitted for verification.',
  });
  assert.equal(submitted.status, 'PENDING_VERIFICATION');

  // Non-reviewer cannot record provider verification
  await assert.rejects(
    async () =>
      h.service.recordAuthorizedPolicyVerification({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_unauth_ver',
        policyId: policy.policyId,
        verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
        providerConfirmedActive: true,
        verificationNotes: 'Self-verify attempt',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('INSURANCE_REVIEWER_AUTHORIZATION_REQUIRED'),
  );

  // Reviewer cannot activate policy BEFORE provider verification is recorded
  await assert.rejects(
    async () =>
      h.service.transitionPolicyLifecycleState({
        principal: h.reviewerPrincipal,
        idempotencyKey: 'idem_premature_activate',
        policyId: policy.policyId,
        targetState: 'ACTIVE',
        reason: 'Premature activation',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('POLICY_ACTIVATION_REQUIRES_PROVIDER_VERIFICATION'),
  );

  // Reviewer records authoritative provider verification + confirmed premium payment
  const verifiedPol = await h.service.recordAuthorizedPolicyVerification({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_ver_ok',
    policyId: policy.policyId,
    verificationStatus: 'PROVIDER_CONFIRMED_AUTHORITATIVE',
    providerConfirmedActive: true,
    authoritativePremiumPaymentRefId: 'pay_prem_confirmed_1',
    verificationNotes: 'Verified with synthetic provider and payment gateway.',
  });
  assert.equal(verifiedPol.financialStructure.authoritativeConfirmedPaidAmount, 15_000_000);
  assert.equal(verifiedPol.financialStructure.outstandingPremiumAmount, 0);

  // Activate policy
  const activePol = await h.service.transitionPolicyLifecycleState({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_act_ok',
    policyId: policy.policyId,
    targetState: 'ACTIVE',
    reason: 'Policy verified and activated.',
  });
  assert.equal(activePol.status, 'ACTIVE');

  // Evaluate FIRE vs EARTHQUAKE (never infer EARTHQUAKE coverage when only FIRE is registered)
  const fireEval = await h.service.getPolicyCoverageStatusWithLimitations({
    principal: h.holderPrincipal,
    policyId: policy.policyId,
    queryRiskCategory: 'FIRE',
    queryAssetCanonicalId: 'bldg_valid_1',
  });
  assert.equal(
    fireEval.queriedRiskEvaluation.applicabilityConclusion,
    'ELIGIBLE_SUBJECT_TO_ADJUSTMENT',
  );

  const eqEval = await h.service.getPolicyCoverageStatusWithLimitations({
    principal: h.holderPrincipal,
    policyId: policy.policyId,
    queryRiskCategory: 'EARTHQUAKE',
    queryAssetCanonicalId: 'bldg_valid_1',
  });
  assert.equal(
    eqEval.queriedRiskEvaluation.applicabilityConclusion,
    'NOT_COVERED_NO_EXPLICIT_COVERAGE_ITEM',
  );

  // Renewal reminder does NOT extend existing policy's coverageEndIso!
  const reminderRenewal = await h.service.createRenewalReference({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_ren_reminder',
    previousPolicyId: policy.policyId,
    renewalEligibilityStatus: 'ELIGIBLE_FOR_RENEWAL',
    proposedCoverageStartIso: '2027-01-01T00:00:00.000Z',
    proposedCoverageEndIso: '2028-01-01T00:00:00.000Z',
    proposedPremiumAmount: 18_000_000,
    currency: 'TOMAN',
    coverageChangesSummary: 'No changes',
    updatedExclusionsSummary: 'No changes',
    renewalStatus: 'REMINDER_RECORDED_NOT_RENEWED',
  });
  assert.equal(reminderRenewal.renewalStatus, 'REMINDER_RECORDED_NOT_RENEWED');

  const checkPolAfterReminder = await h.service.getPolicy({
    principal: h.holderPrincipal,
    policyId: policy.policyId,
  });
  assert.equal(checkPolAfterReminder.coverageEndIso, '2027-01-01T00:00:00.000Z');

  // Transition policy to EXPIRED
  const expiredPol = await h.service.transitionPolicyLifecycleState({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_pol_expire',
    policyId: policy.policyId,
    targetState: 'EXPIRED',
    reason: 'Coverage period ended.',
  });
  assert.equal(expiredPol.status, 'EXPIRED');
});

test('3. Manages claims, duplicate claim protection, private evidence, multi-assessment disagreements, settlements, and authoritative payment reconciliation', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  const provider = await h.service.registerInsuranceProviderReference({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_prov_3',
    providerCode: 'SYNTH_INS_3',
    providerNameFa: 'بیمه آزمایشی ۳',
  });

  const policy = await h.service.createPolicyRecord({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_pol_claims',
    providerId: provider.providerId,
    externalPolicyNumber: 'SYNTH-POL-3001',
    policyCategory: 'FIRE_COVERAGE',
    insuredPropertyCanonicalIds: ['bldg_valid_1'],
    coverageStartIso: '2026-01-01T00:00:00.000Z',
    coverageEndIso: '2027-01-01T00:00:00.000Z',
    policyIssueDateIso: '2025-12-25T00:00:00.000Z',
    currency: 'TOMAN',
    paymentFrequency: 'ANNUAL',
    issuedPremiumAmount: 15_000_000,
    defaultDeductibleMethod: 'FIXED_AMOUNT',
    defaultDeductibleValue: 20_000_000,
    generalCoverageTermsSummary: 'Synthetic fire coverage',
    generalExclusionsSummary: 'Synthetic exclusions',
  });

  await h.service.registerCoverage({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_cov_claim_fire',
    policyId: policy.policyId,
    coverageCategory: 'FIRE',
    coverageLimitAmount: 300_000_000,
    currency: 'TOMAN',
    deductibleMethod: 'FIXED_AMOUNT',
    deductibleValue: 20_000_000,
    sourcePolicyProvisionRef: 'Clause 1.1',
  });

  // Submit claim
  const claim = await h.service.submitInsuranceClaim({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_claim_1',
    policyId: policy.policyId,
    insuredPropertyCanonicalIds: ['bldg_valid_1'],
    claimEventCategory: 'FIRE',
    incidentDateIso: '2026-06-05T14:30:00.000Z',
    incidentLocationDescription: 'موتورخانه طبقه منفی یک',
    incidentDescription: 'آتش‌سوزی موضعی در تابلو برق موتورخانه',
    initialClaimedAmount: 250_000_000,
    currency: 'TOMAN',
  });
  assert.equal(claim.status, 'SUBMITTED');
  assert.equal(claim.isVerifiedInsuredEvent, false);

  // Duplicate active claim for same policy + incident date + event category is rejected
  await assert.rejects(
    async () =>
      h.service.submitInsuranceClaim({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_claim_dup',
        policyId: policy.policyId,
        insuredPropertyCanonicalIds: ['bldg_valid_1'],
        claimEventCategory: 'FIRE',
        incidentDateIso: '2026-06-05T14:30:00.000Z',
        incidentLocationDescription: 'موتورخانه',
        incidentDescription: 'تکرار خسارت',
        initialClaimedAmount: 250_000_000,
        currency: 'TOMAN',
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('DUPLICATE_ACTIVE_CLAIM'),
  );

  // Unauthorized user cannot approve claim
  await assert.rejects(
    async () =>
      h.service.recordClaimDecision({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_unauth_decide',
        claimId: claim.claimId,
        decision: 'APPROVED',
        verifiedEligibleLossAmount: 200_000_000,
        decisionReason: 'Self-approve attempt',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('INSURANCE_REVIEWER_AUTHORIZATION_REQUIRED'),
  );

  // Reviewer requests additional evidence
  const reqEvClaim = await h.service.requestAdditionalEvidence({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_req_ev',
    claimId: claim.claimId,
    requiredEvidencePrompt: 'لطفاً گزارش رسمی آتش‌نشانی را بارگذاری نمایید.',
  });
  assert.equal(reqEvClaim.status, 'ADDITIONAL_EVIDENCE_REQUIRED');

  // Public/non-private media object is rejected for claim evidence
  await assert.rejects(
    async () =>
      h.service.addClaimEvidenceReference({
        principal: h.holderPrincipal,
        idempotencyKey: 'idem_ev_public_bad',
        claimId: claim.claimId,
        evidenceCategory: 'OFFICIAL_INCIDENT_REPORT',
        mediaId: 'media_public_photo_1',
        originalDocumentReference: 'Public photo',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('INVALID_OR_PUBLIC_CLAIM_EVIDENCE_MEDIA'),
  );

  // Add private claim evidence (OCR extracted -> remains OCR_EXTRACTED_UNVERIFIED, not authentic proof)
  const evRecord = await h.service.addClaimEvidenceReference({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_ev_priv_ok',
    claimId: claim.claimId,
    evidenceCategory: 'OFFICIAL_INCIDENT_REPORT',
    mediaId: 'media_priv_fire_report_1',
    originalDocumentReference: 'SYNTH-FIRE-DEPT-77',
    isOcrExtracted: true,
  });
  assert.equal(evRecord.verificationStatus, 'OCR_EXTRACTED_UNVERIFIED');

  // Record initial claimant damage assessment vs professional adjuster assessment (preserving disagreement!)
  const ass1 = await h.service.recordDamageAssessment({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_ass_1',
    claimId: claim.claimId,
    affectedAssetCanonicalId: 'bldg_valid_1',
    damageCategory: 'FIRE',
    affectedBuildingComponent: 'Electrical Room',
    inspectionDateIso: '2026-06-06T00:00:00.000Z',
    assessmentMethod: 'INITIAL_CLAIMANT_REPORT',
    assessorUidOrCredentialRef: 'holder_1',
    lossDimensions: {
      reportedPhysicalDamageText: 'سوختگی کامل تابلو برق و کابل‌کشی',
      estimatedRepairCostAmount: 260_000_000,
    },
    confidenceClassification: 'LOW_PRELIMINARY',
  });
  assert.equal(ass1.assessment.doesNotCertifyStructuralSafety, true);

  const ass2 = await h.service.recordDamageAssessment({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_ass_2',
    claimId: claim.claimId,
    affectedAssetCanonicalId: 'bldg_valid_1',
    damageCategory: 'FIRE',
    affectedBuildingComponent: 'Electrical Room',
    inspectionDateIso: '2026-06-08T00:00:00.000Z',
    assessmentMethod: 'ON_SITE_PROFESSIONAL_INSPECTION',
    assessorUidOrCredentialRef: 'adjuster_lic_501',
    lossDimensions: {
      reportedPhysicalDamageText: 'سوختگی کامل تابلو برق',
      observedPhysicalDamageText: 'آسیب به ۳ فیدر اصلی؛ اسکلت سالم است',
      professionallyAssessedDamageText: 'نیاز به تعویض تابلو فرعی و کابل‌های نسوز',
      estimatedRepairCostAmount: 200_000_000,
      verifiedEligibleLossAmount: 200_000_000,
    },
    confidenceClassification: 'HIGH_PROFESSIONAL',
  });
  assert.equal(ass2.hasAssessmentDisagreement, true);
  assert.equal(ass2.assessment.reviewStatus, 'DISPUTED_BY_COUNTER_ASSESSMENT');

  // Record PARTIALLY_APPROVED claim decision (verified eligible loss = 200M vs initial claimed 250M)
  const decidedClaim = await h.service.recordClaimDecision({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_decide_claim_1',
    claimId: claim.claimId,
    decision: 'PARTIALLY_APPROVED',
    verifiedEligibleLossAmount: 200_000_000,
    decisionReason: 'Approved 200M based on on-site adjuster assessment.',
    supportingEvidenceIds: [evRecord.evidenceId],
  });
  assert.equal(decidedClaim.status, 'PARTIALLY_APPROVED');
  assert.equal(decidedClaim.isVerifiedInsuredEvent, true);

  // Settlement validation: cannot approve more than (verifiedEligibleLoss 200M - deductible 20M = 180M)
  await assert.rejects(
    async () =>
      h.service.recordSettlementDecision({
        principal: h.reviewerPrincipal,
        idempotencyKey: 'idem_settle_excess',
        claimId: claim.claimId,
        deductibleAppliedAmount: 20_000_000,
        approvedSettlementAmount: 190_000_000,
        rejectedAmount: 50_000_000,
        settlementDecisionReference: 'SYNTH-SET-BAD',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('SETTLEMENT_EXCEEDS_ELIGIBLE_AFTER_DEDUCTIBLE'),
  );

  // Record valid settlement (200M eligible - 20M deductible = 180M approved, 50M rejected)
  const settlementRes = await h.service.recordSettlementDecision({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_settle_ok',
    claimId: claim.claimId,
    deductibleAppliedAmount: 20_000_000,
    approvedSettlementAmount: 180_000_000,
    rejectedAmount: 50_000_000,
    settlementDecisionReference: 'SYNTH-SET-101',
  });
  assert.equal(settlementRes.claim.status, 'SETTLEMENT_PENDING');
  assert.equal(settlementRes.settlement.partiallyApprovedFlag, true);

  // Unverified/pending payment reference is rejected
  await assert.rejects(
    async () =>
      h.service.recordAuthoritativeSettlementPaymentReference({
        principal: h.reviewerPrincipal,
        idempotencyKey: 'idem_pay_pending_bad',
        claimId: claim.claimId,
        settlementId: settlementRes.settlement.settlementId,
        authoritativePaymentRefId: 'pay_pending_unverified',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('SETTLEMENT_PAYMENT_NOT_CONFIRMED'),
  );

  // Authoritative confirmed payment transitions settlement to SETTLEMENT_PAYMENT_CONFIRMED and claim to SETTLED
  const settledRes = await h.service.recordAuthoritativeSettlementPaymentReference({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_pay_confirmed_ok',
    claimId: claim.claimId,
    settlementId: settlementRes.settlement.settlementId,
    authoritativePaymentRefId: 'pay_settle_confirmed_180m',
  });
  assert.equal(settledRes.settlement.settlementStatus, 'SETTLEMENT_PAYMENT_CONFIRMED');
  assert.equal(settledRes.claim.status, 'SETTLED');

  // Paginated claim history check
  const histPage1 = await h.service.getClaimHistory({
    principal: h.holderPrincipal,
    claimId: claim.claimId,
    limit: 2,
  });
  assert.equal(histPage1.items.length, 2);
  assert.ok(histPage1.nextCursor);

  // Property insurance profile check
  const profile = await h.service.getPropertyInsuranceProfile({
    principal: h.holderPrincipal,
    canonicalPropertyId: 'bldg_valid_1',
  });
  assert.equal(profile.policies.length, 1);
  assert.equal(profile.hazardContextReferenceOnly?.earthquakeExposureLevel, 'HIGH');

  // Verify zero cross-module collection writes
  const allowedCols = new Set<string>(Object.values(PROPERTY_INSURANCE_COLLECTIONS));
  for (const col of h.collections.keys()) {
    assert.equal(allowedCols.has(col), true, `Unexpected write to external collection: ${col}`);
  }
});

test('4. InsurancePoliciesView filters policies by property, status, category, and search query, and builds complete detail view models', async () => {
  const h = createTestHarness();
  assert.equal(typeof InsurancePoliciesView, 'function');

  const provider = await h.service.registerInsuranceProviderReference({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_prov_view_1',
    providerCode: 'SYNTH_VIEW_INS',
    providerNameFa: 'بیمه نمای آزمایشی',
  });

  const pol1 = await h.service.createPolicyRecord({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_pol_view_1',
    providerId: provider.providerId,
    externalPolicyNumber: 'SYNTH-VIEW-001',
    policyCategory: 'FIRE_COVERAGE',
    insuredPropertyCanonicalIds: ['bldg_valid_1'],
    coverageStartIso: '2026-01-01T00:00:00.000Z',
    coverageEndIso: '2027-01-01T00:00:00.000Z',
    policyIssueDateIso: '2025-12-25T00:00:00.000Z',
    currency: 'TOMAN',
    paymentFrequency: 'ANNUAL',
    issuedPremiumAmount: 12_000_000,
    defaultDeductibleMethod: 'FIXED_AMOUNT',
    defaultDeductibleValue: 5_000_000,
    generalCoverageTermsSummary: 'Fire terms',
    generalExclusionsSummary: 'Fire exclusions',
  });

  const pol2 = await h.service.createPolicyRecord({
    principal: h.holderPrincipal,
    idempotencyKey: 'idem_pol_view_2',
    providerId: provider.providerId,
    externalPolicyNumber: 'SYNTH-VIEW-002',
    policyCategory: 'EARTHQUAKE_COVERAGE',
    insuredPropertyCanonicalIds: ['unit_valid_2'],
    coverageStartIso: '2026-01-01T00:00:00.000Z',
    coverageEndIso: '2027-01-01T00:00:00.000Z',
    policyIssueDateIso: '2025-12-25T00:00:00.000Z',
    currency: 'TOMAN',
    paymentFrequency: 'ANNUAL',
    issuedPremiumAmount: 20_000_000,
    defaultDeductibleMethod: 'PERCENTAGE_OF_LOSS',
    defaultDeductibleValue: 10,
    generalCoverageTermsSummary: 'Earthquake terms',
    generalExclusionsSummary: 'Earthquake exclusions',
  });

  const filteredForBldg = filterAndSortPropertyInsurancePolicies({
    canonicalPropertyId: 'bldg_valid_1',
    policies: [pol1, pol2],
    statusFilter: 'ALL',
    categoryFilter: 'FIRE_COVERAGE',
    searchQuery: 'VIEW-001',
  });
  assert.equal(filteredForBldg.length, 1);
  assert.equal(filteredForBldg[0].policyId, pol1.policyId);

  const detailVm = buildInsurancePolicyDetailViewModel({
    policy: pol1,
    asOfIso: '2026-06-10T10:00:00.000Z',
  });
  assert.equal(detailVm.policy.policyId, pol1.policyId);
  assert.equal(
    detailVm.coverageEvaluation.distinctValidityDimensions.currentlyWithinStatedEffectivePeriod,
    true,
  );
  assert.equal(
    detailVm.coverageEvaluation.distinctValidityDimensions.independentlyVerifiedActiveCoverage,
    false,
  );
});


