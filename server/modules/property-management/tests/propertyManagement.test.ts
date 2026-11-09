import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type StructuredAuditEvent,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createPropertyManagementService,
  PROPERTY_MANAGEMENT_ROUTE_REGISTRATION_SPEC,
  type AuthoritativePaymentVerificationResult,
  type CanonicalPropertyRegistrySnapshot,
  type PropertyManagementModuleDependencies,
  type PropertyManagementNotificationOutboxEvent,
  type TrustAndSafetyEscalationPayload,
} from '../index';

function makePrincipal(uid: string, email = `${uid}@example.com`): AuthenticatedPrincipal {
  return {
    uid,
    email,
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: { uid, email, email_verified: true },
  };
}

function createInMemoryDurableTransactionRunner(options?: {
  failAllWrites?: boolean;
  abortFirstAttempts?: number;
}) {
  const store = new Map<string, Record<string, unknown>>();
  let remainingAborts = options?.abortFirstAttempts ?? 0;

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(workFn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      if (options?.failAllWrites) {
        throw new Error('Firestore durable storage unreachable');
      }
      if (remainingAborts > 0) {
        remainingAborts--;
        const abortErr = new Error('10 ABORTED: cross-transaction contention') as Error & {
          code: string;
        };
        abortErr.code = 'ABORTED';
        throw abortErr;
      }

      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<Doc = Record<string, unknown>>(docPath: string) {
          if (staged.has(docPath)) {
            const val = staged.get(docPath);
            return val
              ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(val) as Doc }
              : { exists: false, id: docPath.split('/').pop()! };
          }
          const raw = store.get(docPath);
          return raw
            ? { exists: true, id: docPath.split('/').pop()!, data: structuredClone(raw) as Doc }
            : { exists: false, id: docPath.split('/').pop()! };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          if (setOpts?.merge && store.has(docPath)) {
            staged.set(docPath, { ...store.get(docPath)!, ...structuredClone(data) });
          } else {
            staged.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, partial: Record<string, unknown>) {
          const base = staged.get(docPath) ?? store.get(docPath) ?? {};
          staged.set(docPath, { ...structuredClone(base), ...structuredClone(partial) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };

      const result = await workFn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) store.delete(k);
        else store.set(k, v);
      }
      return result;
    },
  };

  return { store, txRunner };
}

