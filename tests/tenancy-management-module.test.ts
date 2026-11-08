import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import express from 'express';
import {
  CoreApiError,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../server/modules/core';
import {
  createTenancyManagementRouter,
  createTenancyManagementService,
} from '../server/modules/tenancy';
import {
  createTransactionFinancialLedgerService,
  createTransactionsService,
} from '../server/modules/transactions';

function createInMemoryTenancyHarness() {
  const store = new Map<string, Record<string, unknown>>();
  const auditEvents: StructuredAuditEvent[] = [];
  const notifications: Array<Record<string, unknown>> = [];

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(callback: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          const val = staged.has(docPath) ? staged.get(docPath) : store.get(docPath);
          if (!val) return { exists: false };
          return { exists: true, data: structuredClone(val) as unknown as Doc };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
          if (options?.merge) {
            const existing = staged.get(docPath) ?? store.get(docPath) ?? {};
            staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partialData: Record<string, unknown>) {
          const existing = staged.get(docPath) ?? store.get(docPath);
          if (!existing) throw new Error(`Missing document ${docPath}`);
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(partialData) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await callback(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  const principals: Record<string, AuthenticatedPrincipal> = {
    landlord: {
      uid: 'uid_landlord_01',
      email: 'landlord01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    manager: {
      uid: 'uid_manager_01',
      email: 'manager01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    tenant1: {
      uid: 'uid_tenant_01',
      email: 'tenant01@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    tenant2: {
      uid: 'uid_tenant_02',
      email: 'tenant02@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    outsider: {
      uid: 'uid_outsider_99',
      email: 'outsider99@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      claims: {},
    },
    admin: {
      uid: 'uid_admin_01',
      email: 'admin@radartehran.ir',
      emailVerified: true,
      role: 'primary_admin',
      authMode: 'firebase_id_token',
      claims: {},
    },
  };

  const tokenAliases: Record<string, string> = {
    token_landlord_valid_0001: 'landlord',
    token_tenant1_valid_00001: 'tenant1',
    token_tenant2_valid_00002: 'tenant2',
    token_outsider_valid_0099: 'outsider',
    token_admin_valid_0000001: 'admin',
  };

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      const p = principals[token] ?? principals[tokenAliases[token] ?? ''];
      if (!p) throw new Error('Invalid token');
      return {
        uid: p.uid,
        email: p.email,
        email_verified: p.emailVerified,
        ...p.claims,
      };
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid() {
      return null;
    },
  };

  const auditSink: AuditEventSink = {
    async writeAuditEvent(event: StructuredAuditEvent) {
      auditEvents.push(event);
    },
  };

  return {
    store,
    txRunner,
    tokenVerifier,
    adminStore,
    auditSink,
    principals,
    auditEvents,
    notifications,
    primaryAdminEmails: ['admin@radartehran.ir'],
    trustedWebhookSecrets: ['whsec_tenancy_01'],
    notificationEmitter: async (ev: unknown) => {
      notifications.push(ev as Record<string, unknown>);
    },
  };
}

describe('Employee 55 — Real Estate Rental Management & Tenancy Operations Suite', () => {
  it('1. Manages rental property availability, applications, applicant isolation, screening references, lease approval, tenancy activation, and conflicting lease prevention', async () => {
    const h = createInMemoryTenancyHarness();
    const txService = createTransactionsService(h);
    const ledgerService = createTransactionFinancialLedgerService(h);
    const tenancyService = createTenancyManagementService(h);

    // 1. Configure rental property
    const propRes = await tenancyService.upsertRentalPropertyConfig({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      rawInput: {
        propertyManagerUid: 'uid_manager_01',
        availabilityStatus: 'APPLICATIONS_OPEN',
        rentalCategory: 'RESIDENTIAL_APARTMENT',
        maxOccupancyCount: 4,
        furnishingStatus: 'SEMI_FURNISHED',
        facilities: ['ELEVATOR', 'STORAGE', 'LOBBY'],
        parkingSpaces: 2,
        hasStorageUnit: true,
        rentalConditions: 'No commercial use; residential family tenancy.',
        minLeaseDurationMonths: 6,
        maxLeaseDurationMonths: 24,
        requiredDepositAmount: 10_000_000_000,
        advertisedPeriodicRentAmount: 300_000_000,
        currency: 'IRR',
        availableFromIso: '2027-01-01T00:00:00.000Z',
      },
      idempotencyKey: 'idem_prop_cfg_1',
      correlationId: 'c1',
    });
    assert.equal(propRes.body.availabilityStatus, 'APPLICATIONS_OPEN');

    // Reject discriminatory attribute in application payload
    await assert.rejects(
      () =>
        tenancyService.createRentalApplication({
          principal: h.principals.tenant1,
          propertyId: 'prop_rent_vanak_1',
          rawInput: {
            proposedPeriodicRentAmount: 300_000_000,
            proposedDepositAmount: 10_000_000_000,
            currency: 'IRR',
            desiredMoveInDateIso: '2027-01-10T00:00:00.000Z',
            desiredLeaseDurationMonths: 12,
            occupantCount: 2,
            ethnicity: 'prohibited_field',
          },
          idempotencyKey: 'idem_app_discrim',
          correlationId: 'c_discrim',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED',
    );

    // Submit Application #1 (tenant1) and Application #2 (tenant2)
    const app1 = await tenancyService.createRentalApplication({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
      rawInput: {
        applicationId: 'app_tenant_1',
        proposedPeriodicRentAmount: 300_000_000,
        proposedDepositAmount: 10_000_000_000,
        currency: 'IRR',
        desiredMoveInDateIso: '2027-01-10T00:00:00.000Z',
        desiredLeaseDurationMonths: 12,
        occupantCount: 3,
        applicantNote: 'Long-term corporate engineer',
      },
      idempotencyKey: 'idem_app_t1',
      correlationId: 'c2',
    });
    assert.equal(app1.body.status, 'SUBMITTED');

    const app2 = await tenancyService.createRentalApplication({
      principal: h.principals.tenant2,
      propertyId: 'prop_rent_vanak_1',
      rawInput: {
        applicationId: 'app_tenant_2',
        proposedPeriodicRentAmount: 290_000_000,
        proposedDepositAmount: 9_000_000_000,
        currency: 'IRR',
        desiredMoveInDateIso: '2027-01-15T00:00:00.000Z',
        desiredLeaseDurationMonths: 12,
        occupantCount: 2,
      },
      idempotencyKey: 'idem_app_t2',
      correlationId: 'c3',
    });
    assert.equal(app2.body.status, 'SUBMITTED');

    // Verify private application isolation: tenant1 sees ONLY app_tenant_1 and cannot see tenant2's application or screening
    const tenant1Overview = await tenancyService.getPropertyTenancyOverview({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
    });
    assert.equal(tenant1Overview.applications.length, 1);
    assert.equal(tenant1Overview.applications[0].applicationId, 'app_tenant_1');
    assert.equal(tenant1Overview.screenings.length, 0);

    // Record screening reference by property manager
    const scrRes = await tenancyService.recordTenantScreening({
      principal: h.principals.manager,
      propertyId: 'prop_rent_vanak_1',
      applicationId: 'app_tenant_1',
      rawInput: {
        identityVerificationStatus: 'VERIFIED',
        documentVerificationStatus: 'VERIFIED',
        referenceVerificationStatus: 'VERIFIED',
        incomeDocumentationStatus: 'VERIFIED',
        employmentVerificationStatus: 'VERIFIED',
        externalProviderReference: 'SHAHKAR_VERIFIED_REF_882',
        manualReviewStatus: 'APPROVED',
        reviewNote: 'All documents verified by property manager.',
      },
      idempotencyKey: 'idem_scr_1',
      correlationId: 'c4',
    });
    assert.equal(scrRes.body.manualReviewStatus, 'APPROVED');

    // Create underlying Employee 53 RENTAL transaction
    await txService.createTransaction({
      principal: h.principals.landlord,
      rawBody: {
        transactionId: 'tx_tenancy_vanak_1',
        transactionType: 'RENTAL',
        propertyId: 'prop_rent_vanak_1',
        cityId: 'tehran',
        hoodId: 3,
        initiatorRole: 'LANDLORD',
        askingAmount: 10_000_000_000,
        depositAmount: 10_000_000_000,
        monthlyRentAmount: 300_000_000,
        currency: 'IRR',
      },
      idempotencyKey: 'idem_tx_vanak_1',
      correlationId: 'c5',
    });
    await txService.inviteParticipant({
      principal: h.principals.landlord,
      transactionId: 'tx_tenancy_vanak_1',
      rawBody: { targetUserId: 'uid_tenant_01', role: 'TENANT', expectedVersion: 1 },
      correlationId: 'c6',
    });
    await txService.respondToInvitation({
      principal: h.principals.tenant1,
      transactionId: 'tx_tenancy_vanak_1',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'c7',
    });

    // Approve application #1
    const appApproved = await tenancyService.decideRentalApplication({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      applicationId: 'app_tenant_1',
      rawInput: {
        action: 'APPROVE',
        reason: 'Approved after verification',
        linkedTransactionId: 'tx_tenancy_vanak_1',
      },
      idempotencyKey: 'idem_app1_approve',
      correlationId: 'c8',
    });
    assert.equal(appApproved.body.status, 'APPROVED');

    // Create Lease Agreement
    const leaseRes = await tenancyService.createLeaseAgreement({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      rawInput: {
        leaseId: 'lse_vanak_2027',
        transactionId: 'tx_tenancy_vanak_1',
        applicationId: 'app_tenant_1',
        tenantUid: 'uid_tenant_01',
        propertyManagerUid: 'uid_manager_01',
        leaseStartDateIso: '2027-01-10T00:00:00.000Z',
        leaseEndDateIso: '2028-01-10T00:00:00.000Z',
        periodicRentAmount: 300_000_000,
        depositAmount: 10_000_000_000,
        currency: 'IRR',
        paymentFrequency: 'MONTHLY',
        installmentCount: 12,
        gracePeriodDays: 5,
        contractualConditions: 'Standard 12-month residential lease.',
        permittedRentAdjustmentClauseRef: 'CLAUSE_14_ANNUAL_CPI',
        contractDocumentId: 'doc_contract_vanak_01',
      },
      idempotencyKey: 'idem_lse_create_1',
      correlationId: 'c9',
    });
    assert.equal(leaseRes.body.status, 'DRAFT');

    // Prevent activating a DRAFT / unsigned lease agreement
    await assert.rejects(
      () =>
        tenancyService.performLeaseWorkflowAction({
          principal: h.principals.landlord,
          propertyId: 'prop_rent_vanak_1',
          leaseId: 'lse_vanak_2027',
          rawInput: { action: 'ACTIVATE' },
          idempotencyKey: 'idem_premature_act',
          correlationId: 'c_prem',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Both parties approve & sign the lease agreement
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_vanak_2027',
      rawInput: { action: 'APPROVE' },
      idempotencyKey: 'idem_lse_app_ll',
      correlationId: 'c10',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_vanak_2027',
      rawInput: { action: 'APPROVE' },
      idempotencyKey: 'idem_lse_app_tn',
      correlationId: 'c11',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_vanak_2027',
      rawInput: { action: 'RECORD_SIGNATURE' },
      idempotencyKey: 'idem_lse_sig_ll',
      correlationId: 'c12',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_vanak_2027',
      rawInput: { action: 'RECORD_SIGNATURE' },
      idempotencyKey: 'idem_lse_sig_tn',
      correlationId: 'c13',
    });

    // Activate Tenancy -> generates rent schedule + deposit obligation in Employee 54 ledger and synchronizes property status to RENTED
    const activated = await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_vanak_2027',
      rawInput: { action: 'ACTIVATE' },
      idempotencyKey: 'idem_lse_activate_1',
      correlationId: 'c14',
    });
    assert.equal(activated.body.status, 'ACTIVE');
    assert.ok(activated.body.rentalScheduleId);
    assert.ok(activated.body.depositRecordId);

    const propAfterActivation = await tenancyService.getPropertyTenancyOverview({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
    });
    assert.equal(propAfterActivation.propertyConfig.availabilityStatus, 'RENTED');
    assert.equal(propAfterActivation.propertyConfig.activeLeaseId, 'lse_vanak_2027');

    // Verify Employee 54 financial ledger received 1 security deposit + 12 rent obligations = 13 obligations
    const ledgerView = await ledgerService.getFinancialSummaryAndRecords({
      principal: h.principals.landlord,
      transactionId: 'tx_tenancy_vanak_1',
    });
    assert.equal(ledgerView.obligations.length, 13);
    assert.equal(ledgerView.summary.ledgerBalanced, true);

    // Prevent conflicting overlapping active lease on the same property
    await tenancyService.createLeaseAgreement({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      rawInput: {
        leaseId: 'lse_conflicting_overlap',
        transactionId: 'tx_tenancy_vanak_1',
        tenantUid: 'uid_tenant_01',
        leaseStartDateIso: '2027-06-01T00:00:00.000Z',
        leaseEndDateIso: '2028-06-01T00:00:00.000Z',
        periodicRentAmount: 300_000_000,
        depositAmount: 10_000_000_000,
        currency: 'IRR',
        paymentFrequency: 'MONTHLY',
        installmentCount: 12,
        gracePeriodDays: 5,
        contractualConditions: 'Conflicting lease test',
        contractDocumentId: 'doc_conflict_02',
      },
      idempotencyKey: 'idem_lse_conflict_create',
      correlationId: 'c15',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_conflicting_overlap',
      rawInput: { action: 'APPROVE' },
      idempotencyKey: 'idem_conf_app_ll',
      correlationId: 'c16',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_conflicting_overlap',
      rawInput: { action: 'APPROVE' },
      idempotencyKey: 'idem_conf_app_tn',
      correlationId: 'c17',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.landlord,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_conflicting_overlap',
      rawInput: { action: 'RECORD_SIGNATURE' },
      idempotencyKey: 'idem_conf_sig_ll',
      correlationId: 'c18',
    });
    await tenancyService.performLeaseWorkflowAction({
      principal: h.principals.tenant1,
      propertyId: 'prop_rent_vanak_1',
      leaseId: 'lse_conflicting_overlap',
      rawInput: { action: 'RECORD_SIGNATURE' },
      idempotencyKey: 'idem_conf_sig_tn',
      correlationId: 'c19',
    });

    await assert.rejects(
      () =>
        tenancyService.performLeaseWorkflowAction({
          principal: h.principals.landlord,
          propertyId: 'prop_rent_vanak_1',
          leaseId: 'lse_conflicting_overlap',
          rawInput: { action: 'ACTIVATE' },
          idempotencyKey: 'idem_conf_act_fail',
          correlationId: 'c20',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );
  });

  it('2. Executes deposit lifecycle, authorized deductions, renewals, rent adjustments, amendments, maintenance, immutable inspections, handover, and termination', async () => {
    const h = createInMemoryTenancyHarness();
    const txService = createTransactionsService(h);
    const ledgerService = createTransactionFinancialLedgerService(h);
    const tenancyService = createTenancyManagementService(h);

    await tenancyService.upsertRentalPropertyConfig({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      rawInput: {
        propertyManagerUid: 'uid_manager_01',
        availabilityStatus: 'AVAILABLE',
        rentalCategory: 'RESIDENTIAL_APARTMENT',
        maxOccupancyCount: 4,
        furnishingStatus: 'FULLY_FURNISHED',
        facilities: ['PARKING', 'GYM'],
        parkingSpaces: 1,
        hasStorageUnit: true,
        rentalConditions: 'Standard rules',
        minLeaseDurationMonths: 6,
        maxLeaseDurationMonths: 24,
        requiredDepositAmount: 6_000_000_000,
        advertisedPeriodicRentAmount: 200_000_000,
        currency: 'IRR',
        availableFromIso: '2027-02-01T00:00:00.000Z',
      },
      idempotencyKey: 'idem_p2_cfg',
      correlationId: 'd1',
    });

    await txService.createTransaction({
      principal: h.principals.landlord,
      rawBody: {
        transactionId: 'tx_saadatabad_2',
        transactionType: 'RENTAL',
        propertyId: 'prop_saadatabad_2',
        cityId: 'tehran',
        hoodId: 2,
        initiatorRole: 'LANDLORD',
        askingAmount: 6_000_000_000,
        depositAmount: 6_000_000_000,
        monthlyRentAmount: 200_000_000,
        currency: 'IRR',
      },
      idempotencyKey: 'idem_tx_s2',
      correlationId: 'd2',
    });
    await txService.inviteParticipant({
      principal: h.principals.landlord,
      transactionId: 'tx_saadatabad_2',
      rawBody: { targetUserId: 'uid_tenant_01', role: 'TENANT', expectedVersion: 1 },
      correlationId: 'd3',
    });
    await txService.respondToInvitation({
      principal: h.principals.tenant1,
      transactionId: 'tx_saadatabad_2',
      rawBody: { decision: 'ACCEPT', expectedVersion: 2 },
      correlationId: 'd4',
    });

    await tenancyService.createLeaseAgreement({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      rawInput: {
        leaseId: 'lse_saadat_1',
        transactionId: 'tx_saadatabad_2',
        tenantUid: 'uid_tenant_01',
        propertyManagerUid: 'uid_manager_01',
        leaseStartDateIso: '2027-02-01T00:00:00.000Z',
        leaseEndDateIso: '2027-08-01T00:00:00.000Z',
        periodicRentAmount: 200_000_000,
        depositAmount: 6_000_000_000,
        currency: 'IRR',
        paymentFrequency: 'MONTHLY',
        installmentCount: 6,
        gracePeriodDays: 3,
        contractualConditions: '6-month furnished lease',
        permittedRentAdjustmentClauseRef: 'CLAUSE_9_INDEXED',
        contractDocumentId: 'doc_saadat_01',
      },
      idempotencyKey: 'idem_lse_s1',
      correlationId: 'd5',
    });

    for (const [idx, step] of [
      { p: h.principals.landlord, a: 'APPROVE' },
      { p: h.principals.tenant1, a: 'APPROVE' },
      { p: h.principals.landlord, a: 'RECORD_SIGNATURE' },
      { p: h.principals.tenant1, a: 'RECORD_SIGNATURE' },
      { p: h.principals.landlord, a: 'ACTIVATE' },
    ].entries()) {
      await tenancyService.performLeaseWorkflowAction({
        principal: step.p,
        propertyId: 'prop_saadatabad_2',
        leaseId: 'lse_saadat_1',
        rawInput: { action: step.a },
        idempotencyKey: `idem_s1_step_${idx}`,
        correlationId: `d_step_${idx}`,
      });
    }

    // Settle the security deposit obligation in Employee 54 ledger (6,000,000,000 IRR)
    const depObligationId = 'obl_dep_rsc_lse_saadat_1';
    await ledgerService.createPaymentReference({
      principal: h.principals.tenant1,
      transactionId: 'tx_saadatabad_2',
      rawInput: {
        paymentRefId: 'pmr_dep_saadat_1',
        obligationId: depObligationId,
        initiationReference: 'INIT_DEP_01',
        amount: 6_000_000_000,
        currency: 'IRR',
        payerUid: 'uid_tenant_01',
        payeeUid: 'uid_landlord_01',
      },
      idempotencyKey: 'idem_pmr_dep_1',
      correlationId: 'd6',
    });
    await ledgerService.updatePaymentReferenceStatus({
      principal: h.principals.admin,
      transactionId: 'tx_saadatabad_2',
      paymentRefId: 'pmr_dep_saadat_1',
      rawInput: { status: 'CONFIRMED', confirmationReference: 'CONF_DEP_01' },
      idempotencyKey: 'idem_pmr_dep_conf_1',
      correlationId: 'd7',
    });
    await ledgerService.createSettlement({
      principal: h.principals.tenant1,
      transactionId: 'tx_saadatabad_2',
      rawInput: {
        settlementId: 'stl_dep_saadat_1',
        allocations: [{ obligationId: depObligationId, allocatedAmount: 6_000_000_000 }],
        currency: 'IRR',
        payerUid: 'uid_tenant_01',
        payeeUid: 'uid_landlord_01',
        paymentRefId: 'pmr_dep_saadat_1',
      },
      idempotencyKey: 'idem_stl_dep_1',
      correlationId: 'd8',
    });
    await ledgerService.performSettlementAction({
      principal: h.principals.admin,
      transactionId: 'tx_saadatabad_2',
      settlementId: 'stl_dep_saadat_1',
      rawInput: { action: 'CONFIRM', paymentRefId: 'pmr_dep_saadat_1' },
      idempotencyKey: 'idem_stl_dep_conf_1',
      correlationId: 'd9',
    });

    // Sync deposit from ledger & record an authorized deduction (500,000,000 IRR)
    const depSynced = await tenancyService.performDepositOperation({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: { operation: 'SYNC_FROM_LEDGER' },
      idempotencyKey: 'idem_dep_sync_1',
      correlationId: 'd10',
    });
    assert.equal(depSynced.body.confirmedDepositAmount, 6_000_000_000);
    assert.equal(depSynced.body.refundableBalance, 6_000_000_000);

    const depDeducted = await tenancyService.performDepositOperation({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        operation: 'RECORD_DEDUCTION',
        deductionAmount: 500_000_000,
        deductionReason: 'Broken cabinet door repair per move-out inspection',
        authorizationReference: 'AUTH_DED_CLAUSE_7',
      },
      idempotencyKey: 'idem_dep_ded_1',
      correlationId: 'd11',
    });
    assert.equal(depDeducted.body.deductedAmount, 500_000_000);
    assert.equal(depDeducted.body.refundableBalance, 5_500_000_000);

    // Initiate deposit refund for remaining 5,500,000,000 IRR
    const depRefundInit = await tenancyService.performDepositOperation({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        operation: 'INITIATE_REFUND',
        refundSettlementId: 'stl_dep_saadat_1',
        refundAmount: 5_500_000_000,
      },
      idempotencyKey: 'idem_dep_ref_init_1',
      correlationId: 'd12',
    });
    assert.equal(depRefundInit.body.status, 'REFUND_INITIATED');
    assert.ok(depRefundInit.body.refundId);

    // Lease Amendment (original contract remains untouched)
    const amdRes = await tenancyService.createLeaseAmendment({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        amendmentId: 'amd_parking_spot',
        reason: 'Updated assigned parking bay from P-12 to P-14',
        changedFields: {
          parkingBay: { previousValue: 'P-12', proposedValue: 'P-14' },
        },
        effectiveDateIso: '2027-04-01T00:00:00.000Z',
        amendmentDocumentId: 'doc_amd_01',
      },
      counterpartyConfirmed: true,
      idempotencyKey: 'idem_amd_1',
      correlationId: 'd13',
    });
    assert.equal(amdRes.body.status, 'APPROVED');

    // Controlled Rent Adjustment
    const adjRes = await tenancyService.proposeRentAdjustment({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        adjustmentId: 'rad_cpi_1',
        contractualClauseReference: 'CLAUSE_9_INDEXED',
        newRentAmount: 220_000_000,
        effectiveDateIso: '2027-06-01T00:00:00.000Z',
        reason: 'Contractual mid-term utility indexation',
      },
      approveImmediately: true,
      idempotencyKey: 'idem_rad_1',
      correlationId: 'd14',
    });
    assert.equal(adjRes.body.status, 'APPLIED');
    assert.equal(adjRes.body.previousRentAmount, 200_000_000);
    assert.equal(adjRes.body.newRentAmount, 220_000_000);

    // Maintenance Request + Service Provider Assignment + Approved Cost Obligation
    const mntCreated = await tenancyService.createMaintenanceRequest({
      principal: h.principals.tenant1,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        requestId: 'mnt_hvac_01',
        category: 'HVAC',
        description: 'Chiller compressor pressure drop',
        priority: 'HIGH',
        estimatedCostAmount: 25_000_000,
      },
      idempotencyKey: 'idem_mnt_1',
      correlationId: 'd15',
    });
    assert.equal(mntCreated.body.status, 'SUBMITTED');

    const mntUpdated = await tenancyService.updateMaintenanceRequest({
      principal: h.principals.manager,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      requestId: 'mnt_hvac_01',
      rawInput: {
        status: 'COMPLETED',
        assignedServiceProviderId: 'srv_provider_tehran_hvac_1',
        workOrderReference: 'WO_HVAC_991',
        approvedCostAmount: 22_000_000,
        costPayerUid: 'uid_landlord_01',
        completionSummary: 'Compressor valve replaced and pressure tested.',
      },
      idempotencyKey: 'idem_mnt_upd_1',
      correlationId: 'd16',
    });
    assert.equal(mntUpdated.body.status, 'COMPLETED');
    assert.equal(mntUpdated.body.linkedFinancialObligationId, 'obl_mnt_mnt_hvac_01');

    // Property Inspection (completed as immutable historical snapshot)
    const insRes = await tenancyService.recordInspection({
      principal: h.principals.manager,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        inspectionId: 'ins_move_out_1',
        inspectionType: 'MOVE_OUT',
        scheduledAtIso: '2027-07-30T10:00:00.000Z',
        checklist: [
          {
            area: 'Kitchen',
            condition: 'GOOD',
            notes: 'Appliances clean and operational',
            photoMediaIds: ['media_kitchen_01'],
          },
        ],
        completeImmediately: true,
      },
      idempotencyKey: 'idem_ins_1',
      correlationId: 'd17',
    });
    assert.equal(insRes.body.status, 'COMPLETED_IMMUTABLE');

    // Prevent modifying a completed immutable inspection
    await assert.rejects(
      () =>
        tenancyService.recordInspection({
          principal: h.principals.manager,
          propertyId: 'prop_saadatabad_2',
          leaseId: 'lse_saadat_1',
          rawInput: {
            inspectionId: 'ins_move_out_1',
            inspectionType: 'MOVE_OUT',
            scheduledAtIso: '2027-07-30T10:00:00.000Z',
            checklist: [],
            completeImmediately: true,
          },
          idempotencyKey: 'idem_ins_mutate_attempt',
          correlationId: 'd17_mut',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Block handover completion if keysTransferredConfirmed is false
    await assert.rejects(
      () =>
        tenancyService.performHandover({
          principal: h.principals.manager,
          propertyId: 'prop_saadatabad_2',
          leaseId: 'lse_saadat_1',
          rawInput: {
            handoverId: 'hnd_incomplete_1',
            handoverType: 'MOVE_OUT',
            scheduledAtIso: '2027-07-31T12:00:00.000Z',
            inspectionReferenceId: 'ins_move_out_1',
            keysTransferredConfirmed: false,
            accessDevicesTransferredConfirmed: true,
            completeHandover: true,
          },
          idempotencyKey: 'idem_hnd_incomplete',
          correlationId: 'd18_inc',
        }),
      (err: unknown) => err instanceof CoreApiError && err.code === 'CONFLICT',
    );

    // Complete move-out handover with all required checklist items verified
    const hndCompleted = await tenancyService.performHandover({
      principal: h.principals.manager,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        handoverId: 'hnd_move_out_1',
        handoverType: 'MOVE_OUT',
        scheduledAtIso: '2027-07-31T12:00:00.000Z',
        inspectionReferenceId: 'ins_move_out_1',
        keysTransferredConfirmed: true,
        accessDevicesTransferredConfirmed: true,
        meterReadings: { electricityKwh: 14520, waterCubicMeters: 310, gasCubicMeters: 890 },
        handoverDocumentMediaIds: ['media_handover_receipt_01'],
        completeHandover: true,
      },
      idempotencyKey: 'idem_hnd_1',
      correlationId: 'd18',
    });
    assert.equal(hndCompleted.body.status, 'COMPLETED');

    // Propose & accept Lease Renewal before termination test on a separate renewal flow, or test termination
    const rnwProp = await tenancyService.proposeLeaseRenewal({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        renewalId: 'rnw_saadat_2027_b',
        newLeaseStartDateIso: '2027-08-01T00:00:00.000Z',
        newLeaseEndDateIso: '2028-02-01T00:00:00.000Z',
        proposedPeriodicRentAmount: 230_000_000,
        proposedDepositAmount: 6_500_000_000,
        installmentCount: 6,
        proposedConditions: '6-month renewal term',
        newContractDocumentId: 'doc_saadat_rnw_02',
      },
      idempotencyKey: 'idem_rnw_prop_1',
      correlationId: 'd19',
    });
    assert.equal(rnwProp.body.status, 'PROPOSED');

    const rnwAccepted = await tenancyService.respondToLeaseRenewal({
      principal: h.principals.tenant1,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      renewalId: 'rnw_saadat_2027_b',
      rawInput: { decision: 'ACCEPT', newContractDocumentId: 'doc_saadat_rnw_02' },
      idempotencyKey: 'idem_rnw_acc_1',
      correlationId: 'd20',
    });
    assert.equal(rnwAccepted.body.renewal.status, 'RENEWED_LEASE_CREATED');
    assert.ok(rnwAccepted.body.successorLease);
    assert.equal(rnwAccepted.body.successorLease?.previousLeaseId, 'lse_saadat_1');

    // Finalize Tenancy Termination on lse_saadat_1 -> restores property availability to AVAILABLE
    const trmRes = await tenancyService.initiateOrCompleteTermination({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
      leaseId: 'lse_saadat_1',
      rawInput: {
        terminationId: 'trm_saadat_1',
        terminationType: 'CONTRACTUAL_EXPIRATION',
        effectiveTerminationDateIso: '2027-08-01T00:00:00.000Z',
        reason: 'End of initial 6-month term',
        contractualRuleReference: 'CLAUSE_2_TERM_EXPIRY',
        moveOutHandoverId: 'hnd_move_out_1',
        completeTermination: true,
      },
      idempotencyKey: 'idem_trm_1',
      correlationId: 'd21',
    });
    assert.equal(trmRes.body.status, 'COMPLETED');

    const finalOverview = await tenancyService.getPropertyTenancyOverview({
      principal: h.principals.landlord,
      propertyId: 'prop_saadatabad_2',
    });
    assert.equal(finalOverview.propertyConfig.availabilityStatus, 'AVAILABLE');
    const origLeaseAfter = finalOverview.leases.find((l) => l.leaseId === 'lse_saadat_1');
    assert.equal(origLeaseAfter?.status, 'TERMINATED');
    // Original periodicRentAmount on original lease is preserved (not overwritten)
    assert.equal(origLeaseAfter?.periodicRentAmount, 200_000_000);
    assert.equal(origLeaseAfter?.renewedByLeaseId, 'lse_rnw_rnw_saadat_2027_b');
  });

  it('3. Serves Express HTTP routes with authentication, access control, and analytics', async () => {
    const h = createInMemoryTenancyHarness();
    const app = express();
    app.use(express.json());
    app.use('/api/tenancy', createTenancyManagementRouter(h));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/tenancy`;

    try {
      const cfgRes = await fetch(`${baseUrl}/properties/prop_http_ten_1/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_landlord_valid_0001',
          'Idempotency-Key': 'http_idem_cfg_1',
        },
        body: JSON.stringify({
          availabilityStatus: 'APPLICATIONS_OPEN',
          rentalCategory: 'RESIDENTIAL_APARTMENT',
          maxOccupancyCount: 3,
          furnishingStatus: 'UNFURNISHED',
          facilities: ['PARKING'],
          parkingSpaces: 1,
          hasStorageUnit: false,
          rentalConditions: 'No smoking',
          minLeaseDurationMonths: 12,
          maxLeaseDurationMonths: 24,
          requiredDepositAmount: 4_000_000_000,
          advertisedPeriodicRentAmount: 120_000_000,
          currency: 'IRR',
          availableFromIso: '2027-04-01T00:00:00.000Z',
        }),
      });
      assert.equal(cfgRes.status, 200);

      // Outsider with no application or lease is blocked from private property overview (403)
      const outsiderRes = await fetch(`${baseUrl}/properties/prop_http_ten_1/overview`, {
        headers: { Authorization: 'Bearer token_outsider_valid_0099' },
      });
      assert.equal(outsiderRes.status, 403);

      // Submit application via HTTP POST
      const appRes = await fetch(`${baseUrl}/properties/prop_http_ten_1/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_tenant1_valid_00001',
          'Idempotency-Key': 'http_idem_app_1',
        },
        body: JSON.stringify({
          applicationId: 'app_http_1',
          proposedPeriodicRentAmount: 120_000_000,
          proposedDepositAmount: 4_000_000_000,
          currency: 'IRR',
          desiredMoveInDateIso: '2027-04-05T00:00:00.000Z',
          desiredLeaseDurationMonths: 12,
          occupantCount: 2,
        }),
      });
      assert.equal(appRes.status, 201);

      // Analytics endpoint
      const analyticsRes = await fetch(`${baseUrl}/analytics`, {
        headers: { Authorization: 'Bearer token_admin_valid_0000001' },
      });
      assert.equal(analyticsRes.status, 200);
      const analyticsJson = (await analyticsRes.json()) as {
        ok: boolean;
        data: { rentalApplicationVolume: number };
      };
      assert.equal(analyticsJson.data.rentalApplicationVolume, 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
