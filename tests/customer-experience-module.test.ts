/**
 * Employee 64 — Comprehensive Automated Test Suite
 * (`tests/customer-experience-module.test.ts`)
 */

import assert from 'node:assert/strict';
import express from 'express';
import {
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
} from '../server/modules/core';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  StructuredAuditEvent,
} from '../server/modules/core/types';
import {
  createCustomerExperienceRouter,
  createInMemoryCustomerExperienceTxRunner,
  CustomerExperienceService,
  type CustomerCatalogPropertyItem,
  type CustomerExperienceDomainEvent,
  type PropertyCatalogLookupAdapter,
  type SavedPropertyAvailabilityState,
} from '../server/modules/customer-experience';

function createTestHarness() {
  const txRunner = createInMemoryCustomerExperienceTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];
  const domainEvents: CustomerExperienceDomainEvent[] = [];
  const dispatchedNotifications: Array<{
    recipientUid: string;
    alertId: string;
    idempotencyKey: string;
    propertyIds: string[];
  }> = [];

  const catalogProperties = new Map<
    string,
    {
      availabilityState: SavedPropertyAvailabilityState;
      accessibleToAll: boolean;
      item: CustomerCatalogPropertyItem;
    }
  >();

  const seedProperty = (
    id: string,
    overrides: Partial<CustomerCatalogPropertyItem> = {},
    availabilityState: SavedPropertyAvailabilityState = 'AVAILABLE',
    accessibleToAll = true,
  ) => {
    const item: CustomerCatalogPropertyItem = {
      id,
      title: overrides.title ?? `ملک تست ${id}`,
      cityId: overrides.cityId ?? 'tehran',
      districtNumber: overrides.districtNumber ?? 2,
      neighborhoodId: overrides.neighborhoodId ?? 1,
      neighborhoodName: overrides.neighborhoodName ?? 'سعادت‌آباد',
      propertyCategory: overrides.propertyCategory ?? 'residential',
      propertyType: overrides.propertyType ?? 'apartment',
      transactionType: overrides.transactionType ?? 'buy',
      lifecycleState: availabilityState === 'AVAILABLE' ? 'PUBLISHED' : 'ARCHIVED',
      moderationState: 'APPROVED',
      visibility: accessibleToAll ? 'PUBLIC' : 'PRIVATE',
      ownerUid: overrides.ownerUid ?? 'seller_1',
      totalPriceMillions: overrides.totalPriceMillions ?? 12000,
      pricePerSqmMillions: overrides.pricePerSqmMillions ?? 120,
      depositMillions: overrides.depositMillions ?? 0,
      monthlyRentMillions: overrides.monthlyRentMillions ?? 0,
      areaSqm: overrides.areaSqm ?? 100,
      bedrooms: overrides.bedrooms ?? 2,
      bathrooms: overrides.bathrooms ?? 1,
      floorNumber: 3,
      totalFloors: 5,
      buildingAgeYears: 4,
      amenities: ['parking', 'elevator', 'storage'],
      coordinates: { lat: 35.78, lng: 51.37 },
      featuredRank: 5,
      qualityScore: 90,
      verifiedFlag: true,
      hasPhotos: true,
      hasVideo: false,
      has3dTour: false,
      bargainDiscountPercent: 11,
      publishedAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z',
    };
    catalogProperties.set(id, { availabilityState, accessibleToAll, item });
  };

  seedProperty('prop_101', { totalPriceMillions: 11500, neighborhoodId: 1, bedrooms: 2 });
  seedProperty('prop_102', { totalPriceMillions: 14800, neighborhoodId: 2, bedrooms: 3 });
  seedProperty('prop_103', { totalPriceMillions: 9500, neighborhoodId: 1, bedrooms: 2 });
  seedProperty('prop_restricted_999', { ownerUid: 'other_owner' }, 'RESTRICTED', false);

  let shouldFailInquiriesAdapter = false;
  let hasFinancialObligations = false;

  const propertyCatalogAdapter: PropertyCatalogLookupAdapter = {
    async getPropertyById(propertyId: string, requesterUid?: string) {
      const entry = catalogProperties.get(propertyId);
      if (!entry) {
        return { exists: false, accessible: false, availabilityState: 'DELETED' };
      }
      const isOwner = Boolean(requesterUid && entry.item.ownerUid === requesterUid);
      return {
        exists: true,
        accessible: entry.accessibleToAll || isOwner,
        availabilityState: entry.availabilityState,
        item: entry.item,
      };
    },
    async executeSavedSearchFilters(filters, pagination) {
      const all = Array.from(catalogProperties.values())
        .filter((e) => e.availabilityState === 'AVAILABLE' && e.accessibleToAll)
        .map((e) => e.item)
        .filter((item) => {
          if (filters.cityId && item.cityId !== filters.cityId) return false;
          if (filters.neighborhoodIds?.length && !filters.neighborhoodIds.includes(item.neighborhoodId)) {
            return false;
          }
          if (filters.minAskingPriceMillion !== undefined && item.totalPriceMillions < filters.minAskingPriceMillion) {
            return false;
          }
          if (filters.maxAskingPriceMillion !== undefined && item.totalPriceMillions > filters.maxAskingPriceMillion) {
            return false;
          }
          return true;
        });

      const slice = all.slice(0, pagination.limit);
      return {
        items: slice,
        totalMatchedCount: all.length,
        nextCursor: null,
        hasMore: all.length > pagination.limit,
      };
    },
    async listUserOwnedListings(ownerUid: string) {
      return Array.from(catalogProperties.values())
        .filter((e) => e.item.ownerUid === ownerUid)
        .map((e) => ({
          id: e.item.id,
          title: e.item.title,
          cityId: e.item.cityId,
          hoodId: e.item.neighborhoodId,
          priceMillions: e.item.totalPriceMillions,
          lifecycleState: e.item.lifecycleState,
          updatedAtIso: e.item.updatedAt,
        }));
    },
  };

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      if (token === 'valid_bearer_token_user_a') {
        return { uid: 'user_a', email: 'user_a@example.com', email_verified: true };
      }
      if (token === 'valid_bearer_token_user_b') {
        return { uid: 'user_b', email: 'user_b@example.com', email_verified: true };
      }
      if (token === 'valid_bearer_token_admin') {
        return { uid: 'admin_1', email: 'admin@radar.ir', email_verified: true, admin: true };
      }
      throw new Error('Invalid token');
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'admin_1') {
        return { uid: 'admin_1', email: 'admin@radar.ir', role: 'admin', active: true };
      }
      return null;
    },
  };

  const idempotencyStore = createFirestoreIdempotencyStoreAdapter(txRunner);

  const service = new CustomerExperienceService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    primaryAdminEmails: ['admin@radar.ir'],
    propertyCatalogAdapter,
    crossModuleAdapter: {
      async getInquiriesAndLeadsCounts() {
        if (shouldFailInquiriesAdapter) {
          throw new Error('Simulated downstream inquiries service timeout');
        }
        return {
          submittedInquiriesCount: 3,
          receivedInquiriesCount: 1,
          activeBuyerAlertsCount: 2,
          scheduledViewingsCount: 1,
        };
      },
      async getTransactionsAndTenanciesSummary() {
        return {
          activeTransactionsCount: hasFinancialObligations ? 1 : 0,
          activeTenanciesCount: 0,
          relevantDocumentIds: hasFinancialObligations ? ['doc_contract_501'] : [],
          hasActiveFinancialOrContractualObligations: hasFinancialObligations,
        };
      },
      async getUnreadNotificationsCount() {
        return 4;
      },
      async dispatchAlertNotification(params) {
        dispatchedNotifications.push({
          recipientUid: params.recipientUid,
          alertId: params.alertId,
          idempotencyKey: params.idempotencyKey,
          propertyIds: params.matchedProperties.map((p) => p.id),
        });
        return {
          delivered: true,
          notificationId: `notif_out_${dispatchedNotifications.length}`,
        };
      },
      async generateExportArtifactDocument(params) {
        return {
          artifactDocumentId: `export_artifact_${params.requestId}`,
        };
      },
    },
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    onDomainEvent(evt) {
      domainEvents.push(evt);
    },
  });

  const userA: AuthenticatedPrincipal = {
    uid: 'user_a',
    email: 'user_a@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const userB: AuthenticatedPrincipal = {
    uid: 'user_b',
    email: 'user_b@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const adminPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_1',
    email: 'admin@radar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: { admin: true },
  };

  return {
    service,
    txRunner,
    tokenVerifier,
    adminStore,
    idempotencyStore,
    propertyCatalogAdapter,
    auditEvents,
    domainEvents,
    dispatchedNotifications,
    catalogProperties,
    seedProperty,
    setFailInquiriesAdapter: (val: boolean) => {
      shouldFailInquiriesAdapter = val;
    },
    setHasFinancialObligations: (val: boolean) => {
      hasFinancialObligations = val;
    },
    userA,
    userB,
    adminPrincipal,
  };
}