function createTestHarness(txOpts?: { failAllWrites?: boolean; abortFirstAttempts?: number }) {
  let currentEpochMs = Date.parse('2026-11-01T10:00:00.000Z');
  const { store, txRunner } = createInMemoryDurableTransactionRunner(txOpts);
  const auditEvents: StructuredAuditEvent[] = [];
  const publishedNotifications: PropertyManagementNotificationOutboxEvent[] = [];
  const escalatedCases: TrustAndSafetyEscalationPayload[] = [];

  const properties = new Map<string, CanonicalPropertyRegistrySnapshot>([
    [
      'prop_unit_101',
      {
        propertyRefId: 'prop_unit_101',
        buildingRefId: 'bldg_pars_1',
        unitRefId: 'prop_unit_101',
        category: 'RESIDENTIAL_UNIT',
        verifiedOwnerUids: ['owner_ali'],
        supportsMultipleConcurrentOccupancies: false,
        geographicRef: { cityId: 'tehran', hoodId: 1 },
        publicLocationSummaryFa: 'تهران، ونک، خیابان ملاصدرا',
        privateExactAddressFa: 'تهران، ونک، ملاصدرا، کوچه ۱۲، پلاک ۸، واحد ۱۰۱',
      },
    ],
    [
      'prop_unit_102',
      {
        propertyRefId: 'prop_unit_102',
        buildingRefId: 'bldg_pars_1',
        unitRefId: 'prop_unit_102',
        category: 'RESIDENTIAL_UNIT',
        verifiedOwnerUids: ['owner_ali'],
        supportsMultipleConcurrentOccupancies: false,
        geographicRef: { cityId: 'tehran', hoodId: 1 },
        publicLocationSummaryFa: 'تهران، ونک، خیابان ملاصدرا',
        privateExactAddressFa: 'تهران، ونک، ملاصدرا، کوچه ۱۲، پلاک ۸، واحد ۱۰۲',
      },
    ],
    [
      'bldg_pars_1',
      {
        propertyRefId: 'bldg_pars_1',
        buildingRefId: 'bldg_pars_1',
        category: 'MULTI_UNIT_BUILDING',
        verifiedOwnerUids: ['owner_ali'],
        supportsMultipleConcurrentOccupancies: true,
        maxConcurrentOccupancies: 10,
        geographicRef: { cityId: 'tehran', hoodId: 1 },
        publicLocationSummaryFa: 'تهران، ونک، مجتمع پارس',
        privateExactAddressFa: 'تهران، ونک، ملاصدرا، کوچه ۱۲، پلاک ۸',
        unitRefIdsInBuilding: ['prop_unit_101', 'prop_unit_102'],
      },
    ],
  ]);

  const paymentEvents = new Map<string, AuthoritativePaymentVerificationResult>();

  const deps: PropertyManagementModuleDependencies = {
    txRunner,
    nowFn: () => currentEpochMs,
    auditSink: {
      async writeAuditEvent(evt) {
        auditEvents.push(evt);
      },
    },
    propertyRegistry: {
      async getPropertyOrUnitSnapshot(id) {
        return properties.get(id) ?? null;
      },
    },
    propertyTransactions: {
      async getVerifiedDealReference(dealId) {
        if (dealId === 'deal_valid_101') {
          return {
            dealId: 'deal_valid_101',
            propertyRefId: 'prop_unit_101',
            landlordUid: 'owner_ali',
            tenantUid: 'tenant_sara',
            negotiationStatus: 'OFFER_ACCEPTED',
          };
        }
        return null;
      },
    },
    propertyServices: {
      async verifyServiceProvider(providerId) {
        if (providerId === 'srv_plumber_1') {
          return {
            providerId,
            active: true,
            supportedCategories: ['PLUMBING'],
            verifiedCredentialState: 'VERIFIED',
          };
        }
        return null;
      },
      async verifyWorkOrderReference(workOrderId, providerId) {
        if (workOrderId === 'wo_1001' && providerId === 'srv_plumber_1') {
          return {
            workOrderId,
            providerId,
            propertyRefId: 'prop_unit_101',
            status: 'SCHEDULED',
          };
        }
        return null;
      },
    },
    geography: {
      async validateGeographicReference(cityId, hoodId) {
        return { valid: cityId === 'tehran' && hoodId > 0, cityNameFa: 'تهران', hoodNameFa: 'ونک' };
      },
    },
    media: {
      async verifyMediaReferences(mediaIds, actorUid) {
        const invalidIds = mediaIds.filter((m) => m.startsWith('unauth_'));
        return {
          valid: invalidIds.length === 0,
          invalidIds,
          records: mediaIds.map((m) => ({
            mediaId: m,
            ownerUid: actorUid,
            mimeType: 'image/webp',
            visibility: 'PRIVATE_OPERATIONAL_EVIDENCE',
            retentionHoldActive: false,
          })),
        };
      },
    },
    paymentAuthority: {
      async verifyAuthoritativePaymentEvent(refId) {
        return paymentEvents.get(refId) ?? null;
      },
    },
    notifications: {
      async publishNotificationEvent(evt) {
        publishedNotifications.push(evt);
        return { accepted: true, outboxId: `out_${evt.eventId}` };
      },
    },
    trustAndSafety: {
      async escalateCase(payload) {
        escalatedCases.push(payload);
        return {
          investigationRefId: `tsinv_${payload.escalationId}`,
          status: 'QUEUED_FOR_INVESTIGATION',
        };
      },
    },
    legalPolicy: {
      async evaluateTerminationNoticeWindow(params) {
        return {
          policyVerified: true,
          policyReferenceCode: 'IR_CONTRACTUAL_NOTICE_POLICY_V1',
          note: `Evaluated notice window for ${params.agreementId}`,
        };
      },
    },
  };

  const service = createPropertyManagementService(deps);

  return {
    service,
    store,
    paymentEvents,
    auditEvents,
    publishedNotifications,
    escalatedCases,
    advanceTimeMs(deltaMs: number) {
      currentEpochMs += deltaMs;
    },
  };
}

