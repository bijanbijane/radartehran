/** @file src/features/admin/tests/adminGovernance.test.ts — Stage 23 Admin Governance, RBAC & Audit Unit Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAdminAuditLog,
  assertAdminGovernancePermission,
  canAdminPerformAction,
  computeAdminQueueCounts,
  loadAdminAuditLogs,
  moderateUserPropertyListing,
  resolveServiceComplaint,
  validateSensitiveActionConfirmation,
} from '../services/adminGovernanceService';
import { saveMyListings } from '../../properties/services/listingService';
import { submitServiceComplaint } from '../../services/services/serviceWorkflowService';
import type { PropertyListingRecord } from '../../properties/types/listing.types';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  };
  return store;
}

test('Stage 23 RBAC strictly separates read-only auditor from mutating roles and blocks unverified admins', () => {
  setupMemoryWindow();

  assert.equal(canAdminPerformAction('security_auditor', 'admin:view_audit_security'), true);
  assert.equal(canAdminPerformAction('security_auditor', 'admin:moderate_content'), false);
  assert.equal(canAdminPerformAction('security_auditor', 'admin:run_dangerous_ops'), false);
  assert.equal(canAdminPerformAction('content_moderator', 'admin:moderate_content'), true);
  assert.equal(canAdminPerformAction('content_moderator', 'admin:edit_market_data'), false);

  const unauth = assertAdminGovernancePermission({
    isVerifiedAdmin: false,
    role: 'super_admin',
    permission: 'admin:run_dangerous_ops',
  });
  assert.equal(unauth.allowed, false);

  const roleMismatch = assertAdminGovernancePermission({
    isVerifiedAdmin: true,
    role: 'data_analyst',
    permission: 'admin:run_dangerous_ops',
  });
  assert.equal(roleMismatch.allowed, false);
});

test('Stage 23 enforces two-step confirmation with reason and scrubs secret patterns from audit logs', () => {
  setupMemoryWindow();

  assert.equal(
    validateSensitiveActionConfirmation({
      isVerifiedAdmin: true,
      role: 'super_admin',
      reasonFa: 'short',
      typedConfirm: 'CONFIRM',
      expectedPhrase: 'CONFIRM',
    }).ok,
    false,
  );

  assert.equal(
    validateSensitiveActionConfirmation({
      isVerifiedAdmin: true,
      role: 'super_admin',
      reasonFa: 'پاکسازی گزارش‌های قدیمی بررسی‌شده در پایان دوره',
      typedConfirm: 'WRONG',
      expectedPhrase: 'CONFIRM',
    }).ok,
    false,
  );

  assert.equal(
    validateSensitiveActionConfirmation({
      isVerifiedAdmin: true,
      role: 'super_admin',
      reasonFa: 'پاکسازی گزارش‌های قدیمی بررسی‌شده در پایان دوره',
      typedConfirm: 'CONFIRM',
      expectedPhrase: 'CONFIRM',
    }).ok,
    true,
  );

  appendAdminAuditLog({
    actorRole: 'super_admin',
    actorLabelFa: 'مدیر ارشد',
    actionCode: 'TEST_OP',
    targetType: 'security_op',
    targetId: 'op-1',
    reasonFa: 'بررسی token=abc123secret و phone=09120001122',
    severity: 'critical',
  });
  const logs = loadAdminAuditLogs();
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].reasonFa.includes('abc123secret'));
  assert.ok(!logs[0].reasonFa.includes('09120001122'));
  assert.ok(logs[0].reasonFa.includes('[REDACTED]'));
});

test('Stage 23 moderates property listings and resolves service complaints with audit trails', () => {
  setupMemoryWindow();

  const mockListing: PropertyListingRecord = {
    property: {
      propertyId: 'p1',
      propertyType: 'apartment',
      cityId: 'tehran',
      hoodId: 1,
      hoodName: 'پونک',
      zoneName: 'منطقه ۵',
      street: 'سردار جنگل',
      lat: 35.76,
      lng: 51.33,
      locationPrecision: 'approximate',
      privacyRadiusMeters: 250,
      areaSqm: 90,
      buildYearJalali: 1400,
      roomsCount: 2,
      floorNumber: 3,
      totalFloors: 5,
      orientation: 'south',
      documentType: 'single_deed',
      unitFeatures: { parking: 'has', elevator: 'has', storage: 'has', balcony: 'has' },
      buildingFeatures: { unitsPerFloor: 2, totalUnits: 10, hasLobby: 'has', renovationStatus: 'renovated' },
      media: [],
    },
    listing: {
      listingId: 'lst-mod-1',
      propertyId: 'p1',
      version: 1,
      title: 'آپارتمان ۹۰ متری پونک',
      description: 'واحد نورگیر',
      transactionType: 'sale',
      status: 'pending_review',
      price: { priceType: 'fixed', saleTotalMillion: 12000, pricePerSqmMillion: 133.3, depositMillion: null, monthlyRentMillion: null, convertibleRent: false },
      publisher: { id: 'u1', displayName: 'رضا', role: 'owner', contactAuthorized: true },
      verification: { identity: 'partial', location: 'partial', priceReasonableness: 'verified', freshness: 'verified' },
      sourceKind: 'user_submitted',
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      marketContext: { hoodBaseBuyPerSqm: 130, hoodRahn80mMillion: 1400, estimatedDealV64PerSqm: 122, gapPercentFromV64: 9, neighborhoodOverallScore: 8, metroScore: 7, airScore: 7 },
    },
  };
  saveMyListings([mockListing]);

  const complaint = submitServiceComplaint({
    providerId: 'sp-1',
    complainantUid: 'u2',
    reason: 'fee_dispute',
    details: 'اختلاف در هزینه کارشناسی حضوری',
  });

  const beforeCounts = computeAdminQueueCounts({ sponsorRequestsCount: 2, liveBargainsCount: 5 });
  assert.equal(beforeCounts.pendingUserListings, 1);
  assert.equal(beforeCounts.openComplaints, 1);

  const modRes = moderateUserPropertyListing({
    listingId: 'lst-mod-1',
    nextStatus: 'published',
    moderatorNoteFa: 'مشخصات و قیمت در محدوده متعارف تایید شد',
    role: 'content_moderator',
    isVerifiedAdmin: true,
  });
  assert.equal(modRes.ok, true);
  assert.equal(modRes.listings[0].listing.status, 'published');

  const compRes = resolveServiceComplaint({
    complaintId: complaint.complaintId,
    nextStatus: 'resolved',
    resolutionNoteFa: 'با توافق طرفین و بازگشت هزینه حل‌وفصل شد',
    role: 'service_verifier',
    isVerifiedAdmin: true,
  });
  assert.equal(compRes.ok, true);
  assert.equal(compRes.complaints[0].status, 'resolved');
  assert.ok(loadAdminAuditLogs().length >= 2);
});
