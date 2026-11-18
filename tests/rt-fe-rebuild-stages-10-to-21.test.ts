/**
 * @file tests/rt-fe-rebuild-stages-10-to-21.test.ts
 * @description Comprehensive Automated Verification Suite for Tehran Radar Frontend Rebuild
 * Stages 10 through 21 (and Stage 22 `status: 'designed'` governance check).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RT_FE_REBUILD_STAGE_10_SPEC_ID,
  buildScopedMessagingCacheKey,
  transitionMessageDeliveryState,
  deduplicateRealtimeMessage,
  transitionAttachmentUploadState,
} from '../src/platform/messaging';
import {
  RT_FE_REBUILD_STAGE_11_SPEC_ID,
  EIGHT_IDENTITY_CONCEPTS,
  stripPrivateFieldsForPublicProfile,
  resolveTrustBadgeDisplay,
  evaluateOrganizationActionPermission,
} from '../src/platform/identity';
import {
  RT_FE_REBUILD_STAGE_12_SPEC_ID,
  normalizeListingMoney,
  validateListingPriceIntegrity,
  validateListingLocationIntegrity,
  createPropertyFact,
  transitionListingPublicationState,
  evaluateAbuseReportSubmission,
} from '../src/platform/listing-integrity';
import {
  RT_FE_REBUILD_STAGE_13_SPEC_ID,
  assertNoClientSuppliedIdentityOrRole,
  validateSafeNavigationTarget,
  sanitizeUntrustedClientContent,
  validateSafeFilePreview,
  redactSensitiveDiagnosticsPayload,
  purgePrivateClientStorageOnSessionChange,
} from '../src/platform/security';
import {
  RT_FE_REBUILD_STAGE_14_SPEC_ID,
  TEN_FAILURE_ISOLATION_DOMAINS,
  ServiceCircuitBreaker,
  RequestSequenceController,
  createRecoverySnapshot,
  validateRecoverySnapshot,
  reconcileThreeLayerState,
} from '../src/platform/resilience';
import {
  RT_FE_REBUILD_STAGE_15_SPEC_ID,
  validateRuntimeApiEnvelope,
  assertNoSilentEmptyFallback,
  adaptApiContractVersion,
  normalizeApiMoneyAndDates,
} from '../src/platform/api-contracts';
import {
  RT_FE_REBUILD_STAGE_16_SPEC_ID,
  NINE_REFERENCE_VIEWPORTS,
  validateTouchTargetDimensions,
  evaluateContrastRatioCompliance,
  resolveCollapsibleDrawerA11yProps,
  formatBidiIsolatedLtrValue,
} from '../src/platform/accessibility';
import {
  AUTHORITATIVE_FINANCIAL_STATES,
  reconcileFinancialTrustBoundary,
  computeThreeWayFinancialSeparation,
} from '../src/platform/financial-trust';
import {
  SEVEN_ACCOUNT_EXPORT_DOMAIN_SOURCES,
  buildUserDataPortabilityExport,
} from '../src/utils/identityLifecycleAndBackendGovernance';
import {
  SUPPORTED_FIVE_CITY_IDS,
  resolveCanonicalCityContext,
  validateCityNeighborhoodPair,
  reconcileCityContextSwitch,
  buildCityScopedQueryKey,
} from '../src/platform/geo-context';
import {
  RT_FE_REBUILD_STAGE_21_SPEC_ID,
  MASTER_FRONTEND_ROADMAP_REGISTRY,
  validateRoadmapRegistryIntegrity,
  canTransitionStageToAccepted,
} from '../src/platform/roadmap-governance';

describe('Tehran Radar Frontend Rebuild — Stages 10 to 21 (+ Stage 22 Governance)', () => {
  it('Stage 10 (RT-FE-REBUILD-MESSAGING-010): enforces authenticated cache keys, clientMessageId deduplication, delivery vs read states & safe attachments', () => {
    assert.equal(RT_FE_REBUILD_STAGE_10_SPEC_ID, 'RT-FE-REBUILD-MESSAGING-010');
    assert.throws(() => buildScopedMessagingCacheKey({ userId: 'local-user' }), /AUTHENTICATED_USER_ID/);
    const key = buildScopedMessagingCacheKey({ userId: 'uid-42', workspaceId: 'org-9', conversationId: 'c-1' });
    assert.equal(key, 'rt:messaging:uid-42:ws:org-9:conv:c-1');

    const sent = transitionMessageDeliveryState('pending', 'SERVER_ACK_SENT');
    const delivered = transitionMessageDeliveryState(sent, 'RECIPIENT_DELIVERED');
    const read = transitionMessageDeliveryState(delivered, 'RECIPIENT_READ');
    assert.equal(sent, 'sent');
    assert.equal(delivered, 'delivered');
    assert.equal(read, 'read');

    const dedup = deduplicateRealtimeMessage(
      [
        {
          messageId: 'm-1',
          clientMessageId: 'cm-100',
          conversationId: 'c-1',
          senderAuthoritativeUid: 'uid-42',
          body: 'سلام',
          deliveryStatus: 'sent',
          createdAtIso: '2026-11-17T10:00:00Z',
        },
      ],
      {
        messageId: 'm-server-1',
        clientMessageId: 'cm-100',
        conversationId: 'c-1',
        senderAuthoritativeUid: 'uid-42',
        body: 'سلام',
        deliveryStatus: 'delivered',
        createdAtIso: '2026-11-17T10:00:01Z',
      },
    );
    assert.equal(dedup.wasDuplicate, true);
    assert.equal(dedup.messages.length, 1);
    assert.equal(dedup.messages[0].deliveryStatus, 'delivered');
    assert.equal(
      transitionAttachmentUploadState({ currentState: 'SELECTED', mimeType: 'image/svg+xml', byteSize: 500 }),
      'FAILED',
    );
  });

  it('Stage 11 (RT-FE-REBUILD-PROFILE-IDENTITY-011): strips private PII fields from public profiles, enforces authority-backed trust badges & isolates organizations', () => {
    assert.equal(RT_FE_REBUILD_STAGE_11_SPEC_ID, 'RT-FE-REBUILD-PROFILE-IDENTITY-011');
    assert.equal(EIGHT_IDENTITY_CONCEPTS.length, 8);

    const stripped = stripPrivateFieldsForPublicProfile({
      displayName: 'مهندس رضایی',
      phone: '09121112233',
      nationalId: '0011223344',
      identityDocumentUrl: 'https://private/doc.png',
    });
    assert.equal('phone' in stripped.publicPayload, false);
    assert.equal('nationalId' in stripped.publicPayload, false);
    assert.equal(stripped.strippedPrivateKeys.length, 3);

    const unbackedBadge = resolveTrustBadgeDisplay({
      verificationStatus: 'VERIFIED',
      issuedByAuthorityId: null,
    });
    assert.equal(unbackedBadge.showVerifiedBadge, false);

    const crossOrg = evaluateOrganizationActionPermission({
      membershipState: 'ACTIVE',
      organizationId: 'org-A',
      activeWorkspaceOrganizationId: 'org-B',
      grantedPermissions: ['listing.publish'],
      requiredPermission: 'listing.publish',
    });
    assert.equal(crossOrg.allowed, false);
    assert.equal(crossOrg.reasonCode, 'CROSS_ORGANIZATION_ISOLATION_BLOCKED');
  });

  it('Stage 12 (RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012): enforces IRR/IRT conversion, blocks discount price fabrication, rejects [0,0] coordinates & requires server confirmation for publish', () => {
    assert.equal(RT_FE_REBUILD_STAGE_12_SPEC_ID, 'RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012');
    const money = normalizeListingMoney({ amount: 150_000_000_000, unit: 'IRR', isEstimated: true });
    assert.equal(money.amountToman, 15_000_000_000);
    assert.match(money.labelFa, /برآورد مدل/);

    const fabricated = validateListingPriceIntegrity({
      declaredTotalToman: 10_000_000_000,
      fabricatedFromDiscountPercent: true,
      substitutedFromNeighborhoodAverage: true,
      isMarkedEstimated: false,
    });
    assert.equal(fabricated.valid, false);
    assert.equal(fabricated.issues.length, 2);

    const zeroLoc = validateListingLocationIntegrity({
      cityId: 'tehran',
      neighborhoodId: 1,
      latitude: 0,
      longitude: 0,
      precision: 'exact',
    });
    assert.equal(zeroLoc.valid, false);
    assert.ok(zeroLoc.issues.includes('ZERO_NULL_ISLAND_COORDINATES_REJECTED'));

    const unknownFact = createPropertyFact<number>(undefined, 'unknown', 'user-input');
    assert.equal(unknownFact.value, null);
    assert.equal(unknownFact.quality, 'unknown');

    const unconfirmedPublish = transitionListingPublicationState({
      currentState: 'under_review',
      intent: 'SERVER_PUBLISH',
      idempotencyKey: 'idem-12345678',
      serverConfirmedListingId: null,
    });
    assert.equal(unconfirmedPublish.allowed, false);
    assert.equal(unconfirmedPublish.nextState, 'under_review');

    const abuse = evaluateAbuseReportSubmission({
      listingId: 'lst-1',
      reasonCode: 'FAKE_PRICE',
      idempotencyKey: 'idem-abuse-01',
      serverReportId: 'srv-rep-99',
    });
    assert.equal(abuse.state, 'REPORTED');
    assert.equal(abuse.persistedOnServer, true);
  });

  it('Stage 13 (RT-FE-REBUILD-CLIENT-SECURITY-013): strips client-supplied uid/role, blocks javascript:/external redirects, blocks SVG inline execution & redacts tokens', () => {
    assert.equal(RT_FE_REBUILD_STAGE_13_SPEC_ID, 'RT-FE-REBUILD-CLIENT-SECURITY-013');
    const reqCheck = assertNoClientSuppliedIdentityOrRole({
      body: { title: 'آگهی', authorUid: 'spoof-uid', role: 'admin', authoritativeVerified: true },
      headers: { 'x-test-uid': '123', 'content-type': 'application/json' },
    });
    assert.equal(reqCheck.safe, false);
    assert.deepEqual([...reqCheck.strippedBodyKeys].sort(), ['authorUid', 'authoritativeVerified', 'role']);
    assert.deepEqual(reqCheck.rejectedHeaders, ['x-test-uid']);

    assert.equal(validateSafeNavigationTarget('javascript:alert(1)').allowed, false);
    assert.equal(validateSafeNavigationTarget('//evil.example.com').allowed, false);
    assert.equal(validateSafeNavigationTarget('https://evil.example.com').allowed, false);
    assert.equal(validateSafeNavigationTarget('/market?city=karaj').allowed, true);

    assert.equal(
      validateSafeFilePreview({ fileName: 'xss.svg', mimeType: 'image/svg+xml', byteSize: 1024 }).safeForInlinePreview,
      false,
    );
    assert.equal(
      validateSafeFilePreview({ fileName: 'photo.webp', mimeType: 'image/webp', byteSize: 40_000 }).safeForInlinePreview,
      true,
    );

    const sanitized = sanitizeUntrustedClientContent('<script>alert(1)</script><b onclick="evil()">سلام</b>');
    assert.ok(!sanitized.includes('<script>'));

    const redacted = redactSensitiveDiagnosticsPayload({
      authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
      phone: '09120000000',
      city: 'tehran',
    });
    assert.equal(redacted.authorization, '[REDACTED]');
    assert.equal(redacted.phone, '[REDACTED]');
    assert.equal(redacted.city, 'tehran');

    const storagePurge = purgePrivateClientStorageOnSessionChange([
      'radar_theme_preference',
      'radar_comms_workspace_v1',
      'account_draft_v1',
    ]);
    assert.deepEqual(storagePurge.retainedPublicKeys, ['radar_theme_preference']);
    assert.equal(storagePurge.purgedKeys.length, 2);
  });

  it('Stage 14 (RT-FE-REBUILD-FRONTEND-RESILIENCE-014): isolates 10 domains, trips circuit breaker per service, rejects stale sequence/context responses & preserves local draft on failure', () => {
    assert.equal(RT_FE_REBUILD_STAGE_14_SPEC_ID, 'RT-FE-REBUILD-FRONTEND-RESILIENCE-014');
    assert.equal(TEN_FAILURE_ISOLATION_DOMAINS.length, 10);

    const cb = new ServiceCircuitBreaker('valuation-api', 2, 5000);
    assert.equal(cb.getState(1000), 'CLOSED');
    cb.recordFailure(1000);
    cb.recordFailure(1100);
    assert.equal(cb.getState(1200), 'OPEN');
    assert.equal(cb.canExecute(1200), false);
    assert.equal(cb.getState(6500), 'HALF_OPEN');
    cb.recordSuccess();
    assert.equal(cb.getState(6600), 'CLOSED');

    const seq = new RequestSequenceController();
    const r1 = seq.issueRequest('city:tehran');
    const r2 = seq.issueRequest('city:karaj');
    assert.equal(seq.shouldAcceptResponse(r1.requestId, 'city:tehran').accepted, false);
    assert.equal(seq.shouldAcceptResponse(r2.requestId, 'city:karaj').accepted, true);

    const snap = createRecoverySnapshot({ version: 2, ownerKey: 'uid-1:tehran', data: { step: 3 }, nowMs: 1000, ttlMs: 5000 });
    assert.equal(validateRecoverySnapshot(snap, 2, 'uid-1:tehran', 2000).valid, true);
    assert.equal(validateRecoverySnapshot(snap, 2, 'uid-2:tehran', 2000).reasonCode, 'OWNER_MISMATCH');

    const reconciled = reconcileThreeLayerState({
      serverState: { price: 100 },
      localDraftState: { price: 120 },
      optimisticState: { price: 120 },
      operationStatus: 'failed',
    });
    assert.deepEqual(reconciled.authoritativeDisplayState, { price: 100 });
    assert.equal(reconciled.preserveLocalDraftForRetry, true);
  });

  it('Stage 15 & Stage 16: rejects HTTP-200 error envelopes without silent [] coercion, and enforces 9 reference viewports, 24/44px touch targets & inert collapsed drawers', () => {
    assert.equal(RT_FE_REBUILD_STAGE_15_SPEC_ID, 'RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015');
    const fake200Error = validateRuntimeApiEnvelope(
      200,
      { ok: false, error: { code: 'BACKEND_DB_TIMEOUT' }, traceId: 'tr-99' },
      (d): d is readonly string[] => Array.isArray(d),
    );
    assert.equal(fake200Error.ok, false);
    const noSilentEmpty = assertNoSilentEmptyFallback(fake200Error);
    assert.equal(noSilentEmpty.state, 'CONTRACT_ERROR');
    assert.equal(noSilentEmpty.errorCode, 'BACKEND_DB_TIMEOUT');

    assert.equal(adaptApiContractVersion({ serverVersion: 'v2.1', supportedMajorVersion: 1 }).status, 'INCOMPATIBLE_VERSION');
    assert.equal(
      normalizeApiMoneyAndDates({ amount: 250_000_000, currency: 'IRR', isoDateString: '2026-11-17T12:00:00Z' }).amountToman,
      25_000_000,
    );

    assert.equal(RT_FE_REBUILD_STAGE_16_SPEC_ID, 'RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016');
    assert.equal(NINE_REFERENCE_VIEWPORTS.length, 9);
    assert.equal(validateTouchTargetDimensions({ widthPx: 20, heightPx: 20 }).compliant, false);
    assert.equal(validateTouchTargetDimensions({ widthPx: 44, heightPx: 44, isPrimaryMobileControl: true }).compliant, true);
    assert.equal(evaluateContrastRatioCompliance({ contrastRatio: 2.42 }).passesAA, false);
    assert.equal(resolveCollapsibleDrawerA11yProps({ isMobileViewport: true, mobileSheetOpen: false, desktopCollapsed: false }).inert, true);
    assert.equal(formatBidiIsolatedLtrValue('۱۲۰ m²').dir, 'ltr');
  });

  it('Stages 17, 19, 20, 21 & 22: enforces Financial Trust Boundary, 7-Source Account Export, 5-City Geo Context Isolation, and Master Roadmap Registry Integrity', () => {
    assert.equal(AUTHORITATIVE_FINANCIAL_STATES.length, 10);
    const unknownFin = reconcileFinancialTrustBoundary({
      executionMode: 'REAL',
      gatewayAvailable: true,
      networkTimedOut: true,
    });
    assert.equal(unknownFin.state, 'UNKNOWN');
    assert.equal(unknownFin.allowed, false);
    assert.equal(unknownFin.receiptIssued, false);
    assert.equal(unknownFin.invoiceBalanceDeducted, false);

    const sep = computeThreeWayFinancialSeparation({
      confirmedPaymentsToman: 5_000_000,
      refundPendingToman: 0,
      refundConfirmedToman: 1_000_000,
      platformFeeToman: 500_000,
      providerSettledToman: 3_500_000,
    });
    assert.equal(sep.providerUnsettledBalanceToman, 0);
    assert.equal(sep.isSettlementDistinctFromPayment, true);

    assert.equal(SEVEN_ACCOUNT_EXPORT_DOMAIN_SOURCES.length, 7);
    const exp = buildUserDataPortabilityExport({
      ownerUid: 'u-1',
      profile: { email: 'u1@example.com', role: 'user' },
      favoriteNeighborhoodKeys: [],
      savedAlerts: [],
      publishedListings: [],
      calculationSnapshots: [],
      sponsorRecords: [],
      crowdClaims: [],
    });
    assert.equal(exp.completenessStatus, 'COMPLETE');
    assert.equal(exp.domainSourcesIncluded.length, 7);
    assert.equal(exp.sources.length, 7);

    assert.equal(SUPPORTED_FIVE_CITY_IDS.length, 5);
    assert.equal(resolveCanonicalCityContext('invalid-city').valid, false);
    assert.equal(validateCityNeighborhoodPair('tehran', 101).valid, false);
    const switched = reconcileCityContextSwitch({
      previousCityId: 'tehran',
      nextCityRaw: 'karaj',
      selectedNeighborhoodId: 1,
      selectedZone: 'منطقه ۱',
      compareNeighborhoodIds: [1, 101],
    });
    assert.equal(switched.resetPerformed, true);
    assert.equal(switched.selectedNeighborhoodId, null);
    assert.deepEqual(switched.compareNeighborhoodIds, [101]);
    assert.equal(buildCityScopedQueryKey('karaj', 'market', 'pulse'), 'rt:city:karaj:market:pulse');

    assert.equal(RT_FE_REBUILD_STAGE_21_SPEC_ID, 'RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021');
    const regCheck = validateRoadmapRegistryIntegrity(MASTER_FRONTEND_ROADMAP_REGISTRY);
    assert.equal(regCheck.valid, true);
    assert.equal(regCheck.collisionResolvedForStage21, true);

    for (const designedStageId of [
      'RT-FE-REBUILD-PAYMENTS-BILLING-PRODUCTION-022',
      'RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023',
      'RT-FE-REBUILD-DATA-COMMERCE-PORTAL-024',
      'RT-FE-REBUILD-VALUATION-AUTHORITY-025',
      'RT-FE-REBUILD-TELEMETRY-CONSENT-DELIVERY-026',
    ]) {
      const entry = MASTER_FRONTEND_ROADMAP_REGISTRY.find((e) => e.stageId === designedStageId);
      assert.ok(entry, `Missing designed stage ${designedStageId}`);
      assert.equal(entry.status, 'designed');
      assert.equal(canTransitionStageToAccepted(entry).allowed, false);
    }
  });
});