test('1-4 & 20 & 26: Portfolio creation, multi-unit properties, explicit management authorization scope, expiration, revocation & idempotency', async () => {
  const h = createTestHarness();
  const owner = makePrincipal('owner_ali');
  const manager = makePrincipal('mgr_reza');
  const stranger = makePrincipal('stranger_bob');

  // Manager creates a portfolio — does NOT automatically get authority over owner_ali's properties
  const mgrPort = await h.service.createPortfolio({
    principal: manager,
    idempotencyKey: 'idem_mgr_port_001',
    correlationId: 'corr_1',
    rawBody: {
      name: 'Reza Management Co',
      portfolioType: 'PROPERTY_MANAGEMENT_COMPANY',
    },
  });
  assert.equal(mgrPort.replayed, false);

  await assert.rejects(
    () =>
      h.service.addManagedPropertyToPortfolio({
        principal: manager,
        portfolioId: mgrPort.portfolio.id,
        idempotencyKey: 'idem_add_unauth_001',
        correlationId: 'corr_1',
        rawBody: { propertyRefId: 'prop_unit_101' },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Owner creates portfolio and idempotently replays
  const port1 = await h.service.createPortfolio({
    principal: owner,
    idempotencyKey: 'idem_owner_port_001',
    correlationId: 'corr_1',
    rawBody: {
      name: 'Ali Residential & Multi-Unit Portfolio',
      portfolioType: 'MULTI_UNIT_BUILDING',
    },
  });
  const port1Replay = await h.service.createPortfolio({
    principal: owner,
    idempotencyKey: 'idem_owner_port_001',
    correlationId: 'corr_1',
    rawBody: {
      name: 'Ali Residential & Multi-Unit Portfolio',
      portfolioType: 'MULTI_UNIT_BUILDING',
    },
  });
  assert.equal(port1Replay.replayed, true);
  assert.equal(port1Replay.portfolio.id, port1.portfolio.id);

  // Idempotency payload mismatch rejected with 409
  await assert.rejects(
    () =>
      h.service.createPortfolio({
        principal: owner,
        idempotencyKey: 'idem_owner_port_001',
        correlationId: 'corr_1',
        rawBody: {
          name: 'Different Name With Same Key',
          portfolioType: 'MULTI_UNIT_BUILDING',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  );

  // Cross-owner access rejected
  await assert.rejects(
    () => h.service.getPortfolio({ principal: stranger, portfolioId: port1.portfolio.id }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Add multiple properties/units and remove one while preserving membershipHistory
  await h.service.addManagedPropertyToPortfolio({
    principal: owner,
    portfolioId: port1.portfolio.id,
    idempotencyKey: 'idem_add_101',
    correlationId: 'corr_1',
    rawBody: { propertyRefId: 'prop_unit_101', arrangementNote: 'Unit 101 managed' },
  });
  await h.service.addManagedPropertyToPortfolio({
    principal: owner,
    portfolioId: port1.portfolio.id,
    idempotencyKey: 'idem_add_102',
    correlationId: 'corr_1',
    rawBody: { propertyRefId: 'prop_unit_102', arrangementNote: 'Unit 102 managed' },
  });

  const afterRemove = await h.service.removeManagedPropertyFromPortfolio({
    principal: owner,
    portfolioId: port1.portfolio.id,
    propertyRefId: 'prop_unit_102',
    reason: 'Owner direct use',
    correlationId: 'corr_1',
  });
  assert.equal(afterRemove.propertyRefs.length, 1);
  assert.equal(afterRemove.membershipHistory.length, 3);

  // Grant scoped management authorization ONLY for prop_unit_101 with MAINTENANCE_COORDINATION scope
  const authGrant = await h.service.grantManagementAuthorization({
    principal: owner,
    idempotencyKey: 'idem_grant_auth_101',
    correlationId: 'corr_1',
    rawBody: {
      portfolioId: port1.portfolio.id,
      propertyRefId: 'prop_unit_101',
      authorizedManagerUid: 'mgr_reza',
      scopes: ['MAINTENANCE_COORDINATION', 'INSPECTION_COORDINATION'],
      startDateIso: '2026-10-01T00:00:00.000Z',
      expirationDateIso: '2026-11-10T00:00:00.000Z',
      supportingEvidenceMediaIds: ['media_auth_doc_1'],
    },
  });
  assert.equal(authGrant.authorization.state, 'PENDING');

  // Confirm authorization
  const confirmedAuth = await h.service.confirmManagementAuthorization({
    principal: manager,
    authorizationId: authGrant.authorization.id,
    correlationId: 'corr_1',
  });
  assert.equal(confirmedAuth.state, 'ACTIVE');

  // Building-level / unit-level isolation: Manager authorized on unit 101 with MAINTENANCE_COORDINATION
  // CANNOT create a rental agreement (requires LEASE_ADMINISTRATION) or act on unit 102!
  await assert.rejects(
    () =>
      h.service.createRentalAgreement({
        principal: manager,
        idempotencyKey: 'idem_mgr_unauth_lease',
        correlationId: 'corr_1',
        rawBody: {
          propertyRefId: 'prop_unit_101',
          tenantUid: 'tenant_sara',
          agreementType: 'RESIDENTIAL_LEASE',
          startDateIso: '2026-11-01T00:00:00.000Z',
          endDateIso: '2027-11-01T00:00:00.000Z',
          depositAmount: 500_000_000,
          monthlyRentAmount: 25_000_000,
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  await assert.rejects(
    () =>
      h.service.submitMaintenanceRequest({
        principal: manager,
        idempotencyKey: 'idem_mgr_wrong_unit_102',
        correlationId: 'corr_1',
        rawBody: {
          propertyRefId: 'prop_unit_102',
          issueCategory: 'PLUMBING',
          description: 'Checking unit 102 without unit 102 scope',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Advance clock past authorization expiration -> manager loses access automatically
  h.advanceTimeMs(15 * 24 * 60 * 60 * 1000);
  await assert.rejects(
    () =>
      h.service.submitMaintenanceRequest({
        principal: manager,
        idempotencyKey: 'idem_mgr_expired_101',
        correlationId: 'corr_1',
        rawBody: {
          propertyRefId: 'prop_unit_101',
          issueCategory: 'PLUMBING',
          description: 'Expired authorization attempt',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Revoke authorization explicitly
  const revoked = await h.service.revokeOrSuspendManagementAuthorization({
    principal: owner,
    authorizationId: confirmedAuth.id,
    targetState: 'REVOKED',
    reason: 'Contract ended',
    correlationId: 'corr_1',
  });
  assert.equal(revoked.revocationStatus, 'REVOKED');
});

test('5-9, 15, 21 & 28: Agreement versions, concurrent updates, renewal, termination, handover & occupancy lifecycle with exact address privacy', async () => {
  const h = createTestHarness();
  const owner = makePrincipal('owner_ali');
  const tenant = makePrincipal('tenant_sara');
  const tenant2 = makePrincipal('tenant_omid');
  const outsider = makePrincipal('outsider_user');

  // Create rental agreement linked to verified deal reference
  const agrRes = await h.service.createRentalAgreement({
    principal: owner,
    idempotencyKey: 'idem_agr_101',
    correlationId: 'corr_2',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      tenantUid: 'tenant_sara',
      relatedDealRefId: 'deal_valid_101',
      agreementType: 'RESIDENTIAL_LEASE',
      startDateIso: '2026-11-01T00:00:00.000Z',
      endDateIso: '2027-11-01T00:00:00.000Z',
      depositAmount: 600_000_000,
      monthlyRentAmount: 30_000_000,
      maxAuthorizedOccupants: 2,
      documentMediaIds: ['media_lease_scan_1'],
    },
  });
  assert.equal(
    agrRes.agreement.documentVerificationDistinction,
    'UPLOADED_DOCUMENT_NOT_LEGALLY_AUTHENTICATED',
  );
  assert.ok(agrRes.agreement.legalValidityDisclaimer.includes('OPERATIONAL_RECORD_ONLY'));

  // Amend agreement & verify originalDepositAmount / originalMonthlyRentAmount are preserved
  const amendedAgr = await h.service.amendRentalAgreement({
    principal: owner,
    agreementId: agrRes.agreement.id,
    expectedRevision: 1,
    correlationId: 'corr_2',
    rawBody: {
      monthlyRentAmount: 32_000_000,
      amendmentReason: 'Parking space added by mutual addendum',
    },
  });
  assert.equal(amendedAgr.currentVersion, 2);
  assert.equal(amendedAgr.originalMonthlyRentAmount, 30_000_000);
  assert.equal(amendedAgr.monthlyRentAmount, 32_000_000);

  // Optimistic concurrency conflict check (stale expectedRevision = 1)
  await assert.rejects(
    () =>
      h.service.amendRentalAgreement({
        principal: owner,
        agreementId: agrRes.agreement.id,
        expectedRevision: 1,
        correlationId: 'corr_2',
        rawBody: {
          monthlyRentAmount: 35_000_000,
          amendmentReason: 'Stale revision update',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 409,
  );

  // Activate agreement
  await h.service.activateOrTransitionAgreementState({
    principal: owner,
    agreementId: agrRes.agreement.id,
    targetStatus: 'ACTIVE',
    correlationId: 'corr_2',
  });

  // Register occupancy in SCHEDULED state (cannot jump directly to ACTIVE without confirmed move-in handover)
  const occRes = await h.service.registerOccupancy({
    principal: owner,
    idempotencyKey: 'idem_occ_101',
    correlationId: 'corr_2',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      rentalAgreementId: agrRes.agreement.id,
      tenantUid: 'tenant_sara',
      authorizedCoOccupantUids: ['co_occupant_mina'],
      occupancyStartDateIso: '2026-11-01T00:00:00.000Z',
      expectedEndDateIso: '2027-11-01T00:00:00.000Z',
      initialStatus: 'SCHEDULED',
    },
  });

  // Attempting to activate occupancy before move-in handover is completed fails
  await assert.rejects(
    () =>
      h.service.updateOccupancyStatus({
        principal: owner,
        occupancyId: occRes.occupancy.id,
        targetStatus: 'ACTIVE',
        correlationId: 'corr_2',
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 409,
  );

  // Handover rejects passwords / door codes in access items
  await assert.rejects(
    () =>
      h.service.schedulePropertyHandover({
        principal: owner,
        idempotencyKey: 'idem_ho_bad_secret',
        correlationId: 'corr_2',
        rawBody: {
          propertyRefId: 'prop_unit_101',
          relatedOccupancyId: occRes.occupancy.id,
          handoverType: 'INITIAL_TENANT_MOVE_IN',
          scheduledAtIso: '2026-11-01T12:00:00.000Z',
          propertyConditionSummary: 'Clean and painted',
          participants: [
            { uid: 'owner_ali', role: 'LANDLORD' },
            { uid: 'tenant_sara', role: 'TENANT' },
          ],
          keyAndAccessItems: [
            {
              itemType: 'PHYSICAL_KEY',
              itemLabel: 'Door code 9988 secret code',
              quantity: 2,
              handedOver: true,
            },
          ],
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 400,
  );

  // Schedule valid move-in handover
  const hoRes = await h.service.schedulePropertyHandover({
    principal: owner,
    idempotencyKey: 'idem_ho_movein_101',
    correlationId: 'corr_2',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      relatedOccupancyId: occRes.occupancy.id,
      handoverType: 'INITIAL_TENANT_MOVE_IN',
      scheduledAtIso: '2026-11-01T12:00:00.000Z',
      propertyConditionSummary: 'Freshly painted walls, all meters verified',
      participants: [
        { uid: 'owner_ali', role: 'LANDLORD' },
        { uid: 'tenant_sara', role: 'TENANT' },
      ],
      meterReadings: [
        {
          meterType: 'ELECTRICITY',
          meterSerialRef: 'EL-9901',
          readingValue: 14250,
          unit: 'kWh',
        },
      ],
      keyAndAccessItems: [
        {
          itemType: 'PHYSICAL_KEY',
          itemLabel: 'Front entrance brass key',
          quantity: 2,
          handedOver: true,
        },
      ],
    },
  });

  // Record a disagreement without mutating originalPropertyConditionSummary
  const disputedHo = await h.service.confirmOrDisputeHandover({
    principal: tenant,
    handoverId: hoRes.handover.id,
    action: 'RECORD_DISAGREEMENT',
    note: 'Small scratch on kitchen cabinet door noted at move-in',
    correlationId: 'corr_2',
  });
  assert.equal(disputedHo.confirmationState, 'DISPUTED');
  assert.equal(
    disputedHo.originalPropertyConditionSummary,
    'Freshly painted walls, all meters verified',
  );
  assert.equal(disputedHo.disagreements.length, 1);

  // Both participants confirm handover -> COMPLETED_CONFIRMED
  await h.service.confirmOrDisputeHandover({
    principal: owner,
    handoverId: hoRes.handover.id,
    action: 'CONFIRM',
    correlationId: 'corr_2',
  });
  const completedHo = await h.service.confirmOrDisputeHandover({
    principal: tenant,
    handoverId: hoRes.handover.id,
    action: 'CONFIRM',
    correlationId: 'corr_2',
  });
  assert.equal(completedHo.confirmationState, 'COMPLETED_CONFIRMED');

  // Now activate occupancy with confirmed moveInHandoverId
  const activeOcc = await h.service.updateOccupancyStatus({
    principal: owner,
    occupancyId: occRes.occupancy.id,
    targetStatus: 'ACTIVE',
    moveInHandoverId: completedHo.id,
    correlationId: 'corr_2',
  });
  assert.equal(activeOcc.status, 'ACTIVE');

  // Conflicting occupancy on the same unit is prevented
  const agr2 = await h.service.createRentalAgreement({
    principal: owner,
    idempotencyKey: 'idem_agr_conflict',
    correlationId: 'corr_2',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      tenantUid: 'tenant_omid',
      agreementType: 'RESIDENTIAL_LEASE',
      startDateIso: '2026-12-01T00:00:00.000Z',
      endDateIso: '2027-12-01T00:00:00.000Z',
      depositAmount: 500_000_000,
      monthlyRentAmount: 28_000_000,
    },
  });
  await h.service.activateOrTransitionAgreementState({
    principal: owner,
    agreementId: agr2.agreement.id,
    targetStatus: 'ACTIVE',
    correlationId: 'corr_2',
  });
  await assert.rejects(
    () =>
      h.service.registerOccupancy({
        principal: owner,
        idempotencyKey: 'idem_occ_conflict',
        correlationId: 'corr_2',
        rawBody: {
          propertyRefId: 'prop_unit_101',
          rentalAgreementId: agr2.agreement.id,
          tenantUid: tenant2.uid,
          occupancyStartDateIso: '2027-01-01T00:00:00.000Z',
          expectedEndDateIso: '2027-10-01T00:00:00.000Z',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 409,
  );

  // Exact address privacy: Tenant receives exact address; outsider is blocked with 403
  const occDetails = await h.service.getAuthorizedOccupancyDetails({
    principal: tenant,
    occupancyId: activeOcc.id,
  });
  assert.ok(occDetails.locationAccess.privateExactAddressFa?.includes('واحد ۱۰۱'));

  await assert.rejects(
    () =>
      h.service.getAuthorizedOccupancyDetails({
        principal: outsider,
        occupancyId: activeOcc.id,
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Renewal workflow: Proposal does NOT overwrite active agreement financial terms until accepted
  const renProposal = await h.service.requestLeaseRenewal({
    principal: owner,
    agreementId: agrRes.agreement.id,
    idempotencyKey: 'idem_ren_prop_1',
    correlationId: 'corr_2',
    rawBody: {
      proposedNewRent: 38_000_000,
      proposedNewDeposit: 700_000_000,
      proposedStartDateIso: '2027-11-01T00:00:00.000Z',
      proposedEndDateIso: '2028-11-01T00:00:00.000Z',
      revisedConditions: '12-month renewal',
    },
  });
  assert.equal(renProposal.renewalRequest.status, 'PROPOSED');

  // Tenant accepts renewal -> creates version 3 on agreement
  const renAccepted = await h.service.decideLeaseRenewal({
    principal: tenant,
    renewalId: renProposal.renewalRequest.id,
    decision: 'ACCEPTED',
    decisionNote: 'Accepted by tenant Sara',
    correlationId: 'corr_2',
  });
  assert.equal(renAccepted.renewalRequest.status, 'ACCEPTED');
  assert.equal(renAccepted.agreement.currentVersion, 3);
  assert.equal(renAccepted.agreement.monthlyRentAmount, 38_000_000);
  assert.equal(renAccepted.agreement.originalMonthlyRentAmount, 30_000_000);

  // Early termination workflow records verified legal policy reference without claiming legal determination
  const termRes = await h.service.recordLeaseTerminationWorkflow({
    principal: tenant,
    agreementId: agrRes.agreement.id,
    idempotencyKey: 'idem_term_1',
    correlationId: 'corr_2',
    rawBody: {
      terminationReason: 'Job relocation to Isfahan',
      intendedTerminationDateIso: '2027-06-01T00:00:00.000Z',
      tenantNoticeRef: 'notice_doc_77',
    },
  });
  assert.equal(termRes.termination.isEarlyTermination, true);
  assert.equal(termRes.termination.verifiedLegalPolicyRefCode, 'IR_CONTRACTUAL_NOTICE_POLICY_V1');
  assert.ok(termRes.termination.legalDeterminationDisclaimer.includes('OPERATIONAL_WORKFLOW_ONLY'));
});

test('10-14, 16-19, 22-25, 27 & 29-31: Obligations, payment boundary, inspections, maintenance, incidents, reporting, pagination, retries & retention holds', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });
  const owner = makePrincipal('owner_ali');
  const tenant = makePrincipal('tenant_sara');

  const port = await h.service.createPortfolio({
    principal: owner,
    idempotencyKey: 'idem_port_full',
    correlationId: 'corr_3',
    rawBody: {
      name: 'Vanak Portfolio',
      portfolioType: 'RESIDENTIAL_PORTFOLIO',
    },
  });

  await h.service.addManagedPropertyToPortfolio({
    principal: owner,
    portfolioId: port.portfolio.id,
    idempotencyKey: 'idem_port_add_101',
    correlationId: 'corr_3',
    rawBody: { propertyRefId: 'prop_unit_101' },
  });

  const agr = await h.service.createRentalAgreement({
    principal: owner,
    idempotencyKey: 'idem_agr_full',
    correlationId: 'corr_3',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      portfolioId: port.portfolio.id,
      tenantUid: 'tenant_sara',
      agreementType: 'RESIDENTIAL_LEASE',
      startDateIso: '2026-11-01T00:00:00.000Z',
      endDateIso: '2026-11-20T00:00:00.000Z',
      depositAmount: 500_000_000,
      monthlyRentAmount: 25_000_000,
      initialStatus: 'PENDING_COMMENCEMENT',
    },
  });
  await h.service.activateOrTransitionAgreementState({
    principal: owner,
    agreementId: agr.agreement.id,
    targetStatus: 'ACTIVE',
    correlationId: 'corr_3',
  });

  // Schedule separate SECURITY_DEPOSIT and MONTHLY_RENT obligations
  const depObl = await h.service.createObligationSchedule({
    principal: owner,
    idempotencyKey: 'idem_obl_dep_1',
    correlationId: 'corr_3',
    rawBody: {
      agreementId: agr.agreement.id,
      obligationType: 'SECURITY_DEPOSIT',
      dueDateIso: '2026-11-01T00:00:00.000Z',
      amount: 500_000_000,
      paymentPeriodKey: 'DEPOSIT-INITIAL',
      coveredPeriodStartIso: '2026-11-01T00:00:00.000Z',
      coveredPeriodEndIso: '2026-11-20T00:00:00.000Z',
    },
  });

  const rentObl = await h.service.createObligationSchedule({
    principal: owner,
    idempotencyKey: 'idem_obl_rent_1',
    correlationId: 'corr_3',
    rawBody: {
      agreementId: agr.agreement.id,
      obligationType: 'MONTHLY_RENT',
      dueDateIso: '2026-11-05T00:00:00.000Z',
      amount: 25_000_000,
      paymentPeriodKey: '1405-08',
      coveredPeriodStartIso: '2026-11-01T00:00:00.000Z',
      coveredPeriodEndIso: '2026-11-30T00:00:00.000Z',
      gracePeriodDays: 2,
    },
  });

  // Duplicate obligation for the same agreement + obligationType + paymentPeriodKey is rejected
  await assert.rejects(
    () =>
      h.service.createObligationSchedule({
        principal: owner,
        idempotencyKey: 'idem_obl_rent_dup_different_key',
        correlationId: 'corr_3',
        rawBody: {
          agreementId: agr.agreement.id,
          obligationType: 'MONTHLY_RENT',
          dueDateIso: '2026-11-05T00:00:00.000Z',
          amount: 25_000_000,
          paymentPeriodKey: '1405-08',
          coveredPeriodStartIso: '2026-11-01T00:00:00.000Z',
          coveredPeriodEndIso: '2026-11-30T00:00:00.000Z',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 409,
  );

  // Tenant self-reports rent payment -> status is REPORTED_AS_PAID, NEVER PAYMENT_CONFIRMED
  const selfReported = await h.service.reportTenantPaymentClaim({
    principal: tenant,
    obligationId: rentObl.obligation.id,
    reportedAmount: 25_000_000,
    note: 'Transferred via banking app receipt #8821',
    correlationId: 'corr_3',
  });
  assert.equal(selfReported.status, 'REPORTED_AS_PAID');
  assert.equal(selfReported.paymentState, 'PAYMENT_REPORTED');
  assert.equal(selfReported.confirmedSettledAmount, 0);

  // Unverified payment reference is rejected
  await assert.rejects(
    () =>
      h.service.associateAuthoritativePaymentReference({
        principal: tenant,
        obligationId: rentObl.obligation.id,
        externalPaymentRefId: 'fake_unverified_payment_ref',
        idempotencyKey: 'idem_fake_pay',
        correlationId: 'corr_3',
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 400,
  );

  // Authoritative payment confirmation for deposit
  h.paymentEvents.set('pay_auth_dep_01', {
    externalPaymentRefId: 'pay_auth_dep_01',
    obligationId: depObl.obligation.id,
    agreementId: agr.agreement.id,
    payerUid: 'tenant_sara',
    amount: 500_000_000,
    currency: 'TOMAN',
    status: 'PAYMENT_CONFIRMED_AUTHORITATIVE',
    providerId: 'shaparak_verified_gateway',
    authoritativeSignatureVerified: true,
    occurredAtIso: '2026-11-01T11:00:00.000Z',
  });

  const confirmedDep = await h.service.associateAuthoritativePaymentReference({
    principal: owner,
    obligationId: depObl.obligation.id,
    externalPaymentRefId: 'pay_auth_dep_01',
    idempotencyKey: 'idem_reconcile_dep',
    correlationId: 'corr_3',
  });
  assert.equal(confirmedDep.obligation.status, 'PAYMENT_CONFIRMED');
  assert.equal(confirmedDep.obligation.confirmedSettledAmount, 500_000_000);

  // Inspection record & versioned amendment preserving originalFindingsSnapshot
  const insp = await h.service.recordPropertyInspection({
    principal: owner,
    idempotencyKey: 'idem_insp_1',
    correlationId: 'corr_3',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      inspectionType: 'MOVE_IN_INSPECTION',
      inspectionDateIso: '2026-11-01T09:00:00.000Z',
      inPersonAttendanceConfirmed: true,
      conditionCategories: [{ categoryName: 'Plumbing', rating: 'GOOD', notes: 'No leaks' }],
      reportedDefects: ['Minor paint chip in hallway'],
      maintenanceRecommendations: ['Touch up hallway paint'],
      evidenceMediaIds: ['media_insp_1'],
    },
  });
  const amendedInsp = await h.service.amendPropertyInspection({
    principal: owner,
    inspectionId: insp.inspection.id,
    amendmentReason: 'Added window seal observation',
    rawBody: {
      reportedDefects: ['Minor paint chip in hallway', 'Bedroom window seal worn'],
    },
    correlationId: 'corr_3',
  });
  assert.equal(amendedInsp.currentVersion, 2);
  assert.equal(amendedInsp.originalFindingsSnapshot.reportedDefects.length, 1);
  assert.equal(amendedInsp.reportedDefects.length, 2);

  // Unauthorized media reference rejected
  await assert.rejects(
    () =>
      h.service.recordPropertyIncident({
        principal: owner,
        idempotencyKey: 'idem_inc_bad_media',
        correlationId: 'corr_3',
        rawBody: {
          propertyRefId: 'prop_unit_101',
          incidentCategory: 'WATER_LEAK',
          description: 'Pipe leak with unauthorized media',
          reportedOccurrenceTimeIso: '2026-11-02T08:00:00.000Z',
          severity: 'HIGH',
          evidenceMediaIds: ['unauth_media_99'],
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Maintenance lifecycle: submit -> approve -> assign verified provider & work order -> complete
  const mnt = await h.service.submitMaintenanceRequest({
    principal: owner,
    idempotencyKey: 'idem_mnt_1',
    correlationId: 'corr_3',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      issueCategory: 'PLUMBING',
      description: 'Replace kitchen faucet cartridge',
      urgency: 'HIGH',
      estimatedCostAmount: 2_500_000,
    },
  });
  await h.service.processMaintenanceRequestAndSpending({
    principal: owner,
    maintenanceRequestId: mnt.maintenanceRequest.id,
    targetStatus: 'APPROVED',
    agreedCostAmount: 2_200_000,
    correlationId: 'corr_3',
  });
  const assignedMnt = await h.service.assignServiceProviderToMaintenance({
    principal: owner,
    maintenanceRequestId: mnt.maintenanceRequest.id,
    serviceProviderRefId: 'srv_plumber_1',
    workOrderRefId: 'wo_1001',
    correlationId: 'corr_3',
  });
  assert.equal(assignedMnt.status, 'SCHEDULED');

  h.advanceTimeMs(3_600_000);
  const completedMnt = await h.service.processMaintenanceRequestAndSpending({
    principal: owner,
    maintenanceRequestId: mnt.maintenanceRequest.id,
    targetStatus: 'COMPLETED',
    correlationId: 'corr_3',
  });
  assert.equal(completedMnt.status, 'COMPLETED');

  // Incident reporting & escalation to Trust & Safety
  const inc = await h.service.recordPropertyIncident({
    principal: owner,
    idempotencyKey: 'idem_inc_1',
    correlationId: 'corr_3',
    rawBody: {
      propertyRefId: 'prop_unit_101',
      incidentCategory: 'WATER_LEAK',
      description: 'Ceiling water seepage in parking level',
      reportedOccurrenceTimeIso: '2026-11-01T10:30:00.000Z',
      severity: 'HIGH',
      immediateActions: ['Main valve shut off'],
    },
  });
  assert.equal(inc.incident.findingClassification, 'ALLEGATION_UNCONFIRMED');

  const escalatedInc = await h.service.appendIncidentUpdateOrEscalateToTrustSafety({
    principal: owner,
    incidentId: inc.incident.id,
    note: 'Escalating property damage dispute for independent review',
    findingClassification: 'OPERATIONAL_OBSERVATION',
    escalateCategory: 'PROPERTY_DAMAGE_DISPUTE',
    correlationId: 'corr_3',
  });
  assert.equal(escalatedInc.resolutionStatus, 'ESCALATED_TO_TRUST_AND_SAFETY');
  assert.ok(escalatedInc.trustAndSafetyInvestigationRefId?.startsWith('tsinv_'));
  assert.equal(h.escalatedCases.length, 1);

  // Portfolio operational report accuracy
  const report = await h.service.retrievePortfolioOperationalReport({
    principal: owner,
    portfolioId: port.portfolio.id,
    windowStartIso: '2026-10-25T00:00:00.000Z',
    windowEndIso: '2026-12-01T00:00:00.000Z',
    upcomingExpirationHorizonDays: 30,
  });
  assert.equal(report.metrics.managedPropertyCount, 1);
  assert.equal(report.metrics.upcomingAgreementExpirationsCount, 1);
  assert.equal(report.metrics.financialObligationsInWindow.scheduledRentTotalAmount, 25_000_000);
  assert.equal(report.metrics.financialObligationsInWindow.scheduledDepositTotalAmount, 500_000_000);
  assert.equal(report.metrics.financialObligationsInWindow.tenantSelfReportedPaidCount, 1);
  assert.equal(report.metrics.financialObligationsInWindow.authoritativeConfirmedPaidCount, 1);
  assert.equal(report.metrics.maintenanceMetricsInWindow.completedMaintenanceRequests, 1);
  assert.equal(report.metrics.maintenanceMetricsInWindow.averageResolutionTimeMs, 3_600_000);
  assert.equal(report.metrics.openIncidentsCount, 1);

  // Cursor-based pagination of management activity history
  const page1 = await h.service.retrieveAuthorizedManagementHistory({
    principal: owner,
    propertyRefId: 'prop_unit_101',
    query: { limit: 3 },
  });
  assert.equal(page1.items.length, 3);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  const page2 = await h.service.retrieveAuthorizedManagementHistory({
    principal: owner,
    propertyRefId: 'prop_unit_101',
    query: { limit: 3, cursor: page1.nextCursor },
  });
  assert.ok(page2.items.length >= 1);
  assert.notEqual(page1.items[0]!.id, page2.items[0]!.id);

  // Account-deletion & data-retention hold check
  const retentionHold = await h.service.evaluateAccountDeletionAndRetentionHold({
    subjectUid: 'tenant_sara',
    propertyRefIdsToInspect: ['prop_unit_101'],
  });
  assert.equal(retentionHold.canImmediatelyPurgeOperationalReferences, false);
  assert.ok(
    retentionHold.retentionHoldReasons.includes('ACTIVE_OR_TERMINATION_PENDING_AGREEMENT_HOLD'),
  );
  assert.ok(
    retentionHold.retentionHoldReasons.includes(
      'UNSETTLED_OR_DISPUTED_FINANCIAL_OBLIGATION_HOLD',
    ),
  );

  // Persistence failure handling (503)
  const failingHarness = createTestHarness({ failAllWrites: true });
  await assert.rejects(
    () =>
      failingHarness.service.createPortfolio({
        principal: owner,
        idempotencyKey: 'idem_fail_503',
        correlationId: 'corr_fail',
        rawBody: {
          name: 'Failing Store Portfolio',
          portfolioType: 'INDIVIDUAL_LANDLORD',
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 503,
  );

  assert.ok(PROPERTY_MANAGEMENT_ROUTE_REGISTRATION_SPEC.length >= 20);
  assert.ok(h.publishedNotifications.length >= 6);
});