async function runTests(): Promise<void> {
  // 1 & 2. User Profile Creation, Updates, Public/Private Separation & Mass Assignment
  {
    const h = createTestHarness();
    const initial = await h.service.getOrInitOwnProfile(h.userA);
    assert.equal(initial.uid, 'user_a');
    assert.equal(initial.lifecycleStatus, 'ACTIVE');
    assert.equal(initial.revision, 1);

    const updated = await h.service.updateOwnProfile(h.userA, {
      displayName: 'علی رضایی',
      bio: 'خریدار و سرمایه‌گذار ملک در منطقه ۲ تهران',
      contactPhone: '09123456789',
      secondaryEmail: 'ali.secondary@example.com',
      primaryCityId: 'tehran',
      visibility: {
        showPublicProfile: true,
        showBioPublicly: true,
        contactDisclosureMode: 'PRIVATE',
      },
    });
    assert.equal(updated.displayName, 'علی رضایی');
    assert.equal(updated.contactPhone, '09123456789');
    assert.equal(updated.revision, 2);
    assert.equal(updated.revisionHistory.length, 2);

    const publicProfile = await h.service.getPublicProfile('user_a');
    assert.equal(publicProfile.displayName, 'علی رضایی');
    assert.equal(publicProfile.publicContactPhone, undefined);
    assert.equal('email' in (publicProfile as any), false);
    assert.equal('secondaryEmail' in (publicProfile as any), false);
    assert.equal('contactPhone' in (publicProfile as any), false);

    await h.service.updateOwnProfile(h.userA, {
      visibility: { showPublicProfile: false },
    });
    await assert.rejects(
      () => h.service.getPublicProfile('user_a'),
      (err: unknown) => err instanceof CoreApiError && err.status === 404,
    );

    await assert.rejects(
      () =>
        h.service.updateOwnProfile(h.userA, {
          displayName: 'هکر',
          lifecycleStatus: 'ACTIVE',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );
  }

  // 3. User Preferences Partial Updates & Contradictory Range Rejection
  {
    const h = createTestHarness();
    const initialPrefs = await h.service.getOwnPreferences(h.userA);
    assert.equal(initialPrefs.localization.locale, 'fa');
    assert.equal(initialPrefs.localization.areaUnit, 'sqm');

    const updatedPrefs = await h.service.updateOwnPreferences(h.userA, {
      localization: { currency: 'USD', areaUnit: 'sqft' },
      geographic: {
        preferredNeighborhoodIds: [1, 2, 5],
        preferNearMetro: true,
      },
    });
    assert.equal(updatedPrefs.localization.currency, 'USD');
    assert.equal(updatedPrefs.localization.areaUnit, 'sqft');
    assert.equal(updatedPrefs.localization.locale, 'fa');
    assert.deepEqual(updatedPrefs.geographic.preferredNeighborhoodIds, [1, 2, 5]);
    assert.equal(updatedPrefs.propertyInterests.buyBudgetRangeMillions.min, 1500);

    await assert.rejects(
      () =>
        h.service.updateOwnPreferences(h.userA, {
          propertyInterests: {
            buyBudgetRangeMillions: { min: 50000, max: 10000 },
          },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );
  }

  // 4 & 5. Saved Properties, Favorites, Named Collections, Ownership & Unavailable Handling
  {
    const h = createTestHarness();

    const saved1 = await h.service.saveOrFavoriteProperty(h.userA, {
      propertyId: 'prop_101',
      isFavorite: true,
      privateNote: 'واحد جنوبی خوش نقشه',
      customTags: ['سرمایه‌گذاری', 'پارکینگ‌دار'],
    });
    assert.equal(saved1.propertyId, 'prop_101');
    assert.equal(saved1.isFavorite, true);

    await assert.rejects(
      () => h.service.saveOrFavoriteProperty(h.userA, { propertyId: 'prop_does_not_exist' }),
      (err: unknown) => err instanceof CoreApiError && err.status === 404,
    );
    await assert.rejects(
      () => h.service.saveOrFavoriteProperty(h.userA, { propertyId: 'prop_restricted_999' }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    const col1 = await h.service.createCollection(h.userA, {
      name: 'گزینه‌های سعادت‌آباد',
      description: 'بررسی حضوری آخر هفته',
      privateNote: 'تماس با مشاور املاک',
    });
    const col2 = await h.service.createCollection(h.userA, {
      name: 'سرمایه‌گذاری متراژ بالا',
    });

    await h.service.addPropertyToCollection(h.userA, col1.id, 'prop_101');
    await assert.rejects(
      () => h.service.addPropertyToCollection(h.userA, col1.id, 'prop_101'),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    await assert.rejects(
      () => h.service.addPropertyToCollection(h.userB, col1.id, 'prop_102'),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    const reordered = await h.service.reorderCollections(h.userA, [col2.id, col1.id]);
    const idxCol2 = reordered.findIndex((c) => c.id === col2.id);
    const idxCol1 = reordered.findIndex((c) => c.id === col1.id);
    assert.ok(idxCol2 < idxCol1);

    await h.service.saveOrFavoriteProperty(h.userA, { propertyId: 'prop_102', isFavorite: true });
    h.seedProperty('prop_101', { totalPriceMillions: 11000 }, 'AVAILABLE', true);
    h.seedProperty('prop_102', { totalPriceMillions: 14800 }, 'UNPUBLISHED', false);

    const listed = await h.service.listSavedProperties(h.userA, { limit: 10 });
    assert.equal(listed.totalCount, 2);
    const hydrated101 = listed.items.find((i) => i.propertyId === 'prop_101')!;
    const hydrated102 = listed.items.find((i) => i.propertyId === 'prop_102')!;
    assert.equal(hydrated101.availabilityState, 'AVAILABLE');
    assert.equal(hydrated101.priceDeltaMillions, -500);
    assert.equal(hydrated102.availabilityState, 'UNPUBLISHED');
    assert.equal(hydrated102.liveSummary, null);

    const rem = await h.service.removeSavedProperty(h.userA, 'prop_101');
    assert.equal(rem.removed, true);
  }

  // 6, 7 & 8. Saved Searches, Legacy Compatibility, Search Alerts, Duplicate Prevention, Idempotency & Quotas
  {
    const h = createTestHarness();

    await assert.rejects(
      () =>
        h.service.createSavedSearch(h.userA, {
          title: 'جستجوی مخرب',
          filters: { rawQuery: 'SELECT * FROM properties' },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    const search = await h.service.createSavedSearch(h.userA, {
      title: 'آپارتمان سعادت‌آباد',
      filters: {
        city: 'tehran',
        hoodId: 1,
        maxTotalPriceMillions: 13000,
      },
      isPinned: true,
    });
    assert.equal(search.filters.cityId, 'tehran');
    assert.deepEqual(search.filters.neighborhoodIds, [1]);
    assert.ok(search.compatibilityNotes.length >= 2);

    const execSearch = await h.service.executeSavedSearch(h.userA, search.id, { limit: 10 });
    assert.equal(execSearch.totalMatchedCount, 2);

    const alert = await h.service.createSearchAlert(h.userA, {
      savedSearchId: search.id,
      frequency: 'DAILY',
      channels: ['IN_APP', 'EMAIL'],
    });
    assert.equal(alert.status, 'ACTIVE');

    await assert.rejects(
      () =>
        h.service.createSearchAlert(h.userA, {
          savedSearchId: search.id,
          frequency: 'INSTANT',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    const jobRun1 = await h.service.executeSearchAlertJob(alert.id, 'job_2026_11_08_run1');
    assert.equal(jobRun1.status, 'DELIVERED');
    assert.equal(jobRun1.replayed, false);
    assert.equal(h.dispatchedNotifications.length, 1);

    const jobRun1Retry = await h.service.executeSearchAlertJob(alert.id, 'job_2026_11_08_run1');
    assert.equal(jobRun1Retry.status, 'DELIVERED');
    assert.equal(jobRun1Retry.replayed, true);
    assert.equal(h.dispatchedNotifications.length, 1);

    const jobRun2 = await h.service.executeSearchAlertJob(alert.id, 'job_2026_11_08_run2');
    assert.equal(jobRun2.status, 'NO_NEW_MATCHES');
    assert.equal(h.dispatchedNotifications.length, 1);

    const paused = await h.service.updateSearchAlert(h.userA, alert.id, { status: 'PAUSED' });
    assert.equal(paused.status, 'PAUSED');
    const skippedPaused = await h.service.executeSearchAlertJob(alert.id, 'job_paused_check');
    assert.equal(skippedPaused.status, 'SKIPPED_INACTIVE');
  }

  // 9. User Activity & Recently Viewed Properties (Privacy & Telemetry Prohibitions)
  {
    const h = createTestHarness();

    await assert.rejects(
      () =>
        h.service.recordUserActivity(h.userA, {
          actionType: 'VIEWED_PROPERTY',
          targetId: 'prop_101',
          targetType: 'PROPERTY',
          summaryTitle: 'ملک ۱۰۱',
          mouseMovements: [[10, 20]],
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    await h.service.recordUserActivity(h.userA, {
      actionType: 'VIEWED_PROPERTY',
      targetId: 'prop_101',
      targetType: 'PROPERTY',
      cityId: 'tehran',
      hoodId: 1,
      summaryTitle: 'ملک ۱۰۱',
      priceMillionsSnapshot: 11500,
      sqmSnapshot: 100,
    });
    const secondView = await h.service.recordUserActivity(h.userA, {
      actionType: 'VIEWED_PROPERTY',
      targetId: 'prop_101',
      targetType: 'PROPERTY',
      cityId: 'tehran',
      hoodId: 1,
      summaryTitle: 'ملک ۱۰۱',
      priceMillionsSnapshot: 11500,
      sqmSnapshot: 100,
    });
    assert.equal(secondView.entry?.viewedCount, 2);

    const history = await h.service.listUserActivity(h.userA);
    assert.equal(history.totalCount, 1);

    const cleared = await h.service.clearActivityHistory(h.userA);
    assert.equal(cleared.clearedCount, 1);
  }

  // 10. Dashboard Aggregation & Fault Isolation
  {
    const h = createTestHarness();
    await h.service.saveOrFavoriteProperty(h.userA, { propertyId: 'prop_101', isFavorite: true });

    h.setFailInquiriesAdapter(true);
    const dashboard = await h.service.getUserDashboard(h.userA);
    assert.equal(dashboard.profileSummary.status, 'OK');
    assert.equal(dashboard.savedPropertiesSummary.status, 'OK');
    assert.equal(dashboard.savedPropertiesSummary.data?.totalSavedCount, 1);
    assert.equal(dashboard.inquiriesAndLeadsSummary.status, 'PARTIAL_UNAVAILABLE');
    assert.equal(dashboard.inquiriesAndLeadsSummary.data, null);
    assert.equal(dashboard.notificationsSummary.status, 'OK');
    assert.equal(dashboard.notificationsSummary.data?.unreadCount, 4);
  }

  // 11 & 12. Privacy Consents, Withdrawal Side-Effects, Data Rights & Legal Hold / Multi-Domain Gate
  {
    const h = createTestHarness();
    const search = await h.service.createSavedSearch(h.userA, {
      title: 'جستجوی تست رضایت',
      filters: { cityId: 'tehran' },
    });
    const alert = await h.service.createSearchAlert(h.userA, {
      savedSearchId: search.id,
      frequency: 'DAILY',
    });
    assert.equal(alert.status, 'ACTIVE');

    const withdrawn = await h.service.upsertConsent(h.userA, {
      purpose: 'PROPERTY_SEARCH_ALERTS',
      granted: false,
      policyVersion: 'v2026.2',
    });
    assert.equal(withdrawn.granted, false);
    const alertsAfterWithdrawal = await h.service.listSearchAlerts(h.userA);
    assert.equal(alertsAfterWithdrawal[0].status, 'PAUSED');

    const exportReq = await h.service.submitDataRightsRequest(h.userA, {
      requestType: 'DATA_EXPORT',
      reason: 'دریافت کپی اطلاعات کاربری',
    });
    assert.equal(exportReq.status, 'COMPLETED');
    assert.equal(exportReq.exportDocumentArtifactId, `export_artifact_${exportReq.id}`);

    h.setHasFinancialObligations(true);
    const deletionReq = await h.service.submitDataRightsRequest(h.userA, {
      requestType: 'ACCOUNT_CLOSURE_AND_DELETION',
      reason: 'بستن حساب کاربری',
    });
    assert.equal(deletionReq.status, 'SUBMITTED');
    const financeDomain = deletionReq.domainConfirmations.find(
      (d) => d.domain === 'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK',
    )!;
    assert.equal(financeDomain.disposition, 'RETAINED_BY_LAW');

    const heldReq = await h.service.adminReviewDataRightsRequest(h.adminPrincipal, deletionReq.id, {
      legalHoldActive: true,
      legalHoldReasons: ['بررسی پرونده حقوقی معامله ۵۰۱'],
    });
    assert.equal(heldReq.status, 'BLOCKED_BY_LEGAL_HOLD');

    await assert.rejects(
      () =>
        h.service.confirmDataRightsDomainCompletion(h.adminPrincipal, deletionReq.id, {
          domain: 'PROFILE_AND_PREFERENCES',
          disposition: 'ANONYMIZED',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    await h.service.adminReviewDataRightsRequest(h.adminPrincipal, deletionReq.id, {
      legalHoldActive: false,
      decision: 'APPROVE_FOR_ORCHESTRATION',
    });

    const domainsToConfirm = [
      'PROFILE_AND_PREFERENCES',
      'SAVED_PROPERTIES_AND_SEARCHES',
      'ACTIVITY_AND_UGC',
      'LISTINGS_AND_MEDIA',
      'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK',
      'LEGAL_HOLD_AND_AUDIT_CHECK',
    ] as const;

    for (let i = 0; i < domainsToConfirm.length; i++) {
      const d = domainsToConfirm[i];
      const res = await h.service.confirmDataRightsDomainCompletion(h.adminPrincipal, deletionReq.id, {
        domain: d,
        disposition: d === 'TRANSACTIONS_AND_FINANCE_RETENTION_CHECK' ? 'RETAINED_BY_LAW' : 'PURGED',
      });
      if (i < domainsToConfirm.length - 1) {
        assert.equal(res.status, 'ORCHESTRATING_DOMAINS');
      } else {
        assert.equal(res.status, 'COMPLETED');
      }
    }

    const closedProfile = await h.service.getOrInitOwnProfile(h.userA);
    assert.equal(closedProfile.lifecycleStatus, 'CLOSED');
  }

  // 13, 14 & 17. Account Lifecycle, UGC Reviews, Abuse Reporting & Admin Moderation
  {
    const h = createTestHarness();

    await assert.rejects(
      () =>
        h.service.createUgcReview(h.userA, {
          targetType: 'PROPERTY_LISTING',
          targetId: 'prop_restricted_999',
          cityId: 'tehran',
          hoodId: 1,
          overallRating: 4,
          comment: 'این ملک خصوصی است',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    const review = await h.service.createUgcReview(h.userA, {
      targetType: 'PROPERTY_LISTING',
      targetId: 'prop_101',
      cityId: 'tehran',
      hoodId: 1,
      overallRating: 4.5,
      comment: 'ساختمان بسیار تمیز و دسترسی عالی به بزرگراه یادگار امام دارد.',
      prosTags: ['دسترسی عالی', 'نورگیر'],
      consTags: ['ترافیک عصرگاهی'],
    });
    assert.equal(review.visibility, 'PUBLISHED');
    assert.equal(review.revision, 1);

    const edited = await h.service.updateOwnUgcReview(h.userA, review.id, {
      overallRating: 5,
      comment: 'ساختمان بسیار تمیز، مشاعات عالی و قیمت منطقی نسبت به محله.',
    });
    assert.equal(edited.revision, 2);
    assert.equal(edited.editHistory.length, 1);

    await assert.rejects(
      () => h.service.updateOwnUgcReview(h.userB, review.id, { comment: 'تغییر غیرمجاز' }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    await h.service.reportUgcAbuse(h.userB, review.id, {
      reason: 'SPAM',
      details: 'گزارش تست',
    });
    const moderated = await h.service.adminModerateUgc(h.adminPrincipal, review.id, {
      moderationStatus: 'REJECTED',
      visibility: 'HIDDEN_BY_MODERATOR',
      moderationNote: 'محتوای تبلیغاتی تایید نشد',
    });
    assert.equal(moderated.visibility, 'HIDDEN_BY_MODERATOR');

    const publicList = await h.service.listPublishedUgcForTarget('PROPERTY_LISTING', 'prop_101');
    assert.equal(publicList.totalCount, 0);

    await h.service.adminSetAccountLifecycleStatus(h.adminPrincipal, 'user_b', {
      lifecycleStatus: 'RESTRICTED',
      reason: 'ارسال دیدگاه‌های اسپم مکرر',
    });
    await assert.rejects(
      () =>
        h.service.createUgcReview(h.userB, {
          targetType: 'PROPERTY_LISTING',
          targetId: 'prop_101',
          cityId: 'tehran',
          hoodId: 1,
          overallRating: 3,
          comment: 'تلاش برای ثبت نظر در حالت محدودیت',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    assert.ok(h.auditEvents.some((e) => e.action === 'admin.ugc.moderated'));
    assert.ok(h.auditEvents.some((e) => e.action === 'admin.account_lifecycle.update'));
  }

  // 18 & 19. Express HTTP API Router & Idempotency-Key Replay Integration
  {
    const h = createTestHarness();
    const app = express();
    app.use(express.json());
    const { router } = createCustomerExperienceRouter(
      {
        tokenVerifier: h.tokenVerifier,
        adminStore: h.adminStore,
        txRunner: h.txRunner,
        idempotencyStore: h.idempotencyStore,
        primaryAdminEmails: ['admin@radar.ir'],
        propertyCatalogAdapter: h.propertyCatalogAdapter,
        auditSink: {
          async writeAuditEvent(e) {
            h.auditEvents.push(e);
          },
        },
      },
      h.service,
    );
    app.use('/api/v1/cx', router);

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/v1/cx`;

    try {
      const unauthRes = await fetch(`${baseUrl}/profile/me`);
      assert.equal(unauthRes.status, 401);

      const patch1 = await fetch(`${baseUrl}/profile/me`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid_bearer_token_user_a',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_profile_patch_1',
        },
        body: JSON.stringify({ displayName: 'مریم کاظمی' }),
      });
      assert.equal(patch1.status, 200);
      const body1 = (await patch1.json()) as any;
      assert.equal(body1.ok, true);
      assert.equal(body1.data.displayName, 'مریم کاظمی');
      assert.equal(body1.meta.idempotentReplay, false);

      const patch1Replay = await fetch(`${baseUrl}/profile/me`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid_bearer_token_user_a',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_profile_patch_1',
        },
        body: JSON.stringify({ displayName: 'مریم کاظمی' }),
      });
      assert.equal(patch1Replay.status, 200);
      const bodyReplay = (await patch1Replay.json()) as any;
      assert.equal(bodyReplay.meta.idempotentReplay, true);
      assert.equal(bodyReplay.data.revision, body1.data.revision);

      const forbiddenAdmin = await fetch(`${baseUrl}/admin/accounts/user_b/lifecycle`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_bearer_token_user_a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lifecycleStatus: 'SUSPENDED', reason: 'تلاش غیرمجاز' }),
      });
      assert.equal(forbiddenAdmin.status, 403);

      const dashRes = await fetch(`${baseUrl}/dashboard`, {
        headers: { Authorization: 'Bearer valid_bearer_token_user_a' },
      });
      assert.equal(dashRes.status, 200);
      const dashJson = (await dashRes.json()) as any;
      assert.equal(dashJson.ok, true);
      assert.equal(dashJson.data.profileSummary.status, 'OK');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runTests().catch((err) => {
  console.error('Customer Experience Module Tests Failed:', err);
  process.exit(1);
});
